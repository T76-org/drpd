import { describe, expect, it } from 'vitest'
import { SQLiteWasmStore } from '../logging'
import type { LoggedCapturedMessage } from '../logging'

/**
 * Build a synthetic captured message row.
 *
 * @param index - Row index.
 * @returns Captured message row.
 */
const buildMessage = (index: number): LoggedCapturedMessage => ({
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
  startTimestampUs: BigInt(1_000 + index),
  endTimestampUs: BigInt(1_010 + index),
  displayTimestampUs: BigInt(index),
  decodeResult: 0,
  sopKind: index % 2 === 0 ? 'SOP' : 'SOP_PRIME',
  messageKind: index % 2 === 0 ? 'CONTROL' : 'DATA',
  messageType: index % 5,
  messageId: index % 7,
  senderPowerRole: index % 2 === 0 ? 'SOURCE' : 'SINK',
  senderDataRole: index % 2 === 0 ? 'DFP' : 'UFP',
  pulseCount: 3,
  rawPulseWidths: Float64Array.from([1, 2, 3]),
  rawSop: Uint8Array.from([0x12, 0x34, 0x56, 0x78]),
  rawDecodedData: Uint8Array.from([0xaa, 0xbb]),
  parseError: null,
  createdAtMs: 1_700_000_000_000 + index,
})

/**
 * Build a synthetic significant-event row.
 *
 * @param index - Row index.
 * @returns Event row.
 */
const buildEvent = (index: number): LoggedCapturedMessage => ({
  entryKind: 'event',
  eventType: 'capture_changed',
  eventText: `Capture changed at ${index}`,
  eventWallClockMs: 1_700_000_100_000 + index,
  startTimestampUs: BigInt(1_500 + index),
  endTimestampUs: BigInt(1_500 + index),
  displayTimestampUs: null,
  decodeResult: 0,
  sopKind: null,
  messageKind: null,
  messageType: null,
  messageId: null,
  senderPowerRole: null,
  senderDataRole: null,
  pulseCount: 0,
  rawPulseWidths: new Float64Array(),
  rawSop: new Uint8Array(),
  rawDecodedData: new Uint8Array(),
  parseError: null,
  createdAtMs: 1_700_000_100_000 + index,
})

