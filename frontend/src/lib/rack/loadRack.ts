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
        rows: [
          {
            id: 'row-default-status',
            flex: 0.22,
            instruments: [
              buildDefaultInstrument('inst-default-vbus', 'com.mta.drpd.vbus', 10),
              buildDefaultInstrument('inst-default-accumulator', 'com.mta.drpd.charge-energy', 7),
              buildDefaultInstrument('inst-default-cc-lines', 'com.mta.drpd.cc-lines', 7),
              buildDefaultInstrument('inst-default-device-status', 'com.mta.drpd.device-status-panel', 10),
              buildDefaultInstrument('inst-default-sink', 'com.mta.drpd.sink-control', 15),
            ],
          },
          {
            id: 'row-default-trigger',
            flex: 0.3,
            instruments: [
              buildDefaultInstrument('inst-default-timestrip', 'com.mta.drpd.timestrip', 100),
            ],
          },
          {
            id: 'row-default-log',
            flex: 1,
            instruments: [
              buildDefaultInstrument('inst-default-log', 'com.mta.drpd.usbpd-log', 2.4),
              buildDefaultInstrument('inst-default-detail', 'com.mta.drpd.message-detail', 1),
            ],
          },
        ]
      }
    ]
  }
}

const buildDefaultInstrument = (
  id: string,
  instrumentIdentifier: string,
  flex: number,
): RackInstrument => ({
  id,
  instrumentIdentifier,
  flex,
})

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
  rows: getMigratedRackRows(rack),
})

const getMigratedRackRows = (rack: RackDefinition): RackRow[] => {
  if (!Array.isArray(rack.rows) || rack.rows.length === 0) {
    const defaultRack = buildDefaultRackDocument().racks[0]
    return defaultRack.rows.map(migrateRackRow)
  }
  return rack.rows.map(migrateRackRow)
}

const migrateRackRow = (row: RackRow): RackRow => ({
  id: row.id,
  flex: sanitizePositiveNumber(row.flex) ?? inferRackRowFlex(row),
  instruments: row.instruments.map(migrateRackInstrument),
})

const migrateRackInstrument = (instrument: RackInstrument): RackInstrument => ({
  id: instrument.id,
  instrumentIdentifier: instrument.instrumentIdentifier,
  fullScreen: instrument.fullScreen,
  resizable: instrument.resizable,
  flex: sanitizePositiveNumber(instrument.flex) ?? inferRackInstrumentFlex(instrument.instrumentIdentifier),
  config: instrument.config,
})

const sanitizePositiveNumber = (value: number | undefined): number | undefined => {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

const inferRackRowFlex = (row: RackRow): number => {
  const instrumentIdentifiers = new Set(row.instruments.map((instrument) => instrument.instrumentIdentifier))
  if (
    instrumentIdentifiers.has('com.mta.drpd.usbpd-log') ||
    instrumentIdentifiers.has('com.mta.drpd.message-detail')
  ) {
    return 1
  }
  if (instrumentIdentifiers.has('com.mta.drpd.timestrip')) {
    return 0.3
  }
  return 0.22
}

const inferRackInstrumentFlex = (instrumentIdentifier: string): number | undefined => {
  switch (instrumentIdentifier) {
    case 'com.mta.drpd.vbus':
      return 10
    case 'com.mta.drpd.charge-energy':
      return 7
    case 'com.mta.drpd.cc-lines':
      return 7
    case 'com.mta.drpd.device-status':
    case 'com.mta.drpd.device-status-panel':
      return 10
    case 'com.mta.drpd.sink-control':
      return 15
    case 'com.mta.drpd.trigger':
      return 18
    case 'com.mta.drpd.timestrip':
      return 100
    case 'com.mta.drpd.usbpd-log':
      return 2.4
    case 'com.mta.drpd.message-detail':
      return 1
    default:
      return undefined
  }
}

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
