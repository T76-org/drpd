import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildCountryCodesDataBlockMetadata, parseCountryCodesDataBlock, type ParsedCountryCodesDataBlock } from '../DataObjects'

/**
 * Country_Codes extended message.
 */
export class CountryCodesMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Parsed CCDB.
  public readonly countryCodesDataBlock: ParsedCountryCodesDataBlock | null
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
   * Create a Country_Codes message.
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
        `Country_Codes expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.countryCodesDataBlock =
      dataBlock.length >= 4 ? parseCountryCodesDataBlock(dataBlock) : null
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the supported country codes.
   */
  public describe(): string {
    if (!this.countryCodesDataBlock) {
      if (this.rawPayload.length < this.dataSize) {
        return `The Country Codes message has only been partially transferred: expected ${this.dataSize} bytes but received ${this.rawPayload.length}.`
      }
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Country Codes Data Block.${parseErrorText}`.trim()
    }

    const lines = [
      '**Supported country codes:**',
      '',
      `- Reported country code count: ${this.countryCodesDataBlock.length}`,
    ]

    if (this.countryCodesDataBlock.countryCodes.length > 0) {
      lines.push(`- Decoded country codes: ${this.countryCodesDataBlock.countryCodes.join(', ')}`)
    } else {
      lines.push('- Decoded country codes: none')
    }

    return lines.join('\n')
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Country_Codes is an extended message that provides supported country code entries so a partner can discover which country-specific data can be requested.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the country codes carried by this Country_Codes message.',
      ),
    )

    if (this.countryCodesDataBlock) {
      metadata.messageSpecificData.setEntry(
        'countryCodesDataBlock',
        buildCountryCodesDataBlockMetadata(this.countryCodesDataBlock),
      )
    }
    return metadata
  }

}
