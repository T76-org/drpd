import { describe, expect, it } from 'vitest'
import { readUint32LE } from './dataObjects'

describe('readUint32LE', () => {
  it('reads when exactly four bytes remain', () => {
    const payload = Uint8Array.from([0x01, 0x02, 0x03, 0x04])
    const value = readUint32LE(payload, 0)
    expect(value).toBe(0x04030201)
  })

  it('reads at the end of a larger payload', () => {
    const payload = Uint8Array.from([0x00, 0x00, 0xaa, 0xbb, 0xcc, 0xdd])
    const value = readUint32LE(payload, 2)
    expect(value).toBe(0xddccbbaa)
  })

  it('throws when fewer than four bytes remain', () => {
    const payload = Uint8Array.from([0x01, 0x02, 0x03, 0x04])
    expect(() => readUint32LE(payload, 1)).toThrow(
      'Cannot read uint32 at offset 1 from payload length 4',
    )
  })
})
