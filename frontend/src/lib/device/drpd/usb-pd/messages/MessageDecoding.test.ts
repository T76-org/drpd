import { describe, expect, it } from 'vitest'
import { parseUSBPDMessage } from '../parser'
import {
  buildDFPVDOMetadata,
  buildIDHeaderVDOMetadata,
  buildPDOMetadata,
  buildPassiveCableVDOMetadata,
  buildUFPVDOMetadata,
  parseDFPVDO,
  parseIDHeaderVDO,
  parsePassiveCableVDO,
  parseUFPVDO,
} from '../DataObjects'
import type { FixedSupplyPDO, ParsedPDO } from '../DataObjects'
import {
  buildMessage,
  makeExtendedHeader,
  makeMessageHeader,
  setBits,
  toBytes32,
} from './messageTestUtils'
import {
  AlertMessage,
  BatteryCapabilitiesMessage,
  BatteryStatusMessage,
  BISTMessage,
  CountryCodesMessage,
  CountryInfoMessage,
  EPRModeMessage,
  EPRRequestMessage,
  EPRSinkCapabilitiesMessage,
  EPRSourceCapabilitiesMessage,
  EnterUSBMessage,
  ExtendedControlMessage,
  FirmwareUpdateRequestMessage,
  FirmwareUpdateResponseMessage,
  GetBatteryCapMessage,
  GetBatteryStatusMessage,
  GetCountryInfoMessage,
  GetManufacturerInfoMessage,
  ManufacturerInfoMessage,
  PPSStatusMessage,
  RequestMessage,
  RevisionMessage,
  SecurityRequestMessage,
  SecurityResponseMessage,
  SinkCapabilitiesExtendedMessage,
  SinkCapabilitiesMessage,
  SourceCapabilitiesExtendedMessage,
  SourceCapabilitiesMessage,
  SourceInfoMessage,
  StatusMessage,
  VendorDefinedExtendedMessage,
  VendorDefinedMessage,
} from '../message'

const SOP = [0x18, 0x18, 0x18, 0x11]
const SOP_PRIME = [0x18, 0x18, 0x06, 0x06]

/**
 * Assert a parsed PDO is a fixed supply PDO.
 *
 * @param pdo - Parsed PDO.
 * @returns Fixed supply PDO.
 */
const expectFixedPDO = (pdo: ParsedPDO | null | undefined): FixedSupplyPDO => {
  if (!pdo || pdo.pdoType !== 'FIXED') {
    throw new Error('Expected FIXED PDO')
  }
  return pdo
}

