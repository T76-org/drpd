import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildManufacturerInfoDataBlockMetadata,
  parseManufacturerInfoDataBlock,
  type ParsedManufacturerInfoDataBlock,
} from '../DataObjects'

const formatHex = (value: number, width: number): string => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`

/**
 * Manufacturer_Info extended message.
 */
export class ManufacturerInfoMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Parsed MIDB.
  public readonly manufacturerInfo: ParsedManufacturerInfoDataBlock | null
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
   * Create a Manufacturer_Info message.
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
        `Manufacturer_Info expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.manufacturerInfo =
      dataBlock.length >= 5 ? parseManufacturerInfoDataBlock(dataBlock) : null
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the manufacturer information.
   */
  public describe(): string {
    if (!this.manufacturerInfo) {
      if (this.rawPayload.length < this.dataSize) {
        return `The Manufacturer Info message has only been partially transferred: expected ${this.dataSize} bytes but received ${this.rawPayload.length}.`
      }
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Manufacturer Info Data Block.${parseErrorText}`.trim()
    }

    const lines = [
      '**Manufacturer information:**',
      '',
      `- USB Vendor ID: ${formatHex(this.manufacturerInfo.vid, 4)}`,
      `- Product ID: ${formatHex(this.manufacturerInfo.pid, 4)}`,
    ]

    if (this.manufacturerInfo.manufacturerString.length > 0) {
      lines.push(`- Manufacturer string: ${this.manufacturerInfo.manufacturerString}`)
    } else {
      lines.push(`- Manufacturer string bytes: ${this.manufacturerInfo.manufacturerStringBytes.length} bytes`)
    }

    return lines.join('\n')
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Manufacturer_Info is an extended message that provides manufacturer identification details so the other partner can display or process product/vendor identity information.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the manufacturer information carried by this Manufacturer_Info message.',
      ),
    )

    if (this.manufacturerInfo) {
      metadata.messageSpecificData.setEntry(
        'manufacturerInfoDataBlock',
        buildManufacturerInfoDataBlockMetadata(this.manufacturerInfo),
      )
    }
    return metadata
  }

}
