const MIN_TIMESTRIP_ZOOM_DENOMINATOR = 500
const MAX_TIMESTRIP_ZOOM_DENOMINATOR = 1_000_000
export const TIMESTRIP_TILE_WIDTH_PX = 512
export const TIMESTRIP_TILE_OVERSCAN = 1

/**
 * Clamp a user-provided timestrip zoom denominator into the supported range.
 *
 * @param value - Candidate denominator.
 * @returns Integer denominator from 500 to 1,000,000.
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

const formatCompactDecimal = (value: number): string => {
  if (Number.isInteger(value)) {
    return value.toString()
  }
  return value.toFixed(3).replace(/\.?0+$/, '')
}

/**
 * Format the current zoom denominator as time per CSS pixel.
 *
 * @param value - Nanoseconds-per-CSS-pixel denominator.
 * @returns Compact zoom label, e.g. `500ns`, `1µs`, or `1ms`.
 */
export const formatTimestripZoomDenominator = (value: number | string): string => {
  const denominator = clampTimestripZoomDenominator(value)
  if (denominator < 1000) {
    return `${denominator}ns`
  }
  if (denominator < 1_000_000) {
    return `${formatCompactDecimal(denominator / 1000)}µs`
  }
  return `${formatCompactDecimal(denominator / 1_000_000)}ms`
}

/**
 * Calculate the timeline container width for a capture duration and zoom level.
 *
 * @param durationNs - Timeline duration in nanoseconds.
 * @param zoomDenominator - Nanoseconds represented by one CSS pixel.
 * @param viewportWidthPx - Current visible viewport width in CSS pixels.
 * @returns Timeline width in CSS pixels.
 */
export const calculateTimestripWidthPx = (
  durationNs: bigint,
  zoomDenominator: number,
  viewportWidthPx: number,
): number => {
  const normalizedZoom = clampTimestripZoomDenominator(zoomDenominator)
  const normalizedViewportWidth = Math.max(0, Math.floor(viewportWidthPx))
  const duration = durationNs > 0n ? durationNs : 0n
  const zoom = BigInt(normalizedZoom)
  const timelineWidth = Number((duration + zoom - 1n) / zoom)
  return Math.max(normalizedViewportWidth, timelineWidth)
}

export interface TimestripZoomLevel {
  ///< Stable LOD identifier used in tile cache keys.
  zoomLevel: string
  ///< Quantized nanoseconds-per-CSS-pixel denominator for this LOD.
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
  ///< LOD denominator in nanoseconds per CSS pixel.
  zoomLevelDenominator: number
  ///< Tile left edge in world nanoseconds.
  worldLeftUs: number
  ///< Tile width in world nanoseconds.
  worldWidthUs: number
  ///< Tile width in CSS pixels at its own LOD.
  widthPx: number
  ///< Tile height in CSS pixels.
  heightPx: number
  ///< Extra horizontal render area on both sides in CSS pixels. Visible DOM tiles use 0.
  bleedPx: number
}

/**
 * Return the exact render zoom level for a zoom denominator.
 *
 * @param zoomDenominator - Current nanoseconds-per-CSS-pixel denominator.
 * @returns Exact zoom level.
 */
export const resolveTimestripZoomLevel = (zoomDenominator: number): TimestripZoomLevel => {
  const denominator = clampTimestripZoomDenominator(zoomDenominator)
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
 * Convert a viewport scroll position into world nanoseconds.
 *
 * @param scrollLeftPx - Viewport scrollLeft in CSS pixels.
 * @param zoomDenominator - Current nanoseconds-per-CSS-pixel denominator.
 * @returns World X position in nanoseconds.
 */
export const scrollLeftToWorldUs = (scrollLeftPx: number, zoomDenominator: number): number =>
  Math.max(0, scrollLeftPx) * clampTimestripZoomDenominator(zoomDenominator)

/**
 * Calculate visible full-height timestrip tiles.
 *
 * @param scrollLeftPx - Viewport scrollLeft in CSS pixels.
 * @param zoomDenominator - Current nanoseconds-per-CSS-pixel denominator.
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
      bleedPx: 0,
    })
  }
  return tiles
}
