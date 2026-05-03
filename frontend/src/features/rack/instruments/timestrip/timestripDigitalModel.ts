import type { LoggedCapturedEventType, LoggedCapturedMessage } from '../../../../lib/device'
import { getLogMessageTypeLabel } from '../../messageLogExport'
import type { TimestripThemePalette } from './timestripTheme'

export type TimestripDigitalDetailLevel = 1 | 2 | 3

export const TIMESTRIP_DIGITAL_DETAIL_BREAKPOINTS = {
  level3MaxZoomDenominator: 1_400,
  level2MaxZoomDenominator: 6_400,
} as const

export interface TimestripDigitalComponent {
  label: string
  startUs: number
  durationUs: number
  byteStart: number
  byteLength: number
}

export interface TimestripDigitalMessageEntry {
  kind: 'message'
  startWorldUs: number
  endWorldUs: number
  label: string
  pulseWidthsNs: number[]
  frameBytes: number[]
  components: TimestripDigitalComponent[]
}

export interface TimestripDigitalEventEntry {
  kind: 'event'
  worldUs: number
  eventType: LoggedCapturedEventType | null
}

export type TimestripDigitalEntry = TimestripDigitalMessageEntry | TimestripDigitalEventEntry

const PREAMBLE_PULSE_COUNT = 96
const SOP_BYTE_LENGTH = 4
const HEADER_BYTE_LENGTH = 2
const EXTENDED_HEADER_BYTE_LENGTH = 2
const CRC_BYTE_LENGTH = 4

export const resolveTimestripDigitalDetailLevel = (
  zoomDenominator: number,
): TimestripDigitalDetailLevel => {
  if (zoomDenominator <= TIMESTRIP_DIGITAL_DETAIL_BREAKPOINTS.level3MaxZoomDenominator) {
    return 3
  }
  if (zoomDenominator <= TIMESTRIP_DIGITAL_DETAIL_BREAKPOINTS.level2MaxZoomDenominator) {
    return 2
  }
  return 1
}

export const getTimestripEventColor = (
  eventType: LoggedCapturedEventType | null,
  theme: TimestripThemePalette,
): string => {
  switch (eventType) {
    case 'capture_changed':
      return theme.eventCaptureColor
    case 'cc_role_changed':
      return theme.eventRoleColor
    case 'cc_status_changed':
      return theme.eventStatusColor
    case 'mark':
      return theme.eventMarkColor
    case 'vbus_ovp':
      return theme.eventOvpColor
    case 'vbus_ocp':
      return theme.eventOcpColor
    default:
      return theme.tickColor
  }
}

export const getTimestripDigitalQueryRange = (
  scrollLeftPx: number,
  viewportWidthPx: number,
  zoomDenominator: number,
  worldStartUs: bigint,
  overscanPx: number,
): { startTimestampUs: bigint; endTimestampUs: bigint } => {
  const startWorldNs = Math.max(0, Math.floor((scrollLeftPx - overscanPx) * zoomDenominator))
  const endWorldNs = Math.max(
    startWorldNs,
    Math.ceil((scrollLeftPx + viewportWidthPx + overscanPx) * zoomDenominator),
  )
  return {
    startTimestampUs: worldStartUs + BigInt(Math.floor(startWorldNs / 1000)),
    endTimestampUs: worldStartUs + BigInt(Math.ceil(endWorldNs / 1000)),
  }
}

export const filterTimestripDigitalEntriesForTile = (
  entries: TimestripDigitalEntry[],
  tileLeftUs: number,
  tileRightUs: number,
): TimestripDigitalEntry[] => entries.filter((entry) => {
  if (entry.kind === 'event') {
    return entry.worldUs >= tileLeftUs && entry.worldUs <= tileRightUs
  }
  return entry.endWorldUs >= tileLeftUs && entry.startWorldUs <= tileRightUs
})

export const normalizeCapturedMessageForTimestrip = (
  row: LoggedCapturedMessage,
  worldStartTimestampUs: bigint,
  worldStartWallClockUs?: bigint,
): TimestripDigitalEntry | null => {
  const startWorldNs =
    worldStartWallClockUs != null && row.wallClockUs != null
      ? Number((row.wallClockUs - worldStartWallClockUs) * 1000n)
      : Number((row.startTimestampUs - worldStartTimestampUs) * 1000n)
  if (!Number.isFinite(startWorldNs)) {
    return null
  }
  if (row.entryKind === 'event') {
    return {
      kind: 'event',
      worldUs: startWorldNs,
      eventType: row.eventType,
    }
  }

  const deviceDurationNs = Number((row.endTimestampUs - row.startTimestampUs) * 1000n)
  const durationNs = Number.isFinite(deviceDurationNs) ? Math.max(1, deviceDurationNs) : 1
  const frameBytes = Array.from(row.rawSop).concat(Array.from(row.rawDecodedData))
  return {
    kind: 'message',
    startWorldUs: startWorldNs,
    endWorldUs: startWorldNs + durationNs,
    label: getLogMessageTypeLabel(row),
    pulseWidthsNs: Array.from(row.rawPulseWidths),
    frameBytes,
    components: buildTimestripDigitalComponents(row, frameBytes, durationNs),
  }
}

export const buildTimestripDigitalComponents = (
  row: LoggedCapturedMessage,
  frameBytes: number[],
  durationUs: number,
): TimestripDigitalComponent[] => {
  const preambleDurationUs =
    row.rawPulseWidths.length >= PREAMBLE_PULSE_COUNT
      ? Array.from(row.rawPulseWidths.subarray(0, PREAMBLE_PULSE_COUNT)).reduce(
          (sum, value) => sum + value,
          0,
        )
      : 0
  const remainingDurationUs = Math.max(1, durationUs - preambleDurationUs)
  const nonPreambleByteCount = Math.max(1, frameBytes.length)
  const byteDurationUs = remainingDurationUs / nonPreambleByteCount
  const components: TimestripDigitalComponent[] = []

  if (preambleDurationUs > 0) {
    components.push({
      label: 'Preamble',
      startUs: 0,
      durationUs: preambleDurationUs,
      byteStart: 0,
      byteLength: 0,
    })
  }

  const headerLength = row.messageKind === 'EXTENDED'
    ? HEADER_BYTE_LENGTH + EXTENDED_HEADER_BYTE_LENGTH
    : HEADER_BYTE_LENGTH
  const crcStart = Math.max(SOP_BYTE_LENGTH + headerLength, frameBytes.length - CRC_BYTE_LENGTH)
  const dataStart = Math.min(frameBytes.length, SOP_BYTE_LENGTH + headerLength)
  const dataLength = Math.max(0, crcStart - dataStart)
  const byteComponents = [
    { label: 'SOP', byteStart: 0, byteLength: Math.min(SOP_BYTE_LENGTH, frameBytes.length) },
    {
      label: 'Header',
      byteStart: SOP_BYTE_LENGTH,
      byteLength: Math.max(0, Math.min(headerLength, frameBytes.length - SOP_BYTE_LENGTH)),
    },
    { label: 'Data', byteStart: dataStart, byteLength: dataLength },
    {
      label: 'CRC32',
      byteStart: crcStart,
      byteLength: Math.max(0, Math.min(CRC_BYTE_LENGTH, frameBytes.length - crcStart)),
    },
  ]

  for (const component of byteComponents) {
    if (component.byteLength <= 0) {
      continue
    }
    components.push({
      ...component,
      startUs: preambleDurationUs + component.byteStart * byteDurationUs,
      durationUs: component.byteLength * byteDurationUs,
    })
  }

  return components
}
