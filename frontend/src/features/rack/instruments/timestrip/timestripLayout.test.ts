import { describe, expect, it } from 'vitest'
import {
  calculateTimestripWidthPx,
  clampTimestripZoomDenominator,
} from './timestripLayout'

describe('timestripLayout', () => {
  it('clamps zoom denominators to the supported range', () => {
    expect(clampTimestripZoomDenominator(0)).toBe(1)
    expect(clampTimestripZoomDenominator(1)).toBe(1)
    expect(clampTimestripZoomDenominator(400.8)).toBe(400)
    expect(clampTimestripZoomDenominator(1000)).toBe(1000)
    expect(clampTimestripZoomDenominator(1001)).toBe(1000)
    expect(clampTimestripZoomDenominator('not-a-number')).toBe(1000)
  })

  it('uses ceil(durationUs / zoomDenominator) for timeline width', () => {
    expect(calculateTimestripWidthPx(10_000_000n, 1000, 0)).toBe(10_000)
    expect(calculateTimestripWidthPx(10_000_001n, 1000, 0)).toBe(10_001)
    expect(calculateTimestripWidthPx(10_000_000n, 1, 0)).toBe(10_000_000)
  })

  it('never returns a width smaller than the viewport', () => {
    expect(calculateTimestripWidthPx(10_000n, 1000, 800)).toBe(800)
    expect(calculateTimestripWidthPx(-1n, 1000, 320)).toBe(320)
  })
})
