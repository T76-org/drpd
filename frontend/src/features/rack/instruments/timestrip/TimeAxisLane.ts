import type { TimestripVisibleTile } from './timestripLayout'
import type { TimestripLaneLayout } from './timestripLaneLayout'
import type { TimestripThemePalette } from './timestripTheme'

export interface TimestripTick {
  date: Date
  label: string
  xPx: number
}

const TICK_EDGE_SEARCH_PX = 160
const TICK_INTERVALS_NS = [
  1,
  2,
  5,
  10,
  20,
  50,
  100,
  200,
  500,
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
  20_000_000,
  50_000_000,
  100_000_000,
  200_000_000,
  500_000_000,
  1_000_000_000,
  2_000_000_000,
  5_000_000_000,
  10_000_000_000,
  15_000_000_000,
  30_000_000_000,
  60_000_000_000,
  120_000_000_000,
  300_000_000_000,
  600_000_000_000,
  1_800_000_000_000,
  3_600_000_000_000,
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
  const originWallClockNs = BigInt(Math.floor(worldStartWallClockUs)) * 1000n
  const worldNsPerPx = tile.worldWidthUs / tile.widthPx

  context.save()
  context.font = `${layout.timeAxis.labelFontPx}px sans-serif`
  const sampleLabel = formatTimestripTickLabelFromParts(worldStartWallClockUs, 0, 1_000_000)
  const minimumSpacingPx = context.measureText(sampleLabel).width + layout.timeAxis.labelPaddingPx
  const intervalNs = selectTickIntervalNs(minimumSpacingPx, worldNsPerPx)
  const searchStartWorldNs = Math.floor(tile.worldLeftUs - TICK_EDGE_SEARCH_PX * worldNsPerPx)
  const searchEndWorldNs = Math.ceil(tile.worldLeftUs + tile.worldWidthUs + TICK_EDGE_SEARCH_PX * worldNsPerPx)
  const searchStartWallClockNs = originWallClockNs + BigInt(searchStartWorldNs)
  const searchEndWallClockNs = originWallClockNs + BigInt(searchEndWorldNs)
  const intervalNsBig = BigInt(intervalNs)
  const firstTickWallClockNs = (searchStartWallClockNs / intervalNsBig) * intervalNsBig
  const ticks: TimestripTick[] = []
  for (
    let tickWallClockNs = firstTickWallClockNs;
    tickWallClockNs <= searchEndWallClockNs;
    tickWallClockNs += intervalNsBig
  ) {
    const tickWorldNs = Number(tickWallClockNs - originWallClockNs)
    const wallClockUs = Math.floor(worldStartWallClockUs + tickWorldNs / 1000)
    const subMicrosecondNs = ((tickWorldNs % 1000) + 1000) % 1000
    const date = new Date(wallClockUs / 1000)
    const label = formatTimestripTickLabelFromParts(wallClockUs, subMicrosecondNs, intervalNs)
    const xPx = (tickWorldNs - tile.worldLeftUs) / worldNsPerPx
    const labelWidth = context.measureText(label).width
    if (xPx + labelWidth / 2 < 0 || xPx - labelWidth / 2 > tile.widthPx) {
      continue
    }
    ticks.push({ date, label, xPx })
  }
  context.restore()
  return ticks
}

const selectTickIntervalNs = (minimumSpacingPx: number, zoomDenominator: number): number => {
  const minimumIntervalNs = minimumSpacingPx * zoomDenominator
  return TICK_INTERVALS_NS.find((intervalNs) => intervalNs >= minimumIntervalNs) ??
    TICK_INTERVALS_NS[TICK_INTERVALS_NS.length - 1]
}

const formatTimestripTickLabelFromParts = (
  wallClockUs: number,
  subMicrosecondNs: number,
  intervalNs: number,
): string => {
  const date = new Date(wallClockUs / 1000)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  const microseconds = ((Math.floor(wallClockUs) % 1_000_000) + 1_000_000) % 1_000_000
  if (intervalNs < 1_000) {
    const nanoseconds = microseconds * 1000 + subMicrosecondNs
    return `${hours}:${minutes}:${seconds}.${nanoseconds.toString().padStart(9, '0')}`
  }
  if (intervalNs < 1_000_000) {
    return `${hours}:${minutes}:${seconds}.${microseconds.toString().padStart(6, '0')}`
  }
  const milliseconds = Math.floor(microseconds / 1000)
  return `${hours}:${minutes}:${seconds}.${milliseconds.toString().padStart(3, '0')}`
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
