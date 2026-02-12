import { DataMessage } from '../messageBase'
import { parseAlertDataObject, readDataObjects, type ParsedAlertDataObject } from '../dataObjects'

/**
 * Alert data message.
 */
export class AlertMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw ADO value.
  public readonly rawAlertDataObject: number | null
  ///< Parsed ADO.
  public readonly alertDataObject: ParsedAlertDataObject | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create an Alert message.
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
      this.parseErrors.push('Alert message missing data object')
      this.rawAlertDataObject = null
      this.alertDataObject = null
      return
    }
    this.rawAlertDataObject = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.alertDataObject = parseAlertDataObject(this.rawAlertDataObject)
  }
}