describe('USB-PD data message decoding', () => {
  it('decodes Source_Capabilities', () => {
    let pdo = 0
    pdo = setBits(pdo, 29, 29, 1)
    pdo = setBits(pdo, 28, 28, 1)
    pdo = setBits(pdo, 27, 27, 1)
    pdo = setBits(pdo, 26, 26, 1)
    pdo = setBits(pdo, 25, 25, 1)
    pdo = setBits(pdo, 24, 24, 1)
    pdo = setBits(pdo, 23, 23, 1)
    pdo = setBits(pdo, 21, 20, 2)
    pdo = setBits(pdo, 19, 10, 100)
    pdo = setBits(pdo, 9, 0, 200)
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x01,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, toBytes32(pdo)))
    expect(message).toBeInstanceOf(SourceCapabilitiesMessage)
    const decoded = message as SourceCapabilitiesMessage
    const fixedPdo = expectFixedPDO(decoded.decodedPDOs[0] ?? null)
    expect(fixedPdo.pdoType).toBe('FIXED')
    expect(fixedPdo.voltage50mV).toBe(100)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('Supports EPR mode.')
    expect(summary?.value).toContain('Fixed power profiles:')
    expect(summary?.value).toContain('- 5V @ 2A')
  })

  it('summarizes Source_Capabilities profiles by decoded PDO type', () => {
    let fixedPdo = 0
    fixedPdo = setBits(fixedPdo, 29, 29, 1)
    fixedPdo = setBits(fixedPdo, 26, 26, 1)
    fixedPdo = setBits(fixedPdo, 24, 24, 1)
    fixedPdo = setBits(fixedPdo, 23, 23, 1)
    fixedPdo = setBits(fixedPdo, 19, 10, 100)
    fixedPdo = setBits(fixedPdo, 9, 0, 300)

    let variablePdo = 0
    variablePdo = setBits(variablePdo, 31, 30, 0b10)
    variablePdo = setBits(variablePdo, 29, 20, 400)
    variablePdo = setBits(variablePdo, 19, 10, 66)
    variablePdo = setBits(variablePdo, 9, 0, 500)

    let ppsPdo = 0
    ppsPdo = setBits(ppsPdo, 31, 30, 0b11)
    ppsPdo = setBits(ppsPdo, 29, 28, 0b00)
    ppsPdo = setBits(ppsPdo, 27, 27, 1)
    ppsPdo = setBits(ppsPdo, 24, 17, 200)
    ppsPdo = setBits(ppsPdo, 15, 8, 33)
    ppsPdo = setBits(ppsPdo, 6, 0, 100)

    let eprAvsPdo = 0
    eprAvsPdo = setBits(eprAvsPdo, 31, 30, 0b11)
    eprAvsPdo = setBits(eprAvsPdo, 29, 28, 0b01)
    eprAvsPdo = setBits(eprAvsPdo, 25, 17, 480)
    eprAvsPdo = setBits(eprAvsPdo, 15, 8, 50)
    eprAvsPdo = setBits(eprAvsPdo, 7, 0, 240)

    const message = parseUSBPDMessage(buildMessage(
      SOP,
      makeMessageHeader({
        extended: false,
        numberOfDataObjects: 4,
        messageTypeNumber: 0x01,
      }),
      [
        ...toBytes32(fixedPdo),
        ...toBytes32(variablePdo),
        ...toBytes32(ppsPdo),
        ...toBytes32(eprAvsPdo),
      ],
    )) as SourceCapabilitiesMessage

    const summary = message.describe()
    expect(summary).toContain('The source is reporting the following capabilities:')
    expect(summary).toContain('Supports unchunked extended messages.')
    expect(summary).toContain('Supports dual-role power.')
    expect(summary).toContain('Supports USB communications.')
    expect(summary).toContain('Fixed power profiles:\n- 5V @ 3A')
    expect(summary).toContain('Variable power profiles:\n- 3.3V-20V @ 5A')
    expect(summary).toContain('Programmable power profiles:\n- 3.3V-20V @ 5A PPS (power limited)')
    expect(summary).toContain('Adjustable voltage profiles:\n- 5V-48V, 240W EPR AVS')
  })

  it('renders coded PDO and VDO metadata with raw values and decoded meanings', () => {
    let sinkFixedPdo = 0
    sinkFixedPdo = setBits(sinkFixedPdo, 31, 30, 0b00)
    sinkFixedPdo = setBits(sinkFixedPdo, 29, 29, 1)
    sinkFixedPdo = setBits(sinkFixedPdo, 24, 23, 0b11)
    sinkFixedPdo = setBits(sinkFixedPdo, 19, 10, 100)
    sinkFixedPdo = setBits(sinkFixedPdo, 9, 0, 200)
    const sinkMessage = parseUSBPDMessage(buildMessage(
      SOP,
      makeMessageHeader({ extended: false, numberOfDataObjects: 1, messageTypeNumber: 0x04 }),
      toBytes32(sinkFixedPdo),
    )) as SinkCapabilitiesMessage
    const sinkMetadata = buildPDOMetadata(expectFixedPDO(sinkMessage.decodedPDOs[0]))
    expect(sinkMetadata.getEntry('fastRoleSwapRequiredCurrent')?.value).toBe('0b11 (3.0 A @ 5 V)')

    let sourceFixedPdo = 0
    sourceFixedPdo = setBits(sourceFixedPdo, 31, 30, 0b00)
    sourceFixedPdo = setBits(sourceFixedPdo, 21, 20, 0b10)
    sourceFixedPdo = setBits(sourceFixedPdo, 19, 10, 100)
    sourceFixedPdo = setBits(sourceFixedPdo, 9, 0, 300)
    const sourceMessage = parseUSBPDMessage(buildMessage(
      SOP,
      makeMessageHeader({ extended: false, numberOfDataObjects: 1, messageTypeNumber: 0x01 }),
      toBytes32(sourceFixedPdo),
    )) as SourceCapabilitiesMessage
    const sourceMetadata = buildPDOMetadata(expectFixedPDO(sourceMessage.decodedPDOs[0]))
    expect(sourceMetadata.getEntry('peakCurrent')?.value).toContain('0b10')
    expect(sourceMetadata.getEntry('peakCurrent')?.value).toContain('200% IoC')

    let passiveCableRaw = 0
    passiveCableRaw = setBits(passiveCableRaw, 23, 21, 0b000)
    passiveCableRaw = setBits(passiveCableRaw, 19, 18, 0b10)
    passiveCableRaw = setBits(passiveCableRaw, 16, 13, 0b0010)
    passiveCableRaw = setBits(passiveCableRaw, 12, 11, 0b01)
    passiveCableRaw = setBits(passiveCableRaw, 10, 9, 0b11)
    passiveCableRaw = setBits(passiveCableRaw, 6, 5, 0b10)
    passiveCableRaw = setBits(passiveCableRaw, 2, 0, 0b100)
    const passiveCableMetadata = buildPassiveCableVDOMetadata(parsePassiveCableVDO(passiveCableRaw))
    expect(passiveCableMetadata.getEntry('maximumVbusVoltage')?.value).toBe('0b11 (50 V)')
    expect(passiveCableMetadata.getEntry('cableLatency')?.value).toBe('0b0010 (10 ns to 20 ns (~2 m))')
    expect(passiveCableMetadata.getEntry('usbHighestSpeed')?.value).toBe('0b100 (USB4 Gen4)')

    let ufpRaw = 0
    ufpRaw = setBits(ufpRaw, 31, 29, 0b011)
    ufpRaw = setBits(ufpRaw, 27, 24, 0b1101)
    ufpRaw = setBits(ufpRaw, 10, 8, 0b101)
    ufpRaw = setBits(ufpRaw, 7, 7, 1)
    ufpRaw = setBits(ufpRaw, 6, 6, 0)
    ufpRaw = setBits(ufpRaw, 5, 3, 0b011)
    ufpRaw = setBits(ufpRaw, 2, 0, 0b011)
    const ufpMetadata = buildUFPVDOMetadata(parseUFPVDO(ufpRaw))
    expect(ufpMetadata.getEntry('vdoVersion')?.value).toBe('0b011 (Version 1.3)')
    expect(ufpMetadata.getEntry('vconnPower')?.value).toBe('0b101 (5 W)')
    expect(ufpMetadata.getEntry('vbusRequired')?.value).toBe('0b0 (Yes)')
    expect(ufpMetadata.getEntry('alternateModes')?.value).toContain('0b011')
    expect(ufpMetadata.getEntry('alternateModes')?.value).toContain('Supports TBT3 Alternate Mode')

    let dfpRaw = 0
    dfpRaw = setBits(dfpRaw, 31, 29, 0b010)
    dfpRaw = setBits(dfpRaw, 26, 24, 0b111)
    const dfpMetadata = buildDFPVDOMetadata(parseDFPVDO(dfpRaw))
    expect(dfpMetadata.getEntry('vdoVersion')?.value).toBe('0b010 (Version 1.2)')
    expect(dfpMetadata.getEntry('hostCapability')?.value).toContain('0b111')
    expect(dfpMetadata.getEntry('hostCapability')?.value).toContain('USB4 Host Capable')

    let idHeaderRaw = 0
    idHeaderRaw = setBits(idHeaderRaw, 29, 27, 0b100)
    idHeaderRaw = setBits(idHeaderRaw, 25, 23, 0b010)
    idHeaderRaw = setBits(idHeaderRaw, 22, 21, 0b11)
    const idHeaderMetadata = buildIDHeaderVDOMetadata(parseIDHeaderVDO(idHeaderRaw))
    expect(idHeaderMetadata.getEntry('sopProductTypeUfpOrCable')?.value).toContain("SOP': Active Cable")
    expect(idHeaderMetadata.getEntry('sopProductTypeDfp')?.value).toBe('0b010 (PDUSB Host)')
    expect(idHeaderMetadata.getEntry('connectorType')?.value).toBe('0b11 (USB Type-C Plug)')
  })

  it('renders remaining code-valued metadata fields with raw values and decoded meanings', () => {
    let eudo = 0
    eudo = setBits(eudo, 30, 28, 0b010)
    eudo = setBits(eudo, 26, 26, 1)
    eudo = setBits(eudo, 25, 25, 1)
    eudo = setBits(eudo, 23, 21, 0b011)
    eudo = setBits(eudo, 20, 19, 0b10)
    eudo = setBits(eudo, 18, 17, 0b11)
    eudo = setBits(eudo, 16, 16, 1)
    eudo = setBits(eudo, 15, 15, 1)
    eudo = setBits(eudo, 14, 14, 1)
    eudo = setBits(eudo, 13, 13, 1)
    const enterUsbMessage = parseUSBPDMessage(buildMessage(
      SOP,
      makeMessageHeader({ extended: false, numberOfDataObjects: 1, messageTypeNumber: 0x08 }),
      toBytes32(eudo),
    )) as EnterUSBMessage
    const enterUsbMetadata = enterUsbMessage.humanReadableMetadata.messageSpecificData.getEntry('enterUsbDataObject')
    expect(enterUsbMetadata?.getEntry('usbMode')?.value).toBe('0b010 (USB4)')
    expect(enterUsbMetadata?.getEntry('cableType')?.value).toBe('0b10 (Active Re-driver)')
    expect(enterUsbMetadata?.getEntry('hostPresent')?.value).toBe('0b1 (A Host is present at the top of the USB tree)')

    let eprModeRaw = 0
    eprModeRaw = setBits(eprModeRaw, 31, 24, 0x04)
    eprModeRaw = setBits(eprModeRaw, 23, 16, 0x01)
    const eprModeMessage = parseUSBPDMessage(buildMessage(
      SOP,
      makeMessageHeader({ extended: false, numberOfDataObjects: 1, messageTypeNumber: 0x0a }),
      toBytes32(eprModeRaw),
    )) as EPRModeMessage
    const eprModeMetadata = eprModeMessage.humanReadableMetadata.messageSpecificData.getEntry('eprModeDataObject')
    expect(eprModeMetadata?.getEntry('action')?.value).toBe('0x04 (Enter Failed)')
    expect(eprModeMetadata?.getEntry('data')?.value).toBe('0x01 (Cable not EPR Capable)')

    let vdm = 0
    vdm = setBits(vdm, 31, 16, 0xff00)
    vdm = setBits(vdm, 15, 15, 1)
    vdm = setBits(vdm, 14, 13, 1)
    vdm = setBits(vdm, 12, 11, 1)
    vdm = setBits(vdm, 7, 6, 2)
    vdm = setBits(vdm, 4, 0, 2)
    const vendorMessage = parseUSBPDMessage(buildMessage(
      SOP,
      makeMessageHeader({ extended: false, numberOfDataObjects: 1, messageTypeNumber: 0x0f }),
      toBytes32(vdm),
    )) as VendorDefinedMessage
    const vdmHeader = vendorMessage.humanReadableMetadata.messageSpecificData.getEntry('vdmHeader')
    expect(vdmHeader?.getEntry('vdmType')?.value).toBe('0b1 (Structured VDM)')
    expect(vdmHeader?.getEntry('structuredVersionMajor')?.value).toBe('0b01 (Version 2.x)')
    expect(vdmHeader?.getEntry('commandType')?.value).toBe('0b10 (NAK)')
    const vendorSummary = vendorMessage.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(vendorSummary?.type).toBe('String')
    expect(vendorSummary?.Label).toBe('Message Summary')
    expect(vendorSummary?.value).toContain('DISCOVER_SVIDS NAK')
    expect(vendorSummary?.value).toContain('Standard or Vendor ID: 0xFF00')
  })

  it('decodes Sink_Capabilities', () => {
    let pdo = 0
    pdo = setBits(pdo, 29, 29, 1)
    pdo = setBits(pdo, 28, 28, 1)
    pdo = setBits(pdo, 27, 27, 1)
    pdo = setBits(pdo, 26, 26, 1)
    pdo = setBits(pdo, 25, 25, 1)
    pdo = setBits(pdo, 24, 23, 2)
    pdo = setBits(pdo, 19, 10, 120)
    pdo = setBits(pdo, 9, 0, 150)
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x04,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, toBytes32(pdo)))
    expect(message).toBeInstanceOf(SinkCapabilitiesMessage)
    const decoded = message as SinkCapabilitiesMessage
    const fixedPdo = expectFixedPDO(decoded.decodedPDOs[0] ?? null)
    expect(fixedPdo.pdoType).toBe('FIXED')
    expect(fixedPdo.current10mA).toBe(150)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('The sink is reporting the following capabilities:')
    expect(summary?.value).toContain('Supports dual-role power.')
    expect(summary?.value).toContain('Reports higher capability.')
    expect(summary?.value).toContain('Fast Role Swap requires 1.5A at 5V.')
    expect(summary?.value).toContain('Fixed power profiles:')
    expect(summary?.value).toContain('- 6V @ 1.5A')
  })

  it('decodes Request', () => {
    let rdo = 0
    rdo = setBits(rdo, 31, 28, 3)
    rdo = setBits(rdo, 26, 26, 1)
    rdo = setBits(rdo, 19, 10, 50)
    rdo = setBits(rdo, 9, 0, 50)
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x02,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, toBytes32(rdo)))
    expect(message).toBeInstanceOf(RequestMessage)
    const decoded = message as RequestMessage
    expect(decoded.rdo?.objectPosition).toBe(3)
    expect(decoded.rdo?.fixedVariable.operatingCurrent10mA).toBe(50)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Power request:**')
    expect(summary?.value).toContain('- Selected source object position: 3')
    expect(summary?.value).toContain('- Operating current: 0.5A')
    expect(summary?.value).toContain('- Maximum operating current: 0.5A')
    expect(summary?.value).toContain('**Asserted request flags:**')
    expect(summary?.value).toContain('Capability mismatch')
    const requestMetadata = decoded.humanReadableMetadata.messageSpecificData.getEntry('requestDataObject')
    expect(requestMetadata?.getEntry('requestTypeHint')?.value).toBe('fixed_variable')
    expect(requestMetadata?.getEntry('fixedVariable')).not.toBeUndefined()
    expect(requestMetadata?.getEntry('battery')).toBeUndefined()
    expect(requestMetadata?.getEntry('pps')).toBeUndefined()
    expect(requestMetadata?.getEntry('avs')).toBeUndefined()
  })

  it('decodes BIST', () => {
    const bist = 0b0101 << 28
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x03,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, toBytes32(bist)))
    expect(message).toBeInstanceOf(BISTMessage)
    const decoded = message as BISTMessage
    expect(decoded.bistDataObject?.modeName).toBe('BIST_CARRIER_MODE')
  })

  it('decodes Battery_Status', () => {
    let bsdo = 0
    bsdo = setBits(bsdo, 31, 16, 0x1234)
    bsdo = setBits(bsdo, 9, 9, 1)
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x05,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, toBytes32(bsdo)))
    expect(message).toBeInstanceOf(BatteryStatusMessage)
    const decoded = message as BatteryStatusMessage
    expect(decoded.batteryStatusDataObject?.batteryPresentCapacity).toBe(0x1234)
    expect(decoded.batteryStatusDataObject?.batteryPresent).toBe(true)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Battery status:**')
    expect(summary?.value).toContain('- Battery is present.')
    expect(summary?.value).toContain('- Present capacity: 466Wh')
    expect(summary?.value).toContain('- Charging state: charging.')
  })

  it('decodes Alert', () => {
    let ado = 0
    ado = setBits(ado, 31, 24, 0b10000000)
    ado = setBits(ado, 23, 20, 0b0011)
    ado = setBits(ado, 3, 0, 2)
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x06,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, toBytes32(ado)))
    expect(message).toBeInstanceOf(AlertMessage)
    const decoded = message as AlertMessage
    expect(decoded.alertDataObject?.typeOfAlert).toBe(0b10000000)
    expect(decoded.alertDataObject?.extendedAlertEventType).toBe(2)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Reported alerts:**')
    expect(summary?.value).toContain('- Extended alert event is present.')
    expect(summary?.value).toContain('**Affected batteries:**')
    expect(summary?.value).toContain('- Fixed battery slots: 1, 2')
    expect(summary?.value).toContain('**Extended alert event type:** 2')
  })

  it('decodes Get_Country_Info', () => {
    const ccdo = (0x55 << 24) | (0x53 << 16)
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x07,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, toBytes32(ccdo)))
    expect(message).toBeInstanceOf(GetCountryInfoMessage)
    const decoded = message as GetCountryInfoMessage
    expect(decoded.countryCodeDataObject?.countryCode).toBe('US')
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Requested country information:**')
    expect(summary?.value).toContain('- Country code: US')
  })

  it('decodes Enter_USB', () => {
    let eudo = 0
    eudo = setBits(eudo, 30, 28, 0b010)
    eudo = setBits(eudo, 20, 19, 0b10)
    eudo = setBits(eudo, 18, 17, 0b11)
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x08,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, toBytes32(eudo)))
    expect(message).toBeInstanceOf(EnterUSBMessage)
    const decoded = message as EnterUSBMessage
    expect(decoded.enterUsbDataObject?.usbMode).toBe(0b010)
    expect(decoded.enterUsbDataObject?.cableType).toBe(0b10)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**USB mode entry:**')
    expect(summary?.value).toContain('- Requested USB mode: USB4')
    expect(summary?.value).toContain('- Cable type: Active re-driver')
    expect(summary?.value).toContain('- Cable current: 5A')
  })

  it('decodes EPR_Request', () => {
    let rdo = 0
    rdo = setBits(rdo, 31, 28, 1)
    rdo = setBits(rdo, 19, 10, 25)
    let pdo = 0
    pdo = setBits(pdo, 19, 10, 100)
    pdo = setBits(pdo, 9, 0, 200)
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 2,
      messageTypeNumber: 0x09,
    })
    const payload = [...toBytes32(rdo), ...toBytes32(pdo)]
    const message = parseUSBPDMessage(buildMessage(SOP, header, payload))
    expect(message).toBeInstanceOf(EPRRequestMessage)
    const decoded = message as EPRRequestMessage
    expect(decoded.rdo?.objectPosition).toBe(1)
    expect(decoded.requestedPDOCopy?.pdoType).toBe('FIXED')
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Extended Power Range request:**')
    expect(summary?.value).toContain('- Selected source object position: 1')
    expect(summary?.value).toContain('- Operating current: 0.25A')
    expect(summary?.value).toContain('**Copied requested Power Data Object:**')
    expect(summary?.value).toContain('- 5V @ 2A fixed supply')
    const requestMetadata = decoded.humanReadableMetadata.messageSpecificData.getEntry('requestDataObject')
    expect(requestMetadata?.getEntry('requestTypeHint')?.value).toBe('fixed_variable')
    expect(requestMetadata?.getEntry('fixedVariable')).not.toBeUndefined()
    expect(requestMetadata?.getEntry('battery')).toBeUndefined()
    expect(requestMetadata?.getEntry('pps')).toBeUndefined()
    expect(requestMetadata?.getEntry('avs')).toBeUndefined()
  })

  it('decodes EPR_Mode', () => {
    const epr = 0x01 << 24
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x0a,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, toBytes32(epr)))
    expect(message).toBeInstanceOf(EPRModeMessage)
    const decoded = message as EPRModeMessage
    expect(decoded.eprModeDataObject?.action).toBe(0x01)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Extended Power Range mode transition:**')
    expect(summary?.value).toContain('- Action: Enter Extended Power Range mode.')
    expect(summary?.value).toContain('- Sink operational power data profile: 0W.')
  })

  it('decodes Source_Info', () => {
    let sido = 0
    sido = setBits(sido, 31, 31, 1)
    sido = setBits(sido, 23, 16, 40)
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x0b,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, toBytes32(sido)))
    expect(message).toBeInstanceOf(SourceInfoMessage)
    const decoded = message as SourceInfoMessage
    expect(decoded.sourceInfoDataObject?.portMaximumPdp).toBe(40)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Source information:**')
    expect(summary?.value).toContain('- Port type: Guaranteed Capability Port')
    expect(summary?.value).toContain('- Port maximum power data profile: 40W')
    expect(summary?.value).toContain('- Port present power data profile: 0W')
    expect(summary?.value).toContain('- Port reported power data profile: 0W')
  })

  it('decodes Revision', () => {
    let rmdo = 0
    rmdo = setBits(rmdo, 31, 28, 3)
    rmdo = setBits(rmdo, 27, 24, 2)
    rmdo = setBits(rmdo, 23, 20, 1)
    rmdo = setBits(rmdo, 19, 16, 1)
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x0c,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, toBytes32(rmdo)))
    expect(message).toBeInstanceOf(RevisionMessage)
    const decoded = message as RevisionMessage
    expect(decoded.revisionDataObject?.revisionMajor).toBe(3)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Revision information:**')
    expect(summary?.value).toContain('- Revision: 3.2')
    expect(summary?.value).toContain('- Version: 1.1')
  })

  it('decodes Vendor_Defined with Discover SVIDs ACK', () => {
    let vdm = 0
    vdm = setBits(vdm, 31, 16, 0xff00)
    vdm = setBits(vdm, 15, 15, 1)
    vdm = setBits(vdm, 14, 13, 1)
    vdm = setBits(vdm, 12, 11, 1)
    vdm = setBits(vdm, 7, 6, 1)
    vdm = setBits(vdm, 4, 0, 2)
    const svids = (0x1234 << 16) | 0x5678
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 2,
      messageTypeNumber: 0x0f,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, [...toBytes32(vdm), ...toBytes32(svids)]))
    expect(message).toBeInstanceOf(VendorDefinedMessage)
    const decoded = message as VendorDefinedMessage
    expect(decoded.vdmHeader?.commandName).toBe('DISCOVER_SVIDS')
    expect(decoded.discoverSVIDs).toContain(0x1234)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.value).toContain('DISCOVER_SVIDS ACK')
    expect(summary?.value).toContain('**Discovered Standard or Vendor IDs:**')
    expect(summary?.value).toContain('- 0x1234')
    expect(summary?.value).toContain('- 0x5678')
    const discoverSvidVdos = decoded.humanReadableMetadata.messageSpecificData.getEntry('discoverSvidVdos')
    expect(discoverSvidVdos?.type).toBe('OrderedDictionary')
    expect(discoverSvidVdos?.getEntry('vdo1')?.type).toBe('OrderedDictionary')
    expect(discoverSvidVdos?.getEntry('vdo1')?.getEntry('svid0')?.value).toBe('0x5678')
    expect(discoverSvidVdos?.getEntry('vdo1')?.getEntry('svid1')?.value).toBe('0x1234')
  })

  it('decodes Vendor_Defined Enter Mode payload VDOs', () => {
    let vdm = 0
    vdm = setBits(vdm, 31, 16, 0xff01)
    vdm = setBits(vdm, 15, 15, 1)
    vdm = setBits(vdm, 14, 13, 1)
    vdm = setBits(vdm, 12, 11, 1)
    vdm = setBits(vdm, 10, 8, 1)
    vdm = setBits(vdm, 7, 6, 0)
    vdm = setBits(vdm, 4, 0, 4)
    const payloadVdo = 0x12345678
    const header = makeMessageHeader({
      extended: false,
      numberOfDataObjects: 2,
      messageTypeNumber: 0x0f,
    })
    const message = parseUSBPDMessage(buildMessage(SOP, header, [...toBytes32(vdm), ...toBytes32(payloadVdo)]))
    expect(message).toBeInstanceOf(VendorDefinedMessage)
    const decoded = message as VendorDefinedMessage
    const enterModePayloadVdos = decoded.humanReadableMetadata.messageSpecificData.getEntry(
      'enterModePayloadVdos',
    )
    expect(enterModePayloadVdos?.type).toBe('OrderedDictionary')
    expect(enterModePayloadVdos?.getEntry('vdo1')?.type).toBe('OrderedDictionary')
    expect(enterModePayloadVdos?.getEntry('vdo1')?.getEntry('raw')?.value).toBe('0x12345678')
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.value).toContain('ENTER_MODE REQ')
    expect(summary?.value).toContain('- Object position: 1')
    expect(summary?.value).toContain('**ENTER_MODE payload Vendor Data Objects:**')
    expect(summary?.value).toContain('- 0x12345678')
  })

  it('ignores trailing CRC bytes when decoding Vendor_Defined Discover Identity from SOP\'', () => {
    const frame = Uint8Array.from([
      0x18, 0x18, 0x06, 0x06,
      0x8f, 0x51,
      0x41, 0xa0, 0x00, 0xff,
      0x00, 0x00, 0x00, 0x18,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x40, 0x46, 0x0a, 0x00,
      0xc4, 0x03, 0xd9, 0x14,
    ])
    const message = parseUSBPDMessage(frame)
    expect(message).toBeInstanceOf(VendorDefinedMessage)
    const decoded = message as VendorDefinedMessage
    expect(decoded.sop.kind).toBe('SOP_PRIME')
    expect(decoded.header.messageHeader.numberOfDataObjects).toBe(5)
    expect(decoded.rawDataObjects).toEqual([
      0xff00a041,
      0x18000000,
      0x00000000,
      0x00000000,
      0x000a4640,
    ])
    expect(decoded.discoverIdentity?.productTypeVDOs).toHaveLength(1)
    expect(decoded.discoverIdentity?.rawVDOs).toEqual([])
    expect(decoded.parseErrors).toEqual([])
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.value).toContain('DISCOVER_IDENTITY ACK')
    expect(summary?.value).toContain('**Discover Identity data:**')
    expect(summary?.value).toContain('- USB Vendor ID: 0x0000')
    expect(summary?.value).toContain('Passive Cable Vendor Data Object:')
    expect(summary?.value).toContain('  - Plug type: USB Type-C')
    expect(summary?.value).toContain('  - Extended Power Range capable: yes')
    expect(summary?.value).toContain('  - Maximum bus voltage: 50V')
    expect(summary?.value).toContain('  - Current capability: 5A')
    expect(summary?.value).toContain('  - Latency: 10 ns to 20 ns (~2 m)')
    expect(summary?.value).toContain('  - Termination: VCONN not required')
    expect(summary?.value).toContain('  - Highest USB speed: USB 2.0 only')
  })
})

