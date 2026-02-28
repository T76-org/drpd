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
  startTimestampUs: BigInt(1_000 + index),
  endTimestampUs: BigInt(1_010 + index),
  decodeResult: 0,
  sopKind: index % 2 === 0 ? 'SOP' : 'SOP_PRIME',
  messageKind: index % 2 === 0 ? 'CONTROL' : 'DATA',
  messageType: index % 5,
  messageId: index % 7,
  senderPowerRole: index % 2 === 0 ? 'SOURCE' : 'SINK',
  senderDataRole: index % 2 === 0 ? 'DFP' : 'UFP',
  pulseCount: 3,
  rawPulseWidths: Uint16Array.from([1, 2, 3]),
  rawSop: Uint8Array.from([0x12, 0x34, 0x56, 0x78]),
  rawDecodedData: Uint8Array.from([0xaa, 0xbb]),
  parseError: null,
  createdAtMs: 1_700_000_000_000 + index,
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

  it('exports deterministic JSON and CSV payloads and clears scoped tables', async () => {
    const store = new SQLiteWasmStore()
    await store.init()

    await store.insertAnalogSample({
      timestampUs: 123n,
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
