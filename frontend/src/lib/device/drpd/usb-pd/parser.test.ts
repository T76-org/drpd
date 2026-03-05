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
      'Message Type',
      'Message Description',
    ])
    expect(message.humanReadableMetadata.baseInformation.getEntry('Message Type')?.type).toBe(
      'String',
    )
    expect(message.humanReadableMetadata.baseInformation.getEntry('Message Type')?.value).toBe(
      'GoodCRC',
    )
    expect(
      message.humanReadableMetadata.baseInformation.getEntry('Message Description')?.type,
    ).toBe('String')
    expect(
      message.humanReadableMetadata.baseInformation.getEntry('Message Description')?.value,
    ).toMatch(/GoodCRC/)
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
})
