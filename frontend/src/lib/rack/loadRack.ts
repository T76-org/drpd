import type { RackDocument } from './types'

const RACK_STORAGE_KEY = 'drpd:rack:document'

/**
 * Build a default rack document when none is stored.
 *
 * @returns Default rack document.
 */
const buildDefaultRackDocument = (): RackDocument => {
  return {
    racks: [
      {
        id: 'bench-rack-a',
        name: 'Bench Rack A',
        hideHeader: false,
        totalUnits: 9,
        devices: [],
        rows: []
      }
    ]
  }
}

/**
 * Load the rack document from the public rack JSON file.
 */
export const loadRackDocument = async (): Promise<RackDocument> => {
  const storage = getRackStorage()
  if (!storage) {
    return buildDefaultRackDocument()
  }
  const raw = storage.getItem(RACK_STORAGE_KEY)
  if (!raw) {
    const defaults = buildDefaultRackDocument()
    storage.setItem(RACK_STORAGE_KEY, JSON.stringify(defaults))
    return defaults
  }
  try {
    const data = JSON.parse(raw) as RackDocument
    if (!data || !Array.isArray(data.racks)) {
      throw new Error('Invalid rack document payload')
    }
    return data
  } catch {
    const defaults = buildDefaultRackDocument()
    storage.setItem(RACK_STORAGE_KEY, JSON.stringify(defaults))
    return defaults
  }
}

/**
 * Persist the rack document to localStorage.
 *
 * @param document - Rack document to store.
 */
export const saveRackDocument = (document: RackDocument): void => {
  const storage = getRackStorage()
  if (!storage) {
    return
  }
  storage.setItem(RACK_STORAGE_KEY, JSON.stringify(document))
}

/**
 * Resolve a safe localStorage instance when available.
 *
 * @returns Storage instance or null.
 */
const getRackStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }
  const storage = window.localStorage
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return null
  }
  return storage
}
