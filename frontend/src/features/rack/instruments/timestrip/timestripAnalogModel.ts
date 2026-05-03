import type { LoggedAnalogSample } from '../../../../lib/device'

export interface TimestripAnalogSample {
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
