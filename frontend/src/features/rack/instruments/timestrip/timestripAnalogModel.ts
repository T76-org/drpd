import type { LoggedAnalogSample } from '../../../../lib/device'

export interface TimestripAnalogSample {
  worldNs: number
  voltageV: number
  currentA: number
  breakBefore?: boolean
}

export interface TimestripAnalogHoverValue {
  worldNs: number
  voltageV: number
  currentA: number
}

export const TIMESTRIP_ANALOG_VOLTAGE_MAX_V = 60
export const TIMESTRIP_ANALOG_CURRENT_MAX_A = 6

export const interpolateTimestripAnalogSample = (
  samples: TimestripAnalogSample[],
  worldNs: number,
): TimestripAnalogHoverValue | null => {
  if (samples.length === 0 || !Number.isFinite(worldNs)) {
    return null
  }
  const first = samples[0]
  const last = samples.at(-1)!
  if (worldNs < first.worldNs || worldNs > last.worldNs) {
    return null
  }
  let high = samples.findIndex((sample) => sample.worldNs >= worldNs)
  if (high < 0) {
    high = samples.length - 1
  }
  const highSample = samples[high]
  const lowSample = samples[Math.max(0, high - 1)]
  if (high > 0 && highSample.breakBefore && worldNs > lowSample.worldNs && worldNs < highSample.worldNs) {
    return null
  }
  if (!lowSample || lowSample.worldNs === highSample.worldNs) {
    return {
      worldNs,
      voltageV: highSample.voltageV,
      currentA: highSample.currentA,
    }
  }
  const ratio = (worldNs - lowSample.worldNs) / (highSample.worldNs - lowSample.worldNs)
  return {
    worldNs,
    voltageV: lowSample.voltageV + (highSample.voltageV - lowSample.voltageV) * ratio,
    currentA: lowSample.currentA + (highSample.currentA - lowSample.currentA) * ratio,
  }
}

export const normalizeAnalogSampleForTimestrip = (
  row: LoggedAnalogSample,
  worldStartTimestampUs: bigint,
  worldStartWallClockUs?: bigint,
): TimestripAnalogSample | null => {
  const worldNs =
    worldStartWallClockUs != null && row.wallClockUs != null
      ? Number((row.wallClockUs - worldStartWallClockUs) * 1000n)
      : Number((row.timestampUs - worldStartTimestampUs) * 1000n)
  if (!Number.isFinite(worldNs) || !Number.isFinite(row.vbusV) || !Number.isFinite(row.ibusA)) {
    return null
  }
  return {
    worldNs: worldNs,
    voltageV: row.vbusV,
    currentA: row.ibusA,
  }
}
