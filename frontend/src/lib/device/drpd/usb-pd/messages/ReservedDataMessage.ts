import { DataMessage } from '../messageBase'
import { readDataObjects } from '../dataObjects'

/**
 * Reserved data message.
 */
export class ReservedDataMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw data object values.
  public readonly rawDataObjects: number[]
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Reserved data message.
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
    const expectedCount = header.messageHeader.numberOfDataObjects
    const count = Math.min(availableCount, expectedCount)
    if (expectedCount > availableCount) {
      this.parseErrors.push(
        `Reserved data message expected ${expectedCount} data objects but only ${availableCount} available`,
      )
    }
    this.rawDataObjects = count > 0 ? readDataObjects(payload, this.payloadOffset, count) : []
  }
}
