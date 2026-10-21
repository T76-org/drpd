/**
 * Session-scoped Cable Test IDENTITY cache. Survives mode changes in the same
 * tab until USB disconnect, ATTACHED→UNATTACHED, or an explicit clear/overwrite.
 */
import type { CableTestResult } from '../../lib/device'

/** Serializable IDENTITY snapshot stored in sessionStorage. */
export interface CableTestCacheEntry {
  generation: number
  outcome: 'IDENTITY'
  vconnContact: 1 | 2
  goodCRC: boolean
  revision: 1 | 2
  bodyHex: string
}

/** Build the sessionStorage key for one rack device record. */
export const cableTestCacheKey = (deviceRecordId: string): string =>
  `drpd:cable-test:${deviceRecordId}`

/** Encode a Cable Test result body as lowercase hex. */
const bodyToHex = (body: Uint8Array): string =>
  Array.from(body, (byte) => byte.toString(16).padStart(2, '0')).join('')

/** Decode a hex body string into bytes. */
const hexToBody = (bodyHex: string): Uint8Array =>
  Uint8Array.from(bodyHex.match(/../g) ?? [], (hex) => Number.parseInt(hex, 16))

/** Convert a live IDENTITY result into a cache entry. */
export const toCableTestCacheEntry = (result: CableTestResult): CableTestCacheEntry | null => {
  if (result.outcome !== 'IDENTITY' || (result.vconnContact !== 1 && result.vconnContact !== 2)) {
    return null
  }
  return {
    generation: result.generation,
    outcome: 'IDENTITY',
    vconnContact: result.vconnContact,
    goodCRC: result.goodCRC,
    revision: result.revision,
    bodyHex: bodyToHex(result.body),
  }
}

/** Restore a CableTestResult from a cache entry. */
export const fromCableTestCacheEntry = (entry: CableTestCacheEntry): CableTestResult => ({
  generation: entry.generation,
  outcome: entry.outcome,
  vconnContact: entry.vconnContact,
  goodCRC: entry.goodCRC,
  revision: entry.revision,
  body: hexToBody(entry.bodyHex),
})

/** Read a cached IDENTITY result for a device, or null when absent/invalid. */
export const readCableTestCache = (deviceRecordId: string): CableTestResult | null => {
  try {
    const raw = sessionStorage.getItem(cableTestCacheKey(deviceRecordId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CableTestCacheEntry>
    if (
      parsed.outcome !== 'IDENTITY' ||
      typeof parsed.generation !== 'number' ||
      (parsed.vconnContact !== 1 && parsed.vconnContact !== 2) ||
      typeof parsed.goodCRC !== 'boolean' ||
      (parsed.revision !== 1 && parsed.revision !== 2) ||
      typeof parsed.bodyHex !== 'string' ||
      !/^(?:[0-9a-fA-F]{2})+$/.test(parsed.bodyHex) ||
      parsed.bodyHex.length < 40 ||
      parsed.bodyHex.length % 8 !== 0
    ) {
      return null
    }
    return fromCableTestCacheEntry(parsed as CableTestCacheEntry)
  } catch {
    return null
  }
}

/** Persist an IDENTITY result; ignore non-IDENTITY snapshots. */
export const writeCableTestCache = (deviceRecordId: string, result: CableTestResult): boolean => {
  const entry = toCableTestCacheEntry(result)
  if (!entry) return false
  sessionStorage.setItem(cableTestCacheKey(deviceRecordId), JSON.stringify(entry))
  return true
}

/** Remove the cached Cable Test result for a device. */
export const clearCableTestCache = (deviceRecordId: string): void => {
  sessionStorage.removeItem(cableTestCacheKey(deviceRecordId))
}
