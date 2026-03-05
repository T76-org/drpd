import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  parseDiscoverIdentityVDOs,
  parseVDMHeader,
  readDataObjects,
  type ParsedDiscoverIdentity,
  type ParsedVDMHeader,
} from '../DataObjects'

/**
 * Vendor_Defined data message.
 */
export class VendorDefinedMessage extends DataMessage {
  ///< Raw payload bytes after headers.
  public readonly rawPayload: Uint8Array
  ///< Raw data object values.
  public readonly rawDataObjects: number[]
  ///< Parsed VDM header.
  public readonly vdmHeader: ParsedVDMHeader | null
  ///< Raw VDO list (excluding VDM header).
  public readonly rawVDOs: number[]
  ///< Parsed Discover Identity response.
  public readonly discoverIdentity: ParsedDiscoverIdentity | null
  ///< Parsed Discover SVIDs list.
  public readonly discoverSVIDs: number[]
  ///< Parsed Discover Modes VDO list.
  public readonly discoverModes: number[]
  ///< Parsing errors.
  public readonly parseErrors: string[]

  /**
   * Create a Vendor_Defined message.
   *
   * @param sop - SOP metadata.
   * @param header - Parsed header.
   * @param payload - Raw payload bytes.
   * @param messageTypeName - Message type name.
   */
  public constructor(
    sop: DataMessage['sop'],
    header: DataMessage['header'],
    payload: Uint8Array,
    messageTypeName: string,
  ) {
    super(sop, header, payload, messageTypeName)
    this.parseErrors = []
    this.rawPayload = payload.subarray(this.payloadOffset)
    const availableCount = Math.floor(this.rawPayload.length / 4)
    if (availableCount < 1) {
      this.parseErrors.push('Vendor_Defined message missing VDM header')
      this.rawDataObjects = []
      this.vdmHeader = null
      this.rawVDOs = []
      this.discoverIdentity = null
      this.discoverSVIDs = []
      this.discoverModes = []
      return
    }
    this.rawDataObjects = readDataObjects(payload, this.payloadOffset, availableCount)
    this.vdmHeader = parseVDMHeader(this.rawDataObjects[0])
    this.rawVDOs = this.rawDataObjects.slice(1)
    this.discoverIdentity = null
    this.discoverSVIDs = []
    this.discoverModes = []

    if (this.vdmHeader.vdmType === 'STRUCTURED' && this.vdmHeader.commandTypeName === 'ACK') {
      if (this.vdmHeader.commandName === 'DISCOVER_IDENTITY') {
        this.discoverIdentity = parseDiscoverIdentityVDOs(this.rawVDOs, this.sop.kind)
      } else if (this.vdmHeader.commandName === 'DISCOVER_SVIDS') {
        const svids: number[] = []
        for (const raw of this.rawVDOs) {
          const high = (raw >>> 16) & 0xffff
          const low = raw & 0xffff
          if (high === 0 && low === 0) {
            break
          }
          if (high !== 0) {
            svids.push(high)
          }
          if (low !== 0) {
            svids.push(low)
          }
        }
        this.discoverSVIDs = svids
      } else if (this.vdmHeader.commandName === 'DISCOVER_MODES') {
        this.discoverModes = [...this.rawVDOs]
      }
    }
  }

  /**
   * Human-readable metadata for this message.
   *
   * @returns Ordered dictionary with message description.
   */
  public override get humanReadableMetadata() {
    const metadata = super.humanReadableMetadata
    metadata.baseInformation.insertEntryAt(1, 'Message Description', HumanReadableField.string('Vendor_Defined is a data message carrying structured or unstructured vendor-defined objects so partners can perform alternate mode discovery and proprietary feature exchange.', 'A description of the message\'s function and usage.'))
    return metadata
  }

}
