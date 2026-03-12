import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRPDDevice } from '../../../lib/device'
import {
  buildCapturedLogSelectionKey,
  type DRPDLogSelectionState,
  type LoggedAnalogSample,
  type LoggedCapturedMessage,
} from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdUsbPdLogInstrumentView } from './DrpdUsbPdLogInstrumentView'
import { computePulseTraceEndTimestampUs } from './DrpdUsbPdLogTimeStrip.utils'

class TestLogDriver extends EventTarget {
  public analogRows: LoggedAnalogSample[]
  public rows: LoggedCapturedMessage[]
  public clearScopes: string[]
  public logSelection: DRPDLogSelectionState
  public timeStripQueries: Array<{ windowStartUs: bigint; windowDurationUs: bigint; analogPointBudget: number }>

  public constructor(rows: LoggedCapturedMessage[], analogRows: LoggedAnalogSample[] = []) {
    super()
    this.analogRows = analogRows
    this.rows = rows
    this.clearScopes = []
    this.timeStripQueries = []
    this.logSelection = {
      selectedKeys: [],
      anchorIndex: null,
      activeIndex: null,
    }
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
      logSelection: this.logSelection,
    }
  }

  public getLogSelectionState(): DRPDLogSelectionState {
    return this.logSelection
  }

  public async setLogSelectionState(next: DRPDLogSelectionState): Promise<void> {
    this.logSelection = next
    this.dispatchEvent(
      new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
        detail: { state: this.getState(), changed: ['logSelection'] },
      }),
    )
  }

  public async clearLogSelection(): Promise<void> {
    await this.setLogSelectionState({
      selectedKeys: [],
      anchorIndex: null,
      activeIndex: null,
    })
  }

  public async resolveLogSelectionKeysForIndexRange(
    startIndex: number,
    endIndex: number,
  ): Promise<string[]> {
    const start = Math.max(0, Math.min(startIndex, endIndex))
    const end = Math.min(this.rows.length - 1, Math.max(startIndex, endIndex))
    if (end < start) {
      return []
    }
    return this.rows
      .slice(start, end + 1)
      .map((row) => buildCapturedLogSelectionKey(row))
  }

  public async getLogCounts(): Promise<{ analog: number; messages: number }> {
    return { analog: this.analogRows.length, messages: this.rows.length }
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

  public async queryMessageLogTimeStripWindow(query: {
    windowStartUs: bigint
    windowDurationUs: bigint
    analogPointBudget: number
  }) {
    this.timeStripQueries.push(query)
    const messageRows = this.rows.filter((row) => row.entryKind === 'message')
    const earliestMessageTimestampUs = messageRows[0]?.startTimestampUs ?? null
    const latestMessageTimestampUs =
      messageRows.length > 0 ? messageRows[messageRows.length - 1]?.endTimestampUs ?? null : null
    const earliestAnalogTimestampUs = this.analogRows[0]?.timestampUs ?? null
    const latestAnalogTimestampUs =
      this.analogRows.length > 0 ? this.analogRows[this.analogRows.length - 1]?.timestampUs ?? null : null
    const earliestTimestampUs =
      earliestMessageTimestampUs === null
        ? earliestAnalogTimestampUs
        : earliestAnalogTimestampUs === null
          ? earliestMessageTimestampUs
          : earliestMessageTimestampUs < earliestAnalogTimestampUs
            ? earliestMessageTimestampUs
            : earliestAnalogTimestampUs
    const latestTimestampUs =
      latestMessageTimestampUs === null
        ? latestAnalogTimestampUs
        : latestAnalogTimestampUs === null
          ? latestMessageTimestampUs
          : latestMessageTimestampUs > latestAnalogTimestampUs
            ? latestMessageTimestampUs
            : latestAnalogTimestampUs
    const earliestDisplayTimestampUs = (() => {
      const candidates = [
        messageRows[0]?.displayTimestampUs ?? null,
        this.analogRows[0]?.displayTimestampUs ?? null,
      ].filter((value): value is bigint => value !== null)
      if (candidates.length === 0) {
        return null
      }
      return candidates.reduce((minimum, value) => value < minimum ? value : minimum)
    })()
    const latestDisplayTimestampUs = (() => {
      const latestMessage = messageRows[messageRows.length - 1]
      const candidates = [
        latestMessage && latestMessage.displayTimestampUs !== null
          ? latestMessage.displayTimestampUs + (latestMessage.endTimestampUs - latestMessage.startTimestampUs)
          : null,
        this.analogRows.length > 0 ? this.analogRows[this.analogRows.length - 1]?.displayTimestampUs ?? null : null,
      ].filter((value): value is bigint => value !== null)
      if (candidates.length === 0) {
        return null
      }
      return candidates.reduce((maximum, value) => value > maximum ? value : maximum)
    })()
    return {
      windowStartUs: query.windowStartUs,
      windowEndUs: query.windowStartUs + query.windowDurationUs,
      windowDurationUs: query.windowDurationUs,
      earliestTimestampUs,
      latestTimestampUs,
      earliestDisplayTimestampUs,
      latestDisplayTimestampUs,
      windowStartDisplayTimestampUs: query.windowStartUs,
      windowEndDisplayTimestampUs: query.windowStartUs + query.windowDurationUs,
      hasMoreBefore: false,
      hasMoreAfter: false,
      pulses: messageRows.map((row) => ({
        selectionKey: buildCapturedLogSelectionKey(row),
        startTimestampUs: row.startTimestampUs,
        endTimestampUs: row.endTimestampUs,
        traceEndTimestampUs: computePulseTraceEndTimestampUs(
          row.startTimestampUs,
          row.rawPulseWidths,
          row.endTimestampUs,
        ),
        displayStartTimestampUs: row.displayTimestampUs,
        displayEndTimestampUs:
          row.displayTimestampUs === null
            ? null
            : row.displayTimestampUs + (row.endTimestampUs - row.startTimestampUs),
        wallClockMs: row.createdAtMs,
        pulseWidthsNs: row.rawPulseWidths,
      })),
      analogPoints: this.analogRows.slice(0, query.analogPointBudget).map((row) => ({
        timestampUs: row.timestampUs,
        displayTimestampUs: row.displayTimestampUs,
        wallClockMs: row.createdAtMs,
        vbusV: row.vbusV,
        ibusA: row.ibusA,
      })),
      timeAnchors: [
        {
          timestampUs: 0n,
          displayTimestampUs: 0n,
          wallClockMs: 1_700_000_000_000,
          approximate: false,
        },
        {
          timestampUs: 100n,
          displayTimestampUs: 100n,
          wallClockMs: 1_700_000_000_100,
          approximate: true,
        },
      ],
    }
  }

  public async clearLogs(scope: string): Promise<void> {
    this.clearScopes.push(scope)
    if (scope === 'all' || scope === 'analog') {
      this.analogRows = []
    }
    if (scope === 'all' || scope === 'messages') {
      this.rows = []
    }
    this.logSelection = {
      selectedKeys: [],
      anchorIndex: null,
      activeIndex: null,
    }
    this.dispatchEvent(
      new CustomEvent(DRPDDevice.LOG_ENTRY_DELETED_EVENT, {
        detail: {
          scope,
          analogDeleted: scope === 'all' || scope === 'analog' ? 1 : 0,
          messagesDeleted: scope === 'all' || scope === 'messages' ? 1 : 0,
          reason: 'clear',
        },
      }),
    )
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
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
  startTimestampUs: BigInt(1000 + index * 10),
  endTimestampUs: BigInt(1005 + index * 10),
  displayTimestampUs: BigInt(index * 10),
  decodeResult: 0,
  sopKind: 'SOP',
  messageKind: 'CONTROL',
  messageType,
  messageId: index,
  senderPowerRole: index % 2 === 0 ? 'SOURCE' : 'SINK',
  senderDataRole: index % 2 === 0 ? 'DFP' : 'UFP',
  pulseCount: 3,
  rawPulseWidths: Float64Array.from([1, 2, 3]),
  rawSop: Uint8Array.from([0x12, 0x34, 0x56, 0x78]),
  rawDecodedData: Uint8Array.from([0xaa, 0xbb]),
  parseError: null,
  createdAtMs: 1_700_000_000_000 + index,
})

