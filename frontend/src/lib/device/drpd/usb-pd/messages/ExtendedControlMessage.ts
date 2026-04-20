import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildExtendedControlDataBlockMetadata,
  parseExtendedControlDataBlock,
  type ParsedExtendedControlDataBlock,
} from '../DataObjects'

const getExtendedControlSummary = (type: number): {
  commandName: string
  commandDescription: string
} => {
  switch (type) {
    case 0x01:
      return {
        commandName: 'EPR_Get_Source_Cap',
        commandDescription: 'Requests Extended Power Range source capabilities.',
      }
    case 0x02:
      return {
        commandName: 'EPR_Get_Sink_Cap',
        commandDescription: 'Requests Extended Power Range sink capabilities.',
      }
    case 0x03:
      return {
        commandName: 'EPR_KeepAlive',
        commandDescription: 'Keeps an active Extended Power Range session alive.',
      }
    case 0x04:
      return {
        commandName: 'EPR_KeepAlive_Ack',
        commandDescription: 'Acknowledges an Extended Power Range keep-alive message.',
      }
    default:
      return {
        commandName: `Reserved type 0x${type.toString(16).toUpperCase().padStart(2, '0')}`,
        commandDescription: 'This Extended_Control type is reserved.',
      }
  }
}

/**
 * Extended_Control extended message.
 */
export class ExtendedControlMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Parsed ECDB.
  public readonly extendedControlDataBlock: ParsedExtendedControlDataBlock | null
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
   * Create an Extended_Control message.
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
        `Extended_Control expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    this.extendedControlDataBlock =
      dataBlock.length >= 2 ? parseExtendedControlDataBlock(dataBlock) : null
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the Extended_Control command and data byte.
   */
  public describe(): string {
    if (!this.extendedControlDataBlock) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Extended Control Data Block.${parseErrorText}`.trim()
    }

    const block = this.extendedControlDataBlock
    const summary = getExtendedControlSummary(block.type)
    const lines = [
      '**Extended control command:**',
      '',
      `- Command: ${summary.commandName}`,
      `- Meaning: ${summary.commandDescription}`,
    ]

    if (this.parseErrors.length > 0) {
      lines.push('', `**Could not decode all Extended_Control data:** ${this.parseErrors.join(' ')}`)
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
    metadata.baseInformation.insertEntryAt(
      1,
      'messageDescription',
      HumanReadableField.string(
        'Extended_Control is an extended message used for short control subcommands, including EPR control operations, so partners can perform lightweight protocol management actions.',
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
        'Concise description of the specific command and data byte carried by this Extended_Control message.',
      ),
    )

    if (this.extendedControlDataBlock) {
      metadata.messageSpecificData.setEntry(
        'extendedControlDataBlock',
        buildExtendedControlDataBlockMetadata(this.extendedControlDataBlock),
      )
    }
    return metadata
  }

}
