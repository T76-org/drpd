import { ExtendedMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import { buildPDOMetadata, parsePDO, readDataObjects, type ParsedPDO } from '../DataObjects'

/**
 * EPR_Source_Capabilities extended message.
 */
export class EPRSourceCapabilitiesMessage extends ExtendedMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw PDO values.
  public readonly rawPDOs: number[]
  ///< Parsed SPR PDOs (first 7).
  public readonly sprPDOs: ParsedPDO[]
  ///< Parsed EPR PDOs (remaining).
  public readonly eprPDOs: ParsedPDO[]
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
   * Create an EPR_Source_Capabilities message.
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
    const payloadComplete = payload.length >= dataEnd
    if (payload.length < dataEnd) {
      this.parseErrors.push(
        `EPR_Source_Capabilities expected ${this.dataSize} bytes but only ${payload.length - this.payloadOffset} available`,
      )
    }
    const dataBlock = payload.subarray(this.payloadOffset, Math.min(dataEnd, payload.length))
    const pdoCount = payloadComplete ? Math.floor(dataBlock.length / 4) : 0
    this.rawPDOs = pdoCount > 0 ? readDataObjects(dataBlock, 0, pdoCount) : []
    const decoded = this.rawPDOs.map((raw) => parsePDO(raw, 'source'))
    this.sprPDOs = decoded.slice(0, 7)
    this.eprPDOs = decoded.slice(7)
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('EPR_Source_Capabilities is an extended message that advertises source EPR capability data so a sink can request valid high-power EPR operating points.', 'Message Description', 'A description of the message\'s function and usage.'))

    const decodedPDOs = [...this.sprPDOs, ...this.eprPDOs]
    if (decodedPDOs.length > 0) {
      const powerDataObjects = HumanReadableField.orderedDictionary(
        'Power Data Objects',
        'Ordered collection of source Power Data Objects advertised by the EPR_Source_Capabilities message.',
      )
      decodedPDOs.forEach((pdo, index) => powerDataObjects.setEntry(`pdo${index + 1}`, buildPDOMetadata(pdo)))
      metadata.messageSpecificData.setEntry('powerDataObjects', powerDataObjects)
    }
    return metadata
  }

}
