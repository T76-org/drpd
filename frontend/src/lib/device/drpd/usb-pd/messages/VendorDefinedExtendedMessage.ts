import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildVDMHeaderMetadata, parseVDMHeader, readUint32LE, type ParsedVDMHeader } from '../DataObjects'

const formatHex16 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`

const formatHexByte = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`

const formatStructuredVDMName = (vdmHeader: ParsedVDMHeader): string => {
  const commandName = vdmHeader.commandName ?? `Command ${vdmHeader.command ?? 0}`
  const commandTypeName = vdmHeader.commandTypeName ?? 'Unknown'
  return `${commandName} ${commandTypeName}`
}

const formatBytePreview = (data: Uint8Array): string =>
  Array.from(data.subarray(0, 8)).map(formatHexByte).join(', ')

/**
 * Vendor_Defined_Extended extended message.
 */
export class VendorDefinedExtendedMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Parsed VDM header.
  public readonly vdmHeader: ParsedVDMHeader | null
  ///< Vendor data bytes after VDM header.
  public readonly vendorData: Uint8Array
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
   * Create a Vendor_Defined_Extended message.
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
        `Vendor_Defined_Extended expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    if (dataBlock.length >= 4) {
      const vdmRaw = readUint32LE(dataBlock, 0)
      this.vdmHeader = parseVDMHeader(vdmRaw)
      this.vendorData = dataBlock.subarray(4)
    } else {
      this.vdmHeader = null
      this.vendorData = new Uint8Array()
    }
  }

  /**
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Markdown summary of the vendor-defined extended message.
   */
  public describe(): string {
    if (!this.vdmHeader) {
      if (this.rawPayload.length < this.dataSize) {
        return `The Vendor Defined Extended message has only been partially transferred: expected ${this.dataSize} bytes but received ${this.rawPayload.length}.`
      }
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Vendor Defined Message header.${parseErrorText}`.trim()
    }

    const lines: string[] = []
    if (this.vdmHeader.vdmType === 'UNSTRUCTURED') {
      lines.push('**Unstructured Vendor Defined Extended Message**', '')
      lines.push(`- Standard or Vendor ID: ${formatHex16(this.vdmHeader.svid)}`)
      if (this.vdmHeader.vendorPayload !== null) {
        lines.push(`- Vendor payload: 0x${this.vdmHeader.vendorPayload.toString(16).toUpperCase()}`)
      }
    } else {
      lines.push(`**Structured Vendor Defined Extended Message:** ${formatStructuredVDMName(this.vdmHeader)}`, '')
      lines.push(`- Standard or Vendor ID: ${formatHex16(this.vdmHeader.svid)}`)
      if (this.vdmHeader.objectPosition !== null && this.vdmHeader.objectPosition > 0) {
        lines.push(`- Object position: ${this.vdmHeader.objectPosition}`)
      }
      if (this.vdmHeader.structuredVersionMajor !== null && this.vdmHeader.structuredVersionMinor !== null) {
        lines.push(
          `- Structured Vendor Defined Message version: ${this.vdmHeader.structuredVersionMajor}.${this.vdmHeader.structuredVersionMinor}`,
        )
      }
    }

    lines.push('', '**Extended vendor data:**', `- Payload bytes: ${this.vendorData.length}`)
    if (this.vendorData.length > 0) {
      const suffix = this.vendorData.length > 8 ? ' ...' : ''
      lines.push(`- Preview: ${formatBytePreview(this.vendorData)}${suffix}`)
    }

    if (this.parseErrors.length > 0) {
      lines.push('', `**Could not decode all vendor-defined extended data:** ${this.parseErrors.join(' ')}`)
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
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Vendor_Defined_Extended is an extended message carrying vendor-specific payload content so implementations can exchange proprietary data beyond standard USB-PD fields.', 'Message Description', 'A description of the message\'s function and usage.'))
    metadata.baseInformation.insertEntryAt(
      2,
      'messageSummary',
      HumanReadableField.string(
        this.describe(),
        'Message Summary',
        'Concise description of the vendor-defined extended message header and payload bytes.',
      ),
    )

    if (this.vdmHeader) {
      metadata.messageSpecificData.setEntry('vdmHeader', buildVDMHeaderMetadata(this.vdmHeader))
    }
    metadata.messageSpecificData.setEntry(
      'vendorData',
      HumanReadableField.byteData(
        this.vendorData,
        8,
        false,
        'Vendor Data',
        'Raw vendor-defined extended payload bytes that follow the Vendor Defined Message header.',
      ),
    )
    return metadata
  }

}
