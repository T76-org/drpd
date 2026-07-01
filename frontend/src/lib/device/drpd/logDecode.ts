/**
 * @file logDecode.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Helpers for decoding logged USB-PD entries into concrete message classes.
 */

import type { LoggedCapturedMessage } from './logging'
import { Header } from './usb-pd/header'
import { HumanReadableField, type HumanReadableMetadataRoot } from './usb-pd/humanReadableField'
import { parseUSBPDMessage } from './usb-pd/parser'
import type { Message } from './usb-pd/message'
import { SOP } from './usb-pd/sop'
import { CaptureDecodeResult } from './types'

type ParsedRowPacket = {
  row: LoggedCapturedMessage
  payload: Uint8Array
  sop: SOP
  header: Header
}

type ChunkReassemblyState = {
  firstSopBytes: Uint8Array
  firstMessageHeaderBytes: Uint8Array
  firstExtendedHeaderBytes: Uint8Array
  expectedSize: number
  nextChunkNumber: number
  payloadBytes: number[]
}

const buildRowPayload = (row: LoggedCapturedMessage): Uint8Array => {
  const payload = new Uint8Array(row.rawSop.length + row.rawDecodedData.length)
  payload.set(row.rawSop, 0)
  payload.set(row.rawDecodedData, row.rawSop.length)
  return payload
}

const parseRowPacket = (row: LoggedCapturedMessage): ParsedRowPacket => {
  const payload = buildRowPayload(row)
  const sop = new SOP(payload.subarray(0, row.rawSop.length))
  const header = new Header(payload, sop)
  return { row, payload, sop, header }
}

const buildExtendedChunkKey = (packet: ParsedRowPacket): string => {
  const messageHeader = packet.header.messageHeader
  return [
    packet.sop.kind,
    messageHeader.messageTypeNumber.toString(),
    messageHeader.powerRole ?? 'null',
    messageHeader.dataRole ?? 'null',
    messageHeader.cablePlug ?? 'null',
  ].join(':')
}

const buildReassembledPayload = (
  state: ChunkReassemblyState,
): Uint8Array => {
  return Uint8Array.from([
    ...Array.from(state.firstSopBytes),
    ...Array.from(state.firstMessageHeaderBytes),
    ...Array.from(state.firstExtendedHeaderBytes),
    ...state.payloadBytes.slice(0, state.expectedSize),
  ])
}

const stripChunkedFragmentCRC = (payload: Uint8Array): Uint8Array => {
  if (payload.length < 12) {
    return Uint8Array.from(payload)
  }
  return Uint8Array.from([
    ...Array.from(payload.subarray(0, 8)),
    ...Array.from(payload.subarray(8, payload.length - 4)),
  ])
}

const formatMicroseconds = (valueUs: number | bigint): string => valueUs.toString()

