import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CCBusRole, CCBusRoleStatus, DRPDDevice, OnOffState } from '../../../lib/device'
import type { DRPDTransport } from '../../../lib/device/drpd/transport'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdDeviceStatusInstrumentView } from './DrpdDeviceStatusInstrumentView'

/**
 * Minimal DRPD transport stub for tests.
 */
class TestTransport implements DRPDTransport {
  public readonly kind = 'winusb' as const
  public async sendCommand(): Promise<void> {
    return undefined
  }

  public async queryText(): Promise<string[]> {
    return []
  }

  public async queryBinary(): Promise<Uint8Array> {
    return new Uint8Array()
  }
}

/**
 * Testable DRPD device with mutable state.
 */
class TestDRPDDevice extends DRPDDevice {
  /**
   * Update role/capture-related state for tests.
   */
  public setStatusState(
    role: CCBusRole,
    roleStatus: CCBusRoleStatus,
    captureEnabled: OnOffState,
  ): void {
    this.state = {
      ...this.state,
      role,
      ccBusRoleStatus: roleStatus,
      captureEnabled
    }
  }
}

const buildInstrument = (): RackInstrument => ({
  id: 'inst-1',
  instrumentIdentifier: 'com.mta.drpd.device-status-panel'
})

const buildDeviceRecord = (): RackDeviceRecord => ({
  id: 'device-1',
  identifier: 'com.mta.drpd',
  displayName: 'Dr. PD',
  vendorId: 0x2e8a,
  productId: 0x000a
})

describe('DrpdDeviceStatusInstrumentView', () => {
  it('renders role, capture, and status controls', () => {
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setStatusState(
      CCBusRole.SINK,
      CCBusRoleStatus.ATTACHED,
      OnOffState.ON,
    )

    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver
    }

    render(
      <DrpdDeviceStatusInstrumentView
        instrument={buildInstrument()}
        displayName="Device Status"
        deviceState={deviceState}
        isEditMode={false}
      />
    )

    expect(screen.getByText('Role')).toBeInTheDocument()
    expect(screen.getByText('Capture')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Sink')).toBeInTheDocument()
    expect(screen.getByText('Attached')).toBeInTheDocument()
    expect(screen.getByText('On')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toggle' })).toBeInTheDocument()
  })

  it('renders the Set menu above the rack content layer', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setStatusState(
      CCBusRole.SINK,
      CCBusRoleStatus.ATTACHED,
      OnOffState.ON,
    )

    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver
    }

    render(
      <DrpdDeviceStatusInstrumentView
        instrument={buildInstrument()}
        displayName="Device Status"
        deviceState={deviceState}
        isEditMode={false}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Set' }))

    expect(screen.getByRole('menu')).toHaveStyle({ zIndex: '10000' })
    expect(screen.getByRole('menuitemradio', { name: 'Sink' })).toBeInTheDocument()
  })

  it('persists role and capture changes after successful device updates', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setStatusState(
      CCBusRole.SOURCE,
      CCBusRoleStatus.ATTACHED,
      OnOffState.OFF,
    )
    const setRoleSpy = vi.spyOn(driver.ccBus, 'setRole').mockResolvedValue(undefined)
    const setCaptureEnabledSpy = vi.spyOn(driver, 'setCaptureEnabled').mockResolvedValue(undefined)
    const updateDeviceConfig = vi.fn(async () => undefined)
    const deviceRecord = buildDeviceRecord()

    render(
      <DrpdDeviceStatusInstrumentView
        instrument={buildInstrument()}
        displayName="Device Status"
        deviceRecord={deviceRecord}
        deviceState={{
          record: deviceRecord,
          status: 'connected',
          drpdDriver: driver,
        }}
        isEditMode={false}
        onUpdateDeviceConfig={updateDeviceConfig}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Set' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Sink' }))
    await user.click(screen.getByRole('button', { name: 'Toggle' }))

    expect(setRoleSpy).toHaveBeenCalledWith(CCBusRole.SINK)
    expect(setCaptureEnabledSpy).toHaveBeenCalledWith(OnOffState.ON)
    expect(updateDeviceConfig).toHaveBeenCalledTimes(2)

    const roleUpdater = updateDeviceConfig.mock.calls[0]?.[1] as (current: Record<string, unknown> | undefined) => Record<string, unknown>
    expect(roleUpdater({})).toEqual({ role: CCBusRole.SINK })

    const captureUpdater = updateDeviceConfig.mock.calls[1]?.[1] as (current: Record<string, unknown> | undefined) => Record<string, unknown>
    expect(captureUpdater({ role: CCBusRole.SINK })).toEqual({
      role: CCBusRole.SINK,
      captureEnabled: OnOffState.ON,
    })
  })
})
