import {
  buildCapturedLogSelectionKey,
  decodeLoggedCapturedMessage,
  type LoggedCapturedMessage,
} from '../../lib/device'
import { getExtendedMessageHeaderError, Header } from '../../lib/device/drpd/usb-pd/header'
import {
  CONTROL_MESSAGE_TYPES,
  DATA_MESSAGE_TYPES,
  EXTENDED_MESSAGE_TYPES,
} from '../../lib/device/drpd/usb-pd/message'
import { decodeSOPKind, SOP } from '../../lib/device/drpd/usb-pd/sop'
import type { SOPKind } from '../../lib/device/drpd/usb-pd/types'
import { formatWallClock } from './messageLogFormat'

const toCsvField = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value

const isResetSopKind = (kind: string | null): kind is 'SOP_HARD_RESET' | 'SOP_CABLE_RESET' =>
  kind === 'SOP_HARD_RESET' || kind === 'SOP_CABLE_RESET'

const getRowResetSopKind = (row: LoggedCapturedMessage): SOPKind | null => {
  if (row.entryKind !== 'message') {
    return null
  }
  if (isResetSopKind(row.sopKind)) {
    return row.sopKind
  }
  if (row.rawSop.length !== 4 || row.rawDecodedData.length !== 0) {
    return null
  }
  const decodedKind = decodeSOPKind(row.rawSop)
  return isResetSopKind(decodedKind) ? decodedKind : null
}

export const getLogResetSignalLabel = (row: LoggedCapturedMessage): string | null => {
  const resetKind = getRowResetSopKind(row)
  if (!resetKind) {
    return null
  }
  return resetKind === 'SOP_CABLE_RESET' ? 'Cable Reset' : 'Hard Reset'
}

export const getLogMessageTypeLabel = (row: LoggedCapturedMessage): string => {
  if (row.entryKind === 'event') {
    return row.eventType ?? 'Event'
  }
  const resetLabel = getLogResetSignalLabel(row)
  if (resetLabel) {
    return resetLabel
  }
  if (row.decodeResult !== 0 || row.parseError) {
    return 'Invalid message'
  }
  if (!row.messageKind || row.messageType == null) {
    return '--'
  }
  const mapping =
    row.messageKind === 'CONTROL'
      ? CONTROL_MESSAGE_TYPES[row.messageType]
      : row.messageKind === 'DATA'
        ? DATA_MESSAGE_TYPES[row.messageType]
        : row.messageKind === 'EXTENDED'
          ? EXTENDED_MESSAGE_TYPES[row.messageType]
          : undefined
  const inferredType = mapping?.name.replaceAll('_', ' ') ?? `${row.messageKind} ${row.messageType}`
  if (getLoggedRowStructuralError(row)) {
    return `Malformed: ${inferredType}`
  }
  return isLoggedRowChunkRequest(row) ? `Chunk request: ${inferredType}` : inferredType
}

const getLogEndpointLabels = (row: LoggedCapturedMessage): { sender: string; receiver: string } => {
  if (row.entryKind !== 'message') {
    return { sender: '', receiver: '' }
  }
  if (row.sopKind === 'SOP') {
    if (row.senderPowerRole === 'SOURCE') {
      return { sender: 'Source', receiver: 'Sink' }
    }
    if (row.senderPowerRole === 'SINK') {
      return { sender: 'Sink', receiver: 'Source' }
    }
  }
  if (
    row.sopKind === 'SOP_PRIME' ||
    row.sopKind === 'SOP_DOUBLE_PRIME' ||
    row.sopKind === 'SOP_DEBUG_PRIME' ||
    row.sopKind === 'SOP_DEBUG_DOUBLE_PRIME'
  ) {
    if (row.senderDataRole === 'CABLE_PLUG_VPD') {
      return { sender: 'Cable', receiver: 'Source' }
    }
    if (row.senderDataRole === 'UFP_DFP') {
      return { sender: 'Source', receiver: 'Cable' }
    }
  }
  return { sender: 'Unknown', receiver: 'Unknown' }
}

export const getLogSenderLabel = (row: LoggedCapturedMessage): string =>
  getLogEndpointLabels(row).sender

export const getLogReceiverLabel = (row: LoggedCapturedMessage): string =>
  getLogEndpointLabels(row).receiver

