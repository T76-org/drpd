import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { readDataObjects } from '../DataObjects'

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

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Reserved is a data message wrapper for undefined or reserved data message type values so decoding can remain robust when encountering unsupported or future message IDs.', 'Message Description', 'A description of the message\'s function and usage.'))

    if (this.rawDataObjects.length > 0) {
      const rawDataObjects = HumanReadableField.orderedDictionary(
        'Raw Data Objects',
        'Raw 32-bit data objects preserved for a reserved data message type that does not yet have a defined parser.',
      )
      this.rawDataObjects.forEach((raw, index) => {
        rawDataObjects.setEntry(
          `dataObject${index + 1}`,
          HumanReadableField.string(
            `0x${raw.toString(16).toUpperCase().padStart(8, '0')}`,
            `Data Object ${index + 1}`,
            'Raw 32-bit data object preserved from a reserved data message payload.',
          ),
        )
      })
      metadata.messageSpecificData.setEntry('rawDataObjects', rawDataObjects)
    }
    return metadata
  }

}
