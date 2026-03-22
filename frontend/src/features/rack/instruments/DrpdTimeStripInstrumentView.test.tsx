import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import type { RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdTimeStripInstrumentView } from './DrpdTimeStripInstrumentView'
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
  id: 'inst-timestrip',
  instrumentIdentifier: 'com.mta.drpd.timestrip',
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
        value: 100,
      })
      this.callback(
        [
          {
            target,
            contentRect: {
              width: 640,
              height: 100,
              x: 0,
              y: 0,
              top: 0,
              left: 0,
              bottom: 100,
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

const renderTimeStrip = (driver: TestLogDriver) => {
  const deviceState: RackDeviceState = {
    record: {
      id: 'device-1',
      identifier: 'com.mta.drpd',
      displayName: 'Dr. PD',
      vendorId: 0x2e8a,
      productId: 0x000a,
    },
    status: 'connected',
    drpdDriver: driver as unknown as RackDeviceState['drpdDriver'],
  }

  return render(
    <DrpdTimeStripInstrumentView
      instrument={buildInstrument()}
      displayName="Timestrip"
      deviceState={deviceState}
      isEditMode={false}
    />,
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('DrpdTimeStripInstrumentView', () => {
  it('renders the standalone timestrip and fetches timeline data', async () => {
    stubResizeObserver()
    const driver = new TestLogDriver([buildMessage(0, 1)])

    renderTimeStrip(driver)

    expect(await screen.findByText('Timestrip')).toBeInTheDocument()
    expect(await screen.findByTestId('drpd-usbpd-log-timestrip')).toBeInTheDocument()
    await waitFor(() => {
      expect(driver.timeStripQueries.length).toBeGreaterThan(0)
    })
  })

  it('keeps the pulse trace baseline visible when there are no captured messages', async () => {
    stubResizeObserver()
    const driver = new TestLogDriver([], [buildAnalogSample(0), buildAnalogSample(1)])

    const { container } = renderTimeStrip(driver)

    expect(await screen.findByTestId('drpd-usbpd-log-timestrip')).toBeInTheDocument()
    await waitFor(() => {
      const pulseBaseline = container.querySelector('line[stroke="var(--timestrip-pulse-stroke)"]')
      expect(pulseBaseline).not.toBeNull()
    })
  })

  it('renders shared-color event markers in the standalone strip', async () => {
    stubResizeObserver()
    const driver = new TestLogDriver([
      buildMessage(0, 1),
      buildEvent(1, 'Capture turned off', 'capture_changed'),
      buildEvent(2, 'CC role changed', 'cc_role_changed'),
      buildEvent(3, 'Device status changed', 'cc_status_changed'),
      buildEvent(4, 'Mark', 'mark'),
      buildEvent(5, 'VBUS OVP event', 'vbus_ovp'),
      buildEvent(6, 'VBUS OCP event', 'vbus_ocp'),
    ])

    const { container } = renderTimeStrip(driver)

    await waitFor(() => {
      const eventMarkers = Array.from(
        container.querySelectorAll('line[stroke^="var(--timestrip-event-"]'),
      )
      expect(eventMarkers).toHaveLength(12)
      expect(eventMarkers.filter((line) => line.getAttribute('stroke') === 'var(--timestrip-event-capture-stroke)')).toHaveLength(2)
      expect(eventMarkers.filter((line) => line.getAttribute('stroke') === 'var(--timestrip-event-role-stroke)')).toHaveLength(2)
      expect(eventMarkers.filter((line) => line.getAttribute('stroke') === 'var(--timestrip-event-status-stroke)')).toHaveLength(2)
      expect(eventMarkers.filter((line) => line.getAttribute('stroke') === 'var(--timestrip-event-mark-stroke)')).toHaveLength(2)
      expect(eventMarkers.filter((line) => line.getAttribute('stroke') === 'var(--timestrip-event-ovp-stroke)')).toHaveLength(2)
      expect(eventMarkers.filter((line) => line.getAttribute('stroke') === 'var(--timestrip-event-ocp-stroke)')).toHaveLength(2)
    })
  })

  it('keeps the current window while new logs arrive when scrolled away from the live end', async () => {
    stubResizeObserver()
    const driver = new TestLogDriver([buildMessage(0, 1)], [
      { ...buildAnalogSample(0), timestampUs: 0n, displayTimestampUs: 0n },
      { ...buildAnalogSample(1), timestampUs: 200_000n, displayTimestampUs: 200_000n },
    ])

    renderTimeStrip(driver)

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
      expect(driver.timeStripQueries.at(-1)?.windowStartUs).toBe(50_000n)
    })
  })

  it('follows the live edge when new logs arrive while at the end', async () => {
    stubResizeObserver()
    const driver = new TestLogDriver([buildMessage(0, 1)], [
      { ...buildAnalogSample(0), timestampUs: 0n, displayTimestampUs: 0n },
      { ...buildAnalogSample(1), timestampUs: 200_000n, displayTimestampUs: 200_000n },
    ])

    renderTimeStrip(driver)

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
      expect(driver.timeStripQueries.at(-1)?.windowStartUs).toBe(110_000n)
    })
  })

  it('does not keep recentering on a selected message as new logs arrive', async () => {
    stubResizeObserver()
    const selectedMessage = {
      ...buildMessage(0, 1),
      startTimestampUs: 10_000n,
      endTimestampUs: 10_005n,
    } satisfies LoggedCapturedMessage
    const driver = new TestLogDriver([
      selectedMessage,
      { ...buildMessage(1, 3), startTimestampUs: 20_000n, endTimestampUs: 20_005n },
    ], [
      { ...buildAnalogSample(0), timestampUs: 0n, displayTimestampUs: 0n },
      { ...buildAnalogSample(1), timestampUs: 200_000n, displayTimestampUs: 200_000n },
    ])

    renderTimeStrip(driver)

    await act(async () => {
      await driver.setLogSelectionState({
        selectedKeys: [buildCapturedLogSelectionKey(selectedMessage)],
        anchorIndex: 0,
        activeIndex: 0,
      })
    })

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
      expect(driver.timeStripQueries.at(-1)?.windowStartUs).toBe(50_000n)
    })
  })

  it('centers on the timestamp of a selected event from shared driver state', async () => {
    stubResizeObserver()
    const earlyEvent = {
      ...buildEvent(1, 'Capture turned off', 'capture_changed'),
      startTimestampUs: 10_000n,
      endTimestampUs: 10_000n,
    } satisfies LoggedCapturedMessage
    const driver = new TestLogDriver([
      buildMessage(0, 1),
      earlyEvent,
      { ...buildMessage(2, 4), startTimestampUs: 260_000n, endTimestampUs: 260_005n, displayTimestampUs: 260_000n },
    ], [
      { ...buildAnalogSample(0), timestampUs: 0n, displayTimestampUs: 0n },
      { ...buildAnalogSample(1), timestampUs: 260_000n, displayTimestampUs: 260_000n },
    ])

    renderTimeStrip(driver)

    await waitFor(() => {
      expect(driver.timeStripQueries.length).toBeGreaterThan(0)
    })

    await act(async () => {
      await driver.setLogSelectionState({
        selectedKeys: [buildCapturedLogSelectionKey(earlyEvent)],
        anchorIndex: 1,
        activeIndex: 1,
      })
    })

    await waitFor(() => {
      expect(driver.timeStripQueries.at(-1)?.windowStartUs).toBe(0n)
    })
  })

  it('centers on the start of a selected message from shared driver state', async () => {
    stubResizeObserver()
    const selectedMessage = {
      ...buildMessage(1, 3),
      startTimestampUs: 120_000n,
      endTimestampUs: 120_005n,
      displayTimestampUs: 120_000n,
    } satisfies LoggedCapturedMessage
    const driver = new TestLogDriver([
      { ...buildMessage(0, 1), startTimestampUs: 0n, endTimestampUs: 5n, displayTimestampUs: 0n },
      selectedMessage,
      { ...buildMessage(2, 4), startTimestampUs: 260_000n, endTimestampUs: 260_005n, displayTimestampUs: 260_000n },
    ], [
      { ...buildAnalogSample(0), timestampUs: 0n, displayTimestampUs: 0n },
      { ...buildAnalogSample(1), timestampUs: 260_000n, displayTimestampUs: 260_000n },
    ])

    renderTimeStrip(driver)

    await act(async () => {
      await driver.setLogSelectionState({
        selectedKeys: [buildCapturedLogSelectionKey(selectedMessage)],
        anchorIndex: 1,
        activeIndex: 1,
      })
    })

    await waitFor(() => {
      expect(driver.timeStripQueries.at(-1)?.windowStartUs).toBe(70_000n)
    })
  })

  it('clears the strip state when logs are cleared', async () => {
    stubResizeObserver()
    const driver = new TestLogDriver([buildMessage(0, 1)], [
      { ...buildAnalogSample(0), timestampUs: 0n, displayTimestampUs: 0n },
      { ...buildAnalogSample(1), timestampUs: 200_000n, displayTimestampUs: 200_000n },
    ])

    renderTimeStrip(driver)

    await waitFor(() => {
      expect(driver.timeStripQueries.some((query) => query.windowStartUs === 100_000n)).toBe(true)
    })

    await act(async () => {
      await driver.clearLogs('all')
    })

    await waitFor(() => {
      expect(driver.timeStripQueries.at(-1)?.windowStartUs).toBe(0n)
    })
  })
})
