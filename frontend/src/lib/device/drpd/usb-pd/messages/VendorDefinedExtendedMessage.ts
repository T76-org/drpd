import { ExtendedMessage } from '../messageBase'
import { parseVDMHeader, readUint32LE, type ParsedVDMHeader } from '../dataObjects'

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
}
