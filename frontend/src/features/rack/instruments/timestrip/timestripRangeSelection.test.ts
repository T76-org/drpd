import { describe, expect, it } from 'vitest'
import {
  buildCapturedLogSelectionKey,
  type LoggedCapturedMessage,
} from '../../../../lib/device'
import {
  buildCapturedRangeSelectionKeys,
  doesCapturedRowIntersectRange,
} from '../DrpdTimeStripInstrumentView'

/**
 * Build one captured message row for range-selection tests.
 */
const buildMessage = (
  startTimestampUs: bigint,
  endTimestampUs: bigint,
  createdAtMs: number,
  wallClockUs: bigint | null = null,
): LoggedCapturedMessage => ({
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
  wallClockUs,
  startTimestampUs,
  endTimestampUs,
  displayTimestampUs: null,
  decodeResult: 0,
  sopKind: 'SOP',
  messageKind: 'DATA',
  messageType: 1,
  messageId: 0,
  senderPowerRole: 'SOURCE',
  senderDataRole: 'DFP',
  pulseCount: 0,
  rawPulseWidths: new Float64Array(),
  rawSop: new Uint8Array(),
  rawDecodedData: new Uint8Array(),
  parseError: null,
  createdAtMs,
})

/**
 * Build one captured event row for range-selection tests.
 */
const buildEvent = (
  timestampUs: bigint,
  createdAtMs: number,
  wallClockUs: bigint | null = null,
): LoggedCapturedMessage => ({
  ...buildMessage(timestampUs, timestampUs, createdAtMs, wallClockUs),
  entryKind: 'event',
  eventType: 'mark',
  eventText: 'Mark',
})

describe('timestrip range selection', () => {
  it('includes messages intersecting either inclusive boundary', () => {
    const endsAtStart = buildMessage(5n, 10n, 1)
    const startsAtEnd = buildMessage(20n, 25n, 2)
    const before = buildMessage(1n, 9n, 3)
    const after = buildMessage(21n, 30n, 4)

    expect(buildCapturedRangeSelectionKeys(
      [endsAtStart, startsAtEnd, before, after],
      10n,
      20n,
      false,
    )).toEqual([
      buildCapturedLogSelectionKey(endsAtStart),
      buildCapturedLogSelectionKey(startsAtEnd),
    ])
  })

  it('includes events only when their timestamp falls inside the range', () => {
    const atStart = buildEvent(10n, 1)
    const inside = buildEvent(15n, 2)
    const atEnd = buildEvent(20n, 3)
    const outside = buildEvent(21n, 4)

    expect(buildCapturedRangeSelectionKeys(
      [atStart, inside, atEnd, outside],
      10n,
      20n,
      false,
    )).toEqual([
      buildCapturedLogSelectionKey(atStart),
      buildCapturedLogSelectionKey(inside),
      buildCapturedLogSelectionKey(atEnd),
    ])
  })

  it('uses wall-clock time and message duration when wall-clock basis is active', () => {
    const row = buildMessage(100n, 110n, 1, 1_000n)

    expect(doesCapturedRowIntersectRange(row, 1_010n, 1_020n, true)).toBe(true)
    expect(doesCapturedRowIntersectRange(row, 1_011n, 1_020n, true)).toBe(false)
    expect(doesCapturedRowIntersectRange(
      buildMessage(100n, 110n, 2, null),
      100n,
      110n,
      true,
    )).toBe(false)
  })
})
