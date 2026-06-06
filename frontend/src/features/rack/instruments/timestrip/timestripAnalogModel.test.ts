import { describe, expect, it } from 'vitest'
import {
  interpolateTimestripAnalogSample,
  normalizeAnalogSampleForTimestrip,
} from './timestripAnalogModel'

describe('timestripAnalogModel', () => {
  it('normalizes analog samples onto the timeline time basis', () => {
    expect(normalizeAnalogSampleForTimestrip(
      {
        timestampUs: 2000n,
        displayTimestampUs: null,
        wallClockUs: 10_000n,
        vbusV: 12,
        ibusA: 1.5,
        role: null,
        createdAtMs: 1,
      },
      1000n,
      9000n,
    )).toEqual({
      worldNs: 1_000_000,
      voltageV: 12,
      currentA: 1.5,
    })
  })

  it('interpolates voltage and current at a timeline point', () => {
    expect(interpolateTimestripAnalogSample([
      { worldNs: 0, voltageV: 5, currentA: 0.5 },
      { worldNs: 100, voltageV: 15, currentA: 1.5 },
    ], 25)).toEqual({
      worldNs: 25,
      voltageV: 7.5,
      currentA: 0.75,
    })
  })

  it('does not interpolate across capture gaps', () => {
    expect(interpolateTimestripAnalogSample([
      { worldNs: 0, voltageV: 5, currentA: 0.5 },
      { worldNs: 100, voltageV: 15, currentA: 1.5, breakBefore: true },
    ], 25)).toBeNull()
  })

  it('does not extrapolate hover values outside loaded samples', () => {
    expect(interpolateTimestripAnalogSample([
      { worldNs: 10, voltageV: 5, currentA: 0.5 },
      { worldNs: 100, voltageV: 15, currentA: 1.5 },
    ], 9)).toBeNull()
  })
})
