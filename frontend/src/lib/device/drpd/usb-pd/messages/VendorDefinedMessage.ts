import { DataMessage } from '../messageBase'
import { HumanReadableField } from '../humanReadableField'
import {
  buildAttentionVDOMetadata,
  buildDiscoverIdentityMetadata,
  buildEnterModePayloadVDOMetadata,
  buildExitModePayloadVDOMetadata,
  buildModesVDOMetadata,
  buildSVIDsVDOMetadata,
  buildVDMHeaderMetadata,
  parseAttentionVDO,
  parseDiscoverIdentityVDOs,
  parseEnterModePayloadVDO,
  parseExitModePayloadVDO,
  parseModesVDO,
  parseSVIDsVDO,
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
    const expectedCount = header.messageHeader.numberOfDataObjects
    const availableCount = Math.floor(this.rawPayload.length / 4)
    const count = Math.min(expectedCount, availableCount)
    if (expectedCount > availableCount) {
      this.parseErrors.push(
        `Vendor_Defined expected ${expectedCount} data objects but only ${availableCount} available`,
      )
    }
    if (count < 1) {
      this.parseErrors.push('Vendor_Defined message missing VDM header')
      this.rawDataObjects = []
      this.vdmHeader = null
      this.rawVDOs = []
      this.discoverIdentity = null
      this.discoverSVIDs = []
      this.discoverModes = []
      return
    }
    this.rawDataObjects = readDataObjects(payload, this.payloadOffset, count)
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
    metadata.baseInformation.insertEntryAt(1, 'messageDescription', HumanReadableField.string('Vendor_Defined is a data message carrying structured or unstructured vendor-defined objects so partners can perform alternate mode discovery and proprietary feature exchange.', 'Message Description', 'A description of the message\'s function and usage.'))

    if (this.vdmHeader) {
      metadata.messageSpecificData.setEntry('vdmHeader', buildVDMHeaderMetadata(this.vdmHeader))
    }
    if (this.discoverIdentity) {
      metadata.messageSpecificData.setEntry('discoverIdentity', buildDiscoverIdentityMetadata(this.discoverIdentity))
    }
    if (this.discoverSVIDs.length > 0) {
      const discoverSvids = HumanReadableField.orderedDictionary(
        'Discover SVIDs',
        'Ordered collection of SVID values returned by a Discover SVIDs Structured Vendor Defined Message.',
      )
      this.discoverSVIDs.forEach((svid, index) => {
        discoverSvids.setEntry(
          `svid${index + 1}`,
          HumanReadableField.string(
            `0x${svid.toString(16).toUpperCase().padStart(4, '0')}`,
            `SVID ${index + 1}`,
            'Standard or vendor identifier reported by the Discover SVIDs response.',
          ),
        )
      })
      metadata.messageSpecificData.setEntry('discoverSvids', discoverSvids)
      const discoverSvidVdos = HumanReadableField.orderedDictionary(
        'Discover SVIDs VDOs',
        'Ordered collection of Discover SVIDs responder VDOs preserved in payload order.',
      )
      this.rawVDOs.forEach((raw, index) => {
        discoverSvidVdos.setEntry(`vdo${index + 1}`, buildSVIDsVDOMetadata(parseSVIDsVDO(raw)))
      })
      metadata.messageSpecificData.setEntry('discoverSvidVdos', discoverSvidVdos)
    }
    if (this.discoverModes.length > 0) {
      const discoverModes = HumanReadableField.orderedDictionary(
        'Discover Modes',
        'Ordered collection of Discover Modes VDOs returned by a Discover Modes Structured Vendor Defined Message.',
      )
      this.discoverModes.forEach((mode, index) => {
        discoverModes.setEntry(`modeVdo${index + 1}`, buildModesVDOMetadata(parseModesVDO(mode)))
      })
      metadata.messageSpecificData.setEntry('discoverModes', discoverModes)
    }
    if (this.vdmHeader?.vdmType === 'STRUCTURED' && this.vdmHeader.commandName === 'ENTER_MODE' && this.rawVDOs.length > 0) {
      const enterModePayloads = HumanReadableField.orderedDictionary(
        'Enter Mode Payload VDOs',
        'Ordered collection of optional Enter Mode payload VDOs. The detailed layout is mode specific.',
      )
      this.rawVDOs.forEach((raw, index) => {
        enterModePayloads.setEntry(`vdo${index + 1}`, buildEnterModePayloadVDOMetadata(parseEnterModePayloadVDO(raw)))
      })
      metadata.messageSpecificData.setEntry('enterModePayloadVdos', enterModePayloads)
    }
    if (this.vdmHeader?.vdmType === 'STRUCTURED' && this.vdmHeader.commandName === 'EXIT_MODE' && this.rawVDOs.length > 0) {
      const exitModePayloads = HumanReadableField.orderedDictionary(
        'Exit Mode Payload VDOs',
        'Ordered collection of optional Exit Mode payload VDOs. The detailed layout is mode specific.',
      )
      this.rawVDOs.forEach((raw, index) => {
        exitModePayloads.setEntry(`vdo${index + 1}`, buildExitModePayloadVDOMetadata(parseExitModePayloadVDO(raw)))
      })
      metadata.messageSpecificData.setEntry('exitModePayloadVdos', exitModePayloads)
    }
    if (this.vdmHeader?.vdmType === 'STRUCTURED' && this.vdmHeader.commandName === 'ATTENTION' && this.rawVDOs.length > 0) {
      const attentionPayloads = HumanReadableField.orderedDictionary(
        'Attention VDOs',
        'Ordered collection of Attention payload VDOs. The detailed layout is standard- or vendor-mode specific.',
      )
      this.rawVDOs.forEach((raw, index) => {
        attentionPayloads.setEntry(`vdo${index + 1}`, buildAttentionVDOMetadata(parseAttentionVDO(raw)))
      })
      metadata.messageSpecificData.setEntry('attentionVdos', attentionPayloads)
    }
    if (this.rawVDOs.length > 0 && !this.discoverIdentity && this.discoverModes.length === 0 && this.discoverSVIDs.length === 0) {
      const rawVdos = HumanReadableField.orderedDictionary(
        'Raw VDOs',
        'Vendor Data Objects preserved without a richer structured interpretation in the current parser.',
      )
      this.rawVDOs.forEach((raw, index) => {
        rawVdos.setEntry(
          `rawVdo${index + 1}`,
          HumanReadableField.string(
            `0x${raw.toString(16).toUpperCase().padStart(8, '0')}`,
            `Raw VDO ${index + 1}`,
            'Raw Vendor Data Object preserved for a vendor-defined payload that does not yet have a richer parser path.',
          ),
        )
      })
      metadata.messageSpecificData.setEntry('rawVdos', rawVdos)
    }
    return metadata
  }

}
