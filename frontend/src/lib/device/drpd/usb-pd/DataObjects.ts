import type { SOPKind } from './types'
import { readUint16LE } from './header'

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
    vbusRequired: getBits(raw, 6, 6) === 1,
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
  eprSourcePdpRating: number
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
  powerStateChange: number
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
  eprSinkMinimumPdp: number
  ///< EPR sink operational PDP.
  eprSinkOperationalPdp: number
  ///< EPR sink maximum PDP.
  eprSinkMaximumPdp: number
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
    eprSourcePdpRating: data[24] ?? 0,
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
    powerStateChange: data[6] ?? 0,
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
    eprSinkMinimumPdp: data[21] ?? 0,
    eprSinkOperationalPdp: data[22] ?? 0,
    eprSinkMaximumPdp: data[23] ?? 0,
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
