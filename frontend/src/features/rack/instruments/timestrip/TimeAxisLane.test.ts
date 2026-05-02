import { describe, expect, it, vi } from 'vitest'
import type { TimestripVisibleTile } from './timestripLayout'
import {
  drawTimeAxisViewportOverlay,
  formatTimestripTickLabel,
  selectTimeAxisTicks,
} from './TimeAxisLane'
import { buildTimestripLaneLayout } from './timestripLaneLayout'
import { DEFAULT_TIMESTRIP_THEME } from './timestripTheme'

const buildContext = (labelWidth: number) =>
  ({
    beginPath: vi.fn(),
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
  bleedPx: 160,
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

  it('draws tick labels as a viewport overlay', () => {
    const context = buildContext(70)

    drawTimeAxisViewportOverlay(
      context,
      512,
      1000,
      0,
      buildTimestripLaneLayout(240),
      1_700_000_000_000_000,
      DEFAULT_TIMESTRIP_THEME,
    )

    expect(context.fillText).toHaveBeenCalled()
  })
})
