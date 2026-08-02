import type { LoggedCapturedMessage } from '../../lib/device'
import { parseLoggedEventData } from '../../lib/device/drpd/logging/eventData'

const REQUIRED_FIELDS = [
  'entryKind',
  'startTimestampUs',
  'endTimestampUs',
  'decodeResult',
  'pulseCount',
  'rawPulseWidths',
  'createdAtMs',
] as const

/**
 * Parse Message Log JSON into validated captured-message rows.
 *
 * @param payload - Raw JSON file contents.
 * @returns Validated rows ready for log-store insertion.
 */
export const parseMessageLogImportJson = (payload: string): LoggedCapturedMessage[] => {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    throw new Error('Choose a valid JSON file.')
  }

  const rows: unknown[] | null = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.capturedMessages)
      ? parsed.capturedMessages
      : null

  if (!rows) {
    throw new Error('JSON must be an array of message rows or an object with capturedMessages.')
  }
  if (rows.length === 0) {
    throw new Error('JSON file does not contain any captured messages.')
  }

  return rows.map((row, index) => normalizeCapturedMessage(row, index))
}

/**
 * Convert a logged message row into stable JSON export shape.
 *
 * @param row - Captured-message row.
 * @returns JSON-safe row.
 */
export const serializeMessageLogRow = (row: LoggedCapturedMessage): Record<string, unknown> => ({
  entryKind: row.entryKind,
  eventType: row.eventType,
  eventText: row.eventText,
  eventData: row.eventData ?? null,
  eventWallClockMs: row.eventWallClockMs,
  flagged: row.flagged === true,
  comment: row.comment ?? null,
  commentCreatedAtMs: row.commentCreatedAtMs ?? null,
  wallClockUs: row.wallClockUs?.toString() ?? null,
  startTimestampUs: row.startTimestampUs.toString(),
  endTimestampUs: row.endTimestampUs.toString(),
  displayTimestampUs: row.displayTimestampUs?.toString() ?? null,
  decodeResult: row.decodeResult,
  sopKind: row.sopKind,
  messageKind: row.messageKind,
  messageType: row.messageType,
  messageId: row.messageId,
  senderPowerRole: row.senderPowerRole,
  senderDataRole: row.senderDataRole,
  pulseCount: row.pulseCount,
  rawPulseWidths: Array.from(row.rawPulseWidths),
  rawSopHex: bytesToHex(row.rawSop),
  rawDecodedDataHex: bytesToHex(row.rawDecodedData),
  parseError: row.parseError,
  createdAtMs: row.createdAtMs,
})

