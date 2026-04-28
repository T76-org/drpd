import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRackDocument, saveRackDocument } from './loadRack'

const createStorage = (): Storage => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length
    },
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('loadRackDocument', () => {
  it('creates a populated default rack without writing layout to storage', async () => {
    const document = await loadRackDocument()

    expect(document.racks[0]?.rows).toHaveLength(3)
    expect(document.racks[0]?.rows[0]?.flex).toBe(0.22)
    expect(document.racks[0]?.rows[0]?.instruments.map((instrument) => instrument.instrumentIdentifier)).toEqual([
      'com.mta.drpd.vbus',
      'com.mta.drpd.charge-energy',
      'com.mta.drpd.cc-lines',
      'com.mta.drpd.device-status-panel',
      'com.mta.drpd.sink-control',
    ])
    expect(document.racks[0]?.rows[1]?.instruments).toEqual([
      expect.objectContaining({
        instrumentIdentifier: 'com.mta.drpd.timestrip',
        flex: 100,
      }),
    ])
    expect(document.racks[0]?.rows[2]?.instruments).toEqual([
      expect.objectContaining({
        instrumentIdentifier: 'com.mta.drpd.usbpd-log',
        flex: 2.4,
      }),
      expect.objectContaining({
        instrumentIdentifier: 'com.mta.drpd.message-detail',
        flex: 1,
      }),
    ])
    expect(window.localStorage.getItem('drpd:rack:document')).toBeNull()
  })

  it('migrates legacy rack-scoped devices and instrument bindings into global paired devices', async () => {
    window.localStorage.setItem('drpd:rack:document', JSON.stringify({
      racks: [
        {
          id: 'rack-a',
          name: 'Rack A',
          totalUnits: 8,
          devices: [
            {
              id: 'device-1',
              identifier: 'com.mta.drpd',
              displayName: 'Dr. PD',
              vendorId: 0x2e8a,
              productId: 0x000a,
              serialNumber: 'DRPD-TEST-001',
              productName: 'Dr. PD',
            },
          ],
          rows: [
            {
              id: 'row-1',
              instruments: [
                {
                  id: 'inst-1',
                  instrumentIdentifier: 'com.mta.drpd.device-status-panel',
                  deviceRecordId: 'device-1',
                },
              ],
            },
          ],
        },
      ],
    }))

    const document = await loadRackDocument()

    expect(document.pairedDevices).toEqual([
      expect.objectContaining({
        id: 'device-1',
        identifier: 'com.mta.drpd',
        serialNumber: 'DRPD-TEST-001',
      }),
    ])
    expect(document.racks[0]).not.toHaveProperty('devices')
    expect(document.racks[0]?.rows[0]?.instruments[0]).not.toHaveProperty('deviceRecordId')
    const stored = JSON.parse(window.localStorage.getItem('drpd:rack:document') ?? '{}')
    expect(stored.racks).toBeUndefined()
    expect(stored.rackSizing).toBeDefined()
  })

  it('applies persisted sizing to the current default rack layout', async () => {
    saveRackDocument({
      pairedDevices: [],
      racks: [
        {
          id: 'bench-rack-a',
          name: 'Bench Rack A',
          totalUnits: 9,
          rows: [
            {
              id: 'row-default-trigger',
              flex: 0.42,
              instruments: [
                {
                  id: 'inst-default-timestrip',
                  instrumentIdentifier: 'com.mta.drpd.timestrip',
                  flex: 77,
                  resizable: {
                    minHeight: '180px',
                  },
                },
              ],
            },
            {
              id: 'row-log-from-old-layout',
              flex: 0.01,
              instruments: [
                {
                  id: 'inst-log-from-old-layout',
                  instrumentIdentifier: 'com.mta.drpd.usbpd-log',
                  flex: 99,
                },
              ],
            },
          ],
        },
      ],
    } as never)

    const document = await loadRackDocument()

    expect(document.racks[0]?.rows.map((row) => row.id)).toEqual([
      'row-default-status',
      'row-default-trigger',
      'row-default-log',
    ])
    expect(document.racks[0]?.rows[1]).toEqual(
      expect.objectContaining({
        flex: 0.42,
        instruments: [
          expect.objectContaining({
            id: 'inst-default-timestrip',
            instrumentIdentifier: 'com.mta.drpd.timestrip',
            flex: 77,
          }),
        ],
      }),
    )
    expect(document.racks[0]?.rows[1]?.instruments[0]).not.toHaveProperty('resizable')
    expect(document.racks[0]?.rows[2]?.flex).toBe(1)
    expect(document.racks[0]?.rows[2]?.instruments[0]?.flex).toBe(2.4)
  })

  it('stores only paired devices and flex sizing settings', async () => {
    saveRackDocument({
      pairedDevices: [
        {
          id: 'device-1',
          identifier: 'com.mta.drpd',
          displayName: 'Dr. PD',
          vendorId: 0x2e8a,
          productId: 0x000a,
        },
      ],
      racks: [
        {
          id: 'bench-rack-a',
          name: 'Bench Rack A',
          totalUnits: 9,
          rows: [
            {
              id: 'row-default-trigger',
              flex: 0.4,
              instruments: [
                {
                  id: 'inst-default-timestrip',
                  instrumentIdentifier: 'com.mta.drpd.timestrip',
                  flex: 80,
                  resizable: {
                    minHeight: '180px',
                  },
                },
              ],
            },
          ],
        },
      ],
    })

    const stored = JSON.parse(window.localStorage.getItem('drpd:rack:document') ?? '{}')

    expect(stored.racks).toBeUndefined()
    expect(stored.pairedDevices).toEqual([
      expect.objectContaining({ id: 'device-1' }),
    ])
    expect(stored.rackSizing.racks[0].rows[0]).toEqual({
      id: 'row-default-trigger',
      flex: 0.4,
      instruments: [
        {
          id: 'inst-default-timestrip',
          flex: 80,
        },
      ],
    })
  })
})
