import { afterEach, describe, expect, it } from 'vitest'
import type { CableTestResult } from '../../lib/device'
import {
  clearCableTestCache,
  readCableTestCache,
  toCableTestCacheEntry,
  writeCableTestCache,
} from './cableTestCache'

const identity: CableTestResult = {
  generation: 7,
  outcome: 'IDENTITY',
  vconnContact: 2,
  goodCRC: true,
  revision: 2,
  body: Uint8Array.from('41A800FF0000601C000000000000000043260A00'.match(/../g)!, (hex) =>
    Number.parseInt(hex, 16),
  ),
}

afterEach(() => {
  sessionStorage.clear()
})

describe('cableTestCache', () => {
  it('round-trips an IDENTITY result through sessionStorage', () => {
    expect(writeCableTestCache('device-1', identity)).toBe(true)
    const restored = readCableTestCache('device-1')
    expect(restored).toEqual(identity)
    expect(restored?.body).toEqual(identity.body)
  })

  it('refuses to write non-IDENTITY outcomes', () => {
    expect(writeCableTestCache('device-1', { ...identity, outcome: 'WAITING', body: new Uint8Array() })).toBe(false)
    expect(readCableTestCache('device-1')).toBeNull()
    expect(toCableTestCacheEntry({ ...identity, outcome: 'NO_RESPONSE', body: new Uint8Array() })).toBeNull()
  })

  it('clears a stored entry', () => {
    writeCableTestCache('device-1', identity)
    clearCableTestCache('device-1')
    expect(readCableTestCache('device-1')).toBeNull()
  })

  it('returns null for corrupt sessionStorage values', () => {
    sessionStorage.setItem('drpd:cable-test:device-1', '{not-json')
    expect(readCableTestCache('device-1')).toBeNull()
    sessionStorage.setItem('drpd:cable-test:device-1', JSON.stringify({ outcome: 'WAITING' }))
    expect(readCableTestCache('device-1')).toBeNull()
  })
})
