import type { TimestripLaneLayout } from './timestripLaneLayout'
import type { TimestripThemePalette } from './timestripTheme'
import {
  getTimestripEventColor,
  resolveTimestripDigitalDetailLevel,
  type TimestripDigitalEntry,
  type TimestripDigitalMessageEntry,
} from './timestripDigitalModel'

const LANE_PADDING_PX = 4
const MIN_TEXT_WIDTH_PX = 34

export interface DigitalTraceLaneRenderOptions {
  worldLeftUs: number
  zoomDenominator: number
  entries: TimestripDigitalEntry[]
  selectedMessageKey?: string | null
}

/**
 * Draw an empty digital trace lane background.
 *
 * @param context - Canvas 2D context.
 * @param layout - Lane layout.
 * @param widthPx - Tile width in CSS pixels.
 */
export const drawDigitalTraceLane = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TimestripLaneLayout,
  widthPx: number,
  theme: TimestripThemePalette,
  options?: DigitalTraceLaneRenderOptions,
): void => {
  context.fillStyle = theme.digitalBackground
  context.fillRect(0, layout.digital.y, widthPx, layout.digital.height)
  if (!options) {
    return
  }

  const detailLevel = resolveTimestripDigitalDetailLevel(options.zoomDenominator)
  context.save()
  context.beginPath()
  context.rect(0, layout.digital.y, widthPx, layout.digital.height)
  context.clip()
  context.font = '11px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.lineWidth = 1

  for (const entry of options.entries) {
    if (entry.kind === 'event') {
      drawDigitalEvent(context, layout, entry, options, theme)
      continue
    }
    drawDigitalMessage(
      context,
      layout,
      entry,
      options,
      theme,
      detailLevel,
      options.selectedMessageKey === entry.selectionKey,
    )
  }
  context.restore()
}

const drawDigitalEvent = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TimestripLaneLayout,
  entry: Extract<TimestripDigitalEntry, { kind: 'event' }>,
  options: DigitalTraceLaneRenderOptions,
  theme: TimestripThemePalette,
): void => {
  const x = (entry.worldUs - options.worldLeftUs) / options.zoomDenominator
  context.strokeStyle = getTimestripEventColor(entry.eventType, theme)
  context.beginPath()
  context.moveTo(Math.round(x) + 0.5, layout.digital.y + 1)
  context.lineTo(Math.round(x) + 0.5, layout.digital.y + layout.digital.height - 1)
  context.stroke()
}

const drawDigitalMessage = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TimestripLaneLayout,
  entry: TimestripDigitalMessageEntry,
  options: DigitalTraceLaneRenderOptions,
  theme: TimestripThemePalette,
  detailLevel: 1 | 2 | 3,
  isSelected: boolean,
): void => {
  const x = (entry.startWorldUs - options.worldLeftUs) / options.zoomDenominator
  const width = Math.max(1, (entry.endWorldUs - entry.startWorldUs) / options.zoomDenominator)
  if (isSelected) {
    drawSelectedMessageBackground(context, layout, x, width, theme)
  }
  if (detailLevel === 3) {
    drawDetailedMessage(context, layout, entry, options, theme, x, width)
    return
  }

  const y = layout.digital.y + LANE_PADDING_PX
  const height = Math.max(1, layout.digital.height - LANE_PADDING_PX * 2)
  drawRect(context, x, y, width, height, theme.messageFillColor, theme.messageStrokeColor)
  if (detailLevel >= 2 && width >= MIN_TEXT_WIDTH_PX) {
    drawClippedText(context, entry.label, x, y, width, height, theme.messageTextColor)
  }
}

const drawSelectedMessageBackground = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TimestripLaneLayout,
  x: number,
  width: number,
  theme: TimestripThemePalette,
): void => {
  const y = layout.digital.y + 1
  const height = Math.max(1, layout.digital.height - 2)
  context.fillStyle = theme.selectedMessageBackgroundColor
  context.fillRect(x, y, width, height)
}