const buildAnalogSample = (index: number): LoggedAnalogSample => ({
  timestampUs: BigInt(index * 20),
  displayTimestampUs: BigInt(index * 20),
  vbusV: 5 + index,
  ibusA: 0.5 + index * 0.1,
  role: 'SOURCE',
  createdAtMs: 1_700_000_000_000 + index * 10,
})

const stubResizeObserver = (): void => {
  class ResizeObserverMock {
    public callback: ResizeObserverCallback

    public constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    public observe(target: Element): void {
      Object.defineProperty(target, 'clientWidth', {
        configurable: true,
        value: 640,
      })
      Object.defineProperty(target, 'clientHeight', {
        configurable: true,
        value: 180,
      })
      this.callback(
        [
          {
            target,
            contentRect: {
              width: 640,
              height: 180,
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              bottom: 180,
              right: 640,
              toJSON: () => ({}),
            } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      )
    }

    public disconnect(): void {}
    public unobserve(): void {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
}

const buildEvent = (
  index: number,
  text: string,
  eventType: LoggedCapturedMessage['eventType'] = 'capture_changed',
): LoggedCapturedMessage => ({
  entryKind: 'event',
  eventType,
  eventText: text,
  eventWallClockMs: 1_700_000_100_000 + index,
  startTimestampUs: BigInt(2000 + index),
  endTimestampUs: BigInt(2000 + index),
  displayTimestampUs: null,
  decodeResult: 0,
  sopKind: null,
  messageKind: null,
  messageType: null,
  messageId: null,
  senderPowerRole: null,
  senderDataRole: null,
  pulseCount: 0,
  rawPulseWidths: new Float64Array(),
  rawSop: new Uint8Array(),
  rawDecodedData: new Uint8Array(),
  parseError: null,
  createdAtMs: 1_700_000_100_000 + index,
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('DrpdUsbPdLogInstrumentView', () => {
  it('renders the time strip above the table', async () => {
    class ResizeObserverMock {
      public callback: ResizeObserverCallback

      public constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }

      public observe(target: Element): void {
        this.callback(
          [
            {
              target,
              contentRect: {
                width: 640,
                height: 180,
                x: 0,
                y: 0,
                top: 0,
                left: 0,
                bottom: 180,
                right: 640,
                toJSON: () => ({}),
              } as DOMRectReadOnly,
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        )
      }

      public disconnect(): void {}
      public unobserve(): void {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

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

    expect(await screen.findByTestId('drpd-usbpd-log-timestrip')).toBeInTheDocument()
    const timeStrip = screen.getByTestId('drpd-usbpd-log-timestrip')
    const header = screen.getByText('Timestamp')
    expect(
      Boolean(timeStrip.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true)
    expect(header).toBeInTheDocument()
  })

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

  it('renders full-width event rows and applies per-event-type colors', async () => {
    const driver = new TestLogDriver([
      buildMessage(0, 1),
      buildEvent(1, 'Capture turned off at 2026-02-28 10:00:00', 'capture_changed'),
      buildEvent(2, 'CC role changed to SOURCE at 2026-02-28 10:00:01', 'cc_role_changed'),
      buildEvent(3, 'Device status changed to ATTACHED at 2026-02-28 10:00:02', 'cc_status_changed'),
    ])
    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: driver as unknown as RackDeviceState['drpdDriver'],
    }

    const { container } = render(
      <DrpdUsbPdLogInstrumentView
        instrument={{
          ...buildInstrument(),
          config: {
            captureChangedEventTextColor: 'rgb(255, 170, 0)',
            ccRoleChangedEventTextColor: 'rgb(0, 180, 255)',
            ccStatusChangedEventTextColor: 'rgb(50, 220, 120)',
          },
        }}
        displayName="USB-PD Log"
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    expect(
      await screen.findByText('Capture turned off at 2026-02-28 10:00:00'),
    ).toBeInTheDocument()
    const eventRow = container.querySelector('[class*="eventRowCapture"]')
    expect(eventRow).not.toBeNull()
    const eventLabel = container.querySelector('[class*="eventLabel"]')
    expect(eventLabel).not.toBeNull()
    expect(screen.getByTestId('drpd-usbpd-log')).toHaveStyle({
      '--event-color-capture': 'rgb(255, 170, 0)',
      '--event-color-role': 'rgb(0, 180, 255)',
      '--event-color-status': 'rgb(50, 220, 120)',
    })
  })

  it('resets delta display after an event row', async () => {
    const afterEventMessage = {
      ...buildMessage(2, 4),
      startTimestampUs: 3000n,
      endTimestampUs: 3005n,
      displayTimestampUs: 0n,
    } satisfies LoggedCapturedMessage
    const driver = new TestLogDriver([
      buildMessage(0, 1),
      buildEvent(1, 'Capture turned off at 2026-02-28 10:00:00', 'capture_changed'),
      afterEventMessage,
    ])
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

    expect(await screen.findByText('Reject')).toBeInTheDocument()
    const rows = Array.from(container.querySelectorAll('[class*="dataRow"]'))
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows[2]?.textContent ?? '').toContain('--')
  })

  it('resets delta display to -- for messages appended after an event row', async () => {
    const driver = new TestLogDriver([buildMessage(0, 1), buildEvent(1, 'CC role changed to SINK')])
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

    expect(await screen.findByText('CC role changed to SINK')).toBeInTheDocument()

    const appended = {
      ...buildMessage(2, 4),
      startTimestampUs: 5000n,
      endTimestampUs: 5005n,
      displayTimestampUs: 0n,
    } satisfies LoggedCapturedMessage
    await act(async () => {
      driver.rows = [...driver.rows, appended]
      driver.dispatchEvent(
        new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
          detail: { kind: 'message', row: appended },
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByText('Reject')).toBeInTheDocument()
    })
    const rows = Array.from(container.querySelectorAll('[class*="dataRow"]'))
    expect(rows[2]?.textContent ?? '').toContain('--')
  })

  it('shows clear confirmation popup and clears all logs when confirmed', async () => {
    stubResizeObserver()

    const driver = new TestLogDriver([buildMessage(0, 1)], [
      buildAnalogSample(0),
      buildAnalogSample(1),
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
        deviceRecord={buildDeviceRecord()}
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Clear' }))
    expect(
      screen.getByText(/permanently delete all logged messages and analog samples/i),
    ).toBeInTheDocument()

    const clearDialog = screen.getByRole('dialog')
    await userEvent.click(within(clearDialog).getByRole('button', { name: /^Clear$/ }))
    await waitFor(() => {
      expect(driver.clearScopes).toEqual(['all'])
      expect(driver.rows).toHaveLength(0)
      expect(driver.analogRows).toHaveLength(0)
    })
  })

  it('validates and applies configured max message buffer', async () => {
    const driver = new TestLogDriver([buildMessage(0, 1)])
    const deviceRecord: RackDeviceRecord = {
      ...buildDeviceRecord(),
      config: {
        logging: {
          maxCapturedMessages: 1000,
        },
      },
    }
    const updateDeviceConfig = vi.fn(async () => undefined)
    const deviceState: RackDeviceState = {
      record: deviceRecord,
      status: 'connected',
      drpdDriver: driver as unknown as RackDeviceState['drpdDriver'],
    }

    render(
      <DrpdUsbPdLogInstrumentView
        instrument={buildInstrument()}
        displayName="USB-PD Log"
        deviceRecord={deviceRecord}
        deviceState={deviceState}
        isEditMode={false}
        onUpdateDeviceConfig={updateDeviceConfig}
      />,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Configure' }))
    const input = screen.getByLabelText(/max message buffer/i)
    expect(input).toHaveValue(1000)

    await userEvent.clear(input)
    await userEvent.type(input, '50')
    const configureDialog = screen.getByRole('dialog')
    await userEvent.click(within(configureDialog).getByRole('button', { name: 'Apply' }))
    expect(
      screen.getByText(/enter an integer value from 100 to 1000000/i),
    ).toBeInTheDocument()
    expect(updateDeviceConfig).not.toHaveBeenCalled()

    await userEvent.clear(input)
    await userEvent.type(input, '1000001')
    await userEvent.click(within(configureDialog).getByRole('button', { name: 'Apply' }))
    expect(
      screen.getByText(/enter an integer value from 100 to 1000000/i),
    ).toBeInTheDocument()
    expect(updateDeviceConfig).not.toHaveBeenCalled()

    await userEvent.clear(input)
    await userEvent.type(input, '777')
    await userEvent.click(within(configureDialog).getByRole('button', { name: 'Apply' }))
    await waitFor(() => {
      expect(updateDeviceConfig).toHaveBeenCalledTimes(1)
    })
    const updater = updateDeviceConfig.mock.calls[0]?.[1] as
      | ((current: Record<string, unknown> | undefined) => Record<string, unknown>)
      | undefined
    expect(updateDeviceConfig.mock.calls[0]?.[0]).toBe(deviceRecord.id)
    expect(updater).toBeTypeOf('function')
    const next = updater?.({
      logging: {
        enabled: true,
        autoStartOnConnect: false,
        maxAnalogSamples: 123,
        retentionTrimBatchSize: 10,
      },
    })
    expect(next?.logging).toMatchObject({
      enabled: true,
      autoStartOnConnect: false,
      maxAnalogSamples: 123,
      retentionTrimBatchSize: 10,
      maxCapturedMessages: 777,
    })
  })

  it('keeps the current timestrip window while new logs arrive when scrolled away from the live end', async () => {
    stubResizeObserver()

    const driver = new TestLogDriver([buildMessage(0, 1)], [
      { ...buildAnalogSample(0), timestampUs: 0n, displayTimestampUs: 0n },
      { ...buildAnalogSample(1), timestampUs: 200_000n, displayTimestampUs: 200_000n },
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
      expect(driver.timeStripQueries.some((query) => query.windowStartUs === 100_000n)).toBe(true)
    })

    fireEvent.wheel(screen.getByTestId('drpd-usbpd-log-timestrip'), { deltaY: -320 })

    await waitFor(() => {
      expect(driver.timeStripQueries.some((query) => query.windowStartUs === 50_000n)).toBe(true)
    })

    const nextAnalog = { ...buildAnalogSample(2), timestampUs: 210_000n, displayTimestampUs: 210_000n }
    driver.analogRows = [...driver.analogRows, nextAnalog]
    await act(async () => {
      driver.dispatchEvent(
        new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
          detail: { kind: 'analog', row: nextAnalog },
        }),
      )
    })

    await waitFor(() => {
      expect(driver.timeStripQueries[driver.timeStripQueries.length - 1]?.windowStartUs).toBe(50_000n)
    })
  })

  it('follows the live edge when new logs arrive while the timestrip is at the end', async () => {
    stubResizeObserver()

    const driver = new TestLogDriver([buildMessage(0, 1)], [
      { ...buildAnalogSample(0), timestampUs: 0n, displayTimestampUs: 0n },
      { ...buildAnalogSample(1), timestampUs: 200_000n, displayTimestampUs: 200_000n },
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
      expect(driver.timeStripQueries.some((query) => query.windowStartUs === 100_000n)).toBe(true)
    })

    const nextAnalog = { ...buildAnalogSample(2), timestampUs: 210_000n, displayTimestampUs: 210_000n }
    driver.analogRows = [...driver.analogRows, nextAnalog]
    await act(async () => {
      driver.dispatchEvent(
        new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
          detail: { kind: 'analog', row: nextAnalog },
        }),
      )
    })

    await waitFor(() => {
      expect(driver.timeStripQueries[driver.timeStripQueries.length - 1]?.windowStartUs).toBe(110_000n)
    })
  })

  it('does not keep recentering the timestrip on a selected message as new logs arrive', async () => {
    stubResizeObserver()

    const driver = new TestLogDriver([
      { ...buildMessage(0, 1), startTimestampUs: 10_000n, endTimestampUs: 10_005n },
      { ...buildMessage(1, 3), startTimestampUs: 20_000n, endTimestampUs: 20_005n },
    ], [
      { ...buildAnalogSample(0), timestampUs: 0n, displayTimestampUs: 0n },
      { ...buildAnalogSample(1), timestampUs: 200_000n, displayTimestampUs: 200_000n },
    ])
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

    await screen.findByText('Accept')
    const rows = Array.from(container.querySelectorAll('[class*="dataRow"]'))
    await userEvent.click(rows[0] as HTMLElement)

    await waitFor(() => {
      expect(driver.timeStripQueries.some((query) => query.windowStartUs === 0n)).toBe(true)
    })

    fireEvent.wheel(screen.getByTestId('drpd-usbpd-log-timestrip'), { deltaY: 320 })

    await waitFor(() => {
      expect(driver.timeStripQueries.some((query) => query.windowStartUs === 50_000n)).toBe(true)
    })

    const nextAnalog = { ...buildAnalogSample(2), timestampUs: 210_000n, displayTimestampUs: 210_000n }
    driver.analogRows = [...driver.analogRows, nextAnalog]
    await act(async () => {
      driver.dispatchEvent(
        new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
          detail: { kind: 'analog', row: nextAnalog },
        }),
      )
    })

    await waitFor(() => {
      expect(driver.timeStripQueries[driver.timeStripQueries.length - 1]?.windowStartUs).toBe(50_000n)
    })
  })

  it('supports click unselect and ctrl/cmd multi-select', async () => {
    const driver = new TestLogDriver([buildMessage(0, 1), buildMessage(1, 3), buildMessage(2, 4)])
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
    await screen.findByText('Reject')
    const rows = Array.from(container.querySelectorAll('[class*="dataRow"]'))
    expect(rows.length).toBeGreaterThanOrEqual(3)

    await userEvent.click(rows[0] as HTMLElement)
    await waitFor(() => {
      expect(driver.logSelection.selectedKeys).toHaveLength(1)
    })

    await userEvent.click(rows[0] as HTMLElement)
    await waitFor(() => {
      expect(driver.logSelection.selectedKeys).toHaveLength(0)
    })

    fireEvent.click(rows[0] as HTMLElement, { ctrlKey: true })
    fireEvent.click(rows[1] as HTMLElement, { ctrlKey: true })
    await waitFor(() => {
      expect(driver.logSelection.selectedKeys).toHaveLength(2)
    })
  })

  it('supports shift-click range selection', async () => {
    const driver = new TestLogDriver([
      buildMessage(0, 1),
      buildMessage(1, 3),
      buildMessage(2, 4),
      buildMessage(3, 6),
    ])
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
    await screen.findByText('PS RDY')
    const rows = Array.from(container.querySelectorAll('[class*="dataRow"]'))

    await userEvent.click(rows[0] as HTMLElement)
    await waitFor(() => {
      expect(driver.logSelection.selectedKeys).toHaveLength(1)
    })
    fireEvent.click(rows[3] as HTMLElement, { shiftKey: true })
    await waitFor(() => {
      expect(driver.logSelection.selectedKeys).toHaveLength(4)
      expect(driver.logSelection.anchorIndex).toBe(0)
      expect(driver.logSelection.activeIndex).toBe(3)
    })
  })

  it('supports arrow navigation and shift-arrow range selection', async () => {
    const driver = new TestLogDriver([
      buildMessage(0, 1),
      buildMessage(1, 3),
      buildMessage(2, 4),
      buildMessage(3, 6),
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
    await screen.findByText('PS RDY')
    const viewport = screen.getByTestId('drpd-usbpd-log-viewport')

    await userEvent.click(viewport)
    await userEvent.keyboard('{ArrowDown}')
    expect(driver.logSelection.selectedKeys).toHaveLength(1)
    expect(driver.logSelection.activeIndex).toBe(0)

    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(driver.logSelection.selectedKeys).toHaveLength(2)
    expect(driver.logSelection.anchorIndex).toBe(0)
    expect(driver.logSelection.activeIndex).toBe(1)
  })

  it('clears selection when escape is pressed while the viewport has focus', async () => {
    const driver = new TestLogDriver([
      buildMessage(0, 1),
      buildMessage(1, 3),
      buildMessage(2, 4),
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

    await screen.findByText('Reject')
    const viewport = screen.getByTestId('drpd-usbpd-log-viewport')

    await userEvent.click(viewport)
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{ArrowDown}')
    expect(driver.logSelection.selectedKeys).toHaveLength(1)
    expect(driver.logSelection.activeIndex).toBe(1)

    await userEvent.keyboard('{Escape}')

    await waitFor(() => {
      expect(driver.logSelection.selectedKeys).toHaveLength(0)
      expect(driver.logSelection.anchorIndex).toBeNull()
      expect(driver.logSelection.activeIndex).toBeNull()
    })
  })
})
