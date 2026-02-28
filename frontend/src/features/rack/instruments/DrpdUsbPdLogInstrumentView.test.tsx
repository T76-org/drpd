import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRPDDevice } from '../../../lib/device'
import type { LoggedCapturedMessage } from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdUsbPdLogInstrumentView } from './DrpdUsbPdLogInstrumentView'

class TestLogDriver extends EventTarget {
  public rows: LoggedCapturedMessage[]

  public constructor(rows: LoggedCapturedMessage[]) {
    super()
    this.rows = rows
  }

  public getState() {
    return {
      role: null,
      ccBusRoleStatus: null,
      analogMonitor: null,
      vbusInfo: null,
      captureEnabled: null,
      triggerInfo: null,
      sinkInfo: null,
      sinkPdoList: null,
    }
  }

  public async getLogCounts(): Promise<{ analog: number; messages: number }> {
    return { analog: 0, messages: this.rows.length }
  }

  public async queryCapturedMessages(query: {
    sortOrder?: 'asc' | 'desc'
    offset?: number
    limit?: number
  }): Promise<LoggedCapturedMessage[]> {
    const sorted =
      query.sortOrder === 'desc' ? [...this.rows].reverse() : [...this.rows]
    const offset = query.offset ?? 0
    const limit = query.limit ?? sorted.length
    return sorted.slice(offset, offset + limit)
  }
}

const buildInstrument = (): RackInstrument => ({
  id: 'inst-log',
  instrumentIdentifier: 'com.mta.drpd.usbpd-log',
})

const buildDeviceRecord = (): RackDeviceRecord => ({
  id: 'device-1',
  identifier: 'com.mta.drpd',
  displayName: 'Dr. PD',
  vendorId: 0x2e8a,
  productId: 0x000a,
})

const buildMessage = (
  index: number,
  messageType = 1,
): LoggedCapturedMessage => ({
  startTimestampUs: BigInt(1000 + index * 10),
  endTimestampUs: BigInt(1005 + index * 10),
  decodeResult: 0,
  sopKind: 'SOP',
  messageKind: 'CONTROL',
  messageType,
  messageId: index,
  senderPowerRole: index % 2 === 0 ? 'SOURCE' : 'SINK',
  senderDataRole: index % 2 === 0 ? 'DFP' : 'UFP',
  pulseCount: 3,
  rawPulseWidths: Uint16Array.from([1, 2, 3]),
  rawSop: Uint8Array.from([0x12, 0x34, 0x56, 0x78]),
  rawDecodedData: Uint8Array.from([0xaa, 0xbb]),
  parseError: null,
  createdAtMs: 1_700_000_000_000 + index,
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DrpdUsbPdLogInstrumentView', () => {
  it('loads existing logged rows on mount without waiting for add events', async () => {
    const driver = new TestLogDriver([
      buildMessage(0, 1), // GoodCRC
      buildMessage(1, 3), // Accept
    ])
    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver as unknown as RackDeviceState['drpdDriver'],
    }

    render(
      <DrpdUsbPdLogInstrumentView
        instrument={buildInstrument()}
        displayName="USB-PD Log"
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    await waitFor(() => {
      const canvas = screen.getByTestId('drpd-usbpd-log-canvas')
      expect(canvas).toHaveStyle({ height: '28px' })
    })
    expect(await screen.findByText('GoodCRC')).toBeInTheDocument()
    expect(await screen.findByText('Accept')).toBeInTheDocument()
  })

  it('recovers from missed add events by reconciling counts and fetching new rows', async () => {
    const driver = new TestLogDriver([buildMessage(0, 1)])
    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver as unknown as RackDeviceState['drpdDriver'],
    }

    render(
      <DrpdUsbPdLogInstrumentView
        instrument={buildInstrument()}
        displayName="USB-PD Log"
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    expect(await screen.findByText('GoodCRC')).toBeInTheDocument()

    // Simulate missed worker/device events: rows exist in store, but no LOG_ENTRY_ADDED_EVENT dispatched.
    driver.rows = [buildMessage(0, 1), buildMessage(1, 3), buildMessage(2, 4)] // GoodCRC, Accept, Reject

    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument()
    }, { timeout: 3500 })
  })

  it('continues rendering appended rows across multiple add events', async () => {
    const driver = new TestLogDriver([buildMessage(0, 1)])
    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver as unknown as RackDeviceState['drpdDriver'],
    }

    render(
      <DrpdUsbPdLogInstrumentView
        instrument={buildInstrument()}
        displayName="USB-PD Log"
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    expect(await screen.findByText('GoodCRC')).toBeInTheDocument()

    const appendAndEmit = (nextRow: LoggedCapturedMessage) => {
      driver.rows = [...driver.rows, nextRow]
      driver.dispatchEvent(
        new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
          detail: { kind: 'message', row: nextRow },
        }),
      )
    }

    await act(async () => {
      appendAndEmit(buildMessage(1, 3)) // Accept
      appendAndEmit(buildMessage(2, 4)) // Reject
      appendAndEmit(buildMessage(3, 6)) // PS_RDY
    })

    await waitFor(() => {
      expect(screen.getByText('Accept')).toBeInTheDocument()
      expect(screen.getByText('Reject')).toBeInTheDocument()
      expect(screen.getByText('PS RDY')).toBeInTheDocument()
    })
  })

  it('maps SOP prime sender and receiver using cable-plug origin metadata', async () => {
    const cableToPort = {
      ...buildMessage(0, 1),
      sopKind: 'SOP_PRIME',
      senderPowerRole: 'SOURCE',
      senderDataRole: 'CABLE_PLUG_VPD',
    } satisfies LoggedCapturedMessage
    const portToCable = {
      ...buildMessage(1, 1),
      sopKind: 'SOP_PRIME',
      senderPowerRole: 'SOURCE',
      senderDataRole: 'UFP_DFP',
    } satisfies LoggedCapturedMessage

    const driver = new TestLogDriver([cableToPort, portToCable])
    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver as unknown as RackDeviceState['drpdDriver'],
    }

    const { container } = render(
      <DrpdUsbPdLogInstrumentView
        instrument={buildInstrument()}
        displayName="USB-PD Log"
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getAllByText("SOP'").length).toBeGreaterThanOrEqual(2)
    })

    const rowTexts = Array.from(container.querySelectorAll('[class*="dataRow"]')).map(
      (row) => row.textContent ?? '',
    )
    expect(rowTexts.some((text) => text.includes('CableSource'))).toBe(true)
    expect(rowTexts.some((text) => text.includes('SourceCable'))).toBe(true)
  })
})
