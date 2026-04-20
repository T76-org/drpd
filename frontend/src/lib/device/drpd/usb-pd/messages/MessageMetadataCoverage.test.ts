import { describe, expect, it } from 'vitest'
import {
  CONTROL_MESSAGE_TYPES,
  DATA_MESSAGE_TYPES,
  EXTENDED_MESSAGE_TYPES,
} from '../message'
import { parseUSBPDMessage } from '../parser'
import { buildMessage, makeExtendedHeader, makeMessageHeader } from './messageTestUtils'

const SOP = [0x18, 0x18, 0x18, 0x11]
const EXPECTED_TECHNICAL_DATA_KEYS = [
  'timingInformation',
  'sop',
  'crc32',
  'messageBytes',
]
const EXPECTED_MESSAGE_HEADER_KEYS_FOR_SOP = [
  'messageHeaderRaw',
  'extended',
  'numberOfDataObjects',
  'messageId',
  'portPowerRole',
  'specificationRevision',
  'portDataRole',
  'messageType',
]
const EXPECTED_EXTENDED_MESSAGE_HEADER_KEYS = [
  'extendedMessageHeaderRaw',
  'chunked',
  'chunkNumber',
  'requestChunk',
  'reservedBit9',
  'dataSize',
]
const DATA_MESSAGE_TYPES_WITH_SUMMARY = new Set([0x01, 0x02, 0x04, 0x05, 0x06, 0x07, 0x09, 0x0a, 0x0f])
const EXTENDED_MESSAGE_TYPES_WITH_SUMMARY = new Set([0x10, 0x11])

/**
 * Build a parseable control payload for one message type.
 *
 * @param messageTypeNumber - Control message type number.
 * @returns Encoded payload.
 */
const buildControlPayload = (messageTypeNumber: number): Uint8Array =>
  buildMessage(
    SOP,
    makeMessageHeader({
      extended: false,
      numberOfDataObjects: 0,
      messageTypeNumber,
    }),
    [],
  )

/**
 * Build a parseable data payload for one message type.
 *
 * @param messageTypeNumber - Data message type number.
 * @returns Encoded payload.
 */
const buildDataPayload = (messageTypeNumber: number): Uint8Array =>
  buildMessage(
    SOP,
    makeMessageHeader({
      extended: false,
      numberOfDataObjects: messageTypeNumber === 0x09 ? 2 : 1,
      messageTypeNumber,
    }),
    messageTypeNumber === 0x09 ? [0, 0, 0, 0, 0, 0, 0, 0] : [0, 0, 0, 0],
  )

/**
 * Build a parseable extended payload for one message type.
 *
 * @param messageTypeNumber - Extended message type number.
 * @returns Encoded payload.
 */
const buildExtendedPayload = (messageTypeNumber: number): Uint8Array => {
  const dataByType: Record<number, number[]> = {
    0x01: new Array(25).fill(0),
    0x02: new Array(7).fill(0),
    0x03: [0],
    0x04: [0],
    0x05: new Array(9).fill(0),
    0x06: [0, 0],
    0x07: [0, 0, 0, 0, 0],
    0x08: [0],
    0x09: [0],
    0x0A: [0],
    0x0B: [0],
    0x0C: [0, 0, 0, 0],
    0x0D: [0, 0, 0, 0],
    0x0E: [0, 0, 0, 0],
    0x0F: new Array(24).fill(0),
    0x10: [0, 0],
    0x11: [0, 0, 0, 0],
    0x12: [0, 0, 0, 0],
    0x13: [0, 0, 0, 0],
  }
  const data = dataByType[messageTypeNumber] ?? []
  return buildMessage(
    SOP,
    makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber,
    }),
    data,
    makeExtendedHeader({ dataSize: data.length }),
  )
}

