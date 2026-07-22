import { describe, expect, it, vi } from 'vitest'
import {
  resolveFirstLogSelectionIndex,
  resolveLogSelectionKeyIndex,
} from './DrpdUsbPdLogInstrumentView'

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

  it('finds a selected key after device timestamps restart', async () => {
    const keys = [
      'message:900:910:1',
      'message:1000:1010:2',
      'event:25:3:mark',
      'message:40:50:4',
    ]
    const resolveKeys = vi.fn(async (startIndex: number, endIndex: number) =>
      keys.slice(startIndex, endIndex + 1))

    await expect(resolveLogSelectionKeyIndex(keys[2], keys.length, resolveKeys))
      .resolves.toBe(2)
  })

  it('reveals the first selected row in displayed log order', async () => {
    const keys = [
      'message:900:910:1',
      'event:25:2:mark',
      'message:40:50:3',
      'message:1000:1010:4',
    ]
    const resolveKeys = vi.fn(async (startIndex: number, endIndex: number) =>
      keys.slice(startIndex, endIndex + 1))

    await expect(resolveFirstLogSelectionIndex(
      [keys[3], keys[1]],
      keys.length,
      resolveKeys,
    )).resolves.toBe(1)
  })
})
