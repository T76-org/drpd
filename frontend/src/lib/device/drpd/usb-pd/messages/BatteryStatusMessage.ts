import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildBatteryStatusDataObjectMetadata,
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

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Battery_Status is a data message that communicates current battery presence and status information so a partner can track battery health and charging-related state.', 'Message Description', 'A description of the message\'s function and usage.'))

    if (this.batteryStatusDataObject) {
      metadata.messageSpecificData.setEntry(
        'batteryStatusDataObject',
        buildBatteryStatusDataObjectMetadata(this.batteryStatusDataObject),
      )
    }
    return metadata
  }

}
