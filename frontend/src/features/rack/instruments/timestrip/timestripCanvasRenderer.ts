import { scrollLeftToWorldNs } from './timestripLayout'
import { drawTimestripViewport } from './timestripViewportDrawing'
import {
  DEFAULT_TIMESTRIP_THEME,
  getTimestripThemeCacheKey,
  type TimestripThemePalette,
} from './timestripTheme'
import type { TimestripDigitalEntry } from './timestripDigitalModel'
import type { TimestripAnalogSample } from './timestripAnalogModel'
import type { TimestripUnavailableRegion } from './timestripUnavailableRegions'

export interface TimestripRendererViewport {
  scrollLeftPx: number
  zoomDenominator: number
  viewportWidthPx: number
  viewportHeightPx: number
  dpr: number
  worldStartWallClockUs: number
  theme?: TimestripThemePalette
  digitalEntries?: TimestripDigitalEntry[]
  digitalDataRevision?: number
  analogSamples?: TimestripAnalogSample[]
  analogDataRevision?: number
  selectedMessageKey?: string | null
  unavailableRegions?: TimestripUnavailableRegion[]
}

export interface TimestripCanvasRendererOptions {
  canvasLayer: HTMLElement
  requestAnimationFrame?: (callback: FrameRequestCallback) => number
  cancelAnimationFrame?: (handle: number) => void
}

export interface TimestripPresentationViewport {
  scrollLeftPx: number
  zoomDenominator?: number
}

const CACHE_VIEWPORTS = 3

/**
 * Viewport-sized timestrip renderer backed by a single canvas.
 */
export class TimestripCanvasRenderer {
  protected readonly canvasLayer: HTMLElement
  protected readonly canvas: HTMLCanvasElement
  protected readonly context: CanvasRenderingContext2D | null
  protected readonly cacheCanvas: HTMLCanvasElement
  protected readonly cacheContext: CanvasRenderingContext2D | null
  protected readonly requestFrame: (callback: FrameRequestCallback) => number
  protected readonly cancelFrame: (handle: number) => void
  protected viewport: TimestripRendererViewport
  protected frameHandle: number | null
  protected disposed: boolean
  protected renderKey: string
  protected cacheKey: string
  protected cacheLeftWorldNs: number
  protected cacheZoomDenominator: number
  protected presentationScrollLeftPx: number
  protected presentationZoomDenominator: number
  protected lastFrameTimestampMs: number | null
  protected frameIntervalsMs: number[]
  protected frameDrawDurationsMs: number[]

  public constructor(options: TimestripCanvasRendererOptions) {
    this.canvasLayer = options.canvasLayer
    this.requestFrame = options.requestAnimationFrame ?? window.requestAnimationFrame.bind(window)
    this.cancelFrame = options.cancelAnimationFrame ?? window.cancelAnimationFrame.bind(window)
    this.canvas = document.createElement('canvas')
    this.canvas.dataset.timestripCanvas = 'true'
    this.canvas.style.display = 'block'
    this.canvas.style.width = '0px'
    this.canvas.style.height = '0px'
    this.canvas.style.pointerEvents = 'none'
    this.context = this.canvas.getContext('2d')
    this.cacheCanvas = document.createElement('canvas')
    this.cacheContext = this.cacheCanvas.getContext('2d')
    this.canvasLayer.appendChild(this.canvas)
    this.viewport = {
      scrollLeftPx: 0,
      zoomDenominator: 1_000_000,
      viewportWidthPx: 0,
      viewportHeightPx: 0,
      dpr: 1,
      worldStartWallClockUs: 0,
      theme: DEFAULT_TIMESTRIP_THEME,
      digitalEntries: [],
      digitalDataRevision: 0,
      analogSamples: [],
      analogDataRevision: 0,
      selectedMessageKey: null,
      unavailableRegions: [],
    }
    this.frameHandle = null
    this.disposed = false
    this.renderKey = ''
    this.cacheKey = ''
    this.cacheLeftWorldNs = 0
    this.cacheZoomDenominator = this.viewport.zoomDenominator
    this.presentationScrollLeftPx = 0
    this.presentationZoomDenominator = this.viewport.zoomDenominator
    this.lastFrameTimestampMs = null
    this.frameIntervalsMs = []
    this.frameDrawDurationsMs = []
  }

  public setViewport(viewport: TimestripRendererViewport): void {
    if (this.disposed) {
      return
    }
    const nextViewport = normalizeViewport(viewport)
    const nextRenderKey = this.getViewportRenderKey(nextViewport)
    this.viewport = nextViewport
    this.presentationScrollLeftPx = nextViewport.scrollLeftPx
    this.presentationZoomDenominator = nextViewport.zoomDenominator
    this.resizeCanvas()
    if (nextRenderKey === this.renderKey) {
      return
    }
    this.renderKey = nextRenderKey
    this.scheduleFrame()
  }

