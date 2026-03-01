import { render, screen, waitFor, within } from '@testing-library/react'
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
        status: SinkState.PE_SNK_READY,
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

    expect(screen.getByText('State')).toBeInTheDocument()
    expect(screen.getByText(/connected/i)).toBeInTheDocument()
    expect(screen.getByText('VSET')).toBeInTheDocument()
    expect(screen.getAllByText('9.00 V')).toHaveLength(2)
    expect(screen.getByText('ISET')).toBeInTheDocument()
    expect(screen.getByText('2.00 A')).toBeInTheDocument()
    expect(screen.getByText(/^Fixed$/, { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('VRANGE')).toBeInTheDocument()
    expect(screen.getByText('IRANGE')).toBeInTheDocument()
    expect(screen.getByText(/0\.00-3\.00 a/i)).toBeInTheDocument()
  })

  it('lists available PDOs in the popup list and supports selection', async () => {
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

    await userEvent.setup().click(screen.getByRole('button', { name: /^set pdo$/i }))
    const list = screen.getByRole('listbox', { name: /available pdos/i })
    expect(list).toBeInTheDocument()
    expect(screen.getByTestId('pdo-list')).toBeInTheDocument()
    const fixedOption = await screen.findByRole('option', {
      name: /#1 fixed 5\.00 v \/ 3\.00 a/i
    })
    const batteryOption = await screen.findByRole('option', {
      name: /#2 battery 9\.00-15\.00 v \/ 27\.00 w max/i
    })
    expect(fixedOption).toHaveAttribute('aria-selected', 'true')
    await userEvent.setup().click(batteryOption)
    expect(batteryOption).toHaveAttribute('aria-selected', 'true')
  })

  it('converts battery voltage/current request into SCPI arguments and auto-closes', async () => {
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

    await user.click(screen.getByRole('button', { name: /^set pdo$/i }))
    await user.click(screen.getByRole('option', { name: /#2 battery/i }))
    const voltageInput = screen.getByLabelText(/^voltage$/i)
    const currentInput = screen.getByLabelText(/^current$/i)
    await user.clear(voltageInput)
    await user.type(voltageInput, '12')
    await user.clear(currentInput)
    await user.type(currentInput, '2')

    await user.click(
      within(screen.getByRole('dialog', { name: /sink request tuning/i })).getByRole('button', {
        name: /^set pdo$/i,
      }),
    )

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith(1, 12000, 2000)
    })
    expect(refreshSpy).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /sink request tuning/i })).not.toBeInTheDocument()
    })
  })

  it('shows validation error immediately and blocks invalid request', async () => {
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

    await user.click(screen.getByRole('button', { name: /^set pdo$/i }))
    const voltageInput = screen.getByLabelText(/^voltage$/i)
    await user.clear(voltageInput)
    await user.type(voltageInput, '2')

    const dialog = screen.getByRole('dialog', { name: /sink request tuning/i })
    expect(within(dialog).getByText(/voltage must be between 5\.00 and 12\.00 v\./i)).toBeInTheDocument()
    expect(
      within(screen.getByRole('dialog', { name: /sink request tuning/i })).getByRole('button', {
        name: /^set pdo$/i,
      }),
    ).toBeDisabled()

    await user.click(
      within(screen.getByRole('dialog', { name: /sink request tuning/i })).getByRole('button', {
        name: /^set pdo$/i,
      }),
    )
    expect(requestSpy).not.toHaveBeenCalled()
  })

  it('supports AVS PDOs using voltage and current inputs', async () => {
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

    expect(screen.getByText(/^EPR AVS$/, { selector: 'span' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^set pdo$/i }))
    const voltageInput = screen.getByLabelText(/^voltage$/i)
    const currentInput = screen.getByLabelText(/^current$/i)
    await user.clear(voltageInput)
    await user.type(voltageInput, '20')
    await user.clear(currentInput)
    await user.type(currentInput, '5')

    await user.click(
      within(screen.getByRole('dialog', { name: /sink request tuning/i })).getByRole('button', {
        name: /^set pdo$/i,
      }),
    )

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalledWith(0, 20000, 5000)
    })
    expect(refreshSpy).toHaveBeenCalled()
  })

  it('revalidates AVS current when voltage changes', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setSinkSnapshot(
      CCBusRole.SINK,
      null,
      [{ type: 'EPR_AVS', minVoltageV: 15, maxVoltageV: 28, maxPowerW: 140 }],
    )

    render(
      <DrpdSinkControlInstrumentView
        instrument={buildInstrument()}
        displayName="Sink Control"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^set pdo$/i }))
    const voltageInput = screen.getByLabelText(/^voltage$/i)
    const currentInput = screen.getByLabelText(/^current$/i)
    await user.clear(currentInput)
    await user.type(currentInput, '6')
    expect(
      within(screen.getByRole('dialog', { name: /sink request tuning/i })).getByRole('button', {
        name: /^set pdo$/i,
      }),
    ).toBeEnabled()

    await user.clear(voltageInput)
    await user.type(voltageInput, '28')

    expect(
      screen.getByText(/current must be between 0\.00 and 5\.00 a\./i),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('dialog', { name: /sink request tuning/i })).getByRole('button', {
        name: /^set pdo$/i,
      }),
    ).toBeDisabled()
  })

  it('closes the popup on cancel and Escape', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setSinkSnapshot(
      CCBusRole.SINK,
      null,
      [{ type: 'FIXED', voltageV: 5, maxCurrentA: 3 }],
    )

    render(
      <DrpdSinkControlInstrumentView
        instrument={buildInstrument()}
        displayName="Sink Control"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: /^set pdo$/i }))
    expect(screen.getByRole('dialog', { name: /sink request tuning/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog', { name: /sink request tuning/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^set pdo$/i }))
    expect(screen.getByRole('dialog', { name: /sink request tuning/i })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /sink request tuning/i })).not.toBeInTheDocument()
  })

  it('shows fixed voltage as read-only', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setSinkSnapshot(
      CCBusRole.SINK,
      null,
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

    await user.click(screen.getByRole('button', { name: /^set pdo$/i }))
    const voltageInput = screen.getByLabelText(/^voltage$/i)
    expect(voltageInput).toHaveAttribute('readonly')
    expect(voltageInput).toHaveValue('9.00')
  })
})
