import { describe, expect, it } from 'vitest'
import {
  filterTimestripAnalogSamplesForViewport,
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

  it('normalizes negative current samples to magnitude for display', () => {
    expect(normalizeAnalogSampleForTimestrip(
      {
        timestampUs: 2000n,
        displayTimestampUs: null,
        wallClockUs: null,
        vbusV: 12,
        ibusA: -1.5,
        role: null,
        createdAtMs: 1,
      },
      1000n,
    )).toEqual({
      worldNs: 1_000_000,
      voltageV: 12,
      currentA: 1.5,
    })
  })

  it('keeps only viewport analog samples plus one adjacent sample on each side', () => {
    const samples = [
      { worldNs: 0, voltageV: 5, currentA: 0.1 },
      { worldNs: 10, voltageV: 10, currentA: 0.2 },
      { worldNs: 20, voltageV: 15, currentA: 0.3 },
      { worldNs: 30, voltageV: 20, currentA: 0.4 },
      { worldNs: 40, voltageV: 25, currentA: 0.5 },
    ]

    expect(filterTimestripAnalogSamplesForViewport(samples, 12, 22)).toEqual([
      samples[1],
      samples[2],
      samples[3],
    ])
  })

  it('keeps adjacent analog samples when no sample lands inside the viewport', () => {
    const samples = [
      { worldNs: 0, voltageV: 5, currentA: 0.1 },
      { worldNs: 100, voltageV: 10, currentA: 0.2 },
    ]

    expect(filterTimestripAnalogSamplesForViewport(samples, 25, 75)).toEqual(samples)
  })

  it('breaks analog segments that cross unavailable regions', () => {
    const samples = [
      { worldNs: 0, voltageV: 5, currentA: 0.1 },
      { worldNs: 100, voltageV: 10, currentA: 0.2 },
    ]

    expect(filterTimestripAnalogSamplesForViewport(samples, 0, 100, [50])).toEqual([
      samples[0],
      { ...samples[1], breakBefore: true },
    ])
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
