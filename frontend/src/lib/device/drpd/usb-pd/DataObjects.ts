import type { SOPKind } from './types'
import { readUint16LE } from './header'
import { HumanReadableField } from './humanReadableField'

/**
 * Parsed data object base type.
 */
export interface ParsedDataObject {
  ///< Raw 32-bit value.
  raw: number
}

/**
 * Parsed PDO type discriminator.
 */
export type PDOType = 'FIXED' | 'BATTERY' | 'VARIABLE' | 'APDO'

/**
 * Parsed APDO subtype discriminator.
 */
export type APDOType = 'SPR_PPS' | 'EPR_AVS' | 'SPR_AVS' | 'RESERVED'

/**
 * Parsed Fixed Supply PDO for Source or Sink.
 */
export interface FixedSupplyPDO extends ParsedDataObject {
  ///< PDO type tag.
  pdoType: 'FIXED'
  ///< PDO context (source or sink).
  context: 'source' | 'sink'
  ///< Dual-role power capability.
  dualRolePower: boolean
  ///< USB suspend supported or higher capability (sink).
  usbSuspendSupportedOrHigherCapability: boolean
  ///< Unconstrained power capability.
  unconstrainedPower: boolean
  ///< USB communications capable.
  usbCommunicationsCapable: boolean
  ///< Dual-role data capability.
  dualRoleData: boolean
  ///< Unchunked extended messages supported (source).
  unchunkedExtendedMessagesSupported: boolean
  ///< EPR capable (source).
  eprCapable: boolean
  ///< Fast Role Swap required current (sink only, encoded).
  fastRoleSwapRequiredCurrent: number | null
  ///< Peak current (source only, encoded).
  peakCurrent: number | null
  ///< Voltage in 50mV units.
  voltage50mV: number
  ///< Maximum or operational current in 10mA units.
  current10mA: number
}

/**
 * Parsed Variable Supply PDO.
 */
export interface VariableSupplyPDO extends ParsedDataObject {
  ///< PDO type tag.
  pdoType: 'VARIABLE'
  ///< PDO context (source or sink).
  context: 'source' | 'sink'
  ///< Maximum voltage in 50mV units.
  maximumVoltage50mV: number
  ///< Minimum voltage in 50mV units.
  minimumVoltage50mV: number
  ///< Maximum or operational current in 10mA units.
  current10mA: number
}

/**
 * Parsed Battery Supply PDO.
 */
export interface BatterySupplyPDO extends ParsedDataObject {
  ///< PDO type tag.
  pdoType: 'BATTERY'
  ///< PDO context (source or sink).
  context: 'source' | 'sink'
  ///< Maximum voltage in 50mV units.
  maximumVoltage50mV: number
  ///< Minimum voltage in 50mV units.
  minimumVoltage50mV: number
  ///< Maximum or operational power in 250mW units.
  power250mW: number
}

/**
 * Parsed SPR PPS APDO.
 */
export interface SPRPPSAPDO extends ParsedDataObject {
  ///< PDO type tag.
  pdoType: 'APDO'
  ///< APDO subtype.
  apdoType: 'SPR_PPS'
  ///< PDO context (source or sink).
  context: 'source' | 'sink'
  ///< PPS power limited flag (source only).
  ppsPowerLimited: boolean | null
  ///< Maximum voltage in 100mV units.
  maximumVoltage100mV: number
  ///< Minimum voltage in 100mV units.
  minimumVoltage100mV: number
  ///< Maximum current in 50mA units.
  maximumCurrent50mA: number
}

/**
 * Parsed SPR AVS APDO.
 */
export interface SPRAVSAPDO extends ParsedDataObject {
  ///< PDO type tag.
  pdoType: 'APDO'
  ///< APDO subtype.
  apdoType: 'SPR_AVS'
  ///< PDO context (source or sink).
  context: 'source' | 'sink'
  ///< Peak current (source only, encoded).
  peakCurrent: number | null
  ///< Max current at 15V in 10mA units.
  maxCurrent15V10mA: number
  ///< Max current at 20V in 10mA units.
  maxCurrent20V10mA: number
}

/**
 * Parsed EPR AVS APDO.
 */
export interface EPRAVSAPDO extends ParsedDataObject {
  ///< PDO type tag.
  pdoType: 'APDO'
  ///< APDO subtype.
  apdoType: 'EPR_AVS'
  ///< PDO context (source or sink).
  context: 'source' | 'sink'
  ///< Peak current (source only, encoded).
  peakCurrent: number | null
  ///< Maximum voltage in 100mV units.
  maximumVoltage100mV: number
  ///< Minimum voltage in 100mV units.
  minimumVoltage100mV: number
  ///< PDP in 1W units.
  pdp1W: number
}

/**
 * Parsed APDO reserved type.
 */
export interface ReservedAPDO extends ParsedDataObject {
  ///< PDO type tag.
  pdoType: 'APDO'
  ///< APDO subtype.
  apdoType: 'RESERVED'
  ///< PDO context (source or sink).
  context: 'source' | 'sink'
}

/**
 * Parsed PDO union.
 */
export type ParsedPDO =
  | FixedSupplyPDO
  | VariableSupplyPDO
  | BatterySupplyPDO
  | SPRPPSAPDO
  | SPRAVSAPDO
  | EPRAVSAPDO
  | ReservedAPDO

/**
 * Parsed RDO union with all interpretations.
 */
export interface ParsedRDO extends ParsedDataObject {
  ///< Object position.
  objectPosition: number
  ///< Giveback flag (deprecated).
  giveback: boolean
  ///< Capability mismatch flag.
  capabilityMismatch: boolean
  ///< USB communications capable flag.
  usbCommunicationsCapable: boolean
  ///< No USB suspend flag.
  noUsbSuspend: boolean
  ///< Unchunked extended messages supported flag.
  unchunkedExtendedMessagesSupported: boolean
  ///< EPR capable flag.
  eprCapable: boolean
  ///< Request type hint (unknown by default).
  requestTypeHint: 'unknown' | 'fixed_variable' | 'battery' | 'pps' | 'avs'
  ///< Fixed/Variable interpretation.
  fixedVariable: {
    ///< Operating current in 10mA units.
    operatingCurrent10mA: number
    ///< Maximum operating current in 10mA units.
    maximumOperatingCurrent10mA: number
  }
  ///< Battery interpretation.
  battery: {
    ///< Operating power in 250mW units.
    operatingPower250mW: number
    ///< Maximum operating power in 250mW units.
    maximumOperatingPower250mW: number
  }
  ///< PPS interpretation.
  pps: {
    ///< Output voltage in 20mV units.
    outputVoltage20mV: number
    ///< Operating current in 50mA units.
    operatingCurrent50mA: number
  }
  ///< AVS interpretation.
  avs: {
    ///< Output voltage in 25mV units (effective 100mV steps).
    outputVoltage25mV: number
    ///< Operating current in 50mA units.
    operatingCurrent50mA: number
  }
}

export const inferRequestTypeHintFromRaw = (raw: number): ParsedRDO['requestTypeHint'] => {
  if (getBits(raw, 8, 7) === 0 && (getBits(raw, 20, 9) !== 0 || getBits(raw, 6, 0) !== 0)) {
    return 'pps'
  }
  return 'fixed_variable'
}

export const inferRequestTypeHintFromPDO = (pdo: ParsedPDO): ParsedRDO['requestTypeHint'] => {
  if (pdo.pdoType === 'FIXED' || pdo.pdoType === 'VARIABLE') {
    return 'fixed_variable'
  }
  if (pdo.pdoType === 'BATTERY') {
    return 'battery'
  }
  if (pdo.apdoType === 'SPR_PPS') {
    return 'pps'
  }
  if (pdo.apdoType === 'SPR_AVS' || pdo.apdoType === 'EPR_AVS') {
    return 'avs'
  }
  return 'unknown'
}

/**
 * Parsed BIST Data Object.
 */
export interface ParsedBISTDataObject extends ParsedDataObject {
  ///< BIST mode value (upper nibble).
  mode: number
  ///< BIST mode name when recognized.
  modeName: string
  ///< Reserved bits value.
  reserved: number
}

/**
 * Parsed Battery Status Data Object.
 */
export interface ParsedBatteryStatusDataObject extends ParsedDataObject {
  ///< Battery present capacity in 0.1Wh units.
  batteryPresentCapacity: number
  ///< Invalid battery reference flag.
  invalidBatteryReference: boolean
  ///< Battery present flag.
  batteryPresent: boolean
  ///< Battery charging status (0..3).
  batteryChargingStatus: number
}

/**
 * Parsed Alert Data Object.
 */
export interface ParsedAlertDataObject extends ParsedDataObject {
  ///< Type of alert bitfield (8-bit).
  typeOfAlert: number
  ///< Fixed batteries bitfield.
  fixedBatteries: number
  ///< Hot swappable batteries bitfield.
  hotSwappableBatteries: number
  ///< Extended alert event type.
  extendedAlertEventType: number
}

/**
 * Parsed Country Code Data Object.
 */
export interface ParsedCountryCodeDataObject extends ParsedDataObject {
  ///< First ASCII character.
  countryCodeChar1: number
  ///< Second ASCII character.
  countryCodeChar2: number
  ///< Country code string when valid ASCII.
  countryCode: string | null
}

/**
 * Parsed Enter USB Data Object.
 */
export interface ParsedEnterUSBDataObject extends ParsedDataObject {
  ///< USB mode value.
  usbMode: number
  ///< USB4 DRD capability.
  usb4Drd: boolean
  ///< USB3 DRD capability.
  usb3Drd: boolean
  ///< Cable speed.
  cableSpeed: number
  ///< Cable type.
  cableType: number
  ///< Cable current.
  cableCurrent: number
  ///< PCIe support.
  pcieSupport: boolean
  ///< DP support.
  dpSupport: boolean
  ///< TBT support.
  tbtSupport: boolean
  ///< Host present flag.
  hostPresent: boolean
}

/**
 * Parsed EPR Mode Data Object.
 */
export interface ParsedEPRModeDataObject extends ParsedDataObject {
  ///< Action value.
  action: number
  ///< Data field.
  data: number
}

/**
 * Parsed Source Info Data Object.
 */
export interface ParsedSourceInfoDataObject extends ParsedDataObject {
  ///< Port type flag.
  portType: number
  ///< Port maximum PDP.
  portMaximumPdp: number
  ///< Port present PDP.
  portPresentPdp: number
  ///< Port reported PDP.
  portReportedPdp: number
}

/**
 * Parsed Revision Data Object.
 */
export interface ParsedRevisionDataObject extends ParsedDataObject {
  ///< Revision major.
  revisionMajor: number
  ///< Revision minor.
  revisionMinor: number
  ///< Version major.
  versionMajor: number
  ///< Version minor.
  versionMinor: number
}

/**
 * Parsed VDM header.
 */
export interface ParsedVDMHeader extends ParsedDataObject {
  ///< SVID value.
  svid: number
  ///< VDM type (structured/unstructured).
  vdmType: 'STRUCTURED' | 'UNSTRUCTURED'
  ///< Structured VDM version major.
  structuredVersionMajor: number | null
  ///< Structured VDM version minor.
  structuredVersionMinor: number | null
  ///< Object position.
  objectPosition: number | null
  ///< Command type bits.
  commandType: number | null
  ///< Command type name.
  commandTypeName: string | null
  ///< Command value.
  command: number | null
  ///< Command name.
  commandName: string | null
  ///< Vendor payload (unstructured).
  vendorPayload: number | null
}

/**
 * Parsed ID Header VDO.
 */
export interface ParsedIDHeaderVDO extends ParsedDataObject {
  ///< USB host capable flag.
  usbHostCapable: boolean
  ///< USB device capable flag.
  usbDeviceCapable: boolean
  ///< SOP product type (UFP or cable plug).
  sopProductTypeUfpOrCable: number
  ///< Modal operation supported flag.
  modalOperationSupported: boolean
  ///< SOP product type (DFP).
  sopProductTypeDfp: number
  ///< Connector type value.
  connectorType: number
  ///< USB vendor ID.
  usbVendorId: number
}

/**
 * Parsed Cert Stat VDO.
 */
export interface ParsedCertStatVDO extends ParsedDataObject {
  ///< XID value.
  xid: number
}

/**
 * Parsed Product VDO.
 */
export interface ParsedProductVDO extends ParsedDataObject {
  ///< USB product ID.
  usbProductId: number
  ///< bcdDevice value.
  bcdDevice: number
}

/**
 * Parsed UFP VDO.
 */
export interface ParsedUFPVDO extends ParsedDataObject {
  ///< VDO version.
  vdoVersion: number
  ///< Device capability bitfield.
  deviceCapability: number
  ///< VCONN power value.
  vconnPower: number
  ///< VCONN required flag.
  vconnRequired: boolean
  ///< VBUS required flag.
  vbusRequired: boolean
  ///< Alternate modes bitfield.
  alternateModes: number
  ///< USB highest speed value.
  usbHighestSpeed: number
}

/**
 * Parsed DFP VDO.
 */
export interface ParsedDFPVDO extends ParsedDataObject {
  ///< VDO version.
  vdoVersion: number
  ///< Host capability bitfield.
  hostCapability: number
  ///< Port number.
  portNumber: number
}

/**
 * Parsed Passive Cable VDO.
 */
export interface ParsedPassiveCableVDO extends ParsedDataObject {
  ///< Hardware version.
  hwVersion: number
  ///< Firmware version.
  fwVersion: number
  ///< VDO version.
  vdoVersion: number
  ///< Plug type value.
  plugToPlugOrCaptive: number
  ///< EPR capable flag.
  eprCapable: boolean
  ///< Cable latency value.
  cableLatency: number
  ///< Cable termination type.
  cableTerminationType: number
  ///< Maximum VBUS voltage value.
  maximumVbusVoltage: number
  ///< VBUS current handling capability.
  vbusCurrentHandlingCapability: number
  ///< USB highest speed value.
  usbHighestSpeed: number
}

/**
 * Parsed Active Cable VDO1.
 */
export interface ParsedActiveCableVDO1 extends ParsedDataObject {
  ///< Hardware version.
  hwVersion: number
  ///< Firmware version.
  fwVersion: number
  ///< VDO version.
  vdoVersion: number
  ///< Plug type value.
  plugToPlugOrCaptive: number
  ///< EPR capable flag.
  eprCapable: boolean
  ///< Cable latency value.
  cableLatency: number
  ///< Cable termination type.
  cableTerminationType: number
  ///< Maximum VBUS voltage value.
  maximumVbusVoltage: number
  ///< SBU supported flag.
  sbuSupported: boolean
  ///< SBU type flag.
  sbuType: boolean
  ///< VBUS current handling capability.
  vbusCurrentHandlingCapability: number
  ///< VBUS through cable flag.
  vbusThroughCable: boolean
  ///< SOP'' controller present flag.
  sopDoublePrimeControllerPresent: boolean
  ///< USB highest speed value.
  usbHighestSpeed: number
}

/**
 * Parsed Active Cable VDO2.
 */
export interface ParsedActiveCableVDO2 extends ParsedDataObject {
  ///< Maximum operating temperature.
  maximumOperatingTemperature: number
  ///< Shutdown temperature.
  shutdownTemperature: number
  ///< U3/CLd power value.
  u3CldPower: number
  ///< U3 to U0 transition mode.
  u3ToU0TransitionMode: boolean
  ///< Physical connection.
  physicalConnection: boolean
  ///< Active element type.
  activeElement: boolean
  ///< USB4 supported flag.
  usb4Supported: boolean
  ///< USB 2.0 hub hops consumed.
  usb2HubHopsConsumed: number
  ///< USB 2.0 supported flag.
  usb2Supported: boolean
  ///< USB 3.2 supported flag.
  usb32Supported: boolean
  ///< USB lanes supported flag.
  usbLanesSupported: boolean
  ///< Optically isolated active cable flag.
  opticallyIsolatedActiveCable: boolean
  ///< USB4 asymmetric mode supported flag.
  usb4AsymmetricModeSupported: boolean
  ///< USB gen flag.
  usbGen: boolean
}

/**
 * Parsed VPD VDO.
 */
export interface ParsedVPDVDO extends ParsedDataObject {
  ///< Hardware version.
  hwVersion: number
  ///< Firmware version.
  fwVersion: number
  ///< VDO version.
  vdoVersion: number
  ///< Maximum VBUS voltage value.
  maximumVbusVoltage: number
  ///< Charge through current support bit.
  chargeThroughCurrentSupport: boolean
  ///< VBUS impedance.
  vbusImpedance: number
  ///< Ground impedance.
  groundImpedance: number
  ///< Charge through support bit.
  chargeThroughSupport: boolean
}

/**
 * Parsed Discover SVIDs responder VDO.
 */
export interface ParsedSVIDsVDO extends ParsedDataObject {
  ///< First SVID in the VDO (low 16 bits).
  svid0: number
  ///< Second SVID in the VDO (high 16 bits).
  svid1: number
}

/**
 * Parsed Discover Modes VDO.
 */
export interface ParsedModesVDO extends ParsedDataObject {
  ///< Six 4-bit mode nibbles exposed for generic display.
  modeNibbles: number[]
}

/**
 * Parsed Enter Mode payload VDO.
 */
export type ParsedEnterModePayloadVDO = ParsedDataObject

/**
 * Parsed Exit Mode payload VDO.
 */
export type ParsedExitModePayloadVDO = ParsedDataObject

/**
 * Parsed Attention payload VDO.
 */
export type ParsedAttentionVDO = ParsedDataObject

/**
 * Parsed Discover Identity response.
 */
export interface ParsedDiscoverIdentity {
  ///< ID Header VDO.
  idHeader: ParsedIDHeaderVDO | null
  ///< Cert Stat VDO.
  certStat: ParsedCertStatVDO | null
  ///< Product VDO.
  product: ParsedProductVDO | null
  ///< Product type VDOs (UFP/DFP/Cable/VPD).
  productTypeVDOs: Array<
    ParsedUFPVDO | ParsedDFPVDO | ParsedPassiveCableVDO | ParsedActiveCableVDO1 | ParsedActiveCableVDO2 | ParsedVPDVDO
  >
  ///< Pad VDOs (all-zero placeholders).
  padVDOs: number[]
  ///< Raw unparsed VDOs.
  rawVDOs: number[]
}

/**
 * Read a 32-bit little-endian value from a payload.
 *
 * @param payload - Payload bytes.
 * @param offset - Byte offset within the payload.
 * @returns Unsigned 32-bit integer.
 */
export const readUint32LE = (payload: Uint8Array, offset: number): number => {
  if (offset + 3 >= payload.length) {
    throw new Error(`Cannot read uint32 at offset ${offset} from payload length ${payload.length}`)
  }
  return (
    payload[offset] |
    (payload[offset + 1] << 8) |
    (payload[offset + 2] << 16) |
    (payload[offset + 3] << 24)
  ) >>> 0
}

