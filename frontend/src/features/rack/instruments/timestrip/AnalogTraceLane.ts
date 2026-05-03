import type { TimestripLaneLayout } from './timestripLaneLayout'
import type { TimestripThemePalette } from './timestripTheme'
import {
  TIMESTRIP_ANALOG_CURRENT_MAX_A,
  TIMESTRIP_ANALOG_VOLTAGE_MAX_V,
  type TimestripAnalogSample,
} from './timestripAnalogModel'
import { ANALOG_TRACE_PADDING_PX, buildTimestripAnalogLegendTicks } from './timestripAnalogLegend'

interface AnalogTraceLaneOptions {
  worldLeftUs: number
  zoomDenominator: number
  widthPx?: number
  samples: TimestripAnalogSample[]
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const drawTrace = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TimestripLaneLayout,
  samples: TimestripAnalogSample[],
  color: string,
  readValue: (sample: TimestripAnalogSample) => number,
  maxValue: number,
  options: AnalogTraceLaneOptions,
): void => {
  if (samples.length === 0) {
    return
  }

  const top = layout.analog.y + ANALOG_TRACE_PADDING_PX
  const height = Math.max(1, layout.analog.height - ANALOG_TRACE_PADDING_PX * 2)
  const widthPx = options.widthPx ?? 0
  const tileRightUs = options.worldLeftUs + options.zoomDenominator * widthPx
  const firstSample = samples[0]
  const lastSample = samples.at(-1)!
  context.save()
  context.beginPath()
  context.lineCap = 'round'
  if (firstSample.worldUs >= options.worldLeftUs) {
    const y = top + (1 - clamp01(readValue(firstSample) / maxValue)) * height
    context.moveTo(0, y)
    const firstX = (firstSample.worldUs - options.worldLeftUs) / options.zoomDenominator
    if (firstX > 0) {
      context.lineTo(firstX, y)
    }
  }
  samples.forEach((sample, index) => {
    const x = (sample.worldUs - options.worldLeftUs) / options.zoomDenominator
    const y = top + (1 - clamp01(readValue(sample) / maxValue)) * height
    if (index === 0 && firstSample.worldUs < options.worldLeftUs) {
      context.moveTo(x, y)
    } else if (index > 0) {
      context.lineTo(x, y)
    }
  })
  if (lastSample.worldUs <= tileRightUs) {
    const x = (lastSample.worldUs - options.worldLeftUs) / options.zoomDenominator
    const y = top + (1 - clamp01(readValue(lastSample) / maxValue)) * height
    if (samples.length === 1 && firstSample.worldUs < options.worldLeftUs) {
      context.moveTo(x, y)
    }
    context.lineTo(widthPx, y)
  }
  context.strokeStyle = color
  context.lineWidth = 1.5
  context.stroke()
  context.restore()
}

const drawAnalogGridLines = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TimestripLaneLayout,
  widthPx: number,
  theme: TimestripThemePalette,
): void => {
  const ticks = buildTimestripAnalogLegendTicks(layout.analog.y + layout.analog.height).voltage
  context.save()
  context.beginPath()
  for (const tick of ticks) {
    const y = Math.round(tick.y) + 0.5
    context.moveTo(0, y)
    context.lineTo(widthPx, y)
  }
  context.strokeStyle = theme.analogGridColor
  context.lineWidth = 1
  context.stroke()
  context.restore()
}

/**
 * Draw an empty analog trace lane background.
 *
 * @param context - Canvas 2D context.
 * @param layout - Lane layout.
 * @param widthPx - Tile width in CSS pixels.
 */
export const drawAnalogTraceLane = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: TimestripLaneLayout,
  widthPx: number,
  theme: TimestripThemePalette,
  options: AnalogTraceLaneOptions = {
    worldLeftUs: 0,
    zoomDenominator: 1,
    widthPx,
    samples: [],
  },
): void => {
  const renderOptions = { ...options, widthPx }
  context.fillStyle = theme.analogBackground
  context.fillRect(0, layout.analog.y, widthPx, layout.analog.height)
  drawAnalogGridLines(context, layout, widthPx, theme)
  drawTrace(
    context,
    layout,
    options.samples,
    theme.voltageTraceColor,
    (sample) => sample.voltageV,
    TIMESTRIP_ANALOG_VOLTAGE_MAX_V,
    renderOptions,
  )
  drawTrace(
    context,
    layout,
    options.samples,
    theme.currentTraceColor,
    (sample) => sample.currentA,
    TIMESTRIP_ANALOG_CURRENT_MAX_A,
    renderOptions,
  )
}
