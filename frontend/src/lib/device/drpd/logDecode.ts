/**
 * @file logDecode.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Helpers for decoding logged USB-PD entries into concrete message classes.
 */

import type { LoggedCapturedMessage } from './logging'
import { parseUSBPDMessage } from './usb-pd/parser'
import type { Message } from './usb-pd/message'

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
  if (row.entryKind === 'event') {
    return { kind: 'event', row }
  }
  if (row.decodeResult !== 0) {
    return { kind: 'invalid', row, reason: `decodeResult=${row.decodeResult}` }
  }
  if (row.parseError) {
    return { kind: 'invalid', row, reason: row.parseError }
  }
  const payload = new Uint8Array(row.rawSop.length + row.rawDecodedData.length)
  payload.set(row.rawSop, 0)
  payload.set(row.rawDecodedData, row.rawSop.length)
  try {
    const message = parseUSBPDMessage(payload, row.rawPulseWidths)
    return { kind: 'message', row, message }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { kind: 'invalid', row, reason }
  }
}
