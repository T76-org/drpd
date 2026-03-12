import { describe, expect, it } from 'vitest'
import { parseUSBPDMessage } from './parser'
import {
  AcceptMessage,
  GoodCRCMessage,
  RequestMessage,
  SourceCapabilitiesExtendedMessage,
} from './message'

const sampleGoodCRC = Uint8Array.from([0x18, 0x18, 0x06, 0x06, 0x01, 0x01, 0x28, 0x13, 0xc5, 0x2f])
const sampleRequest = Uint8Array.from([
  0x18, 0x18, 0x18, 0x11, 0x82, 0x10, 0x2c, 0xb1, 0x04, 0x11, 0xa5, 0xe2, 0xfe, 0xa2,
])
const sampleAccept = Uint8Array.from([0x18, 0x18, 0x18, 0x11, 0xa3, 0x03, 0x6f, 0xac, 0xfa, 0x5d])

const sampleExtended = Uint8Array.from([0x18, 0x18, 0x18, 0x11, 0x01, 0x80, 0x12, 0x9c])

describe('usb-pd parser', () => {
  it('parses SOP\' GoodCRC control messages', () => {
    const message = parseUSBPDMessage(sampleGoodCRC)
    expect(message).toBeInstanceOf(GoodCRCMessage)
    expect(message.sop.kind).toBe('SOP_PRIME')
    expect(message.header.messageHeaderRaw).toBe(0x0101)
    expect(message.header.messageHeader.messageKind).toBe('CONTROL')
    expect(message.header.messageHeader.messageTypeNumber).toBe(0x01)
    expect(message.messageTypeName).toBe('GoodCRC')
    expect(message.pulseWidthsNs).toEqual(new Float64Array())
    expect(message.header.messageHeader.numberOfDataObjects).toBe(0)
    expect(Object.keys(message.humanReadableMetadata)).toEqual([
      'baseInformation',
      'technicalData',
      'headerData',
      'messageSpecificData',
    ])
    expect(message.humanReadableMetadata.baseInformation.type).toBe('OrderedDictionary')
    expect(message.humanReadableMetadata.technicalData.type).toBe('OrderedDictionary')
    expect(message.humanReadableMetadata.headerData.type).toBe('OrderedDictionary')
    expect(message.humanReadableMetadata.messageSpecificData.type).toBe('OrderedDictionary')
    expect(Array.from(message.humanReadableMetadata.headerData.keys())).toEqual(['messageHeader'])
    expect(Array.from(message.humanReadableMetadata.baseInformation.keys())).toEqual([
      'messageType',
      'messageDescription',
    ])
    expect(Array.from(message.humanReadableMetadata.technicalData.keys())).toEqual([
      'timingInformation',
      'sop',
      'crc32',
      'messageBytes',
    ])
    const messageType = message.humanReadableMetadata.baseInformation.getEntry('messageType')
    expect(messageType?.type).toBe('String')
    expect(messageType?.Label).toBe('Message Type')
    expect(messageType?.value).toBe('GoodCRC')
    const messageDescription =
      message.humanReadableMetadata.baseInformation.getEntry('messageDescription')
    expect(messageDescription?.type).toBe('String')
    expect(messageDescription?.Label).toBe('Message Description')
    expect(messageDescription?.value).toMatch(/GoodCRC/)
    const timingInformation = message.humanReadableMetadata.technicalData.getEntry('timingInformation')
    expect(timingInformation?.type).toBe('OrderedDictionary')
    expect(timingInformation?.Label).toBe('Timing Information')
    const startTimestamp = timingInformation?.getEntry('startTimestamp')
    expect(startTimestamp?.Label).toBe('Start Timestamp')
    expect(startTimestamp?.value).toBe('0')
    const endTimestamp = timingInformation?.getEntry('endTimestamp')
    expect(endTimestamp?.Label).toBe('End Timestamp')
    expect(endTimestamp?.value).toBe('0')
    const bmcCarrier = timingInformation?.getEntry('bmcCarrier')
    expect(bmcCarrier?.type).toBe('OrderedDictionary')
    expect(bmcCarrier?.Label).toBe('BMC Carrier')
    expect(bmcCarrier?.getEntry('frequency')?.value).toBe('Unavailable')
    expect(bmcCarrier?.getEntry('valid')?.value).toBe('false')
    const sop = message.humanReadableMetadata.technicalData.getEntry('sop')
    expect(sop?.type).toBe('OrderedDictionary')
    expect(sop?.getEntry('type')?.value).toBe('SOP\'')
    const kCodes = sop?.getEntry('kCodes')
    expect(kCodes?.type).toBe('ByteData')
    expect(Array.from((kCodes?.value as { data: Uint8Array }).data ?? [])).toEqual([0x18, 0x18, 0x06, 0x06])
    const crc32 = message.humanReadableMetadata.technicalData.getEntry('crc32')
    expect(crc32?.type).toBe('OrderedDictionary')
    expect(crc32?.getEntry('expected')?.value).toBe('0x2FC51328')
    expect(crc32?.getEntry('actual')?.value).toBe('0x2FC51328')
    expect(crc32?.getEntry('valid')?.value).toBe('true')
    const messageBytes = message.humanReadableMetadata.technicalData.getEntry('messageBytes')
    expect(messageBytes?.type).toBe('ByteData')
    expect(Array.from((messageBytes?.value as { data: Uint8Array }).data ?? [])).toEqual(
      Array.from(sampleGoodCRC),
    )
    const messageHeader = message.humanReadableMetadata.headerData.getEntry('messageHeader')
    expect(messageHeader?.type).toBe('OrderedDictionary')
    expect(messageHeader?.Label).toBe('Message Header')
    expect(Array.from(messageHeader?.keys() ?? [])).toEqual([
      'messageHeaderRaw',
      'extended',
      'numberOfDataObjects',
      'messageId',
      'cablePlug',
      'specificationRevision',
      'reservedBit5',
      'messageType',
    ])
    expect(messageHeader?.getEntry('messageHeaderRaw')?.Label).toBe('Message Header Raw')
    expect(messageHeader?.getEntry('messageHeaderRaw')?.value).toBe('0x0101')
    expect(messageHeader?.getEntry('extended')?.value).toBe('Not Extended (0b)')
    expect(messageHeader?.getEntry('numberOfDataObjects')?.value).toBe('0')
    expect(messageHeader?.getEntry('messageId')?.Label).toBe('MessageID')
    expect(messageHeader?.getEntry('messageId')?.value).toBe('0')
    expect(messageHeader?.getEntry('cablePlug')?.Label).toBe('Cable Plug')
    expect(messageHeader?.getEntry('cablePlug')?.value).toBe('Message originated from a Cable Plug or VPD (1b)')
    expect(messageHeader?.getEntry('specificationRevision')?.Label).toBe('Specification Revision')
    expect(messageHeader?.getEntry('specificationRevision')?.value).toBe('Revision 1.0 (00b)')
    expect(messageHeader?.getEntry('reservedBit5')?.Label).toBe('Reserved')
    expect(messageHeader?.getEntry('reservedBit5')?.value).toBe('0b0')
    expect(messageHeader?.getEntry('messageType')?.value).toBe('GoodCRC (0x01)')
  })

  it('parses SOP Request data messages', () => {
    const message = parseUSBPDMessage(sampleRequest)
    expect(message).toBeInstanceOf(RequestMessage)
    expect(message.sop.kind).toBe('SOP')
    expect(message.header.messageHeaderRaw).toBe(0x1082)
    expect(message.header.messageHeader.messageKind).toBe('DATA')
    expect(message.header.messageHeader.messageTypeNumber).toBe(0x02)
    expect(message.messageTypeName).toBe('Request')
    expect(message.header.messageHeader.numberOfDataObjects).toBe(1)
    expect(message.pulseWidthsNs).toEqual(new Float64Array())
    expect(message.header.messageHeader.powerRole).toBe('SINK')
    expect(message.header.messageHeader.dataRole).toBe('UFP')
    const messageHeader = message.humanReadableMetadata.headerData.getEntry('messageHeader')
    expect(messageHeader?.type).toBe('OrderedDictionary')
    expect(Array.from(messageHeader?.keys() ?? [])).toEqual([
      'messageHeaderRaw',
      'extended',
      'numberOfDataObjects',
      'messageId',
      'portPowerRole',
      'specificationRevision',
      'portDataRole',
      'messageType',
    ])
    expect(messageHeader?.getEntry('messageHeaderRaw')?.value).toBe('0x1082')
    expect(messageHeader?.getEntry('portPowerRole')?.value).toBe('Sink (0b)')
    expect(messageHeader?.getEntry('specificationRevision')?.value).toBe('Revision 3.x (10b)')
    expect(messageHeader?.getEntry('portDataRole')?.value).toBe('UFP (0b)')
    expect(messageHeader?.getEntry('messageType')?.value).toBe('Request (0x02)')
    const requestDataObject = message.humanReadableMetadata.messageSpecificData.getEntry(
      'requestDataObject',
    )
    expect(requestDataObject?.type).toBe('OrderedDictionary')
    expect(requestDataObject?.Label).toBe('Request Data Object')
    expect(requestDataObject?.getEntry('objectPosition')?.value).toBe('1')
  })

  it('parses SOP Accept control messages', () => {
    const message = parseUSBPDMessage(sampleAccept)
    expect(message).toBeInstanceOf(AcceptMessage)
    expect(message.sop.kind).toBe('SOP')
    expect(message.header.messageHeaderRaw).toBe(0x03a3)
    expect(message.header.messageHeader.messageKind).toBe('CONTROL')
    expect(message.header.messageHeader.messageTypeNumber).toBe(0x03)
    expect(message.messageTypeName).toBe('Accept')
    expect(message.pulseWidthsNs).toEqual(new Float64Array())
    expect(message.header.messageHeader.messageId).toBe(1)
    expect(message.header.messageHeader.powerRole).toBe('SOURCE')
    expect(message.header.messageHeader.dataRole).toBe('DFP')
    const messageHeader = message.humanReadableMetadata.headerData.getEntry('messageHeader')
    expect(messageHeader?.getEntry('portPowerRole')?.value).toBe('Source (1b)')
    expect(messageHeader?.getEntry('portDataRole')?.value).toBe('DFP (1b)')
  })

  it('parses extended message headers', () => {
    const message = parseUSBPDMessage(sampleExtended)
    expect(message).toBeInstanceOf(SourceCapabilitiesExtendedMessage)
    expect(message.header.messageHeader.extended).toBe(true)
    expect(message.header.messageHeader.messageKind).toBe('EXTENDED')
    expect(message.header.messageHeader.messageTypeNumber).toBe(0x01)
    expect(message.header.extendedHeader).not.toBeNull()
    expect(message.header.extendedHeader?.chunked).toBe(true)
    expect(message.header.extendedHeader?.chunkNumber).toBe(3)
    expect(message.header.extendedHeader?.requestChunk).toBe(true)
    expect(message.header.extendedHeader?.dataSize).toBe(0x12)
    expect(Array.from(message.humanReadableMetadata.headerData.keys())).toEqual([
      'messageHeader',
      'extendedMessageHeader',
    ])
    const messageHeader = message.humanReadableMetadata.headerData.getEntry('messageHeader')
    expect(messageHeader?.type).toBe('OrderedDictionary')
    expect(Array.from(messageHeader?.keys() ?? [])).toEqual([
      'messageHeaderRaw',
      'extended',
      'numberOfDataObjects',
      'messageId',
      'portPowerRole',
      'specificationRevision',
      'portDataRole',
      'messageType',
    ])
    expect(messageHeader?.getEntry('messageHeaderRaw')?.value).toBe('0x8001')
    expect(messageHeader?.getEntry('extended')?.value).toBe('Extended Message (1b)')
    expect(messageHeader?.getEntry('numberOfDataObjects')?.value).toBe('0')
    expect(messageHeader?.getEntry('portPowerRole')?.value).toBe('Sink (0b)')
    expect(messageHeader?.getEntry('specificationRevision')?.value).toBe('Revision 1.0 (00b)')
    expect(messageHeader?.getEntry('portDataRole')?.value).toBe('UFP (0b)')
    expect(messageHeader?.getEntry('messageType')?.value).toBe('Source_Capabilities_Extended (0x01)')
    const extendedMessageHeader = message.humanReadableMetadata.headerData.getEntry(
      'extendedMessageHeader',
    )
    expect(extendedMessageHeader?.type).toBe('OrderedDictionary')
    expect(extendedMessageHeader?.Label).toBe('Extended Message Header')
    expect(Array.from(extendedMessageHeader?.keys() ?? [])).toEqual([
      'extendedMessageHeaderRaw',
      'chunked',
      'chunkNumber',
      'requestChunk',
      'reservedBit9',
      'dataSize',
    ])
    expect(extendedMessageHeader?.getEntry('extendedMessageHeaderRaw')?.Label).toBe(
      'Extended Message Header Raw',
    )
    expect(extendedMessageHeader?.getEntry('extendedMessageHeaderRaw')?.value).toBe('0x9C12')
    expect(extendedMessageHeader?.getEntry('chunked')?.value).toBe('Chunked (1b)')
    expect(extendedMessageHeader?.getEntry('chunkNumber')?.value).toBe('3')
    expect(extendedMessageHeader?.getEntry('requestChunk')?.value).toBe('Chunk Request (1b)')
    expect(extendedMessageHeader?.getEntry('reservedBit9')?.value).toBe('0b0')
    expect(extendedMessageHeader?.getEntry('dataSize')?.value).toBe('18 bytes')
  })

  it('copies pulse widths into parsed messages', () => {
    const pulseWidthsNs = Float64Array.from([120, 340, 560])
    const message = parseUSBPDMessage(sampleAccept, pulseWidthsNs)
    pulseWidthsNs[0] = 999
    expect(Array.from(message.pulseWidthsNs)).toEqual([120, 340, 560])
  })

  it('uses capture timestamps in technical metadata when provided', () => {
    const message = parseUSBPDMessage(sampleAccept, Float64Array.from([1_000, 1_000, 1_000]), {
      startTimestampUs: 1000n,
      endTimestampUs: 1005n,
    })
    expect(message.startTimestampUs).toBe(1000n)
    expect(message.endTimestampUs).toBe(1005n)
    const timingInformation = message.humanReadableMetadata.technicalData.getEntry('timingInformation')
    expect(timingInformation?.getEntry('startTimestamp')?.value).toBe('1000')
    expect(timingInformation?.getEntry('endTimestamp')?.value).toBe('1005')
  })

  it('computes BMC carrier frequency using the DRPD preamble/message clock algorithm', () => {
    const preamblePulseWidthsNs = Array.from({ length: 96 }, (_, index) =>
      index % 3 === 0 ? 1_666.6666666666667 : 3_333.3333333333335,
    )
    const messagePulseWidthsNs = [1_000, 1_000, 1_000, 1_000]
    const message = parseUSBPDMessage(
      sampleAccept,
      Float64Array.from([...preamblePulseWidthsNs, ...messagePulseWidthsNs]),
    )

    const timingInformation = message.humanReadableMetadata.technicalData.getEntry('timingInformation')
    const bmcCarrier = timingInformation?.getEntry('bmcCarrier')
    expect(bmcCarrier?.type).toBe('OrderedDictionary')
    expect(bmcCarrier?.getEntry('frequency')?.value).toBe('500 kHz')
    expect(bmcCarrier?.getEntry('valid')?.value).toBe('false')
  })
})
