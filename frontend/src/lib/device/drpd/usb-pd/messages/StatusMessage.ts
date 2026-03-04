import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  parseSOPPrimeStatusDataBlock,
  parseSOPStatusDataBlock,
  type ParsedSOPPrimeStatusDataBlock,
  type ParsedSOPStatusDataBlock,
} from '../DataObjects'

/**
 * Status extended message.
 */
export class StatusMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< SOP status data block.
  public readonly sopStatusDataBlock: ParsedSOPStatusDataBlock | null
  ///< SOP' status data block.
  public readonly sopPrimeStatusDataBlock: ParsedSOPPrimeStatusDataBlock | null
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
   * Create a Status message.
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
        `Status message expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    if (this.sop.kind === 'SOP') {
      this.sopStatusDataBlock = dataBlock.length >= 7 ? parseSOPStatusDataBlock(dataBlock) : null
      this.sopPrimeStatusDataBlock = null
    } else {
      this.sopStatusDataBlock = null
      this.sopPrimeStatusDataBlock =
        dataBlock.length >= 2 ? parseSOPPrimeStatusDataBlock(dataBlock) : null
    }
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Status is an extended message that reports current port and power status information so the partner can evaluate health, fault, and state conditions during operation.'))
    return metadata
  }

}
