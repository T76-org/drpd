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
  it('creates a populated default rack with persisted flex layout', async () => {
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
  })

  it('migrates legacy rack-scoped devices and instrument bindings into global paired devices', async () => {
    saveRackDocument({
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
    } as never)

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
  })

  it('infers flex weights when migrating a legacy pixel rack layout', async () => {
    saveRackDocument({
      pairedDevices: [],
      racks: [
        {
          id: 'rack-a',
          name: 'Rack A',
          totalUnits: 9,
          rows: [
            {
              id: 'row-timestrip',
              heightPx: 160,
              instruments: [
                {
                  id: 'inst-trigger',
                  instrumentIdentifier: 'com.mta.drpd.trigger',
                  widthPx: 360,
                  heightPx: 160,
                },
                {
                  id: 'inst-timestrip',
                  instrumentIdentifier: 'com.mta.drpd.timestrip',
                  widthPx: 720,
                  heightPx: 160,
                },
              ],
            },
            {
              id: 'row-log',
              heightPx: 500,
              instruments: [
                {
                  id: 'inst-log',
                  instrumentIdentifier: 'com.mta.drpd.usbpd-log',
                  widthPx: 620,
                  heightPx: 500,
                },
                {
                  id: 'inst-detail',
                  instrumentIdentifier: 'com.mta.drpd.message-detail',
                  widthPx: 460,
                  heightPx: 500,
                },
              ],
            },
          ],
        },
      ],
    } as never)

    const document = await loadRackDocument()

    expect(document.racks[0]?.rows[0]).toEqual(
      expect.objectContaining({
        flex: 0.3,
        instruments: [
          expect.objectContaining({ instrumentIdentifier: 'com.mta.drpd.trigger', flex: 18 }),
          expect.objectContaining({ instrumentIdentifier: 'com.mta.drpd.timestrip', flex: 100 }),
        ],
      }),
    )
    expect(document.racks[0]?.rows[1]).toEqual(
      expect.objectContaining({
        flex: 1,
        instruments: [
          expect.objectContaining({ instrumentIdentifier: 'com.mta.drpd.usbpd-log', flex: 2.4 }),
          expect.objectContaining({ instrumentIdentifier: 'com.mta.drpd.message-detail', flex: 1 }),
        ],
      }),
    )
  })
})