/**
 * Extract inclusive bit range from a 32-bit value.
 *
 * @param value - 32-bit value.
 * @param hi - High bit index.
 * @param lo - Low bit index.
 * @returns Extracted value.
 */
export const getBits = (value: number, hi: number, lo: number): number => {
  const width = hi - lo + 1
  const mask = width >= 32 ? 0xffffffff : (1 << width) - 1
  return (value >>> lo) & mask
}

/**
 * Convert two ASCII bytes to a string if printable.
 *
 * @param first - First byte.
 * @param second - Second byte.
 * @returns Two-character string or null.
 */
export const decodeAsciiPair = (first: number, second: number): string | null => {
  const isPrintable = (value: number): boolean => value >= 0x20 && value <= 0x7e
  if (!isPrintable(first) || !isPrintable(second)) {
    return null
  }
  return String.fromCharCode(first, second)
}

/**
 * Read N 32-bit data objects from a payload.
 *
 * @param payload - Payload bytes.
 * @param offset - Byte offset within the payload.
 * @param count - Number of objects to read.
 * @returns Array of raw 32-bit values.
 */
export const readDataObjects = (payload: Uint8Array, offset: number, count: number): number[] => {
  const rawValues: number[] = []
  for (let index = 0; index < count; index += 1) {
    const objectOffset = offset + index * 4
    rawValues.push(readUint32LE(payload, objectOffset))
  }
  return rawValues
}

/**
 * Parse a PDO for Source or Sink context.
 *
 * @param raw - Raw 32-bit value.
 * @param context - PDO context (source or sink).
 * @returns Parsed PDO.
 */
export const parsePDO = (raw: number, context: 'source' | 'sink'): ParsedPDO => {
  const pdoTypeBits = getBits(raw, 31, 30)
  if (pdoTypeBits === 0b00) {
    const peakCurrent = context === 'source' ? getBits(raw, 21, 20) : null
    const fastRoleSwapRequiredCurrent = context === 'sink' ? getBits(raw, 24, 23) : null
    return {
      raw,
      pdoType: 'FIXED',
      context,
      dualRolePower: getBits(raw, 29, 29) === 1,
      usbSuspendSupportedOrHigherCapability: getBits(raw, 28, 28) === 1,
      unconstrainedPower: getBits(raw, 27, 27) === 1,
      usbCommunicationsCapable: getBits(raw, 26, 26) === 1,
      dualRoleData: getBits(raw, 25, 25) === 1,
      unchunkedExtendedMessagesSupported: context === 'source' ? getBits(raw, 24, 24) === 1 : false,
      eprCapable: context === 'source' ? getBits(raw, 23, 23) === 1 : false,
      fastRoleSwapRequiredCurrent,
      peakCurrent,
      voltage50mV: getBits(raw, 19, 10),
      current10mA: getBits(raw, 9, 0),
    }
  }
  if (pdoTypeBits === 0b01) {
    return {
      raw,
      pdoType: 'BATTERY',
      context,
      maximumVoltage50mV: getBits(raw, 29, 20),
      minimumVoltage50mV: getBits(raw, 19, 10),
      power250mW: getBits(raw, 9, 0),
    }
  }
  if (pdoTypeBits === 0b10) {
    return {
      raw,
      pdoType: 'VARIABLE',
      context,
      maximumVoltage50mV: getBits(raw, 29, 20),
      minimumVoltage50mV: getBits(raw, 19, 10),
      current10mA: getBits(raw, 9, 0),
    }
  }

  const apdoTypeBits = getBits(raw, 29, 28)
  if (apdoTypeBits === 0b00) {
    return {
      raw,
      pdoType: 'APDO',
      apdoType: 'SPR_PPS',
      context,
      ppsPowerLimited: context === 'source' ? getBits(raw, 27, 27) === 1 : null,
      maximumVoltage100mV: getBits(raw, 24, 17),
      minimumVoltage100mV: getBits(raw, 15, 8),
      maximumCurrent50mA: getBits(raw, 6, 0),
    }
  }
  if (apdoTypeBits === 0b10) {
    return {
      raw,
      pdoType: 'APDO',
      apdoType: 'SPR_AVS',
      context,
      peakCurrent: context === 'source' ? getBits(raw, 27, 26) : null,
      maxCurrent15V10mA: getBits(raw, 19, 10),
      maxCurrent20V10mA: getBits(raw, 9, 0),
    }
  }
  if (apdoTypeBits === 0b01) {
    return {
      raw,
      pdoType: 'APDO',
      apdoType: 'EPR_AVS',
      context,
      peakCurrent: context === 'source' ? getBits(raw, 27, 26) : null,
      maximumVoltage100mV: getBits(raw, 25, 17),
      minimumVoltage100mV: getBits(raw, 15, 8),
      pdp1W: getBits(raw, 7, 0),
    }
  }
  return {
    raw,
    pdoType: 'APDO',
    apdoType: 'RESERVED',
    context,
  }
}

/**
 * Parse a Request Data Object.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed RDO.
 */
export const parseRDO = (raw: number): ParsedRDO => {
  return {
    raw,
    objectPosition: getBits(raw, 31, 28),
    giveback: getBits(raw, 27, 27) === 1,
    capabilityMismatch: getBits(raw, 26, 26) === 1,
    usbCommunicationsCapable: getBits(raw, 25, 25) === 1,
    noUsbSuspend: getBits(raw, 24, 24) === 1,
    unchunkedExtendedMessagesSupported: getBits(raw, 23, 23) === 1,
    eprCapable: getBits(raw, 22, 22) === 1,
    requestTypeHint: 'unknown',
    fixedVariable: {
      operatingCurrent10mA: getBits(raw, 19, 10),
      maximumOperatingCurrent10mA: getBits(raw, 9, 0),
    },
    battery: {
      operatingPower250mW: getBits(raw, 19, 10),
      maximumOperatingPower250mW: getBits(raw, 9, 0),
    },
    pps: {
      outputVoltage20mV: getBits(raw, 20, 9),
      operatingCurrent50mA: getBits(raw, 6, 0),
    },
    avs: {
      outputVoltage25mV: getBits(raw, 20, 9),
      operatingCurrent50mA: getBits(raw, 6, 0),
    },
  }
}

/**
 * Parse a BIST data object.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed BIST DO.
 */
export const parseBISTDataObject = (raw: number): ParsedBISTDataObject => {
  const mode = getBits(raw, 31, 28)
  let modeName = 'RESERVED'
  if (mode === 0b0101) {
    modeName = 'BIST_CARRIER_MODE'
  } else if (mode === 0b1000) {
    modeName = 'BIST_TEST_DATA'
  } else if (mode === 0b1001) {
    modeName = 'BIST_SHARED_TEST_ENTRY'
  } else if (mode === 0b1010) {
    modeName = 'BIST_SHARED_TEST_EXIT'
  }
  return {
    raw,
    mode,
    modeName,
    reserved: getBits(raw, 27, 0),
  }
}

/**
 * Parse a Battery Status Data Object.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed BSDO.
 */
export const parseBatteryStatusDataObject = (raw: number): ParsedBatteryStatusDataObject => {
  return {
    raw,
    batteryPresentCapacity: getBits(raw, 31, 16),
    invalidBatteryReference: getBits(raw, 8, 8) === 1,
    batteryPresent: getBits(raw, 9, 9) === 1,
    batteryChargingStatus: getBits(raw, 11, 10),
  }
}

/**
 * Parse an Alert Data Object.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed ADO.
 */
export const parseAlertDataObject = (raw: number): ParsedAlertDataObject => {
  return {
    raw,
    typeOfAlert: getBits(raw, 31, 24),
    fixedBatteries: getBits(raw, 23, 20),
    hotSwappableBatteries: getBits(raw, 19, 16),
    extendedAlertEventType: getBits(raw, 3, 0),
  }
}

/**
 * Parse a Country Code Data Object for Get_Country_Info.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed CCDO.
 */
export const parseCountryCodeDataObject = (raw: number): ParsedCountryCodeDataObject => {
  const first = getBits(raw, 31, 24)
  const second = getBits(raw, 23, 16)
  return {
    raw,
    countryCodeChar1: first,
    countryCodeChar2: second,
    countryCode: decodeAsciiPair(first, second),
  }
}

/**
 * Parse an Enter USB Data Object.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed EUDO.
 */
export const parseEnterUSBDataObject = (raw: number): ParsedEnterUSBDataObject => {
  return {
    raw,
    usbMode: getBits(raw, 30, 28),
    usb4Drd: getBits(raw, 26, 26) === 1,
    usb3Drd: getBits(raw, 25, 25) === 1,
    cableSpeed: getBits(raw, 23, 21),
    cableType: getBits(raw, 20, 19),
    cableCurrent: getBits(raw, 18, 17),
    pcieSupport: getBits(raw, 16, 16) === 1,
    dpSupport: getBits(raw, 15, 15) === 1,
    tbtSupport: getBits(raw, 14, 14) === 1,
    hostPresent: getBits(raw, 13, 13) === 1,
  }
}

/**
 * Parse an EPR Mode Data Object.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed EPRMDO.
 */
export const parseEPRModeDataObject = (raw: number): ParsedEPRModeDataObject => {
  return {
    raw,
    action: getBits(raw, 31, 24),
    data: getBits(raw, 23, 16),
  }
}

/**
 * Parse a Source Info Data Object.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed SIDO.
 */
export const parseSourceInfoDataObject = (raw: number): ParsedSourceInfoDataObject => {
  return {
    raw,
    portType: getBits(raw, 31, 31),
    portMaximumPdp: getBits(raw, 23, 16),
    portPresentPdp: getBits(raw, 15, 8),
    portReportedPdp: getBits(raw, 7, 0),
  }
}

/**
 * Parse a Revision Data Object.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed RMDO.
 */
export const parseRevisionDataObject = (raw: number): ParsedRevisionDataObject => {
  return {
    raw,
    revisionMajor: getBits(raw, 31, 28),
    revisionMinor: getBits(raw, 27, 24),
    versionMajor: getBits(raw, 23, 20),
    versionMinor: getBits(raw, 19, 16),
  }
}

/**
 * Parse a VDM header.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed VDM header.
 */
export const parseVDMHeader = (raw: number): ParsedVDMHeader => {
  const vdmTypeBit = getBits(raw, 15, 15)
  const vdmType = vdmTypeBit === 1 ? 'STRUCTURED' : 'UNSTRUCTURED'
  if (vdmType === 'UNSTRUCTURED') {
    return {
      raw,
      svid: getBits(raw, 31, 16),
      vdmType,
      structuredVersionMajor: null,
      structuredVersionMinor: null,
      objectPosition: null,
      commandType: null,
      commandTypeName: null,
      command: null,
      commandName: null,
      vendorPayload: getBits(raw, 14, 0),
    }
  }
  const commandType = getBits(raw, 7, 6)
  const commandTypeName =
    commandType === 0 ? 'REQ' : commandType === 1 ? 'ACK' : commandType === 2 ? 'NAK' : 'BUSY'
  const command = getBits(raw, 4, 0)
  let commandName: string | null = null
  if (command === 1) {
    commandName = 'DISCOVER_IDENTITY'
  } else if (command === 2) {
    commandName = 'DISCOVER_SVIDS'
  } else if (command === 3) {
    commandName = 'DISCOVER_MODES'
  } else if (command === 4) {
    commandName = 'ENTER_MODE'
  } else if (command === 5) {
    commandName = 'EXIT_MODE'
  } else if (command === 6) {
    commandName = 'ATTENTION'
  } else if (command >= 16) {
    commandName = 'SVID_SPECIFIC'
  }
  return {
    raw,
    svid: getBits(raw, 31, 16),
    vdmType,
    structuredVersionMajor: getBits(raw, 14, 13),
    structuredVersionMinor: getBits(raw, 12, 11),
    objectPosition: getBits(raw, 10, 8),
    commandType,
    commandTypeName,
    command,
    commandName,
    vendorPayload: null,
  }
}

/**
 * Parse ID Header VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed ID Header VDO.
 */
export const parseIDHeaderVDO = (raw: number): ParsedIDHeaderVDO => {
  return {
    raw,
    usbHostCapable: getBits(raw, 31, 31) === 1,
    usbDeviceCapable: getBits(raw, 30, 30) === 1,
    sopProductTypeUfpOrCable: getBits(raw, 29, 27),
    modalOperationSupported: getBits(raw, 26, 26) === 1,
    sopProductTypeDfp: getBits(raw, 25, 23),
    connectorType: getBits(raw, 22, 21),
    usbVendorId: getBits(raw, 15, 0),
  }
}

/**
 * Parse Cert Stat VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed Cert Stat VDO.
 */
export const parseCertStatVDO = (raw: number): ParsedCertStatVDO => {
  return {
    raw,
    xid: raw >>> 0,
  }
}

/**
 * Parse Product VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed Product VDO.
 */
export const parseProductVDO = (raw: number): ParsedProductVDO => {
  return {
    raw,
    usbProductId: getBits(raw, 31, 16),
    bcdDevice: getBits(raw, 15, 0),
  }
}

/**
 * Parse UFP VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed UFP VDO.
 */
export const parseUFPVDO = (raw: number): ParsedUFPVDO => {
  return {
    raw,
    vdoVersion: getBits(raw, 31, 29),
    deviceCapability: getBits(raw, 27, 24),
    vconnPower: getBits(raw, 10, 8),
    vconnRequired: getBits(raw, 7, 7) === 1,
    vbusRequired: getBits(raw, 6, 6) === 0,
    alternateModes: getBits(raw, 5, 3),
    usbHighestSpeed: getBits(raw, 2, 0),
  }
}

/**
 * Parse DFP VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed DFP VDO.
 */
export const parseDFPVDO = (raw: number): ParsedDFPVDO => {
  return {
    raw,
    vdoVersion: getBits(raw, 31, 29),
    hostCapability: getBits(raw, 26, 24),
    portNumber: getBits(raw, 4, 0),
  }
}

/**
 * Parse Passive Cable VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed Passive Cable VDO.
 */
export const parsePassiveCableVDO = (raw: number): ParsedPassiveCableVDO => {
  return {
    raw,
    hwVersion: getBits(raw, 31, 28),
    fwVersion: getBits(raw, 27, 24),
    vdoVersion: getBits(raw, 23, 21),
    plugToPlugOrCaptive: getBits(raw, 19, 18),
    eprCapable: getBits(raw, 17, 17) === 1,
    cableLatency: getBits(raw, 16, 13),
    cableTerminationType: getBits(raw, 12, 11),
    maximumVbusVoltage: getBits(raw, 10, 9),
    vbusCurrentHandlingCapability: getBits(raw, 6, 5),
    usbHighestSpeed: getBits(raw, 2, 0),
  }
}

/**
 * Parse Active Cable VDO1.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed Active Cable VDO1.
 */
export const parseActiveCableVDO1 = (raw: number): ParsedActiveCableVDO1 => {
  return {
    raw,
    hwVersion: getBits(raw, 31, 28),
    fwVersion: getBits(raw, 27, 24),
    vdoVersion: getBits(raw, 23, 21),
    plugToPlugOrCaptive: getBits(raw, 19, 18),
    eprCapable: getBits(raw, 17, 17) === 1,
    cableLatency: getBits(raw, 16, 13),
    cableTerminationType: getBits(raw, 12, 11),
    maximumVbusVoltage: getBits(raw, 10, 9),
    sbuSupported: getBits(raw, 8, 8) === 0,
    sbuType: getBits(raw, 7, 7) === 1,
    vbusCurrentHandlingCapability: getBits(raw, 6, 5),
    vbusThroughCable: getBits(raw, 4, 4) === 1,
    sopDoublePrimeControllerPresent: getBits(raw, 3, 3) === 1,
    usbHighestSpeed: getBits(raw, 2, 0),
  }
}

/**
 * Parse Active Cable VDO2.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed Active Cable VDO2.
 */
export const parseActiveCableVDO2 = (raw: number): ParsedActiveCableVDO2 => {
  return {
    raw,
    maximumOperatingTemperature: getBits(raw, 31, 24),
    shutdownTemperature: getBits(raw, 23, 16),
    u3CldPower: getBits(raw, 14, 12),
    u3ToU0TransitionMode: getBits(raw, 11, 11) === 1,
    physicalConnection: getBits(raw, 10, 10) === 1,
    activeElement: getBits(raw, 9, 9) === 1,
    usb4Supported: getBits(raw, 8, 8) === 0,
    usb2HubHopsConsumed: getBits(raw, 7, 6),
    usb2Supported: getBits(raw, 5, 5) === 0,
    usb32Supported: getBits(raw, 4, 4) === 0,
    usbLanesSupported: getBits(raw, 3, 3) === 1,
    opticallyIsolatedActiveCable: getBits(raw, 2, 2) === 1,
    usb4AsymmetricModeSupported: getBits(raw, 1, 1) === 1,
    usbGen: getBits(raw, 0, 0) === 1,
  }
}

/**
 * Parse VPD VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed VPD VDO.
 */
export const parseVPDVDO = (raw: number): ParsedVPDVDO => {
  return {
    raw,
    hwVersion: getBits(raw, 31, 28),
    fwVersion: getBits(raw, 27, 24),
    vdoVersion: getBits(raw, 23, 21),
    maximumVbusVoltage: getBits(raw, 16, 15),
    chargeThroughCurrentSupport: getBits(raw, 14, 14) === 1,
    vbusImpedance: getBits(raw, 12, 7),
    groundImpedance: getBits(raw, 6, 1),
    chargeThroughSupport: getBits(raw, 0, 0) === 1,
  }
}

/**
 * Parse a Discover SVIDs responder VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed SVIDs VDO.
 */
export const parseSVIDsVDO = (raw: number): ParsedSVIDsVDO => {
  return {
    raw,
    svid0: getBits(raw, 15, 0),
    svid1: getBits(raw, 31, 16),
  }
}

/**
 * Parse a Discover Modes VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed Modes VDO.
 */
export const parseModesVDO = (raw: number): ParsedModesVDO => {
  return {
    raw,
    modeNibbles: Array.from({ length: 6 }, (_, index) => getBits(raw, (index * 4) + 3, index * 4)),
  }
}

/**
 * Parse an Enter Mode payload VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed Enter Mode payload VDO.
 */
export const parseEnterModePayloadVDO = (raw: number): ParsedEnterModePayloadVDO => ({ raw })

/**
 * Parse an Exit Mode payload VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed Exit Mode payload VDO.
 */
export const parseExitModePayloadVDO = (raw: number): ParsedExitModePayloadVDO => ({ raw })

/**
 * Parse an Attention payload VDO.
 *
 * @param raw - Raw 32-bit value.
 * @returns Parsed Attention payload VDO.
 */
export const parseAttentionVDO = (raw: number): ParsedAttentionVDO => ({ raw })

/**
 * Parse Discover Identity VDOs.
 *
 * @param vdos - Raw VDO list after VDM Header.
 * @param sopKind - SOP kind for product type interpretation.
 * @returns Parsed Discover Identity response.
 */
