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
import {
  CONTROL_MESSAGE_TYPES,
  DATA_MESSAGE_TYPES,
  EXTENDED_MESSAGE_TYPES,
} from '../../../lib/device/drpd/usb-pd/message'
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
    const eventRows = this.rows.filter(
      (row): row is LoggedCapturedMessage & { eventType: NonNullable<LoggedCapturedMessage['eventType']> } =>
        row.entryKind === 'event' && row.eventType !== null,
    )
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
    const timeAnchors = [
      ...messageRows.flatMap((row) => (
        row.displayTimestampUs === null
          ? []
          : [{
              timestampUs: row.startTimestampUs,
              displayTimestampUs: row.displayTimestampUs,
              wallClockUs: BigInt(row.createdAtMs) * 1000n,
              approximate: false,
            }]
      )),
      ...this.analogRows.flatMap((row) => (
        row.displayTimestampUs === null
          ? []
          : [{
              timestampUs: row.timestampUs,
              displayTimestampUs: row.displayTimestampUs,
              wallClockUs: BigInt(row.createdAtMs) * 1000n,
              approximate: false,
            }]
      )),
    ]
    return {
      windowStartUs: query.windowStartUs,
      windowEndUs: query.windowStartUs + query.windowDurationUs,
      windowDurationUs: query.windowDurationUs,
      earliestTimestampUs,
      latestTimestampUs,
      earliestDisplayTimestampUs,
      latestDisplayTimestampUs,
      windowStartDisplayTimestampUs: earliestDisplayTimestampUs,
      windowEndDisplayTimestampUs: latestDisplayTimestampUs,
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
        wallClockUs: BigInt(row.createdAtMs) * 1000n,
        sopLabel: normalizeSopType(row.sopKind),
        messageLabel: resolvePulseMessageLabel(row),
        pulseWidthsNs: row.rawPulseWidths,
      })),
      analogPoints: this.analogRows.slice(0, query.analogPointBudget).map((row) => ({
        timestampUs: row.timestampUs,
        displayTimestampUs: row.displayTimestampUs,
        wallClockUs: BigInt(row.createdAtMs) * 1000n,
        vbusV: row.vbusV,
        ibusA: row.ibusA,
      })),
      events: eventRows.map((row) => ({
        selectionKey: buildCapturedLogSelectionKey(row),
        eventType: row.eventType,
        timestampUs: row.startTimestampUs,
        displayTimestampUs: row.displayTimestampUs,
        wallClockUs: BigInt(row.createdAtMs) * 1000n,
      })),
      timeAnchors,
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

const normalizeSopType = (value: string | null): string | null => {
  switch (value) {
    case 'SOP':
      return 'SOP'
    case 'SOP_PRIME':
      return "SOP'"
    case 'SOP_DOUBLE_PRIME':
      return "SOP''"
    case 'SOP_DEBUG_PRIME':
      return "SOP'-D"
    case 'SOP_DEBUG_DOUBLE_PRIME':
      return "SOP''-D"
    default:
      return null
  }
}

const resolvePulseMessageLabel = (row: LoggedCapturedMessage): string | null => {
  if (!row.messageKind || row.messageType == null) {
    return null
  }
  const mapping =
    row.messageKind === 'CONTROL'
      ? CONTROL_MESSAGE_TYPES[row.messageType]
      : row.messageKind === 'DATA'
        ? DATA_MESSAGE_TYPES[row.messageType]
        : row.messageKind === 'EXTENDED'
          ? EXTENDED_MESSAGE_TYPES[row.messageType]
          : undefined
  return mapping?.name.replaceAll('_', ' ') ?? `${row.messageKind} ${row.messageType}`
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
  wallClockUs: BigInt(1_700_000_000_000_000 + index * 10),
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
  wallClockUs: BigInt(1_700_000_000_000_000 + index * 20),
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
  wallClockUs: BigInt(1_700_000_100_000_000 + index),
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
  it('renders the message table without the timestrip', async () => {
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

    expect(await screen.findByText('Wall time')).toBeInTheDocument()
    expect(screen.queryByTestId('drpd-usbpd-log-timestrip')).not.toBeInTheDocument()
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

  it('renders full-width event rows with shared event colors', async () => {
    const driver = new TestLogDriver([
      buildMessage(0, 1),
      buildEvent(1, 'Capture turned off at 2026-02-28 10:00:00', 'capture_changed'),
      buildEvent(2, 'CC role changed to SOURCE at 2026-02-28 10:00:01', 'cc_role_changed'),
      buildEvent(3, 'Device status changed to ATTACHED at 2026-02-28 10:00:02', 'cc_status_changed'),
      buildEvent(4, 'VBUS OVP event at 2026-02-28 10:00:03', 'vbus_ovp'),
      buildEvent(5, 'VBUS OCP event at 2026-02-28 10:00:04', 'vbus_ocp'),
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

    expect(
      await screen.findByText((content) => content.includes('Capture turned off at 2026-02-28 10:00:00')),
    ).toBeInTheDocument()
    const eventRow = container.querySelector('[class*="eventRowCapture"]')
    expect(eventRow).not.toBeNull()
    expect(container.querySelector('[class*="eventRowOvp"]')).not.toBeNull()
    expect(container.querySelector('[class*="eventRowOcp"]')).not.toBeNull()
    const eventLabel = container.querySelector('[class*="eventLabel"]')
    expect(eventLabel).not.toBeNull()
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

    expect(await screen.findByText((content) => content.includes('CC role changed to SINK'))).toBeInTheDocument()

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
    const updateCalls = updateDeviceConfig.mock.calls as unknown as Array<
      [string, (current: Record<string, unknown> | undefined) => Record<string, unknown>]
    >
    const [updatedDeviceRecordId, updater] = updateCalls[0] ?? []
    expect(updatedDeviceRecordId).toBe(deviceRecord.id)
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
