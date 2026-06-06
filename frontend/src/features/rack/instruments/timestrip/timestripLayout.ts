import { scrollLeftPxToWorldNs } from './timestripCoordinates'
export {
  clampTimestripZoomDenominator,
  formatTimestripZoomDenominator,
} from './timestripZoom'
import { clampTimestripZoomDenominator } from './timestripZoom'

export const TIMESTRIP_TILE_WIDTH_PX = 512
export const TIMESTRIP_TILE_OVERSCAN = 1

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
  worldLeftNs: number
  ///< Tile width in world nanoseconds.
  worldWidthNs: number
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
export const scrollLeftToWorldNs = (scrollLeftPx: number, zoomDenominator: number): number =>
  scrollLeftPxToWorldNs(scrollLeftPx, zoomDenominator)

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
  const tileWorldWidthNs = TIMESTRIP_TILE_WIDTH_PX * zoomLevel.denominator
  const visibleWorldStartNs = scrollLeftToWorldNs(scrollLeftPx, zoomDenominator)
  const visibleWorldEndNs = visibleWorldStartNs + viewportWidth * zoomDenominator
  const firstTileX = Math.max(
    0,
    Math.floor(visibleWorldStartNs / tileWorldWidthNs) - Math.max(0, overscanTiles),
  )
  const lastTileX = Math.max(
    firstTileX,
    Math.floor(Math.max(0, visibleWorldEndNs - 1) / tileWorldWidthNs) + Math.max(0, overscanTiles),
  )
  const tiles: TimestripVisibleTile[] = []
  for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
    tiles.push({
      key: buildTimestripTileKey(zoomLevel.zoomLevel, tileX, 0),
      tileX,
      tileY: 0,
      zoomLevel: zoomLevel.zoomLevel,
      zoomLevelDenominator: zoomLevel.denominator,
      worldLeftNs: tileX * tileWorldWidthNs,
      worldWidthNs: tileWorldWidthNs,
      widthPx: TIMESTRIP_TILE_WIDTH_PX,
      heightPx: viewportHeight,
      bleedPx: 0,
    })
  }
  return tiles
}
