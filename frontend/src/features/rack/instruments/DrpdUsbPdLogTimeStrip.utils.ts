import type {
  MessageLogPulseSegment,
  MessageLogTimeAnchor,
} from '../../../lib/device'
import { DRPD_USB_PD_LOG_CONFIG } from './DrpdUsbPdLogTimeStrip.config'

export const DEFAULT_WINDOW_US = DRPD_USB_PD_LOG_CONFIG.window.defaultWindowUs
export const MIN_WINDOW_US = DRPD_USB_PD_LOG_CONFIG.window.minWindowUs
export const MAX_WINDOW_US = DRPD_USB_PD_LOG_CONFIG.window.maxWindowUs
export const ZOOM_FACTOR = DRPD_USB_PD_LOG_CONFIG.window.zoomFactor
export const TIME_STRIP_HEIGHT_PX = DRPD_USB_PD_LOG_CONFIG.stripLayout.totalHeightPx
export const AXIS_HEIGHT_PX = DRPD_USB_PD_LOG_CONFIG.stripLayout.axisHeightPx
export const PULSE_HEIGHT_PX = DRPD_USB_PD_LOG_CONFIG.stripLayout.pulseHeightPx
export const ANALOG_HEIGHT_PX = DRPD_USB_PD_LOG_CONFIG.stripLayout.analogHeightPx

/**
 * Selection key metadata for message rows.
 */
export interface ParsedMessageSelectionKey {
  startTimestampUs: bigint
  endTimestampUs: bigint
  createdAtMs: number
}

/**
 * Parse a message-row selection key.
 *
 * @param selectionKey - Stable log row key.
 * @returns Parsed message metadata, or null for non-message keys.
 */
export const parseMessageSelectionKey = (
  selectionKey: string,
): ParsedMessageSelectionKey | null => {
  const match = /^message:(\d+):(\d+):(\d+)$/.exec(selectionKey)
  if (!match) {
    return null
  }
  return {
    startTimestampUs: BigInt(match[1]),
    endTimestampUs: BigInt(match[2]),
    createdAtMs: Number(match[3]),
  }
}

/**
 * Clamp a visible time window to the available timeline.
 *
 * @param startUs - Desired window start.
 * @param durationUs - Desired window duration.
 * @param earliestUs - Earliest available timestamp.
 * @param latestUs - Latest available timestamp.
 * @returns Clamped window start.
 */
export const clampWindowStartUs = (
  startUs: bigint,
  durationUs: bigint,
  earliestUs: bigint | null,
  latestUs: bigint | null,
): bigint => {
  if (earliestUs === null || latestUs === null) {
    return startUs
  }
  const maximumStartUs =
    latestUs > durationUs ? latestUs - durationUs : earliestUs
  if (startUs < earliestUs) {
    return earliestUs
  }
  if (startUs > maximumStartUs) {
    return maximumStartUs
  }
  return startUs
}

/**
 * Zoom a time window around its center.
 *
 * @param durationUs - Current duration.
 * @param direction - `in` or `out`.
 * @returns New bounded duration.
 */
export const zoomWindowDurationUs = (
  durationUs: bigint,
  direction: 'in' | 'out',
): bigint => {
  const nextDurationUs =
    direction === 'in' ? durationUs / ZOOM_FACTOR : durationUs * ZOOM_FACTOR
  if (nextDurationUs < MIN_WINDOW_US) {
    return MIN_WINDOW_US
  }
  if (nextDurationUs > MAX_WINDOW_US) {
    return MAX_WINDOW_US
  }
  return nextDurationUs
}

/**
 * Center the window around the given absolute timestamp span.
 *
 * @param startTimestampUs - Span start.
 * @param endTimestampUs - Span end.
 * @param durationUs - Window duration.
 * @returns Window start.
 */
export const centerWindowOnSpanUs = (
  startTimestampUs: bigint,
  endTimestampUs: bigint,
  durationUs: bigint,
): bigint => {
  const centerUs = startTimestampUs + (endTimestampUs - startTimestampUs) / 2n
  return centerUs - durationUs / 2n
}

/**
 * Format one absolute device timestamp label.
 *
 * @param valueUs - Device timestamp in microseconds.
 * @returns Axis label.
 */
