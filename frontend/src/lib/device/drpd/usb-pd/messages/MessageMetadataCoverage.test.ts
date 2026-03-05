import { describe, expect, it } from 'vitest'
import {
  CONTROL_MESSAGE_TYPES,
  DATA_MESSAGE_TYPES,
  EXTENDED_MESSAGE_TYPES,
} from '../message'
import { parseUSBPDMessage } from '../parser'
import { buildMessage, makeExtendedHeader, makeMessageHeader } from './messageTestUtils'

const SOP = [0x18, 0x18, 0x18, 0x11]

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
      numberOfDataObjects: 1,
      messageTypeNumber,
    }),
    [0, 0, 0, 0],
  )

/**
 * Build a parseable extended payload for one message type.
 *
 * @param messageTypeNumber - Extended message type number.
 * @returns Encoded payload.
 */
const buildExtendedPayload = (messageTypeNumber: number): Uint8Array =>
  buildMessage(
    SOP,
    makeMessageHeader({
      extended: true,
      numberOfDataObjects: 0,
      messageTypeNumber,
    }),
    [],
    makeExtendedHeader({ dataSize: 0 }),
  )

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
        'Message Type',
        'Message Description',
      ])
      expect(Array.from(parsed.humanReadableMetadata.technicalData.keys())).toEqual([])
      expect(Array.from(parsed.humanReadableMetadata.headerData.keys())).toEqual([])
      expect(Array.from(parsed.humanReadableMetadata.messageSpecificData.keys())).toEqual([])
      const description = parsed.humanReadableMetadata.baseInformation.getEntry('Message Description')
      expect(description?.type).toBe('String')
      expect(typeof description?.value).toBe('string')
      expect((description?.value as string).trim().length).toBeGreaterThan(0)
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
      expect(Array.from(parsed.humanReadableMetadata.baseInformation.keys())).toEqual([
        'Message Type',
        'Message Description',
      ])
      expect(Array.from(parsed.humanReadableMetadata.technicalData.keys())).toEqual([])
      expect(Array.from(parsed.humanReadableMetadata.headerData.keys())).toEqual([])
      expect(Array.from(parsed.humanReadableMetadata.messageSpecificData.keys())).toEqual([])
      const description = parsed.humanReadableMetadata.baseInformation.getEntry('Message Description')
      expect(description?.type).toBe('String')
      expect(typeof description?.value).toBe('string')
      expect((description?.value as string).trim().length).toBeGreaterThan(0)
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
      expect(Array.from(parsed.humanReadableMetadata.baseInformation.keys())).toEqual([
        'Message Type',
        'Message Description',
      ])
      expect(Array.from(parsed.humanReadableMetadata.technicalData.keys())).toEqual([])
      expect(Array.from(parsed.humanReadableMetadata.headerData.keys())).toEqual([])
      expect(Array.from(parsed.humanReadableMetadata.messageSpecificData.keys())).toEqual([])
      const description = parsed.humanReadableMetadata.baseInformation.getEntry('Message Description')
      expect(description?.type).toBe('String')
      expect(typeof description?.value).toBe('string')
      expect((description?.value as string).trim().length).toBeGreaterThan(0)
    })
  })
})
