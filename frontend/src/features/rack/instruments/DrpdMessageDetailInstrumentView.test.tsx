import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  DRPDDevice,
  type DRPDLogSelectionState,
  type LoggedCapturedMessage,
} from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdMessageDetailInstrumentView } from './DrpdMessageDetailInstrumentView'

class TestSelectionDriver extends EventTarget {
  public logSelection: DRPDLogSelectionState
  public rows: LoggedCapturedMessage[]

  public constructor(logSelection: DRPDLogSelectionState, rows: LoggedCapturedMessage[] = []) {
    super()
    this.logSelection = logSelection
    this.rows = rows
  }

  public getLogSelectionState(): DRPDLogSelectionState | Promise<DRPDLogSelectionState> {
    return this.logSelection
  }

  public async queryCapturedMessages(query: {
    startTimestampUs: bigint
    endTimestampUs: bigint
  }): Promise<LoggedCapturedMessage[]> {
    return this.rows.filter(
      (row) =>
        row.startTimestampUs >= query.startTimestampUs &&
        row.startTimestampUs <= query.endTimestampUs,
    )
  }

  public setLogSelectionState(logSelection: DRPDLogSelectionState): void {
    this.logSelection = logSelection
    this.dispatchEvent(
      new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
        detail: { changed: ['logSelection'] },
      }),
    )
  }
}

const buildInstrument = (): RackInstrument => ({
  id: 'inst-message-detail',
  instrumentIdentifier: 'com.mta.drpd.message-detail',
})

const buildDeviceRecord = (): RackDeviceRecord => ({
  id: 'device-1',
  identifier: 'com.mta.drpd',
  displayName: 'Dr. PD',
  vendorId: 0x2e8a,
  productId: 0x000a,
})

const buildMessageRow = (
  overrides: Partial<LoggedCapturedMessage> = {},
): LoggedCapturedMessage => ({
  entryKind: 'message',
  eventType: null,
  eventText: null,
  eventWallClockMs: null,
  startTimestampUs: 1000n,
  endTimestampUs: 1005n,
  displayTimestampUs: 0n,
  decodeResult: 0,
  sopKind: 'SOP',
  messageKind: 'CONTROL',
  messageType: 3,
  messageId: 1,
  senderPowerRole: 'SOURCE',
  senderDataRole: 'DFP',
  pulseCount: 4,
  rawPulseWidths: Float64Array.from([1, 2, 3, 4]),
  rawSop: Uint8Array.from([0x18, 0x18, 0x18, 0x11]),
  rawDecodedData: Uint8Array.from([0xa3, 0x03, 0x6f, 0xac, 0xfa, 0x5d]),
  parseError: null,
  createdAtMs: 1_700_000_000_000,
  ...overrides,
})

const buildDeviceState = (
  selection: DRPDLogSelectionState,
  rows: LoggedCapturedMessage[] = [],
): RackDeviceState => ({
  record: buildDeviceRecord(),
  status: 'connected',
  drpdDriver: new TestSelectionDriver(selection, rows) as unknown as RackDeviceState['drpdDriver'],
})

describe('DrpdMessageDetailInstrumentView', () => {
  it('shows the inspect prompt when nothing is selected', async () => {
    render(
      <DrpdMessageDetailInstrumentView
        instrument={buildInstrument()}
        displayName="MESSAGE DETAIL"
        deviceState={buildDeviceState({
          selectedKeys: [],
          anchorIndex: null,
          activeIndex: null,
        })}
        isEditMode={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Select a message to inspect.')).toBeInTheDocument()
    })
  })

  it('shows the single-message placeholder when exactly one message is selected', async () => {
    const row = buildMessageRow()
    render(
      <DrpdMessageDetailInstrumentView
        instrument={buildInstrument()}
        displayName="MESSAGE DETAIL"
        deviceState={buildDeviceState({
          selectedKeys: ['message:1000:1005:1700000000000'],
          anchorIndex: 0,
          activeIndex: 0,
        }, [row])}
        isEditMode={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('1 message selected')).toBeInTheDocument()
    })
    expect(screen.getByText('1 message selected').parentElement).toHaveClass(/singleSelectionContainer/)
    expect(await screen.findByRole('button', { name: /base information/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: /technical data/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: /header data/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: /message-specific data/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('returns to the inspect prompt when multiple messages are selected', async () => {
    const deviceState = buildDeviceState({
      selectedKeys: ['message:1000:1005:1'],
      anchorIndex: 0,
      activeIndex: 0,
    })
    const driver = deviceState.drpdDriver as unknown as TestSelectionDriver

    render(
      <DrpdMessageDetailInstrumentView
        instrument={buildInstrument()}
        displayName="MESSAGE DETAIL"
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    act(() => {
      driver.setLogSelectionState({
        selectedKeys: ['message:1000:1005:1', 'message:1010:1015:2'],
        anchorIndex: 0,
        activeIndex: 1,
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Select a message to inspect.')).toBeInTheDocument()
    })
    expect(screen.getByText('Select a message to inspect.').parentElement).toHaveClass(
      /emptyStateContainer/,
    )
  })

  it('loads single-selection state from async drivers', async () => {
    class AsyncSelectionDriver extends TestSelectionDriver {
      public override async getLogSelectionState(): Promise<DRPDLogSelectionState> {
        return this.logSelection
      }
    }

    const row = buildMessageRow()
    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: new AsyncSelectionDriver({
        selectedKeys: ['message:1000:1005:1700000000000'],
        anchorIndex: 0,
        activeIndex: 0,
      }, [row]) as unknown as RackDeviceState['drpdDriver'],
    }

    render(
      <DrpdMessageDetailInstrumentView
        instrument={buildInstrument()}
        displayName="MESSAGE DETAIL"
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('1 message selected')).toBeInTheDocument()
    })
  })

  it('renders metadata sections and toggles their placeholder content', async () => {
    const user = userEvent.setup()
    const row = buildMessageRow()

    render(
      <DrpdMessageDetailInstrumentView
        instrument={buildInstrument()}
        displayName="MESSAGE DETAIL"
        deviceState={buildDeviceState(
          {
            selectedKeys: ['message:1000:1005:1700000000000'],
            anchorIndex: 0,
            activeIndex: 0,
          },
          [row],
        )}
        isEditMode={false}
      />,
    )

    const baseInformationToggle = await screen.findByRole('button', {
      name: /base information/i,
    })

    expect(screen.getAllByText('Placeholder content')).toHaveLength(4)
    expect(baseInformationToggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(baseInformationToggle)

    await waitFor(() => {
      expect(baseInformationToggle).toHaveAttribute('aria-expanded', 'false')
    })
    expect(screen.getAllByText('Placeholder content')).toHaveLength(3)

    await user.click(baseInformationToggle)

    await waitFor(() => {
      expect(baseInformationToggle).toHaveAttribute('aria-expanded', 'true')
    })
    expect(screen.getAllByText('Placeholder content')).toHaveLength(4)
  })
})
