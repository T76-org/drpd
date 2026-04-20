import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'

/**
 * Get_Manufacturer_Info extended message.
 */
export class GetManufacturerInfoMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Manufacturer info target.
  public readonly manufacturerInfoTarget: number | null
  ///< Manufacturer info reference.
  public readonly manufacturerInfoRef: number | null
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
   * Create a Get_Manufacturer_Info message.
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
        `Get_Manufacturer_Info expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.manufacturerInfoTarget = dataBlock.length >= 1 ? dataBlock[0] : null
    this.manufacturerInfoRef = dataBlock.length >= 2 ? dataBlock[1] : null
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the requested manufacturer information target and reference.
   */
  public describe(): string {
    if (this.manufacturerInfoTarget === null || this.manufacturerInfoRef === null) {
      if (this.rawPayload.length < this.dataSize) {
        return `The Get Manufacturer Info message has only been partially transferred: expected ${this.dataSize} bytes but received ${this.rawPayload.length}.`
      }
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the manufacturer information request.${parseErrorText}`.trim()
    }

    return [
      '**Manufacturer information request:**',
      '',
      `- Target: ${this.manufacturerInfoTarget}`,
      `- Reference: ${this.manufacturerInfoRef}`,
    ].join('\n')
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Get_Manufacturer_Info is an extended message request that asks for manufacturer identity details so a partner can expose vendor and product identification data.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the manufacturer information target and reference requested by this Get_Manufacturer_Info message.',
      ),
    )

    const getManufacturerInfoDataBlock = HumanReadableField.orderedDictionary(
      'Get Manufacturer Info Data Block',
      'Metadata describing the Get_Manufacturer_Info request data block.',
    )
    if (this.manufacturerInfoTarget !== null) {
      getManufacturerInfoDataBlock.setEntry(
        'manufacturerInfoTarget',
        HumanReadableField.string(
          this.manufacturerInfoTarget.toString(),
          'Manufacturer Info Target',
          'Target selector identifying which partner entity the manufacturer information request addresses.',
        ),
      )
    }
    if (this.manufacturerInfoRef !== null) {
      getManufacturerInfoDataBlock.setEntry(
        'manufacturerInfoRef',
        HumanReadableField.string(
          this.manufacturerInfoRef.toString(),
          'Manufacturer Info Reference',
          'Reference value identifying which manufacturer information record is being requested.',
        ),
      )
    }
    metadata.messageSpecificData.setEntry('getManufacturerInfoDataBlock', getManufacturerInfoDataBlock)
    return metadata
  }

}
