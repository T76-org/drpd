import {
  calculateVisibleTimestripTiles,
  scrollLeftToWorldUs,
  TIMESTRIP_TILE_WIDTH_PX,
  type TimestripVisibleTile,
} from './timestripLayout'
import {
  type TimestripTileWorkerRequest,
  type TimestripTileWorkerResponse,
} from './timestripTileProtocol'
import { drawTimestripTile } from './timestripTileDrawing'
import {
  DEFAULT_TIMESTRIP_THEME,
  getTimestripThemeCacheKey,
  type TimestripThemePalette,
} from './timestripTheme'
import {
  filterTimestripDigitalEntriesForTile,
  type TimestripDigitalEntry,
} from './timestripDigitalModel'

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
}

export interface TimestripRendererOptions {
  tileLayer: HTMLElement
  createWorker?: () => Worker | null
  requestAnimationFrame?: (callback: FrameRequestCallback) => number
  cancelAnimationFrame?: (handle: number) => void
}

interface TilePoolEntry {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D | null
  tile: TimestripVisibleTile | null
  tileKey: string | null
  pendingTile: TimestripVisibleTile | null
  pendingTileKey: string | null
  requestId: number | null
  generation: number
  readyBitmap: ImageBitmap | null
  needsRerender: boolean
}

/**
 * Tiled timestrip renderer backed by a bounded pool of DOM canvases.
 */
export class TimestripTiledRenderer {
  protected readonly tileLayer: HTMLElement ///< Sticky viewport tile layer.
  protected readonly worker: Worker | null ///< Optional tile rendering worker.
  protected readonly requestFrame: (callback: FrameRequestCallback) => number ///< RAF scheduler.
  protected readonly cancelFrame: (handle: number) => void ///< RAF cancellation.
  protected readonly pool: TilePoolEntry[] ///< Bounded visible tile canvas pool.
  protected readonly pendingTiles: Map<string, number> ///< Tile key to latest request id.
  protected viewport: TimestripRendererViewport ///< Latest viewport state.
  protected frameHandle: number | null ///< Pending RAF handle.
  protected requestId: number ///< Monotonic tile request id.
  protected generation: number ///< Increments when all tile assignments must be invalidated.
  protected disposed: boolean ///< True after disposal.
  protected cacheDpr: number ///< DPR used by current pool.
  protected cacheHeightPx: number ///< Tile height used by current pool.
  protected cacheWallClockOriginUs: number ///< Wall-clock origin used by current pool.
  protected cacheZoomDenominator: number ///< Zoom denominator used by current pool.
  protected cacheThemeKey: string ///< Theme palette identity used by current pool.
  protected cacheDigitalDataRevision: number ///< Digital data revision used by current pool.

