import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildRDOMetadata, parseRDO, readDataObjects, type ParsedRDO } from '../DataObjects'

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

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Request is a data message that selects a specific source power data object and operating level so a sink can establish or change its power contract.', 'Message Description', 'A description of the message\'s function and usage.'))

    if (this.rdo) {
      metadata.messageSpecificData.setEntry('requestDataObject', buildRDOMetadata({
        ...this.rdo,
        requestTypeHint: 'fixed_variable',
      }))
    }
    return metadata
  }

}
