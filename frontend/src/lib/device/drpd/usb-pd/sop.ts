import type { SOPKind } from './types'

const kSync1 = 0x18
const kSync2 = 0x11
const kSync3 = 0x06
const kRst1 = 0x07
const kRst2 = 0x19

const SOP_SEQUENCE = [kSync1, kSync1, kSync1, kSync2]
const SOP_PRIME_SEQUENCE = [kSync1, kSync1, kSync3, kSync3]
const SOP_DOUBLE_PRIME_SEQUENCE = [kSync1, kSync3, kSync1, kSync3]
const SOP_DEBUG_PRIME_SEQUENCE = [kSync1, kRst2, kRst2, kSync3]
const SOP_DEBUG_DOUBLE_PRIME_SEQUENCE = [kSync1, kRst2, kSync3, kSync2]
const SOP_HARD_RESET_SEQUENCE = [kRst1, kRst1, kRst1, kRst2]
const SOP_CABLE_RESET_SEQUENCE = [kRst1, kSync1, kRst1, kSync3]

/**
 * Match a SOP byte sequence against a reference pattern.
 *
 * @param bytes - SOP bytes from the payload.
 * @param sequence - Expected sequence of SOP K-code bytes.
 * @returns True if the sequence matches.
 */
export const matchesSOPSequence = (bytes: Uint8Array, sequence: number[]): boolean => {
  if (bytes.length !== sequence.length) {
    return false
  }
  for (let index = 0; index < sequence.length; index += 1) {
    if (bytes[index] !== sequence[index]) {
      return false
    }
  }
  return true
}

/**
 * Decode SOP bytes into a SOP kind.
 *
 * @param bytes - SOP bytes from the payload.
 * @returns Decoded SOP kind.
 */
export const decodeSOPKind = (bytes: Uint8Array): SOPKind => {
  if (matchesSOPSequence(bytes, SOP_SEQUENCE)) {
    return 'SOP'
  }
  if (matchesSOPSequence(bytes, SOP_PRIME_SEQUENCE)) {
    return 'SOP_PRIME'
  }
  if (matchesSOPSequence(bytes, SOP_DOUBLE_PRIME_SEQUENCE)) {
    return 'SOP_DOUBLE_PRIME'
  }
  if (matchesSOPSequence(bytes, SOP_DEBUG_PRIME_SEQUENCE)) {
    return 'SOP_DEBUG_PRIME'
  }
  if (matchesSOPSequence(bytes, SOP_DEBUG_DOUBLE_PRIME_SEQUENCE)) {
    return 'SOP_DEBUG_DOUBLE_PRIME'
  }
  if (matchesSOPSequence(bytes, SOP_HARD_RESET_SEQUENCE)) {
    return 'SOP_HARD_RESET'
  }
  if (matchesSOPSequence(bytes, SOP_CABLE_RESET_SEQUENCE)) {
    return 'SOP_CABLE_RESET'
  }
  return 'UNKNOWN'
}

/**
 * SOP decoder and container for SOP K-code bytes.
 */
export class SOP {
  ///< Raw SOP bytes (length 4).
  public readonly bytes: Uint8Array
  ///< Decoded SOP kind.
  public readonly kind: SOPKind

  /**
   * Create a SOP instance from raw SOP bytes.
   *
   * @param sopBytes - Raw SOP bytes from the payload.
   */
  public constructor(sopBytes: Uint8Array) {
    if (sopBytes.length !== 4) {
      throw new Error(`SOP bytes must be length 4, received ${sopBytes.length}`)
    }
    this.bytes = Uint8Array.from(sopBytes)
    this.kind = decodeSOPKind(this.bytes)
  }
}