const formatWallClockUs = (valueUs: bigint | null): string => {
  if (valueUs === null) {
    return 'Unavailable'
  }
  const epochMs = valueUs / 1000n
  const micros = valueUs % 1000n
  const date = new Date(Number(epochMs))
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  const milliseconds = date.getMilliseconds().toString().padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${milliseconds}${micros.toString().padStart(3, '0')}`
}

const formatKilohertz = (valueKhz: number): string => {
  if (!Number.isFinite(valueKhz)) {
    return 'Unavailable'
  }
  return `${Math.trunc(valueKhz)} kHz`
}

const computeBMCCarrierFrequencyKhz = (pulseWidthsNs: Float64Array): number => {
  if (pulseWidthsNs.length <= 96) {
    return Number.NaN
  }

  let preambleClockSeconds = 0
  let messageClockSeconds = 0
  for (let index = 0; index < pulseWidthsNs.length; index += 1) {
    const pulseLengthSeconds = pulseWidthsNs[index] / 1_000_000_000
    if (index < 96) {
      preambleClockSeconds += index % 3 === 0 ? pulseLengthSeconds * 2 : pulseLengthSeconds
      if (index === 95) {
        preambleClockSeconds /= 96
      }
      continue
    }
    messageClockSeconds += pulseLengthSeconds > (preambleClockSeconds * 2) / 3
      ? pulseLengthSeconds
      : pulseLengthSeconds * 2
  }

  messageClockSeconds /= pulseWidthsNs.length - 96
  if (!Number.isFinite(messageClockSeconds) || messageClockSeconds <= 0) {
    return Number.NaN
  }
  return (1 / messageClockSeconds) / 1000
}

const formatSOPType = (kind: SOP['kind']): string => {
  switch (kind) {
    case 'SOP':
      return 'SOP'
    case 'SOP_PRIME':
      return 'SOP\''
    case 'SOP_DOUBLE_PRIME':
      return 'SOP\'\''
    case 'SOP_DEBUG_PRIME':
      return 'SOP Debug\''
    case 'SOP_DEBUG_DOUBLE_PRIME':
      return 'SOP Debug\'\''
    case 'SOP_HARD_RESET':
      return 'Hard Reset'
    case 'SOP_CABLE_RESET':
      return 'Cable Reset'
    default:
      return 'Unknown'
  }
}

const describeDecodeResult = (decodeResult: number): string => {
  switch (decodeResult) {
    case CaptureDecodeResult.INVALID_KCODE:
      return 'Invalid K-code'
    case CaptureDecodeResult.CRC_ERROR:
      return 'Bad CRC'
    case CaptureDecodeResult.TIMEOUT_ERROR:
      return 'Timeout'
    case CaptureDecodeResult.INCOMPLETE:
      return 'Truncated or incomplete capture'
    default:
      return `decodeResult=${decodeResult}`
  }
}

const buildInvalidBaseInformation = (
  reason: string,
): HumanReadableField<'OrderedDictionary'> => HumanReadableField.orderedDictionary(
  'Base Information',
  'Container for general message identity and invalid-message diagnostic fields.',
  [
    [
      'messageType',
      HumanReadableField.string(
        'Invalid',
        'Message Type',
        'Indicates that the captured row could not be accepted as a valid USB-PD message.',
      ),
    ],
    [
      'invalidReason',
      HumanReadableField.string(
        reason,
        'Invalid Reason',
        'Reason the message was classified as invalid.',
      ),
    ],
  ],
)

const buildFallbackInvalidMetadata = (
  row: LoggedCapturedMessage,
  reason: string,
  parseFailureReason?: string,
): HumanReadableMetadataRoot => {
  const payload = buildRowPayload(row)
  const baseInformation = buildInvalidBaseInformation(reason)
  if (parseFailureReason) {
    baseInformation.setEntry(
      'parseFailure',
      HumanReadableField.string(
        parseFailureReason,
        'Best-Effort Parse Failure',
        'Parser error encountered while attempting to recover additional message fields.',
      ),
    )
  }

  const technicalData = HumanReadableField.orderedDictionary(
    'Technical Data',
    'Container for technical-level decoded values that apply broadly.',
  )
  const startTimestampUs = row.startTimestampUs
  const endTimestampUs = row.endTimestampUs
  const durationUs = endTimestampUs >= startTimestampUs ? endTimestampUs - startTimestampUs : 0n
  const timingInformation = HumanReadableField.orderedDictionary(
    'Timing Information',
    'Capture timing and pulse-derived measurements for this message.',
  )
  timingInformation.setEntry(
    'startTimestamp',
    HumanReadableField.string(formatMicroseconds(startTimestampUs), 'Device Timestamp', 'Device capture timestamp in microseconds.'),
  )
  timingInformation.setEntry(
    'wallClockTimestamp',
    HumanReadableField.string(formatWallClockUs(row.wallClockUs), 'Wall Clock Timestamp', 'Estimated host wall-clock timestamp in microseconds, synchronized from the device timestamp.'),
  )
  timingInformation.setEntry(
    'duration',
    HumanReadableField.string(formatMicroseconds(durationUs), 'Duration', 'Total message duration in microseconds.'),
  )
  timingInformation.setEntry(
    'pulseCount',
    HumanReadableField.string(row.rawPulseWidths.length.toString(), 'Pulse Count', 'Number of captured BMC pulse widths used to decode this message.'),
  )
  const bmcFrequencyKhz = computeBMCCarrierFrequencyKhz(row.rawPulseWidths)
  const bmcCarrierValid =
    Number.isFinite(bmcFrequencyKhz) &&
    bmcFrequencyKhz >= 300 * 0.9 &&
    bmcFrequencyKhz <= 300 * 1.1
  const bmcCarrier = HumanReadableField.orderedDictionary(
    'BMC Carrier',
    'Biphase Mark Coding carrier measurements derived from the pulse widths.',
  )
  bmcCarrier.setEntry('frequency', HumanReadableField.string(formatKilohertz(bmcFrequencyKhz), 'Frequency', 'Biphase Mark Coding carrier frequency in kilohertz.'))
  bmcCarrier.setEntry('valid', HumanReadableField.string(bmcCarrierValid ? 'true' : 'false', 'Valid', 'Whether the measured Biphase Mark Coding carrier frequency is within the USB-PD specification tolerance of 300 kHz +/-10%.'))
  timingInformation.setEntry('bmcCarrier', bmcCarrier)
  technicalData.setEntry('timingInformation', timingInformation)

  if (row.rawSop.length > 0) {
    const sopField = HumanReadableField.orderedDictionary(
      'SOP',
      'Start of Packet metadata derived from the ordered-set prefix.',
    )
    if (row.rawSop.length === 4) {
      const sop = new SOP(row.rawSop)
      sopField.setEntry('type', HumanReadableField.string(formatSOPType(sop.kind), 'Type', 'Decoded Start of Packet type for this message.'))
    } else {
      sopField.setEntry('type', HumanReadableField.string('Unavailable', 'Type', 'SOP type cannot be decoded unless four K-code bytes are available.'))
    }
    sopField.setEntry('kCodes', HumanReadableField.byteData(row.rawSop, 8, false, 'K-Codes', 'Raw K-code bytes that form the Start of Packet ordered set.'))
    technicalData.setEntry('sop', sopField)
  }
  technicalData.setEntry(
    'messageBytes',
    HumanReadableField.byteData(
      payload,
      8,
      false,
      'Message Bytes',
      'Raw byte sequence captured for this invalid USB-PD message.',
    ),
  )

  const headerData = HumanReadableField.orderedDictionary(
    'Header Data',
    'Container for parsed header-level fields and derived header metadata.',
  )
  headerData.setEntry(
    'headerStatus',
    HumanReadableField.string(
      payload.length >= 6 ? 'Unavailable' : 'Truncated before complete message header',
      'Header Status',
      'Explains whether header-level fields could be recovered from the captured bytes.',
    ),
  )

  return {
    baseInformation,
    technicalData,
    headerData,
    messageSpecificData: HumanReadableField.orderedDictionary(
      'Message-Specific Data',
      'Container for decoded fields specific to this concrete message type.',
    ),
  }
}

const buildInvalidMetadataFromMessage = (
  message: Message,
  reason: string,
): HumanReadableMetadataRoot => {
  const metadata = message.humanReadableMetadata
  const inferredMessageType = metadata.baseInformation.getEntry('messageType')
  metadata.baseInformation.insertEntryAt(
    0,
    'messageType',
    HumanReadableField.string(
      'Invalid',
      'Message Type',
      'Indicates that the captured row could not be accepted as a valid USB-PD message.',
    ),
  )
  metadata.baseInformation.insertEntryAt(
    1,
    'invalidReason',
    HumanReadableField.string(reason, 'Invalid Reason', 'Reason the message was classified as invalid.'),
  )
  if (inferredMessageType?.type === 'String' && typeof inferredMessageType.value === 'string') {
    metadata.baseInformation.insertEntryAt(
      2,
      'inferredMessageType',
      HumanReadableField.string(
        inferredMessageType.value,
        'Inferred Message Type',
        'Best-effort message type decoded from the captured header.',
      ),
    )
  }
  return metadata
}

const decodeInvalidCapturedMessage = (
  row: LoggedCapturedMessage,
  reason: string,
): DecodedLoggedCapturedMessage => {
  const payload = buildRowPayload(row)
  try {
    const message = parseUSBPDMessage(payload, row.rawPulseWidths, {
      startTimestampUs: row.startTimestampUs,
      endTimestampUs: row.endTimestampUs,
    })
    message.setWallClockTimestampUs(row.wallClockUs)
    return {
      kind: 'invalid',
      row,
      reason,
      message,
      metadata: buildInvalidMetadataFromMessage(message, reason),
    }
  } catch (error) {
    const parseFailureReason = error instanceof Error ? error.message : String(error)
    return {
      kind: 'invalid',
      row,
      reason,
      metadata: buildFallbackInvalidMetadata(row, reason, parseFailureReason),
    }
  }
}

const decodeParsedPacket = (
  row: LoggedCapturedMessage,
  payload: Uint8Array,
  capturePayload?: Uint8Array,
): DecodedLoggedCapturedMessage => {
  try {
    const message = parseUSBPDMessage(payload, row.rawPulseWidths, {
      startTimestampUs: row.startTimestampUs,
      endTimestampUs: row.endTimestampUs,
    })
    message.setWallClockTimestampUs(row.wallClockUs)
    if (capturePayload) {
      message.setCapturePayload(capturePayload)
    }
    return { kind: 'message', row, message }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      kind: 'invalid',
      row,
      reason,
      metadata: buildFallbackInvalidMetadata(row, reason, reason),
    }
  }
}

/**
 * Result of decoding one logged captured-message row.
 */
export type DecodedLoggedCapturedMessage =
  | {
      kind: 'event'
      row: LoggedCapturedMessage
    }
  | {
      kind: 'invalid'
      row: LoggedCapturedMessage
      reason: string
      metadata: HumanReadableMetadataRoot
      message?: Message
    }
  | {
      kind: 'message'
      row: LoggedCapturedMessage
      message: Message
    }

/**
 * Decode one logged captured-message row into a concrete USB-PD message object.
 *
 * Event rows are returned as `kind: 'event'`. Message rows with parse/decode
 * failures are returned as `kind: 'invalid'` with a reason.
 *
 * @param row - Logged row.
 * @returns Decoded result.
 */
export const decodeLoggedCapturedMessage = (
  row: LoggedCapturedMessage,
): DecodedLoggedCapturedMessage => {
  return decodeLoggedCapturedMessageWithContext(row, [row])
}

/**
 * Decode one logged captured-message row using ordered row context.
 *
 * For chunked extended messages, prior rows can be used to reassemble the
 * logical payload while still preserving the selected row's captured bytes
 * for UI-oriented CRC/message-byte display.
 *
 * @param row - Target row.
 * @param orderedRows - Ordered rows leading up to and including the target row.
 * @returns Decoded result.
 */
export const decodeLoggedCapturedMessageWithContext = (
  row: LoggedCapturedMessage,
  orderedRows: LoggedCapturedMessage[],
): DecodedLoggedCapturedMessage => {
  if (row.entryKind === 'event') {
    return { kind: 'event', row }
  }
  if (row.decodeResult !== 0) {
    return decodeInvalidCapturedMessage(row, describeDecodeResult(row.decodeResult))
  }
  if (row.parseError) {
    return decodeInvalidCapturedMessage(row, row.parseError)
  }
  const targetPayload = buildRowPayload(row)
  const reassemblyStates = new Map<string, ChunkReassemblyState>()
  for (const candidate of orderedRows) {
    if (candidate.entryKind !== 'message') {
      if (candidate === row) {
        return { kind: 'event', row: candidate }
      }
      continue
    }
    if (candidate.decodeResult !== 0 || candidate.parseError) {
      if (candidate === row) {
        return candidate.decodeResult !== 0
          ? decodeInvalidCapturedMessage(candidate, describeDecodeResult(candidate.decodeResult))
          : decodeInvalidCapturedMessage(candidate, candidate.parseError ?? 'parseError')
      }
      continue
    }

    let packet: ParsedRowPacket
    try {
      packet = parseRowPacket(candidate)
    } catch (error) {
      if (candidate === row) {
        const reason = error instanceof Error ? error.message : String(error)
        return {
          kind: 'invalid',
          row: candidate,
          reason,
          metadata: buildFallbackInvalidMetadata(candidate, reason, reason),
        }
      }
      continue
    }

    const extendedHeader = packet.header.extendedHeader
    const isChunkedExtended =
      packet.header.messageHeader.extended && extendedHeader !== null && extendedHeader.chunked
    if (!isChunkedExtended) {
      if (packet.header.messageHeader.extended && extendedHeader !== null) {
        reassemblyStates.delete(buildExtendedChunkKey(packet))
      }
      if (candidate === row) {
        return decodeParsedPacket(candidate, packet.payload)
      }
      continue
    }

    const fragmentKey = buildExtendedChunkKey(packet)
    if (extendedHeader.requestChunk) {
      if (candidate === row) {
        return decodeParsedPacket(candidate, packet.payload)
      }
      continue
    }

    const fragmentPayloadEnd = packet.payload.length >= 12
      ? packet.payload.length - 4
      : packet.payload.length
    const fragmentPayload = Array.from(packet.payload.subarray(8, fragmentPayloadEnd))
    const existingState = reassemblyStates.get(fragmentKey)

    if (extendedHeader.chunkNumber === 0) {
      reassemblyStates.set(fragmentKey, {
        firstSopBytes: Uint8Array.from(packet.payload.subarray(0, 4)),
        firstMessageHeaderBytes: Uint8Array.from(packet.payload.subarray(4, 6)),
        firstExtendedHeaderBytes: Uint8Array.from(packet.payload.subarray(6, 8)),
        expectedSize: extendedHeader.dataSize,
        nextChunkNumber: 1,
        payloadBytes: [...fragmentPayload],
      })
    } else if (
      !existingState ||
      existingState.expectedSize !== extendedHeader.dataSize ||
      existingState.nextChunkNumber !== extendedHeader.chunkNumber
    ) {
      reassemblyStates.delete(fragmentKey)
      if (candidate === row) {
        return decodeParsedPacket(candidate, packet.payload)
      }
      continue
    } else {
      existingState.payloadBytes.push(...fragmentPayload)
      existingState.nextChunkNumber += 1
    }

    const currentState = reassemblyStates.get(fragmentKey)
    if (!currentState) {
      if (candidate === row) {
        return decodeParsedPacket(candidate, stripChunkedFragmentCRC(packet.payload), targetPayload)
      }
      continue
    }

    const isComplete = currentState.payloadBytes.length >= currentState.expectedSize
    if (isComplete) {
      const reassembledPayload = buildReassembledPayload(currentState)
      reassemblyStates.delete(fragmentKey)
      if (candidate === row) {
        return decodeParsedPacket(candidate, reassembledPayload, targetPayload)
      }
      continue
    }

    if (candidate === row) {
      return decodeParsedPacket(candidate, stripChunkedFragmentCRC(packet.payload), targetPayload)
    }
  }
  return decodeParsedPacket(row, targetPayload)
}
