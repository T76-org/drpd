import { DataMessage } from '../messageBase'
import { parseBISTDataObject, readDataObjects, type ParsedBISTDataObject } from '../DataObjects'

/**
 * BIST data message.
 */
export class BISTMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw BIST data object value.
  public readonly rawBistDataObject: number | null
  ///< Parsed BIST data object.
  public readonly bistDataObject: ParsedBISTDataObject | null
  ///< Raw additional data objects (if present).
  public readonly rawAdditionalObjects: number[]
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a BIST message.
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
      this.parseErrors.push('BIST message missing data object')
      this.rawBistDataObject = null
      this.bistDataObject = null
      this.rawAdditionalObjects = []
      return
    }
    const objects = readDataObjects(payload, this.payloadOffset, availableCount)
    this.rawBistDataObject = objects[0]
    this.bistDataObject = parseBISTDataObject(objects[0])
    this.rawAdditionalObjects = objects.slice(1)
  }
}
