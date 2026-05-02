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
})
