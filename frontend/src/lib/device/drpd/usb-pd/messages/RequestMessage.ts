import { DataMessage } from '../messageBase'
import { parseRDO, readDataObjects, type ParsedRDO } from '../DataObjects'

/**
 * Request data message.
 */
export class RequestMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw RDO value.
  public readonly rawRDO: number | null
  ///< Parsed RDO.
  public readonly rdo: ParsedRDO | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Request message.
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
      this.parseErrors.push('Request message missing RDO payload')
      this.rawRDO = null
      this.rdo = null
      return
    }
    this.rawRDO = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.rdo = parseRDO(this.rawRDO)
  }
}
