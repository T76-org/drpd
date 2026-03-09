import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildCountryInfoDataBlockMetadata, parseCountryInfoDataBlock, type ParsedCountryInfoDataBlock } from '../DataObjects'

/**
 * Country_Info extended message.
 */
export class CountryInfoMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Parsed CIDB.
  public readonly countryInfoDataBlock: ParsedCountryInfoDataBlock | null
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
   * Create a Country_Info message.
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
        `Country_Info expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.countryInfoDataBlock = dataBlock.length >= 4 ? parseCountryInfoDataBlock(dataBlock) : null
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Country_Info is an extended message that returns country-specific regulatory or compliance information so products can apply region-specific behavior when required.', 'Message Description', 'A description of the message\'s function and usage.'))

    if (this.countryInfoDataBlock) {
      metadata.messageSpecificData.setEntry('countryInfoDataBlock', buildCountryInfoDataBlockMetadata(this.countryInfoDataBlock))
    }
    return metadata
  }

}
