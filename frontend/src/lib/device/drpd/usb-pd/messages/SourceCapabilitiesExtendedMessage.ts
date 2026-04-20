import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildSourceCapabilitiesExtendedDataBlockMetadata,
  parseSourceCapabilitiesExtendedDataBlock,
  type ParsedSourceCapabilitiesExtendedDataBlock,
} from '../DataObjects'

const formatHex = (value: number, width: number): string => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`

const describeSourceInputs = (sourceInputs: number): string[] => {
  const inputs: string[] = []
  if ((sourceInputs & (1 << 0)) !== 0) {
    inputs.push((sourceInputs & (1 << 1)) !== 0 ? 'unconstrained external supply' : 'constrained external supply')
  }
  if ((sourceInputs & (1 << 2)) !== 0) {
    inputs.push('internal battery')
  }
  return inputs
}

/**
 * Source_Capabilities_Extended extended message.
 */
export class SourceCapabilitiesExtendedMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Parsed data block.
  public readonly sourceCapabilitiesExtended: ParsedSourceCapabilitiesExtendedDataBlock | null
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
   * Create a Source_Capabilities_Extended message.
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
        `Source_Capabilities_Extended expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.sourceCapabilitiesExtended =
      dataBlock.length >= 25 ? parseSourceCapabilitiesExtendedDataBlock(dataBlock) : null
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the source capability data block.
   */
  public describe(): string {
    if (!this.sourceCapabilitiesExtended) {
      if (this.rawPayload.length < this.dataSize) {
        return `The Source Capabilities Extended message has only been partially transferred: expected ${this.dataSize} bytes but received ${this.rawPayload.length}.`
      }
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Source Capabilities Extended Data Block.${parseErrorText}`.trim()
    }

    const block = this.sourceCapabilitiesExtended
    const sourceInputs = describeSourceInputs(block.sourceInputs)
    const lines = [
      '**Source capabilities extended information:**',
      '',
      `- USB Vendor ID: ${formatHex(block.vid, 4)}`,
      `- Product ID: ${formatHex(block.pid, 4)}`,
      `- XID value: ${formatHex(block.xid, 8)}`,
      `- Firmware version: ${block.fwVersion}`,
      `- Hardware version: ${block.hwVersion}`,
      `- Standard Power Range source power data profile rating: ${block.sprSourcePdpRating}W`,
      `- Extended Power Range source power data profile rating: ${block.eprSourcePdpRating}W`,
    ]

    if (sourceInputs.length > 0) {
      lines.push(`- Source inputs: ${sourceInputs.join(', ')}`)
    }
    if (block.fixedBatteries > 0) {
      lines.push(`- Fixed batteries: ${block.fixedBatteries}`)
    }
    if (block.hotSwappableBatterySlots > 0) {
      lines.push(`- Hot-swappable battery slots: ${block.hotSwappableBatterySlots}`)
    }

    if (this.parseErrors.length > 0) {
      lines.push('', `**Could not decode all source capability data:** ${this.parseErrors.join(' ')}`)
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
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Source_Capabilities_Extended is an extended message that reports detailed source capability attributes so sinks can evaluate advanced source characteristics beyond basic PDOs.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the source capability details carried by this Source_Capabilities_Extended message.',
      ),
    )

    if (this.sourceCapabilitiesExtended) {
      metadata.messageSpecificData.setEntry(
        'sourceCapabilitiesExtendedDataBlock',
        buildSourceCapabilitiesExtendedDataBlockMetadata(this.sourceCapabilitiesExtended),
      )
    }
    return metadata
  }

}