  /** Update motion-only viewport state without invalidating React/query state. */
  public setPresentationViewport(viewport: TimestripPresentationViewport): void {
    if (this.disposed) {
      return
    }
    this.presentationScrollLeftPx = Number.isFinite(viewport.scrollLeftPx)
      ? Math.max(0, viewport.scrollLeftPx)
      : this.presentationScrollLeftPx
    if (viewport.zoomDenominator !== undefined && Number.isFinite(viewport.zoomDenominator) && viewport.zoomDenominator > 0) {
      this.presentationZoomDenominator = viewport.zoomDenominator
    }
    this.scheduleFrame()
  }

  /** Force an exact cache rebuild after a transient pan/zoom presentation settles. */
  public commitPresentationViewport(viewport: TimestripPresentationViewport): void {
    this.setPresentationViewport(viewport)
    this.cacheKey = ''
  }

  public dispose(): void {
    this.disposed = true
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle)
      this.frameHandle = null
    }
    this.canvas.remove()
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  protected scheduleFrame(): void {
    if (this.frameHandle !== null) {
      return
    }
    this.frameHandle = this.requestFrame((timestampMs) => {
      this.frameHandle = null
      const drawStartedMs = performance.now()
      this.render()
      this.recordFrameDiagnostics(timestampMs, performance.now() - drawStartedMs)
    })
  }

  protected recordFrameDiagnostics(timestampMs: number, drawDurationMs: number): void {
    if (!import.meta.env.DEV) {
      return
    }
    if (this.lastFrameTimestampMs !== null) {
      this.frameIntervalsMs.push(timestampMs - this.lastFrameTimestampMs)
    }
    this.lastFrameTimestampMs = timestampMs
    this.frameDrawDurationsMs.push(drawDurationMs)
    if (this.frameIntervalsMs.length < 60) {
      return
    }
    const recentIntervals = this.frameIntervalsMs.slice(-120)
    const recentDrawDurations = this.frameDrawDurationsMs.slice(-120)
    const meanIntervalMs = recentIntervals.reduce((total, value) => total + value, 0) / recentIntervals.length
    const percentile95 = (values: number[]) => {
      const sorted = [...values].sort((left, right) => left - right)
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0
    }
    this.canvas.dataset.timestripFps = (1000 / meanIntervalMs).toFixed(1)
    this.canvas.dataset.timestripFrameP95Ms = percentile95(recentIntervals).toFixed(2)
    this.canvas.dataset.timestripDrawP95Ms = percentile95(recentDrawDurations).toFixed(2)
    this.frameIntervalsMs = recentIntervals
    this.frameDrawDurationsMs = recentDrawDurations
  }

  protected render(): void {
    if (this.disposed || !this.context || !this.cacheContext) {
      return
    }
    if (this.viewport.viewportWidthPx <= 0 || this.viewport.viewportHeightPx <= 0) {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
      return
    }
    const cacheWidthPx = this.viewport.viewportWidthPx * CACHE_VIEWPORTS
    const presentationWorldLeftNs = scrollLeftToWorldNs(
      this.presentationScrollLeftPx,
      this.presentationZoomDenominator,
    )
    const presentationWorldRightNs = presentationWorldLeftNs + (
      this.viewport.viewportWidthPx * this.presentationZoomDenominator
    )
    const cacheWorldRightNs = this.cacheLeftWorldNs + cacheWidthPx * this.cacheZoomDenominator
    const nextCacheKey = this.getCacheRenderKey(this.viewport)
    const mustRebuildCache =
      nextCacheKey !== this.cacheKey ||
      presentationWorldLeftNs < this.cacheLeftWorldNs ||
      presentationWorldRightNs > cacheWorldRightNs
    if (mustRebuildCache) {
      this.cacheKey = nextCacheKey
      this.cacheZoomDenominator = this.presentationZoomDenominator
      this.cacheLeftWorldNs = Math.max(
        0,
        presentationWorldLeftNs - this.viewport.viewportWidthPx * this.cacheZoomDenominator,
      )
      this.resizeCacheCanvas(cacheWidthPx)
      const theme = this.viewport.theme ?? DEFAULT_TIMESTRIP_THEME
      drawTimestripViewport(
        this.cacheContext,
        {
          worldLeftNs: this.cacheLeftWorldNs,
          zoomDenominator: this.cacheZoomDenominator,
          widthPx: cacheWidthPx,
          heightPx: this.viewport.viewportHeightPx,
        },
        this.viewport.dpr,
        theme,
        this.viewport.digitalEntries ?? [],
        this.viewport.analogSamples ?? [],
        this.viewport.worldStartWallClockUs,
        this.viewport.selectedMessageKey ?? null,
        null,
        this.viewport.unavailableRegions ?? [],
      )
    }
    const sourceX = Math.max(
      0,
      (presentationWorldLeftNs - this.cacheLeftWorldNs) / this.cacheZoomDenominator * this.viewport.dpr,
    )
    const sourceWidth = this.viewport.viewportWidthPx * (
      this.presentationZoomDenominator / this.cacheZoomDenominator
    ) * this.viewport.dpr
    const sourceHeight = this.viewport.viewportHeightPx * this.viewport.dpr
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.context.drawImage(
      this.cacheCanvas,
      sourceX,
      0,
      sourceWidth,
      sourceHeight,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    )
  }

  protected resizeCacheCanvas(widthPx: number): void {
    const backingWidth = Math.max(1, Math.ceil(widthPx * this.viewport.dpr))
    const backingHeight = Math.max(1, Math.ceil(this.viewport.viewportHeightPx * this.viewport.dpr))
    if (this.cacheCanvas.width !== backingWidth) {
      this.cacheCanvas.width = backingWidth
    }
    if (this.cacheCanvas.height !== backingHeight) {
      this.cacheCanvas.height = backingHeight
    }
  }

  protected getCacheRenderKey(viewport: TimestripRendererViewport): string {
    const theme = viewport.theme ?? DEFAULT_TIMESTRIP_THEME
    return [
      viewport.viewportWidthPx,
      viewport.viewportHeightPx,
      viewport.dpr,
      viewport.worldStartWallClockUs,
      getTimestripThemeCacheKey(theme),
      viewport.digitalDataRevision ?? 0,
      viewport.analogDataRevision ?? 0,
      viewport.selectedMessageKey ?? '',
      buildUnavailableRegionsCacheKey(viewport.unavailableRegions ?? []),
    ].join('|')
  }

  protected resizeCanvas(): void {
    const widthPx = this.viewport.viewportWidthPx
    const heightPx = this.viewport.viewportHeightPx
    const dpr = this.viewport.dpr
    this.canvasLayer.style.width = `${widthPx}px`
    this.canvasLayer.style.height = `${heightPx}px`
    this.canvas.style.width = `${widthPx}px`
    this.canvas.style.height = `${heightPx}px`
    const backingWidth = Math.max(1, Math.ceil(widthPx * dpr))
    const backingHeight = Math.max(1, Math.ceil(heightPx * dpr))
    if (this.canvas.width !== backingWidth) {
      this.canvas.width = backingWidth
    }
    if (this.canvas.height !== backingHeight) {
      this.canvas.height = backingHeight
    }
  }

  protected getViewportRenderKey(viewport: TimestripRendererViewport): string {
    const theme = viewport.theme ?? DEFAULT_TIMESTRIP_THEME
    return [
      viewport.scrollLeftPx,
      viewport.zoomDenominator,
      viewport.viewportWidthPx,
      viewport.viewportHeightPx,
      viewport.dpr,
      viewport.worldStartWallClockUs,
      getTimestripThemeCacheKey(theme),
      viewport.digitalDataRevision ?? 0,
      viewport.analogDataRevision ?? 0,
      viewport.selectedMessageKey ?? '',
      buildUnavailableRegionsCacheKey(viewport.unavailableRegions ?? []),
    ].join('|')
  }
}

