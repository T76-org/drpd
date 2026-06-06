import { scrollLeftPxToWorldNs } from './timestripCoordinates'
export {
  clampTimestripZoomDenominator,
  formatTimestripZoomDenominator,
} from './timestripZoom'
import { clampTimestripZoomDenominator } from './timestripZoom'

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


/**
 * Convert a viewport scroll position into world nanoseconds.
 *
 * @param scrollLeftPx - Viewport scrollLeft in CSS pixels.
 * @param zoomDenominator - Current nanoseconds-per-CSS-pixel denominator.
 * @returns World X position in nanoseconds.
 */
export const scrollLeftToWorldNs = (scrollLeftPx: number, zoomDenominator: number): number =>
  scrollLeftPxToWorldNs(scrollLeftPx, zoomDenominator)
