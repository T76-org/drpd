import { DataMessage } from '../messageBase'
import {
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
}
