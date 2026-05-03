import { describe, expect, it } from 'vitest'
import { buildTimestripAnalogLegendTicks } from './timestripAnalogLegend'

describe('timestripAnalogLegend', () => {
  it('builds d3 ticks for the fixed voltage and current ranges', () => {
    const ticks = buildTimestripAnalogLegendTicks(240)

    expect(ticks.voltage.map((tick) => tick.value)).toEqual([0, 20, 40, 60])
    expect(ticks.voltage.map((tick) => tick.label)).toEqual(['0V', '20V', '40V', '60V'])
    expect(ticks.current.map((tick) => tick.value)).toEqual([0, 2, 4, 6])
    expect(ticks.current.map((tick) => tick.label)).toEqual(['0A', '2A', '4A', '6A'])
  })

  it('maps larger values toward the top of the analog lane', () => {
    const ticks = buildTimestripAnalogLegendTicks(240)

    expect(ticks.voltage[0].y).toBeGreaterThan(ticks.voltage.at(-1)!.y)
    expect(ticks.current[0].y).toBeGreaterThan(ticks.current.at(-1)!.y)
    expect(ticks.voltage.map((tick) => tick.y)).toEqual(ticks.current.map((tick) => tick.y))
  })
})
