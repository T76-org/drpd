import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  calculateTimestripDomTimelineWidthPx,
  calculateTimestripScrollScale,
  clampTimestripZoomDenominator,
  domScrollLeftToLogicalTimestripScrollLeft,
  formatTimestripZoomDenominator,
  getNextTimestripZoomDenominator,
  logicalScrollLeftToDomTimestripScrollLeft,
  readStoredTimestripZoomDenominator,
  TIMESTRIP_ZOOM_DENOMINATOR_STORAGE_KEY,
  writeStoredTimestripZoomDenominator,
} from './timestripZoom'

describe('timestripZoom', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clamps zoom denominators to the supported range', () => {
    expect(clampTimestripZoomDenominator(0)).toBe(500)
    expect(clampTimestripZoomDenominator(400.8)).toBe(500)
    expect(clampTimestripZoomDenominator(1000)).toBe(1000)
    expect(clampTimestripZoomDenominator(100_000_001)).toBe(100_000_000)
    expect(clampTimestripZoomDenominator('not-a-number')).toBe(100_000_000)
  })

  it('formats zoom denominators as time per pixel', () => {
    expect(formatTimestripZoomDenominator(500)).toBe('500ns')
    expect(formatTimestripZoomDenominator(1500)).toBe('1.5µs')
    expect(formatTimestripZoomDenominator(1_000_000)).toBe('1ms')
    expect(formatTimestripZoomDenominator(100_000_000)).toBe('100ms')
  })

  it('uses one fixed zoom ladder in both directions', () => {
    const fromMax: number[] = []
    for (let value = 100_000_000; value > 500;) {
      value = getNextTimestripZoomDenominator(value, 'in')
      fromMax.push(value)
    }

    const fromMin: number[] = []
    for (let value = 500; value < 100_000_000;) {
      value = getNextTimestripZoomDenominator(value, 'out')
      fromMin.push(value)
    }

    expect(fromMax).toEqual([
      50_000_000,
      20_000_000,
      10_000_000,
      5_000_000,
      2_000_000,
      1_000_000,
      500_000,
      200_000,
      100_000,
      50_000,
      20_000,
      10_000,
      5_000,
      2_000,
      1_000,
      500,
    ])
    expect(fromMin).toEqual([...fromMax].reverse().slice(1).concat(100_000_000))
  })

  it('caps DOM timeline width and maps scroll through logical scale', () => {
    const domTimelineWidth = calculateTimestripDomTimelineWidthPx(32_000_000, 1000)
    const scrollScale = calculateTimestripScrollScale(32_000_000, domTimelineWidth, 1000)

    expect(domTimelineWidth).toBe(16_000_000)
    expect(domScrollLeftToLogicalTimestripScrollLeft(4_000_000, scrollScale)).toBeCloseTo(8_000_250.015641602)
    expect(logicalScrollLeftToDomTimestripScrollLeft(8_000_250.015641602, scrollScale)).toBeCloseTo(4_000_000)
  })

  it('reads and writes stored zoom denominator', () => {
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => items.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        items.set(key, value)
      }),
    })

    expect(readStoredTimestripZoomDenominator()).toBe(100_000_000)
    writeStoredTimestripZoomDenominator(1000)
    expect(items.get(TIMESTRIP_ZOOM_DENOMINATOR_STORAGE_KEY)).toBe('1000')
    expect(readStoredTimestripZoomDenominator()).toBe(1000)
  })
})
