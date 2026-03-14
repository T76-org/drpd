import { describe, expect, it } from 'vitest'
import type { LoggedCapturedMessage } from '../logging'
import { decodeLoggedCapturedMessage, decodeLoggedCapturedMessageWithContext } from '../logDecode'
import { buildMessage, makeExtendedHeader, makeMessageHeader, toBytes32 } from '../usb-pd/messages/messageTestUtils'

const buildMessageRow = (
  overrides: Partial<LoggedCapturedMessage> = {},
): LoggedCapturedMessage => ({
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
  wallClockUs: 1_700_000_000_000_000n,
  startTimestampUs: 1000n,
  endTimestampUs: 1005n,
  displayTimestampUs: 0n,
  decodeResult: 0,
  sopKind: 'SOP',
  messageKind: 'CONTROL',
  messageType: 3,
  messageId: 1,
  senderPowerRole: 'SOURCE',
  senderDataRole: 'DFP',
  pulseCount: 4,
  rawPulseWidths: Float64Array.from([1, 2, 3, 4]),
  rawSop: Uint8Array.from([0x18, 0x18, 0x18, 0x11]),
  rawDecodedData: Uint8Array.from([0xa3, 0x03, 0x6f, 0xac, 0xfa, 0x5d]),
  parseError: null,
  createdAtMs: 1_700_000_000_000,
  ...overrides,
})

describe('decodeLoggedCapturedMessage', () => {
  it('decodes valid message rows into concrete USB-PD message classes', () => {
    const row = buildMessageRow()
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('message')
    if (decoded.kind !== 'message') {
      return
    }
    expect(decoded.message.messageTypeName).toBe('Accept')
    expect(decoded.message.kind).toBe('CONTROL')
    expect(Array.from(decoded.message.pulseWidthsNs)).toEqual([1, 2, 3, 4])
    expect(decoded.message.pulseWidthsNs).not.toBe(row.rawPulseWidths)
    expect(decoded.message.startTimestampUs).toBe(1000n)
    expect(decoded.message.endTimestampUs).toBe(1005n)
    expect(decoded.message.wallClockUs).toBe(1_700_000_000_000_000n)
    const timingInformation = decoded.message.humanReadableMetadata.technicalData.getEntry('timingInformation')
    expect(timingInformation?.getEntry('startTimestamp')?.value).toBe('1000')
    expect(timingInformation?.getEntry('wallClockTimestamp')?.value).toBe('17:13:20.000000')
    expect(timingInformation?.getEntry('duration')?.value).toBe('5')
  })

  it('returns event rows without decode attempt', () => {
    const row = buildMessageRow({
      entryKind: 'event',
      eventType: 'capture_changed',
      eventText: 'Capture turned off',
      rawSop: new Uint8Array(),
      rawDecodedData: new Uint8Array(),
    })
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('event')
  })

  it('marks rows invalid when firmware decode failed', () => {
    const row = buildMessageRow({ decodeResult: 2 })
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('invalid')
    if (decoded.kind !== 'invalid') {
      return
    }
    expect(decoded.reason).toContain('decodeResult=2')
  })

  it('marks rows invalid when row contains parseError', () => {
    const row = buildMessageRow({ parseError: 'CRC mismatch' })
    const decoded = decodeLoggedCapturedMessage(row)
    expect(decoded.kind).toBe('invalid')
    if (decoded.kind !== 'invalid') {
      return
    }
    expect(decoded.reason).toContain('CRC mismatch')
  })

  it('reassembles chunked EPR source capabilities when decoding with ordered context', () => {
    const sop = [0x18, 0x18, 0x18, 0x11]
    const messageHeader = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x11,
      roleBit: 1,
      dataRoleBit: 1,
      specRevisionBits: 0b10,
    })
    const pdo1 = 0x0001912c
    const pdo2 = 0x0002d12c
    const chunk0 = buildMessage(
      sop,
      messageHeader,
      [...toBytes32(pdo1), 0xaa, 0xbb, 0xcc, 0xdd],
      makeExtendedHeader({ chunked: true, chunkNumber: 0, dataSize: 8 }),
    )
    const chunk1 = buildMessage(
      sop,
      messageHeader,
      [...toBytes32(pdo2), 0x01, 0x02, 0x03, 0x04],
      makeExtendedHeader({ chunked: true, chunkNumber: 1, dataSize: 8 }),
    )
    const firstRow = buildMessageRow({
      startTimestampUs: 1000n,
      endTimestampUs: 1005n,
      rawSop: chunk0.subarray(0, 4),
      rawDecodedData: chunk0.subarray(4),
      messageKind: 'EXTENDED',
      messageType: 0x11,
      createdAtMs: 1_700_000_000_001,
    })
    const secondRow = buildMessageRow({
      startTimestampUs: 1010n,
      endTimestampUs: 1015n,
      rawSop: chunk1.subarray(0, 4),
      rawDecodedData: chunk1.subarray(4),
      messageKind: 'EXTENDED',
      messageType: 0x11,
      createdAtMs: 1_700_000_000_002,
    })

    const decoded = decodeLoggedCapturedMessageWithContext(secondRow, [firstRow, secondRow])
    expect(decoded.kind).toBe('message')
    if (decoded.kind !== 'message') {
      return
    }

    const powerDataObjects = decoded.message.humanReadableMetadata.messageSpecificData.getEntry('powerDataObjects')
    expect(powerDataObjects).not.toBeUndefined()
    expect(Array.from(decoded.message.capturePayload)).toEqual(Array.from(chunk1))
    const crc32 = decoded.message.humanReadableMetadata.technicalData.getEntry('crc32')
    expect(crc32?.getEntry('actual')?.value).toBe('0x04030201')
    expect(crc32?.getEntry('actual')?.value).not.toBe('Unavailable')
  })

  it('keeps incomplete chunked EPR source capabilities fragment-local when context is incomplete', () => {
    const sop = [0x18, 0x18, 0x18, 0x11]
    const messageHeader = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x11,
      roleBit: 1,
      dataRoleBit: 1,
      specRevisionBits: 0b10,
    })
    const pdo1 = 0x0001912c
    const chunk0 = buildMessage(
      sop,
      messageHeader,
      [...toBytes32(pdo1), 0xaa, 0xbb, 0xcc, 0xdd],
      makeExtendedHeader({ chunked: true, chunkNumber: 0, dataSize: 8 }),
    )
    const firstRow = buildMessageRow({
      rawSop: chunk0.subarray(0, 4),
      rawDecodedData: chunk0.subarray(4),
      messageKind: 'EXTENDED',
      messageType: 0x11,
    })

    const decoded = decodeLoggedCapturedMessageWithContext(firstRow, [firstRow])
    expect(decoded.kind).toBe('message')
    if (decoded.kind !== 'message') {
      return
    }

    expect(decoded.message.humanReadableMetadata.messageSpecificData.getEntry('powerDataObjects')).toBeUndefined()
    const crc32 = decoded.message.humanReadableMetadata.technicalData.getEntry('crc32')
    expect(crc32?.getEntry('actual')?.value).toBe('0xDDCCBBAA')
  })
})
