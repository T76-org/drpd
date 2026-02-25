import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CCBusRole, CCBusRoleStatus, DRPDDevice, OnOffState } from '../../../lib/device'
import type { DRPDTransport } from '../../../lib/device/drpd/transport'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdDeviceStatusInstrumentView } from './DrpdDeviceStatusInstrumentView'

/**
 * Minimal DRPD transport stub for tests.
 */
class TestTransport implements DRPDTransport {
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
})
