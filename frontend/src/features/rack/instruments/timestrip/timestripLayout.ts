const MIN_TIMESTRIP_ZOOM_DENOMINATOR = 1
const MAX_TIMESTRIP_ZOOM_DENOMINATOR = 1000
const TIMESTRIP_ZOOM_LEVEL_DENOMINATORS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1000] as const

export const TIMESTRIP_TILE_WIDTH_PX = 512
export const TIMESTRIP_TILE_OVERSCAN = 1

/**
 * Clamp a user-provided timestrip zoom denominator into the supported range.
 *
 * @param value - Candidate denominator.
 * @returns Integer denominator from 1 to 1000.
 */
export const clampTimestripZoomDenominator = (value: number | string): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return MAX_TIMESTRIP_ZOOM_DENOMINATOR
  }
  return Math.min(
    MAX_TIMESTRIP_ZOOM_DENOMINATOR,
    Math.max(MIN_TIMESTRIP_ZOOM_DENOMINATOR, Math.trunc(parsed)),
  )
}

/**
 * Calculate the timeline container width for a capture duration and zoom level.
 *
 * @param durationUs - Timeline duration in microseconds.
 * @param zoomDenominator - Zoom denominator where 1:N means N microseconds per CSS pixel.
 * @param viewportWidthPx - Current visible viewport width in CSS pixels.
 * @returns Timeline width in CSS pixels.
 */
export const calculateTimestripWidthPx = (
  durationUs: bigint,
  zoomDenominator: number,
  viewportWidthPx: number,
): number => {
  const normalizedZoom = clampTimestripZoomDenominator(zoomDenominator)
  const normalizedViewportWidth = Math.max(0, Math.floor(viewportWidthPx))
  const duration = durationUs > 0n ? durationUs : 0n
  const zoom = BigInt(normalizedZoom)
  const timelineWidth = Number((duration + zoom - 1n) / zoom)
  return Math.max(normalizedViewportWidth, timelineWidth)
}

export interface TimestripZoomLevel {
  ///< Stable LOD identifier used in tile cache keys.
  zoomLevel: string
  ///< Quantized microseconds-per-CSS-pixel denominator for this LOD.
  denominator: number
}

export interface TimestripVisibleTile {
  ///< Cache key in `${zoomLevel}:${tileX}:${tileY}` form.
  key: string
  ///< Horizontal tile index.
  tileX: number
  ///< Vertical tile index. Timestrip uses one full-height tile row for now.
  tileY: 0
  ///< LOD identifier.
  zoomLevel: string
  ///< LOD denominator in microseconds per CSS pixel.
  zoomLevelDenominator: number
  ///< Tile left edge in world microseconds.
  worldLeftUs: number
  ///< Tile width in world microseconds.
  worldWidthUs: number
  ///< Tile width in CSS pixels at its own LOD.
  widthPx: number
  ///< Tile height in CSS pixels.
  heightPx: number
}

/**
 * Return the nearest discrete zoom LOD for a zoom denominator.
 *
 * @param zoomDenominator - Current microseconds-per-CSS-pixel denominator.
 * @returns Quantized zoom level.
 */
export const resolveTimestripZoomLevel = (zoomDenominator: number): TimestripZoomLevel => {
  const normalized = clampTimestripZoomDenominator(zoomDenominator)
  const denominator = TIMESTRIP_ZOOM_LEVEL_DENOMINATORS.reduce((best, candidate) => {
    const bestDistance = Math.abs(Math.log2(normalized / best))
    const candidateDistance = Math.abs(Math.log2(normalized / candidate))
    return candidateDistance < bestDistance ? candidate : best
  })
  return {
    zoomLevel: `z${denominator}`,
    denominator,
  }
}

/**
 * Build a tile cache key.
 *
 * @param zoomLevel - LOD identifier.
 * @param tileX - Horizontal tile index.
 * @param tileY - Vertical tile index.
 * @returns Tile cache key.
 */
export const buildTimestripTileKey = (zoomLevel: string, tileX: number, tileY: number): string =>
  `${zoomLevel}:${tileX}:${tileY}`

/**
 * Convert a viewport scroll position into world microseconds.
 *
 * @param scrollLeftPx - Viewport scrollLeft in CSS pixels.
 * @param zoomDenominator - Current microseconds-per-CSS-pixel denominator.
 * @returns World X position in microseconds.
 */
export const scrollLeftToWorldUs = (scrollLeftPx: number, zoomDenominator: number): number =>
  Math.max(0, scrollLeftPx) * clampTimestripZoomDenominator(zoomDenominator)

/**
 * Calculate visible full-height timestrip tiles.
 *
 * @param scrollLeftPx - Viewport scrollLeft in CSS pixels.
 * @param zoomDenominator - Current microseconds-per-CSS-pixel denominator.
 * @param viewportWidthPx - Visible viewport width in CSS pixels.
 * @param viewportHeightPx - Visible viewport height in CSS pixels.
 * @param overscanTiles - Extra tiles before/after visible bounds.
 * @returns Visible tile descriptors.
 */
export const calculateVisibleTimestripTiles = (
  scrollLeftPx: number,
  zoomDenominator: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  overscanTiles = TIMESTRIP_TILE_OVERSCAN,
): TimestripVisibleTile[] => {
  const viewportWidth = Math.max(0, Math.ceil(viewportWidthPx))
  const viewportHeight = Math.max(1, Math.ceil(viewportHeightPx))
  if (viewportWidth === 0) {
    return []
  }

  const zoomLevel = resolveTimestripZoomLevel(zoomDenominator)
  const tileWorldWidthUs = TIMESTRIP_TILE_WIDTH_PX * zoomLevel.denominator
  const visibleWorldStartUs = scrollLeftToWorldUs(scrollLeftPx, zoomDenominator)
  const visibleWorldEndUs = visibleWorldStartUs + viewportWidth * zoomDenominator
  const firstTileX = Math.max(
    0,
    Math.floor(visibleWorldStartUs / tileWorldWidthUs) - Math.max(0, overscanTiles),
  )
  const lastTileX = Math.max(
    firstTileX,
    Math.floor(Math.max(0, visibleWorldEndUs - 1) / tileWorldWidthUs) + Math.max(0, overscanTiles),
  )
  const tiles: TimestripVisibleTile[] = []
  for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
    tiles.push({
      key: buildTimestripTileKey(zoomLevel.zoomLevel, tileX, 0),
      tileX,
      tileY: 0,
      zoomLevel: zoomLevel.zoomLevel,
      zoomLevelDenominator: zoomLevel.denominator,
      worldLeftUs: tileX * tileWorldWidthUs,
      worldWidthUs: tileWorldWidthUs,
      widthPx: TIMESTRIP_TILE_WIDTH_PX,
      heightPx: viewportHeight,
    })
  }
  return tiles
}