  /**
   * Create a tiled renderer.
   *
   * @param options - Renderer dependencies.
   */
  public constructor(options: TimestripRendererOptions) {
    this.tileLayer = options.tileLayer
    this.requestFrame = options.requestAnimationFrame ?? window.requestAnimationFrame.bind(window)
    this.cancelFrame = options.cancelAnimationFrame ?? window.cancelAnimationFrame.bind(window)
    this.pool = []
    this.pendingTiles = new Map()
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
    }
    this.frameHandle = null
    this.requestId = 0
    this.generation = 0
    this.disposed = false
    this.cacheDpr = 1
    this.cacheHeightPx = 0
    this.cacheWallClockOriginUs = 0
    this.cacheZoomDenominator = 1_000_000
    this.cacheThemeKey = getTimestripThemeCacheKey(DEFAULT_TIMESTRIP_THEME)
    this.cacheDigitalDataRevision = 0
    this.worker = options.createWorker?.() ?? this.createDefaultWorker()
    if (this.worker) {
      this.worker.onmessage = (event: MessageEvent<TimestripTileWorkerResponse>) => {
        this.handleWorkerMessage(event.data)
      }
    }
  }

  /**
   * Update viewport state and schedule a render pass.
   *
   * @param viewport - Next viewport state.
   */
  public setViewport(viewport: TimestripRendererViewport): void {
    if (this.disposed) {
      return
    }
    const nextViewport = normalizeViewport(viewport)
    const currentRenderKey = this.getViewportRenderKey(this.viewport)
    const nextRenderKey = this.getViewportRenderKey(nextViewport)
    const shouldResetPool =
      nextViewport.dpr !== this.cacheDpr ||
      nextViewport.viewportHeightPx !== this.cacheHeightPx ||
      nextViewport.worldStartWallClockUs !== this.cacheWallClockOriginUs ||
      nextViewport.zoomDenominator !== this.cacheZoomDenominator ||
      getTimestripThemeCacheKey(nextViewport.theme ?? DEFAULT_TIMESTRIP_THEME) !== this.cacheThemeKey
    this.viewport = nextViewport
    this.resizeTileLayer()
    this.ensurePoolSize()
    if (shouldResetPool) {
      this.resetPoolAssignments()
      this.cacheDpr = nextViewport.dpr
      this.cacheHeightPx = nextViewport.viewportHeightPx
      this.cacheWallClockOriginUs = nextViewport.worldStartWallClockUs
      this.cacheZoomDenominator = nextViewport.zoomDenominator
      this.cacheThemeKey = getTimestripThemeCacheKey(nextViewport.theme ?? DEFAULT_TIMESTRIP_THEME)
      this.cacheDigitalDataRevision = nextViewport.digitalDataRevision ?? 0
    }
    if (shouldResetPool || nextRenderKey !== currentRenderKey) {
      this.scheduleFrame()
    }
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
    this.pendingTiles.clear()
    this.worker?.terminate()
    for (const entry of this.pool) {
      entry.readyBitmap?.close()
      entry.canvas.remove()
    }
    this.pool.length = 0
  }

  /**
   * Return pooled tile canvas count, for tests and diagnostics.
   *
   * @returns Tile canvas count.
   */
  public getPoolSize(): number {
    return this.pool.length
  }

  /**
   * Re-render all currently assigned tile canvases.
   */
  public invalidateAllTiles(): void {
    if (this.disposed) {
      return
    }
    this.generation += 1
    this.pendingTiles.clear()
    for (const entry of this.pool) {
      this.cancelPendingReplacement(entry)
      entry.generation = this.generation
      entry.needsRerender = true
    }
    this.scheduleFrame()
  }

  /**
   * Re-render assigned tile canvases that intersect a world range.
   *
   * @param startWorldUs - Inclusive world start in microseconds.
   * @param endWorldUs - Inclusive world end in microseconds.
   */
  public invalidateWorldRange(startWorldUs: number, endWorldUs: number): void {
    if (this.disposed) {
      return
    }
    const start = Math.min(startWorldUs, endWorldUs)
    const end = Math.max(startWorldUs, endWorldUs)
    this.generation += 1
    for (const entry of this.pool) {
      if (!entry.tile || !entry.tileKey) {
        continue
      }
      const tileStart = entry.tile.worldLeftUs
      const tileEnd = entry.tile.worldLeftUs + entry.tile.worldWidthUs
      if (tileEnd < start || tileStart > end) {
        continue
      }
      this.cancelPendingReplacement(entry)
      entry.generation = this.generation
      entry.needsRerender = true
    }
    this.scheduleFrame()
  }

  protected getViewportRenderKey(viewport: TimestripRendererViewport): string {
    return [
      viewport.scrollLeftPx,
      viewport.zoomDenominator,
      viewport.viewportWidthPx,
      viewport.viewportHeightPx,
      viewport.dpr,
      viewport.worldStartWallClockUs,
      getTimestripThemeCacheKey(viewport.theme ?? DEFAULT_TIMESTRIP_THEME),
    ].join('|')
  }

  protected createDefaultWorker(): Worker | null {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      return null
    }
    return new Worker(new URL('./timestripTileWorker.ts', import.meta.url), { type: 'module' })
  }

  protected resizeTileLayer(): void {
    this.tileLayer.style.width = `${this.viewport.viewportWidthPx}px`
    this.tileLayer.style.height = `${this.viewport.viewportHeightPx}px`
  }

  protected ensurePoolSize(): void {
    const targetSize = calculateTimestripTilePoolSize(this.viewport.viewportWidthPx)
    while (this.pool.length < targetSize) {
      const canvas = document.createElement('canvas')
      canvas.dataset.timestripTileCanvas = 'true'
      canvas.style.position = 'absolute'
      canvas.style.left = '0'
      canvas.style.top = '0'
      canvas.style.display = 'block'
      canvas.style.pointerEvents = 'none'
      canvas.style.willChange = 'transform'
      this.tileLayer.appendChild(canvas)
      this.pool.push({
        canvas,
        context: canvas.getContext('2d'),
        tile: null,
        tileKey: null,
        pendingTile: null,
        pendingTileKey: null,
        requestId: null,
        generation: this.generation,
        readyBitmap: null,
        needsRerender: false,
      })
    }
    while (this.pool.length > targetSize) {
      const entry = this.pool.pop()
      entry?.readyBitmap?.close()
      entry?.canvas.remove()
    }
    this.resizePoolCanvases()
  }

  protected resizePoolCanvases(): void {
    const cssWidth = TIMESTRIP_TILE_WIDTH_PX
    const cssHeight = Math.max(1, this.viewport.viewportHeightPx)
    const backingWidth = Math.max(1, Math.ceil(cssWidth * this.viewport.dpr))
    const backingHeight = Math.max(1, Math.ceil(cssHeight * this.viewport.dpr))
    for (const entry of this.pool) {
      entry.canvas.style.width = `${cssWidth}px`
      entry.canvas.style.height = `${cssHeight}px`
      if (entry.tileKey || entry.pendingTileKey || entry.readyBitmap) {
        continue
      }
      this.resizeCanvasBackingStore(entry, backingWidth, backingHeight)
    }
  }

  protected resetPoolAssignments(): void {
    this.generation += 1
    this.pendingTiles.clear()
    for (const entry of this.pool) {
      this.cancelPendingReplacement(entry)
      entry.generation = this.generation
      entry.needsRerender = true
    }
  }

  protected scheduleFrame(): void {
    if (this.frameHandle !== null) {
      return
    }
    this.frameHandle = this.requestFrame(() => {
      this.frameHandle = null
      this.renderFrame()
    })
  }

  protected renderFrame(): void {
    if (this.disposed) {
      return
    }
    const { viewportWidthPx, viewportHeightPx, scrollLeftPx, zoomDenominator } = this.viewport
    if (viewportWidthPx <= 0 || viewportHeightPx <= 0) {
      return
    }

    this.ensurePoolSize()
    const visibleTiles = calculateVisibleTimestripTiles(
      scrollLeftPx,
      zoomDenominator,
      viewportWidthPx,
      viewportHeightPx,
    )
    const visibleKeys = new Set(visibleTiles.map((tile) => tile.key))

    for (const entry of this.pool) {
      if (entry.tile) {
        this.positionTileCanvas(entry, entry.tile)
      }
      if (!entry.readyBitmap) {
        continue
      }
      if (entry.pendingTileKey && visibleKeys.has(entry.pendingTileKey)) {
        this.commitPendingTile(entry)
      } else {
        this.cancelPendingReplacement(entry)
      }
    }

    for (const tile of visibleTiles) {
      let entry = this.pool.find((candidate) => (
        candidate.tileKey === tile.key ||
        candidate.pendingTileKey === tile.key
      ))
      if (!entry) {
        entry = this.pool.find((candidate) => (
          candidate.tileKey === null &&
          candidate.pendingTileKey === null
        ))
      }
      if (!entry) {
        entry = this.pool.find((candidate) => (
          candidate.tileKey !== null &&
          !visibleKeys.has(candidate.tileKey) &&
          candidate.pendingTileKey === null
        ))
      }
      if (!entry) {
        entry = this.pool.find((candidate) => (
          candidate.pendingTileKey !== null &&
          !visibleKeys.has(candidate.pendingTileKey)
        ))
        if (entry) {
          this.cancelPendingReplacement(entry)
        }
      }
      if (!entry) {
        continue
      }
      if (entry.tileKey !== tile.key && entry.pendingTileKey !== tile.key) {
        this.enqueueTile(entry, tile)
      } else {
        if (entry.tileKey === tile.key) {
          entry.tile = tile
        } else {
          entry.pendingTile = tile
        }
        if (entry.needsRerender && entry.pendingTileKey !== tile.key) {
          this.enqueueTile(entry, tile)
        }
      }
      if (entry.tileKey === tile.key) {
        this.positionTileCanvas(entry, tile)
      } else if (!entry.tileKey && entry.pendingTileKey === tile.key) {
        this.positionTileCanvas(entry, tile)
      }
    }
  }

  protected positionTileCanvas(entry: TilePoolEntry, tile: TimestripVisibleTile): void {
    const scrollWorldUs = scrollLeftToWorldUs(this.viewport.scrollLeftPx, this.viewport.zoomDenominator)
    const screenX = (tile.worldLeftUs - scrollWorldUs) / this.viewport.zoomDenominator
    entry.canvas.style.transform = `translate3d(${screenX}px, 0, 0)`
  }

  protected enqueueTile(entry: TilePoolEntry, tile: TimestripVisibleTile): void {
    if (entry.pendingTileKey === tile.key) {
      return
    }
    this.cancelPendingReplacement(entry)
    const requestId = ++this.requestId
    entry.requestId = requestId
    entry.pendingTile = tile
    entry.pendingTileKey = tile.key
    entry.generation = this.generation
    entry.needsRerender = false
    if (!entry.tileKey) {
      this.positionTileCanvas(entry, tile)
    }
    this.pendingTiles.set(tile.key, requestId)
    const digitalEntries = filterTimestripDigitalEntriesForTile(
      this.viewport.digitalEntries ?? [],
      tile.worldLeftUs,
      tile.worldLeftUs + tile.worldWidthUs,
    )
    if (this.worker) {
      const request: TimestripTileWorkerRequest = {
        type: 'renderTile',
        requestId,
        tile,
        dpr: this.viewport.dpr,
        theme: this.viewport.theme ?? DEFAULT_TIMESTRIP_THEME,
        digitalEntries,
        generation: this.generation,
        worldStartWallClockUs: this.viewport.worldStartWallClockUs,
      }
      this.worker.postMessage(request)
      return
    }

    if (entry.context) {
      const backingWidth = Math.max(1, Math.ceil(TIMESTRIP_TILE_WIDTH_PX * this.viewport.dpr))
      const backingHeight = Math.max(1, Math.ceil(Math.max(1, this.viewport.viewportHeightPx) * this.viewport.dpr))
      this.resizeCanvasBackingStore(entry, backingWidth, backingHeight)
      drawTimestripTile(
        entry.context,
        tile,
        this.viewport.dpr,
        this.viewport.theme ?? DEFAULT_TIMESTRIP_THEME,
        digitalEntries,
        this.viewport.worldStartWallClockUs,
      )
      entry.tile = tile
      entry.tileKey = tile.key
      entry.pendingTile = null
      entry.pendingTileKey = null
      entry.requestId = null
      entry.generation = this.generation
      this.positionTileCanvas(entry, tile)
    }
    this.pendingTiles.delete(tile.key)
  }

  protected handleWorkerMessage(message: TimestripTileWorkerResponse): void {
    if (this.disposed || message.type !== 'tileRendered') {
      message.bitmap.close()
      return
    }
    const entry = this.pool.find((candidate) => (
      candidate.pendingTileKey === message.tileKey &&
      candidate.requestId === message.requestId &&
      candidate.generation === message.generation
    ))
    if (!entry || !entry.context || message.generation !== this.generation) {
      message.bitmap.close()
      return
    }
    entry.readyBitmap?.close()
    entry.readyBitmap = message.bitmap
    this.scheduleFrame()
  }

  protected commitPendingTile(entry: TilePoolEntry): void {
    if (!entry.context || !entry.readyBitmap || !entry.pendingTile || !entry.pendingTileKey) {
      return
    }
    const backingWidth = Math.max(1, Math.ceil(TIMESTRIP_TILE_WIDTH_PX * this.viewport.dpr))
    const backingHeight = Math.max(1, Math.ceil(Math.max(1, this.viewport.viewportHeightPx) * this.viewport.dpr))
    this.resizeCanvasBackingStore(entry, backingWidth, backingHeight)
    entry.context.setTransform(1, 0, 0, 1, 0, 0)
    entry.context.clearRect(0, 0, entry.canvas.width, entry.canvas.height)
    entry.context.drawImage(entry.readyBitmap, 0, 0)
    entry.readyBitmap.close()
    entry.readyBitmap = null
    this.pendingTiles.delete(entry.pendingTileKey)
    entry.tile = entry.pendingTile
    entry.tileKey = entry.pendingTileKey
    entry.pendingTile = null
    entry.pendingTileKey = null
    entry.requestId = null
    entry.generation = this.generation
    entry.needsRerender = false
    this.positionTileCanvas(entry, entry.tile)
  }

  protected cancelPendingReplacement(entry: TilePoolEntry): void {
    if (entry.pendingTileKey) {
      this.pendingTiles.delete(entry.pendingTileKey)
    }
    entry.readyBitmap?.close()
    entry.readyBitmap = null
    entry.pendingTile = null
    entry.pendingTileKey = null
    entry.requestId = null
  }

  protected resizeCanvasBackingStore(entry: TilePoolEntry, backingWidth: number, backingHeight: number): void {
    if (entry.canvas.width !== backingWidth) {
      entry.canvas.width = backingWidth
    }
    if (entry.canvas.height !== backingHeight) {
      entry.canvas.height = backingHeight
    }
  }

  protected clearTileCanvas(entry: TilePoolEntry): void {
    if (!entry.context) {
      return
    }
    entry.context.setTransform(1, 0, 0, 1, 0, 0)
    entry.context.clearRect(0, 0, entry.canvas.width, entry.canvas.height)
  }
}

/**
 * Calculate bounded tile canvas pool size.
 *
 * @param viewportWidthPx - Viewport width in CSS pixels.
 * @returns Number of tile canvases needed for visible area plus left/right spare.
 */
export const calculateTimestripTilePoolSize = (viewportWidthPx: number): number =>
  Math.max(2, Math.ceil(Math.max(0, viewportWidthPx) / TIMESTRIP_TILE_WIDTH_PX) + 3)

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
  theme: viewport.theme ?? DEFAULT_TIMESTRIP_THEME,
  digitalEntries: viewport.digitalEntries ?? [],
  digitalDataRevision: Math.max(0, Math.floor(viewport.digitalDataRevision ?? 0)),
})
