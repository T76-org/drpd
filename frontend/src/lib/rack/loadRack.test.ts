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
})
