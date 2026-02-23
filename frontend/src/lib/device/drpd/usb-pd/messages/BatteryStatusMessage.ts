import { DataMessage } from '../messageBase'
import {
  parseBatteryStatusDataObject,
  readDataObjects,
  type ParsedBatteryStatusDataObject,
} from '../DataObjects'

/**
 * Battery_Status data message.
 */
export class BatteryStatusMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw BSDO value.
  public readonly rawBatteryStatusDataObject: number | null
  ///< Parsed BSDO.
  public readonly batteryStatusDataObject: ParsedBatteryStatusDataObject | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Battery_Status message.
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
      this.parseErrors.push('Battery_Status message missing data object')
      this.rawBatteryStatusDataObject = null
      this.batteryStatusDataObject = null
      return
    }
    this.rawBatteryStatusDataObject = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.batteryStatusDataObject = parseBatteryStatusDataObject(this.rawBatteryStatusDataObject)
  }
}
