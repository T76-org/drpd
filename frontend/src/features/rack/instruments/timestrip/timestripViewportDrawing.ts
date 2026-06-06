import { drawAnalogTraceLane } from './AnalogTraceLane'
import { drawDigitalTraceLane } from './DigitalTraceLane'
import { drawTimeAxisLane } from './TimeAxisLane'
import { buildTimestripLaneLayout } from './timestripLaneLayout'
import type { TimestripThemePalette } from './timestripTheme'
import type { TimestripDigitalEntry } from './timestripDigitalModel'
import type { TimestripAnalogSample } from './timestripAnalogModel'

export interface TimestripViewportDrawRegion {
  worldLeftNs: number
  zoomDenominator: number
  widthPx: number
  heightPx: number
}

/**
 * Draw the current visible timestrip viewport into one canvas.
 */
export const drawTimestripViewport = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  viewport: TimestripViewportDrawRegion,
  dpr: number,
  theme: TimestripThemePalette,
  digitalEntries: TimestripDigitalEntry[] = [],
  analogSamples: TimestripAnalogSample[] = [],
  worldStartWallClockUs = 0,
  selectedMessageKey: string | null = null,
  captureMarkerWorldNs: number | null = null,
): void => {
  const width = viewport.widthPx
  const height = viewport.heightPx
  context.save()
  context.scale(dpr, dpr)
  context.clearRect(0, 0, width, height)

  const layout = buildTimestripLaneLayout(height)
  drawTimeAxisLane(
    context,
    {
      worldLeftNs: viewport.worldLeftNs,
      worldWidthNs: width * viewport.zoomDenominator,
      widthPx: width,
    },
    layout,
    worldStartWallClockUs,
    theme,
  )
  drawDigitalTraceLane(context, layout, width, theme, {
    worldLeftNs: viewport.worldLeftNs,
    zoomDenominator: viewport.zoomDenominator,
    entries: digitalEntries,
    selectedMessageKey,
  })
  drawAnalogTraceLane(context, layout, width, theme, {
    worldLeftNs: viewport.worldLeftNs,
    zoomDenominator: viewport.zoomDenominator,
    samples: analogSamples,
  })
  drawCaptureMarker(context, layout, width, theme, {
    worldLeftNs: viewport.worldLeftNs,
    zoomDenominator: viewport.zoomDenominator,
    captureMarkerWorldNs,
  })

  context.restore()
}

const drawCaptureMarker = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: ReturnType<typeof buildTimestripLaneLayout>,
  widthPx: number,
  theme: TimestripThemePalette,
  options: {
    worldLeftNs: number
    zoomDenominator: number
    captureMarkerWorldNs: number | null
  },
): void => {
  if (options.captureMarkerWorldNs === null || !Number.isFinite(options.captureMarkerWorldNs)) {
    return
  }
  const x = (options.captureMarkerWorldNs - options.worldLeftNs) / options.zoomDenominator
  if (x < 0 || x > widthPx) {
    return
  }
  const y = layout.digital.y
  const height = layout.analog.y + layout.analog.height - layout.digital.y
  context.save()
  context.beginPath()
  context.moveTo(Math.round(x) + 0.5, y)
  context.lineTo(Math.round(x) + 0.5, y + height)
  context.strokeStyle = theme.captureMarkerColor
  context.lineWidth = 1
  context.stroke()
  context.restore()
}
