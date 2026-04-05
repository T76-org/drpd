import type { RackDefinition, RackDeviceRecord, RackDocument, RackInstrument, RackRow } from './types'

const RACK_STORAGE_KEY = 'drpd:rack:document'

/**
 * Build a default rack document when none is stored.
 *
 * @returns Default rack document.
 */
const buildDefaultRackDocument = (): RackDocument => {
  return {
    pairedDevices: [],
    racks: [
      {
        id: 'bench-rack-a',
        name: 'Bench Rack A',
        hideHeader: false,
        totalUnits: 9,
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
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object' || !Array.isArray((data as RackDocument).racks)) {
      throw new Error('Invalid rack document payload')
    }
    const migrated = migrateRackDocument(data as RackDocument)
    storage.setItem(RACK_STORAGE_KEY, JSON.stringify(migrated))
    return migrated
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

const migrateRackDocument = (document: RackDocument): RackDocument => {
  const pairedDevices = new Map<string, RackDeviceRecord>()
  for (const device of Array.isArray(document.pairedDevices) ? document.pairedDevices : []) {
    pairedDevices.set(device.id, migrateRackDeviceRecord(device))
  }

  const racks = document.racks.map((rack) => {
    for (const device of getLegacyRackDevices(rack)) {
      pairedDevices.set(device.id, migrateRackDeviceRecord(device))
    }
    return migrateRackDefinition(rack)
  })

  return {
    racks,
    pairedDevices: Array.from(pairedDevices.values()),
  }
}

const migrateRackDefinition = (rack: RackDefinition): RackDefinition => ({
  id: rack.id,
  name: rack.name,
  hideHeader: rack.hideHeader,
  totalUnits: rack.totalUnits,
  rows: rack.rows.map(migrateRackRow),
})

const migrateRackRow = (row: RackRow): RackRow => ({
  id: row.id,
  instruments: row.instruments.map(migrateRackInstrument),
})

const migrateRackInstrument = (instrument: RackInstrument): RackInstrument => ({
  id: instrument.id,
  instrumentIdentifier: instrument.instrumentIdentifier,
  fullScreen: instrument.fullScreen,
  resizable: instrument.resizable,
  config: instrument.config,
})

const migrateRackDeviceRecord = (device: RackDeviceRecord): RackDeviceRecord => ({
  ...device,
  lastConnectedAtMs:
    typeof device.lastConnectedAtMs === 'number' && Number.isFinite(device.lastConnectedAtMs)
      ? device.lastConnectedAtMs
      : undefined,
})

const getLegacyRackDevices = (rack: RackDefinition): RackDeviceRecord[] => {
  const probe = rack as RackDefinition & { devices?: RackDeviceRecord[] }
  return Array.isArray(probe.devices) ? probe.devices : []
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
