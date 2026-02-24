import { DataMessage } from '../messageBase'
import {
  parseCountryCodeDataObject,
  readDataObjects,
  type ParsedCountryCodeDataObject,
} from '../DataObjects'

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
}
