import type { CablePlug, DataRole, MessageHeaderFields, PowerRole } from './types'
import type { ExtendedMessageHeaderFields } from './types'
import type { MessageKind } from './types'
import { SOP } from './sop'

const SOP_LENGTH = 4
const MESSAGE_HEADER_LENGTH = 2
const EXTENDED_HEADER_LENGTH = 2

/**
 * Read a 16-bit little-endian value from a payload.
 *
 * @param payload - Payload bytes.
 * @param offset - Byte offset within the payload.
 * @returns Unsigned 16-bit integer.
 */
export const readUint16LE = (payload: Uint8Array, offset: number): number => {
  if (offset + 1 >= payload.length) {
    throw new Error(`Cannot read uint16 at offset ${offset} from payload length ${payload.length}`)
  }
  return payload[offset] | (payload[offset + 1] << 8)
}

/**
 * USB-PD message header parser.
 */
export class Header {
  ///< SOP metadata for the message.
  public readonly sop: SOP
  ///< Raw 16-bit Message Header value.
  public readonly messageHeaderRaw: number
  ///< Parsed Message Header fields.
  public readonly messageHeader: MessageHeaderFields
  ///< Raw 16-bit Extended Message Header value (null if not present).
  public readonly extendedHeaderRaw: number | null
  ///< Parsed Extended Message Header fields (null if not present).
  public readonly extendedHeader: ExtendedMessageHeaderFields | null

  /**
   * Create a Header from a payload and SOP metadata.
   *
   * @param payload - Raw decoded payload bytes (including SOP bytes).
   * @param sop - SOP metadata for the payload.
   */
  public constructor(payload: Uint8Array, sop: SOP) {
    if (payload.length < SOP_LENGTH + MESSAGE_HEADER_LENGTH) {
      throw new Error(`USB-PD payload too short for SOP + header: ${payload.length}`)
    }
    this.sop = sop
    const headerOffset = SOP_LENGTH
    const messageHeaderRaw = readUint16LE(payload, headerOffset)
    this.messageHeaderRaw = messageHeaderRaw

    const extended = ((messageHeaderRaw >> 15) & 0x1) === 1
    const numberOfDataObjects = (messageHeaderRaw >> 12) & 0x7
    const messageId = (messageHeaderRaw >> 9) & 0x7
    const roleBit = (messageHeaderRaw >> 8) & 0x1
    const specRevisionBits = (messageHeaderRaw >> 6) & 0x3
    const dataRoleBit = (messageHeaderRaw >> 5) & 0x1
    const messageTypeNumber = messageHeaderRaw & 0x1f

    let powerRole: PowerRole | null = null
    let dataRole: DataRole | null = null
    let cablePlug: CablePlug | null = null

    if (sop.kind === 'SOP') {
      powerRole = roleBit === 1 ? 'SOURCE' : 'SINK'
      dataRole = dataRoleBit === 1 ? 'DFP' : 'UFP'
    } else if (sop.kind === 'SOP_PRIME' || sop.kind === 'SOP_DOUBLE_PRIME') {
      cablePlug = roleBit === 1 ? 'CABLE_PLUG_VPD' : 'UFP_DFP'
    }

    const messageKind: MessageKind = extended
      ? 'EXTENDED'
      : numberOfDataObjects === 0
        ? 'CONTROL'
        : 'DATA'

    this.messageHeader = {
      extended,
      numberOfDataObjects,
      messageId,
      messageTypeNumber,
      messageKind,
      specRevisionBits,
      powerRole,
      dataRole,
      cablePlug,
    }

    if (extended) {
      if (payload.length < SOP_LENGTH + MESSAGE_HEADER_LENGTH + EXTENDED_HEADER_LENGTH) {
        throw new Error('USB-PD payload missing extended header')
      }
      const extendedHeaderRaw = readUint16LE(payload, headerOffset + MESSAGE_HEADER_LENGTH)
      this.extendedHeaderRaw = extendedHeaderRaw
      this.extendedHeader = {
        chunked: ((extendedHeaderRaw >> 15) & 0x1) === 1,
        chunkNumber: (extendedHeaderRaw >> 11) & 0xf,
        requestChunk: ((extendedHeaderRaw >> 10) & 0x1) === 1,
        dataSize: extendedHeaderRaw & 0x1ff,
      }
    } else {
      this.extendedHeaderRaw = null
      this.extendedHeader = null
    }
  }
}