const buildUnavailableRegionsCacheKey = (regions: TimestripUnavailableRegion[]): string =>
  regions.map((region) => `${region.startWorldNs}:${region.endWorldNs}`).join(',')

const normalizeViewport = (viewport: TimestripRendererViewport): TimestripRendererViewport => ({
  ...viewport,
  scrollLeftPx: Number.isFinite(viewport.scrollLeftPx) ? Math.max(0, viewport.scrollLeftPx) : 0,
  zoomDenominator: Number.isFinite(viewport.zoomDenominator) && viewport.zoomDenominator > 0
    ? viewport.zoomDenominator
    : 1_000_000,
  viewportWidthPx: Number.isFinite(viewport.viewportWidthPx) ? Math.max(0, Math.ceil(viewport.viewportWidthPx)) : 0,
  viewportHeightPx: Number.isFinite(viewport.viewportHeightPx) ? Math.max(0, Math.ceil(viewport.viewportHeightPx)) : 0,
  dpr: Number.isFinite(viewport.dpr) && viewport.dpr > 0 ? viewport.dpr : 1,
  worldStartWallClockUs: Number.isFinite(viewport.worldStartWallClockUs) ? viewport.worldStartWallClockUs : 0,
  theme: viewport.theme ?? DEFAULT_TIMESTRIP_THEME,
  digitalEntries: viewport.digitalEntries ?? [],
  digitalDataRevision: viewport.digitalDataRevision ?? 0,
  analogSamples: viewport.analogSamples ?? [],
  analogDataRevision: viewport.analogDataRevision ?? 0,
  selectedMessageKey: viewport.selectedMessageKey ?? null,
  unavailableRegions: viewport.unavailableRegions ?? [],
})