describe('USB-PD extended message decoding', () => {
  it('decodes Source_Capabilities_Extended', () => {
    const scedb = new Uint8Array(25)
    scedb[0] = 0x34
    scedb[1] = 0x12
    scedb[8] = 0x10
    scedb[9] = 0x20
    scedb[21] = 0b00000111
    scedb[22] = 0x21
    scedb[23] = 45
    scedb[24] = 90
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x01,
    })
    const extHeader = makeExtendedHeader({ dataSize: scedb.length })
    const message = parseUSBPDMessage(buildMessage(SOP, header, Array.from(scedb), extHeader))
    expect(message).toBeInstanceOf(SourceCapabilitiesExtendedMessage)
    const decoded = message as SourceCapabilitiesExtendedMessage
    expect(decoded.sourceCapabilitiesExtended?.vid).toBe(0x1234)
    expect(decoded.sourceCapabilitiesExtended?.hwVersion).toBe(0x20)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Source capabilities extended information:**')
    expect(summary?.value).toContain('- USB Vendor ID: 0x1234')
    expect(summary?.value).toContain('- Firmware version: 16')
    expect(summary?.value).toContain('- Hardware version: 32')
    expect(summary?.value).toContain('- Standard Power Range source power data profile rating: 45W')
    expect(summary?.value).toContain('- Extended Power Range source power data profile rating: 90W')
    expect(summary?.value).toContain('- Source inputs: unconstrained external supply, internal battery')
    expect(summary?.value).toContain('- Fixed batteries: 1')
    expect(summary?.value).toContain('- Hot-swappable battery slots: 2')
    const block = decoded.humanReadableMetadata.messageSpecificData.getEntry('sourceCapabilitiesExtendedDataBlock')
    expect(block?.getEntry('voltageRegulation')?.value).toContain('Load Step Slew Rate')
  })

  it('decodes Status for SOP', () => {
    const sdb = [25, 0x02, 0x01, 0x04, 0x02, 0x10, 0x03]
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x02,
    })
    const extHeader = makeExtendedHeader({ dataSize: sdb.length })
    const message = parseUSBPDMessage(buildMessage(SOP, header, sdb, extHeader))
    expect(message).toBeInstanceOf(StatusMessage)
    const decoded = message as StatusMessage
    expect(decoded.sopStatusDataBlock?.internalTemp).toBe(25)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Port status:**')
    expect(summary?.value).toContain('- Internal temperature: 25C')
    expect(summary?.value).toContain('- Present inputs: external DC power')
    expect(summary?.value).toContain('**Active event flags:**')
    expect(summary?.value).toContain('- over-temperature protection event')
    expect(summary?.value).toContain('- Temperature status: normal')
    expect(summary?.value).toContain('- Source power is limited by active event flags.')
    expect(summary?.value).toContain('- Power state change: S3; off LED.')
    const block = decoded.humanReadableMetadata.messageSpecificData.getEntry('statusDataBlock')
    expect(block?.getEntry('temperatureStatus')?.value).toContain('Normal')
  })

  it('decodes Status for SOP\'', () => {
    const spdb = [30, 0x01]
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x02,
    })
    const extHeader = makeExtendedHeader({ dataSize: spdb.length })
    const message = parseUSBPDMessage(buildMessage(SOP_PRIME, header, spdb, extHeader))
    expect(message).toBeInstanceOf(StatusMessage)
    const decoded = message as StatusMessage
    expect(decoded.sopPrimeStatusDataBlock?.flags).toBe(1)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.value).toContain('**Cable status:**')
    expect(summary?.value).toContain('- Internal temperature: 30C')
    expect(summary?.value).toContain('- Flags: 0x01')
  })

  it('decodes Get_Battery_Cap', () => {
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x03,
    })
    const extHeader = makeExtendedHeader({ dataSize: 1 })
    const message = parseUSBPDMessage(buildMessage(SOP, header, [0x04], extHeader))
    expect(message).toBeInstanceOf(GetBatteryCapMessage)
    const decoded = message as GetBatteryCapMessage
    expect(decoded.batteryCapRef).toBe(0x04)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Battery capability request:**')
    expect(summary?.value).toContain('- Requested battery reference: 4')
  })

  it('decodes Get_Battery_Status', () => {
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x04,
    })
    const extHeader = makeExtendedHeader({ dataSize: 1 })
    const message = parseUSBPDMessage(buildMessage(SOP, header, [0x02], extHeader))
    expect(message).toBeInstanceOf(GetBatteryStatusMessage)
    const decoded = message as GetBatteryStatusMessage
    expect(decoded.batteryStatusRef).toBe(0x02)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Battery status request:**')
    expect(summary?.value).toContain('- Requested battery reference: 2')
  })

  it('decodes Battery_Capabilities', () => {
    const bcdb = new Uint8Array(9)
    bcdb[0] = 0x34
    bcdb[1] = 0x12
    bcdb[2] = 0x78
    bcdb[3] = 0x56
    bcdb[4] = 0x10
    bcdb[5] = 0x00
    bcdb[6] = 0x08
    bcdb[7] = 0x00
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x05,
    })
    const extHeader = makeExtendedHeader({ dataSize: bcdb.length })
    const message = parseUSBPDMessage(buildMessage(SOP, header, Array.from(bcdb), extHeader))
    expect(message).toBeInstanceOf(BatteryCapabilitiesMessage)
    const decoded = message as BatteryCapabilitiesMessage
    expect(decoded.batteryCapabilities?.batteryDesignCapacity).toBe(0x0010)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Battery capabilities:**')
    expect(summary?.value).toContain('- USB Vendor ID: 0x1234')
    expect(summary?.value).toContain('- Product ID: 0x5678')
    expect(summary?.value).toContain('- Design capacity: 16')
    expect(summary?.value).toContain('- Last full-charge capacity: 8')
    expect(summary?.value).toContain('- Battery reference: valid')
    const block = decoded.humanReadableMetadata.messageSpecificData.getEntry('batteryCapabilitiesDataBlock')
    expect(block?.getEntry('batteryType')?.value).toBe('0b00000000 (Invalid Battery Reference clear)')
  })

  it('decodes Get_Manufacturer_Info', () => {
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x06,
    })
    const extHeader = makeExtendedHeader({ dataSize: 2 })
    const message = parseUSBPDMessage(buildMessage(SOP, header, [0x01, 0x02], extHeader))
    expect(message).toBeInstanceOf(GetManufacturerInfoMessage)
    const decoded = message as GetManufacturerInfoMessage
    expect(decoded.manufacturerInfoTarget).toBe(0x01)
    expect(decoded.manufacturerInfoRef).toBe(0x02)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Manufacturer information request:**')
    expect(summary?.value).toContain('- Target: 1')
    expect(summary?.value).toContain('- Reference: 2')
  })

  it('decodes Manufacturer_Info', () => {
    const midb = Uint8Array.from([0x34, 0x12, 0x78, 0x56, 0x41, 0x43, 0x4d, 0x45, 0x00])
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x07,
    })
    const extHeader = makeExtendedHeader({ dataSize: midb.length })
    const message = parseUSBPDMessage(buildMessage(SOP, header, Array.from(midb), extHeader))
    expect(message).toBeInstanceOf(ManufacturerInfoMessage)
    const decoded = message as ManufacturerInfoMessage
    expect(decoded.manufacturerInfo?.manufacturerString).toBe('ACME')
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Manufacturer information:**')
    expect(summary?.value).toContain('- USB Vendor ID: 0x1234')
    expect(summary?.value).toContain('- Product ID: 0x5678')
    expect(summary?.value).toContain('- Manufacturer string: ACME')
  })

  it('decodes Security_Request and Security_Response', () => {
    const headerRequest = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x08,
    })
    const extHeaderRequest = makeExtendedHeader({ dataSize: 4 })
    const request = parseUSBPDMessage(buildMessage(SOP, headerRequest, [1, 2, 3, 4], extHeaderRequest))
    expect(request).toBeInstanceOf(SecurityRequestMessage)
    const decodedRequest = request as SecurityRequestMessage
    const requestBlock = decodedRequest.humanReadableMetadata.messageSpecificData.getEntry(
      'securityRequestDataBlock',
    )
    expect(requestBlock?.type).toBe('OrderedDictionary')
    expect(requestBlock?.getEntry('externalSpecification')?.value).toBe('USB Type-C Authentication 1.0')
    expect(requestBlock?.getEntry('actualLength')?.value).toBe('4 bytes')
    expect(requestBlock?.getEntry('rawBytes')?.type).toBe('ByteData')

    const headerResponse = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x09,
    })
    const extHeaderResponse = makeExtendedHeader({ dataSize: 4 })
    const response = parseUSBPDMessage(buildMessage(SOP, headerResponse, [5, 6, 7, 8], extHeaderResponse))
    expect(response).toBeInstanceOf(SecurityResponseMessage)
    const decodedResponse = response as SecurityResponseMessage
    const responseBlock = decodedResponse.humanReadableMetadata.messageSpecificData.getEntry(
      'securityResponseDataBlock',
    )
    expect(responseBlock?.getEntry('externalSpecification')?.value).toBe('USB Type-C Authentication 1.0')
  })

  it('decodes Firmware Update messages', () => {
    const headerRequest = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x0a,
    })
    const extHeaderRequest = makeExtendedHeader({ dataSize: 4 })
    const request = parseUSBPDMessage(buildMessage(SOP, headerRequest, [9, 8, 7, 6], extHeaderRequest))
    expect(request).toBeInstanceOf(FirmwareUpdateRequestMessage)
    const decodedRequest = request as FirmwareUpdateRequestMessage
    const requestBlock = decodedRequest.humanReadableMetadata.messageSpecificData.getEntry(
      'firmwareUpdateRequestDataBlock',
    )
    expect(requestBlock?.type).toBe('OrderedDictionary')
    expect(requestBlock?.getEntry('externalSpecification')?.value).toBe('USB PD Firmware Update 1.0')

    const headerResponse = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x0b,
    })
    const extHeaderResponse = makeExtendedHeader({ dataSize: 4 })
    const response = parseUSBPDMessage(buildMessage(SOP, headerResponse, [6, 7, 8, 9], extHeaderResponse))
    expect(response).toBeInstanceOf(FirmwareUpdateResponseMessage)
    const decodedResponse = response as FirmwareUpdateResponseMessage
    const responseBlock = decodedResponse.humanReadableMetadata.messageSpecificData.getEntry(
      'firmwareUpdateResponseDataBlock',
    )
    expect(responseBlock?.getEntry('externalSpecification')?.value).toBe('USB PD Firmware Update 1.0')
  })

  it('decodes PPS_Status', () => {
    const pp = [0x34, 0x12, 0x56, 0x0c]
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x0c,
    })
    const extHeader = makeExtendedHeader({ dataSize: pp.length })
    const message = parseUSBPDMessage(buildMessage(SOP, header, pp, extHeader))
    expect(message).toBeInstanceOf(PPSStatusMessage)
    const decoded = message as PPSStatusMessage
    expect(decoded.ppsStatusDataBlock?.outputVoltage20mV).toBe(0x1234)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Programmable Power Supply status:**')
    expect(summary?.value).toContain('- Output voltage: 93.2V')
    expect(summary?.value).toContain('- Output current: 4.3A')
    expect(summary?.value).toContain('- Temperature flag: warning')
    expect(summary?.value).toContain('- Operating mode: current limit mode')
    const block = decoded.humanReadableMetadata.messageSpecificData.getEntry('ppsStatusDataBlock')
    expect(block?.getEntry('realTimeFlags')?.value).toContain('PTF')
  })

  it('decodes Country_Info and Country_Codes', () => {
    const cidb = [0x55, 0x53, 0x00, 0x00, 0x41, 0x42, 0x43]
    const headerInfo = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x0d,
    })
    const extHeaderInfo = makeExtendedHeader({ dataSize: cidb.length })
    const info = parseUSBPDMessage(buildMessage(SOP, headerInfo, cidb, extHeaderInfo))
    expect(info).toBeInstanceOf(CountryInfoMessage)
    const infoDecoded = info as CountryInfoMessage
    expect(infoDecoded.countryInfoDataBlock?.countryCode).toBe('US')
    const infoSummary = infoDecoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(infoSummary?.type).toBe('String')
    expect(infoSummary?.Label).toBe('Message Summary')
    expect(infoSummary?.value).toContain('**Country information:**')
    expect(infoSummary?.value).toContain('- Country code: US')
    expect(infoSummary?.value).toContain('- Country-specific data: 3 bytes')
    expect(infoSummary?.value).toContain('- ASCII preview: ABC')

    const ccdb = [0x02, 0x00, 0x55, 0x53, 0x4a, 0x50]
    const headerCodes = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x0e,
    })
    const extHeaderCodes = makeExtendedHeader({ dataSize: ccdb.length })
    const codes = parseUSBPDMessage(buildMessage(SOP, headerCodes, ccdb, extHeaderCodes))
    expect(codes).toBeInstanceOf(CountryCodesMessage)
    const codesDecoded = codes as CountryCodesMessage
    expect(codesDecoded.countryCodesDataBlock?.countryCodes).toContain('JP')
    const codesSummary = codesDecoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(codesSummary?.type).toBe('String')
    expect(codesSummary?.Label).toBe('Message Summary')
    expect(codesSummary?.value).toContain('**Supported country codes:**')
    expect(codesSummary?.value).toContain('- Reported country code count: 2')
    expect(codesSummary?.value).toContain('- Decoded country codes: US, JP')
  })

  it('decodes Sink_Capabilities_Extended', () => {
    const skedb = new Uint8Array(24)
    skedb[10] = 1
    skedb[17] = 0x10
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x0f,
    })
    const extHeader = makeExtendedHeader({ dataSize: skedb.length })
    const message = parseUSBPDMessage(buildMessage(SOP, header, Array.from(skedb), extHeader))
    expect(message).toBeInstanceOf(SinkCapabilitiesExtendedMessage)
    const decoded = message as SinkCapabilitiesExtendedMessage
    expect(decoded.sinkCapabilitiesExtended?.skedbVersion).toBe(1)
    expect(decoded.sinkCapabilitiesExtended?.sinkModes).toBe(0x10)
    const block = decoded.humanReadableMetadata.messageSpecificData.getEntry('sinkCapabilitiesExtendedDataBlock')
    expect(block?.getEntry('skedbVersion')?.value).toBe('0x01 (Version 1.0)')
    expect(block?.getEntry('sinkModes')?.value).toContain('Battery essentially unlimited')
  })

  it('decodes Extended_Control', () => {
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x10,
    })
    const extHeader = makeExtendedHeader({ dataSize: 2 })
    const message = parseUSBPDMessage(buildMessage(SOP, header, [0x03, 0x00], extHeader))
    expect(message).toBeInstanceOf(ExtendedControlMessage)
    const decoded = message as ExtendedControlMessage
    expect(decoded.extendedControlDataBlock?.type).toBe(0x03)
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.type).toBe('String')
    expect(summary?.Label).toBe('Message Summary')
    expect(summary?.value).toContain('**Extended control command:**')
    expect(summary?.value).toContain('- Command: EPR_KeepAlive')
    expect(summary?.value).toContain('- Meaning: Keeps an active Extended Power Range session alive.')
    expect(summary?.value).not.toContain('Sent by')
    expect(summary?.value).not.toContain('Valid Start-of-Packet')
    expect(summary?.value).not.toContain('Data byte')
    const block = decoded.humanReadableMetadata.messageSpecificData.getEntry('extendedControlDataBlock')
    expect(block?.getEntry('messageType')?.value).toBe('EPR_KeepAlive')
    expect(block?.getEntry('messageMeaning')?.value).toContain('periodic EPR traffic')
    expect(block?.getEntry('sentBy')?.value).toBe('Sink')
    expect(block?.getEntry('validStartOfPacket')?.value).toBe('SOP only')
    expect(block?.getEntry('dataMeaning')?.value).toContain('shall be 0x00')
  })

  it('decodes Extended_Control EPR_Get_Source_Cap and EPR_KeepAlive_Ack meanings', () => {
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x10,
    })
    const extHeader = makeExtendedHeader({ dataSize: 2 })

    const sourceCap = parseUSBPDMessage(buildMessage(SOP, header, [0x01, 0x00], extHeader)) as ExtendedControlMessage
    const sourceCapBlock = sourceCap.humanReadableMetadata.messageSpecificData.getEntry('extendedControlDataBlock')
    expect(sourceCapBlock?.getEntry('messageType')?.value).toBe('EPR_Get_Source_Cap')
    expect(sourceCapBlock?.getEntry('messageMeaning')?.value).toContain('Requests EPR source capabilities')
    expect(sourceCapBlock?.getEntry('sentBy')?.value).toBe('Sink or DRP')

    const keepAliveAck = parseUSBPDMessage(buildMessage(SOP, header, [0x04, 0x01], extHeader)) as ExtendedControlMessage
    const keepAliveAckSummary = keepAliveAck.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(keepAliveAckSummary?.value).toContain('- Command: EPR_KeepAlive_Ack')
    expect(keepAliveAckSummary?.value).toContain('- Meaning: Acknowledges an Extended Power Range keep-alive message.')
    expect(keepAliveAckSummary?.value).not.toContain('Data byte')
    expect(keepAliveAckSummary?.value).not.toContain('Observed value')
    const keepAliveAckBlock = keepAliveAck.humanReadableMetadata.messageSpecificData.getEntry('extendedControlDataBlock')
    expect(keepAliveAckBlock?.getEntry('messageType')?.value).toBe('EPR_KeepAlive_Ack')
    expect(keepAliveAckBlock?.getEntry('messageMeaning')?.value).toContain('Acknowledges an EPR_KeepAlive')
    expect(keepAliveAckBlock?.getEntry('sentBy')?.value).toBe('Source')
    expect(keepAliveAckBlock?.getEntry('dataMeaning')?.value).toContain('Observed value: 0x01')
  })

  it('decodes EPR Source/Sink Capabilities', () => {
    const pdoList = []
    for (let i = 0; i < 8; i += 1) {
      let pdo = 0
      pdo = setBits(pdo, 19, 10, 100 + i)
      pdo = setBits(pdo, 9, 0, 200 + i)
      pdoList.push(...toBytes32(pdo))
    }
    const headerSource = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 7,
      messageTypeNumber: 0x11,
    })
    const extHeaderSource = makeExtendedHeader({ dataSize: 32 })
    const source = parseUSBPDMessage(buildMessage(SOP, headerSource, pdoList, extHeaderSource))
    expect(source).toBeInstanceOf(EPRSourceCapabilitiesMessage)
    const sourceDecoded = source as EPRSourceCapabilitiesMessage
    expect(sourceDecoded.sprPDOs.length).toBe(7)
    expect(sourceDecoded.eprPDOs.length).toBe(1)
    const sourceSummary = sourceDecoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(sourceSummary?.type).toBe('String')
    expect(sourceSummary?.Label).toBe('Message Summary')
    expect(sourceSummary?.value).toContain('The source is reporting the following Extended Power Range capabilities:')
    expect(sourceSummary?.value).toContain('Standard Power Range fixed power profiles:')
    expect(sourceSummary?.value).toContain('- 5V @ 2A')
    expect(sourceSummary?.value).toContain('Extended Power Range fixed power profiles:')
    expect(sourceSummary?.value).toContain('- 5.35V @ 2.07A')

    const headerSink = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 7,
      messageTypeNumber: 0x12,
    })
    const extHeaderSink = makeExtendedHeader({ dataSize: 32 })
    const sink = parseUSBPDMessage(buildMessage(SOP, headerSink, pdoList, extHeaderSink))
    expect(sink).toBeInstanceOf(EPRSinkCapabilitiesMessage)
    const sinkDecoded = sink as EPRSinkCapabilitiesMessage
    expect(sinkDecoded.sprPDOs.length).toBe(7)
    expect(sinkDecoded.eprPDOs.length).toBe(1)
  })

  it('summarizes truncated EPR Source Capabilities as a partial transfer', () => {
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 7,
      messageTypeNumber: 0x11,
    })
    const extHeader = makeExtendedHeader({ dataSize: 8 })
    const message = parseUSBPDMessage(buildMessage(SOP, header, [0, 0, 0, 0], extHeader))
    expect(message).toBeInstanceOf(EPRSourceCapabilitiesMessage)
    const decoded = message as EPRSourceCapabilitiesMessage
    const summary = decoded.humanReadableMetadata.baseInformation.getEntry('messageSummary')
    expect(summary?.value).toContain('has only been partially transferred')
    expect(summary?.value).toContain('expected 8 bytes but received 4')
    expect(summary?.value).not.toContain('did not provide any parseable power profiles')
  })

  it('decodes Vendor_Defined_Extended', () => {
    let vdm = 0
    vdm = setBits(vdm, 31, 16, 0x1234)
    vdm = setBits(vdm, 15, 15, 0)
    vdm = setBits(vdm, 14, 0, 0x55)
    const vendorData = [0xaa, 0xbb]
    const header = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber: 0x1e,
    })
    const extHeader = makeExtendedHeader({ dataSize: 6 })
    const message = parseUSBPDMessage(
      buildMessage(SOP, header, [...toBytes32(vdm), ...vendorData], extHeader),
    )
    expect(message).toBeInstanceOf(VendorDefinedExtendedMessage)
    const decoded = message as VendorDefinedExtendedMessage
    expect(decoded.vdmHeader?.svid).toBe(0x1234)
    expect(decoded.vendorData.length).toBe(2)
  })
})
