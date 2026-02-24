import { DataMessage } from '../messageBase'
import {
  parseSourceInfoDataObject,
  readDataObjects,
  type ParsedSourceInfoDataObject,
} from '../DataObjects'

/**
 * Source_Info data message.
 */
export class SourceInfoMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw SIDO value.
  public readonly rawSourceInfoDataObject: number | null
  ///< Parsed SIDO.
  public readonly sourceInfoDataObject: ParsedSourceInfoDataObject | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Source_Info message.
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
      this.parseErrors.push('Source_Info message missing data object')
      this.rawSourceInfoDataObject = null
      this.sourceInfoDataObject = null
      return
    }
    this.rawSourceInfoDataObject = readDataObjects(payload, this.payloadOffset, 1)[0]
    this.sourceInfoDataObject = parseSourceInfoDataObject(this.rawSourceInfoDataObject)
  }
}
