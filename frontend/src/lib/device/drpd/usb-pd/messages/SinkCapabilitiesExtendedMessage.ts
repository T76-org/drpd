import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildSinkCapabilitiesExtendedDataBlockMetadata,
  parseSinkCapabilitiesExtendedDataBlock,
  type ParsedSinkCapabilitiesExtendedDataBlock,
} from '../DataObjects'

const formatHex = (value: number, width: number): string => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`
const LEGACY_SKEDB_LENGTH = 21
const USB_PD_3_2_SKEDB_LENGTH = 24

const describeSkedbVersion = (value: number): string =>
  value === 1 ? 'Version 1.0' : 'Reserved'

const describeLoadStep = (value: number): string => {
  const slew = value & 0b11
  return slew === 0b00 ? '150 mA/µs load step' : slew === 0b01 ? '500 mA/µs load step' : 'Reserved'
}

const describeSinkLoadCharacteristics = (value: number): string => {
  const percentOverload = value & 0x1f
  const overloadPeriod = (value >> 5) & 0x3f
  const dutyCycle = (value >> 11) & 0x0f
  const droop = ((value >> 15) & 0x1) === 1
  return `${Math.min(percentOverload, 25) * 10}% overload for ${overloadPeriod * 20} ms at ${dutyCycle * 5}% duty cycle; VBUS voltage droop ${droop ? 'tolerated' : 'not tolerated'}`
}

const describeCompliance = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 0)) !== 0) meanings.push('requires LPS source')
  if ((value & (1 << 1)) !== 0) meanings.push('requires PS1 source')
  if ((value & (1 << 2)) !== 0) meanings.push('requires PS2 source')
  return meanings.length > 0 ? meanings.join(', ') : 'No asserted compliance requirements'
}

const describeTouchTemp = (value: number): string => {
  switch (value) {
    case 0: return 'Not applicable'
    case 1: return 'IEC 60950-1'
    case 2: return 'IEC 62368-1 TS1'
    case 3: return 'IEC 62368-1 TS2'
    default: return 'Reserved'
  }
}

const describeSinkModes = (sinkModes: number): string => {
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
  return modes.length > 0 ? modes.join(', ') : 'No asserted sink modes'
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
      dataBlock.length >= LEGACY_SKEDB_LENGTH ? parseSinkCapabilitiesExtendedDataBlock(dataBlock) : null
    if (dataBlock.length === LEGACY_SKEDB_LENGTH) {
      this.parseErrors.push(
        'Legacy 21-byte Sink Capabilities Extended Data Block: missing EPR Sink PDP bytes required by USB PD 3.2.',
      )
    } else if (dataBlock.length > LEGACY_SKEDB_LENGTH && dataBlock.length < USB_PD_3_2_SKEDB_LENGTH) {
      this.parseErrors.push(
        `Sink_Capabilities_Extended expected ${USB_PD_3_2_SKEDB_LENGTH} bytes for USB PD 3.2 but received ${dataBlock.length}`,
      )
    }
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
      `- Sink capabilities extended data block version: ${describeSkedbVersion(block.skedbVersion)}`,
      `- Load step: ${describeLoadStep(block.loadStep)}`,
      `- Sink load characteristics: ${describeSinkLoadCharacteristics(block.sinkLoadCharacteristics)}`,
      `- Compliance: ${describeCompliance(block.compliance)}`,
      `- Touch temperature: ${describeTouchTemp(block.touchTemp)}`,
      `- Fixed batteries: ${block.fixedBatteries}`,
      `- Hot-swappable battery slots: ${block.hotSwappableBatterySlots}`,
      `- Sink modes: ${describeSinkModes(block.sinkModes)}`,
      `- Standard Power Range sink power data profile: minimum ${block.sprSinkMinimumPdp}W, operational ${block.sprSinkOperationalPdp}W, maximum ${block.sprSinkMaximumPdp}W`,
      block.eprSinkMinimumPdp === null ||
        block.eprSinkOperationalPdp === null ||
        block.eprSinkMaximumPdp === null
        ? '- Extended Power Range sink power data profile: unavailable (legacy 21-byte SKEDB)'
        : `- Extended Power Range sink power data profile: minimum ${block.eprSinkMinimumPdp}W, operational ${block.eprSinkOperationalPdp}W, maximum ${block.eprSinkMaximumPdp}W`,
    ]

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
