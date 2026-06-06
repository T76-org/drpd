export const DEFAULT_TIMESTRIP_ZOOM_DENOMINATOR = 100_000_000
export const MIN_TIMESTRIP_ZOOM_DENOMINATOR = 500
export const MAX_TIMESTRIP_ZOOM_DENOMINATOR = 100_000_000
export const TIMESTRIP_ZOOM_DENOMINATOR_STORAGE_KEY = 'drpd:timestrip:zoom-denominator'
export const MAX_TIMESTRIP_DOM_TIMELINE_WIDTH_PX = 16_000_000
export const TIMESTRIP_ZOOM_DENOMINATOR_LEVELS = [
  500,
  1_000,
  2_000,
  5_000,
  10_000,
  20_000,
  50_000,
  100_000,
  200_000,
  500_000,
  1_000_000,
  2_000_000,
  5_000_000,
  10_000_000,
  20_000_000,
  50_000_000,
  100_000_000,
] as const

export type TimestripZoomDirection = 'in' | 'out'

/**
 * Clamp a user-provided timestrip zoom denominator into the supported range.
 *
 * @param value - Candidate denominator.
 * @returns Integer denominator from 500 to 100,000,000.
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
 * @returns Compact zoom label, e.g. `500ns`, `1µs`, `1ms`, or `100ms`.
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
 * Return the adjacent supported zoom denominator for a wheel direction.
 *
 * @param value - Current zoom denominator.
 * @param direction - Zoom direction.
 * @returns Next fixed zoom level.
 */
export const getNextTimestripZoomDenominator = (
  value: number,
  direction: TimestripZoomDirection,
): number => {
  const current = clampTimestripZoomDenominator(value)
  if (direction === 'in') {
    for (let index = TIMESTRIP_ZOOM_DENOMINATOR_LEVELS.length - 1; index >= 0; index -= 1) {
      const level = TIMESTRIP_ZOOM_DENOMINATOR_LEVELS[index]
      if (level < current) {
        return level
      }
    }
    return MIN_TIMESTRIP_ZOOM_DENOMINATOR
  }
  for (const level of TIMESTRIP_ZOOM_DENOMINATOR_LEVELS) {
    if (level > current) {
      return level
    }
  }
  return MAX_TIMESTRIP_ZOOM_DENOMINATOR
}

/**
 * Read the saved timestrip zoom denominator from local storage.
 *
 * @returns Stored zoom denominator, or default zoom when unavailable.
 */
export const readStoredTimestripZoomDenominator = (): number => {
  if (typeof window === 'undefined') {
    return DEFAULT_TIMESTRIP_ZOOM_DENOMINATOR
  }
  try {
    const rawValue = window.localStorage.getItem(TIMESTRIP_ZOOM_DENOMINATOR_STORAGE_KEY)
    return rawValue == null ? DEFAULT_TIMESTRIP_ZOOM_DENOMINATOR : clampTimestripZoomDenominator(rawValue)
  } catch {
    return DEFAULT_TIMESTRIP_ZOOM_DENOMINATOR
  }
}

/**
 * Persist the current timestrip zoom denominator.
 *
 * @param zoomDenominator - Zoom denominator to persist.
 */
export const writeStoredTimestripZoomDenominator = (zoomDenominator: number): void => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(TIMESTRIP_ZOOM_DENOMINATOR_STORAGE_KEY, zoomDenominator.toString())
  } catch {
    // Ignore persistence errors; zoom still updates for the current session.
  }
}

/**
 * Calculate the capped DOM width used to keep browser scroll ranges bounded.
 *
 * @param timelineWidthPx - Logical timeline width.
 * @param viewportWidthPx - Visible viewport width.
 * @returns DOM timeline width.
 */
export const calculateTimestripDomTimelineWidthPx = (
  timelineWidthPx: number,
  viewportWidthPx: number,
): number => Math.max(
  viewportWidthPx,
  Math.min(timelineWidthPx, MAX_TIMESTRIP_DOM_TIMELINE_WIDTH_PX),
)

/**
 * Calculate logical-to-DOM scroll scale for capped timeline scrolling.
 *
 * @param timelineWidthPx - Logical timeline width.
 * @param domTimelineWidthPx - Capped DOM timeline width.
 * @param viewportWidthPx - Visible viewport width.
 * @returns Logical scroll pixels per DOM scroll pixel.
 */
export const calculateTimestripScrollScale = (
  timelineWidthPx: number,
  domTimelineWidthPx: number,
  viewportWidthPx: number,
): number => {
  const logicalScrollableWidth = Math.max(0, timelineWidthPx - viewportWidthPx)
  const domScrollableWidth = Math.max(0, domTimelineWidthPx - viewportWidthPx)
  if (logicalScrollableWidth <= 0 || domScrollableWidth <= 0) {
    return 1
  }
  return logicalScrollableWidth / domScrollableWidth
}

/**
 * Convert DOM scrollLeft to logical timestrip scrollLeft.
 *
 * @param domScrollLeftPx - DOM scrollLeft.
 * @param scrollScale - Logical-to-DOM scroll scale.
 * @returns Logical scrollLeft.
 */
export const domScrollLeftToLogicalTimestripScrollLeft = (
  domScrollLeftPx: number,
  scrollScale: number,
): number => Math.max(0, domScrollLeftPx) * scrollScale

/**
 * Convert logical timestrip scrollLeft to DOM scrollLeft.
 *
 * @param logicalScrollLeftPx - Logical scrollLeft.
 * @param scrollScale - Logical-to-DOM scroll scale.
 * @returns DOM scrollLeft.
 */
export const logicalScrollLeftToDomTimestripScrollLeft = (
  logicalScrollLeftPx: number,
  scrollScale: number,
): number => Math.max(0, logicalScrollLeftPx) / scrollScale

/**
 * Clamp logical scrollLeft to timeline bounds.
 *
 * @param logicalScrollLeftPx - Candidate logical scrollLeft.
 * @param timelineWidthPx - Logical timeline width.
 * @param viewportWidthPx - Visible viewport width.
 * @returns Bounded logical scrollLeft.
 */
export const clampTimestripLogicalScrollLeft = (
  logicalScrollLeftPx: number,
  timelineWidthPx: number,
  viewportWidthPx: number,
): number => {
  const maxLogicalScrollLeft = Math.max(0, timelineWidthPx - viewportWidthPx)
  return Math.max(0, Math.min(maxLogicalScrollLeft, logicalScrollLeftPx))
}

/**
 * Convert zoom denominator into the D3 transform scale used by the zoom controller.
 *
 * @param zoomDenominator - Nanoseconds per CSS pixel.
 * @returns D3 scale factor.
 */
export const timestripZoomDenominatorToD3Scale = (zoomDenominator: number): number =>
  DEFAULT_TIMESTRIP_ZOOM_DENOMINATOR / clampTimestripZoomDenominator(zoomDenominator)

/**
 * Convert D3 transform scale into a zoom denominator.
 *
 * @param scale - D3 transform scale.
 * @returns Clamped zoom denominator.
 */
export const d3ScaleToTimestripZoomDenominator = (scale: number): number => {
  if (!Number.isFinite(scale) || scale <= 0) {
    return MAX_TIMESTRIP_ZOOM_DENOMINATOR
  }
  return clampTimestripZoomDenominator(Math.round(DEFAULT_TIMESTRIP_ZOOM_DENOMINATOR / scale))
}
