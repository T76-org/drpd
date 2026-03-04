import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'

/**
 * Firmware_Update_Response extended message.
 */
export class FirmwareUpdateResponseMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Firmware update response data block bytes.
  public readonly firmwareUpdateResponseDataBlock: Uint8Array
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
   * Create a Firmware_Update_Response message.
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
        `Firmware_Update_Response expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    this.firmwareUpdateResponseDataBlock = payload.subarray(
      this.payloadOffset,
      Math.min(dataEnd, payload.length),
    )
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Firmware_Update_Response is an extended message that acknowledges or returns status for firmware update transactions so update state can progress reliably between partners.'))
    return metadata
  }

}
