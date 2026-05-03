import type { LoggedAnalogSample } from '../../../../lib/device'

export interface TimestripAnalogSample {
  worldUs: number
  voltageV: number
  currentA: number
}

export interface TimestripAnalogHoverValue {
  worldUs: number
  voltageV: number
  currentA: number
}

export const TIMESTRIP_ANALOG_VOLTAGE_MAX_V = 60
export const TIMESTRIP_ANALOG_CURRENT_MAX_A = 6

export const filterTimestripAnalogSamplesForTile = (
  samples: TimestripAnalogSample[],
  tileLeftUs: number,
  tileRightUs: number,
): TimestripAnalogSample[] => {
  const visibleSamples: TimestripAnalogSample[] = []
  let previousSample: TimestripAnalogSample | null = null
  let nextSample: TimestripAnalogSample | null = null
  for (const sample of samples) {
    if (sample.worldUs < tileLeftUs) {
      previousSample = sample
      continue
    }
    if (sample.worldUs > tileRightUs) {
      nextSample = sample
      break
    }
    visibleSamples.push(sample)
  }
  return [
    ...(previousSample ? [previousSample] : []),
    ...visibleSamples,
    ...(nextSample ? [nextSample] : []),
  ]
}

export const interpolateTimestripAnalogSample = (
  samples: TimestripAnalogSample[],
  worldUs: number,
): TimestripAnalogHoverValue | null => {
  if (samples.length === 0 || !Number.isFinite(worldUs)) {
    return null
  }
  const first = samples[0]
  const last = samples.at(-1)!
  if (worldUs < first.worldUs || worldUs > last.worldUs) {
    return null
  }
  let high = samples.findIndex((sample) => sample.worldUs >= worldUs)
  if (high < 0) {
    high = samples.length - 1
  }
  const highSample = samples[high]
  const lowSample = samples[Math.max(0, high - 1)]
  if (!lowSample || lowSample.worldUs === highSample.worldUs) {
    return {
      worldUs,
      voltageV: highSample.voltageV,
      currentA: highSample.currentA,
    }
  }
  const ratio = (worldUs - lowSample.worldUs) / (highSample.worldUs - lowSample.worldUs)
  return {
    worldUs,
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
    worldUs: worldNs,
    voltageV: row.vbusV,
    currentA: row.ibusA,
  }
}
