import { describe, expect, it } from 'vitest'
import {
  calculateTimestripWidthPx,
  clampTimestripZoomDenominator,
  formatTimestripZoomDenominator,
  scrollLeftToWorldNs,
} from './timestripLayout'

describe('timestripLayout', () => {
  it('clamps zoom denominators to the supported range', () => {
    expect(clampTimestripZoomDenominator(0)).toBe(500)
    expect(clampTimestripZoomDenominator(1)).toBe(500)
    expect(clampTimestripZoomDenominator(400.8)).toBe(500)
    expect(clampTimestripZoomDenominator(500)).toBe(500)
    expect(clampTimestripZoomDenominator(1000)).toBe(1000)
    expect(clampTimestripZoomDenominator(1001)).toBe(1001)
    expect(clampTimestripZoomDenominator(400_000_001)).toBe(400_000_000)
    expect(clampTimestripZoomDenominator('not-a-number')).toBe(400_000_000)
  })

  it('formats zoom denominators as time per pixel', () => {
    expect(formatTimestripZoomDenominator(1)).toBe('500ns')
    expect(formatTimestripZoomDenominator(500)).toBe('500ns')
    expect(formatTimestripZoomDenominator(1000)).toBe('1µs')
    expect(formatTimestripZoomDenominator(1500)).toBe('1.5µs')
    expect(formatTimestripZoomDenominator(909_091)).toBe('909.091µs')
    expect(formatTimestripZoomDenominator(1_000_000)).toBe('1ms')
    expect(formatTimestripZoomDenominator(100_000_000)).toBe('100ms')
    expect(formatTimestripZoomDenominator(400_000_000)).toBe('400ms')
  })

  it('uses ceil(durationNs / zoomDenominator) for timeline width', () => {
    expect(calculateTimestripWidthPx(10_000_000_000n, 1_000_000, 0)).toBe(10_000)
    expect(calculateTimestripWidthPx(10_000_001n, 1000, 0)).toBe(10_001)
    expect(calculateTimestripWidthPx(10_000_000n, 500, 0)).toBe(20_000)
  })

  it('never returns a width smaller than the viewport', () => {
    expect(calculateTimestripWidthPx(10_000n, 1000, 800)).toBe(800)
    expect(calculateTimestripWidthPx(-1n, 1000, 320)).toBe(320)
  })

  it('converts scrollLeft into world nanoseconds', () => {
    expect(scrollLeftToWorldNs(25, 1000)).toBe(25_000)
  })
})