export const parseDiscoverIdentityVDOs = (vdos: number[], sopKind: SOPKind): ParsedDiscoverIdentity => {
  const idHeader = vdos.length >= 1 ? parseIDHeaderVDO(vdos[0]) : null
  const certStat = vdos.length >= 2 ? parseCertStatVDO(vdos[1]) : null
  const product = vdos.length >= 3 ? parseProductVDO(vdos[2]) : null
  const remaining = vdos.slice(3)
  const productTypeVDOs: ParsedDiscoverIdentity['productTypeVDOs'] = []
  const padVDOs: number[] = []
  const rawVDOs: number[] = []

  const isSopPrime = sopKind === 'SOP_PRIME' || sopKind === 'SOP_DOUBLE_PRIME'
  const productType = idHeader ? idHeader.sopProductTypeUfpOrCable : 0
  const dfpType = idHeader ? idHeader.sopProductTypeDfp : 0

  let index = 0
  while (index < remaining.length) {
    const raw = remaining[index]
    if (raw === 0) {
      padVDOs.push(raw)
      index += 1
      continue
    }
    if (isSopPrime) {
      if (productType === 0b011) {
        productTypeVDOs.push(parsePassiveCableVDO(raw))
        index += 1
        continue
      }
      if (productType === 0b100) {
        productTypeVDOs.push(parseActiveCableVDO1(raw))
        if (remaining[index + 1] !== undefined) {
          productTypeVDOs.push(parseActiveCableVDO2(remaining[index + 1]))
          index += 2
        } else {
          index += 1
        }
        continue
      }
      if (productType === 0b110) {
        productTypeVDOs.push(parseVPDVDO(raw))
        index += 1
        continue
      }
    } else {
      if (productType === 0b001 || productType === 0b010) {
        productTypeVDOs.push(parseUFPVDO(raw))
        index += 1
        continue
      }
      if (dfpType === 0b001 || dfpType === 0b010 || dfpType === 0b011) {
        productTypeVDOs.push(parseDFPVDO(raw))
        index += 1
        continue
      }
    }
    rawVDOs.push(raw)
    index += 1
  }

  return {
    idHeader,
    certStat,
    product,
    productTypeVDOs,
    padVDOs,
    rawVDOs,
  }
}

/**
 * Read a null-terminated ASCII string from a payload slice.
 *
 * @param payload - Payload bytes.
 * @param offset - Byte offset.
 * @param length - Maximum length.
 * @returns Decoded string.
 */
export const readNullTerminatedString = (
  payload: Uint8Array,
  offset: number,
  length: number,
): string => {
  const chars: string[] = []
  for (let i = 0; i < length; i += 1) {
    const value = payload[offset + i]
    if (value === 0) {
      break
    }
    chars.push(String.fromCharCode(value))
  }
  return chars.join('')
}

/**
 * Read an ASCII preview from a payload slice.
 *
 * @param payload - Payload bytes.
 * @param offset - Byte offset.
 * @param length - Length.
 * @returns ASCII preview string (non-printable replaced with '.').
 */
export const readAsciiPreview = (payload: Uint8Array, offset: number, length: number): string => {
  const chars: string[] = []
  for (let i = 0; i < length; i += 1) {
    const value = payload[offset + i]
    if (value >= 0x20 && value <= 0x7e) {
      chars.push(String.fromCharCode(value))
    } else {
      chars.push('.')
    }
  }
  return chars.join('')
}

/**
 * Read a uint16 from a payload at offset without throwing (returns null if out of range).
 *
 * @param payload - Payload bytes.
 * @param offset - Byte offset.
 * @returns Unsigned 16-bit integer or null.
 */
export const readUint16LENullable = (payload: Uint8Array, offset: number): number | null => {
  if (offset + 1 >= payload.length) {
    return null
  }
  return readUint16LE(payload, offset)
}

/**
 * Parsed Source Capabilities Extended Data Block.
 */
export interface ParsedSourceCapabilitiesExtendedDataBlock {
  ///< Vendor ID.
  vid: number
  ///< Product ID.
  pid: number
  ///< XID value.
  xid: number
  ///< Firmware version.
  fwVersion: number
  ///< Hardware version.
  hwVersion: number
  ///< Voltage regulation bitfield.
  voltageRegulation: number
  ///< Holdup time in ms.
  holdupTimeMs: number
  ///< Compliance bitfield.
  compliance: number
  ///< Touch current bitfield.
  touchCurrent: number
  ///< Peak current 1 bitfield.
  peakCurrent1: number
  ///< Peak current 2 bitfield.
  peakCurrent2: number
  ///< Peak current 3 bitfield.
  peakCurrent3: number
  ///< Touch temp enum.
  touchTemp: number
  ///< Source inputs bitfield.
  sourceInputs: number
  ///< Hot swappable battery slots.
  hotSwappableBatterySlots: number
  ///< Fixed batteries.
  fixedBatteries: number
  ///< SPR source PDP rating.
  sprSourcePdpRating: number
  ///< EPR source PDP rating.
  eprSourcePdpRating: number | null
  ///< True when the data block is the legacy 24-byte form without EPR Source PDP Rating.
  legacy24ByteBlock: boolean
}

/**
 * Parsed SOP Status Data Block.
 */
export interface ParsedSOPStatusDataBlock {
  ///< Internal temperature.
  internalTemp: number
  ///< Present input bitfield.
  presentInput: number
  ///< Present battery input bitfield.
  presentBatteryInput: number
  ///< Event flags bitfield.
  eventFlags: number
  ///< Temperature status bitfield.
  temperatureStatus: number
  ///< Power status bitfield.
  powerStatus: number
  ///< Power state change bitfield.
  powerStateChange: number | null
  ///< True when the data block is the 6-byte form without Power State Change.
  sixByteBlock: boolean
}

/**
 * Parsed SOP'/SOP'' Status Data Block.
 */
export interface ParsedSOPPrimeStatusDataBlock {
  ///< Internal temperature.
  internalTemp: number
  ///< Flags bitfield.
  flags: number
}

/**
 * Parsed Battery Capabilities Data Block.
 */
export interface ParsedBatteryCapabilitiesDataBlock {
  ///< Vendor ID.
  vid: number
  ///< Product ID.
  pid: number
  ///< Battery design capacity.
  batteryDesignCapacity: number
  ///< Battery last full charge capacity.
  batteryLastFullChargeCapacity: number
  ///< Battery type bitfield.
  batteryType: number
}

/**
 * Parsed Manufacturer Info Data Block.
 */
export interface ParsedManufacturerInfoDataBlock {
  ///< Vendor ID.
  vid: number
  ///< Product ID.
  pid: number
  ///< Manufacturer string.
  manufacturerString: string
  ///< Raw manufacturer string bytes.
  manufacturerStringBytes: Uint8Array
}

/**
 * Parsed PPS Status Data Block.
 */
export interface ParsedPPSStatusDataBlock {
  ///< Output voltage in 20mV units.
  outputVoltage20mV: number
  ///< Output current in 50mA units.
  outputCurrent50mA: number
  ///< Real time flags bitfield.
  realTimeFlags: number
}

/**
 * Parsed Country Codes Data Block.
 */
export interface ParsedCountryCodesDataBlock {
  ///< Length value.
  length: number
  ///< Country codes list.
  countryCodes: string[]
}

/**
 * Parsed Country Info Data Block.
 */
export interface ParsedCountryInfoDataBlock {
  ///< Country code string.
  countryCode: string | null
  ///< Country specific data bytes.
  countrySpecificData: Uint8Array
  ///< ASCII preview of country specific data.
  countrySpecificDataAscii: string
}

/**
 * Parsed Sink Capabilities Extended Data Block.
 */
export interface ParsedSinkCapabilitiesExtendedDataBlock {
  ///< Vendor ID.
  vid: number
  ///< Product ID.
  pid: number
  ///< XID value.
  xid: number
  ///< Firmware version.
  fwVersion: number
  ///< Hardware version.
  hwVersion: number
  ///< SKEDB version.
  skedbVersion: number
  ///< Load step bitfield.
  loadStep: number
  ///< Sink load characteristics bitfield.
  sinkLoadCharacteristics: number
  ///< Compliance bitfield.
  compliance: number
  ///< Touch temp value.
  touchTemp: number
  ///< Hot swappable battery slots.
  hotSwappableBatterySlots: number
  ///< Fixed batteries.
  fixedBatteries: number
  ///< Sink modes bitfield.
  sinkModes: number
  ///< SPR sink minimum PDP.
  sprSinkMinimumPdp: number
  ///< SPR sink operational PDP.
  sprSinkOperationalPdp: number
  ///< SPR sink maximum PDP.
  sprSinkMaximumPdp: number
  ///< EPR sink minimum PDP.
  eprSinkMinimumPdp: number | null
  ///< EPR sink operational PDP.
  eprSinkOperationalPdp: number | null
  ///< EPR sink maximum PDP.
  eprSinkMaximumPdp: number | null
  ///< True when the data block is the legacy 21-byte form without EPR Sink PDP fields.
  legacy21ByteBlock: boolean
}

/**
 * Parsed Extended Control Data Block.
 */
export interface ParsedExtendedControlDataBlock {
  ///< Type value.
  type: number
  ///< Data byte.
  dataByte: number
}

type ExtendedControlTypeMetadata = {
  messageType: string
  messageMeaning: string
  sentBy: string
  validStartOfPacket: string
  dataMeaning: string
}

const getExtendedControlTypeMetadata = (type: number): ExtendedControlTypeMetadata => {
  switch (type) {
    case 0x01:
      return {
        messageType: 'EPR_Get_Source_Cap',
        messageMeaning: 'Requests EPR source capabilities from an EPR-capable source partner.',
        sentBy: 'Sink or DRP',
        validStartOfPacket: 'SOP only',
        dataMeaning: 'Not used. The data byte shall be 0x00 for EPR_Get_Source_Cap.',
      }
    case 0x02:
      return {
        messageType: 'EPR_Get_Sink_Cap',
        messageMeaning: 'Requests EPR sink capabilities from an EPR-capable sink partner.',
        sentBy: 'Source or DRP',
        validStartOfPacket: 'SOP only',
        dataMeaning: 'Not used. The data byte shall be 0x00 for EPR_Get_Sink_Cap.',
      }
    case 0x03:
      return {
        messageType: 'EPR_KeepAlive',
        messageMeaning: 'Provides periodic EPR traffic from the sink so the EPR session remains active.',
        sentBy: 'Sink',
        validStartOfPacket: 'SOP only',
        dataMeaning: 'Not used. The data byte shall be 0x00 for EPR_KeepAlive.',
      }
    case 0x04:
      return {
        messageType: 'EPR_KeepAlive_Ack',
        messageMeaning: 'Acknowledges an EPR_KeepAlive message from the sink while operating in EPR mode.',
        sentBy: 'Source',
        validStartOfPacket: 'SOP only',
        dataMeaning: 'Not used. The data byte shall be 0x00 for EPR_KeepAlive_Ack.',
      }
    default:
      return {
        messageType: 'Reserved',
        messageMeaning: 'Reserved Extended_Control type. This value is not defined by the USB-PD 3.2 specification.',
        sentBy: 'Reserved',
        validStartOfPacket: 'Reserved',
        dataMeaning: 'Reserved. The data byte has no defined meaning for this type.',
      }
  }
}

/**
 * Parse a Source Capabilities Extended Data Block.
 *
 * @param data - Data block bytes.
 * @returns Parsed SCEDB.
 */
export const parseSourceCapabilitiesExtendedDataBlock = (
  data: Uint8Array,
): ParsedSourceCapabilitiesExtendedDataBlock => {
  const vid = readUint16LE(data, 0)
  const pid = readUint16LE(data, 2)
  const xid = readUint32LE(data, 4)
  return {
    vid,
    pid,
    xid,
    fwVersion: data[8] ?? 0,
    hwVersion: data[9] ?? 0,
    voltageRegulation: data[10] ?? 0,
    holdupTimeMs: data[11] ?? 0,
    compliance: data[12] ?? 0,
    touchCurrent: data[13] ?? 0,
    peakCurrent1: readUint16LE(data, 14),
    peakCurrent2: readUint16LE(data, 16),
    peakCurrent3: readUint16LE(data, 18),
    touchTemp: data[20] ?? 0,
    sourceInputs: data[21] ?? 0,
    hotSwappableBatterySlots: (data[22] ?? 0) >> 4,
    fixedBatteries: (data[22] ?? 0) & 0x0f,
    sprSourcePdpRating: (data[23] ?? 0) & 0x7f,
    eprSourcePdpRating: data.length >= 25 ? (data[24] ?? 0) : null,
    legacy24ByteBlock: data.length === 24,
  }
}

/**
 * Parse SOP Status Data Block.
 *
 * @param data - Data block bytes.
 * @returns Parsed SDB.
 */
export const parseSOPStatusDataBlock = (data: Uint8Array): ParsedSOPStatusDataBlock => {
  return {
    internalTemp: data[0] ?? 0,
    presentInput: data[1] ?? 0,
    presentBatteryInput: data[2] ?? 0,
    eventFlags: data[3] ?? 0,
    temperatureStatus: data[4] ?? 0,
    powerStatus: data[5] ?? 0,
    powerStateChange: data.length >= 7 ? (data[6] ?? 0) : null,
    sixByteBlock: data.length === 6,
  }
}

/**
 * Parse SOP'/SOP'' Status Data Block.
 *
 * @param data - Data block bytes.
 * @returns Parsed SPDB.
 */
export const parseSOPPrimeStatusDataBlock = (data: Uint8Array): ParsedSOPPrimeStatusDataBlock => {
  return {
    internalTemp: data[0] ?? 0,
    flags: data[1] ?? 0,
  }
}

/**
 * Parse Battery Capabilities Data Block.
 *
 * @param data - Data block bytes.
 * @returns Parsed BCDB.
 */
export const parseBatteryCapabilitiesDataBlock = (
  data: Uint8Array,
): ParsedBatteryCapabilitiesDataBlock => {
  return {
    vid: readUint16LE(data, 0),
    pid: readUint16LE(data, 2),
    batteryDesignCapacity: readUint16LE(data, 4),
    batteryLastFullChargeCapacity: readUint16LE(data, 6),
    batteryType: data[8] ?? 0,
  }
}

/**
 * Parse Manufacturer Info Data Block.
 *
 * @param data - Data block bytes.
 * @returns Parsed MIDB.
 */
export const parseManufacturerInfoDataBlock = (
  data: Uint8Array,
): ParsedManufacturerInfoDataBlock => {
  const vid = readUint16LE(data, 0)
  const pid = readUint16LE(data, 2)
  const stringBytes = data.subarray(4)
  return {
    vid,
    pid,
    manufacturerString: readNullTerminatedString(stringBytes, 0, stringBytes.length),
    manufacturerStringBytes: stringBytes,
  }
}

/**
 * Parse PPS Status Data Block.
 *
 * @param data - Data block bytes.
 * @returns Parsed PPSSDB.
 */
export const parsePPSStatusDataBlock = (data: Uint8Array): ParsedPPSStatusDataBlock => {
  return {
    outputVoltage20mV: readUint16LE(data, 0),
    outputCurrent50mA: data[2] ?? 0,
    realTimeFlags: data[3] ?? 0,
  }
}

/**
 * Parse Country Codes Data Block.
 *
 * @param data - Data block bytes.
 * @returns Parsed CCDB.
 */
export const parseCountryCodesDataBlock = (data: Uint8Array): ParsedCountryCodesDataBlock => {
  const length = data[0] ?? 0
  const countryCodes: string[] = []
  let offset = 2
  for (let index = 0; index < length; index += 1) {
    const first = data[offset]
    const second = data[offset + 1]
    if (first === undefined || second === undefined) {
      break
    }
    const code = decodeAsciiPair(first, second)
    if (code) {
      countryCodes.push(code)
    }
    offset += 2
  }
  return {
    length,
    countryCodes,
  }
}

/**
 * Parse Country Info Data Block.
 *
 * @param data - Data block bytes.
 * @returns Parsed CIDB.
 */
export const parseCountryInfoDataBlock = (data: Uint8Array): ParsedCountryInfoDataBlock => {
  const first = data[0] ?? 0
  const second = data[1] ?? 0
  const code = decodeAsciiPair(first, second)
  const countrySpecific = data.subarray(4)
  return {
    countryCode: code,
    countrySpecificData: countrySpecific,
    countrySpecificDataAscii: readAsciiPreview(countrySpecific, 0, countrySpecific.length),
  }
}

/**
 * Parse Sink Capabilities Extended Data Block.
 *
 * @param data - Data block bytes.
 * @returns Parsed SKEDB.
 */
export const parseSinkCapabilitiesExtendedDataBlock = (
  data: Uint8Array,
): ParsedSinkCapabilitiesExtendedDataBlock => {
  return {
    vid: readUint16LE(data, 0),
    pid: readUint16LE(data, 2),
    xid: readUint32LE(data, 4),
    fwVersion: data[8] ?? 0,
    hwVersion: data[9] ?? 0,
    skedbVersion: data[10] ?? 0,
    loadStep: data[11] ?? 0,
    sinkLoadCharacteristics: readUint16LE(data, 12),
    compliance: data[14] ?? 0,
    touchTemp: data[15] ?? 0,
    hotSwappableBatterySlots: (data[16] ?? 0) >> 4,
    fixedBatteries: (data[16] ?? 0) & 0x0f,
    sinkModes: data[17] ?? 0,
    sprSinkMinimumPdp: data[18] ?? 0,
    sprSinkOperationalPdp: data[19] ?? 0,
    sprSinkMaximumPdp: data[20] ?? 0,
    eprSinkMinimumPdp: data.length >= 22 ? (data[21] ?? 0) : null,
    eprSinkOperationalPdp: data.length >= 23 ? (data[22] ?? 0) : null,
    eprSinkMaximumPdp: data.length >= 24 ? (data[23] ?? 0) : null,
    legacy21ByteBlock: data.length === 21,
  }
}

/**
 * Parse Extended Control Data Block.
 *
 * @param data - Data block bytes.
 * @returns Parsed ECDB.
 */
export const parseExtendedControlDataBlock = (
  data: Uint8Array,
): ParsedExtendedControlDataBlock => {
  return {
    type: data[0] ?? 0,
    dataByte: data[1] ?? 0,
  }
}

const createMetadataContainer = (
  label: string,
  explanation: string,
): HumanReadableField<'OrderedDictionary'> => HumanReadableField.orderedDictionary(label, explanation)

const addStringMetadataField = (
  container: HumanReadableField<'OrderedDictionary'>,
  key: string,
  label: string,
  value: string,
  explanation: string,
): void => {
  container.setEntry(key, HumanReadableField.string(value, label, explanation))
}

