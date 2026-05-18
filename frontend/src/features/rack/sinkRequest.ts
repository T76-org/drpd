import { SinkPdoType, type SinkPdo } from '../../lib/device'

type NonNullSinkPdo = Exclude<SinkPdo, null>
type EprAvsSinkRequestPdo = SinkPdo & {
  type: typeof SinkPdoType.EPR_AVS
  maxPowerW: number
}
type EprAvsCurrentLimitPdo = {
  maxPowerW: number
  maxVoltageV: number
}

export interface SinkRequestArgs {
  voltageMv?: number
  currentMa?: number
  error?: string
}

export const parseSinkRequestField = (value: string): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const computeEprAvsMaxCurrentMa = (
  pdo: EprAvsCurrentLimitPdo,
  requestedVoltageMv: number,
): number => {
  if (requestedVoltageMv <= 0) {
    return 0
  }
  const maxPowerMilliwatts = Math.round(pdo.maxPowerW * 1000)
  const maxVoltageMv = Math.round(pdo.maxVoltageV * 1000)
  if (maxVoltageMv <= 0) {
    return 0
  }
  const powerLimitedCurrentMa = Math.floor((maxPowerMilliwatts * 1000) / requestedVoltageMv)
  const advertisedCurrentMa = Math.floor((maxPowerMilliwatts * 1000) / maxVoltageMv)
  return Math.min(powerLimitedCurrentMa, advertisedCurrentMa)
}

const isEprAvsSinkPdo = (pdo: NonNullSinkPdo): pdo is EprAvsSinkRequestPdo => (
  pdo.type === SinkPdoType.EPR_AVS
)

/**
 * Validate sink request input and compute SCPI argument values.
 *
 * EPR AVS requests mirror the firmware clamp with the advertised current limit:
 * omitted/zero current requests the maximum, and excessive current is clamped.
 */
export const buildSinkRequestArgs = ({
  pdo,
  voltageV,
  currentA,
}: {
  pdo: NonNullSinkPdo
  voltageV: string
  currentA: string
}): SinkRequestArgs => {
  if (!pdo) {
    return { error: 'Select a PDO before requesting power.' }
  }
  if (pdo.type === SinkPdoType.FIXED) {
    const parsedCurrent = parseSinkRequestField(currentA)
    if (parsedCurrent == null) {
      return { error: 'Enter a valid current.' }
    }
    if (parsedCurrent < 0 || parsedCurrent > pdo.maxCurrentA) {
      return { error: `Current must be between 0 and ${pdo.maxCurrentA.toFixed(2)} A.` }
    }
    return {
      voltageMv: Math.round(pdo.voltageV * 1000),
      currentMa: Math.round(parsedCurrent * 1000),
    }
  }

  if (
    pdo.type === SinkPdoType.VARIABLE ||
    pdo.type === SinkPdoType.AUGMENTED ||
    pdo.type === SinkPdoType.SPR_PPS
  ) {
    const parsedVoltage = parseSinkRequestField(voltageV)
    const parsedCurrent = parseSinkRequestField(currentA)
    if (parsedVoltage == null || parsedCurrent == null) {
      return { error: 'Enter valid voltage and current values.' }
    }
    if (parsedVoltage < pdo.minVoltageV || parsedVoltage > pdo.maxVoltageV) {
      return {
        error: `Voltage must be between ${pdo.minVoltageV.toFixed(2)} and ${pdo.maxVoltageV.toFixed(2)} V.`,
      }
    }
    if (parsedCurrent < 0 || parsedCurrent > pdo.maxCurrentA) {
      return { error: `Current must be between 0 and ${pdo.maxCurrentA.toFixed(2)} A.` }
    }
    return {
      voltageMv: Math.round(parsedVoltage * 1000),
      currentMa: Math.round(parsedCurrent * 1000),
    }
  }

  if (pdo.type === SinkPdoType.BATTERY || pdo.type === SinkPdoType.SPR_AVS) {
    const parsedVoltage = parseSinkRequestField(voltageV)
    const parsedCurrent = parseSinkRequestField(currentA)
    if (parsedVoltage == null || parsedCurrent == null) {
      return { error: 'Enter valid voltage and current values.' }
    }
    if (parsedVoltage < pdo.minVoltageV || parsedVoltage > pdo.maxVoltageV) {
      return {
        error: `Voltage must be between ${pdo.minVoltageV.toFixed(2)} and ${pdo.maxVoltageV.toFixed(2)} V.`,
      }
    }
    const maxCurrentA = pdo.maxPowerW / parsedVoltage
    if (parsedCurrent < 0 || parsedCurrent > maxCurrentA) {
      return {
        error: `Current must be between 0.00 and ${maxCurrentA.toFixed(2)} A.`,
      }
    }
    return {
      voltageMv: Math.round(parsedVoltage * 1000),
      currentMa: Math.round(parsedCurrent * 1000),
    }
  }

  if (isEprAvsSinkPdo(pdo)) {
    const parsedVoltage = parseSinkRequestField(voltageV)
    if (parsedVoltage == null) {
      return { error: 'Enter valid voltage and current values.' }
    }
    if (parsedVoltage < pdo.minVoltageV || parsedVoltage > pdo.maxVoltageV) {
      return {
        error: `Voltage must be between ${pdo.minVoltageV.toFixed(2)} and ${pdo.maxVoltageV.toFixed(2)} V.`,
      }
    }

    const voltageMv = Math.round(parsedVoltage * 1000)
    const maxCurrentMa = computeEprAvsMaxCurrentMa(pdo, voltageMv)
    if (maxCurrentMa <= 0) {
      return { error: 'EPR AVS selected voltage has no available current.' }
    }

    const parsedCurrent = parseSinkRequestField(currentA)
    const requestedCurrentMa =
      parsedCurrent == null || parsedCurrent <= 0
        ? maxCurrentMa
        : Math.round(parsedCurrent * 1000)

    return {
      voltageMv,
      currentMa: Math.min(requestedCurrentMa, maxCurrentMa),
    }
  }

  return { error: 'Unsupported PDO type.' }
}
