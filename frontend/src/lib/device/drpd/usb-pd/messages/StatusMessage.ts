import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildSOPPrimeStatusDataBlockMetadata,
  buildSOPStatusDataBlockMetadata,
  parseSOPPrimeStatusDataBlock,
  parseSOPStatusDataBlock,
  type ParsedSOPPrimeStatusDataBlock,
  type ParsedSOPStatusDataBlock,
} from '../DataObjects'

const formatHexByte = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`
const MIN_SOP_STATUS_LENGTH = 6

const describeInternalTemperature = (value: number): string => {
  if (value === 0) {
    return 'unsupported'
  }
  if (value === 1) {
    return '<2C'
  }
  return `${value}C`
}

const describePresentInputs = (value: number): string => {
  const inputs: string[] = []
  if ((value & (1 << 1)) !== 0) {
    inputs.push((value & (1 << 2)) !== 0 ? 'external AC power' : 'external DC power')
  }
  if ((value & (1 << 3)) !== 0) {
    inputs.push('internal battery power')
  }
  if ((value & (1 << 4)) !== 0) {
    inputs.push('internal non-battery power')
  }
  return inputs.length > 0 ? inputs.join(', ') : 'none'
}

const describePresentBatteryInput = (value: number): string => {
  const fixedBatteries = value & 0x0f
  const hotSwappableBatteries = (value >> 4) & 0x0f
  const values: string[] = []
  if (fixedBatteries !== 0) {
    values.push(`fixed battery bits 0x${fixedBatteries.toString(16).toUpperCase()}`)
  }
  if (hotSwappableBatteries !== 0) {
    values.push(`hot-swappable battery bits 0x${hotSwappableBatteries.toString(16).toUpperCase()}`)
  }
  return values.length > 0 ? values.join(', ') : 'none'
}

const describeEventFlags = (value: number): string => {
  const events: string[] = []
  if ((value & (1 << 1)) !== 0) {
    events.push('over-current protection event')
  }
  if ((value & (1 << 2)) !== 0) {
    events.push('over-temperature protection event')
  }
  if ((value & (1 << 3)) !== 0) {
    events.push('over-voltage protection event')
  }
  if ((value & (1 << 4)) !== 0) {
    events.push('current-limit mode for Programmable Power Supply')
  }
  return events.length > 0 ? events.join(', ') : 'none'
}

const describeTemperatureStatus = (value: number): string => {
  switch ((value >> 1) & 0b11) {
    case 0b00:
      return 'not supported'
    case 0b01:
      return 'normal'
    case 0b10:
      return 'warning'
    case 0b11:
      return 'over temperature'
    default:
      return 'reserved'
  }
}

const describePowerStatus = (value: number): string => {
  const statuses: string[] = []
  if ((value & (1 << 1)) !== 0) {
    statuses.push('limited by cable-supported current')
  }
  if ((value & (1 << 2)) !== 0) {
    statuses.push('limited while sourcing other ports')
  }
  if ((value & (1 << 3)) !== 0) {
    statuses.push('limited by insufficient external power')
  }
  if ((value & (1 << 4)) !== 0) {
    statuses.push('limited by active event flags')
  }
  if ((value & (1 << 5)) !== 0) {
    statuses.push('limited by temperature')
  }
  return statuses.length > 0 ? statuses.join(', ') : 'not limited'
}

const describePowerStateChange = (value: number): string => {
  const state = value & 0b111
  const indicator = (value >> 3) & 0b111
  const stateText = ['status not supported', 'S0', 'Modern Standby', 'S3', 'S4', 'S5', 'G3', 'reserved'][state] ?? 'reserved'
  const indicatorText = ['off LED', 'on LED', 'blinking LED', 'breathing LED', 'reserved', 'reserved', 'reserved', 'reserved'][indicator] ?? 'reserved'
  return `${stateText}; ${indicatorText}`
}

/**
 * Status extended message.
 */
export class StatusMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< SOP status data block.
  public readonly sopStatusDataBlock: ParsedSOPStatusDataBlock | null
  ///< SOP' status data block.
  public readonly sopPrimeStatusDataBlock: ParsedSOPPrimeStatusDataBlock | null
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
   * Create a Status message.
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
        `Status message expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    if (this.sop.kind === 'SOP') {
      this.sopStatusDataBlock =
        dataBlock.length >= MIN_SOP_STATUS_LENGTH ? parseSOPStatusDataBlock(dataBlock) : null
      this.sopPrimeStatusDataBlock = null
    } else {
      this.sopStatusDataBlock = null
      this.sopPrimeStatusDataBlock =
        dataBlock.length >= 2 ? parseSOPPrimeStatusDataBlock(dataBlock) : null
    }
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the decoded status block.
   */
  public describe(): string {
    if (this.sopStatusDataBlock) {
      const block = this.sopStatusDataBlock
      const lines = [
        '**Port status:**',
        '',
        `- Internal temperature: ${describeInternalTemperature(block.internalTemp)}`,
        `- Present inputs: ${describePresentInputs(block.presentInput)}`,
        `- Present battery input: ${describePresentBatteryInput(block.presentBatteryInput)}`,
        `- Event flags: ${describeEventFlags(block.eventFlags)}`,
        `- Temperature status: ${describeTemperatureStatus(block.temperatureStatus)}`,
        `- Power status: ${describePowerStatus(block.powerStatus)}`,
        block.powerStateChange === null
          ? '- Power state change: not present in 6-byte SDB'
          : `- Power state change: ${describePowerStateChange(block.powerStateChange)}`,
      ]

      if (this.parseErrors.length > 0) {
        lines.push('', `**Could not decode all status data:** ${this.parseErrors.join(' ')}`)
      }

      return lines.join('\n')
    }

    if (this.sopPrimeStatusDataBlock) {
      return [
        '**Cable status:**',
        '',
        `- Internal temperature: ${describeInternalTemperature(this.sopPrimeStatusDataBlock.internalTemp)}`,
        `- Flags: ${formatHexByte(this.sopPrimeStatusDataBlock.flags)}`,
      ].join('\n')
    }

    if (this.rawPayload.length < this.dataSize) {
      return `The Status message has only been partially transferred: expected ${this.dataSize} bytes but received ${this.rawPayload.length}.`
    }

    const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
    return `Could not decode the Status data block.${parseErrorText}`.trim()
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(
      1,
      'messageDescription',
      HumanReadableField.string(
        'Status is an extended message that reports current port and power status information so the partner can evaluate health, fault, and state conditions during operation.',
        'Message Description',
        'A description of the message\'s function and usage.',
      ),
    )
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the status data carried by this Status message.',
      ),
    )

    if (this.sopStatusDataBlock) {
      metadata.messageSpecificData.setEntry('statusDataBlock', buildSOPStatusDataBlockMetadata(this.sopStatusDataBlock))
    }
    if (this.sopPrimeStatusDataBlock) {
      metadata.messageSpecificData.setEntry(
        'statusDataBlock',
        buildSOPPrimeStatusDataBlockMetadata(this.sopPrimeStatusDataBlock),
      )
    }
    return metadata
  }

}
