import type { TimestripVisibleTile } from './timestripLayout'
import type { TimestripLaneLayout } from './timestripLaneLayout'
import type { TimestripThemePalette } from './timestripTheme'

export interface TimestripTick {
  date: Date
  label: string
  xPx: number
}

const TICK_EDGE_SEARCH_PX = 160
const TICK_INTERVALS_US = [
  1_000,
  2_000,
  5_000,
  10_000,
  20_000,
  50_000,
  100_000,
  200_000,
  500_000,
  1_000_000,
  2_000_000,
  5_000_000,
  10_000_000,
  15_000_000,
  30_000_000,
  60_000_000,
  120_000_000,
  300_000_000,
  600_000_000,
  1_800_000_000,
  3_600_000_000,
] as const

/**
 * Format a wall-clock tick label.
 *
 * @param date - Tick date.
 * @returns Wall-clock label.
 */
export const formatTimestripTickLabel = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  const milliseconds = date.getMilliseconds().toString().padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${milliseconds}`
}

/**
 * Select wall-time ticks that leave enough label spacing.
 *
 * @param context - Canvas 2D context.
 * @param tile - Tile descriptor.
 * @param layout - Lane layout.
 * @param worldStartWallClockUs - Wall-clock microseconds at world X = 0.
 * @returns Non-overlapping ticks.
 */
export const selectTimeAxisTicks = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tile: TimestripVisibleTile,
  layout: TimestripLaneLayout,
  worldStartWallClockUs: number,
): TimestripTick[] => {
  const startWallClockMs = (worldStartWallClockUs + tile.worldLeftUs) / 1000
  const worldUsPerPx = tile.worldWidthUs / tile.widthPx

  context.save()
  context.font = `${layout.timeAxis.labelFontPx}px sans-serif`
  const sampleLabel = formatTimestripTickLabel(new Date(startWallClockMs))
  const minimumSpacingPx = context.measureText(sampleLabel).width + layout.timeAxis.labelPaddingPx
  const intervalUs = selectTickIntervalUs(minimumSpacingPx, worldUsPerPx)
  const searchStartWallClockUs =
    worldStartWallClockUs + tile.worldLeftUs - TICK_EDGE_SEARCH_PX * worldUsPerPx
  const searchEndWallClockUs =
    worldStartWallClockUs +
    tile.worldLeftUs +
    tile.worldWidthUs +
    TICK_EDGE_SEARCH_PX * worldUsPerPx
  const firstTickWallClockUs = Math.floor(searchStartWallClockUs / intervalUs) * intervalUs
  const ticks: TimestripTick[] = []
  for (
    let tickWallClockUs = firstTickWallClockUs;
    tickWallClockUs <= searchEndWallClockUs;
    tickWallClockUs += intervalUs
  ) {
    const date = new Date(tickWallClockUs / 1000)
    const label = formatTimestripTickLabel(date)
    const xPx = (tickWallClockUs - worldStartWallClockUs - tile.worldLeftUs) / worldUsPerPx
    const labelWidth = context.measureText(label).width
    if (xPx + labelWidth / 2 < 0 || xPx - labelWidth / 2 > tile.widthPx) {
      continue
    }
    ticks.push({ date, label, xPx })
  }
  context.restore()
  return ticks
}

const selectTickIntervalUs = (minimumSpacingPx: number, zoomDenominator: number): number => {
  const minimumIntervalUs = minimumSpacingPx * zoomDenominator
  return TICK_INTERVALS_US.find((intervalUs) => intervalUs >= minimumIntervalUs) ??
    TICK_INTERVALS_US[TICK_INTERVALS_US.length - 1]
}

/**
 * Draw top time-axis lane.
 *
 * @param context - Canvas 2D context.
 * @param tile - Tile descriptor.
 * @param layout - Lane layout.
 * @param worldStartWallClockUs - Wall-clock microseconds at world X = 0.
 */
export const drawTimeAxisLane = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tile: TimestripVisibleTile,
  layout: TimestripLaneLayout,
  worldStartWallClockUs: number,
  theme: TimestripThemePalette,
): void => {
  context.fillStyle = theme.timeAxisBackground
  context.fillRect(0, layout.timeAxis.y, tile.widthPx, layout.timeAxis.height)

  const ticks = selectTimeAxisTicks(context, tile, layout, worldStartWallClockUs)
  context.save()
  context.font = `${layout.timeAxis.labelFontPx}px sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'top'
  context.strokeStyle = theme.tickColor
  context.fillStyle = theme.tickTextColor
  context.lineWidth = 1

  const tickTop = layout.timeAxis.height - layout.timeAxis.tickHeightPx
  for (const tick of ticks) {
    const x = Math.round(tick.xPx) + 0.5
    context.beginPath()
    context.moveTo(x, tickTop)
    context.lineTo(x, layout.timeAxis.height)
    context.stroke()
    context.fillText(tick.label, tick.xPx, 5)
  }
  context.restore()
}
