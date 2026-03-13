import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AnalogMonitorChannels } from '../../../lib/device'
import { DRPDDevice } from '../../../lib/device'
import type { DRPDTransport } from '../../../lib/device/drpd/transport'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdAccumulatorInstrumentView } from './DrpdAccumulatorInstrumentView'

class TestTransport implements DRPDTransport {
  public readonly commands: Array<{ command: string; params: unknown[] }> = []

  public async sendCommand(command: string, ...params: unknown[]): Promise<void> {
    this.commands.push({ command, params })
  }

  public async queryText(): Promise<string[]> {
    return []
  }

  public async queryBinary(): Promise<Uint8Array> {
    return new Uint8Array()
  }
}

class TestDRPDDevice extends DRPDDevice {
  public setAnalogMonitor(analogMonitor: AnalogMonitorChannels | null): void {
    this.state = { ...this.state, analogMonitor }
  }
}

const buildInstrument = (): RackInstrument => ({
  id: 'inst-charge-energy',
  instrumentIdentifier: 'com.mta.drpd.charge-energy'
})

const buildDeviceRecord = (): RackDeviceRecord => ({
  id: 'device-1',
  identifier: 'com.mta.drpd',
  displayName: 'Dr. PD',
  vendorId: 0x2e8a,
  productId: 0x000a
})

const buildAnalogMonitor = (
  overrides: Partial<AnalogMonitorChannels> = {},
): AnalogMonitorChannels => ({
  captureTimestampUs: 100n,
  vbus: 12,
  ibus: 1,
  dutCc1: 0,
  dutCc2: 0,
  usdsCc1: 0,
  usdsCc2: 0,
  adcVref: 0,
  groundRef: 0,
  currentVref: 0,
  accumulationElapsedTimeUs: 90_000_000n,
  accumulatedChargeMah: 3500,
  accumulatedEnergyMwh: 28_000,
  ...overrides
})

describe('DrpdAccumulatorInstrumentView', () => {
  it('displays accumulated values from analog monitor updates', async () => {
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setAnalogMonitor(
      buildAnalogMonitor({
        accumulationElapsedTimeUs: 30_000_000n,
        accumulatedChargeMah: 1000,
        accumulatedEnergyMwh: 5000
      }),
    )

    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver
    }

    render(
      <DrpdAccumulatorInstrumentView
        instrument={buildInstrument()}
        displayName="Accumulator"
        deviceState={deviceState}
        isEditMode={false}
      />
    )

    expect(screen.getByTestId('charge-energy-charge')).toHaveTextContent('1.00 Ah')
    expect(screen.getByTestId('charge-energy-energy')).toHaveTextContent('5.00 Wh')
    expect(screen.getByTestId('charge-energy-elapsed')).toHaveTextContent('00:00:30')

    act(() => {
      driver.setAnalogMonitor(
        buildAnalogMonitor({
          accumulationElapsedTimeUs: 95_000_000n,
          accumulatedChargeMah: 4200,
          accumulatedEnergyMwh: 50_500
        }),
      )
      driver.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { changed: ['analogMonitor'] }
        }),
      )
    })

    expect(screen.getByTestId('charge-energy-charge')).toHaveTextContent('4.20 Ah')
    expect(screen.getByTestId('charge-energy-energy')).toHaveTextContent('50.50 Wh')
    expect(screen.getByTestId('charge-energy-elapsed')).toHaveTextContent('00:01:35')
  })

  it('resets counters through the driver', async () => {
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    const refreshStateSpy = vi.spyOn(driver, 'refreshState').mockResolvedValue(undefined)
    driver.setAnalogMonitor(buildAnalogMonitor())

    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver
    }

    render(
      <DrpdAccumulatorInstrumentView
        instrument={buildInstrument()}
        displayName="Accumulator"
        deviceState={deviceState}
        isEditMode={false}
      />
    )

    act(() => {
      screen.getByRole('button', { name: 'RESET' }).click()
    })

    await waitFor(() => {
      expect(transport.commands).toContainEqual({
        command: 'MEAS:ACC:RESET',
        params: []
      })
    })
    expect(refreshStateSpy).toHaveBeenCalledTimes(1)
  })
})