const normalizeCapturedMessage = (value: unknown, index: number): LoggedCapturedMessage => {
  const label = `row ${index + 1}`
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`)
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in value)) {
      throw new Error(`${label} is missing ${field}.`)
    }
  }

  const entryKind = readString(value.entryKind, `${label}.entryKind`)
  if (entryKind !== 'message' && entryKind !== 'event') {
    throw new Error(`${label}.entryKind must be "message" or "event".`)
  }
  const eventType =
    readNullableString(value.eventType, `${label}.eventType`) as LoggedCapturedMessage['eventType']
  const isAnnotatable = entryKind === 'message' || eventType === 'mark'

  return {
    entryKind,
    eventType,
    eventText: readNullableString(value.eventText, `${label}.eventText`),
    eventData: entryKind === 'event'
      ? parseLoggedEventData(value.eventData, `${label}.eventData`)
      : null,
    eventWallClockMs: readNullableNumber(value.eventWallClockMs, `${label}.eventWallClockMs`),
    flagged: isAnnotatable && readOptionalBoolean(value.flagged, `${label}.flagged`),
    comment: isAnnotatable
      ? readNullableString(value.comment, `${label}.comment`)
      : null,
    commentCreatedAtMs: isAnnotatable
      ? readNullableNumber(value.commentCreatedAtMs, `${label}.commentCreatedAtMs`)
      : null,
    wallClockUs: readNullableBigInt(value.wallClockUs, `${label}.wallClockUs`),
    startTimestampUs: readBigInt(value.startTimestampUs, `${label}.startTimestampUs`),
    endTimestampUs: readBigInt(value.endTimestampUs, `${label}.endTimestampUs`),
    displayTimestampUs: readNullableBigInt(value.displayTimestampUs, `${label}.displayTimestampUs`),
    decodeResult: readNumber(value.decodeResult, `${label}.decodeResult`),
    sopKind: readNullableString(value.sopKind, `${label}.sopKind`),
    messageKind: readNullableString(value.messageKind, `${label}.messageKind`),
    messageType: readNullableNumber(value.messageType, `${label}.messageType`),
    messageId: readNullableNumber(value.messageId, `${label}.messageId`),
    senderPowerRole: readNullableString(value.senderPowerRole, `${label}.senderPowerRole`),
    senderDataRole: readNullableString(value.senderDataRole, `${label}.senderDataRole`),
    pulseCount: readNumber(value.pulseCount, `${label}.pulseCount`),
    rawPulseWidths: readPulseWidths(value.rawPulseWidths, `${label}.rawPulseWidths`),
    rawSop: readBytes(value.rawSopHex ?? value.rawSop, `${label}.rawSopHex`),
    rawDecodedData: readBytes(
      value.rawDecodedDataHex ?? value.rawDecodedData,
      `${label}.rawDecodedDataHex`,
    ),
    parseError: readNullableString(value.parseError, `${label}.parseError`),
    createdAtMs: readNumber(value.createdAtMs, `${label}.createdAtMs`),
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const readString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`)
  }
  return value
}

const readOptionalBoolean = (value: unknown, label: string): boolean => {
  if (value == null) {
    return false
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`)
  }
  return value
}

const readNullableString = (value: unknown, label: string): string | null => {
  if (value == null) {
    return null
  }
  return readString(value, label)
}

const readNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`)
  }
  return value
}

const readNullableNumber = (value: unknown, label: string): number | null => {
  if (value == null) {
    return null
  }
  return readNumber(value, label)
}

const readBigInt = (value: unknown, label: string): bigint => {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value)
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value)
  }
  throw new Error(`${label} must be an unsigned integer string.`)
}

const readNullableBigInt = (value: unknown, label: string): bigint | null => {
  if (value == null) {
    return null
  }
  return readBigInt(value, label)
}

const readPulseWidths = (value: unknown, label: string): Float64Array => {
  if (Array.isArray(value)) {
    return Float64Array.from(value.map((entry, index) => readNumber(entry, `${label}[${index}]`)))
  }
  if (isRecord(value)) {
    return Float64Array.from(readNumericRecord(value, label, readNumber))
  }
  throw new Error(`${label} must be an array.`)
}

const readBytes = (value: unknown, label: string): Uint8Array => {
  if (typeof value === 'string') {
    return hexToBytes(value, label)
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value.map((entry, index) => readByte(entry, `${label}[${index}]`)))
  }
  if (isRecord(value)) {
    return Uint8Array.from(readNumericRecord(value, label, readByte))
  }
  throw new Error(`${label} must be a hex string or byte array.`)
}

const readNumericRecord = <T>(
  value: Record<string, unknown>,
  label: string,
  reader: (entry: unknown, entryLabel: string) => T,
): T[] =>
  Object.keys(value)
    .map((key) => Number(key))
    .filter(Number.isInteger)
    .sort((left, right) => left - right)
    .map((key) => reader(value[String(key)], `${label}.${key}`))

const readByte = (value: unknown, label: string): number => {
  const byte = readNumber(value, label)
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
    throw new Error(`${label} must be a byte value.`)
  }
  return byte
}

const hexToBytes = (value: string, label: string): Uint8Array => {
  if (value.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(value)) {
    throw new Error(`${label} must be valid hexadecimal.`)
  }
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16)
  }
  return bytes
}

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
