import { describe, expect, it } from 'vitest'
import type { TimestripAnalogSample } from './timestripAnalogModel'
import { filterTimestripAnalogSamplesForTile } from './timestripAnalogModel'
import type { TimestripDigitalEntry } from './timestripDigitalModel'
import { filterTimestripDigitalEntriesForTile } from './timestripDigitalModel'
import { TimestripTileDataIndex } from './timestripTileDataIndex'

describe('TimestripTileDataIndex', () => {
  it('matches existing digital tile filtering', () => {
    const entries: TimestripDigitalEntry[] = [
      { kind: 'event', worldNs: 4, eventType: 'mark' },
      {
        kind: 'message',
        selectionKey: 'message:10:20:1',
        startWorldNs: 10,
        endWorldNs: 20,
        label: 'Source_Capabilities',
        pulseWidthsNs: [],
        frameBytes: [],
        components: [],
      },
      {
        kind: 'message',
        selectionKey: 'message:30:40:2',
        startWorldNs: 30,
        endWorldNs: 40,
        label: 'Request',
        pulseWidthsNs: [],
        frameBytes: [],
        components: [],
      },
    ]
    const index = new TimestripTileDataIndex(entries, [])

    expect(index.getDigitalEntriesForTile(15, 30)).toEqual(
      filterTimestripDigitalEntriesForTile(entries, 15, 30),
    )
  })

  it('matches existing analog tile filtering with previous and next samples', () => {
    const samples: TimestripAnalogSample[] = [
      { worldNs: 5, voltageV: 5, currentA: 0.1 },
      { worldNs: 10, voltageV: 6, currentA: 0.2 },
      { worldNs: 20, voltageV: 7, currentA: 0.3 },
      { worldNs: 30, voltageV: 8, currentA: 0.4 },
    ]
    const index = new TimestripTileDataIndex([], samples)

    expect(index.getAnalogSamplesForTile(12, 22)).toEqual(
      filterTimestripAnalogSamplesForTile(samples, 12, 22),
    )
  })
})