const addBooleanMetadataField = (
  container: HumanReadableField<'OrderedDictionary'>,
  key: string,
  label: string,
  value: boolean,
  explanation: string,
): void => {
  addStringMetadataField(container, key, label, value ? 'true' : 'false', explanation)
}

const addNumberMetadataField = (
  container: HumanReadableField<'OrderedDictionary'>,
  key: string,
  label: string,
  value: number,
  explanation: string,
  unit?: string,
): void => {
  addStringMetadataField(
    container,
    key,
    label,
    unit ? `${value} ${unit}` : value.toString(),
    explanation,
  )
}

const addRawUint32MetadataField = (
  container: HumanReadableField<'OrderedDictionary'>,
  explanation: string,
  raw: number,
): void => {
  addStringMetadataField(
    container,
    'raw',
    'Raw Value',
    `0x${raw.toString(16).toUpperCase().padStart(8, '0')}`,
    explanation,
  )
}

const addByteDataMetadataField = (
  container: HumanReadableField<'OrderedDictionary'>,
  key: string,
  label: string,
  value: Uint8Array,
  explanation: string,
): void => {
  container.setEntry(key, HumanReadableField.byteData(value, 8, false, label, explanation))
}

const addSequenceMetadata = (
  container: HumanReadableField<'OrderedDictionary'>,
  key: string,
  label: string,
  explanation: string,
  entries: Array<{ key: string; field: HumanReadableField }>,
): void => {
  const sequence = createMetadataContainer(label, explanation)
  entries.forEach((entry) => sequence.setEntry(entry.key, entry.field))
  container.setEntry(key, sequence)
}

const formatPowerRoleSwapCurrent = (code: number): string => {
  switch (code) {
    case 0:
      return '0b00 (Fast Role Swap not supported)'
    case 1:
      return '0b01 (Default USB Port current)'
    case 2:
      return '0b10 (1.5 A @ 5 V)'
    case 3:
      return '0b11 (3.0 A @ 5 V)'
    default:
      return `0b${code.toString(2)} (Reserved)`
  }
}

const formatPeakCurrentCode = (code: number): string => {
  switch (code) {
    case 0:
      return '0b00 (Peak current equals IoC, or use Source_Capabilities_Extended)'
    case 1:
      return '0b01 (150% IoC for 1 ms @ 5%, 125% IoC for 2 ms @ 10%, 110% IoC for 10 ms @ 50%)'
    case 2:
      return '0b10 (200% IoC for 1 ms @ 5%, 150% IoC for 2 ms @ 10%, 125% IoC for 10 ms @ 50%)'
    case 3:
      return '0b11 (200% IoC for 1 ms @ 5%, 175% IoC for 2 ms @ 10%, 150% IoC for 10 ms @ 50%)'
    default:
      return `0b${code.toString(2)} (Reserved)`
  }
}

const formatCode = (code: number, width: number, meaning: string): string =>
  `0b${code.toString(2).padStart(width, '0')} (${meaning})`

const formatBitfieldWithMeanings = (value: number, width: number, meanings: string[]): string =>
  `0b${value.toString(2).padStart(width, '0')} (${meanings.length > 0 ? meanings.join(', ') : 'No asserted capabilities'})`

const formatUfpVdoVersion = (code: number): string =>
  formatCode(code, 3, code === 0b011 ? 'Version 1.3' : 'Reserved')

const formatDfpVdoVersion = (code: number): string =>
  formatCode(code, 3, code === 0b010 ? 'Version 1.2' : 'Reserved')

const formatCableOrVpdVdoVersion = (code: number): string =>
  formatCode(code, 3, code === 0b000 ? 'Version 1.0' : 'Reserved')

const formatUsbHighestSpeed = (code: number): string => {
  switch (code) {
    case 0b000:
      return formatCode(code, 3, 'USB 2.0 only, no SuperSpeed support')
    case 0b001:
      return formatCode(code, 3, 'USB 3.2 Gen1')
    case 0b010:
      return formatCode(code, 3, 'USB 3.2/USB4 Gen2')
    case 0b011:
      return formatCode(code, 3, 'USB4 Gen3')
    case 0b100:
      return formatCode(code, 3, 'USB4 Gen4')
    default:
      return formatCode(code, 3, 'Reserved')
  }
}

const formatVconnPower = (code: number): string => {
  switch (code) {
    case 0b000:
      return formatCode(code, 3, '1 W')
    case 0b001:
      return formatCode(code, 3, '1.5 W')
    case 0b010:
      return formatCode(code, 3, '2 W')
    case 0b011:
      return formatCode(code, 3, '3 W')
    case 0b100:
      return formatCode(code, 3, '4 W')
    case 0b101:
      return formatCode(code, 3, '5 W')
    case 0b110:
      return formatCode(code, 3, '6 W')
    default:
      return formatCode(code, 3, 'Reserved')
  }
}

const formatUfpDeviceCapability = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 0)) !== 0) meanings.push('USB 2.0 Device Capable')
  if ((value & (1 << 1)) !== 0) meanings.push('USB 2.0 Device Capable (Billboard only)')
  if ((value & (1 << 2)) !== 0) meanings.push('USB 3.2 Device Capable')
  if ((value & (1 << 3)) !== 0) meanings.push('USB4 Device Capable')
  return formatBitfieldWithMeanings(value, 4, meanings)
}

const formatAlternateModes = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 0)) !== 0) meanings.push('Supports TBT3 Alternate Mode')
  if ((value & (1 << 1)) !== 0) meanings.push('Supports Alternate Modes that reconfigure the USB Type-C connector, except TBT3')
  if ((value & (1 << 2)) !== 0) meanings.push('Supports Alternate Modes that do not reconfigure the USB Type-C connector')
  return formatBitfieldWithMeanings(value, 3, meanings)
}

const formatDfpHostCapability = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 0)) !== 0) meanings.push('USB 2.0 Host Capable')
  if ((value & (1 << 1)) !== 0) meanings.push('USB 3.2 Host Capable')
  if ((value & (1 << 2)) !== 0) meanings.push('USB4 Host Capable')
  return formatBitfieldWithMeanings(value, 3, meanings)
}

const formatSopProductTypeUfp = (code: number): string => {
  switch (code) {
    case 0b000:
      return formatCode(code, 3, 'SOP: Not a UFP')
    case 0b001:
      return formatCode(code, 3, 'SOP: PDUSB Hub')
    case 0b010:
      return formatCode(code, 3, 'SOP: PDUSB Peripheral')
    case 0b011:
      return formatCode(code, 3, 'SOP: PSD')
    default:
      return formatCode(code, 3, "SOP: Reserved")
  }
}

const formatSopPrimeProductTypeCable = (code: number): string => {
  switch (code) {
    case 0b000:
      return formatCode(code, 3, "SOP': Not a Cable Plug/VPD")
    case 0b011:
      return formatCode(code, 3, "SOP': Passive Cable")
    case 0b100:
      return formatCode(code, 3, "SOP': Active Cable")
    case 0b110:
      return formatCode(code, 3, "SOP': VCONN Powered USB Device (VPD)")
    default:
      return formatCode(code, 3, "SOP': Reserved")
  }
}

const formatSopProductTypeCombined = (code: number): string =>
  `${formatSopProductTypeUfp(code)}; ${formatSopPrimeProductTypeCable(code)}`

const formatSopProductTypeDfp = (code: number): string => {
  switch (code) {
    case 0b000:
      return formatCode(code, 3, 'Not a DFP')
    case 0b001:
      return formatCode(code, 3, 'PDUSB Hub')
    case 0b010:
      return formatCode(code, 3, 'PDUSB Host')
    case 0b011:
      return formatCode(code, 3, 'Power Brick')
    default:
      return formatCode(code, 3, 'Reserved')
  }
}

const formatConnectorType = (code: number): string => {
  switch (code) {
    case 0b00:
      return formatCode(code, 2, 'Reserved, for compatibility with legacy systems')
    case 0b01:
      return formatCode(code, 2, 'Reserved')
    case 0b10:
      return formatCode(code, 2, 'USB Type-C Receptacle')
    case 0b11:
      return formatCode(code, 2, 'USB Type-C Plug')
    default:
      return formatCode(code, 2, 'Reserved')
  }
}

const formatCablePlugType = (code: number): string => {
  switch (code) {
    case 0b10:
      return formatCode(code, 2, 'USB Type-C')
    case 0b11:
      return formatCode(code, 2, 'Captive')
    default:
      return formatCode(code, 2, 'Reserved')
  }
}

const formatPassiveCableLatency = (code: number): string => {
  switch (code) {
    case 0b0001: return formatCode(code, 4, '<10 ns (~1 m)')
    case 0b0010: return formatCode(code, 4, '10 ns to 20 ns (~2 m)')
    case 0b0011: return formatCode(code, 4, '20 ns to 30 ns (~3 m)')
    case 0b0100: return formatCode(code, 4, '30 ns to 40 ns (~4 m)')
    case 0b0101: return formatCode(code, 4, '40 ns to 50 ns (~5 m)')
    case 0b0110: return formatCode(code, 4, '50 ns to 60 ns (~6 m)')
    case 0b0111: return formatCode(code, 4, '60 ns to 70 ns (~7 m)')
    case 0b1000: return formatCode(code, 4, '>70 ns (>~7 m)')
    default: return formatCode(code, 4, 'Reserved')
  }
}

const formatActiveCableLatency = (code: number): string => {
  switch (code) {
    case 0b0001: return formatCode(code, 4, '<10 ns (~1 m)')
    case 0b0010: return formatCode(code, 4, '10 ns to 20 ns (~2 m)')
    case 0b0011: return formatCode(code, 4, '20 ns to 30 ns (~3 m)')
    case 0b0100: return formatCode(code, 4, '30 ns to 40 ns (~4 m)')
    case 0b0101: return formatCode(code, 4, '40 ns to 50 ns (~5 m)')
    case 0b0110: return formatCode(code, 4, '50 ns to 60 ns (~6 m)')
    case 0b0111: return formatCode(code, 4, '60 ns to 70 ns (~7 m)')
    case 0b1000: return formatCode(code, 4, '1000 ns (~100 m)')
    case 0b1001: return formatCode(code, 4, '2000 ns (~200 m)')
    case 0b1010: return formatCode(code, 4, '3000 ns (~300 m)')
    default: return formatCode(code, 4, 'Reserved')
  }
}

const formatPassiveCableTerminationType = (code: number): string => {
  switch (code) {
    case 0b00: return formatCode(code, 2, 'VCONN not required')
    case 0b01: return formatCode(code, 2, 'VCONN required')
    default: return formatCode(code, 2, 'Reserved')
  }
}

const formatActiveCableTerminationType = (code: number): string => {
  switch (code) {
    case 0b10: return formatCode(code, 2, 'One end active, one end passive, VCONN required')
    case 0b11: return formatCode(code, 2, 'Both ends active, VCONN required')
    default: return formatCode(code, 2, 'Reserved')
  }
}

const formatPassiveOrActiveMaximumVbusVoltage = (code: number): string => {
  switch (code) {
    case 0b00: return formatCode(code, 2, '20 V')
    case 0b01: return formatCode(code, 2, '30 V (Deprecated; interpret as 20 V)')
    case 0b10: return formatCode(code, 2, '40 V (Deprecated; interpret as 20 V)')
    case 0b11: return formatCode(code, 2, '50 V')
    default: return formatCode(code, 2, 'Reserved')
  }
}

const formatVpdMaximumVbusVoltage = (code: number): string => {
  switch (code) {
    case 0b00: return formatCode(code, 2, '20 V')
    case 0b01: return formatCode(code, 2, '30 V (Deprecated; interpret as 20 V)')
    case 0b10: return formatCode(code, 2, '40 V (Deprecated; interpret as 20 V)')
    case 0b11: return formatCode(code, 2, '50 V (Deprecated; interpret as 20 V)')
    default: return formatCode(code, 2, 'Reserved')
  }
}

const formatVbusCurrentHandlingCapability = (code: number): string => {
  switch (code) {
    case 0b01: return formatCode(code, 2, '3 A')
    case 0b10: return formatCode(code, 2, '5 A')
    default: return formatCode(code, 2, 'Reserved')
  }
}

const formatU3CldPower = (code: number): string => {
  switch (code) {
    case 0b000: return formatCode(code, 3, '>10 mW')
    case 0b001: return formatCode(code, 3, '5-10 mW')
    case 0b010: return formatCode(code, 3, '1-5 mW')
    case 0b011: return formatCode(code, 3, '0.5-1 mW')
    case 0b100: return formatCode(code, 3, '0.2-0.5 mW')
    case 0b101: return formatCode(code, 3, '50-200 uW')
    case 0b110: return formatCode(code, 3, '<50 uW')
    default: return formatCode(code, 3, 'Reserved')
  }
}

const formatBatteryChargingStatus = (status: number): string => {
  switch (status) {
    case 0:
      return '0b00 (Charging)'
    case 1:
      return '0b01 (Discharging)'
    case 2:
      return '0b10 (Idle)'
    default:
      return formatCode(status, 2, 'Reserved')
  }
}

const formatUsbMode = (usbMode: number): string => {
  switch (usbMode) {
    case 0:
      return '0b000 (USB 2.0)'
    case 1:
      return '0b001 (USB 3.2)'
    case 2:
      return '0b010 (USB4)'
    default:
      return formatCode(usbMode, 3, 'Reserved')
  }
}

const formatEnterUsbCableSpeed = (cableSpeed: number): string => {
  switch (cableSpeed) {
    case 0:
      return '0b000 (USB 2.0 only)'
    case 1:
      return '0b001 (USB 3.2 Gen1)'
    case 2:
      return '0b010 (USB 3.2 Gen2 and USB4 Gen2)'
    case 3:
      return '0b011 (USB4 Gen3)'
    case 4:
      return '0b100 (USB4 Gen4)'
    default:
      return formatCode(cableSpeed, 3, 'Reserved')
  }
}

const formatEnterUsbCableType = (cableType: number): string => {
  switch (cableType) {
    case 0:
      return '0b00 (Passive)'
    case 1:
      return '0b01 (Active Re-timer)'
    case 2:
      return '0b10 (Active Re-driver)'
    case 3:
      return '0b11 (Optically Isolated)'
    default:
      return formatCode(cableType, 2, 'Reserved')
  }
}

const formatEnterUsbCableCurrent = (cableCurrent: number): string => {
  switch (cableCurrent) {
    case 0:
      return '0b00 (VBUS is not supported)'
    case 1:
      return '0b01 (Reserved)'
    case 2:
      return '0b10 (3 A)'
    case 3:
      return '0b11 (5 A)'
    default:
      return formatCode(cableCurrent, 2, 'Reserved')
  }
}

const formatEprModeAction = (action: number): string => {
  switch (action) {
    case 0x01:
      return '0x01 (Enter)'
    case 0x02:
      return '0x02 (Enter Acknowledged)'
    case 0x03:
      return '0x03 (Enter Succeeded)'
    case 0x04:
      return '0x04 (Enter Failed)'
    case 0x05:
      return '0x05 (Exit)'
    default:
      return `Reserved (0x${action.toString(16).toUpperCase().padStart(2, '0')})`
  }
}

const formatSourceInfoPortType = (portType: number): string =>
  portType === 1 ? '0b1 (Guaranteed Capability Port)' : '0b0 (Managed Capability Port)'

const formatEprModeData = (action: number, data: number): string => {
  const raw = `0x${data.toString(16).toUpperCase().padStart(2, '0')}`
  switch (action) {
    case 0x01:
      return `${raw} (EPR Sink Operational PDP)`
    case 0x02:
    case 0x03:
    case 0x05:
      return `${raw} (Shall be zero)`
    case 0x04:
      switch (data) {
        case 0x00: return `${raw} (Unknown cause)`
        case 0x01: return `${raw} (Cable not EPR Capable)`
        case 0x02: return `${raw} (Source failed to become VCONN Source)`
        case 0x03: return `${raw} (EPR Capable bit not set in RDO)`
        case 0x04: return `${raw} (Source unable to enter EPR Mode)`
        case 0x05: return `${raw} (EPR Capable bit not set in PDO)`
        default: return `${raw} (Reserved)`
      }
    default:
      return `${raw} (Reserved)`
  }
}

const formatStructuredVdmType = (raw: number): string =>
  getBits(raw, 15, 15) === 1 ? '0b1 (Structured VDM)' : '0b0 (Unstructured VDM)'

const formatStructuredVdmVersionMajor = (major: number): string => {
  switch (major) {
    case 0b00: return '0b00 (Version 1.0, deprecated)'
    case 0b01: return '0b01 (Version 2.x)'
    default: return formatCode(major, 2, 'Reserved')
  }
}

const formatStructuredVdmVersionMinor = (minor: number): string => {
  switch (minor) {
    case 0b00: return '0b00 (Version 2.0)'
    case 0b01: return '0b01 (Version 2.1)'
    default: return formatCode(minor, 2, 'Reserved')
  }
}

const formatStructuredVdmCommandType = (commandType: number): string => {
  switch (commandType) {
    case 0b00: return '0b00 (REQ)'
    case 0b01: return '0b01 (ACK)'
    case 0b10: return '0b10 (NAK)'
    case 0b11: return '0b11 (BUSY)'
    default: return formatCode(commandType, 2, 'Reserved')
  }
}

export const formatVoltageRegulation = (value: number): string => {
  const slew = value & 0b11
  const magnitude = (value >> 2) & 0b1
  const slewText = slew === 0b00 ? '150 mA/µs load step' : slew === 0b01 ? '500 mA/µs load step' : 'Reserved'
  const magnitudeText = magnitude === 0b0 ? '25% IoC' : '90% IoC'
  return `0b${value.toString(2).padStart(8, '0')} (Load Step Slew Rate: ${slewText}; Load Step Magnitude: ${magnitudeText})`
}

export const formatComplianceBits = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 0)) !== 0) meanings.push('LPS')
  if ((value & (1 << 1)) !== 0) meanings.push('PS1')
  if ((value & (1 << 2)) !== 0) meanings.push('PS2')
  return formatBitfieldWithMeanings(value, 8, meanings)
}

export const formatTouchCurrent = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 0)) !== 0) meanings.push('Low touch current EPS')
  if ((value & (1 << 1)) !== 0) meanings.push('Ground pin supported')
  if ((value & (1 << 2)) !== 0) meanings.push('Ground pin intended for protective earth')
  return formatBitfieldWithMeanings(value, 8, meanings)
}

export const formatTouchTempSource = (value: number): string => {
  switch (value) {
    case 0: return '0x00 (IEC 60950-1)'
    case 1: return '0x01 (IEC 62368-1 TS1)'
    case 2: return '0x02 (IEC 62368-1 TS2)'
    default: return `0x${value.toString(16).toUpperCase().padStart(2, '0')} (Reserved)`
  }
}

const formatTouchTempSink = (value: number): string => {
  switch (value) {
    case 0: return '0x00 (Not applicable)'
    case 1: return '0x01 (IEC 60950-1)'
    case 2: return '0x02 (IEC 62368-1 TS1)'
    case 3: return '0x03 (IEC 62368-1 TS2)'
    default: return `0x${value.toString(16).toUpperCase().padStart(2, '0')} (Reserved)`
  }
}

