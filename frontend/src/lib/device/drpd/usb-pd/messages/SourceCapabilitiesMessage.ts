import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { parsePDO, readDataObjects, type ParsedPDO } from '../DataObjects'

/**
 * Source_Capabilities data message.
 */
export class SourceCapabilitiesMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw data object values.
  public readonly rawDataObjects: number[]
  ///< Decoded PDOs.
  public readonly decodedPDOs: ParsedPDO[]
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Source_Capabilities message.
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
    const expectedCount = header.messageHeader.numberOfDataObjects
    const availableCount = Math.floor(this.rawPayload.length / 4)
    const count = Math.min(expectedCount, availableCount)
    if (expectedCount > availableCount) {
      this.parseErrors.push(
        `Source_Capabilities expected ${expectedCount} data objects but only ${availableCount} available`,
      )
    }
    this.rawDataObjects = readDataObjects(payload, this.payloadOffset, count)
    this.decodedPDOs = this.rawDataObjects.map((raw) => parsePDO(raw, 'source'))
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'Message Description', HumanReadableField.string('Source_Capabilities is a data message that advertises source power data objects so sinks can select and request a suitable power contract.', 'A description of the message\'s function and usage.'))
    return metadata
  }

}
