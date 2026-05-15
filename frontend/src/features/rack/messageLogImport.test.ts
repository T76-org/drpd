import { describe, expect, it } from 'vitest'
import type { LoggedCapturedMessage } from '../../lib/device'
import { parseMessageLogImportJson, serializeMessageLogRow } from './messageLogImport'

const buildRow = (): LoggedCapturedMessage => ({
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
  wallClockUs: 1_700_000_000_000_000n,
  startTimestampUs: 1000n,
  endTimestampUs: 1005n,
  displayTimestampUs: 10n,
  decodeResult: 0,
  sopKind: 'SOP',
  messageKind: 'CONTROL',
  messageType: 3,
  messageId: 1,
  senderPowerRole: 'SOURCE',
  senderDataRole: 'DFP',
  pulseCount: 3,
  rawPulseWidths: Float64Array.from([1, 2, 3]),
  rawSop: Uint8Array.from([0x12, 0x34]),
  rawDecodedData: Uint8Array.from([0xaa, 0xbb]),
  parseError: null,
  createdAtMs: 1_700_000_000_000,
})

describe('parseMessageLogImportJson', () => {
  it('imports selected-array JSON rows', () => {
    const [row] = parseMessageLogImportJson(JSON.stringify([serializeMessageLogRow(buildRow())]))

    expect(row.startTimestampUs).toBe(1000n)
    expect(row.rawSop).toEqual(Uint8Array.from([0x12, 0x34]))
    expect(row.rawDecodedData).toEqual(Uint8Array.from([0xaa, 0xbb]))
    expect(Array.from(row.rawPulseWidths)).toEqual([1, 2, 3])
  })

  it('imports full export JSON rows', () => {
    const [row] = parseMessageLogImportJson(JSON.stringify({
      analogSamples: [],
      capturedMessages: [serializeMessageLogRow(buildRow())],
    }))

    expect(row.entryKind).toBe('message')
    expect(row.wallClockUs).toBe(1_700_000_000_000_000n)
  })

  it('imports legacy selected rows with typed-array objects', () => {
    const [row] = parseMessageLogImportJson(JSON.stringify([{
      ...serializeMessageLogRow(buildRow()),
      rawSopHex: undefined,
      rawDecodedDataHex: undefined,
      rawPulseWidths: { 0: 1, 1: 2, 2: 3 },
      rawSop: { 0: 0x12, 1: 0x34 },
      rawDecodedData: { 0: 0xaa, 1: 0xbb },
    }]))

    expect(Array.from(row.rawPulseWidths)).toEqual([1, 2, 3])
    expect(row.rawSop).toEqual(Uint8Array.from([0x12, 0x34]))
    expect(row.rawDecodedData).toEqual(Uint8Array.from([0xaa, 0xbb]))
  })

  it('rejects invalid JSON', () => {
    expect(() => parseMessageLogImportJson('{')).toThrow('valid JSON')
  })

  it('rejects missing required fields', () => {
    const row = serializeMessageLogRow(buildRow())
    delete row.startTimestampUs

    expect(() => parseMessageLogImportJson(JSON.stringify([row]))).toThrow('missing startTimestampUs')
  })

  it('rejects invalid hex data', () => {
    const row = {
      ...serializeMessageLogRow(buildRow()),
      rawSopHex: 'abc',
    }

    expect(() => parseMessageLogImportJson(JSON.stringify([row]))).toThrow('valid hexadecimal')
  })

  it('rejects empty imports', () => {
    expect(() => parseMessageLogImportJson(JSON.stringify({ capturedMessages: [] }))).toThrow(
      'does not contain any captured messages',
    )
  })
})