describe('USB-PD message metadata coverage', () => {
  it('adds messageDescription metadata for every mapped control message type', () => {
    Object.keys(CONTROL_MESSAGE_TYPES).forEach((type) => {
      const messageTypeNumber = Number.parseInt(type, 10)
      const parsed = parseUSBPDMessage(buildControlPayload(messageTypeNumber))
      expect(parsed.humanReadableMetadata.baseInformation.type).toBe('OrderedDictionary')
      expect(parsed.humanReadableMetadata.technicalData.type).toBe('OrderedDictionary')
      expect(parsed.humanReadableMetadata.headerData.type).toBe('OrderedDictionary')
      expect(parsed.humanReadableMetadata.messageSpecificData.type).toBe('OrderedDictionary')
      expect(Array.from(parsed.humanReadableMetadata.baseInformation.keys())).toEqual([
        'messageType',
        'messageDescription',
        'usbPdReference',
      ])
      expect(Array.from(parsed.humanReadableMetadata.technicalData.keys())).toEqual(
        EXPECTED_TECHNICAL_DATA_KEYS,
      )
      expect(Array.from(parsed.humanReadableMetadata.headerData.keys())).toEqual(['messageHeader'])
      expect(Array.from(parsed.humanReadableMetadata.messageSpecificData.keys())).toEqual([])
      const messageType = parsed.humanReadableMetadata.baseInformation.getEntry('messageType')
      expect(messageType?.type).toBe('String')
      expect(messageType?.Label).toBe('Message Type')
      const description = parsed.humanReadableMetadata.baseInformation.getEntry('messageDescription')
      expect(description?.type).toBe('String')
      expect(description?.Label).toBe('Message Description')
      expect(typeof description?.value).toBe('string')
      expect((description?.value as string).trim().length).toBeGreaterThan(0)
      expect(parsed.humanReadableMetadata.baseInformation.getEntry('messageSummary')).toBeUndefined()
      const usbPdReference = parsed.humanReadableMetadata.baseInformation.getEntry('usbPdReference')
      expect(usbPdReference?.type).toBe('String')
      expect(usbPdReference?.Label).toBe('USB-PD Reference')
      expect(typeof usbPdReference?.value).toBe('string')
      expect((usbPdReference?.value as string).trim().length).toBeGreaterThan(0)
      expect(parsed.humanReadableMetadata.technicalData.getEntry('timingInformation')?.type).toBe(
        'OrderedDictionary',
      )
      expect(parsed.humanReadableMetadata.technicalData.getEntry('sop')?.type).toBe(
        'OrderedDictionary',
      )
      expect(parsed.humanReadableMetadata.technicalData.getEntry('crc32')?.type).toBe(
        'OrderedDictionary',
      )
      expect(parsed.humanReadableMetadata.technicalData.getEntry('messageBytes')?.type).toBe(
        'ByteData',
      )
      const messageHeader = parsed.humanReadableMetadata.headerData.getEntry('messageHeader')
      expect(messageHeader?.type).toBe('OrderedDictionary')
      expect(Array.from(messageHeader?.keys() ?? [])).toEqual(EXPECTED_MESSAGE_HEADER_KEYS_FOR_SOP)
    })
  })

  it('adds messageDescription metadata for every mapped data message type', () => {
    Object.keys(DATA_MESSAGE_TYPES).forEach((type) => {
      const messageTypeNumber = Number.parseInt(type, 10)
      const parsed = parseUSBPDMessage(buildDataPayload(messageTypeNumber))
      expect(parsed.humanReadableMetadata.baseInformation.type).toBe('OrderedDictionary')
      expect(parsed.humanReadableMetadata.technicalData.type).toBe('OrderedDictionary')
      expect(parsed.humanReadableMetadata.headerData.type).toBe('OrderedDictionary')
      expect(parsed.humanReadableMetadata.messageSpecificData.type).toBe('OrderedDictionary')
      const expectedBaseInformationKeys = [
        'messageType',
        'messageDescription',
        ...(DATA_MESSAGE_TYPES_WITH_SUMMARY.has(messageTypeNumber) ? ['messageSummary'] : []),
        'usbPdReference',
      ]
      expect(Array.from(parsed.humanReadableMetadata.baseInformation.keys())).toEqual(
        expectedBaseInformationKeys,
      )
      expect(Array.from(parsed.humanReadableMetadata.technicalData.keys())).toEqual(
        EXPECTED_TECHNICAL_DATA_KEYS,
      )
      expect(Array.from(parsed.humanReadableMetadata.headerData.keys())).toEqual(['messageHeader'])
      expect(Array.from(parsed.humanReadableMetadata.messageSpecificData.keys()).length).toBeGreaterThan(0)
      const messageType = parsed.humanReadableMetadata.baseInformation.getEntry('messageType')
      expect(messageType?.type).toBe('String')
      expect(messageType?.Label).toBe('Message Type')
      const description = parsed.humanReadableMetadata.baseInformation.getEntry('messageDescription')
      expect(description?.type).toBe('String')
      expect(description?.Label).toBe('Message Description')
      expect(typeof description?.value).toBe('string')
      expect((description?.value as string).trim().length).toBeGreaterThan(0)
      const summary = parsed.humanReadableMetadata.baseInformation.getEntry('messageSummary')
      if (DATA_MESSAGE_TYPES_WITH_SUMMARY.has(messageTypeNumber)) {
        expect(summary?.type).toBe('String')
        expect(summary?.Label).toBe('Message Summary')
        expect(typeof summary?.value).toBe('string')
        expect((summary?.value as string).trim().length).toBeGreaterThan(0)
      } else {
        expect(summary).toBeUndefined()
      }
      const usbPdReference = parsed.humanReadableMetadata.baseInformation.getEntry('usbPdReference')
      expect(usbPdReference?.type).toBe('String')
      expect(usbPdReference?.Label).toBe('USB-PD Reference')
      expect(typeof usbPdReference?.value).toBe('string')
      expect((usbPdReference?.value as string).trim().length).toBeGreaterThan(0)
      expect(parsed.humanReadableMetadata.technicalData.getEntry('timingInformation')?.type).toBe(
        'OrderedDictionary',
      )
      expect(parsed.humanReadableMetadata.technicalData.getEntry('sop')?.type).toBe(
        'OrderedDictionary',
      )
      expect(parsed.humanReadableMetadata.technicalData.getEntry('crc32')?.type).toBe(
        'OrderedDictionary',
      )
      expect(parsed.humanReadableMetadata.technicalData.getEntry('messageBytes')?.type).toBe(
        'ByteData',
      )
      const messageHeader = parsed.humanReadableMetadata.headerData.getEntry('messageHeader')
      expect(messageHeader?.type).toBe('OrderedDictionary')
      expect(Array.from(messageHeader?.keys() ?? [])).toEqual(EXPECTED_MESSAGE_HEADER_KEYS_FOR_SOP)
    })
  })

  it('adds messageDescription metadata for every mapped extended message type', () => {
    Object.keys(EXTENDED_MESSAGE_TYPES).forEach((type) => {
      const messageTypeNumber = Number.parseInt(type, 10)
      const parsed = parseUSBPDMessage(buildExtendedPayload(messageTypeNumber))
      expect(parsed.humanReadableMetadata.baseInformation.type).toBe('OrderedDictionary')
      expect(parsed.humanReadableMetadata.technicalData.type).toBe('OrderedDictionary')
      expect(parsed.humanReadableMetadata.headerData.type).toBe('OrderedDictionary')
      expect(parsed.humanReadableMetadata.messageSpecificData.type).toBe('OrderedDictionary')
      const expectedBaseInformationKeys = [
        'messageType',
        'messageDescription',
        ...(EXTENDED_MESSAGE_TYPES_WITH_SUMMARY.has(messageTypeNumber) ? ['messageSummary'] : []),
        'usbPdReference',
      ]
      expect(Array.from(parsed.humanReadableMetadata.baseInformation.keys())).toEqual(
        expectedBaseInformationKeys,
      )
      expect(Array.from(parsed.humanReadableMetadata.technicalData.keys())).toEqual(
        EXPECTED_TECHNICAL_DATA_KEYS,
      )
      expect(Array.from(parsed.humanReadableMetadata.headerData.keys())).toEqual([
        'messageHeader',
        'extendedMessageHeader',
      ])
      expect(Array.from(parsed.humanReadableMetadata.messageSpecificData.keys()).length).toBeGreaterThan(0)
      const messageType = parsed.humanReadableMetadata.baseInformation.getEntry('messageType')
      expect(messageType?.type).toBe('String')
      expect(messageType?.Label).toBe('Message Type')
      const description = parsed.humanReadableMetadata.baseInformation.getEntry('messageDescription')
      expect(description?.type).toBe('String')
      expect(description?.Label).toBe('Message Description')
      expect(typeof description?.value).toBe('string')
      expect((description?.value as string).trim().length).toBeGreaterThan(0)
      const summary = parsed.humanReadableMetadata.baseInformation.getEntry('messageSummary')
      if (EXTENDED_MESSAGE_TYPES_WITH_SUMMARY.has(messageTypeNumber)) {
        expect(summary?.type).toBe('String')
        expect(summary?.Label).toBe('Message Summary')
        expect(typeof summary?.value).toBe('string')
        expect((summary?.value as string).trim().length).toBeGreaterThan(0)
      } else {
        expect(summary).toBeUndefined()
      }
      const usbPdReference = parsed.humanReadableMetadata.baseInformation.getEntry('usbPdReference')
      expect(usbPdReference?.type).toBe('String')
      expect(usbPdReference?.Label).toBe('USB-PD Reference')
      expect(typeof usbPdReference?.value).toBe('string')
      expect((usbPdReference?.value as string).trim().length).toBeGreaterThan(0)
      expect(parsed.humanReadableMetadata.technicalData.getEntry('timingInformation')?.type).toBe(
        'OrderedDictionary',
      )
      expect(parsed.humanReadableMetadata.technicalData.getEntry('sop')?.type).toBe(
        'OrderedDictionary',
      )
      expect(parsed.humanReadableMetadata.technicalData.getEntry('crc32')?.type).toBe(
        'OrderedDictionary',
      )
      expect(parsed.humanReadableMetadata.technicalData.getEntry('messageBytes')?.type).toBe(
        'ByteData',
      )
      const messageHeader = parsed.humanReadableMetadata.headerData.getEntry('messageHeader')
      expect(messageHeader?.type).toBe('OrderedDictionary')
      expect(Array.from(messageHeader?.keys() ?? [])).toEqual(EXPECTED_MESSAGE_HEADER_KEYS_FOR_SOP)
      const extendedMessageHeader = parsed.humanReadableMetadata.headerData.getEntry(
        'extendedMessageHeader',
      )
      expect(extendedMessageHeader?.type).toBe('OrderedDictionary')
      expect(Array.from(extendedMessageHeader?.keys() ?? [])).toEqual(
        EXPECTED_EXTENDED_MESSAGE_HEADER_KEYS,
      )
    })
  })
})
