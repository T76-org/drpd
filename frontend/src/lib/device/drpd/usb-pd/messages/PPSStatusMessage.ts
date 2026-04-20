import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildPPSStatusDataBlockMetadata, parsePPSStatusDataBlock, type ParsedPPSStatusDataBlock } from '../DataObjects'

const formatScaledValue = (value: number): string => Number(value.toFixed(2)).toString()

const formatVoltageMv = (valueMv: number): string => `${formatScaledValue(valueMv / 1000)}V`

const formatCurrentMa = (valueMa: number): string => `${formatScaledValue(valueMa / 1000)}A`

const describeTemperatureFlag = (flags: number): string => {
  switch ((flags >> 1) & 0b11) {
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

const describeOperatingMode = (flags: number): string =>
  ((flags >> 3) & 0x01) === 1 ? 'current limit mode' : 'constant voltage mode'

/**
 * PPS_Status extended message.
 */
export class PPSStatusMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Parsed PPSSDB.
  public readonly ppsStatusDataBlock: ParsedPPSStatusDataBlock | null
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
   * Create a PPS_Status message.
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
        `PPS_Status expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.ppsStatusDataBlock = dataBlock.length >= 4 ? parsePPSStatusDataBlock(dataBlock) : null
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the PPS output status.
   */
  public describe(): string {
    if (!this.ppsStatusDataBlock) {
      if (this.rawPayload.length < this.dataSize) {
        return `The PPS Status message has only been partially transferred: expected ${this.dataSize} bytes but received ${this.rawPayload.length}.`
      }
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the PPS Status Data Block.${parseErrorText}`.trim()
    }

    return [
      '**Programmable Power Supply status:**',
      '',
      `- Output voltage: ${formatVoltageMv(this.ppsStatusDataBlock.outputVoltage20mV * 20)}`,
      `- Output current: ${formatCurrentMa(this.ppsStatusDataBlock.outputCurrent50mA * 50)}`,
      `- Temperature flag: ${describeTemperatureFlag(this.ppsStatusDataBlock.realTimeFlags)}`,
      `- Operating mode: ${describeOperatingMode(this.ppsStatusDataBlock.realTimeFlags)}`,
    ].join('\n')
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('PPS_Status is an extended message that reports programmable power supply status values so the source and sink can monitor PPS output behavior and status.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the Programmable Power Supply status carried by this PPS_Status message.',
      ),
    )

    if (this.ppsStatusDataBlock) {
      metadata.messageSpecificData.setEntry('ppsStatusDataBlock', buildPPSStatusDataBlockMetadata(this.ppsStatusDataBlock))
    }
    return metadata
  }

}
