import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { parseEPRModeDataObject, readDataObjects, type ParsedEPRModeDataObject } from '../DataObjects'

/**
 * EPR_Mode data message.
 */
export class EPRModeMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw EPRMDO value.
  public readonly rawEprModeDataObject: number | null
  ///< Parsed EPRMDO.
  public readonly eprModeDataObject: ParsedEPRModeDataObject | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create an EPR_Mode message.
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
      this.parseErrors.push('EPR_Mode message missing data object')
      this.rawEprModeDataObject = null
      this.eprModeDataObject = null
      return
    }
    this.rawEprModeDataObject = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.eprModeDataObject = parseEPRModeDataObject(this.rawEprModeDataObject)
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.insertEntryAt(1, 'messageDescription', HumanReadableField.string('EPR_Mode is a data message used to coordinate entering, exiting, or acknowledging Extended Power Range operation so both partners stay synchronized on EPR state transitions.'))
    return metadata
  }

}