describe('SQLiteWasmStore', () => {
  it('enforces retention on analog and captured message tables', async () => {
    const store = new SQLiteWasmStore({
      maxAnalogSamples: 5,
      maxCapturedMessages: 3,
      retentionTrimBatchSize: 2,
    })
    await store.init()

    for (let index = 0; index < 10; index += 1) {
      await store.insertAnalogSample({
        timestampUs: BigInt(index),
        displayTimestampUs: BigInt(index),
        vbusV: 5 + index * 0.01,
        ibusA: 0.5 + index * 0.001,
        role: 'SINK',
        createdAtMs: index,
      })
    }
    for (let index = 0; index < 9; index += 1) {
      await store.insertCapturedMessage(buildMessage(index))
    }

    const analog = await store.queryAnalogSamples({
      startTimestampUs: 0n,
      endTimestampUs: 100n,
    })
    const messages = await store.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
    })
    expect(analog.map((row) => row.timestampUs)).toEqual([6n, 7n, 8n, 9n])
    expect(messages.map((row) => row.startTimestampUs)).toEqual([1006n, 1007n, 1008n])
  })

  it('filters captured message queries by kind and roles', async () => {
    const store = new SQLiteWasmStore()
    await store.init()

    for (let index = 0; index < 6; index += 1) {
      await store.insertCapturedMessage(buildMessage(index))
    }

    const filtered = await store.queryCapturedMessages({
      startTimestampUs: 1_000n,
      endTimestampUs: 2_000n,
      messageKinds: ['CONTROL'],
      senderPowerRoles: ['SOURCE'],
      senderDataRoles: ['DFP'],
      sopKinds: ['SOP'],
    })

    expect(filtered.length).toBe(3)
    expect(filtered.every((row) => row.messageKind === 'CONTROL')).toBe(true)
    expect(filtered.every((row) => row.senderPowerRole === 'SOURCE')).toBe(true)
    expect(filtered.every((row) => row.senderDataRole === 'DFP')).toBe(true)
    expect(filtered.every((row) => row.sopKind === 'SOP')).toBe(true)
  })

  it('supports captured message sort and pagination windows', async () => {
    const store = new SQLiteWasmStore()
    await store.init()

    for (let index = 0; index < 10; index += 1) {
      await store.insertCapturedMessage(buildMessage(index))
    }

    const ascWindow = await store.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
      sortOrder: 'asc',
      offset: 3,
      limit: 4,
    })
    expect(ascWindow.map((row) => row.startTimestampUs)).toEqual([
      1003n,
      1004n,
      1005n,
      1006n,
    ])

    const descWindow = await store.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
      sortOrder: 'desc',
      offset: 2,
      limit: 3,
    })
    expect(descWindow.map((row) => row.startTimestampUs)).toEqual([
      1007n,
      1006n,
      1005n,
    ])
  })

  it('stores and exports mixed message and event rows in one stream', async () => {
    const store = new SQLiteWasmStore()
    await store.init()

    await store.insertCapturedMessage(buildMessage(1))
    await store.insertCapturedMessage(buildEvent(2))

    const rows = await store.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: 10_000n,
      sortOrder: 'asc',
    })
    expect(rows.map((row) => row.entryKind)).toEqual(['message', 'event'])

    const exportData = await store.exportData({
      format: 'csv',
      includeAnalog: false,
      includeMessages: true,
    })
    expect(exportData.payload).toContain('entry_kind,event_type,event_text,event_wall_clock_ms')
    expect(exportData.payload).toContain('event,capture_changed')
  })

  it('returns a bounded time-strip render window with wall-clock anchors', async () => {
    const store = new SQLiteWasmStore()
    await store.init()

    for (let index = 0; index < 20; index += 1) {
      await store.insertAnalogSample({
        timestampUs: BigInt(index * 100),
        displayTimestampUs: BigInt(index * 100),
        vbusV: 5 + index,
        ibusA: 0.1 * index,
        role: 'SOURCE',
        createdAtMs: 1_700_000_000_000 + index * 10,
      })
    }
    await store.insertCapturedMessage(buildMessage(4))
    await store.insertCapturedMessage(buildEvent(5))

    const window = await store.queryMessageLogTimeStripWindow({
      windowStartUs: 900n,
      windowDurationUs: 400n,
      analogPointBudget: 5,
    })

    expect(window.analogPoints.length).toBeLessThanOrEqual(5)
    expect(Array.isArray(window.timeAnchors)).toBe(true)
    expect(window.windowEndUs).toBe(window.windowStartUs + window.windowDurationUs)
  })

  it('uses message boundaries for time-strip scrolling when analog extends beyond the message range', async () => {
    const store = new SQLiteWasmStore()
    await store.init()

    await store.insertAnalogSample({
      timestampUs: 10n,
      displayTimestampUs: 10n,
      vbusV: 5,
      ibusA: 0.1,
      role: 'SOURCE',
      createdAtMs: 1,
    })
    await store.insertAnalogSample({
      timestampUs: 50_000n,
      displayTimestampUs: 50_000n,
      vbusV: 6,
      ibusA: 0.2,
      role: 'SOURCE',
      createdAtMs: 2,
    })
    await store.insertCapturedMessage({
      ...buildMessage(0),
      startTimestampUs: 1_000n,
      endTimestampUs: 1_250n,
      displayTimestampUs: 1_000n,
    })
    await store.insertCapturedMessage({
      ...buildMessage(1),
      startTimestampUs: 2_000n,
      endTimestampUs: 2_400n,
      displayTimestampUs: 2_000n,
    })

    const window = await store.queryMessageLogTimeStripWindow({
      windowStartUs: 0n,
      windowDurationUs: 200n,
      analogPointBudget: 10,
    })

    expect(window.earliestTimestampUs).toBe(1_000n)
    expect(window.latestTimestampUs).toBe(2_400n)
  })

  it('exports deterministic JSON and CSV payloads and clears scoped tables', async () => {
    const store = new SQLiteWasmStore()
    await store.init()

    await store.insertAnalogSample({
      timestampUs: 123n,
      displayTimestampUs: 3n,
      vbusV: 5.02,
      ibusA: 0.7,
      role: 'SOURCE',
      createdAtMs: 42,
    })
    await store.insertCapturedMessage(buildMessage(2))

    const jsonExport = await store.exportData({
      format: 'json',
      includeAnalog: true,
      includeMessages: true,
    })
    expect(jsonExport.mimeType).toBe('application/json')
    expect(jsonExport.analogCount).toBe(1)
    expect(jsonExport.messageCount).toBe(1)
    expect(jsonExport.payload).toContain('\"timestampUs\": \"123\"')
    expect(jsonExport.payload).toContain('\"rawSopHex\"')

    const csvExport = await store.exportData({
      format: 'csv',
      includeAnalog: true,
      includeMessages: true,
    })
    expect(csvExport.mimeType).toBe('text/csv')
    expect(csvExport.payload).toContain('analog_samples')
    expect(csvExport.payload).toContain('captured_messages')

    const analogClear = await store.clear('analog')
    expect(analogClear.analogDeleted).toBe(1)
    expect(analogClear.messagesDeleted).toBe(0)

    const allClear = await store.clear('all')
    expect(allClear.analogDeleted).toBe(0)
    expect(allClear.messagesDeleted).toBe(1)
  })
})
