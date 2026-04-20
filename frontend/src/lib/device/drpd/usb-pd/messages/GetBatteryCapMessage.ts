import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'

/**
 * Get_Battery_Cap extended message.
 */
export class GetBatteryCapMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Battery cap reference.
  public readonly batteryCapRef: number | null
  ///< Data size from extended header.
  public readonly dataSize: number
  ///< Chunked flag.
  public readonly chunked: boolean
  ///< Chunk number.
  public readonly chunkNumber: number
  ///< Request chunk flag.
  public readonly requestChunk: boolean
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Get_Battery_Cap message.
   *
   * @param sop - SOP metadata.
   * @param header - Parsed header.
   * @param payload - Raw payload bytes.
   * @param messageTypeName - Message type name.
   */
  public constructor(
    sop: ExtendedMessage['sop'],
    header: ExtendedMessage['header'],
    payload: Uint8Array,
    messageTypeName: string,
  ) {
    super(sop, header, payload, messageTypeName)
    this.parseErrors = []
    const extended = header.extendedHeader
    this.dataSize = extended?.dataSize ?? 0
    this.chunked = extended?.chunked ?? false
    this.chunkNumber = extended?.chunkNumber ?? 0
    this.requestChunk = extended?.requestChunk ?? false
    this.rawPayload = payload.subarray(this.payloadOffset)
    const dataEnd = this.payloadOffset + this.dataSize
    if (payload.length < dataEnd) {
      this.parseErrors.push(
        `Get_Battery_Cap expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.batteryCapRef = dataBlock.length >= 1 ? dataBlock[0] : null
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the requested battery capability reference.
   */
  public describe(): string {
    if (this.batteryCapRef === null) {
      if (this.rawPayload.length < this.dataSize) {
        return `The Get Battery Cap message has only been partially transferred: expected ${this.dataSize} bytes but received ${this.rawPayload.length}.`
      }
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the battery capability reference.${parseErrorText}`.trim()
    }

    return [
      '**Battery capability request:**',
      '',
      `- Requested battery reference: ${this.batteryCapRef}`,
    ].join('\n')
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_Battery_Cap is an extended message request that asks for battery capability information so a partner can retrieve detailed battery limits and characteristics.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the battery capability reference requested by this Get_Battery_Cap message.',
      ),
    )

    const getBatteryCapDataBlock = HumanReadableField.orderedDictionary(
      'Get Battery Cap Data Block',
      'Metadata describing the Get_Battery_Cap request data block.',
    )
    if (this.batteryCapRef !== null) {
      getBatteryCapDataBlock.setEntry(
        'batteryCapRef',
        HumanReadableField.string(
          this.batteryCapRef.toString(),
          'Battery Cap Reference',
          'Battery reference identifying which battery capability record is being requested.',
        ),
      )
    }
    metadata.messageSpecificData.setEntry('getBatteryCapDataBlock', getBatteryCapDataBlock)
    return metadata
  }

}
