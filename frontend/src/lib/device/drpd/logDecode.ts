/**
 * @file logDecode.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Helpers for decoding logged USB-PD entries into concrete message classes.
 */

import type { LoggedCapturedMessage } from './logging'
import { Header } from './usb-pd/header'
import { parseUSBPDMessage } from './usb-pd/parser'
import type { Message } from './usb-pd/message'
import { SOP } from './usb-pd/sop'

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
    if (capturePayload) {
      message.setCapturePayload(capturePayload)
    }
    return { kind: 'message', row, message }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { kind: 'invalid', row, reason }
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
    return { kind: 'invalid', row, reason: `decodeResult=${row.decodeResult}` }
  }
  if (row.parseError) {
    return { kind: 'invalid', row, reason: row.parseError }
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
          ? { kind: 'invalid', row: candidate, reason: `decodeResult=${candidate.decodeResult}` }
          : { kind: 'invalid', row: candidate, reason: candidate.parseError ?? 'parseError' }
      }
      continue
    }

    let packet: ParsedRowPacket
    try {
      packet = parseRowPacket(candidate)
    } catch (error) {
      if (candidate === row) {
        const reason = error instanceof Error ? error.message : String(error)
        return { kind: 'invalid', row: candidate, reason }
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
