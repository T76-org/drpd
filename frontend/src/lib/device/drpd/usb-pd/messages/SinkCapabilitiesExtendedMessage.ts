import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildSinkCapabilitiesExtendedDataBlockMetadata,
  parseSinkCapabilitiesExtendedDataBlock,
  type ParsedSinkCapabilitiesExtendedDataBlock,
} from '../DataObjects'

const formatHex = (value: number, width: number): string => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`

const describeSinkModes = (sinkModes: number): string[] => {
  const modes: string[] = []
  if ((sinkModes & (1 << 0)) !== 0) {
    modes.push('Programmable Power Supply charging supported')
  }
  if ((sinkModes & (1 << 1)) !== 0) {
    modes.push('VBUS powered')
  }
  if ((sinkModes & (1 << 2)) !== 0) {
    modes.push('AC supply powered')
  }
  if ((sinkModes & (1 << 3)) !== 0) {
    modes.push('battery powered')
  }
  if ((sinkModes & (1 << 4)) !== 0) {
    modes.push('battery essentially unlimited')
  }
  if ((sinkModes & (1 << 5)) !== 0) {
    modes.push('Adjustable Voltage Supply supported')
  }
  return modes
}

/**
 * Sink_Capabilities_Extended extended message.
 */
export class SinkCapabilitiesExtendedMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Parsed SKEDB.
  public readonly sinkCapabilitiesExtended: ParsedSinkCapabilitiesExtendedDataBlock | null
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
   * Create a Sink_Capabilities_Extended message.
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
        `Sink_Capabilities_Extended expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.sinkCapabilitiesExtended =
      dataBlock.length >= 24 ? parseSinkCapabilitiesExtendedDataBlock(dataBlock) : null
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the sink capability data block.
   */
  public describe(): string {
    if (!this.sinkCapabilitiesExtended) {
      if (this.rawPayload.length < this.dataSize) {
        return `The Sink Capabilities Extended message has only been partially transferred: expected ${this.dataSize} bytes but received ${this.rawPayload.length}.`
      }
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Sink Capabilities Extended Data Block.${parseErrorText}`.trim()
    }

    const block = this.sinkCapabilitiesExtended
    const lines = [
      '**Sink capabilities extended information:**',
      '',
      `- USB Vendor ID: ${formatHex(block.vid, 4)}`,
      `- Product ID: ${formatHex(block.pid, 4)}`,
      `- XID value: ${formatHex(block.xid, 8)}`,
      `- Firmware version: ${block.fwVersion}`,
      `- Hardware version: ${block.hwVersion}`,
      `- Sink capabilities extended data block version: ${block.skedbVersion}`,
      `- Standard Power Range sink power data profile: minimum ${block.sprSinkMinimumPdp}W, operational ${block.sprSinkOperationalPdp}W, maximum ${block.sprSinkMaximumPdp}W`,
      `- Extended Power Range sink power data profile: minimum ${block.eprSinkMinimumPdp}W, operational ${block.eprSinkOperationalPdp}W, maximum ${block.eprSinkMaximumPdp}W`,
    ]

    const sinkModes = describeSinkModes(block.sinkModes)
    if (sinkModes.length > 0) {
      lines.push(`- Sink modes: ${sinkModes.join(', ')}`)
    }
    if (block.fixedBatteries > 0) {
      lines.push(`- Fixed batteries: ${block.fixedBatteries}`)
    }
    if (block.hotSwappableBatterySlots > 0) {
      lines.push(`- Hot-swappable battery slots: ${block.hotSwappableBatterySlots}`)
    }

    if (this.parseErrors.length > 0) {
      lines.push('', `**Could not decode all sink capability data:** ${this.parseErrors.join(' ')}`)
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
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Sink_Capabilities_Extended is an extended message that reports detailed sink capability metrics so a source can make better policy and power allocation decisions.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the sink capability details carried by this Sink_Capabilities_Extended message.',
      ),
    )

    if (this.sinkCapabilitiesExtended) {
      metadata.messageSpecificData.setEntry(
        'sinkCapabilitiesExtendedDataBlock',
        buildSinkCapabilitiesExtendedDataBlockMetadata(this.sinkCapabilitiesExtended),
      )
    }
    return metadata
  }

}
