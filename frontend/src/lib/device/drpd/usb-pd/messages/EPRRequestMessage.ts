import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildPDOMetadata, buildRDOMetadata, parsePDO, parseRDO, readDataObjects, type ParsedPDO, type ParsedRDO } from '../DataObjects'

/**
 * EPR_Request data message.
 */
export class EPRRequestMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw RDO value.
  public readonly rawRDO: number | null
  ///< Parsed RDO.
  public readonly rdo: ParsedRDO | null
  ///< Raw PDO copy value.
  public readonly rawPDOCopy: number | null
  ///< Parsed PDO copy.
  public readonly requestedPDOCopy: ParsedPDO | null
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create an EPR_Request message.
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
    if (availableCount < 2) {
      this.parseErrors.push('EPR_Request message missing RDO and PDO copy')
      this.rawRDO = null
      this.rdo = null
      this.rawPDOCopy = null
      this.requestedPDOCopy = null
      return
    }
    const objects = readDataObjects(payload, this.payloadOffset, 2)
    this.rawRDO = objects[0]
    this.rdo = parseRDO(objects[0])
    this.rawPDOCopy = objects[1]
    this.requestedPDOCopy = parsePDO(objects[1], 'source')
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('EPR_Request is a data message that requests an Extended Power Range power contract so a sink can ask for higher-power operating points in EPR mode.', 'Message Description', 'A description of the message\'s function and usage.'))

    if (this.rdo) {
      metadata.messageSpecificData.setEntry('requestDataObject', buildRDOMetadata(this.rdo))
    }
    if (this.requestedPDOCopy) {
      metadata.messageSpecificData.setEntry('requestedPowerDataObject', buildPDOMetadata(this.requestedPDOCopy))
    }
    return metadata
  }

}
