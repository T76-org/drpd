import { describe, expect, it, vi } from 'vitest'
import {
  drawTimeAxisLane,
  formatTimestripTickLabel,
  selectTimeAxisTicks,
  type TimestripTimeAxisViewport,
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

const buildViewport = (worldWidthNs: number): TimestripTimeAxisViewport => ({
  worldLeftNs: 0,
  worldWidthNs,
  widthPx: 512,
})

const buildZoomedViewport = (viewportX: number, zoomDenominator: number): TimestripTimeAxisViewport => {
  const worldWidthNs = 512 * zoomDenominator
  return {
    ...buildViewport(worldWidthNs),
    worldLeftNs: viewportX * worldWidthNs,
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
      buildViewport(60_000_000),
      buildTimestripLaneLayout(240),
      1_700_000_000_000_000,
    )

    expect(ticks.length).toBeGreaterThan(1)
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index].xPx - ticks[index - 1].xPx).toBeGreaterThanOrEqual(94)
    }
  })

  it('draws tick labels inside the viewport rectangle', () => {
    const context = buildContext(70)

    drawTimeAxisLane(
      context,
      buildViewport(512_000),
      buildTimestripLaneLayout(240),
      1_700_000_000_000_000,
      DEFAULT_TIMESTRIP_THEME,
    )

    expect(context.fillText).toHaveBeenCalled()
  })

  it('selects ticks whose labels intersect the left viewport edge', () => {
    const context = buildContext(70)
    const viewport = {
      ...buildViewport(512_000),
      worldLeftNs: 512_020,
    }

    const ticks = selectTimeAxisTicks(
      context,
      viewport,
      buildTimestripLaneLayout(240),
      1_700_000_000_000_000,
    )

    expect(ticks.some((tick) => tick.xPx < 0 && tick.xPx + 35 >= 0)).toBe(true)
  })

  it('selects ticks whose labels intersect the right viewport edge', () => {
    const context = buildContext(70)
    const viewport = {
      ...buildViewport(512_000),
      worldLeftNs: 487_980,
    }

    const ticks = selectTimeAxisTicks(
      context,
      viewport,
      buildTimestripLaneLayout(240),
      1_700_000_000_000_000,
    )

    expect(ticks.some((tick) => tick.xPx > viewport.widthPx && tick.xPx - 35 <= viewport.widthPx)).toBe(true)
  })

  it('keeps tick cadence uniform across adjacent viewports', () => {
    const context = buildContext(70)
    const layout = buildTimestripLaneLayout(240)
    const zoomDenominator = 23_000
    const worldStartWallClockUs = 1_700_000_000_000_000
    const viewport0 = buildZoomedViewport(0, zoomDenominator)
    const viewport1 = buildZoomedViewport(1, zoomDenominator)
    const tickWallClockUs = new Set(
      [viewport0, viewport1].flatMap((viewport) =>
        selectTimeAxisTicks(context, viewport, layout, worldStartWallClockUs)
          .map((tick) => tick.date.getTime() * 1000)
          .filter((wallClockUs) =>
            wallClockUs >= worldStartWallClockUs &&
            wallClockUs <= worldStartWallClockUs + viewport0.worldWidthNs + viewport1.worldWidthNs,
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
    const viewport = buildZoomedViewport(1, 5_000)

    const ticks = selectTimeAxisTicks(
      context,
      viewport,
      buildTimestripLaneLayout(240),
      1_700_000_000_000_000,
    )
    const visibleTicks = ticks.filter((tick) => tick.xPx >= 0 && tick.xPx <= viewport.widthPx)

    expect(visibleTicks.length).toBeGreaterThan(2)
    for (let index = 1; index < visibleTicks.length; index += 1) {
      expect(visibleTicks[index].xPx - visibleTicks[index - 1].xPx).toBeCloseTo(100, 6)
    }
  })
})
