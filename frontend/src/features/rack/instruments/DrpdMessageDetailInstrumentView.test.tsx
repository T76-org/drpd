import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as deviceModule from '../../../lib/device'
import {
  DRPDDevice,
  type DRPDLogSelectionState,
  type LoggedCapturedMessage,
} from '../../../lib/device'
import { HumanReadableField } from '../../../lib/device/drpd/usb-pd/humanReadableField'
import type { Message } from '../../../lib/device/drpd/usb-pd/messageBase'
import { buildMessage, makeExtendedHeader, makeMessageHeader, toBytes32 } from '../../../lib/device/drpd/usb-pd/messages/messageTestUtils'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdMessageDetailInstrumentView } from './DrpdMessageDetailInstrumentView'

class TestSelectionDriver extends EventTarget {
  public logSelection: DRPDLogSelectionState
  public rows: LoggedCapturedMessage[]
  public lastQuery:
    | {
        startTimestampUs: bigint
        endTimestampUs: bigint
        sortOrder?: 'asc' | 'desc'
        limit?: number
      }
    | null = null

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
    sortOrder?: 'asc' | 'desc'
    limit?: number
  }): Promise<LoggedCapturedMessage[]> {
    this.lastQuery = query
    const filtered = this.rows.filter(
      (row) =>
        row.startTimestampUs >= query.startTimestampUs &&
        row.startTimestampUs <= query.endTimestampUs,
    )
    const sorted = [...filtered].sort((left, right) =>
      left.startTimestampUs < right.startTimestampUs
        ? -1
        : left.startTimestampUs > right.startTimestampUs
          ? 1
          : left.createdAtMs - right.createdAtMs,
    )
    const ordered = query.sortOrder === 'desc' ? sorted.reverse() : sorted
    return query.limit ? ordered.slice(0, query.limit) : ordered
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

const createStorage = (): Storage => {
  const store = new Map<string, string>()
  return {
    clear: () => {
      store.clear()
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    get length() {
      return store.size
    },
  }
}

vi.stubGlobal('localStorage', createStorage())

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
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

  it('shows decoded metadata rows when exactly one message is selected', async () => {
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
      expect(screen.getByRole('button', { name: /base information/i })).toBeInTheDocument()
    })
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
    const baseInformationSection = screen.getByRole('button', { name: /base information/i }).closest('section')
    expect(baseInformationSection).not.toBeNull()
    expect(within(baseInformationSection as HTMLElement).getByText('Message Type')).toBeInTheDocument()
    expect(within(baseInformationSection as HTMLElement).getByText('Accept')).toBeInTheDocument()
    expect(screen.getByText('Technical Data')).toBeInTheDocument()
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
      expect(screen.getByRole('button', { name: /base information/i })).toBeInTheDocument()
    })
  })

  it('renders recursive dictionary and byte-data content and toggles sections', async () => {
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
    const technicalDataSection = screen.getByRole('button', { name: /technical data/i }).closest('section')

    expect(within(baseInformationToggle.closest('section') as HTMLElement).getByText('Message Type')).toBeInTheDocument()
    expect(within(baseInformationToggle.closest('section') as HTMLElement).getByText('Accept')).toBeInTheDocument()
    expect(within(technicalDataSection as HTMLElement).getByText('Timing Information')).toBeInTheDocument()
    expect(within(technicalDataSection as HTMLElement).getByText('Pulse Count')).toBeInTheDocument()
    expect(within(technicalDataSection as HTMLElement).getByText('4')).toBeInTheDocument()
    expect(within(technicalDataSection as HTMLElement).getByText('Type')).toBeInTheDocument()
    expect(within(technicalDataSection as HTMLElement).getAllByText('SOP')).toHaveLength(2)
    expect(within(technicalDataSection as HTMLElement).getByText('K-Codes')).toBeInTheDocument()
    expect(within(technicalDataSection as HTMLElement).getAllByText('18 18 18 11')).toHaveLength(2)
    expect(within(technicalDataSection as HTMLElement).getByText('A3 03')).toHaveAttribute(
      'title',
      expect.stringContaining('Message header'),
    )
    expect(within(technicalDataSection as HTMLElement).getByText('6F AC FA 5D')).toHaveAttribute(
      'title',
      expect.stringContaining('CRC32'),
    )
    expect(baseInformationToggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(baseInformationToggle)

    await waitFor(() => {
      expect(baseInformationToggle).toHaveAttribute('aria-expanded', 'false')
    })
    expect(within(baseInformationToggle.closest('section') as HTMLElement).queryByText('Message Type')).toBeNull()

    await user.click(baseInformationToggle)

    await waitFor(() => {
      expect(baseInformationToggle).toHaveAttribute('aria-expanded', 'true')
    })
    expect(within(baseInformationToggle.closest('section') as HTMLElement).getByText('Message Type')).toBeInTheDocument()
  })

  it('renders segmented message bytes with tooltips for each message role', async () => {
    const row = buildMessageRow()
    const metadata = {
      baseInformation: HumanReadableField.orderedDictionary('Base Information', 'Base information container.'),
      technicalData: HumanReadableField.orderedDictionary(
        'Technical Data',
        'Technical data container.',
        [[
          'messageBytes',
          HumanReadableField.byteData(
            Uint8Array.from([0x18, 0x18, 0x18, 0x11, 0x81, 0x10, 0x34, 0x12, 0xaa, 0xbb, 0x01, 0x02, 0x03, 0x04]),
            8,
            false,
            'Message Bytes',
            'Segmented message bytes.',
          ),
        ]],
      ),
      headerData: HumanReadableField.orderedDictionary('Header Data', 'Header data container.'),
      messageSpecificData: HumanReadableField.orderedDictionary(
        'Message-Specific Data',
        'Message-specific data container.',
      ),
    }
    vi.spyOn(deviceModule, 'decodeLoggedCapturedMessageWithContext').mockReturnValue({
      kind: 'message',
      row,
      message: {
        humanReadableMetadata: metadata,
        payload: Uint8Array.from([0x18, 0x18, 0x18, 0x11, 0x81, 0x10, 0x34, 0x12, 0xaa, 0xbb, 0x01, 0x02, 0x03, 0x04]),
        payloadOffset: 8,
        sop: { kind: 'SOP_PRIME' },
        header: {
          messageHeader: {
            extended: true,
            numberOfDataObjects: 0,
          },
          extendedHeader: {
            dataSize: 2,
          },
        },
      } as unknown as Message,
    })

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

    const technicalDataSection = (await screen.findByRole('button', { name: /technical data/i })).closest('section')
    const sopSegment = within(technicalDataSection as HTMLElement)
      .getAllByText('18 18 18 11')
      .find((element) => element.getAttribute('title')?.includes("SOP: SOP'"))
    expect(sopSegment).toHaveAttribute('title', expect.stringContaining("SOP: SOP'"))
    expect(within(technicalDataSection as HTMLElement).getByText('81 10')).toHaveAttribute(
      'title',
      expect.stringContaining('Message header'),
    )
    expect(within(technicalDataSection as HTMLElement).getByText('34 12')).toHaveAttribute(
      'title',
      expect.stringContaining('Extended header'),
    )
    expect(within(technicalDataSection as HTMLElement).getByText('AA BB')).toHaveAttribute(
      'title',
      expect.stringContaining('Message body'),
    )
    expect(within(technicalDataSection as HTMLElement).getByText('01 02 03 04')).toHaveAttribute(
      'title',
      expect.stringContaining('CRC32'),
    )
  })

  it('preserves collapsed section state across message selection changes', async () => {
    const user = userEvent.setup()
    const firstRow = buildMessageRow()
    const secondRow = buildMessageRow({
      startTimestampUs: 2000n,
      endTimestampUs: 2005n,
      displayTimestampUs: 1000n,
      messageId: 2,
      createdAtMs: 1_700_000_000_100,
    })
    const deviceState = buildDeviceState(
      {
        selectedKeys: ['message:1000:1005:1700000000000'],
        anchorIndex: 0,
        activeIndex: 0,
      },
      [firstRow, secondRow],
    )
    const driver = deviceState.drpdDriver as unknown as TestSelectionDriver

    render(
      <DrpdMessageDetailInstrumentView
        instrument={buildInstrument()}
        displayName="MESSAGE DETAIL"
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    const technicalDataToggle = await screen.findByRole('button', {
      name: /technical data/i,
    })
    const technicalDataSection = technicalDataToggle.closest('section') as HTMLElement
    expect(within(technicalDataSection).getByText('Timing Information')).toBeInTheDocument()

    await user.click(technicalDataToggle)

    await waitFor(() => {
      expect(technicalDataToggle).toHaveAttribute('aria-expanded', 'false')
    })
    expect(within(technicalDataSection).queryByText('Timing Information')).toBeNull()

    act(() => {
      driver.setLogSelectionState({
        selectedKeys: ['message:2000:2005:1700000000100'],
        anchorIndex: 1,
        activeIndex: 1,
      })
    })

    await waitFor(() => {
      expect(technicalDataToggle).toHaveAttribute('aria-expanded', 'false')
    })
    expect(within(technicalDataSection).queryByText('Timing Information')).toBeNull()
  })

  it('preserves collapsed section state after remount', async () => {
    const user = userEvent.setup()
    const row = buildMessageRow()
    const deviceState = buildDeviceState(
      {
        selectedKeys: ['message:1000:1005:1700000000000'],
        anchorIndex: 0,
        activeIndex: 0,
      },
      [row],
    )

    const firstRender = render(
      <DrpdMessageDetailInstrumentView
        instrument={buildInstrument()}
        displayName="MESSAGE DETAIL"
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    const technicalDataToggle = await screen.findByRole('button', {
      name: /technical data/i,
    })
    await user.click(technicalDataToggle)

    await waitFor(() => {
      expect(technicalDataToggle).toHaveAttribute('aria-expanded', 'false')
    })

    firstRender.unmount()

    render(
      <DrpdMessageDetailInstrumentView
        instrument={buildInstrument()}
        displayName="MESSAGE DETAIL"
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /technical data/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    })
  })

  it('renders nested table fields inside the value column', async () => {
    const row = buildMessageRow()
    const tableField = HumanReadableField.table('Example Table', 'Example nested table.', [
      {
        kind: 'header',
        field: HumanReadableField.string('Byte', 'Byte Header', 'Header label'),
      },
      {
        kind: 'value',
        field: HumanReadableField.string('0x2A', 'Hex Value', 'Hex cell value'),
      },
      {
        kind: 'header',
        field: HumanReadableField.string('Meaning', 'Meaning Header', 'Meaning header'),
      },
      {
        kind: 'value',
        field: HumanReadableField.string('Answer', 'Meaning Value', 'Meaning value'),
      },
    ])
    const metadata = {
      baseInformation: HumanReadableField.orderedDictionary(
        'Base Information',
        'Base information container.',
        [['exampleTable', tableField]],
      ),
      technicalData: HumanReadableField.orderedDictionary('Technical Data', 'Technical data container.'),
      headerData: HumanReadableField.orderedDictionary('Header Data', 'Header data container.'),
      messageSpecificData: HumanReadableField.orderedDictionary(
        'Message-Specific Data',
        'Message-specific data container.',
      ),
    }
    vi.spyOn(deviceModule, 'decodeLoggedCapturedMessageWithContext').mockReturnValue({
      kind: 'message',
      row,
      message: {
        humanReadableMetadata: metadata,
      } as unknown as ReturnType<typeof deviceModule.decodeLoggedCapturedMessage> extends { kind: 'message'; message: infer T } ? T : never,
    })

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

    await waitFor(() => {
      expect(screen.getByText('Example Table')).toBeInTheDocument()
    })
    expect(screen.getByText('Byte')).toBeInTheDocument()
    expect(screen.getByText('0x2A')).toBeInTheDocument()
    expect(screen.getByText('Meaning')).toBeInTheDocument()
    expect(screen.getByText('Answer')).toBeInTheDocument()
  })

  it('shows and dismisses field description popups', async () => {
    const user = userEvent.setup()
    const row = buildMessageRow()
    const metadata = {
      baseInformation: HumanReadableField.orderedDictionary('Base Information', 'Base information container.'),
      technicalData: HumanReadableField.orderedDictionary(
        'Technical Data',
        'Technical data container.',
        [
          [
            'messageType',
            HumanReadableField.string('Accept', 'Message Type', 'Explains the message type field.'),
          ],
          [
            'details',
            HumanReadableField.orderedDictionary('Details', 'Explains the details container.', [
              [
                'meaning',
                HumanReadableField.string('Answer', 'Meaning', 'Explains the nested meaning field.'),
              ],
            ]),
          ],
        ],
      ),
      headerData: HumanReadableField.orderedDictionary('Header Data', 'Header data container.'),
      messageSpecificData: HumanReadableField.orderedDictionary(
        'Message-Specific Data',
        'Message-specific data container.',
      ),
    }
    vi.spyOn(deviceModule, 'decodeLoggedCapturedMessageWithContext').mockReturnValue({
      kind: 'message',
      row,
      message: {
        humanReadableMetadata: metadata,
      } as unknown as ReturnType<typeof deviceModule.decodeLoggedCapturedMessage> extends { kind: 'message'; message: infer T } ? T : never,
    })

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

    const scalarHelpButton = await screen.findByRole('button', {
      name: 'Show description for Message Type',
    })
    await user.click(scalarHelpButton)
    expect(screen.getByText('Explains the message type field.')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByText('Explains the message type field.')).toBeNull()
    })

    const compositeHelpButton = screen.getByRole('button', {
      name: 'Show description for Details',
    })
    await user.click(compositeHelpButton)
    expect(screen.getByText('Explains the details container.')).toBeInTheDocument()

    await user.click(document.body)
    await waitFor(() => {
      expect(screen.queryByText('Explains the details container.')).toBeNull()
    })
  })

  it('does not show help buttons for base information fields', async () => {
    const row = buildMessageRow()
    const metadata = {
      baseInformation: HumanReadableField.orderedDictionary(
        'Base Information',
        'Base information container.',
        [[
          'messageType',
          HumanReadableField.string('Accept', 'Message Type', 'Explains the message type field.'),
        ]],
      ),
      technicalData: HumanReadableField.orderedDictionary('Technical Data', 'Technical data container.'),
      headerData: HumanReadableField.orderedDictionary('Header Data', 'Header data container.'),
      messageSpecificData: HumanReadableField.orderedDictionary(
        'Message-Specific Data',
        'Message-specific data container.',
      ),
    }
    vi.spyOn(deviceModule, 'decodeLoggedCapturedMessageWithContext').mockReturnValue({
      kind: 'message',
      row,
      message: {
        humanReadableMetadata: metadata,
      } as unknown as ReturnType<typeof deviceModule.decodeLoggedCapturedMessage> extends { kind: 'message'; message: infer T } ? T : never,
    })

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

    await waitFor(() => {
      expect(screen.getByText('Message Type')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Show description for Message Type' })).toBeNull()
  })

  it('shows invalid message state when the selected message cannot be decoded', async () => {
    const row = buildMessageRow({
      decodeResult: 2,
    })

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

    await waitFor(() => {
      expect(screen.getByText('invalid')).toBeInTheDocument()
    })
    expect(screen.getByText('invalid')).toHaveClass(/invalidMessageState/)
  })

  it('uses prior rows to decode terminal chunked extended-message selections', async () => {
    const sop = [0x18, 0x18, 0x18, 0x11]
    const messageHeader = makeMessageHeader({
      extended: true,
      numberOfDataObjects: 1,
      messageTypeNumber: 0x11,
      roleBit: 1,
      dataRoleBit: 1,
      specRevisionBits: 0b10,
    })
    const pdo1 = 0x0001912c
    const pdo2 = 0x0002d12c
    const chunk0 = buildMessage(
      sop,
      messageHeader,
      [...toBytes32(pdo1), 0xaa, 0xbb, 0xcc, 0xdd],
      makeExtendedHeader({ chunked: true, chunkNumber: 0, dataSize: 8 }),
    )
    const chunk1 = buildMessage(
      sop,
      messageHeader,
      [...toBytes32(pdo2), 0x01, 0x02, 0x03, 0x04],
      makeExtendedHeader({ chunked: true, chunkNumber: 1, dataSize: 8 }),
    )
    const firstRow = buildMessageRow({
      startTimestampUs: 1000n,
      endTimestampUs: 1005n,
      rawSop: chunk0.subarray(0, 4),
      rawDecodedData: chunk0.subarray(4),
      messageKind: 'EXTENDED',
      messageType: 0x11,
      createdAtMs: 1_700_000_000_001,
    })
    const secondRow = buildMessageRow({
      startTimestampUs: 1010n,
      endTimestampUs: 1015n,
      rawSop: chunk1.subarray(0, 4),
      rawDecodedData: chunk1.subarray(4),
      messageKind: 'EXTENDED',
      messageType: 0x11,
      createdAtMs: 1_700_000_000_002,
    })
    const deviceState = buildDeviceState(
      {
        selectedKeys: ['message:1010:1015:1700000000002'],
        anchorIndex: 1,
        activeIndex: 1,
      },
      [firstRow, secondRow],
    )
    const driver = deviceState.drpdDriver as unknown as TestSelectionDriver

    render(
      <DrpdMessageDetailInstrumentView
        instrument={buildInstrument()}
        displayName="MESSAGE DETAIL"
        deviceState={deviceState}
        isEditMode={false}
      />,
    )

    const technicalDataSection = (await screen.findByRole('button', { name: /technical data/i })).closest('section')
    expect(within(technicalDataSection as HTMLElement).getByText('2C D1 02 00')).toHaveAttribute(
      'title',
      expect.stringContaining('Message body'),
    )
    expect(await screen.findByText('Power Data Objects')).toBeInTheDocument()
    expect(driver.lastQuery).toMatchObject({
      startTimestampUs: 0n,
      endTimestampUs: 1010n,
      sortOrder: 'desc',
      limit: 64,
    })
  })
})
