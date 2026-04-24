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
  type ParsedActiveCableVDO1,
  type ParsedActiveCableVDO2,
  type ParsedDFPVDO,
  type ParsedDiscoverIdentity,
  type ParsedPassiveCableVDO,
  type ParsedUFPVDO,
  type ParsedVPDVDO,
  type ParsedVDMHeader,
} from '../DataObjects'

const formatHex16 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(4, '0')}`

const formatHex32 = (value: number): string => `0x${value.toString(16).toUpperCase().padStart(8, '0')}`

const formatVDOList = (values: number[]): string => values.map(formatHex32).join(', ')

const formatStructuredVDMName = (vdmHeader: ParsedVDMHeader): string => {
  const commandName = vdmHeader.commandName ?? `Command ${vdmHeader.command ?? 0}`
  const commandTypeName = vdmHeader.commandTypeName ?? 'Unknown'
  return `${commandName} ${commandTypeName}`
}

const formatYesNo = (value: boolean): string => value ? 'yes' : 'no'

const formatPlugType = (code: number): string => {
  switch (code) {
    case 0b10:
      return 'USB Type-C'
    case 0b11:
      return 'captive'
    default:
      return `reserved code ${code}`
  }
}

const formatMaximumBusVoltage = (code: number): string => {
  switch (code) {
    case 0b00:
      return '20V'
    case 0b01:
      return '30V, deprecated and interpreted as 20V'
    case 0b10:
      return '40V, deprecated and interpreted as 20V'
    case 0b11:
      return '50V'
    default:
      return `reserved code ${code}`
  }
}

const formatCableCurrent = (code: number): string => {
  switch (code) {
    case 0b01:
      return '3A'
    case 0b10:
      return '5A'
    default:
      return `reserved code ${code}`
  }
}

const formatPassiveCableLatency = (code: number): string => {
  switch (code) {
    case 0b0001:
      return '<10 ns (~1 m)'
    case 0b0010:
      return '10 ns to 20 ns (~2 m)'
    case 0b0011:
      return '20 ns to 30 ns (~3 m)'
    case 0b0100:
      return '30 ns to 40 ns (~4 m)'
    case 0b0101:
      return '40 ns to 50 ns (~5 m)'
    case 0b0110:
      return '50 ns to 60 ns (~6 m)'
    case 0b0111:
      return '60 ns to 70 ns (~7 m)'
    case 0b1000:
      return '>70 ns (>~7 m)'
    default:
      return `reserved code ${code}`
  }
}

const formatPassiveCableTermination = (code: number): string => {
  switch (code) {
    case 0b00:
      return 'VCONN not required'
    case 0b01:
      return 'VCONN required'
    default:
      return `reserved code ${code}`
  }
}

const formatHighestUsbSpeed = (code: number): string => {
  switch (code) {
    case 0b000:
      return 'USB 2.0 only'
    case 0b001:
      return 'USB 3.2 Gen1'
    case 0b010:
      return 'USB 3.2 / USB4 Gen2'
    case 0b011:
      return 'USB4 Gen3'
    case 0b100:
      return 'USB4 Gen4'
    default:
      return `reserved code ${code}`
  }
}

const isPassiveCableVDO = (
  value: ParsedDiscoverIdentity['productTypeVDOs'][number],
): value is ParsedPassiveCableVDO => 'cableTerminationType' in value && !('sbuSupported' in value)

const isActiveCableVDO1 = (
  value: ParsedDiscoverIdentity['productTypeVDOs'][number],
): value is ParsedActiveCableVDO1 => 'sbuSupported' in value

const isActiveCableVDO2 = (
  value: ParsedDiscoverIdentity['productTypeVDOs'][number],
): value is ParsedActiveCableVDO2 => 'maximumOperatingTemperature' in value

const isVPDVDO = (
  value: ParsedDiscoverIdentity['productTypeVDOs'][number],
): value is ParsedVPDVDO => 'chargeThroughSupport' in value

const isUFPVDO = (
  value: ParsedDiscoverIdentity['productTypeVDOs'][number],
): value is ParsedUFPVDO => 'deviceCapability' in value

const isDFPVDO = (
  value: ParsedDiscoverIdentity['productTypeVDOs'][number],
): value is ParsedDFPVDO => 'hostCapability' in value

const describeProductTypeVDO = (
  value: ParsedDiscoverIdentity['productTypeVDOs'][number],
): string => {
  if (isPassiveCableVDO(value)) {
    return [
      'Passive Cable Vendor Data Object:',
      `  - Plug type: ${formatPlugType(value.plugToPlugOrCaptive)}`,
      `  - Extended Power Range capable: ${formatYesNo(value.eprCapable)}`,
      `  - Maximum bus voltage: ${formatMaximumBusVoltage(value.maximumVbusVoltage)}`,
      `  - Current capability: ${formatCableCurrent(value.vbusCurrentHandlingCapability)}`,
      `  - Latency: ${formatPassiveCableLatency(value.cableLatency)}`,
      `  - Termination: ${formatPassiveCableTermination(value.cableTerminationType)}`,
      `  - Highest USB speed: ${formatHighestUsbSpeed(value.usbHighestSpeed)}`,
    ].join('\n')
  }
  if (isActiveCableVDO1(value)) {
    return [
      'Active Cable Vendor Data Object 1:',
      `  - Plug type: ${formatPlugType(value.plugToPlugOrCaptive)}`,
      `  - Extended Power Range capable: ${formatYesNo(value.eprCapable)}`,
      `  - Maximum bus voltage: ${formatMaximumBusVoltage(value.maximumVbusVoltage)}`,
      `  - Current capability: ${formatCableCurrent(value.vbusCurrentHandlingCapability)}`,
      `  - Highest USB speed: ${formatHighestUsbSpeed(value.usbHighestSpeed)}`,
      `  - SOP Double Prime controller present: ${formatYesNo(value.sopDoublePrimeControllerPresent)}`,
    ].join('\n')
  }
  if (isActiveCableVDO2(value)) {
    return [
      'Active Cable Vendor Data Object 2:',
      `  - Maximum operating temperature: ${value.maximumOperatingTemperature}C`,
      `  - Shutdown temperature: ${value.shutdownTemperature}C`,
      `  - USB4 supported: ${formatYesNo(value.usb4Supported)}`,
      `  - USB 3.2 supported: ${formatYesNo(value.usb32Supported)}`,
      `  - USB lanes supported: ${formatYesNo(value.usbLanesSupported)}`,
    ].join('\n')
  }
  if (isVPDVDO(value)) {
    return [
      'VCONN-powered device Vendor Data Object:',
      `  - Maximum bus voltage: ${formatMaximumBusVoltage(value.maximumVbusVoltage)}`,
      `  - Charge-through support: ${formatYesNo(value.chargeThroughSupport)}`,
      `  - Charge-through current support: ${formatYesNo(value.chargeThroughCurrentSupport)}`,
      `  - Bus impedance code: ${value.vbusImpedance}`,
      `  - Ground impedance code: ${value.groundImpedance}`,
    ].join('\n')
  }
  if (isUFPVDO(value)) {
    return [
      'Upstream-facing port Vendor Data Object:',
      `  - Device capability bits: 0b${value.deviceCapability.toString(2).padStart(4, '0')}`,
      `  - VCONN required: ${formatYesNo(value.vconnRequired)}`,
      `  - VBUS required: ${formatYesNo(value.vbusRequired)}`,
      `  - Alternate mode bits: 0b${value.alternateModes.toString(2).padStart(3, '0')}`,
      `  - Highest USB speed: ${formatHighestUsbSpeed(value.usbHighestSpeed)}`,
    ].join('\n')
  }
  if (isDFPVDO(value)) {
    return [
      'Downstream-facing port Vendor Data Object:',
      `  - Host capability bits: 0b${value.hostCapability.toString(2).padStart(3, '0')}`,
      `  - Port number: ${value.portNumber}`,
    ].join('\n')
  }
  const unknownValue = value as { raw?: number }
  return `Unrecognized product-type Vendor Data Object: ${formatHex32(unknownValue.raw ?? 0)}.`
}

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
   * Build a concise human-readable summary for this message instance.
   *
   * @returns Multiline summary of the vendor-defined payload.
   */
  public describe(): string {
    if (!this.vdmHeader) {
      const parseErrorText = this.parseErrors.length > 0 ? ` ${this.parseErrors.join(' ')}` : ''
      return `Could not decode the Vendor_Defined message header.${parseErrorText}`.trim()
    }

    const lines: string[] = []

    if (this.vdmHeader.vdmType === 'UNSTRUCTURED') {
      lines.push('**Unstructured Vendor Defined Message**')
      lines.push('')
      lines.push(`- Standard or Vendor ID: ${formatHex16(this.vdmHeader.svid)}`)
      if (this.vdmHeader.vendorPayload !== null) {
        lines.push(`- Vendor payload: 0x${this.vdmHeader.vendorPayload.toString(16).toUpperCase()}`)
      }
    } else {
      lines.push(`**Structured Vendor Defined Message:** ${formatStructuredVDMName(this.vdmHeader)}`)
      lines.push('')
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

    if (this.discoverIdentity) {
      lines.push('')
      lines.push('**Discover Identity data:**')
      if (this.discoverIdentity.idHeader) {
        const capabilities: string[] = []
        if (this.discoverIdentity.idHeader.usbHostCapable) {
          capabilities.push('USB host')
        }
        if (this.discoverIdentity.idHeader.usbDeviceCapable) {
          capabilities.push('USB device')
        }
        if (this.discoverIdentity.idHeader.modalOperationSupported) {
          capabilities.push('modal operation')
        }
        lines.push(`- USB Vendor ID: ${formatHex16(this.discoverIdentity.idHeader.usbVendorId)}`)
        if (capabilities.length > 0) {
          lines.push(`- Capabilities: ${capabilities.join(', ')}`)
        }
      }
      if (this.discoverIdentity.certStat) {
        lines.push(`- Certification identifier: ${formatHex32(this.discoverIdentity.certStat.xid)}`)
      }
      if (this.discoverIdentity.product) {
        lines.push(
          `- USB Product ID: ${formatHex16(this.discoverIdentity.product.usbProductId)}`,
          `- Device release number: ${formatHex16(this.discoverIdentity.product.bcdDevice)}`,
        )
      }
      if (this.discoverIdentity.productTypeVDOs.length > 0) {
        this.discoverIdentity.productTypeVDOs.forEach((value) => {
          lines.push(`- ${describeProductTypeVDO(value)}`)
        })
      }
      if (this.discoverIdentity.rawVDOs.length > 0) {
        lines.push(`- Raw Vendor Data Objects: ${formatVDOList(this.discoverIdentity.rawVDOs)}`)
      }
    }

    if (this.discoverSVIDs.length > 0) {
      lines.push('')
      lines.push('**Discovered Standard or Vendor IDs:**')
      this.discoverSVIDs.forEach((svid) => {
        lines.push(`- ${formatHex16(svid)}`)
      })
    }

    if (this.discoverModes.length > 0) {
      lines.push('')
      lines.push(`**Discover Modes returned ${this.discoverModes.length} mode Vendor Data Object(s):**`)
      this.discoverModes.forEach((mode) => {
        lines.push(`- ${formatHex32(mode)}`)
      })
    }

    const rawVdosNeedSummary =
      this.rawVDOs.length > 0 &&
      !this.discoverIdentity &&
      this.discoverModes.length === 0 &&
      this.discoverSVIDs.length === 0
    if (rawVdosNeedSummary) {
      lines.push('')
      const payloadKind =
        this.vdmHeader.vdmType === 'STRUCTURED' && this.vdmHeader.commandName
          ? `${this.vdmHeader.commandName} payload`
          : 'Vendor payload'
      lines.push(`**${payloadKind} Vendor Data Objects:**`)
      this.rawVDOs.forEach((rawVdo) => {
        lines.push(`- ${formatHex32(rawVdo)}`)
      })
    }

    if (this.parseErrors.length > 0) {
      lines.push('')
      lines.push(`**Could not decode all vendor-defined data:** ${this.parseErrors.join(' ')}`)
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
        'Vendor_Defined is a data message carrying structured or unstructured vendor-defined objects so partners can perform alternate mode discovery and proprietary feature exchange.',
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
        'Concise description of the specific vendor-defined data carried by this Vendor_Defined message.',
      ),
    )

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
