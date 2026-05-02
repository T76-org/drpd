import {
  calculateVisibleTimestripTiles,
  scrollLeftToWorldUs,
  type TimestripVisibleTile,
} from './timestripLayout'
import {
  type TimestripTileWorkerRequest,
  type TimestripTileWorkerResponse,
} from './timestripTileProtocol'
import { drawTimestripTile } from './timestripTileDrawing'
import { drawTimeAxisViewportOverlay } from './TimeAxisLane'
import { buildTimestripLaneLayout } from './timestripLaneLayout'

const DEFAULT_MAX_TILE_COUNT = 96

export interface TimestripRendererViewport {
  scrollLeftPx: number
  zoomDenominator: number
  viewportWidthPx: number
  viewportHeightPx: number
  dpr: number
  worldStartWallClockUs: number
}

export interface TimestripRendererOptions {
  canvas: HTMLCanvasElement
  createWorker?: () => Worker | null
  requestAnimationFrame?: (callback: FrameRequestCallback) => number
  cancelAnimationFrame?: (handle: number) => void
  maxTileCount?: number
}

interface TileCacheEntry {
  tile: TimestripVisibleTile
  bitmap: CanvasImageSource & { close?: () => void }
  lastUsed: number
}

/**
 * Tiled timestrip renderer that composites cached tile bitmaps into one viewport canvas.
 */
export class TimestripTiledRenderer {
  protected readonly canvas: HTMLCanvasElement ///< Visible viewport canvas.
  protected readonly context: CanvasRenderingContext2D | null ///< Visible canvas context.
  protected readonly worker: Worker | null ///< Optional tile rendering worker.
  protected readonly requestFrame: (callback: FrameRequestCallback) => number ///< RAF scheduler.
  protected readonly cancelFrame: (handle: number) => void ///< RAF cancellation.
  protected readonly maxTileCount: number ///< Tile cache size budget.
  protected readonly cache: Map<string, TileCacheEntry> ///< Rendered tile cache.
  protected readonly pendingTiles: Set<string> ///< Tile keys already queued.
  protected viewport: TimestripRendererViewport ///< Latest viewport state.
  protected frameHandle: number | null ///< Pending RAF handle.
  protected requestId: number ///< Monotonic tile request id.
  protected disposed: boolean ///< True after disposal.
  protected cacheDpr: number ///< DPR used by current cache.
  protected cacheHeightPx: number ///< Tile height used by current cache.
  protected cacheWallClockOriginUs: number ///< Wall-clock origin used by current cache.
  protected cacheZoomDenominator: number ///< Zoom denominator used by current cache.

