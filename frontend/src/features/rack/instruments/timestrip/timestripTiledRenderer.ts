import {
  calculateVisibleTimestripTiles,
  scrollLeftToWorldUs,
  TIMESTRIP_TILE_BLEED_PX,
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
  requestId: number | null
  generation: number
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
      zoomDenominator: 1000,
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
    this.cacheZoomDenominator = 1000
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
      entry.tile = null
      entry.tileKey = null
      entry.requestId = null
      entry.generation = this.generation
      this.clearTileCanvas(entry)
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
      const tileStart = entry.tile.worldLeftUs - entry.tile.bleedPx * entry.tile.zoomLevelDenominator
      const tileEnd =
        entry.tile.worldLeftUs +
        entry.tile.worldWidthUs +
        entry.tile.bleedPx * entry.tile.zoomLevelDenominator
      if (tileEnd < start || tileStart > end) {
        continue
      }
      this.pendingTiles.delete(entry.tileKey)
      entry.tile = null
      entry.tileKey = null
      entry.requestId = null
      entry.generation = this.generation
      this.clearTileCanvas(entry)
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
        requestId: null,
        generation: this.generation,
      })
    }
    while (this.pool.length > targetSize) {
      const entry = this.pool.pop()
      entry?.canvas.remove()
    }
    this.resizePoolCanvases()
  }

  protected resizePoolCanvases(): void {
    const cssWidth = TIMESTRIP_TILE_WIDTH_PX + TIMESTRIP_TILE_BLEED_PX * 2
    const cssHeight = Math.max(1, this.viewport.viewportHeightPx)
    const backingWidth = Math.max(1, Math.ceil(cssWidth * this.viewport.dpr))
    const backingHeight = Math.max(1, Math.ceil(cssHeight * this.viewport.dpr))
    for (const entry of this.pool) {
      entry.canvas.style.width = `${cssWidth}px`
      entry.canvas.style.height = `${cssHeight}px`
      if (entry.canvas.width !== backingWidth) {
        entry.canvas.width = backingWidth
      }
      if (entry.canvas.height !== backingHeight) {
        entry.canvas.height = backingHeight
      }
    }
  }

  protected resetPoolAssignments(): void {
    this.generation += 1
    this.pendingTiles.clear()
    for (const entry of this.pool) {
      entry.tile = null
      entry.tileKey = null
      entry.requestId = null
      entry.generation = this.generation
      this.clearTileCanvas(entry)
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
      if (entry.tileKey && !visibleKeys.has(entry.tileKey)) {
        entry.tile = null
        entry.tileKey = null
        entry.requestId = null
        this.clearTileCanvas(entry)
      }
    }

    for (const tile of visibleTiles) {
      let entry = this.pool.find((candidate) => candidate.tileKey === tile.key)
      if (!entry) {
        entry = this.pool.find((candidate) => candidate.tileKey === null)
      }
      if (!entry) {
        continue
      }
      if (entry.tileKey !== tile.key) {
        entry.tile = tile
        entry.tileKey = tile.key
        entry.requestId = null
        entry.generation = this.generation
        this.clearTileCanvas(entry)
        this.enqueueTile(entry, tile)
      } else {
        entry.tile = tile
      }
      this.positionTileCanvas(entry, tile)
    }
  }

  protected positionTileCanvas(entry: TilePoolEntry, tile: TimestripVisibleTile): void {
    const scrollWorldUs = scrollLeftToWorldUs(this.viewport.scrollLeftPx, this.viewport.zoomDenominator)
    const screenX = (tile.worldLeftUs - scrollWorldUs) / this.viewport.zoomDenominator
    entry.canvas.style.transform = `translate3d(${screenX - tile.bleedPx}px, 0, 0)`
  }

  protected enqueueTile(entry: TilePoolEntry, tile: TimestripVisibleTile): void {
    const requestId = ++this.requestId
    entry.requestId = requestId
    this.pendingTiles.set(tile.key, requestId)
    const digitalEntries = filterTimestripDigitalEntriesForTile(
      this.viewport.digitalEntries ?? [],
      tile.worldLeftUs - tile.bleedPx * tile.zoomLevelDenominator,
      tile.worldLeftUs + tile.worldWidthUs + tile.bleedPx * tile.zoomLevelDenominator,
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
      console.log('[timestrip] render on-screen tile canvas fallback', {
        tileKey: tile.key,
        requestId,
        generation: this.generation,
      })
      drawTimestripTile(
        entry.context,
        tile,
        this.viewport.dpr,
        this.viewport.theme ?? DEFAULT_TIMESTRIP_THEME,
        digitalEntries,
        this.viewport.worldStartWallClockUs,
      )
    }
    this.pendingTiles.delete(tile.key)
  }

  protected handleWorkerMessage(message: TimestripTileWorkerResponse): void {
    if (this.disposed || message.type !== 'tileRendered') {
      message.bitmap.close()
      return
    }
    const entry = this.pool.find((candidate) => (
      candidate.tileKey === message.tileKey &&
      candidate.requestId === message.requestId &&
      candidate.generation === message.generation
    ))
    if (!entry || !entry.context || message.generation !== this.generation) {
      message.bitmap.close()
      return
    }
    console.log('[timestrip] render on-screen tile canvas', {
      tileKey: message.tileKey,
      requestId: message.requestId,
      generation: message.generation,
    })
    entry.context.setTransform(1, 0, 0, 1, 0, 0)
    entry.context.clearRect(0, 0, entry.canvas.width, entry.canvas.height)
    entry.context.drawImage(message.bitmap, 0, 0)
    message.bitmap.close()
    this.pendingTiles.delete(message.tileKey)
    entry.requestId = null
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
  Math.max(2, Math.ceil(Math.max(0, viewportWidthPx) / TIMESTRIP_TILE_WIDTH_PX) + 2)

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
