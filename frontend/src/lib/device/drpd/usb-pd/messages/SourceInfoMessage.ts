import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildSourceInfoDataObjectMetadata,
  parseSourceInfoDataObject,
  readDataObjects,
  type ParsedSourceInfoDataObject,
} from '../DataObjects'

const describePortType = (portType: number): string =>
  portType === 1 ? 'Guaranteed Capability Port' : 'Managed Capability Port'

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

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the source information fields.
   */
  public describe(): string {
    if (!this.sourceInfoDataObject) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Source Info Data Object.${parseErrorText}`.trim()
    }

    return [
      '**Source information:**',
      '',
      `- Port type: ${describePortType(this.sourceInfoDataObject.portType)}`,
      `- Port maximum power data profile: ${this.sourceInfoDataObject.portMaximumPdp}W`,
      `- Port present power data profile: ${this.sourceInfoDataObject.portPresentPdp}W`,
      `- Port reported power data profile: ${this.sourceInfoDataObject.portReportedPdp}W`,
    ].join('\n')
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Source_Info is a data message that provides source status and capability indicators so the sink can understand source-side constraints and operating context.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the source port information carried by this Source_Info message.',
      ),
    )

    if (this.sourceInfoDataObject) {
      metadata.messageSpecificData.setEntry(
        'sourceInfoDataObject',
        buildSourceInfoDataObjectMetadata(this.sourceInfoDataObject),
      )
    }
    return metadata
  }

}