  /**
   * Create a tiled renderer.
   *
   * @param options - Renderer dependencies and budgets.
   */
  public constructor(options: TimestripRendererOptions) {
    this.canvas = options.canvas
    this.context = this.canvas.getContext('2d')
    this.requestFrame = options.requestAnimationFrame ?? window.requestAnimationFrame.bind(window)
    this.cancelFrame = options.cancelAnimationFrame ?? window.cancelAnimationFrame.bind(window)
    this.maxTileCount = options.maxTileCount ?? DEFAULT_MAX_TILE_COUNT
    this.cache = new Map()
    this.pendingTiles = new Set()
    this.viewport = {
      scrollLeftPx: 0,
      zoomDenominator: 1000,
      viewportWidthPx: 0,
      viewportHeightPx: 0,
      dpr: 1,
      worldStartWallClockUs: 0,
    }
    this.frameHandle = null
    this.requestId = 0
    this.disposed = false
    this.cacheDpr = 1
    this.cacheHeightPx = 0
    this.cacheWallClockOriginUs = 0
    this.cacheZoomDenominator = 1000
    this.worker = options.createWorker?.() ?? this.createDefaultWorker()
    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<TimestripTileWorkerResponse>) => {
        this.handleWorkerMessage(event.data)
      }
    }
  }

  /**
   * Update viewport state and schedule a composite pass.
   *
   * @param viewport - Next viewport state.
   */
  public setViewport(viewport: TimestripRendererViewport): void {
    if (this.disposed) {
      return
    }
    const nextViewport = normalizeViewport(viewport)
    const shouldResetCache =
      nextViewport.dpr !== this.cacheDpr ||
      nextViewport.viewportHeightPx !== this.cacheHeightPx ||
      nextViewport.worldStartWallClockUs !== this.cacheWallClockOriginUs ||
      nextViewport.zoomDenominator !== this.cacheZoomDenominator
    this.viewport = nextViewport
    this.resizeCanvas()
    if (shouldResetCache) {
      this.clearCache()
      this.pendingTiles.clear()
      this.cacheDpr = nextViewport.dpr
      this.cacheHeightPx = nextViewport.viewportHeightPx
      this.cacheWallClockOriginUs = nextViewport.worldStartWallClockUs
      this.cacheZoomDenominator = nextViewport.zoomDenominator
    }
    this.scheduleComposite()
  }

  /**
   * Dispose renderer resources.
   */
  public dispose(): void {
    this.disposed = true
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle)
      this.frameHandle = null
    }
    this.clearCache()
    this.pendingTiles.clear()
    this.worker?.terminate()
  }

  /**
   * Return cached tile count, for tests and diagnostics.
   *
   * @returns Tile count.
   */
  public getCacheSize(): number {
    return this.cache.size
  }

  protected createDefaultWorker(): Worker | null {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      return null
    }
    return new Worker(new URL('./timestripTileWorker.ts', import.meta.url), { type: 'module' })
  }

  protected resizeCanvas(): void {
    const width = Math.max(1, Math.ceil(this.viewport.viewportWidthPx * this.viewport.dpr))
    const height = Math.max(1, Math.ceil(this.viewport.viewportHeightPx * this.viewport.dpr))
    if (this.canvas.width !== width) {
      this.canvas.width = width
    }
    if (this.canvas.height !== height) {
      this.canvas.height = height
    }
  }

  protected scheduleComposite(): void {
    if (this.frameHandle !== null) {
      return
    }
    this.frameHandle = this.requestFrame(() => {
      this.frameHandle = null
      this.composite()
    })
  }

  protected composite(): void {
    if (this.disposed || !this.context) {
      return
    }
    const { viewportWidthPx, viewportHeightPx, dpr, scrollLeftPx, zoomDenominator } = this.viewport
    if (viewportWidthPx <= 0 || viewportHeightPx <= 0) {
      return
    }

    const visibleTiles = calculateVisibleTimestripTiles(
      scrollLeftPx,
      zoomDenominator,
      viewportWidthPx,
      viewportHeightPx,
    )
    const now = performance.now()
    const visibleKeys = new Set(visibleTiles.map((tile) => tile.key))

    this.context.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.context.clearRect(0, 0, viewportWidthPx, viewportHeightPx)
    this.context.fillStyle = '#10141a'
    this.context.fillRect(0, 0, viewportWidthPx, viewportHeightPx)

    const scrollWorldUs = scrollLeftToWorldUs(scrollLeftPx, zoomDenominator)
    for (const tile of visibleTiles) {
      const cached = this.cache.get(tile.key)
      if (!cached) {
        this.enqueueTile(tile)
        continue
      }
      cached.lastUsed = now
      const screenX = (tile.worldLeftUs - scrollWorldUs) / zoomDenominator
      const screenWidth = tile.worldWidthUs / zoomDenominator
      this.context.drawImage(
        cached.bitmap,
        screenX - tile.bleedPx,
        0,
        screenWidth + tile.bleedPx * 2,
        viewportHeightPx,
      )
    }

    drawTimeAxisViewportOverlay(
      this.context,
      viewportWidthPx,
      zoomDenominator,
      scrollLeftPx,
      buildTimestripLaneLayout(viewportHeightPx),
      this.viewport.worldStartWallClockUs,
    )

    this.evictTiles(visibleKeys)
  }

  protected enqueueTile(tile: TimestripVisibleTile): void {
    if (this.pendingTiles.has(tile.key) || this.cache.has(tile.key)) {
      return
    }
    this.pendingTiles.add(tile.key)
    const request: TimestripTileWorkerRequest = {
      type: 'renderTile',
      requestId: ++this.requestId,
      tile,
      dpr: this.viewport.dpr,
      worldStartWallClockUs: this.viewport.worldStartWallClockUs,
    }
    if (this.worker) {
      this.worker.postMessage(request)
      return
    }
    const bitmap = this.renderFallbackTile(tile, this.viewport.dpr)
    this.storeTile(tile, bitmap)
    this.pendingTiles.delete(tile.key)
    this.scheduleComposite()
  }

  protected renderFallbackTile(
    tile: TimestripVisibleTile,
    dpr: number,
  ): CanvasImageSource & { close?: () => void } {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil((tile.widthPx + tile.bleedPx * 2) * dpr))
    canvas.height = Math.max(1, Math.ceil(tile.heightPx * dpr))
    const context = canvas.getContext('2d')
    if (context) {
      drawTimestripTile(context, tile, dpr, this.viewport.worldStartWallClockUs)
    }
    return canvas
  }

  protected handleWorkerMessage(message: TimestripTileWorkerResponse): void {
    if (this.disposed || message.type !== 'tileRendered') {
      message.bitmap.close()
      return
    }
    this.pendingTiles.delete(message.tileKey)
    this.storeTile(message.tile, message.bitmap)
    this.scheduleComposite()
  }

  protected storeTile(
    tile: TimestripVisibleTile,
    bitmap: CanvasImageSource & { close?: () => void },
  ): void {
    const previous = this.cache.get(tile.key)
    previous?.bitmap.close?.()
    this.cache.set(tile.key, {
      tile,
      bitmap,
      lastUsed: performance.now(),
    })
  }

  protected evictTiles(visibleKeys: Set<string>): void {
    if (this.cache.size <= this.maxTileCount) {
      return
    }
    const entries = Array.from(this.cache.entries()).sort(
      (left, right) => left[1].lastUsed - right[1].lastUsed,
    )
    for (const [key, entry] of entries) {
      if (this.cache.size <= this.maxTileCount) {
        break
      }
      if (visibleKeys.has(key)) {
        continue
      }
      entry.bitmap.close?.()
      this.cache.delete(key)
    }
  }

  protected clearCache(): void {
    for (const entry of this.cache.values()) {
      entry.bitmap.close?.()
    }
    this.cache.clear()
  }
}

/**
 * Normalize viewport values.
 *
 * @param viewport - Candidate viewport.
 * @returns Sanitized viewport.
 */
export const normalizeViewport = (viewport: TimestripRendererViewport): TimestripRendererViewport => ({
  scrollLeftPx: Math.max(0, viewport.scrollLeftPx),
  zoomDenominator: Math.max(1, viewport.zoomDenominator),
  viewportWidthPx: Math.max(0, Math.floor(viewport.viewportWidthPx)),
  viewportHeightPx: Math.max(0, Math.floor(viewport.viewportHeightPx)),
  dpr: Number.isFinite(viewport.dpr) && viewport.dpr > 0 ? viewport.dpr : 1,
  worldStartWallClockUs: Number.isFinite(viewport.worldStartWallClockUs)
    ? viewport.worldStartWallClockUs
    : 0,
})
