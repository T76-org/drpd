import { DataMessage } from '../messageBase'
import {
  parseRevisionDataObject,
  readDataObjects,
  type ParsedRevisionDataObject,
} from '../DataObjects'

/**
 * Revision data message.
 */
export class RevisionMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw RMDO value.
  public readonly rawRevisionDataObject: number | null
  ///< Parsed RMDO.
  public readonly revisionDataObject: ParsedRevisionDataObject | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Revision message.
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
      this.parseErrors.push('Revision message missing data object')
      this.rawRevisionDataObject = null
      this.revisionDataObject = null
      return
    }
    this.rawRevisionDataObject = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.revisionDataObject = parseRevisionDataObject(this.rawRevisionDataObject)
  }
}
