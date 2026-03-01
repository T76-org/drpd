import { describe, expect, it } from 'vitest'
import { SQLiteWasmStore } from '../logging'

describe('DRPD logging scale', () => {
  it('handles 1,000,000 inserts while enforcing bounded retention', async () => {
    const maxRetained = 10_000
    const store = new SQLiteWasmStore({
      maxAnalogSamples: maxRetained,
      maxCapturedMessages: maxRetained,
      retentionTrimBatchSize: 2_000,
    })
    await store.init()

    for (let index = 0; index < 1_000_000; index += 1) {
      await store.insertAnalogSample({
        timestampUs: BigInt(index),
        displayTimestampUs: BigInt(index),
        vbusV: 5 + (index % 100) * 0.001,
        ibusA: 1 + (index % 100) * 0.0001,
        role: 'SINK',
        createdAtMs: index,
      })
    }

    const started = Date.now()
    const result = await store.queryAnalogSamples({
      startTimestampUs: 0n,
      endTimestampUs: 1_000_000n,
    })
    const elapsedMs = Date.now() - started

    expect(result.length).toBe(maxRetained)
    expect(result[0].timestampUs).toBe(990_000n)
    expect(result[result.length - 1].timestampUs).toBe(999_999n)
    expect(elapsedMs).toBeLessThan(2_500)
  })
})