export const formatSourceInputs = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 0)) !== 0) {
    meanings.push('External supply present')
    meanings.push((value & (1 << 1)) !== 0 ? 'External supply is unconstrained' : 'External supply is constrained')
  }
  if ((value & (1 << 2)) !== 0) meanings.push('Internal Battery present')
  return formatBitfieldWithMeanings(value, 8, meanings)
}

export const formatPeakCurrentField = (value: number): string => {
  const percentOverload = value & 0x1f
  const overloadPeriod = (value >> 5) & 0x3f
  const dutyCycle = (value >> 11) & 0x0f
  const droop = ((value >> 15) & 0x1) === 1
  return `0b${value.toString(2).padStart(16, '0')} (Percent overload: ${Math.min(percentOverload, 25) * 10}%; Overload period: ${overloadPeriod * 20} ms; Duty cycle: ${dutyCycle * 5}%; VBUS voltage droop: ${droop ? 'set' : 'clear'})`
}

const formatPresentInput = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 1)) !== 0) meanings.push(`External power present (${(value & (1 << 2)) !== 0 ? 'AC' : 'DC'})`)
  if ((value & (1 << 3)) !== 0) meanings.push('Internal power from Battery')
  if ((value & (1 << 4)) !== 0) meanings.push('Internal power from non-Battery source')
  return formatBitfieldWithMeanings(value, 8, meanings)
}

const formatPresentBatteryInput = (value: number): string => {
  const fixed = value & 0x0f
  const hotSwap = (value >> 4) & 0x0f
  return `0b${value.toString(2).padStart(8, '0')} (Fixed Batteries: 0b${fixed.toString(2).padStart(4, '0')}; Hot Swappable Batteries: 0b${hotSwap.toString(2).padStart(4, '0')})`
}

const formatStatusEventFlags = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 1)) !== 0) meanings.push('OCP event')
  if ((value & (1 << 2)) !== 0) meanings.push('OTP event')
  if ((value & (1 << 3)) !== 0) meanings.push('OVP event')
  if ((value & (1 << 4)) !== 0) meanings.push('CL mode (PPS only)')
  return formatBitfieldWithMeanings(value, 8, meanings)
}

const formatTemperatureStatus = (value: number): string => {
  const code = (value >> 1) & 0b11
  switch (code) {
    case 0b00: return `0b${value.toString(2).padStart(8, '0')} (Not Supported)`
    case 0b01: return `0b${value.toString(2).padStart(8, '0')} (Normal)`
    case 0b10: return `0b${value.toString(2).padStart(8, '0')} (Warning)`
    case 0b11: return `0b${value.toString(2).padStart(8, '0')} (Over temperature)`
    default: return `0b${value.toString(2).padStart(8, '0')} (Reserved)`
  }
}

const formatPowerStatus = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 1)) !== 0) meanings.push('Source power limited due to cable supported current')
  if ((value & (1 << 2)) !== 0) meanings.push('Source power limited while sourcing other ports')
  if ((value & (1 << 3)) !== 0) meanings.push('Source power limited due to insufficient external power')
  if ((value & (1 << 4)) !== 0) meanings.push('Source power limited due to Event Flags in place')
  if ((value & (1 << 5)) !== 0) meanings.push('Source power limited due to temperature')
  return formatBitfieldWithMeanings(value, 8, meanings)
}

const formatInternalTemperature = (value: number): string => {
  if (value === 0) {
    return 'Unsupported'
  }
  if (value === 1) {
    return '<2 C'
  }
  return `${value} C`
}

const formatPowerStateChange = (value: number): string => {
  const state = value & 0b111
  const indicator = (value >> 3) & 0b111
  const stateText = ['Status not supported', 'S0', 'Modern Standby', 'S3', 'S4', 'S5', 'G3', 'Reserved'][state] ?? 'Reserved'
  const indicatorText = ['Off LED', 'On LED', 'Blinking LED', 'Breathing LED', 'Reserved', 'Reserved', 'Reserved', 'Reserved'][indicator] ?? 'Reserved'
  return `0b${value.toString(2).padStart(8, '0')} (New Power State: ${stateText}; New Power State Indicator: ${indicatorText})`
}

const formatBatteryType = (value: number): string =>
  `0b${value.toString(2).padStart(8, '0')} (${(value & 0x1) !== 0 ? 'Invalid Battery Reference set' : 'Invalid Battery Reference clear'})`

const formatPpsRealTimeFlags = (value: number): string => {
  const ptf = (value >> 1) & 0b11
  const ptfText = ['Not Supported', 'Normal', 'Warning', 'Over temperature'][ptf] ?? 'Reserved'
  const omf = ((value >> 3) & 0x1) === 1 ? 'Current Limit mode' : 'Constant Voltage mode'
  return `0b${value.toString(2).padStart(8, '0')} (PTF: ${ptfText}; OMF: ${omf})`
}

const formatSkedbVersion = (value: number): string =>
  value === 1 ? '0x01 (Version 1.0)' : `0x${value.toString(16).toUpperCase().padStart(2, '0')} (Reserved)`

const formatSinkLoadStep = (value: number): string => {
  const slew = value & 0b11
  const slewText = slew === 0b00 ? '150 mA/µs load step' : slew === 0b01 ? '500 mA/µs load step' : 'Reserved'
  return `0b${value.toString(2).padStart(8, '0')} (Load Step Slew Rate: ${slewText})`
}

const formatSinkLoadCharacteristics = (value: number): string => {
  const percentOverload = value & 0x1f
  const overloadPeriod = (value >> 5) & 0x3f
  const dutyCycle = (value >> 11) & 0x0f
  const droop = ((value >> 15) & 0x1) === 1
  return `0b${value.toString(2).padStart(16, '0')} (Percent overload: ${Math.min(percentOverload, 25) * 10}%; Overload period: ${overloadPeriod * 20} ms; Duty cycle: ${dutyCycle * 5}%; Can tolerate VBUS voltage droop: ${droop ? 'Yes' : 'No'})`
}

const formatSinkModes = (value: number): string => {
  const meanings: string[] = []
  if ((value & (1 << 0)) !== 0) meanings.push('PPS charging supported')
  if ((value & (1 << 1)) !== 0) meanings.push('VBUS powered')
  if ((value & (1 << 2)) !== 0) meanings.push('AC Supply powered')
  if ((value & (1 << 3)) !== 0) meanings.push('Battery powered')
  if ((value & (1 << 4)) !== 0) meanings.push('Battery essentially unlimited')
  if ((value & (1 << 5)) !== 0) meanings.push('AVS Support')
  return formatBitfieldWithMeanings(value, 8, meanings)
}

const formatVdmSvid = (svid: number): string => `0x${svid.toString(16).toUpperCase().padStart(4, '0')}`

const buildBitfieldMetadata = (
  label: string,
  explanation: string,
  rawValue: number,
  bits: Array<{ key: string; label: string; active: boolean; explanation: string }>,
): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer(label, explanation)
  addStringMetadataField(
    container,
    'rawValue',
    'Raw Value',
    `0x${rawValue.toString(16).toUpperCase()}`,
    'Raw bitfield value before individual flag interpretation.',
  )
  bits.forEach((bit) => addBooleanMetadataField(container, bit.key, bit.label, bit.active, bit.explanation))
  return container
}

export const buildPDOMetadata = (pdo: ParsedPDO): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer(
    'Power Data Object',
    'Metadata describing one Power Data Object attached to a USB Power Delivery capabilities message.',
  )
  addRawUint32MetadataField(container, 'Raw 32-bit Power Data Object value before field interpretation.', pdo.raw)
  addStringMetadataField(
    container,
    'pdoType',
    'PDO Type',
    pdo.pdoType === 'APDO' ? `${pdo.pdoType} (${pdo.apdoType})` : pdo.pdoType,
    'Indicates which USB Power Delivery Power Data Object format is used for this entry.',
  )
  addStringMetadataField(
    container,
    'context',
    'Context',
    pdo.context,
    'Indicates whether this Power Data Object was parsed using source or sink field meanings.',
  )

  if (pdo.pdoType === 'FIXED') {
    addBooleanMetadataField(container, 'dualRolePower', 'Dual-Role Power', pdo.dualRolePower, 'Indicates whether the port supports swapping power roles when using this Fixed Supply PDO.')
    addBooleanMetadataField(container, 'usbSuspendSupportedOrHigherCapability', 'USB Suspend Supported / Higher Capability', pdo.usbSuspendSupportedOrHigherCapability, 'In source context this bit indicates USB suspend support; in sink context it indicates higher capability as defined by the USB Power Delivery specification.')
    addBooleanMetadataField(container, 'unconstrainedPower', 'Unconstrained Power', pdo.unconstrainedPower, 'Indicates whether the source advertises unconstrained power or the sink requests unconstrained operation.')
    addBooleanMetadataField(container, 'usbCommunicationsCapable', 'USB Communications Capable', pdo.usbCommunicationsCapable, 'Indicates whether USB data communications are supported while operating on this PDO.')
    addBooleanMetadataField(container, 'dualRoleData', 'Dual-Role Data', pdo.dualRoleData, 'Indicates whether the port supports both UFP and DFP data roles while using this PDO.')
    addBooleanMetadataField(container, 'unchunkedExtendedMessagesSupported', 'Unchunked Extended Messages Supported', pdo.unchunkedExtendedMessagesSupported, 'Indicates support for unchunked Extended Messages when this bit is defined for the PDO context.')
    addBooleanMetadataField(container, 'eprCapable', 'EPR Capable', pdo.eprCapable, 'Indicates whether the source advertises Extended Power Range capability in this Fixed Supply PDO.')
    if (pdo.fastRoleSwapRequiredCurrent !== null) {
      addStringMetadataField(container, 'fastRoleSwapRequiredCurrent', 'Fast Role Swap Required Current', formatPowerRoleSwapCurrent(pdo.fastRoleSwapRequiredCurrent), 'Encoded current requirement used by sink Fixed Supply PDOs for Fast Role Swap support.')
    }
    if (pdo.peakCurrent !== null) {
      addStringMetadataField(container, 'peakCurrent', 'Peak Current', formatPeakCurrentCode(pdo.peakCurrent), 'Encoded peak-current capability advertised by a source Fixed Supply PDO.')
    }
    addNumberMetadataField(container, 'voltage50mV', 'Voltage', pdo.voltage50mV * 50, 'Nominal PDO voltage expressed in millivolts.', 'mV')
    addNumberMetadataField(container, 'current10mA', 'Current', pdo.current10mA * 10, 'Maximum current for a source PDO or operational current for a sink PDO, expressed in milliamps.', 'mA')
    return container
  }

  if (pdo.pdoType === 'VARIABLE') {
    addNumberMetadataField(container, 'maximumVoltage50mV', 'Maximum Voltage', pdo.maximumVoltage50mV * 50, 'Maximum voltage supported by this Variable Supply PDO, expressed in millivolts.', 'mV')
    addNumberMetadataField(container, 'minimumVoltage50mV', 'Minimum Voltage', pdo.minimumVoltage50mV * 50, 'Minimum voltage supported by this Variable Supply PDO, expressed in millivolts.', 'mV')
    addNumberMetadataField(container, 'current10mA', 'Current', pdo.current10mA * 10, 'Maximum current for a source PDO or operational current for a sink PDO, expressed in milliamps.', 'mA')
    return container
  }

  if (pdo.pdoType === 'BATTERY') {
    addNumberMetadataField(container, 'maximumVoltage50mV', 'Maximum Voltage', pdo.maximumVoltage50mV * 50, 'Maximum voltage supported by this Battery Supply PDO, expressed in millivolts.', 'mV')
    addNumberMetadataField(container, 'minimumVoltage50mV', 'Minimum Voltage', pdo.minimumVoltage50mV * 50, 'Minimum voltage supported by this Battery Supply PDO, expressed in millivolts.', 'mV')
    addNumberMetadataField(container, 'power250mW', 'Power', pdo.power250mW * 250, 'Maximum power for a source PDO or operational power for a sink PDO, expressed in milliwatts.', 'mW')
    return container
  }

  addStringMetadataField(container, 'apdoType', 'APDO Type', pdo.apdoType, 'Indicates which Augmented Power Data Object sub-format is used.')
  if (pdo.apdoType === 'SPR_PPS') {
    if (pdo.ppsPowerLimited !== null) {
      addBooleanMetadataField(container, 'ppsPowerLimited', 'PPS Power Limited', pdo.ppsPowerLimited, 'Indicates whether the source advertises that Programmable Power Supply output is power limited.')
    }
    addNumberMetadataField(container, 'maximumVoltage100mV', 'Maximum Voltage', pdo.maximumVoltage100mV * 100, 'Maximum programmable voltage advertised by this SPR PPS APDO, expressed in millivolts.', 'mV')
    addNumberMetadataField(container, 'minimumVoltage100mV', 'Minimum Voltage', pdo.minimumVoltage100mV * 100, 'Minimum programmable voltage advertised by this SPR PPS APDO, expressed in millivolts.', 'mV')
    addNumberMetadataField(container, 'maximumCurrent50mA', 'Maximum Current', pdo.maximumCurrent50mA * 50, 'Maximum programmable current advertised by this SPR PPS APDO, expressed in milliamps.', 'mA')
    return container
  }
  if (pdo.apdoType === 'SPR_AVS') {
    if (pdo.peakCurrent !== null) {
      addStringMetadataField(container, 'peakCurrent', 'Peak Current', formatPeakCurrentCode(pdo.peakCurrent), 'Encoded peak-current capability advertised by a source SPR AVS APDO.')
    }
    addNumberMetadataField(container, 'maxCurrent15V10mA', 'Maximum Current at 15 V', pdo.maxCurrent15V10mA * 10, 'Maximum current supported at 15 V for this SPR AVS APDO, expressed in milliamps.', 'mA')
    addNumberMetadataField(container, 'maxCurrent20V10mA', 'Maximum Current at 20 V', pdo.maxCurrent20V10mA * 10, 'Maximum current supported at 20 V for this SPR AVS APDO, expressed in milliamps.', 'mA')
    return container
  }
  if (pdo.apdoType === 'EPR_AVS') {
    if (pdo.peakCurrent !== null) {
      addStringMetadataField(container, 'peakCurrent', 'Peak Current', formatPeakCurrentCode(pdo.peakCurrent), 'Encoded peak-current capability advertised by a source EPR AVS APDO.')
    }
    addNumberMetadataField(container, 'maximumVoltage100mV', 'Maximum Voltage', pdo.maximumVoltage100mV * 100, 'Maximum voltage supported by this EPR AVS APDO, expressed in millivolts.', 'mV')
    addNumberMetadataField(container, 'minimumVoltage100mV', 'Minimum Voltage', pdo.minimumVoltage100mV * 100, 'Minimum voltage supported by this EPR AVS APDO, expressed in millivolts.', 'mV')
    addNumberMetadataField(container, 'pdp1W', 'PDP', pdo.pdp1W, 'Power Data Profile rating carried by this EPR AVS APDO, expressed in watts.', 'W')
    return container
  }

  addStringMetadataField(container, 'reservedApdo', 'Reserved APDO', 'Reserved', 'Indicates that the APDO subtype bits do not map to a defined Augmented Power Data Object type in the current parser.')
  return container
}

export const buildRDOMetadata = (rdo: ParsedRDO): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Request Data Object', 'Metadata describing one Request Data Object from a USB Power Delivery Request or EPR_Request message.')
  addRawUint32MetadataField(container, 'Raw 32-bit Request Data Object value before field interpretation.', rdo.raw)
  addNumberMetadataField(container, 'objectPosition', 'Object Position', rdo.objectPosition, 'Identifies which advertised source object the request refers to.')
  addBooleanMetadataField(container, 'giveback', 'GiveBack', rdo.giveback, 'Deprecated GiveBack flag from the Request Data Object.')
  addBooleanMetadataField(container, 'capabilityMismatch', 'Capability Mismatch', rdo.capabilityMismatch, 'Indicates that the requester cannot be fully satisfied by the offered source capabilities.')
  addBooleanMetadataField(container, 'usbCommunicationsCapable', 'USB Communications Capable', rdo.usbCommunicationsCapable, 'Indicates that the sink remains capable of USB data communications while requesting this contract.')
  addBooleanMetadataField(container, 'noUsbSuspend', 'No USB Suspend', rdo.noUsbSuspend, 'Requests that the source not place USB into suspend while this contract is active.')
  addBooleanMetadataField(container, 'unchunkedExtendedMessagesSupported', 'Unchunked Extended Messages Supported', rdo.unchunkedExtendedMessagesSupported, 'Indicates sink support for unchunked Extended Messages.')
  addBooleanMetadataField(container, 'eprCapable', 'EPR Capable', rdo.eprCapable, 'Indicates sink support for Extended Power Range operation.')
  addStringMetadataField(container, 'requestTypeHint', 'Request Type', rdo.requestTypeHint, 'Best-effort interpretation of the Request Data Object based on the referenced or copied PDO when available.')

  if (rdo.requestTypeHint === 'battery') {
    const battery = createMetadataContainer('Battery Request', 'Battery RDO interpretation fields.')
    addNumberMetadataField(battery, 'operatingPower250mW', 'Operating Power', rdo.battery.operatingPower250mW * 250, 'Requested operating power using the Battery RDO interpretation, expressed in milliwatts.', 'mW')
    addNumberMetadataField(battery, 'maximumOperatingPower250mW', 'Maximum Operating Power', rdo.battery.maximumOperatingPower250mW * 250, 'Requested maximum operating power using the Battery RDO interpretation, expressed in milliwatts.', 'mW')
    container.setEntry('battery', battery)
    return container
  }

  if (rdo.requestTypeHint === 'pps') {
    const pps = createMetadataContainer('PPS Request', 'Programmable Power Supply RDO interpretation fields.')
    addNumberMetadataField(pps, 'outputVoltage20mV', 'Output Voltage', rdo.pps.outputVoltage20mV * 20, 'Requested PPS output voltage, expressed in millivolts.', 'mV')
    addNumberMetadataField(pps, 'operatingCurrent50mA', 'Operating Current', rdo.pps.operatingCurrent50mA * 50, 'Requested PPS operating current, expressed in milliamps.', 'mA')
    container.setEntry('pps', pps)
    return container
  }

  if (rdo.requestTypeHint === 'avs') {
    const avs = createMetadataContainer('AVS Request', 'Adjustable Voltage Supply RDO interpretation fields.')
    addNumberMetadataField(avs, 'outputVoltage25mV', 'Output Voltage', rdo.avs.outputVoltage25mV * 25, 'Requested AVS output voltage, expressed in millivolts.', 'mV')
    addNumberMetadataField(avs, 'operatingCurrent50mA', 'Operating Current', rdo.avs.operatingCurrent50mA * 50, 'Requested AVS operating current, expressed in milliamps.', 'mA')
    container.setEntry('avs', avs)
    return container
  }

  const fixedVariable = createMetadataContainer('Fixed/Variable Request', 'Fixed/Variable RDO interpretation fields.')
  addNumberMetadataField(fixedVariable, 'operatingCurrent10mA', 'Operating Current', rdo.fixedVariable.operatingCurrent10mA * 10, 'Requested operating current using the Fixed/Variable RDO interpretation, expressed in milliamps.', 'mA')
  addNumberMetadataField(fixedVariable, 'maximumOperatingCurrent10mA', 'Maximum Operating Current', rdo.fixedVariable.maximumOperatingCurrent10mA * 10, 'Requested maximum operating current using the Fixed/Variable RDO interpretation, expressed in milliamps.', 'mA')
  container.setEntry('fixedVariable', fixedVariable)

  return container
}

