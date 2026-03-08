import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  DRPDDevice,
  type DRPDLogSelectionState,
} from '../../../lib/device'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdMessageDetailInstrumentView } from './DrpdMessageDetailInstrumentView'

class TestSelectionDriver extends EventTarget {
  public logSelection: DRPDLogSelectionState

  public constructor(logSelection: DRPDLogSelectionState) {
    super()
    this.logSelection = logSelection
  }

  public getLogSelectionState(): DRPDLogSelectionState | Promise<DRPDLogSelectionState> {
    return this.logSelection
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

const buildDeviceState = (selection: DRPDLogSelectionState): RackDeviceState => ({
  record: buildDeviceRecord(),
  status: 'connected',
  drpdDriver: new TestSelectionDriver(selection) as unknown as RackDeviceState['drpdDriver'],
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
    render(
      <DrpdMessageDetailInstrumentView
        instrument={buildInstrument()}
        displayName="MESSAGE DETAIL"
        deviceState={buildDeviceState({
          selectedKeys: ['message:1000:1005:1'],
          anchorIndex: 0,
          activeIndex: 0,
        })}
        isEditMode={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('1 message selected')).toBeInTheDocument()
    })
    expect(screen.getByText('1 message selected').parentElement).toHaveClass(/singleSelectionContainer/)
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

    const deviceState: RackDeviceState = {
      record: buildDeviceRecord(),
      status: 'connected',
      drpdDriver: new AsyncSelectionDriver({
        selectedKeys: ['message:1000:1005:1'],
        anchorIndex: 0,
        activeIndex: 0,
      }) as unknown as RackDeviceState['drpdDriver'],
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
})
