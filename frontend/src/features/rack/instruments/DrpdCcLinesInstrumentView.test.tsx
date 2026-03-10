import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AnalogMonitorChannels } from '../../../lib/device'
import { DRPDDevice } from '../../../lib/device'
import type { DRPDTransport } from '../../../lib/device/drpd/transport'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdCcLinesInstrumentView } from './DrpdCcLinesInstrumentView'

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

class TestDRPDDevice extends DRPDDevice {
  public setAnalogMonitor(analogMonitor: AnalogMonitorChannels | null): void {
    this.state = { ...this.state, analogMonitor }
  }
}

const buildInstrument = (): RackInstrument => ({
  id: 'inst-1',
  instrumentIdentifier: 'com.mta.drpd.cc-lines'
})

const buildDeviceRecord = (): RackDeviceRecord => ({
  id: 'device-1',
  identifier: 'com.mta.drpd',
  displayName: 'Dr. PD',
  vendorId: 0x2e8a,
  productId: 0x000a
})

describe('DrpdCcLinesInstrumentView', () => {
  it('renders DUT and US/DS CC status telemetry', () => {
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setAnalogMonitor({
      captureTimestampUs: 1000n,
      vbus: 5,
      ibus: 1,
      dutCc1: 0.33,
      dutCc2: 1.23,
      usdsCc1: 0,
      usdsCc2: 2.2,
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
      <DrpdCcLinesInstrumentView
        instrument={buildInstrument()}
        displayName="CC Lines"
        deviceState={deviceState}
        isEditMode={false}
      />
    )

    expect(screen.getByText('DUT')).toBeInTheDocument()
    expect(screen.getByText('US/DS')).toBeInTheDocument()
    expect(screen.getAllByText('CC1')).toHaveLength(2)
    expect(screen.getAllByText('CC2')).toHaveLength(2)
    expect(screen.getAllByText('Sink TX NG')).toHaveLength(2)
    expect(screen.getByText('Off')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
  })
})
