import { describe, expect, it, vi } from 'vitest'
import { resolveLogSelectionKeyIndex } from './DrpdUsbPdLogInstrumentView'

describe('resolveLogSelectionKeyIndex', () => {
  it('finds a selected key without loading the full log', async () => {
    const keys = Array.from({ length: 10_000 }, (_, index) =>
      `message:${index * 10}:${index * 10 + 5}:${1_700_000_000_000 + index}`)
    const resolveKeys = vi.fn(async (startIndex: number, endIndex: number) =>
      keys.slice(startIndex, endIndex + 1))

    await expect(resolveLogSelectionKeyIndex(keys[8_765], keys.length, resolveKeys))
      .resolves.toBe(8_765)
    expect(resolveKeys.mock.calls.length).toBeLessThan(20)
  })

  it('scans equal-timestamp rows until the exact event key is found', async () => {
    const keys = [
      'message:100:105:1',
      'event:200:2:mark',
      'event:200:3:cc_status_changed',
      'message:200:205:4',
      'message:300:305:5',
    ]
    const resolveKeys = async (startIndex: number, endIndex: number) =>
      keys.slice(startIndex, endIndex + 1)

    await expect(resolveLogSelectionKeyIndex(keys[2], keys.length, resolveKeys))
      .resolves.toBe(2)
    await expect(resolveLogSelectionKeyIndex('event:200:99:mark', keys.length, resolveKeys))
      .resolves.toBeNull()
  })
})
