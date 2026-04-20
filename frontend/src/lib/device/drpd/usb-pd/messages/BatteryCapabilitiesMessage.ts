import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildBatteryCapabilitiesDataBlockMetadata,
  parseBatteryCapabilitiesDataBlock,
  type ParsedBatteryCapabilitiesDataBlock,
} from '../DataObjects'

const formatHex = (value: number, width: number): string => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`

/**
 * Battery_Capabilities extended message.
 */
export class BatteryCapabilitiesMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Parsed BCDB.
  public readonly batteryCapabilities: ParsedBatteryCapabilitiesDataBlock | null
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
   * Create a Battery_Capabilities message.
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
        `Battery_Capabilities expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.batteryCapabilities =
      dataBlock.length >= 9 ? parseBatteryCapabilitiesDataBlock(dataBlock) : null
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the battery capability data.
   */
  public describe(): string {
    if (!this.batteryCapabilities) {
      if (this.rawPayload.length < this.dataSize) {
        return `The Battery Capabilities message has only been partially transferred: expected ${this.dataSize} bytes but received ${this.rawPayload.length}.`
      }
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Battery Capabilities Data Block.${parseErrorText}`.trim()
    }

    return [
      '**Battery capabilities:**',
      '',
      `- USB Vendor ID: ${formatHex(this.batteryCapabilities.vid, 4)}`,
      `- Product ID: ${formatHex(this.batteryCapabilities.pid, 4)}`,
      `- Design capacity: ${this.batteryCapabilities.batteryDesignCapacity}`,
      `- Last full-charge capacity: ${this.batteryCapabilities.batteryLastFullChargeCapacity}`,
      `- Battery reference: ${(this.batteryCapabilities.batteryType & 0x01) !== 0 ? 'invalid' : 'valid'}`,
    ].join('\n')
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Battery_Capabilities is an extended message that reports detailed battery design and capability information so policy logic can evaluate battery limits and make informed power decisions.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the battery capability data carried by this Battery_Capabilities message.',
      ),
    )

    if (this.batteryCapabilities) {
      metadata.messageSpecificData.setEntry(
        'batteryCapabilitiesDataBlock',
        buildBatteryCapabilitiesDataBlockMetadata(this.batteryCapabilities),
      )
    }
    return metadata
  }

}
