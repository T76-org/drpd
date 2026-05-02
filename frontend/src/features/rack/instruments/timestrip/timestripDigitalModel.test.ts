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
    expect(resolveTimestripDigitalDetailLevel(101)).toBe(1)
    expect(resolveTimestripDigitalDetailLevel(100)).toBe(2)
    expect(resolveTimestripDigitalDetailLevel(6)).toBe(2)
    expect(resolveTimestripDigitalDetailLevel(5)).toBe(3)
  })

  it('includes overscan in wall-clock query range', () => {
    expect(getTimestripDigitalQueryRange(100, 300, 10, 1_000_000, 50)).toEqual({
      startWallClockUs: 1_000_500n,
      endWallClockUs: 1_004_500n,
    })
  })

  it('normalizes a captured message into render data', () => {
    const entry = normalizeCapturedMessageForTimestrip(buildRow(), 1_700_000_000_000_000)

    expect(entry).toMatchObject({
      kind: 'message',
      startWorldUs: 1000,
      endWorldUs: 1010,
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
      1_700_000_000_000_000,
    )

    expect(eventEntry).toEqual({ kind: 'event', worldUs: 1000, eventType: 'mark' })
    expect(getTimestripEventColor('mark', DEFAULT_TIMESTRIP_THEME)).toBe(DEFAULT_TIMESTRIP_THEME.eventMarkColor)
  })
})