const drawDetailedMessage = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TimestripLaneLayout,
  entry: TimestripDigitalMessageEntry,
  options: DigitalTraceLaneRenderOptions,
  theme: TimestripThemePalette,
  x: number,
  width: number,
): void => {
  const availableHeight = Math.max(1, layout.digital.height - LANE_PADDING_PX * 2)
  const rowGap = 2
  const waveformHeight = Math.max(12, Math.floor(availableHeight * 0.34))
  const nameHeight = Math.max(12, Math.floor(availableHeight * 0.2))
  const componentHeight = Math.max(10, Math.floor(availableHeight * 0.2))
  const byteHeight = Math.max(10, availableHeight - waveformHeight - nameHeight - componentHeight - rowGap * 3)
  const top = layout.digital.y + LANE_PADDING_PX
  drawWaveform(context, entry, options, theme, top, waveformHeight)
  drawRect(context, x, top + waveformHeight + rowGap, width, nameHeight, theme.messageFillColor, theme.messageStrokeColor)
  if (width >= MIN_TEXT_WIDTH_PX) {
    drawClippedText(context, entry.label, x, top + waveformHeight + rowGap, width, nameHeight, theme.messageTextColor)
  }

  const componentY = top + waveformHeight + nameHeight + rowGap * 2
  for (const component of entry.components) {
    const componentX = x + component.startUs / options.zoomDenominator
    const componentWidth = Math.max(1, component.durationUs / options.zoomDenominator)
    const componentFill = getDigitalComponentFillColor(component.label, theme)
    drawRect(context, componentX, componentY, componentWidth, componentHeight, componentFill, theme.messageStrokeColor)
    if (componentWidth >= MIN_TEXT_WIDTH_PX) {
      drawClippedText(context, component.label, componentX, componentY, componentWidth, componentHeight, theme.messageTextColor)
    }
  }

  const byteY = componentY + componentHeight + rowGap
  const firstByteComponent = entry.components.find((component) => component.byteLength > 0)
  const firstByteStartUs = firstByteComponent?.startUs ?? 0
  const byteDurationUs = firstByteComponent
    ? firstByteComponent.durationUs / firstByteComponent.byteLength
    : (entry.endWorldUs - entry.startWorldUs) / Math.max(1, entry.frameBytes.length)
  for (let index = 0; index < entry.frameBytes.length; index += 1) {
    const byteX = x + (firstByteStartUs + index * byteDurationUs) / options.zoomDenominator
    const byteWidth = Math.max(1, byteDurationUs / options.zoomDenominator)
    const byteFill = getDigitalByteFillColor(entry, index, theme)
    drawRect(context, byteX, byteY, byteWidth, byteHeight, byteFill, theme.messageStrokeColor)
    if (byteWidth >= 20) {
      drawClippedText(
        context,
        entry.frameBytes[index].toString(16).toUpperCase().padStart(2, '0'),
        byteX,
        byteY,
        byteWidth,
        byteHeight,
        theme.messageTextColor,
      )
    }
  }
}

const getDigitalComponentFillColor = (label: string, theme: TimestripThemePalette): string => {
  switch (label) {
    case 'Preamble':
      return theme.preambleFillColor
    case 'SOP':
      return theme.sopFillColor
    case 'Header':
      return theme.headerFillColor
    case 'Data':
      return theme.dataFillColor
    case 'CRC32':
      return theme.crc32FillColor
    default:
      return theme.componentFillColor
  }
}

const getDigitalByteFillColor = (
  entry: TimestripDigitalMessageEntry,
  byteIndex: number,
  theme: TimestripThemePalette,
): string => {
  const component = entry.components.find((candidate) => (
    candidate.byteLength > 0 &&
    byteIndex >= candidate.byteStart &&
    byteIndex < candidate.byteStart + candidate.byteLength
  ))
  return component ? getDigitalComponentFillColor(component.label, theme) : theme.byteFillColor
}

const drawWaveform = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  entry: TimestripDigitalMessageEntry,
  options: DigitalTraceLaneRenderOptions,
  theme: TimestripThemePalette,
  y: number,
  height: number,
): void => {
  if (entry.pulseWidthsNs.length === 0) {
    return
  }
  const highY = y + 3
  const lowY = y + height - 3
  let currentWorldUs = entry.startWorldUs
  let high = true
  context.strokeStyle = theme.waveformColor
  context.beginPath()
  context.moveTo((currentWorldUs - options.worldLeftUs) / options.zoomDenominator, highY)
  for (const pulseWidthNs of entry.pulseWidthsNs) {
    const nextWorldUs = currentWorldUs + pulseWidthNs
    const nextX = (nextWorldUs - options.worldLeftUs) / options.zoomDenominator
    const yValue = high ? highY : lowY
    context.lineTo(nextX, yValue)
    high = !high
    context.lineTo(nextX, high ? highY : lowY)
    currentWorldUs = nextWorldUs
  }
  context.stroke()
}

const drawRect = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fillStyle: string,
  strokeStyle: string,
): void => {
  context.fillStyle = fillStyle
  context.strokeStyle = strokeStyle
  context.fillRect(x, y, width, height)
  if (width >= 2 && height >= 2) {
    context.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1))
  }
}

const drawClippedText = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fillStyle: string,
): void => {
  context.save()
  context.beginPath()
  context.rect(x, y, width, height)
  context.clip()
  context.fillStyle = fillStyle
  context.fillText(text, x + width / 2, y + height / 2)
  context.restore()
}
