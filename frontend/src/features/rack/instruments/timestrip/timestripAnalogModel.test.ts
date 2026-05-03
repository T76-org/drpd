import { describe, expect, it } from 'vitest'
import {
  filterTimestripAnalogSamplesForTile,
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
      worldUs: 1_000_000,
      voltageV: 12,
      currentA: 1.5,
    })
  })

  it('keeps adjacent samples outside the tile so boundary-crossing lines stay connected', () => {
    const samples = [
      { worldUs: 0, voltageV: 5, currentA: 0.1 },
      { worldUs: 10, voltageV: 10, currentA: 0.2 },
      { worldUs: 20, voltageV: 15, currentA: 0.3 },
      { worldUs: 30, voltageV: 20, currentA: 0.4 },
    ]

    expect(filterTimestripAnalogSamplesForTile(samples, 12, 22)).toEqual([
      samples[1],
      samples[2],
      samples[3],
    ])
  })
})
