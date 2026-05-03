import { describe, expect, it, vi } from 'vitest'
import type { TimestripVisibleTile } from './timestripLayout'
import {
  drawTimeAxisLane,
  formatTimestripTickLabel,
  selectTimeAxisTicks,
} from './TimeAxisLane'
import { buildTimestripLaneLayout } from './timestripLaneLayout'
import { DEFAULT_TIMESTRIP_THEME } from './timestripTheme'

const buildContext = (labelWidth: number) =>
  ({
    beginPath: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    font: '',
    measureText: vi.fn(() => ({ width: labelWidth })),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    lineWidth: 1,
    strokeStyle: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  }) as unknown as CanvasRenderingContext2D

const buildTile = (worldWidthUs: number): TimestripVisibleTile => ({
  key: 'z1000:0:0',
  tileX: 0,
  tileY: 0,
  zoomLevel: 'z1000',
  zoomLevelDenominator: 1000,
  worldLeftUs: 0,
  worldWidthUs,
  widthPx: 512,
  heightPx: 240,
  bleedPx: 0,
})

const buildZoomedTile = (tileX: number, zoomDenominator: number): TimestripVisibleTile => {
  const worldWidthUs = 512 * zoomDenominator
  return {
    ...buildTile(worldWidthUs),
    key: `z${zoomDenominator}:${tileX}:0`,
    tileX,
    zoomLevel: `z${zoomDenominator}`,
    zoomLevelDenominator: zoomDenominator,
    worldLeftUs: tileX * worldWidthUs,
  }
}

describe('TimeAxisLane', () => {
  it('formats wall-clock labels with clock time', () => {
    expect(formatTimestripTickLabel(new Date(1_700_000_000_123))).toMatch(/\d\d:\d\d:\d\d\.123/)
  })

  it('selects ticks with enough label spacing', () => {
    const context = buildContext(70)
    const ticks = selectTimeAxisTicks(
      context,
      buildTile(60_000_000),
      buildTimestripLaneLayout(240),
      1_700_000_000_000_000,
    )

    expect(ticks.length).toBeGreaterThan(1)
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index].xPx - ticks[index - 1].xPx).toBeGreaterThanOrEqual(94)
    }
  })

  it('draws tick labels inside the tile rectangle', () => {
    const context = buildContext(70)

    drawTimeAxisLane(
      context,
      buildTile(512_000),
      buildTimestripLaneLayout(240),
      1_700_000_000_000_000,
      DEFAULT_TIMESTRIP_THEME,
    )

    expect(context.fillText).toHaveBeenCalled()
  })

  it('selects ticks whose labels intersect the left tile edge', () => {
    const context = buildContext(70)
    const tile = {
      ...buildTile(512_000),
      worldLeftUs: 512_020,
    }

    const ticks = selectTimeAxisTicks(
      context,
      tile,
      buildTimestripLaneLayout(240),
      1_700_000_000_000_000,
    )

    expect(ticks.some((tick) => tick.xPx < 0 && tick.xPx + 35 >= 0)).toBe(true)
  })

  it('selects ticks whose labels intersect the right tile edge', () => {
    const context = buildContext(70)
    const tile = {
      ...buildTile(512_000),
      worldLeftUs: 487_980,
    }

    const ticks = selectTimeAxisTicks(
      context,
      tile,
      buildTimestripLaneLayout(240),
      1_700_000_000_000_000,
    )

    expect(ticks.some((tick) => tick.xPx > tile.widthPx && tick.xPx - 35 <= tile.widthPx)).toBe(true)
  })

  it('keeps tick cadence uniform across adjacent tiles', () => {
    const context = buildContext(70)
    const layout = buildTimestripLaneLayout(240)
    const zoomDenominator = 23_000
    const worldStartWallClockUs = 1_700_000_000_000_000
    const tile0 = buildZoomedTile(0, zoomDenominator)
    const tile1 = buildZoomedTile(1, zoomDenominator)
    const tickWallClockUs = new Set(
      [tile0, tile1].flatMap((tile) =>
        selectTimeAxisTicks(context, tile, layout, worldStartWallClockUs)
          .map((tick) => tick.date.getTime() * 1000)
          .filter((wallClockUs) =>
            wallClockUs >= worldStartWallClockUs &&
            wallClockUs <= worldStartWallClockUs + tile0.worldWidthUs + tile1.worldWidthUs,
          ),
      ),
    )
    const sortedTicks = Array.from(tickWallClockUs).sort((left, right) => left - right)

    expect(sortedTicks.length).toBeGreaterThan(2)
    for (let index = 1; index < sortedTicks.length; index += 1) {
      expect(sortedTicks[index] - sortedTicks[index - 1]).toBe(5_000)
    }
  })

  it('positions submillisecond ticks at exact pixel intervals at high zoom', () => {
    const context = buildContext(70)
    const tile = buildZoomedTile(1, 5_000)

    const ticks = selectTimeAxisTicks(
      context,
      tile,
      buildTimestripLaneLayout(240),
      1_700_000_000_000_000,
    )
    const visibleTicks = ticks.filter((tick) => tick.xPx >= 0 && tick.xPx <= tile.widthPx)

    expect(visibleTicks.length).toBeGreaterThan(2)
    for (let index = 1; index < visibleTicks.length; index += 1) {
      expect(visibleTicks[index].xPx - visibleTicks[index - 1].xPx).toBeCloseTo(100, 6)
    }
  })
})
