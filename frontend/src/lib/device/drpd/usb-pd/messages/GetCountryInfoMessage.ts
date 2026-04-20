import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildCountryCodeDataObjectMetadata,
  parseCountryCodeDataObject,
  readDataObjects,
  type ParsedCountryCodeDataObject,
} from '../DataObjects'

const formatHexByte = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`

/**
 * Get_Country_Info data message.
 */
export class GetCountryInfoMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw CCDO value.
  public readonly rawCountryCodeDataObject: number | null
  ///< Parsed CCDO.
  public readonly countryCodeDataObject: ParsedCountryCodeDataObject | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Get_Country_Info message.
   *
   * @param sop - SOP metadata.
   * @param header - Parsed header.
   * @param payload - Raw payload bytes.
   * @param messageTypeName - Message type name.
   */
  public constructor(
    sop: DataMessage['sop'],
    header: DataMessage['header'],
    payload: Uint8Array,
    messageTypeName: string,
  ) {
    super(sop, header, payload, messageTypeName)
    this.parseErrors = []
    this.rawPayload = payload.subarray(this.payloadOffset)
    const availableCount = Math.floor(this.rawPayload.length / 4)
    if (availableCount < 1) {
      this.parseErrors.push('Get_Country_Info message missing data object')
      this.rawCountryCodeDataObject = null
      this.countryCodeDataObject = null
      return
    }
    this.rawCountryCodeDataObject = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.countryCodeDataObject = parseCountryCodeDataObject(this.rawCountryCodeDataObject)
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the requested country code.
   */
  public describe(): string {
    if (!this.countryCodeDataObject) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Country Code Data Object.${parseErrorText}`.trim()
    }

    if (this.countryCodeDataObject.countryCode) {
      return [
        '**Requested country information:**',
        '',
        `- Country code: ${this.countryCodeDataObject.countryCode}`,
      ].join('\n')
    }

    return [
      '**Requested country information:**',
      '',
      `- Country code bytes: ${formatHexByte(this.countryCodeDataObject.countryCodeChar1)}, ${formatHexByte(this.countryCodeDataObject.countryCodeChar2)}`,
    ].join('\n')
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_Country_Info is a data message request that specifies a country code so the partner can return corresponding country-specific information.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the specific country code requested by this Get_Country_Info message.',
      ),
    )

    if (this.countryCodeDataObject) {
      metadata.messageSpecificData.setEntry(
        'countryCodeDataObject',
        buildCountryCodeDataObjectMetadata(this.countryCodeDataObject),
      )
    }
    return metadata
  }

}
