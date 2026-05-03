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

  it('keeps the digital lane fixed and allocates extra height to analog', () => {
    const layout = buildTimestripLaneLayout(240)
    const tallerLayout = buildTimestripLaneLayout(320)

    expect(layout.digital.y).toBe(33)
    expect(layout.digital.height).toBe(86)
    expect(tallerLayout.digital.y).toBe(layout.digital.y)
    expect(tallerLayout.digital.height).toBe(layout.digital.height)
    expect(tallerLayout.analog.y).toBe(layout.analog.y)
    expect(tallerLayout.analog.height - layout.analog.height).toBe(80)
    expect(layout.analog.y).toBeGreaterThan(layout.digital.y)
    expect(layout.analog.y + layout.analog.height).toBe(240)
  })
})