export const buildBISTDataObjectMetadata = (bist: ParsedBISTDataObject): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('BIST Data Object', 'Metadata describing the Built-In Self Test Data Object carried by a BIST message.')
  addRawUint32MetadataField(container, 'Raw 32-bit BIST Data Object value before field interpretation.', bist.raw)
  addStringMetadataField(container, 'mode', 'Mode', `${bist.modeName} (0x${bist.mode.toString(16).toUpperCase()})`, 'Identifies which Built-In Self Test mode the BIST message is requesting or reporting.')
  addStringMetadataField(container, 'reserved', 'Reserved', `0x${bist.reserved.toString(16).toUpperCase()}`, 'Reserved bits in the BIST Data Object that do not currently carry a defined meaning in this parser.')
  return container
}

export const buildBatteryStatusDataObjectMetadata = (batteryStatus: ParsedBatteryStatusDataObject): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Battery Status Data Object', 'Metadata describing the Battery Status Data Object carried by a Battery_Status message.')
  addRawUint32MetadataField(container, 'Raw 32-bit Battery Status Data Object value before field interpretation.', batteryStatus.raw)
  addNumberMetadataField(container, 'batteryPresentCapacity', 'Battery Present Capacity', batteryStatus.batteryPresentCapacity, 'Battery present capacity reported by the message, expressed in 0.1 Wh units.', 'x0.1Wh')
  addBooleanMetadataField(container, 'invalidBatteryReference', 'Invalid Battery Reference', batteryStatus.invalidBatteryReference, 'Indicates that the referenced battery slot is invalid.')
  addBooleanMetadataField(container, 'batteryPresent', 'Battery Present', batteryStatus.batteryPresent, 'Indicates whether the referenced battery is physically present.')
  addStringMetadataField(container, 'batteryChargingStatus', 'Battery Charging Status', formatBatteryChargingStatus(batteryStatus.batteryChargingStatus), 'Reports whether the battery is charging, discharging, idle, or in a reserved charging-state encoding.')
  return container
}

export const buildAlertDataObjectMetadata = (alert: ParsedAlertDataObject): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Alert Data Object', 'Metadata describing the Alert Data Object carried by an Alert message.')
  addRawUint32MetadataField(container, 'Raw 32-bit Alert Data Object value before field interpretation.', alert.raw)
  container.setEntry('typeOfAlert', buildBitfieldMetadata('Type of Alert', 'Alert flags defined by the Alert Data Object.', alert.typeOfAlert, [
    { key: 'batteryStatusChange', label: 'Battery Status Change', active: (alert.typeOfAlert & (1 << 1)) !== 0, explanation: 'Indicates that a battery status change event has occurred.' },
    { key: 'ocp', label: 'Over-Current Protection', active: (alert.typeOfAlert & (1 << 2)) !== 0, explanation: 'Indicates that an over-current protection event has occurred.' },
    { key: 'otp', label: 'Over-Temperature Protection', active: (alert.typeOfAlert & (1 << 3)) !== 0, explanation: 'Indicates that an over-temperature protection event has occurred.' },
    { key: 'operatingConditionChange', label: 'Operating Condition Change', active: (alert.typeOfAlert & (1 << 4)) !== 0, explanation: 'Indicates a change in the source or sink operating condition.' },
    { key: 'sourceInputChange', label: 'Source Input Change', active: (alert.typeOfAlert & (1 << 5)) !== 0, explanation: 'Indicates a change in source input conditions.' },
    { key: 'ovp', label: 'Over-Voltage Protection', active: (alert.typeOfAlert & (1 << 6)) !== 0, explanation: 'Indicates that an over-voltage protection event has occurred.' },
    { key: 'extendedAlertEvent', label: 'Extended Alert Event', active: (alert.typeOfAlert & (1 << 7)) !== 0, explanation: 'Indicates that the Extended Alert Event Type field is valid.' },
  ]))
  addStringMetadataField(container, 'fixedBatteries', 'Fixed Batteries', `0b${alert.fixedBatteries.toString(2).padStart(4, '0')}`, 'Bitfield identifying which fixed battery slots are associated with the alert.')
  addStringMetadataField(container, 'hotSwappableBatteries', 'Hot Swappable Batteries', `0b${alert.hotSwappableBatteries.toString(2).padStart(4, '0')}`, 'Bitfield identifying which hot-swappable battery slots are associated with the alert.')
  addStringMetadataField(container, 'extendedAlertEventType', 'Extended Alert Event Type', alert.extendedAlertEventType.toString(), 'Alert-specific event subtype carried in the Alert Data Object when the Extended Alert Event flag is set.')
  return container
}

export const buildCountryCodeDataObjectMetadata = (countryCode: ParsedCountryCodeDataObject): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Country Code Data Object', 'Metadata describing the Country Code Data Object carried by a Get_Country_Info message.')
  addRawUint32MetadataField(container, 'Raw 32-bit Country Code Data Object value before field interpretation.', countryCode.raw)
  addStringMetadataField(container, 'countryCode', 'Country Code', countryCode.countryCode ?? 'Unavailable', 'Two-character ISO-style country code derived from the ASCII bytes in the data object when printable.')
  addStringMetadataField(container, 'countryCodeChar1', 'Country Code Character 1', String.fromCharCode(countryCode.countryCodeChar1), 'First ASCII character of the requested country code.')
  addStringMetadataField(container, 'countryCodeChar2', 'Country Code Character 2', String.fromCharCode(countryCode.countryCodeChar2), 'Second ASCII character of the requested country code.')
  return container
}

export const buildEnterUSBDataObjectMetadata = (enterUsb: ParsedEnterUSBDataObject): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Enter USB Data Object', 'Metadata describing the Enter_USB Data Object used to negotiate USB data mode entry.')
  addRawUint32MetadataField(container, 'Raw 32-bit Enter_USB Data Object value before field interpretation.', enterUsb.raw)
  addStringMetadataField(container, 'usbMode', 'USB Mode', formatUsbMode(enterUsb.usbMode), 'Requested USB operating mode encoded in the Enter_USB Data Object.')
  addStringMetadataField(container, 'usb4Drd', 'USB4 DRD', enterUsb.usb4Drd ? '0b1 (Capable of operating as a USB4 Device)' : '0b0 (Not capable of operating as a USB4 Device)', 'Indicates USB4 dual-role-data capability.')
  addStringMetadataField(container, 'usb3Drd', 'USB3 DRD', enterUsb.usb3Drd ? '0b1 (Capable of operating as a USB 3.2 Device)' : '0b0 (Not capable of operating as a USB 3.2 Device)', 'Indicates USB 3 dual-role-data capability.')
  addStringMetadataField(container, 'cableSpeed', 'Cable Speed', formatEnterUsbCableSpeed(enterUsb.cableSpeed), 'Highest cable speed advertised for Enter_USB negotiation.')
  addStringMetadataField(container, 'cableType', 'Cable Type', formatEnterUsbCableType(enterUsb.cableType), 'Cable implementation type encoded by the Enter_USB Data Object.')
  addStringMetadataField(container, 'cableCurrent', 'Cable Current', formatEnterUsbCableCurrent(enterUsb.cableCurrent), 'Cable current capability encoded by the Enter_USB Data Object.')
  addStringMetadataField(container, 'pcieSupport', 'PCIe Support', enterUsb.pcieSupport ? '0b1 (PCIe tunneling supported by the host)' : '0b0 (Not indicated)', 'Indicates PCIe tunneling support.')
  addStringMetadataField(container, 'dpSupport', 'DisplayPort Support', enterUsb.dpSupport ? '0b1 (DP tunneling supported by the host)' : '0b0 (Not indicated)', 'Indicates DisplayPort Alternate Mode support.')
  addStringMetadataField(container, 'tbtSupport', 'Thunderbolt Support', enterUsb.tbtSupport ? '0b1 (TBT3 supported by the host connection manager)' : '0b0 (Not indicated)', 'Indicates Thunderbolt compatibility support.')
  addStringMetadataField(container, 'hostPresent', 'Host Present', enterUsb.hostPresent ? '0b1 (A Host is present at the top of the USB tree)' : '0b0 (No Host present)', 'Indicates that a host is present for the negotiated USB mode.')
  return container
}

export const buildEPRModeDataObjectMetadata = (eprMode: ParsedEPRModeDataObject): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('EPR Mode Data Object', 'Metadata describing the EPR Mode Data Object carried by an EPR_Mode message.')
  addRawUint32MetadataField(container, 'Raw 32-bit EPR Mode Data Object value before field interpretation.', eprMode.raw)
  addStringMetadataField(container, 'action', 'Action', formatEprModeAction(eprMode.action), 'Action code that indicates the current Extended Power Range mode transition state.')
  addStringMetadataField(container, 'data', 'Data', formatEprModeData(eprMode.action, eprMode.data), 'Action-specific data field carried by the EPR Mode Data Object.')
  return container
}

export const buildSourceInfoDataObjectMetadata = (sourceInfo: ParsedSourceInfoDataObject): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Source Info Data Object', 'Metadata describing the Source Info Data Object carried by a Source_Info message.')
  addRawUint32MetadataField(container, 'Raw 32-bit Source Info Data Object value before field interpretation.', sourceInfo.raw)
  addStringMetadataField(container, 'portType', 'Port Type', formatSourceInfoPortType(sourceInfo.portType), 'Indicates whether the source port is managed or guaranteed.')
  addNumberMetadataField(container, 'portMaximumPdp', 'Port Maximum PDP', sourceInfo.portMaximumPdp, 'Maximum Power Data Profile rating reported by the source port.', 'W')
  addNumberMetadataField(container, 'portPresentPdp', 'Port Present PDP', sourceInfo.portPresentPdp, 'Present Power Data Profile level at which the source is operating.', 'W')
  addNumberMetadataField(container, 'portReportedPdp', 'Port Reported PDP', sourceInfo.portReportedPdp, 'Reported Power Data Profile level associated with the source port.', 'W')
  return container
}

export const buildRevisionDataObjectMetadata = (revision: ParsedRevisionDataObject): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Revision Data Object', 'Metadata describing the Revision Data Object carried by a Revision message.')
  addRawUint32MetadataField(container, 'Raw 32-bit Revision Data Object value before field interpretation.', revision.raw)
  addNumberMetadataField(container, 'revisionMajor', 'Revision Major', revision.revisionMajor, 'Major revision number encoded in the Revision Data Object.')
  addNumberMetadataField(container, 'revisionMinor', 'Revision Minor', revision.revisionMinor, 'Minor revision number encoded in the Revision Data Object.')
  addNumberMetadataField(container, 'versionMajor', 'Version Major', revision.versionMajor, 'Major version number encoded in the Revision Data Object.')
  addNumberMetadataField(container, 'versionMinor', 'Version Minor', revision.versionMinor, 'Minor version number encoded in the Revision Data Object.')
  return container
}

export const buildVDMHeaderMetadata = (vdmHeader: ParsedVDMHeader): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('VDM Header', 'Metadata describing the Vendor Defined Message header object.')
  addRawUint32MetadataField(container, 'Raw 32-bit Vendor Defined Message header value before field interpretation.', vdmHeader.raw)
  addStringMetadataField(container, 'svid', 'SVID', formatVdmSvid(vdmHeader.svid), 'Standard or vendor identifier associated with this Vendor Defined Message.')
  addStringMetadataField(container, 'vdmType', 'VDM Type', formatStructuredVdmType(vdmHeader.raw), 'Indicates whether the Vendor Defined Message is structured or unstructured.')
  if (vdmHeader.structuredVersionMajor !== null) {
    addStringMetadataField(container, 'structuredVersionMajor', 'Structured VDM Version Major', formatStructuredVdmVersionMajor(vdmHeader.structuredVersionMajor), 'Major Structured VDM version encoded in the header.')
  }
  if (vdmHeader.structuredVersionMinor !== null) {
    addStringMetadataField(container, 'structuredVersionMinor', 'Structured VDM Version Minor', formatStructuredVdmVersionMinor(vdmHeader.structuredVersionMinor), 'Minor Structured VDM version encoded in the header.')
  }
  if (vdmHeader.objectPosition !== null) {
    addNumberMetadataField(container, 'objectPosition', 'Object Position', vdmHeader.objectPosition, 'Structured VDM object position field used by certain commands.')
  }
  if (vdmHeader.commandType !== null) {
    addStringMetadataField(container, 'commandType', 'Command Type', formatStructuredVdmCommandType(vdmHeader.commandType), 'Structured VDM command type field indicating REQ, ACK, NAK, or BUSY.')
  }
  if (vdmHeader.command !== null) {
    addStringMetadataField(container, 'command', 'Command', vdmHeader.commandName ? `${vdmHeader.commandName} (0x${vdmHeader.command.toString(16).toUpperCase()})` : `0x${vdmHeader.command.toString(16).toUpperCase()}`, 'Structured VDM command code carried by the header.')
  }
  if (vdmHeader.vendorPayload !== null) {
    addStringMetadataField(container, 'vendorPayload', 'Vendor Payload', `0x${vdmHeader.vendorPayload.toString(16).toUpperCase()}`, 'Vendor-defined payload bits used when the VDM is unstructured.')
  }
  return container
}

export const buildIDHeaderVDOMetadata = (idHeader: ParsedIDHeaderVDO): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('ID Header VDO', 'Metadata describing the Discover Identity ID Header VDO.')
  addRawUint32MetadataField(container, 'Raw 32-bit ID Header VDO value before field interpretation.', idHeader.raw)
  addBooleanMetadataField(container, 'usbHostCapable', 'USB Host Capable', idHeader.usbHostCapable, 'Indicates USB host capability in the Discover Identity response.')
  addBooleanMetadataField(container, 'usbDeviceCapable', 'USB Device Capable', idHeader.usbDeviceCapable, 'Indicates USB device capability in the Discover Identity response.')
  addStringMetadataField(container, 'sopProductTypeUfpOrCable', 'SOP Product Type (UFP/Cable)', formatSopProductTypeCombined(idHeader.sopProductTypeUfpOrCable), 'Product type code shared by SOP UFP responses and SOP\' cable/VPD responses in the ID Header VDO.')
  addBooleanMetadataField(container, 'modalOperationSupported', 'Modal Operation Supported', idHeader.modalOperationSupported, 'Indicates support for modal operation in the Discover Identity response.')
  addStringMetadataField(container, 'sopProductTypeDfp', 'SOP Product Type (DFP)', formatSopProductTypeDfp(idHeader.sopProductTypeDfp), 'Product type field used for DFP-directed Discover Identity responses.')
  addStringMetadataField(container, 'connectorType', 'Connector Type', formatConnectorType(idHeader.connectorType), 'Connector type code reported by the Discover Identity response.')
  addStringMetadataField(container, 'usbVendorId', 'USB Vendor ID', formatVdmSvid(idHeader.usbVendorId), 'USB Vendor ID reported by the Discover Identity response.')
  return container
}

export const buildCertStatVDOMetadata = (certStat: ParsedCertStatVDO): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Cert Stat VDO', 'Metadata describing the Discover Identity Cert Stat VDO.')
  addRawUint32MetadataField(container, 'Raw 32-bit Cert Stat VDO value before field interpretation.', certStat.raw)
  addStringMetadataField(container, 'xid', 'XID', `0x${certStat.xid.toString(16).toUpperCase().padStart(8, '0')}`, 'XID value reported by the Discover Identity response.')
  return container
}

export const buildProductVDOMetadata = (product: ParsedProductVDO): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Product VDO', 'Metadata describing the Discover Identity Product VDO.')
  addRawUint32MetadataField(container, 'Raw 32-bit Product VDO value before field interpretation.', product.raw)
  addStringMetadataField(container, 'usbProductId', 'USB Product ID', `0x${product.usbProductId.toString(16).toUpperCase().padStart(4, '0')}`, 'USB Product ID reported by the Discover Identity response.')
  addStringMetadataField(container, 'bcdDevice', 'bcdDevice', `0x${product.bcdDevice.toString(16).toUpperCase().padStart(4, '0')}`, 'Binary-coded device revision reported by the Discover Identity response.')
  return container
}

const buildSimpleNumericMetadata = (
  label: string,
  explanation: string,
  raw: number,
  fields: Array<{ key: string; label: string; value: string; explanation: string }>,
): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer(label, explanation)
  addRawUint32MetadataField(container, `Raw 32-bit ${label} value before field interpretation.`, raw)
  fields.forEach((field) => addStringMetadataField(container, field.key, field.label, field.value, field.explanation))
  return container
}

export const buildUFPVDOMetadata = (ufp: ParsedUFPVDO): HumanReadableField<'OrderedDictionary'> =>
  buildSimpleNumericMetadata('UFP VDO', 'Metadata describing a UFP VDO from a Discover Identity response.', ufp.raw, [
    { key: 'vdoVersion', label: 'VDO Version', value: formatUfpVdoVersion(ufp.vdoVersion), explanation: 'Version field encoded in the UFP VDO.' },
    { key: 'deviceCapability', label: 'Device Capability', value: formatUfpDeviceCapability(ufp.deviceCapability), explanation: 'Device capability bitfield carried by the UFP VDO.' },
    { key: 'vconnPower', label: 'VCONN Power', value: formatVconnPower(ufp.vconnPower), explanation: 'VCONN power requirement encoding carried by the UFP VDO.' },
    { key: 'vconnRequired', label: 'VCONN Required', value: ufp.vconnRequired ? '0b1 (Yes)' : '0b0 (No)', explanation: 'Indicates whether VCONN is required by the product.' },
    { key: 'vbusRequired', label: 'VBUS Required', value: ufp.vbusRequired ? '0b0 (Yes)' : '0b1 (No)', explanation: 'Indicates whether VBUS is required by the product.' },
    { key: 'alternateModes', label: 'Alternate Modes', value: formatAlternateModes(ufp.alternateModes), explanation: 'Alternate mode capability bitfield carried by the UFP VDO.' },
    { key: 'usbHighestSpeed', label: 'USB Highest Speed', value: formatUsbHighestSpeed(ufp.usbHighestSpeed), explanation: 'Highest USB speed code reported by the UFP VDO.' },
  ])