export const getLogSopLabel = (row: LoggedCapturedMessage): string => {
  if (row.entryKind !== 'message') {
    return ''
  }
  switch (row.sopKind) {
    case 'SOP':
      return 'SOP'
    case 'SOP_PRIME':
      return "SOP'"
    case 'SOP_DOUBLE_PRIME':
      return "SOP''"
    case 'SOP_DEBUG_PRIME':
      return "SOP'-D"
    case 'SOP_DEBUG_DOUBLE_PRIME':
      return "SOP''-D"
    case 'SOP_HARD_RESET':
      return 'Hard Reset'
    case 'SOP_CABLE_RESET':
      return 'Cable Reset'
    default:
      return getLogResetSignalLabel(row) ?? '--'
  }
}

export const getLogCrcLabel = (row: LoggedCapturedMessage): string => {
  if (row.entryKind !== 'message') {
    return ''
  }
  if (getLogResetSignalLabel(row)) {
    return 'N/A'
  }
  return row.decodeResult === 0 && !row.parseError && !getLoggedRowStructuralError(row)
    ? 'Valid'
    : 'Invalid'
}

const getLoggedRowStructuralError = (row: LoggedCapturedMessage): string | null => {
  try {
    const payload = new Uint8Array(row.rawSop.length + row.rawDecodedData.length)
    payload.set(row.rawSop, 0)
    payload.set(row.rawDecodedData, row.rawSop.length)
    const sop = new SOP(row.rawSop)
    const header = new Header(payload, sop)
    return getExtendedMessageHeaderError(header.extendedHeader)
  } catch {
    return null
  }
}

const isLoggedRowChunkRequest = (row: LoggedCapturedMessage): boolean => {
  try {
    const payload = new Uint8Array(row.rawSop.length + row.rawDecodedData.length)
    payload.set(row.rawSop, 0)
    payload.set(row.rawDecodedData, row.rawSop.length)
    const header = new Header(payload, new SOP(row.rawSop))
    return header.extendedHeader?.requestChunk === true
  } catch {
    return false
  }
}

const getStringMetadataValue = (value: { type: string; value: unknown } | undefined): string =>
  value?.type === 'String' && typeof value.value === 'string' ? value.value : ''

const getDecodedMessageCsvMetadata = (
  row: LoggedCapturedMessage,
): { crc32: string; summary: string } => {
  const decoded = decodeLoggedCapturedMessage(row)
  if (decoded.kind !== 'message') {
    return { crc32: '', summary: '' }
  }
  const metadata = decoded.message.humanReadableMetadata
  const crc32 = metadata.technicalData.getEntry('crc32')?.getEntry('actual')
  const summary = metadata.baseInformation.getEntry('messageSummary')
  return {
    crc32: getStringMetadataValue(crc32),
    summary: getStringMetadataValue(summary),
  }
}

export const buildSelectedMessageLogCsv = (
  rows: LoggedCapturedMessage[],
  selectionKeys: string[],
): string => {
  const selected = new Set(selectionKeys)
  const lines = [[
    'Type',
    'Wall time',
    'Length',
    'Δt',
    'ID',
    'Message type',
    'Sender',
    'Receiver',
    'SOP',
    'CRC32',
    'Valid',
    'Message Summary',
  ].join(',')]
  let previousEndTimestampUs: bigint | null = null
  for (const row of rows) {
    const isSelected = selected.has(buildCapturedLogSelectionKey(row))
    if (row.entryKind === 'event') {
      previousEndTimestampUs = null
      if (isSelected) {
        lines.push(
          [
            row.entryKind,
            formatWallClock(row.wallClockUs),
            '',
            '',
            '',
            row.eventType ?? 'Event',
            '',
            '',
            '',
            '',
            '',
            '',
          ].map(toCsvField).join(','),
        )
      }
      continue
    }
    const deltaUs = previousEndTimestampUs === null ? '' : (row.startTimestampUs - previousEndTimestampUs).toString()
    previousEndTimestampUs = row.endTimestampUs
    if (isSelected) {
      const metadata = row.decodeResult === 0 && !row.parseError
        ? getDecodedMessageCsvMetadata(row)
        : { crc32: '', summary: '' }
      const { sender, receiver } = getLogEndpointLabels(row)
      lines.push(
        [
          row.entryKind,
          formatWallClock(row.wallClockUs),
          (row.endTimestampUs - row.startTimestampUs).toString(),
          deltaUs,
          row.messageId == null ? '' : row.messageId.toString(),
          getLogMessageTypeLabel(row),
          sender,
          receiver,
          getLogSopLabel(row),
          metadata.crc32,
          getLogCrcLabel(row),
          metadata.summary,
        ].map(toCsvField).join(','),
      )
    }
  }
  return `${lines.join('\n')}\n`
}
