import { describe, expect, it } from 'vitest'
import {
  buildTimestripTileKey,
  calculateVisibleTimestripTiles,
  calculateTimestripWidthPx,
  clampTimestripZoomDenominator,
  resolveTimestripZoomLevel,
  scrollLeftToWorldUs,
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

  it('uses exact zoom denominators as tile render levels', () => {
    expect(resolveTimestripZoomLevel(1)).toEqual({ zoomLevel: 'z1', denominator: 1 })
    expect(resolveTimestripZoomLevel(3)).toEqual({ zoomLevel: 'z3', denominator: 3 })
    expect(resolveTimestripZoomLevel(909)).toEqual({ zoomLevel: 'z909', denominator: 909 })
    expect(resolveTimestripZoomLevel(1001)).toEqual({ zoomLevel: 'z1000', denominator: 1000 })
  })

  it('builds tile keys from LOD and tile coordinates', () => {
    expect(buildTimestripTileKey('z512', 17, 0)).toBe('z512:17:0')
  })

  it('calculates visible tiles with horizontal overscan', () => {
    const tiles = calculateVisibleTimestripTiles(0, 1000, 900, 240)

    expect(tiles.map((tile) => tile.key)).toEqual(['z1000:0:0', 'z1000:1:0', 'z1000:2:0'])
    expect(tiles[0]).toMatchObject({
      heightPx: 240,
      widthPx: 512,
      worldLeftUs: 0,
      worldWidthUs: 512_000,
    })
  })

  it('converts scrollLeft into world microseconds', () => {
    expect(scrollLeftToWorldUs(25, 1000)).toBe(25_000)
  })

  it('uses exact zoom for tile world width so composited width is one tile', () => {
    const [tile] = calculateVisibleTimestripTiles(0, 909, 200, 240, 0)

    expect(tile.key).toBe('z909:0:0')
    expect(tile.worldWidthUs).toBe(512 * 909)
    expect(tile.worldWidthUs / 909).toBe(512)
  })
})
