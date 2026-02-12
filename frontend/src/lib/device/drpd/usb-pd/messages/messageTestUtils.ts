/**
 * Shared utilities for USB-PD message tests.
 */

/**
 * Set a bitfield into a value.
 *
 * @param value - Base value.
 * @param hi - Upper bit index.
 * @param lo - Lower bit index.
 * @param field - Field value.
 * @returns Updated value with the field applied.
 */
export const setBits = (value: number, hi: number, lo: number, field: number): number => {
  const width = hi - lo + 1
  const mask = width >= 32 ? 0xffffffff : (1 << width) - 1
  return value | ((field & mask) << lo)
}

/**
 * Convert a 16-bit value to little-endian bytes.
 *
 * @param value - 16-bit value.
 * @returns Byte array.
 */
export const toBytes16 = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff]

/**
 * Convert a 32-bit value to little-endian bytes.
 *
 * @param value - 32-bit value.
 * @returns Byte array.
 */
export const toBytes32 = (value: number): number[] => [
  value & 0xff,
  (value >> 8) & 0xff,
  (value >> 16) & 0xff,
  (value >> 24) & 0xff,
]

/**
 * Build a USB-PD message header.
 *
 * @param options - Header fields.
 * @returns Encoded header value.
 */
export const makeMessageHeader = (options: {
  extended: boolean
  numberOfDataObjects: number
  messageId?: number
  roleBit?: number
  specRevisionBits?: number
  dataRoleBit?: number
  messageTypeNumber: number
}): number => {
  const {
    extended,
    numberOfDataObjects,
    messageId = 0,
    roleBit = 1,
    specRevisionBits = 0,
    dataRoleBit = 1,
    messageTypeNumber,
  } = options
  let header = 0
  header = setBits(header, 15, 15, extended ? 1 : 0)
  header = setBits(header, 14, 12, numberOfDataObjects)
  header = setBits(header, 11, 9, messageId)
  header = setBits(header, 8, 8, roleBit)
  header = setBits(header, 7, 6, specRevisionBits)
  header = setBits(header, 5, 5, dataRoleBit)
  header = setBits(header, 4, 0, messageTypeNumber)
  return header
}

/**
 * Build an extended header value.
 *
 * @param options - Extended header fields.
 * @returns Encoded extended header value.
 */
export const makeExtendedHeader = (options: {
  chunked?: boolean
  chunkNumber?: number
  requestChunk?: boolean
  dataSize: number
}): number => {
  const { chunked = false, chunkNumber = 0, requestChunk = false, dataSize } = options
  let header = 0
  header = setBits(header, 15, 15, chunked ? 1 : 0)
  header = setBits(header, 14, 11, chunkNumber)
  header = setBits(header, 10, 10, requestChunk ? 1 : 0)
  header = setBits(header, 8, 0, dataSize)
  return header
}

/**
 * Build a full USB-PD message payload.
 *
 * @param sop - SOP bytes.
 * @param messageHeader - Message header value.
 * @param payloadBytes - Payload bytes.
 * @param extendedHeader - Optional extended header value.
 * @returns Encoded message bytes.
 */
export const buildMessage = (
  sop: number[],
  messageHeader: number,
  payloadBytes: number[],
  extendedHeader?: number,
): Uint8Array => {
  const bytes = [...sop, ...toBytes16(messageHeader)]
  if (extendedHeader !== undefined) {
    bytes.push(...toBytes16(extendedHeader))
  }
  bytes.push(...payloadBytes)
  return Uint8Array.from(bytes)
}
