import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildOpaqueExternalSpecDataBlockMetadata } from '../DataObjects'

/**
 * Security_Request extended message.
 */
export class SecurityRequestMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Security request data block bytes.
  public readonly securityRequestDataBlock: Uint8Array
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
   * Create a Security_Request message.
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
        `Security_Request expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    this.securityRequestDataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Security_Request is an extended message used by USB Type-C authentication and security flows to request security-related payload exchanges between partners.', 'Message Description', 'A description of the message\'s function and usage.'))

    metadata.messageSpecificData.setEntry(
      'securityRequestDataBlock',
      buildOpaqueExternalSpecDataBlockMetadata(
        'Security Request Data Block',
        'Metadata describing the Security_Request data block. USB Power Delivery defines the transport container and length bounds, while USB Type-C Authentication 1.0 defines the internal fields.',
        'USB Type-C Authentication 1.0',
        4,
        260,
        this.securityRequestDataBlock,
      ),
    )
    return metadata
  }

}
