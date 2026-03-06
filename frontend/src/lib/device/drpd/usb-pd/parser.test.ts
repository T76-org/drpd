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
    expect(Array.from(message.humanReadableMetadata.baseInformation.keys())).toEqual([
      'messageType',
      'messageDescription',
    ])
    expect(Array.from(message.humanReadableMetadata.technicalData.keys())).toEqual([
      'startTimestamp',
      'endTimestamp',
      'bmcCarrier',
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
    const startTimestamp = message.humanReadableMetadata.technicalData.getEntry('startTimestamp')
    expect(startTimestamp?.Label).toBe('Start Timestamp')
    expect(startTimestamp?.value).toBe('0')
    const endTimestamp = message.humanReadableMetadata.technicalData.getEntry('endTimestamp')
    expect(endTimestamp?.Label).toBe('End Timestamp')
    expect(endTimestamp?.value).toBe('0')
    const bmcCarrier = message.humanReadableMetadata.technicalData.getEntry('bmcCarrier')
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
    expect(message.humanReadableMetadata.technicalData.getEntry('startTimestamp')?.value).toBe('1000')
    expect(message.humanReadableMetadata.technicalData.getEntry('endTimestamp')?.value).toBe('1005')
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

    const bmcCarrier = message.humanReadableMetadata.technicalData.getEntry('bmcCarrier')
    expect(bmcCarrier?.type).toBe('OrderedDictionary')
    expect(bmcCarrier?.getEntry('frequency')?.value).toBe('500')
    expect(bmcCarrier?.getEntry('valid')?.value).toBe('false')
  })
})
