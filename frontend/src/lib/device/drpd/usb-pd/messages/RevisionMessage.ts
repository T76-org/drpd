import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildRevisionDataObjectMetadata,
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

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the revision and version numbers.
   */
  public describe(): string {
    if (!this.revisionDataObject) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Revision Data Object.${parseErrorText}`.trim()
    }

    return [
      '**Revision information:**',
      '',
      `- Revision: ${this.revisionDataObject.revisionMajor}.${this.revisionDataObject.revisionMinor}`,
      `- Version: ${this.revisionDataObject.versionMajor}.${this.revisionDataObject.versionMinor}`,
    ].join('\n')
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Revision is a data message that communicates protocol and firmware revision information so partners can understand each other\'s implemented USB-PD revision context.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the revision and version numbers carried by this Revision message.',
      ),
    )

    if (this.revisionDataObject) {
      metadata.messageSpecificData.setEntry('revisionDataObject', buildRevisionDataObjectMetadata(this.revisionDataObject))
    }
    return metadata
  }
}
