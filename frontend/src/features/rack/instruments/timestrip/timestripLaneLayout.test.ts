import { describe, expect, it } from 'vitest'
import { buildTimestripLaneLayout } from './timestripLaneLayout'

describe('timestripLaneLayout', () => {
  it('uses fixed time-axis metrics in CSS pixels', () => {
    const layout = buildTimestripLaneLayout(240)

    expect(layout.timeAxis.height).toBe(32)
    expect(layout.timeAxis.labelFontPx).toBe(11)
    expect(layout.timeAxis.tickHeightPx).toBe(10)
    expect(layout.separatorHeightPx).toBe(1)
  })

  it('allocates remaining height to digital and analog lanes', () => {
    const layout = buildTimestripLaneLayout(240)

    expect(layout.digital.y).toBe(33)
    expect(layout.analog.y).toBeGreaterThan(layout.digital.y)
    expect(layout.analog.y + layout.analog.height).toBe(240)
  })
})
