import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalogMonitorChannels } from '../../../lib/device'
import { DRPDDevice } from '../../../lib/device'
import type { DRPDTransport } from '../../../lib/device/drpd/transport'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdVbusInstrumentView } from './DrpdVbusInstrumentView'

/**
 * Minimal DRPD transport stub for tests.
 */
class TestTransport implements DRPDTransport {
  /**
   * Stub SCPI send method.
   */
  public async sendCommand(): Promise<void> {
    return undefined
  }

  /**
   * Stub SCPI text query.
   *
   * @returns Empty response list.
   */
  public async queryText(): Promise<string[]> {
    return []
  }

  /**
   * Stub SCPI binary query.
   *
   * @returns Empty payload.
   */
  public async queryBinary(): Promise<Uint8Array> {
    return new Uint8Array()
  }
}

/**
 * Testable DRPD device with mutable state.
 */
class TestDRPDDevice extends DRPDDevice {
  /**
   * Update the analog monitor state for tests.
   *
   * @param analogMonitor - Analog monitor snapshot.
   */
  public setAnalogMonitor(analogMonitor: AnalogMonitorChannels | null): void {
    this.state = { ...this.state, analogMonitor }
  }
}

/**
 * Build a minimal rack instrument definition.
 *
 * @returns Rack instrument.
 */
const buildInstrument = (): RackInstrument => ({
  id: 'inst-1',
  instrumentIdentifier: 'com.mta.drpd.vbus'
})

/**
 * Build a minimal rack device record.
 *
 * @returns Rack device record.
 */
const buildDeviceRecord = (): RackDeviceRecord => ({
  id: 'device-1',
  identifier: 'com.mta.drpd',
  displayName: 'Dr. PD',
  vendorId: 0x2e8a,
  productId: 0x000a
})

const AH_STORAGE_KEY = 'drpd:vbus:ah:instrument:inst-1'

const createStorage = (): Storage => {
  const store = new Map<string, string>()
  return {
    clear: () => {
      store.clear()
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    get length() {
      return store.size
    }
  }
}

describe('DrpdVbusInstrumentView', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('renders derived power from voltage and current', () => {
    window.localStorage.setItem(AH_STORAGE_KEY, '0')
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setAnalogMonitor({
      captureTimestampUs: 1000n,
      vbus: 12.34,
      ibus: 1.5,
      dutCc1: 0,
      dutCc2: 0,
      usdsCc1: 0,
      usdsCc2: 0,
      adcVref: 0,
      groundRef: 0,
      currentVref: 0
    })

    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver
    }

    render(
      <DrpdVbusInstrumentView
        instrument={buildInstrument()}
        displayName="VBUS"
        deviceState={deviceState}
        isEditMode={false}
      />
    )

    expect(screen.queryByText('POWER')).toBeNull()
    expect(screen.queryByText('Role')).toBeNull()
    expect(screen.queryByText('Capture')).toBeNull()
    expect(screen.queryByText('Status')).toBeNull()
    expect(screen.queryByText('DUT')).toBeNull()
    expect(screen.queryByText('US/DS')).toBeNull()
    const powerValue = screen.getByText('18.51')
    const powerBlock = powerValue.closest('div')
    expect(powerBlock).not.toBeNull()
    expect(powerBlock).toHaveTextContent('W')
    const ahValue = screen.getByText('0.00')
    const ahBlock = ahValue.closest('div')
    expect(ahBlock).not.toBeNull()
    expect(ahBlock).toHaveTextContent('Ah')
  })

  it('accumulates and persists Ah from sampled current over time', async () => {
    window.localStorage.setItem(AH_STORAGE_KEY, '0')
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setAnalogMonitor({
      captureTimestampUs: 0n,
      vbus: 5,
      ibus: 2,
      dutCc1: 0,
      dutCc2: 0,
      usdsCc1: 0,
      usdsCc2: 0,
      adcVref: 0,
      groundRef: 0,
      currentVref: 0
    })
    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver
    }

    render(
      <DrpdVbusInstrumentView
        instrument={buildInstrument()}
        displayName="VBUS"
        deviceState={deviceState}
        isEditMode={false}
      />
    )

    act(() => {
      driver.setAnalogMonitor({
        captureTimestampUs: 1_800_000_000n,
        vbus: 5,
        ibus: 2,
        dutCc1: 0,
        dutCc2: 0,
        usdsCc1: 0,
        usdsCc2: 0,
        adcVref: 0,
        groundRef: 0,
        currentVref: 0
      })
      driver.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { changed: ['analogMonitor'] }
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByText('1.00')).toBeInTheDocument()
    })
    expect(window.localStorage.getItem(AH_STORAGE_KEY)).toBe('1')
  })

  it('loads persisted Ah value on mount', () => {
    window.localStorage.setItem(AH_STORAGE_KEY, '12.5')
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setAnalogMonitor({
      captureTimestampUs: 10n,
      vbus: 9,
      ibus: 0.5,
      dutCc1: 0,
      dutCc2: 0,
      usdsCc1: 0,
      usdsCc2: 0,
      adcVref: 0,
      groundRef: 0,
      currentVref: 0
    })

    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver
    }

    render(
      <DrpdVbusInstrumentView
        instrument={buildInstrument()}
        displayName="VBUS"
        deviceState={deviceState}
        isEditMode={false}
      />
    )

    const ahValue = screen.getByText('12.50')
    const ahBlock = ahValue.closest('div')
    expect(ahBlock).not.toBeNull()
    expect(ahBlock).toHaveTextContent('Ah')
  })
})
