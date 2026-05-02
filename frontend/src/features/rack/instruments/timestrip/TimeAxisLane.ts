import { scaleTime } from 'd3'
import { scrollLeftToWorldUs, type TimestripVisibleTile } from './timestripLayout'
import type { TimestripLaneLayout } from './timestripLaneLayout'

export interface TimestripTick {
  date: Date
  label: string
  xPx: number
}

const MIN_TICK_COUNT = 2
const MAX_TICK_COUNT = 12

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
  const worldBleedUs = tile.bleedPx * tile.zoomLevelDenominator
  const startWallClockMs = (worldStartWallClockUs + tile.worldLeftUs - worldBleedUs) / 1000
  const endWallClockMs =
    (worldStartWallClockUs + tile.worldLeftUs + tile.worldWidthUs + worldBleedUs) / 1000
  const scale = scaleTime()
    .domain([new Date(startWallClockMs), new Date(endWallClockMs)])
    .range([-tile.bleedPx, tile.widthPx + tile.bleedPx])

  context.save()
  context.font = `${layout.timeAxis.labelFontPx}px sans-serif`
  for (let count = MAX_TICK_COUNT; count >= MIN_TICK_COUNT; count -= 1) {
    const ticks = scale.ticks(count).map((date) => ({
      date,
      label: formatTimestripTickLabel(date),
      xPx: scale(date),
    }))
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
): void => {
  context.fillStyle = '#161d26'
  context.fillRect(-tile.bleedPx, layout.timeAxis.y, tile.widthPx + tile.bleedPx * 2, layout.timeAxis.height)

  const ticks = selectTimeAxisTicks(context, tile, layout, worldStartWallClockUs)
  context.save()
  context.font = `${layout.timeAxis.labelFontPx}px sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'top'
  context.strokeStyle = 'rgba(255, 255, 255, 0.34)'
  context.fillStyle = 'rgba(255, 255, 255, 0.82)'
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

/**
 * Draw viewport-level time-axis ticks after tile composition.
 *
 * Keeps labels independent from tile boundaries so text cannot be overpainted by adjacent tiles.
 *
 * @param context - Visible viewport Canvas 2D context.
 * @param viewportWidthPx - Viewport width in CSS pixels.
 * @param zoomDenominator - Microseconds per CSS pixel.
 * @param scrollLeftPx - Viewport scrollLeft in CSS pixels.
 * @param layout - Lane layout.
 * @param worldStartWallClockUs - Wall-clock microseconds at world X = 0.
 */
export const drawTimeAxisViewportOverlay = (
  context: CanvasRenderingContext2D,
  viewportWidthPx: number,
  zoomDenominator: number,
  scrollLeftPx: number,
  layout: TimestripLaneLayout,
  worldStartWallClockUs: number,
): void => {
  const scrollWorldUs = scrollLeftToWorldUs(scrollLeftPx, zoomDenominator)
  const startWallClockMs = (worldStartWallClockUs + scrollWorldUs) / 1000
  const endWallClockMs = (worldStartWallClockUs + scrollWorldUs + viewportWidthPx * zoomDenominator) / 1000
  const scale = scaleTime()
    .domain([new Date(startWallClockMs), new Date(endWallClockMs)])
    .range([0, viewportWidthPx])
  const ticks = selectTicksForScale(context, scale, layout.timeAxis.labelFontPx, layout.timeAxis.labelPaddingPx)

  context.save()
  context.font = `${layout.timeAxis.labelFontPx}px sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'top'
  context.strokeStyle = 'rgba(255, 255, 255, 0.34)'
  context.fillStyle = 'rgba(255, 255, 255, 0.82)'
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

const selectTicksForScale = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  scale: ReturnType<typeof scaleTime>,
  labelFontPx: number,
  labelPaddingPx: number,
): TimestripTick[] => {
  context.save()
  context.font = `${labelFontPx}px sans-serif`
  for (let count = MAX_TICK_COUNT; count >= MIN_TICK_COUNT; count -= 1) {
    const ticks = scale.ticks(count).map((date) => ({
      date,
      label: formatTimestripTickLabel(date),
      xPx: scale(date),
    }))
    if (ticks.length === 0) {
      continue
    }
    const maxLabelWidth = Math.max(
      ...ticks.map((tick) => context.measureText(tick.label).width),
      0,
    )
    if (
      ticks.length === 1 ||
      getMinimumTickSpacing(ticks) >= maxLabelWidth + labelPaddingPx
    ) {
      context.restore()
      return ticks
    }
  }
  context.restore()
  return []
}

const getMinimumTickSpacing = (ticks: TimestripTick[]): number => {
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 1; index < ticks.length; index += 1) {
    minimum = Math.min(minimum, ticks[index].xPx - ticks[index - 1].xPx)
  }
  return minimum
}
