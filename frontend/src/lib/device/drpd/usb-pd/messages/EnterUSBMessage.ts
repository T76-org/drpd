import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildEnterUSBDataObjectMetadata,
  parseEnterUSBDataObject,
  readDataObjects,
  type ParsedEnterUSBDataObject,
} from '../DataObjects'

/**
 * Enter_USB data message.
 */
export class EnterUSBMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw EUDO value.
  public readonly rawEnterUsbDataObject: number | null
  ///< Parsed EUDO.
  public readonly enterUsbDataObject: ParsedEnterUSBDataObject | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create an Enter_USB message.
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
      this.parseErrors.push('Enter_USB message missing data object')
      this.rawEnterUsbDataObject = null
      this.enterUsbDataObject = null
      return
    }
    this.rawEnterUsbDataObject = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.enterUsbDataObject = parseEnterUSBDataObject(this.rawEnterUsbDataObject)
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Enter_USB is a data message that carries USB mode entry parameters so partners can transition from USB-PD negotiation into a selected USB data mode with agreed constraints.', 'Message Description', 'A description of the message\'s function and usage.'))

    if (this.enterUsbDataObject) {
      metadata.messageSpecificData.setEntry('enterUsbDataObject', buildEnterUSBDataObjectMetadata(this.enterUsbDataObject))
    }
    return metadata
  }

}
