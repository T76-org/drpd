import { drawAnalogTraceLane } from './AnalogTraceLane'
import { drawDigitalTraceLane } from './DigitalTraceLane'
import { drawTimeAxisLane } from './TimeAxisLane'
import { buildTimestripLaneLayout } from './timestripLaneLayout'
import type { TimestripThemePalette } from './timestripTheme'
import type { TimestripDigitalEntry } from './timestripDigitalModel'
import {
  filterTimestripAnalogSamplesForViewport,
  type TimestripAnalogSample,
} from './timestripAnalogModel'
import type { TimestripUnavailableRegion } from './timestripUnavailableRegions'

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
  unavailableRegions: TimestripUnavailableRegion[] = [],
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
  const analogViewportSamples = filterTimestripAnalogSamplesForViewport(
    analogSamples,
    viewport.worldLeftNs,
    viewport.worldLeftNs + width * viewport.zoomDenominator,
    unavailableRegions.map((region) => region.startWorldNs),
  )
  drawAnalogTraceLane(context, layout, width, theme, {
    worldLeftNs: viewport.worldLeftNs,
    zoomDenominator: viewport.zoomDenominator,
    samples: analogViewportSamples,
  })
  drawSelectedMessageViewportBackground(context, layout, viewport, width, theme, digitalEntries, selectedMessageKey)
  drawUnavailableRegions(context, viewport, width, height, theme, unavailableRegions)
  drawCaptureMarker(context, layout, width, theme, {
    worldLeftNs: viewport.worldLeftNs,
    zoomDenominator: viewport.zoomDenominator,
    captureMarkerWorldNs,
  })

  context.restore()
}

const drawSelectedMessageViewportBackground = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: ReturnType<typeof buildTimestripLaneLayout>,
  viewport: TimestripViewportDrawRegion,
  widthPx: number,
  theme: TimestripThemePalette,
  entries: TimestripDigitalEntry[],
  selectedMessageKey: string | null,
): void => {
  if (!selectedMessageKey) {
    return
  }
  const selectedEntry = entries.find((entry) => (
    entry.kind === 'message' && entry.selectionKey === selectedMessageKey
  ))
  if (!selectedEntry || selectedEntry.kind !== 'message') {
    return
  }
  const viewportRightNs = viewport.worldLeftNs + widthPx * viewport.zoomDenominator
  const startWorldNs = Math.max(viewport.worldLeftNs, selectedEntry.startWorldNs)
  const endWorldNs = Math.min(viewportRightNs, selectedEntry.endWorldNs)
  if (endWorldNs <= startWorldNs) {
    return
  }
  const x = (startWorldNs - viewport.worldLeftNs) / viewport.zoomDenominator
  const selectedWidthPx = Math.max(1, (endWorldNs - startWorldNs) / viewport.zoomDenominator)
  const y = layout.digital.y + 1
  const height = Math.max(1, layout.analog.y + layout.analog.height - y)
  context.fillStyle = theme.selectedMessageBackgroundColor
  context.fillRect(x, y, selectedWidthPx, height)
}

const drawUnavailableRegions = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  viewport: TimestripViewportDrawRegion,
  widthPx: number,
  heightPx: number,
  theme: TimestripThemePalette,
  regions: TimestripUnavailableRegion[],
): void => {
  if (regions.length === 0) {
    return
  }
  const viewportRightNs = viewport.worldLeftNs + widthPx * viewport.zoomDenominator
  context.save()
  context.beginPath()
  context.rect(0, 0, widthPx, heightPx)
  context.clip()
  for (const region of regions) {
    const startWorldNs = Math.max(viewport.worldLeftNs, region.startWorldNs)
    const endWorldNs = Math.min(viewportRightNs, region.endWorldNs)
    if (endWorldNs <= startWorldNs) {
      continue
    }
    const x = (startWorldNs - viewport.worldLeftNs) / viewport.zoomDenominator
    const width = Math.max(1, (endWorldNs - startWorldNs) / viewport.zoomDenominator)
    context.fillStyle = theme.unavailableOverlayFillColor
    context.fillRect(x, 0, width, heightPx)
  }
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
