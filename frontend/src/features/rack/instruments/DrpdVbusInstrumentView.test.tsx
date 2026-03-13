import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AnalogMonitorChannels, VBusInfo } from '../../../lib/device'
import { DRPDDevice, VBusStatus } from '../../../lib/device'
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

  /**
   * Update the VBUS info state for tests.
   *
   * @param vbusInfo - VBUS info snapshot.
   */
  public setVBusInfo(vbusInfo: VBusInfo | null): void {
    this.state = { ...this.state, vbusInfo }
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

describe('DrpdVbusInstrumentView', () => {
  it('renders derived power from voltage and current', () => {
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
    expect(screen.queryByText('DUT')).toBeNull()
    expect(screen.queryByText('US/DS')).toBeNull()
    const powerValue = screen.getByText('18.51')
    const powerBlock = powerValue.closest('div')
    expect(powerBlock).not.toBeNull()
    expect(powerBlock).toHaveTextContent('W')
    expect(screen.queryByText('Ah')).toBeNull()
    expect(screen.getByText('OVP')).toBeInTheDocument()
    expect(screen.getByText('OCP')).toBeInTheDocument()
    expect(screen.getByText('STATUS')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.getAllByText('----')).toHaveLength(2)
  })

  it('loads protection thresholds from startup state and tracks vbusInfo events', async () => {
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setAnalogMonitor({
      captureTimestampUs: 100n,
      vbus: 12,
      ibus: 1,
      dutCc1: 0,
      dutCc2: 0,
      usdsCc1: 0,
      usdsCc2: 0,
      adcVref: 0,
      groundRef: 0,
      currentVref: 0
    })
    driver.setVBusInfo({
      status: VBusStatus.ENABLED,
      ovpThresholdMv: 15000,
      ocpThresholdMa: 3000
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

    const startupProtection = screen.getByTestId('vbus-protection')
    expect(startupProtection).not.toBeNull()
    expect(startupProtection).toHaveAttribute('data-protection-state', 'on')
    expect(screen.getByText('15.00V')).toBeInTheDocument()
    expect(screen.getByText('3.00A')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()

    act(() => {
      driver.setVBusInfo({
        status: VBusStatus.OVP,
        ovpThresholdMv: 15000,
        ocpThresholdMa: 3000
      })
      driver.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { changed: ['vbusInfo'] }
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('vbus-protection')).toHaveAttribute(
        'data-protection-state',
        'triggered',
      )
    })
    expect(screen.getByText('Triggered')).toBeInTheDocument()
  })
})
