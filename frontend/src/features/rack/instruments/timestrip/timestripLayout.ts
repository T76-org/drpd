const MIN_TIMESTRIP_ZOOM_DENOMINATOR = 1
const MAX_TIMESTRIP_ZOOM_DENOMINATOR = 1000

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
