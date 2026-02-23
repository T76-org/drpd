import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  CCBusRole,
  DRPDDevice,
  SinkState,
  type SinkInfo,
  type SinkPdo,
} from '../../../lib/device'
import type { DRPDTransport } from '../../../lib/device/drpd/transport'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdSinkControlInstrumentView } from './DrpdSinkControlInstrumentView'

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
 * Testable DRPD device with mutable sink state.
 */
class TestDRPDDevice extends DRPDDevice {
  /**
   * Set sink state fields directly for tests.
   *
   * @param role - Current role.
   * @param sinkInfo - Current sink information.
   * @param sinkPdoList - Available PDO list.
   */
  public setSinkSnapshot(
    role: CCBusRole | null,
    sinkInfo: SinkInfo | null,
    sinkPdoList: SinkPdo[] | null,
  ): void {
    this.state = {
      ...this.state,
      role,
      sinkInfo,
      sinkPdoList,
    }
  }
}

/**
 * Build a minimal rack instrument definition.
 *
 * @returns Rack instrument.
 */
const buildInstrument = (): RackInstrument => ({
  id: 'inst-sink',
  instrumentIdentifier: 'com.mta.drpd.sink-control'
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

/**
 * Build a connected rack device state.
 *
 * @param driver - Device driver.
 * @returns Rack device state.
 */
const buildDeviceState = (driver: DRPDDevice): RackDeviceState => ({
  record: buildDeviceRecord(),
  status: 'connected',
  drpdDriver: driver
})

describe('DrpdSinkControlInstrumentView', () => {
  it('renders sink state and negotiated PDO details', () => {
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setSinkSnapshot(
      CCBusRole.SINK,
      {
        status: SinkState.CONNECTED,
        negotiatedPdo: { type: 'FIXED', voltageV: 9, maxCurrentA: 3 },
        negotiatedVoltageMv: 9000,
        negotiatedCurrentMa: 2000,
        error: false
      },
      [{ type: 'FIXED', voltageV: 9, maxCurrentA: 3 }],
    )

    render(
      <DrpdSinkControlInstrumentView
        instrument={buildInstrument()}
        displayName="Sink Control"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    expect(screen.getByText(/state: connected/i)).toBeInTheDocument()
    expect(
      screen.getByText(/fixed 9\.00v \/ 3\.00a/i, { selector: 'div' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/18\.00 w/i)).toBeInTheDocument()
  })

  it('lists available PDOs in the selector', async () => {
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setSinkSnapshot(
      CCBusRole.SINK,
      null,
      [
        { type: 'FIXED', voltageV: 5, maxCurrentA: 3 },
        { type: 'BATTERY', minVoltageV: 9, maxVoltageV: 15, maxPowerW: 27 }
      ],
    )

    render(
      <DrpdSinkControlInstrumentView
        instrument={buildInstrument()}
        displayName="Sink Control"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    const select = screen.getByLabelText(/available pdos/i)
    expect(select).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: /#1 fixed 5\.00v \/ 3\.00a/i })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: /#2 battery 9\.00-15\.00v \/ 27\.00w/i })).toBeInTheDocument()
  })

  it('converts battery power request into voltage/current arguments', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setSinkSnapshot(
      CCBusRole.SINK,
      null,
      [
        { type: 'FIXED', voltageV: 5, maxCurrentA: 3 },
        { type: 'BATTERY', minVoltageV: 9, maxVoltageV: 15, maxPowerW: 27 }
      ],
    )

    const requestSpy = vi.spyOn(driver.sink, 'requestPdo').mockResolvedValue(undefined)
    const refreshSpy = vi.spyOn(driver, 'refreshState').mockResolvedValue(undefined)

    render(
      <DrpdSinkControlInstrumentView
        instrument={buildInstrument()}
        displayName="Sink Control"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    await user.selectOptions(screen.getByLabelText(/available pdos/i), '1')
    expect(screen.queryByLabelText(/current \(a\)/i)).not.toBeInTheDocument()
    const voltageInput = screen.getByLabelText(/voltage \(v\)/i)
    const powerInput = screen.getByLabelText(/power \(w\)/i)
    await user.clear(voltageInput)
    await user.type(voltageInput, '12')
    await user.clear(powerInput)
    await user.type(powerInput, '24')

    await user.click(screen.getByRole('button', { name: /request pdo/i }))

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith(1, 12000, 2000)
    })
    expect(refreshSpy).toHaveBeenCalled()
    expect(screen.getByText(/request sent\./i)).toBeInTheDocument()
  })

  it('shows validation error and blocks invalid request', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setSinkSnapshot(
      CCBusRole.SINK,
      null,
      [{ type: 'VARIABLE', minVoltageV: 5, maxVoltageV: 12, maxCurrentA: 3 }],
    )

    const requestSpy = vi.spyOn(driver.sink, 'requestPdo').mockResolvedValue(undefined)

    render(
      <DrpdSinkControlInstrumentView
        instrument={buildInstrument()}
        displayName="Sink Control"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    const voltageInput = screen.getByLabelText(/voltage \(v\)/i)
    await user.clear(voltageInput)
    await user.type(voltageInput, '2')
    await user.click(screen.getByRole('button', { name: /request pdo/i }))

    expect(requestSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/voltage must be between 5\.00 and 12\.00 v\./i)).toBeInTheDocument()
  })

  it('supports AVS PDOs using voltage and power inputs', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setSinkSnapshot(
      CCBusRole.SINK,
      null,
      [{ type: 'EPR_AVS', minVoltageV: 15, maxVoltageV: 28, maxPowerW: 140 }],
    )

    const requestSpy = vi.spyOn(driver.sink, 'requestPdo').mockResolvedValue(undefined)
    const refreshSpy = vi.spyOn(driver, 'refreshState').mockResolvedValue(undefined)

    render(
      <DrpdSinkControlInstrumentView
        instrument={buildInstrument()}
        displayName="Sink Control"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    expect(screen.getByText(/selected: epr_avs/i)).toBeInTheDocument()

    const voltageInput = screen.getByLabelText(/voltage \(v\)/i)
    const powerInput = screen.getByLabelText(/power \(w\)/i)
    await user.clear(voltageInput)
    await user.type(voltageInput, '20')
    await user.clear(powerInput)
    await user.type(powerInput, '100')

    await user.click(screen.getByRole('button', { name: /request pdo/i }))

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith(0, 20000, 5000)
    })
    expect(refreshSpy).toHaveBeenCalled()
  })
})
