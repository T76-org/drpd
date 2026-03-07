import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildSourceCapabilitiesExtendedDataBlockMetadata,
  parseSourceCapabilitiesExtendedDataBlock,
  type ParsedSourceCapabilitiesExtendedDataBlock,
} from '../DataObjects'

/**
 * Source_Capabilities_Extended extended message.
 */
export class SourceCapabilitiesExtendedMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Parsed data block.
  public readonly sourceCapabilitiesExtended: ParsedSourceCapabilitiesExtendedDataBlock | null
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
   * Create a Source_Capabilities_Extended message.
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
        `Source_Capabilities_Extended expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.sourceCapabilitiesExtended =
      dataBlock.length >= 25 ? parseSourceCapabilitiesExtendedDataBlock(dataBlock) : null
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Source_Capabilities_Extended is an extended message that reports detailed source capability attributes so sinks can evaluate advanced source characteristics beyond basic PDOs.', 'Message Description', 'A description of the message\'s function and usage.'))

    if (this.sourceCapabilitiesExtended) {
      metadata.messageSpecificData.setEntry(
        'sourceCapabilitiesExtendedDataBlock',
        buildSourceCapabilitiesExtendedDataBlockMetadata(this.sourceCapabilitiesExtended),
      )
    }
    return metadata
  }

}
