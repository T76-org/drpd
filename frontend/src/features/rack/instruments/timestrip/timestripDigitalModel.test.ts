import { describe, expect, it } from 'vitest'
import type { LoggedCapturedMessage } from '../../../../lib/device'
import {
  getTimestripDigitalQueryRange,
  getTimestripEventColor,
  normalizeCapturedMessageForTimestrip,
  resolveTimestripDigitalDetailLevel,
} from './timestripDigitalModel'
import { DEFAULT_TIMESTRIP_THEME } from './timestripTheme'

const buildRow = (overrides: Partial<LoggedCapturedMessage> = {}): LoggedCapturedMessage => ({
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
  wallClockUs: 1_700_000_000_001_000n,
  startTimestampUs: 1000n,
  endTimestampUs: 1010n,
  displayTimestampUs: 0n,
  decodeResult: 0,
  sopKind: 'SOP',
  messageKind: 'DATA',
  messageType: 1,
  messageId: 0,
  senderPowerRole: 'SOURCE',
  senderDataRole: 'DFP',
  pulseCount: 2,
  rawPulseWidths: Float64Array.from([500, 500]),
  rawSop: Uint8Array.from([0x12, 0x12, 0x12, 0x13]),
  rawDecodedData: Uint8Array.from([0x61, 0x01, 0xaa, 0xbb, 0xcc, 0xdd]),
  parseError: null,
  createdAtMs: 1,
  ...overrides,
})

describe('timestripDigitalModel', () => {
  it('selects digital detail levels from zoom denominator', () => {
    expect(resolveTimestripDigitalDetailLevel(6_401)).toBe(1)
    expect(resolveTimestripDigitalDetailLevel(6_400)).toBe(2)
    expect(resolveTimestripDigitalDetailLevel(1_401)).toBe(2)
    expect(resolveTimestripDigitalDetailLevel(1_400)).toBe(3)
  })

  it('includes overscan in device timestamp query range', () => {
    expect(getTimestripDigitalQueryRange(100, 300, 10_000, 1_000_000n, 50)).toEqual({
      startTimestampUs: 1_000_500n,
      endTimestampUs: 1_004_500n,
    })
  })

  it('normalizes a captured message into render data', () => {
    const entry = normalizeCapturedMessageForTimestrip(buildRow(), 0n)

    expect(entry).toMatchObject({
      kind: 'message',
      startWorldUs: 1_000_000,
      endWorldUs: 1_010_000,
      label: 'Source Capabilities',
      frameBytes: [0x12, 0x12, 0x12, 0x13, 0x61, 0x01, 0xaa, 0xbb, 0xcc, 0xdd],
    })
    expect(entry?.kind === 'message' ? entry.components.map((component) => component.label) : []).toEqual([
      'SOP',
      'Header',
      'CRC32',
    ])
  })

  it('normalizes events and maps them to message-log colors', () => {
    const eventEntry = normalizeCapturedMessageForTimestrip(
      buildRow({
        entryKind: 'event',
        eventType: 'mark',
        eventText: 'Mark',
        rawDecodedData: new Uint8Array(),
      }),
      0n,
    )

    expect(eventEntry).toEqual({ kind: 'event', worldUs: 1_000_000, eventType: 'mark' })
    expect(getTimestripEventColor('mark', DEFAULT_TIMESTRIP_THEME)).toBe(DEFAULT_TIMESTRIP_THEME.eventMarkColor)
  })
})
