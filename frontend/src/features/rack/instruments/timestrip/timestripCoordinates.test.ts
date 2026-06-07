import {
  basisTimestampUsToWorldNs,
  calculatePointerStableZoom,
  calculateTimestripQueryRange,
  scrollLeftPxToWorldNs,
  worldNsToPx,
  type TimestripBasis,
} from './timestripCoordinates'

describe('timestripCoordinates', () => {
  const deviceBasis: TimestripBasis = {
    kind: 'device',
    originTimestampUs: 1_000_000n,
    originWallClockUs: 1_700_000_000_000_000,
  }
  const wallClockBasis: TimestripBasis = {
    kind: 'wallClock',
    originTimestampUs: 8_000_000n,
    originWallClockUs: 1_700_000_000_000_000,
  }

  it('converts basis timestamps into world nanoseconds', () => {
    expect(basisTimestampUsToWorldNs(1_000_250n, deviceBasis)).toBe(250_000)
    expect(basisTimestampUsToWorldNs(1_700_000_000_010_000n, wallClockBasis)).toBe(10_000_000)
  })

  it('builds device-time query ranges from viewport and overscan', () => {
    expect(calculateTimestripQueryRange(100, 300, 10_000, deviceBasis, 50)).toEqual({
      startTimestampUs: 1_000_500n,
      endTimestampUs: 1_004_500n,
      timeBasis: 'device',
    })
  })

  it('builds wall-clock query ranges from viewport and overscan', () => {
    expect(calculateTimestripQueryRange(0, 500, 100_000_000, wallClockBasis, 512)).toEqual({
      startTimestampUs: 1_700_000_000_000_000n,
      endTimestampUs: 1_700_000_101_200_000n,
      timeBasis: 'wallClock',
    })
  })

  it('clamps overscan before the origin', () => {
    expect(calculateTimestripQueryRange(10, 10, 1_000, deviceBasis, 50)).toEqual({
      startTimestampUs: 1_000_000n,
      endTimestampUs: 1_000_070n,
      timeBasis: 'device',
    })
  })

  it('keeps large timeline scroll math separate from DOM scroll scaling', () => {
    expect(scrollLeftPxToWorldNs(15_999_500, 500)).toBe(7_999_750_000)
    expect(worldNsToPx(7_999_750_000, 500)).toBe(15_999_500)
  })

  it('keeps timestamp under pointer stable when zooming', () => {
    expect(calculatePointerStableZoom({
      currentScrollLeftPx: 5000,
      pointerX: 150,
      currentZoomDenominator: 100_000_000,
      nextZoomDenominator: 50_000_000,
    })).toBe(10150)
  })
})