export const buildDFPVDOMetadata = (dfp: ParsedDFPVDO): HumanReadableField<'OrderedDictionary'> =>
  buildSimpleNumericMetadata('DFP VDO', 'Metadata describing a DFP VDO from a Discover Identity response.', dfp.raw, [
    { key: 'vdoVersion', label: 'VDO Version', value: formatDfpVdoVersion(dfp.vdoVersion), explanation: 'Version field encoded in the DFP VDO.' },
    { key: 'hostCapability', label: 'Host Capability', value: formatDfpHostCapability(dfp.hostCapability), explanation: 'Host capability bitfield carried by the DFP VDO.' },
    { key: 'portNumber', label: 'Port Number', value: dfp.portNumber.toString(), explanation: 'Port number encoded in the DFP VDO.' },
  ])

export const buildPassiveCableVDOMetadata = (cable: ParsedPassiveCableVDO): HumanReadableField<'OrderedDictionary'> =>
  buildSimpleNumericMetadata('Passive Cable VDO', 'Metadata describing a Passive Cable VDO from a Discover Identity response.', cable.raw, [
    { key: 'hwVersion', label: 'Hardware Version', value: cable.hwVersion.toString(), explanation: 'Hardware version code reported by the passive cable VDO.' },
    { key: 'fwVersion', label: 'Firmware Version', value: cable.fwVersion.toString(), explanation: 'Firmware version code reported by the passive cable VDO.' },
    { key: 'vdoVersion', label: 'VDO Version', value: formatCableOrVpdVdoVersion(cable.vdoVersion), explanation: 'Version field encoded in the passive cable VDO.' },
    { key: 'plugToPlugOrCaptive', label: 'Plug Type', value: formatCablePlugType(cable.plugToPlugOrCaptive), explanation: 'Plug or captive-cable encoding carried by the passive cable VDO.' },
    { key: 'eprCapable', label: 'EPR Capable', value: cable.eprCapable ? '0b1 (Cable is EPR Capable)' : '0b0 (Cable is not EPR Capable)', explanation: 'Indicates Extended Power Range capability for the cable.' },
    { key: 'cableLatency', label: 'Cable Latency', value: formatPassiveCableLatency(cable.cableLatency), explanation: 'Cable latency code reported by the passive cable VDO.' },
    { key: 'cableTerminationType', label: 'Cable Termination Type', value: formatPassiveCableTerminationType(cable.cableTerminationType), explanation: 'Cable termination encoding reported by the passive cable VDO.' },
    { key: 'maximumVbusVoltage', label: 'Maximum VBUS Voltage', value: formatPassiveOrActiveMaximumVbusVoltage(cable.maximumVbusVoltage), explanation: 'Maximum VBUS voltage encoding reported by the passive cable VDO.' },
    { key: 'vbusCurrentHandlingCapability', label: 'VBUS Current Handling Capability', value: formatVbusCurrentHandlingCapability(cable.vbusCurrentHandlingCapability), explanation: 'Current handling capability encoding reported by the passive cable VDO.' },
    { key: 'usbHighestSpeed', label: 'USB Highest Speed', value: formatUsbHighestSpeed(cable.usbHighestSpeed), explanation: 'Highest USB speed code reported by the passive cable VDO.' },
  ])

export const buildActiveCableVDO1Metadata = (cable: ParsedActiveCableVDO1): HumanReadableField<'OrderedDictionary'> =>
  buildSimpleNumericMetadata('Active Cable VDO1', 'Metadata describing the first Active Cable VDO from a Discover Identity response.', cable.raw, [
    { key: 'hwVersion', label: 'Hardware Version', value: cable.hwVersion.toString(), explanation: 'Hardware version code reported by Active Cable VDO1.' },
    { key: 'fwVersion', label: 'Firmware Version', value: cable.fwVersion.toString(), explanation: 'Firmware version code reported by Active Cable VDO1.' },
    { key: 'vdoVersion', label: 'VDO Version', value: formatCableOrVpdVdoVersion(cable.vdoVersion), explanation: 'Version field encoded in Active Cable VDO1.' },
    { key: 'plugToPlugOrCaptive', label: 'Plug Type', value: formatCablePlugType(cable.plugToPlugOrCaptive), explanation: 'Plug or captive-cable encoding carried by Active Cable VDO1.' },
    { key: 'eprCapable', label: 'EPR Capable', value: cable.eprCapable ? '0b1 (Cable is EPR Capable)' : '0b0 (Cable is not EPR Capable)', explanation: 'Indicates Extended Power Range capability for the active cable.' },
    { key: 'cableLatency', label: 'Cable Latency', value: formatActiveCableLatency(cable.cableLatency), explanation: 'Cable latency code reported by Active Cable VDO1.' },
    { key: 'cableTerminationType', label: 'Cable Termination Type', value: formatActiveCableTerminationType(cable.cableTerminationType), explanation: 'Cable termination encoding reported by Active Cable VDO1.' },
    { key: 'maximumVbusVoltage', label: 'Maximum VBUS Voltage', value: formatPassiveOrActiveMaximumVbusVoltage(cable.maximumVbusVoltage), explanation: 'Maximum VBUS voltage encoding reported by Active Cable VDO1.' },
    { key: 'sbuSupported', label: 'SBU Supported', value: cable.sbuSupported ? '0b0 (SBU connections supported)' : '0b1 (SBU connections are not supported)', explanation: 'Indicates Sideband Use signal support for the active cable.' },
    { key: 'sbuType', label: 'SBU Type', value: cable.sbuSupported ? (cable.sbuType ? '0b1 (SBU is active)' : '0b0 (SBU is passive)') : `0b${cable.sbuType ? '1' : '0'} (Ignored because SBU connections are not supported)`, explanation: 'Sideband Use type bit carried by Active Cable VDO1.' },
    { key: 'vbusCurrentHandlingCapability', label: 'VBUS Current Handling Capability', value: cable.vbusThroughCable ? formatVbusCurrentHandlingCapability(cable.vbusCurrentHandlingCapability) : `0b${cable.vbusCurrentHandlingCapability.toString(2).padStart(2, '0')} (Ignored because VBUS Through Cable = No)`, explanation: 'Current handling capability encoding reported by Active Cable VDO1.' },
    { key: 'vbusThroughCable', label: 'VBUS Through Cable', value: cable.vbusThroughCable ? '0b1 (Yes)' : '0b0 (No)', explanation: 'Indicates whether VBUS passes through the active cable assembly.' },
    { key: 'sopDoublePrimeControllerPresent', label: 'SOP" Controller Present', value: cable.sopDoublePrimeControllerPresent ? '0b1 (SOP" controller present)' : '0b0 (No SOP" controller present)', explanation: 'Indicates the presence of an SOP" controller in the active cable.' },
    { key: 'usbHighestSpeed', label: 'USB Highest Speed', value: formatUsbHighestSpeed(cable.usbHighestSpeed), explanation: 'Highest USB speed code reported by Active Cable VDO1.' },
  ])

export const buildActiveCableVDO2Metadata = (cable: ParsedActiveCableVDO2): HumanReadableField<'OrderedDictionary'> =>
  buildSimpleNumericMetadata('Active Cable VDO2', 'Metadata describing the second Active Cable VDO from a Discover Identity response.', cable.raw, [
    { key: 'maximumOperatingTemperature', label: 'Maximum Operating Temperature', value: `${cable.maximumOperatingTemperature} C`, explanation: 'Maximum operating temperature reported by Active Cable VDO2.' },
    { key: 'shutdownTemperature', label: 'Shutdown Temperature', value: `${cable.shutdownTemperature} C`, explanation: 'Shutdown temperature reported by Active Cable VDO2.' },
    { key: 'u3CldPower', label: 'U3/CLd Power', value: formatU3CldPower(cable.u3CldPower), explanation: 'U3/CLd power encoding reported by Active Cable VDO2.' },
    { key: 'u3ToU0TransitionMode', label: 'U3 to U0 Transition Mode', value: cable.u3ToU0TransitionMode ? '0b1 (U3 to U0 through U3S)' : '0b0 (U3 to U0 direct)', explanation: 'Indicates the U3-to-U0 transition behavior of the active cable.' },
    { key: 'physicalConnection', label: 'Physical Connection', value: cable.physicalConnection ? '0b1 (Optical)' : '0b0 (Copper)', explanation: 'Indicates the physical connection style encoded by Active Cable VDO2.' },
    { key: 'activeElement', label: 'Active Element', value: cable.activeElement ? '0b1 (Active Re-timer)' : '0b0 (Active Re-driver)', explanation: 'Indicates the active element type in the cable.' },
    { key: 'usb4Supported', label: 'USB4 Supported', value: cable.usb4Supported ? '0b0 (USB4 supported)' : '0b1 (USB4 not supported)', explanation: 'Indicates USB4 support as decoded from the Active Cable VDO2 flag encoding.' },
    { key: 'usb2HubHopsConsumed', label: 'USB 2.0 Hub Hops Consumed', value: cable.usb2HubHopsConsumed.toString(), explanation: 'USB 2.0 hub-hop consumption encoded by Active Cable VDO2.' },
    { key: 'usb2Supported', label: 'USB 2.0 Supported', value: cable.usb2Supported ? '0b0 (USB 2.0 supported)' : '0b1 (USB 2.0 not supported)', explanation: 'Indicates USB 2.0 support as decoded from the Active Cable VDO2 flag encoding.' },
    { key: 'usb32Supported', label: 'USB 3.2 Supported', value: cable.usb32Supported ? '0b0 (USB 3.2 SuperSpeed supported)' : '0b1 (USB 3.2 SuperSpeed not supported)', explanation: 'Indicates USB 3.2 support as decoded from the Active Cable VDO2 flag encoding.' },
    { key: 'usbLanesSupported', label: 'USB Lanes Supported', value: cable.usbLanesSupported ? '0b1 (Two lanes)' : '0b0 (One lane)', explanation: 'Indicates the lane configuration support bit carried by Active Cable VDO2.' },
    { key: 'opticallyIsolatedActiveCable', label: 'Optically Isolated Active Cable', value: cable.opticallyIsolatedActiveCable ? '0b1 (Yes)' : '0b0 (No)', explanation: 'Indicates whether the active cable is optically isolated.' },
    { key: 'usb4AsymmetricModeSupported', label: 'USB4 Asymmetric Mode Supported', value: cable.usb4AsymmetricModeSupported ? '0b1 (Yes)' : '0b0 (No)', explanation: 'Indicates support for USB4 asymmetric mode.' },
    { key: 'usbGen', label: 'USB Generation', value: cable.usbGen ? '0b1 (Gen 2 or higher)' : '0b0 (Gen 1)', explanation: 'USB generation flag carried by Active Cable VDO2.' },
  ])

export const buildVPDVDOMetadata = (vpd: ParsedVPDVDO): HumanReadableField<'OrderedDictionary'> =>
  buildSimpleNumericMetadata('VPD VDO', 'Metadata describing a VPD VDO from a Discover Identity response.', vpd.raw, [
    { key: 'hwVersion', label: 'Hardware Version', value: vpd.hwVersion.toString(), explanation: 'Hardware version code reported by the VPD VDO.' },
    { key: 'fwVersion', label: 'Firmware Version', value: vpd.fwVersion.toString(), explanation: 'Firmware version code reported by the VPD VDO.' },
    { key: 'vdoVersion', label: 'VDO Version', value: formatCableOrVpdVdoVersion(vpd.vdoVersion), explanation: 'Version field encoded in the VPD VDO.' },
    { key: 'maximumVbusVoltage', label: 'Maximum VBUS Voltage', value: formatVpdMaximumVbusVoltage(vpd.maximumVbusVoltage), explanation: 'Maximum VBUS voltage encoding reported by the VPD VDO.' },
    { key: 'chargeThroughCurrentSupport', label: 'Charge Through Current Support', value: vpd.chargeThroughSupport ? (vpd.chargeThroughCurrentSupport ? '0b1 (5 A capable)' : '0b0 (3 A capable)') : `0b${vpd.chargeThroughCurrentSupport ? '1' : '0'} (Reserved because Charge Through Support = No)`, explanation: 'Indicates support for charge-through current in the VPD.' },
    { key: 'vbusImpedance', label: 'VBUS Impedance', value: vpd.chargeThroughSupport ? `${vpd.vbusImpedance * 2} mOhm (raw ${vpd.vbusImpedance})` : `${vpd.vbusImpedance} (Reserved because Charge Through Support = No)`, explanation: 'VBUS impedance value encoded by the VPD VDO.' },
    { key: 'groundImpedance', label: 'Ground Impedance', value: vpd.chargeThroughSupport ? `${vpd.groundImpedance} mOhm (raw ${vpd.groundImpedance})` : `${vpd.groundImpedance} (Reserved because Charge Through Support = No)`, explanation: 'Ground impedance value encoded by the VPD VDO.' },
    { key: 'chargeThroughSupport', label: 'Charge Through Support', value: vpd.chargeThroughSupport ? '0b1 (The VPD supports Charge Through)' : '0b0 (The VPD does not support Charge Through)', explanation: 'Indicates support for charge-through operation in the VPD.' },
  ])

export const buildSVIDsVDOMetadata = (svidsVdo: ParsedSVIDsVDO): HumanReadableField<'OrderedDictionary'> =>
  buildSimpleNumericMetadata('Discover SVIDs VDO', 'Metadata describing one Discover SVIDs responder VDO.', svidsVdo.raw, [
    { key: 'svid0', label: 'SVID 0', value: formatVdmSvid(svidsVdo.svid0), explanation: 'First Standard or Vendor ID carried by this Discover SVIDs responder VDO.' },
    { key: 'svid1', label: 'SVID 1', value: formatVdmSvid(svidsVdo.svid1), explanation: 'Second Standard or Vendor ID carried by this Discover SVIDs responder VDO.' },
  ])

export const buildModesVDOMetadata = (modesVdo: ParsedModesVDO): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Discover Modes VDO', 'Metadata describing one Discover Modes responder VDO.')
  addRawUint32MetadataField(container, 'Raw 32-bit Discover Modes VDO value before field interpretation.', modesVdo.raw)
  const nonZeroModes = modesVdo.modeNibbles.filter((mode) => mode !== 0)
  addStringMetadataField(
    container,
    'modes',
    'Modes',
    nonZeroModes.length > 0 ? nonZeroModes.join(', ') : 'None',
    'Generic mode-number view of the Discover Modes VDO. For SID-defined modes the detailed bit layout is defined by the corresponding standard; for VID-defined modes it is vendor defined.',
  )
  const modeNibbles = createMetadataContainer('Mode Nibbles', 'Six 4-bit mode-number nibbles exposed for generic display.')
  modesVdo.modeNibbles.forEach((mode, index) => addNumberMetadataField(modeNibbles, `modeNibble${index + 1}`, `Mode Nibble ${index + 1}`, mode, 'One 4-bit nibble extracted from the Discover Modes VDO.'))
  container.setEntry('modeNibbles', modeNibbles)
  return container
}

const buildGenericVdoPayloadMetadata = (
  label: string,
  explanation: string,
  raw: number,
): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer(label, explanation)
  addRawUint32MetadataField(container, 'Raw 32-bit Vendor Data Object value preserved for a command-specific payload whose detailed format is not defined by USB Power Delivery base specification parsing in this frontend.', raw)
  return container
}

export const buildEnterModePayloadVDOMetadata = (payload: ParsedEnterModePayloadVDO): HumanReadableField<'OrderedDictionary'> =>
  buildGenericVdoPayloadMetadata('Enter Mode Payload VDO', 'Metadata describing an optional Enter Mode payload VDO. Its detailed layout is defined by the addressed Alternate Mode.', payload.raw)

export const buildExitModePayloadVDOMetadata = (payload: ParsedExitModePayloadVDO): HumanReadableField<'OrderedDictionary'> =>
  buildGenericVdoPayloadMetadata('Exit Mode Payload VDO', 'Metadata describing an optional Exit Mode payload VDO. Its detailed layout is defined by the addressed Alternate Mode.', payload.raw)

export const buildAttentionVDOMetadata = (payload: ParsedAttentionVDO): HumanReadableField<'OrderedDictionary'> =>
  buildGenericVdoPayloadMetadata('Attention VDO', 'Metadata describing an Attention payload VDO. Its detailed layout is defined by the addressed standard or vendor mode.', payload.raw)

export const buildOpaqueExternalSpecDataBlockMetadata = (
  label: string,
  explanation: string,
  externalSpecification: string,
  minimumLength: number,
  maximumLength: number,
  payload: Uint8Array,
): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer(label, explanation)
  addStringMetadataField(
    container,
    'externalSpecification',
    'External Specification',
    externalSpecification,
    'The USB Power Delivery base specification delegates the internal payload layout for this data block to this external specification.',
  )
  addStringMetadataField(
    container,
    'definedLengthRange',
    'Defined Length Range',
    `${minimumLength}..${maximumLength} bytes`,
    'Valid payload-size range defined by the USB Power Delivery specification for this externally defined data block.',
  )
  addNumberMetadataField(
    container,
    'actualLength',
    'Actual Length',
    payload.length,
    'Number of payload bytes present in this data block instance.',
    'bytes',
  )
  addByteDataMetadataField(
    container,
    'rawBytes',
    'Raw Bytes',
    payload,
    'Raw data block bytes preserved because the detailed field layout is defined by an external USB-IF specification that is not implemented in this frontend parser.',
  )
  return container
}

const buildProductTypeVDOMetadata = (
  vdo: ParsedDiscoverIdentity['productTypeVDOs'][number],
): HumanReadableField<'OrderedDictionary'> => {
  if ('usbHighestSpeed' in vdo && 'vbusThroughCable' in vdo) {
    return buildActiveCableVDO1Metadata(vdo)
  }
  if ('maximumOperatingTemperature' in vdo) {
    return buildActiveCableVDO2Metadata(vdo)
  }
  if ('chargeThroughSupport' in vdo) {
    return buildVPDVDOMetadata(vdo)
  }
  if ('deviceCapability' in vdo) {
    return buildUFPVDOMetadata(vdo)
  }
  if ('hostCapability' in vdo) {
    return buildDFPVDOMetadata(vdo)
  }
  return buildPassiveCableVDOMetadata(vdo)
}