export const formatDeviceTimestampUs = (valueUs: bigint | null): string => {
  if (valueUs === null) {
    return '--'
  }
  return valueUs.toString()
}

/**
 * Format one wall-clock label.
 *
 * @param wallClockMs - Host timestamp.
 * @returns Formatted label.
 */
export const formatWallClock = (wallClockMs: number | null): string => {
  if (wallClockMs === null || !Number.isFinite(wallClockMs)) {
    return '--'
  }
  const date = new Date(wallClockMs)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  const milliseconds = date.getMilliseconds().toString().padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${milliseconds}`
}

/**
 * Interpolate a display-timeline timestamp for a device timestamp.
 *
 * @param timestampUs - Absolute device timestamp.
 * @param anchors - Available host/device anchors.
 * @returns Display timestamp, if inferable.
 */
export const interpolateDisplayTimestampUs = (
  timestampUs: bigint,
  anchors: MessageLogTimeAnchor[],
): bigint | null => {
  const displayAnchors = anchors.filter((anchor) => anchor.displayTimestampUs !== null)
  if (displayAnchors.length === 0) {
    return null
  }
  if (displayAnchors.length === 1) {
    return displayAnchors[0].displayTimestampUs === null
      ? null
      : displayAnchors[0].displayTimestampUs + (timestampUs - displayAnchors[0].timestampUs)
  }
  let previous = displayAnchors[0]
  let next = displayAnchors[displayAnchors.length - 1]
  for (const anchor of displayAnchors) {
    if (anchor.timestampUs <= timestampUs) {
      previous = anchor
    }
    if (anchor.timestampUs >= timestampUs) {
      next = anchor
      break
    }
  }
  if (previous.displayTimestampUs === null || next.displayTimestampUs === null) {
    return null
  }
  if (previous.timestampUs === next.timestampUs) {
    return previous.displayTimestampUs
  }
  const domainSpan = Number(next.timestampUs - previous.timestampUs)
  if (!Number.isFinite(domainSpan) || domainSpan === 0) {
    return previous.displayTimestampUs
  }
  const rangeSpan = Number(next.displayTimestampUs - previous.displayTimestampUs)
  const offset = Number(timestampUs - previous.timestampUs)
  return previous.displayTimestampUs + BigInt(Math.round((offset / domainSpan) * rangeSpan))
}

/**
 * Interpolate a host wall-clock timestamp for a device timestamp.
 *
 * @param timestampUs - Absolute device timestamp.
 * @param anchors - Host/device anchors.
 * @returns Host wall-clock timestamp in milliseconds, if inferable.
 */
export const interpolateWallClockMs = (
  timestampUs: bigint,
  anchors: MessageLogTimeAnchor[],
): number | null => {
  const hostAnchors = anchors.filter((anchor) => anchor.wallClockMs !== null)
  if (hostAnchors.length === 0) {
    return null
  }
  if (hostAnchors.length === 1) {
    return hostAnchors[0].wallClockMs
  }
  let previous = hostAnchors[0]
  let next = hostAnchors[hostAnchors.length - 1]
  for (const anchor of hostAnchors) {
    if (anchor.timestampUs <= timestampUs) {
      previous = anchor
    }
    if (anchor.timestampUs >= timestampUs) {
      next = anchor
      break
    }
  }
  if (previous.wallClockMs === null || next.wallClockMs === null) {
    return null
  }
  if (previous.timestampUs === next.timestampUs) {
    return previous.wallClockMs
  }
  const domainSpan = Number(next.timestampUs - previous.timestampUs)
  if (!Number.isFinite(domainSpan) || domainSpan === 0) {
    return previous.wallClockMs
  }
  const rangeSpan = next.wallClockMs - previous.wallClockMs
  const offset = Number(timestampUs - previous.timestampUs)
  return previous.wallClockMs + (offset / domainSpan) * rangeSpan
}

/**
 * Return the selected pulse segment, when exactly one row is selected.
 *
 * @param pulses - Visible pulse segments.
 * @param selectedKey - Selected message key.
 * @returns Matching visible pulse segment.
 */
export const findSelectedPulseSegment = (
  pulses: MessageLogPulseSegment[],
  selectedKey: string | null,
): MessageLogPulseSegment | null => {
  if (!selectedKey) {
    return null
  }
  return pulses.find((pulse) => pulse.selectionKey === selectedKey) ?? null
}
