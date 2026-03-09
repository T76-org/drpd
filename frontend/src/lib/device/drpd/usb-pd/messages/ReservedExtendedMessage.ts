import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'

/**
 * Reserved extended message.
 */
export class ReservedExtendedMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
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
   * Create a Reserved extended message.
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
        `Reserved extended message expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Reserved is an extended message wrapper for undefined or reserved extended message type values so decoding can safely preserve payloads for unsupported or future message IDs.', 'Message Description', 'A description of the message\'s function and usage.'))

    metadata.messageSpecificData.setEntry(
      'rawPayload',
      HumanReadableField.byteData(
        this.rawPayload,
        8,
        false,
        'Raw Payload',
        'Raw payload bytes preserved for a reserved extended message type that does not yet have a defined parser.',
      ),
    )
    return metadata
  }

}