export const buildDiscoverIdentityMetadata = (
  discoverIdentity: ParsedDiscoverIdentity,
): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Discover Identity VDOs', 'Metadata describing the Structured VDM Discover Identity response payload.')
  if (discoverIdentity.idHeader) {
    container.setEntry('idHeaderVdo', buildIDHeaderVDOMetadata(discoverIdentity.idHeader))
  }
  if (discoverIdentity.certStat) {
    container.setEntry('certStatVdo', buildCertStatVDOMetadata(discoverIdentity.certStat))
  }
  if (discoverIdentity.product) {
    container.setEntry('productVdo', buildProductVDOMetadata(discoverIdentity.product))
  }
  if (discoverIdentity.productTypeVDOs.length > 0) {
    addSequenceMetadata(
      container,
      'productTypeVdos',
      'Product Type VDOs',
      'Ordered collection of product-type Vendor Data Objects following the mandatory Discover Identity VDOs.',
      discoverIdentity.productTypeVDOs.map((vdo, index) => ({
        key: `vdo${index + 1}`,
        field: buildProductTypeVDOMetadata(vdo),
      })),
    )
  }
  if (discoverIdentity.padVDOs.length > 0) {
    const pad = createMetadataContainer('Pad VDOs', 'All-zero pad Vendor Data Objects preserved from the Discover Identity response.')
    discoverIdentity.padVDOs.forEach((raw, index) => addStringMetadataField(pad, `padVdo${index + 1}`, `Pad VDO ${index + 1}`, `0x${raw.toString(16).toUpperCase().padStart(8, '0')}`, 'All-zero pad Vendor Data Object preserved from the Discover Identity response.'))
    container.setEntry('padVdos', pad)
  }
  if (discoverIdentity.rawVDOs.length > 0) {
    const raw = createMetadataContainer('Raw VDOs', 'Vendor Data Objects preserved without a richer structured interpretation in the current parser.')
    discoverIdentity.rawVDOs.forEach((value, index) => addStringMetadataField(raw, `rawVdo${index + 1}`, `Raw VDO ${index + 1}`, `0x${value.toString(16).toUpperCase().padStart(8, '0')}`, 'Raw Vendor Data Object preserved for commands or product types that are not yet structurally decoded.'))
    container.setEntry('rawVdos', raw)
  }
  return container
}

export const buildSourceCapabilitiesExtendedDataBlockMetadata = (block: ParsedSourceCapabilitiesExtendedDataBlock): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Source Capabilities Extended Data Block', 'Metadata describing the Extended Message data block carried by a Source_Capabilities_Extended message.')
  addStringMetadataField(container, 'vid', 'Vendor ID', formatVdmSvid(block.vid), 'Vendor identifier reported in the Source Capabilities Extended Data Block.')
  addStringMetadataField(container, 'pid', 'Product ID', `0x${block.pid.toString(16).toUpperCase().padStart(4, '0')}`, 'Product identifier reported in the Source Capabilities Extended Data Block.')
  addStringMetadataField(container, 'xid', 'XID', `0x${block.xid.toString(16).toUpperCase().padStart(8, '0')}`, 'XID value reported in the Source Capabilities Extended Data Block.')
  addNumberMetadataField(container, 'fwVersion', 'Firmware Version', block.fwVersion, 'Firmware version byte reported in the Source Capabilities Extended Data Block.')
  addNumberMetadataField(container, 'hwVersion', 'Hardware Version', block.hwVersion, 'Hardware version byte reported in the Source Capabilities Extended Data Block.')
  addStringMetadataField(container, 'voltageRegulation', 'Voltage Regulation', formatVoltageRegulation(block.voltageRegulation), 'Voltage regulation bitfield from the Source Capabilities Extended Data Block.')
  addNumberMetadataField(container, 'holdupTimeMs', 'Holdup Time', block.holdupTimeMs, 'Holdup time reported by the source.', 'ms')
  addStringMetadataField(container, 'compliance', 'Compliance', formatComplianceBits(block.compliance), 'Compliance bitfield from the Source Capabilities Extended Data Block.')
  addStringMetadataField(container, 'touchCurrent', 'Touch Current', formatTouchCurrent(block.touchCurrent), 'Touch-current encoding from the Source Capabilities Extended Data Block.')
  addStringMetadataField(container, 'peakCurrent1', 'Peak Current 1', formatPeakCurrentField(block.peakCurrent1), 'First peak-current field from the Source Capabilities Extended Data Block.')
  addStringMetadataField(container, 'peakCurrent2', 'Peak Current 2', formatPeakCurrentField(block.peakCurrent2), 'Second peak-current field from the Source Capabilities Extended Data Block.')
  addStringMetadataField(container, 'peakCurrent3', 'Peak Current 3', formatPeakCurrentField(block.peakCurrent3), 'Third peak-current field from the Source Capabilities Extended Data Block.')
  addStringMetadataField(container, 'touchTemp', 'Touch Temperature', formatTouchTempSource(block.touchTemp), 'Touch-temperature encoding from the Source Capabilities Extended Data Block.')
  addStringMetadataField(container, 'sourceInputs', 'Source Inputs', formatSourceInputs(block.sourceInputs), 'Source-input capability bitfield from the Source Capabilities Extended Data Block.')
  addNumberMetadataField(container, 'hotSwappableBatterySlots', 'Hot Swappable Battery Slots', block.hotSwappableBatterySlots, 'Number of hot-swappable battery slots reported by the source.')
  addNumberMetadataField(container, 'fixedBatteries', 'Fixed Batteries', block.fixedBatteries, 'Number of fixed batteries reported by the source.')
  addNumberMetadataField(container, 'sprSourcePdpRating', 'SPR Source PDP Rating', block.sprSourcePdpRating, 'SPR Power Data Profile rating reported by the source.', 'W')
  if (block.eprSourcePdpRating === null) {
    addStringMetadataField(container, 'eprSourcePdpRating', 'EPR Source PDP Rating', 'Unavailable (legacy 24-byte SCEDB)', 'USB PD 3.2 requires this byte at offset 24; this data block omits it.')
  } else {
    addNumberMetadataField(container, 'eprSourcePdpRating', 'EPR Source PDP Rating', block.eprSourcePdpRating, 'EPR Power Data Profile rating reported by the source.', 'W')
  }
  return container
}

export const buildSOPStatusDataBlockMetadata = (block: ParsedSOPStatusDataBlock): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('SOP Status Data Block', 'Metadata describing the SOP Status data block carried by a Status message.')
  addStringMetadataField(container, 'internalTemp', 'Internal Temperature', formatInternalTemperature(block.internalTemp), 'Internal temperature value reported in the SOP Status Data Block.')
  addStringMetadataField(container, 'presentInput', 'Present Input', formatPresentInput(block.presentInput), 'Present-input bitfield from the SOP Status Data Block.')
  addStringMetadataField(container, 'presentBatteryInput', 'Present Battery Input', formatPresentBatteryInput(block.presentBatteryInput), 'Present-battery-input bitfield from the SOP Status Data Block.')
  addStringMetadataField(container, 'eventFlags', 'Event Flags', formatStatusEventFlags(block.eventFlags), 'Event flag bitfield from the SOP Status Data Block.')
  addStringMetadataField(container, 'temperatureStatus', 'Temperature Status', formatTemperatureStatus(block.temperatureStatus), 'Temperature-status bitfield from the SOP Status Data Block.')
  addStringMetadataField(container, 'powerStatus', 'Power Status', formatPowerStatus(block.powerStatus), 'Power-status bitfield from the SOP Status Data Block.')
  if (block.powerStateChange === null) {
    addStringMetadataField(container, 'powerStateChange', 'Power State Change', 'Not present in 6-byte SDB', 'Power State Change byte is not present in this 6-byte Status Data Block.')
  } else {
    addStringMetadataField(container, 'powerStateChange', 'Power State Change', formatPowerStateChange(block.powerStateChange), 'Power-state-change bitfield from the SOP Status Data Block.')
  }
  return container
}

export const buildSOPPrimeStatusDataBlockMetadata = (block: ParsedSOPPrimeStatusDataBlock): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('SOP\' Status Data Block', 'Metadata describing the cable-directed Status data block carried by a Status message.')
  addStringMetadataField(container, 'internalTemp', 'Internal Temperature', formatInternalTemperature(block.internalTemp), 'Internal temperature value reported in the SOP\' Status Data Block.')
  addStringMetadataField(container, 'flags', 'Flags', `0x${block.flags.toString(16).toUpperCase()}`, 'Status flag bitfield from the SOP\' Status Data Block.')
  return container
}

export const buildBatteryCapabilitiesDataBlockMetadata = (block: ParsedBatteryCapabilitiesDataBlock): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Battery Capabilities Data Block', 'Metadata describing the Battery Capabilities data block carried by a Battery_Capabilities message.')
  addStringMetadataField(container, 'vid', 'Vendor ID', formatVdmSvid(block.vid), 'Vendor identifier reported in the Battery Capabilities data block.')
  addStringMetadataField(container, 'pid', 'Product ID', `0x${block.pid.toString(16).toUpperCase().padStart(4, '0')}`, 'Product identifier reported in the Battery Capabilities data block.')
  addNumberMetadataField(container, 'batteryDesignCapacity', 'Battery Design Capacity', block.batteryDesignCapacity, 'Battery design capacity reported in the Battery Capabilities data block.')
  addNumberMetadataField(container, 'batteryLastFullChargeCapacity', 'Battery Last Full Charge Capacity', block.batteryLastFullChargeCapacity, 'Battery last full charge capacity reported in the Battery Capabilities data block.')
  addStringMetadataField(container, 'batteryType', 'Battery Type', formatBatteryType(block.batteryType), 'Battery type field reported in the Battery Capabilities data block.')
  return container
}

export const buildManufacturerInfoDataBlockMetadata = (block: ParsedManufacturerInfoDataBlock): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Manufacturer Info Data Block', 'Metadata describing the Manufacturer Info data block carried by a Manufacturer_Info message.')
  addStringMetadataField(container, 'vid', 'Vendor ID', formatVdmSvid(block.vid), 'Vendor identifier reported in the Manufacturer Info data block.')
  addStringMetadataField(container, 'pid', 'Product ID', `0x${block.pid.toString(16).toUpperCase().padStart(4, '0')}`, 'Product identifier reported in the Manufacturer Info data block.')
  addStringMetadataField(container, 'manufacturerString', 'Manufacturer String', block.manufacturerString, 'Null-terminated manufacturer string decoded from the Manufacturer Info data block.')
  addByteDataMetadataField(container, 'manufacturerStringBytes', 'Manufacturer String Bytes', block.manufacturerStringBytes, 'Raw manufacturer string bytes preserved from the Manufacturer Info data block.')
  return container
}

export const buildPPSStatusDataBlockMetadata = (block: ParsedPPSStatusDataBlock): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('PPS Status Data Block', 'Metadata describing the PPS Status data block carried by a PPS_Status message.')
  addNumberMetadataField(container, 'outputVoltage20mV', 'Output Voltage', block.outputVoltage20mV * 20, 'Measured PPS output voltage reported by the source, expressed in millivolts.', 'mV')
  addNumberMetadataField(container, 'outputCurrent50mA', 'Output Current', block.outputCurrent50mA * 50, 'Measured PPS output current reported by the source, expressed in milliamps.', 'mA')
  addStringMetadataField(container, 'realTimeFlags', 'Real Time Flags', formatPpsRealTimeFlags(block.realTimeFlags), 'Real-time status flag bitfield from the PPS Status data block.')
  return container
}

export const buildCountryCodesDataBlockMetadata = (block: ParsedCountryCodesDataBlock): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Country Codes Data Block', 'Metadata describing the Country Codes data block carried by a Country_Codes message.')
  addNumberMetadataField(container, 'length', 'Length', block.length, 'Number of country-code entries reported in the Country Codes data block.')
  const codes = createMetadataContainer('Country Codes', 'Ordered list of country codes reported in the Country Codes data block.')
  block.countryCodes.forEach((code, index) => addStringMetadataField(codes, `countryCode${index + 1}`, `Country Code ${index + 1}`, code, 'Printable two-character country code reported in the Country Codes data block.'))
  container.setEntry('countryCodes', codes)
  return container
}

export const buildCountryInfoDataBlockMetadata = (block: ParsedCountryInfoDataBlock): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Country Info Data Block', 'Metadata describing the Country Info data block carried by a Country_Info message.')
  addStringMetadataField(container, 'countryCode', 'Country Code', block.countryCode ?? 'Unavailable', 'Country code associated with the Country Info data block when the first two bytes are printable ASCII.')
  addStringMetadataField(container, 'countrySpecificDataAscii', 'Country Specific Data ASCII Preview', block.countrySpecificDataAscii, 'ASCII preview of the country-specific data bytes, with non-printable bytes replaced for readability.')
  addByteDataMetadataField(container, 'countrySpecificData', 'Country Specific Data', block.countrySpecificData, 'Raw country-specific data bytes preserved from the Country Info data block.')
  return container
}

export const buildSinkCapabilitiesExtendedDataBlockMetadata = (block: ParsedSinkCapabilitiesExtendedDataBlock): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Sink Capabilities Extended Data Block', 'Metadata describing the Sink Capabilities Extended data block carried by a Sink_Capabilities_Extended message.')
  addStringMetadataField(container, 'vid', 'Vendor ID', formatVdmSvid(block.vid), 'Vendor identifier reported in the Sink Capabilities Extended data block.')
  addStringMetadataField(container, 'pid', 'Product ID', `0x${block.pid.toString(16).toUpperCase().padStart(4, '0')}`, 'Product identifier reported in the Sink Capabilities Extended data block.')
  addStringMetadataField(container, 'xid', 'XID', `0x${block.xid.toString(16).toUpperCase().padStart(8, '0')}`, 'XID value reported in the Sink Capabilities Extended data block.')
  addNumberMetadataField(container, 'fwVersion', 'Firmware Version', block.fwVersion, 'Firmware version byte reported in the Sink Capabilities Extended data block.')
  addNumberMetadataField(container, 'hwVersion', 'Hardware Version', block.hwVersion, 'Hardware version byte reported in the Sink Capabilities Extended data block.')
  addStringMetadataField(container, 'skedbVersion', 'SKEDB Version', formatSkedbVersion(block.skedbVersion), 'Version value reported in the Sink Capabilities Extended data block.')
  addStringMetadataField(container, 'loadStep', 'Load Step', formatSinkLoadStep(block.loadStep), 'Load-step encoding from the Sink Capabilities Extended data block.')
  addStringMetadataField(container, 'sinkLoadCharacteristics', 'Sink Load Characteristics', formatSinkLoadCharacteristics(block.sinkLoadCharacteristics), 'Sink-load-characteristics bitfield from the Sink Capabilities Extended data block.')
  addStringMetadataField(container, 'compliance', 'Compliance', formatComplianceBits(block.compliance), 'Compliance bitfield from the Sink Capabilities Extended data block.')
  addStringMetadataField(container, 'touchTemp', 'Touch Temperature', formatTouchTempSink(block.touchTemp), 'Touch-temperature encoding from the Sink Capabilities Extended data block.')
  addNumberMetadataField(container, 'hotSwappableBatterySlots', 'Hot Swappable Battery Slots', block.hotSwappableBatterySlots, 'Number of hot-swappable battery slots reported by the sink.')
  addNumberMetadataField(container, 'fixedBatteries', 'Fixed Batteries', block.fixedBatteries, 'Number of fixed batteries reported by the sink.')
  addStringMetadataField(container, 'sinkModes', 'Sink Modes', formatSinkModes(block.sinkModes), 'Sink-mode bitfield from the Sink Capabilities Extended data block.')
  addNumberMetadataField(container, 'sprSinkMinimumPdp', 'SPR Sink Minimum PDP', block.sprSinkMinimumPdp, 'Minimum SPR Power Data Profile level reported by the sink.', 'W')
  addNumberMetadataField(container, 'sprSinkOperationalPdp', 'SPR Sink Operational PDP', block.sprSinkOperationalPdp, 'Operational SPR Power Data Profile level reported by the sink.', 'W')
  addNumberMetadataField(container, 'sprSinkMaximumPdp', 'SPR Sink Maximum PDP', block.sprSinkMaximumPdp, 'Maximum SPR Power Data Profile level reported by the sink.', 'W')
  if (block.eprSinkMinimumPdp === null) {
    addStringMetadataField(container, 'eprSinkMinimumPdp', 'EPR Sink Minimum PDP', 'Unavailable (legacy 21-byte SKEDB)', 'USB PD 3.2 requires this byte at offset 21; this data block omits it.')
  } else {
    addNumberMetadataField(container, 'eprSinkMinimumPdp', 'EPR Sink Minimum PDP', block.eprSinkMinimumPdp, 'Minimum EPR Power Data Profile level reported by the sink.', 'W')
  }
  if (block.eprSinkOperationalPdp === null) {
    addStringMetadataField(container, 'eprSinkOperationalPdp', 'EPR Sink Operational PDP', 'Unavailable (legacy 21-byte SKEDB)', 'USB PD 3.2 requires this byte at offset 22; this data block omits it.')
  } else {
    addNumberMetadataField(container, 'eprSinkOperationalPdp', 'EPR Sink Operational PDP', block.eprSinkOperationalPdp, 'Operational EPR Power Data Profile level reported by the sink.', 'W')
  }
  if (block.eprSinkMaximumPdp === null) {
    addStringMetadataField(container, 'eprSinkMaximumPdp', 'EPR Sink Maximum PDP', 'Unavailable (legacy 21-byte SKEDB)', 'USB PD 3.2 requires this byte at offset 23; this data block omits it.')
  } else {
    addNumberMetadataField(container, 'eprSinkMaximumPdp', 'EPR Sink Maximum PDP', block.eprSinkMaximumPdp, 'Maximum EPR Power Data Profile level reported by the sink.', 'W')
  }
  return container
}

export const buildExtendedControlDataBlockMetadata = (block: ParsedExtendedControlDataBlock): HumanReadableField<'OrderedDictionary'> => {
  const container = createMetadataContainer('Extended Control Data Block', 'Metadata describing the Extended Control data block carried by an Extended_Control message.')
  const typeMetadata = getExtendedControlTypeMetadata(block.type)
  addNumberMetadataField(container, 'type', 'Type', block.type, 'Type byte carried by the Extended Control data block.')
  addStringMetadataField(container, 'messageType', 'Message Type', typeMetadata.messageType, 'Human-readable Extended_Control message type decoded from the ECDB type byte.')
  addStringMetadataField(container, 'messageMeaning', 'Message Meaning', typeMetadata.messageMeaning, 'Human-readable explanation of what this Extended_Control message does in the USB-PD protocol.')
  addStringMetadataField(container, 'sentBy', 'Sent By', typeMetadata.sentBy, 'Which USB-PD partners are allowed by the specification to send this Extended_Control message type.')
  addStringMetadataField(container, 'validStartOfPacket', 'Valid Start of Packet', typeMetadata.validStartOfPacket, 'Which Start-of-Packet packet type is valid for this Extended_Control message type.')
  addNumberMetadataField(container, 'dataByte', 'Data Byte', block.dataByte, 'Data byte carried by the Extended Control data block.')
  addStringMetadataField(
    container,
    'dataMeaning',
    'Data Meaning',
    block.dataByte === 0
      ? typeMetadata.dataMeaning
      : `${typeMetadata.dataMeaning} Observed value: 0x${block.dataByte.toString(16).toUpperCase().padStart(2, '0')}.`,
    'Human-readable interpretation of the ECDB data byte for this Extended_Control message type.',
  )
  return container
}
