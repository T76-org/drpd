import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  parseBatteryCapabilitiesDataBlock,
  type ParsedBatteryCapabilitiesDataBlock,
} from '../DataObjects'

/**
 * Battery_Capabilities extended message.
 */
export class BatteryCapabilitiesMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Parsed BCDB.
  public readonly batteryCapabilities: ParsedBatteryCapabilitiesDataBlock | null
  ///< Data size from extended header.
  public readonly dataSize: number
  ///< Chunked flag.
  public readonly chunked: boolean
  ///< Chunk number.
  public readonly chunkNumber: number
  ///< Request chunk flag.
  public readonly requestChunk: boolean
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Battery_Capabilities message.
   *
   * @param sop - SOP metadata.
   * @param header - Parsed header.
   * @param payload - Raw payload bytes.
   * @param messageTypeName - Message type name.
   */
  public constructor(
    sop: ExtendedMessage['sop'],
    header: ExtendedMessage['header'],
    payload: Uint8Array,
    messageTypeName: string,
  ) {
    super(sop, header, payload, messageTypeName)
    this.parseErrors = []
    const extended = header.extendedHeader
    this.dataSize = extended?.dataSize ?? 0
    this.chunked = extended?.chunked ?? false
    this.chunkNumber = extended?.chunkNumber ?? 0
    this.requestChunk = extended?.requestChunk ?? false
    this.rawPayload = payload.subarray(this.payloadOffset)
    const dataEnd = this.payloadOffset + this.dataSize
    if (payload.length < dataEnd) {
      this.parseErrors.push(
        `Battery_Capabilities expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.batteryCapabilities =
      dataBlock.length >= 9 ? parseBatteryCapabilitiesDataBlock(dataBlock) : null
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'Message Description', HumanReadableField.string('Battery_Capabilities is an extended message that reports detailed battery design and capability information so policy logic can evaluate battery limits and make informed power decisions.', 'A description of the message\'s function and usage.'))
    return metadata
  }

}
