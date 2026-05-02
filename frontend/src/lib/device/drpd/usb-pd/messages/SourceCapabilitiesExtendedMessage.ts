import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildSourceCapabilitiesExtendedDataBlockMetadata,
  parseSourceCapabilitiesExtendedDataBlock,
  type ParsedSourceCapabilitiesExtendedDataBlock,
} from '../DataObjects'

const formatHex = (value: number, width: number): string => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`
const LEGACY_SCEDB_LENGTH = 24
const USB_PD_3_2_SCEDB_LENGTH = 25

const describeVoltageRegulation = (value: number): string => {
  const slew = value & 0b11
  const magnitude = (value >> 2) & 0b1
  const slewText = slew === 0b00 ? '150 mA/µs load step' : slew === 0b01 ? '500 mA/µs load step' : 'reserved load step'
  const magnitudeText = magnitude === 0b0 ? '25% IoC load step magnitude' : '90% IoC load step magnitude'
  return `${slewText}; ${magnitudeText}`
}

const describeCompliance = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 0)) !== 0) meanings.push('LPS')
  if ((value & (1 << 1)) !== 0) meanings.push('PS1')
  if ((value & (1 << 2)) !== 0) meanings.push('PS2')
  return meanings.length > 0 ? meanings.join(', ') : 'No asserted compliance flags'
}

const describeTouchCurrent = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 0)) !== 0) meanings.push('low touch current EPS')
  if ((value & (1 << 1)) !== 0) meanings.push('ground pin supported')
  if ((value & (1 << 2)) !== 0) meanings.push('ground pin intended for protective earth')
  return meanings.length > 0 ? meanings.join(', ') : 'No asserted touch-current flags'
}

const describePeakCurrent = (value: number): string => {
  const percentOverload = value & 0x1f
  const overloadPeriod = (value >> 5) & 0x3f
  const dutyCycle = (value >> 11) & 0x0f
  const droop = ((value >> 15) & 0x1) === 1
  return `${Math.min(percentOverload, 25) * 10}% overload for ${overloadPeriod * 20} ms at ${dutyCycle * 5}% duty cycle; VBUS voltage droop ${droop ? 'allowed' : 'not allowed'}`
}

const describeTouchTemp = (value: number): string => {
  switch (value) {
    case 0: return 'IEC 60950-1'
    case 1: return 'IEC 62368-1 TS1'
    case 2: return 'IEC 62368-1 TS2'
    default: return 'Reserved'
  }
}

const describeSourceInputs = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 0)) !== 0) {
    meanings.push('external supply present')
    meanings.push((value & (1 << 1)) !== 0 ? 'external supply unconstrained' : 'external supply constrained')
  }
  if ((value & (1 << 2)) !== 0) meanings.push('internal battery present')
  return meanings.length > 0 ? meanings.join(', ') : 'No asserted source inputs'
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
      dataBlock.length >= LEGACY_SCEDB_LENGTH ? parseSourceCapabilitiesExtendedDataBlock(dataBlock) : null
    if (dataBlock.length === LEGACY_SCEDB_LENGTH) {
      this.parseErrors.push(
        'Legacy 24-byte Source Capabilities Extended Data Block: missing EPR Source PDP Rating byte required by USB PD 3.2.',
      )
    } else if (dataBlock.length > LEGACY_SCEDB_LENGTH && dataBlock.length < USB_PD_3_2_SCEDB_LENGTH) {
      this.parseErrors.push(
        `Source_Capabilities_Extended expected ${USB_PD_3_2_SCEDB_LENGTH} bytes for USB PD 3.2 but received ${dataBlock.length}`,
      )
    }
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
    const lines = [
      '**Source capabilities extended information:**',
      '',
      `- USB Vendor ID: ${formatHex(block.vid, 4)}`,
      `- Product ID: ${formatHex(block.pid, 4)}`,
      `- XID value: ${formatHex(block.xid, 8)}`,
      `- Firmware version: ${block.fwVersion}`,
      `- Hardware version: ${block.hwVersion}`,
      `- Voltage regulation: ${describeVoltageRegulation(block.voltageRegulation)}`,
      `- Holdup time: ${block.holdupTimeMs} ms`,
      `- Compliance: ${describeCompliance(block.compliance)}`,
      `- Touch current: ${describeTouchCurrent(block.touchCurrent)}`,
      `- Peak current 1: ${describePeakCurrent(block.peakCurrent1)}`,
      `- Peak current 2: ${describePeakCurrent(block.peakCurrent2)}`,
      `- Peak current 3: ${describePeakCurrent(block.peakCurrent3)}`,
      `- Touch temperature: ${describeTouchTemp(block.touchTemp)}`,
      `- Source inputs: ${describeSourceInputs(block.sourceInputs)}`,
      `- Fixed batteries: ${block.fixedBatteries}`,
      `- Hot-swappable battery slots: ${block.hotSwappableBatterySlots}`,
      `- Standard Power Range source power data profile rating: ${block.sprSourcePdpRating}W`,
      block.eprSourcePdpRating === null
        ? '- Extended Power Range source power data profile rating: unavailable (legacy 24-byte SCEDB)'
        : `- Extended Power Range source power data profile rating: ${block.eprSourcePdpRating}W`,
    ]

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
