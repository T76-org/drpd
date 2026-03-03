import { describe, expect, it } from 'vitest'
import type { LoggedCapturedMessage } from '../logging'
import { decodeLoggedCapturedMessage } from '../logDecode'

const buildMessageRow = (
  overrides: Partial<LoggedCapturedMessage> = {},
): LoggedCapturedMessage => ({
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
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
  rawPulseWidths: Uint16Array.from([1, 2, 3, 4]),
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
})

