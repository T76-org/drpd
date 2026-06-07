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

/**
 * Viewport-sized timestrip renderer backed by a single canvas.
 */
export class TimestripCanvasRenderer {
  protected readonly canvasLayer: HTMLElement
  protected readonly canvas: HTMLCanvasElement
  protected readonly context: CanvasRenderingContext2D | null
  protected readonly requestFrame: (callback: FrameRequestCallback) => number
  protected readonly cancelFrame: (handle: number) => void
  protected viewport: TimestripRendererViewport
  protected frameHandle: number | null
  protected disposed: boolean
  protected renderKey: string

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
  }

  public setViewport(viewport: TimestripRendererViewport): void {
    if (this.disposed) {
      return
    }
    const nextViewport = normalizeViewport(viewport)
    const nextRenderKey = this.getViewportRenderKey(nextViewport)
    this.viewport = nextViewport
    this.resizeCanvas()
    if (nextRenderKey === this.renderKey) {
      return
    }
    this.renderKey = nextRenderKey
    this.scheduleFrame()
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
    this.frameHandle = this.requestFrame(() => {
      this.frameHandle = null
      this.render()
    })
  }

  protected render(): void {
    if (this.disposed || !this.context) {
      return
    }
    if (this.viewport.viewportWidthPx <= 0 || this.viewport.viewportHeightPx <= 0) {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
      return
    }
    const theme = this.viewport.theme ?? DEFAULT_TIMESTRIP_THEME
    drawTimestripViewport(
      this.context,
      {
        worldLeftNs: scrollLeftToWorldNs(this.viewport.scrollLeftPx, this.viewport.zoomDenominator),
        zoomDenominator: this.viewport.zoomDenominator,
        widthPx: this.viewport.viewportWidthPx,
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
