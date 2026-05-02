import { scaleTime } from 'd3'
import type { TimestripVisibleTile } from './timestripLayout'
import type { TimestripLaneLayout } from './timestripLaneLayout'
import type { TimestripThemePalette } from './timestripTheme'

export interface TimestripTick {
  date: Date
  label: string
  xPx: number
}

const MIN_TICK_COUNT = 2
const MAX_TICK_COUNT = 12
const TICK_EDGE_SEARCH_PX = 160

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
  const endWallClockMs = (worldStartWallClockUs + tile.worldLeftUs + tile.worldWidthUs) / 1000
  const scale = scaleTime()
    .domain([new Date(startWallClockMs), new Date(endWallClockMs)])
    .range([0, tile.widthPx])
  const edgeSearchMs = (TICK_EDGE_SEARCH_PX * tile.zoomLevelDenominator) / 1000
  const candidateScale = scaleTime()
    .domain([new Date(startWallClockMs - edgeSearchMs), new Date(endWallClockMs + edgeSearchMs)])
    .range([-TICK_EDGE_SEARCH_PX, tile.widthPx + TICK_EDGE_SEARCH_PX])

  context.save()
  context.font = `${layout.timeAxis.labelFontPx}px sans-serif`
  for (let count = MAX_TICK_COUNT; count >= MIN_TICK_COUNT; count -= 1) {
    const ticks = candidateScale.ticks(count).map((date) => ({
      date,
      label: formatTimestripTickLabel(date),
      xPx: scale(date) as number,
    })).filter((tick) => {
      const labelWidth = context.measureText(tick.label).width
      return tick.xPx + labelWidth / 2 >= 0 && tick.xPx - labelWidth / 2 <= tile.widthPx
    })
    if (ticks.length === 0) {
      continue
    }
    const maxLabelWidth = Math.max(
      ...ticks.map((tick) => context.measureText(tick.label).width),
      0,
    )
    const minimumSpacing = getMinimumTickSpacing(ticks)
    if (ticks.length === 1 || minimumSpacing >= maxLabelWidth + layout.timeAxis.labelPaddingPx) {
      context.restore()
      return ticks
    }
  }
  context.restore()
  return []
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

const getMinimumTickSpacing = (ticks: TimestripTick[]): number => {
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 1; index < ticks.length; index += 1) {
    minimum = Math.min(minimum, ticks[index].xPx - ticks[index - 1].xPx)
  }
  return minimum
}
