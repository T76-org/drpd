import { Header } from './header'
import {
  CONTROL_MESSAGE_TYPES,
  DATA_MESSAGE_TYPES,
  EXTENDED_MESSAGE_TYPES,
  Message,
  type MessageClass,
  type MessageTypeMapping,
  ReservedControlMessage,
  ReservedDataMessage,
  ReservedExtendedMessage,
} from './message'
import { SOP } from './sop'
import type { MessageKind } from './types'

const SOP_LENGTH = 4

/**
 * Optional capture metadata carried alongside a decoded USB-PD message.
 */
export interface USBPDCaptureMetadata {
  ///< Capture start timestamp in microseconds.
  startTimestampUs?: bigint
  ///< Capture end timestamp in microseconds.
  endTimestampUs?: bigint
}

/**
 * Resolve a message class and type name from a mapping.
 *
 * @param mapping - Message type mapping for the message kind.
 * @param messageTypeNumber - Message type number from the header.
 * @param fallbackClass - Fallback class for reserved/unknown types.
 * @returns Resolved message class and type name.
 */
export const resolveMessageType = (
  mapping: Record<number, MessageTypeMapping>,
  messageTypeNumber: number,
  fallbackClass: MessageClass,
): MessageTypeMapping => {
  if (mapping[messageTypeNumber]) {
    return mapping[messageTypeNumber]
  }
  return {
    name: 'Reserved',
    messageClass: fallbackClass,
  }
}

/**
 * Parse a USB-PD payload into a message instance.
 *
 * @param decodedData - Raw decoded payload (SOP bytes + headers + payload + CRC).
 * @param pulseWidthsNs - Optional pulse widths in nanoseconds.
 * @param captureMetadata - Optional capture timestamps in microseconds.
 * @returns Parsed USB-PD message.
 */
export const parseUSBPDMessage = (
  decodedData: Uint8Array,
  pulseWidthsNs?: Float64Array,
  captureMetadata?: USBPDCaptureMetadata,
): Message => {
  if (decodedData.length < SOP_LENGTH + 2) {
    throw new Error(`USB-PD payload too short: ${decodedData.length}`)
  }
  const sopBytes = decodedData.subarray(0, SOP_LENGTH)
  const sop = new SOP(sopBytes)
  const header = new Header(decodedData, sop)
  const messageKind: MessageKind = header.messageHeader.messageKind
  const messageTypeNumber = header.messageHeader.messageTypeNumber

  if (messageKind === 'CONTROL') {
    const { name, messageClass } = resolveMessageType(
      CONTROL_MESSAGE_TYPES,
      messageTypeNumber,
      ReservedControlMessage,
    )
    const message = new messageClass(sop, header, decodedData, name)
    message.setPulseWidthsNs(pulseWidthsNs)
    message.setCaptureTimestamps(captureMetadata?.startTimestampUs, captureMetadata?.endTimestampUs)
    return message
  }

  if (messageKind === 'DATA') {
    const { name, messageClass } = resolveMessageType(
      DATA_MESSAGE_TYPES,
      messageTypeNumber,
      ReservedDataMessage,
    )
    const message = new messageClass(sop, header, decodedData, name)
    message.setPulseWidthsNs(pulseWidthsNs)
    message.setCaptureTimestamps(captureMetadata?.startTimestampUs, captureMetadata?.endTimestampUs)
    return message
  }

  const { name, messageClass } = resolveMessageType(
    EXTENDED_MESSAGE_TYPES,
    messageTypeNumber,
    ReservedExtendedMessage,
  )
  const message = new messageClass(sop, header, decodedData, name)
  message.setPulseWidthsNs(pulseWidthsNs)
  message.setCaptureTimestamps(captureMetadata?.startTimestampUs, captureMetadata?.endTimestampUs)
  return message
}
