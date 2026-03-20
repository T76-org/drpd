import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  DRPDDevice,
  OnOffState,
  TriggerEventType,
  TriggerMessageTypeFilterClass,
  TriggerSenderFilter,
  TriggerStatus,
  TriggerSyncMode,
  type TriggerInfo,
} from '../../../lib/device'
import type { DRPDTransport } from '../../../lib/device/drpd/transport'
import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
import type { RackDeviceState } from '../RackRenderer'
import { DrpdTriggerInstrumentView } from './DrpdTriggerInstrumentView'

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
 * Testable DRPD device with mutable trigger state.
 */
class TestDRPDDevice extends DRPDDevice {
  /**
   * Update trigger state and emit the corresponding UI event.
   *
   * @param triggerInfo - Next trigger snapshot.
   */
  public setTriggerInfo(triggerInfo: TriggerInfo | null): void {
    this.state = {
      ...this.state,
      triggerInfo,
    }
    this.dispatchEvent(
      new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
        detail: { state: this.getState(), changed: ['triggerInfo'] },
      }),
    )
  }
}

/**
 * Build a minimal rack instrument definition.
 *
 * @returns Rack instrument.
 */
const buildInstrument = (): RackInstrument => ({
  id: 'inst-trigger',
  instrumentIdentifier: 'com.mta.drpd.trigger',
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
  productId: 0x000a,
})

/**
 * Build a connected device state.
 *
 * @param driver - Backing driver.
 * @returns Rack device state.
 */
const buildDeviceState = (driver: DRPDDevice): RackDeviceState => ({
  record: buildDeviceRecord(),
  status: 'connected',
  drpdDriver: driver,
})

/**
 * Build a trigger snapshot for tests.
 *
 * @param overrides - Optional field overrides.
 * @returns Trigger info.
 */
const buildTriggerInfo = (overrides?: Partial<TriggerInfo>): TriggerInfo => ({
  status: TriggerStatus.ARMED,
  type: TriggerEventType.MESSAGE_COMPLETE,
  eventThreshold: 3,
  senderFilter: TriggerSenderFilter.ANY,
  autorepeat: OnOffState.ON,
  eventCount: 8,
  syncMode: TriggerSyncMode.TOGGLE,
  syncPulseWidthUs: 25,
  messageTypeFilters: [],
  ...overrides,
})

describe('DrpdTriggerInstrumentView', () => {
  it('renders the current trigger setup and status', () => {
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setTriggerInfo(buildTriggerInfo())

    render(
      <DrpdTriggerInstrumentView
        instrument={buildInstrument()}
        displayName="Sync Trigger"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    expect(screen.getByText('State')).toBeInTheDocument()
    expect(screen.getByText('Event')).toBeInTheDocument()
    expect(screen.getByText('Armed')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('Message Complete')).toBeInTheDocument()
    expect(screen.getByText('Any sender')).toBeInTheDocument()
    expect(screen.getByText('Toggle')).toBeInTheDocument()
    expect(screen.getByText('25 us')).toBeInTheDocument()
    expect(screen.getByText('Any message')).toBeInTheDocument()
  })

  it('renders configured message type filter chips in the instrument body', () => {
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setTriggerInfo(
      buildTriggerInfo({
        messageTypeFilters: [
          { class: TriggerMessageTypeFilterClass.CONTROL, messageTypeNumber: 1 },
          { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 2 },
          { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 15 },
        ],
      }),
    )

    render(
      <DrpdTriggerInstrumentView
        instrument={buildInstrument()}
        displayName="Sync Trigger"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    expect(screen.getByText('Control: GoodCRC')).toBeInTheDocument()
    expect(screen.getByText('Data: 0x02 • Request / Status')).toBeInTheDocument()
    expect(screen.getByText('+1 more')).toBeInTheDocument()
  })

  it('shows when message filters are ignored for a pre-header event', () => {
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setTriggerInfo(
      buildTriggerInfo({
        type: TriggerEventType.HEADER_START,
        senderFilter: TriggerSenderFilter.CABLE,
        messageTypeFilters: [{ class: TriggerMessageTypeFilterClass.CONTROL, messageTypeNumber: 1 }],
      }),
    )

    render(
      <DrpdTriggerInstrumentView
        instrument={buildInstrument()}
        displayName="Sync Trigger"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    expect(screen.getAllByText('Ignored for this event')).toHaveLength(2)
    expect(screen.getByText('Cable')).toBeInTheDocument()
  })

  it('opens the configure popup above the rack layer', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setTriggerInfo(buildTriggerInfo())

    render(
      <DrpdTriggerInstrumentView
        instrument={buildInstrument()}
        displayName="Sync Trigger"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Configure' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveStyle({ zIndex: '10000' })
    expect(within(dialog).getByLabelText(/event type/i)).toBeInTheDocument()
  })

  it('applies updated trigger settings and refreshes state', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setTriggerInfo(buildTriggerInfo())

    const setEventTypeSpy = vi.spyOn(driver.trigger, 'setEventType').mockResolvedValue(undefined)
    const setEventThresholdSpy = vi.spyOn(driver.trigger, 'setEventThreshold').mockResolvedValue(undefined)
    const setSenderFilterSpy = vi.spyOn(driver.trigger, 'setSenderFilter').mockResolvedValue(undefined)
    const setAutoRepeatSpy = vi.spyOn(driver.trigger, 'setAutoRepeat').mockResolvedValue(undefined)
    const setSyncModeSpy = vi.spyOn(driver.trigger, 'setSyncMode').mockResolvedValue(undefined)
    const setPulseWidthSpy = vi.spyOn(driver.trigger, 'setSyncPulseWidthUs').mockResolvedValue(undefined)
    const setMessageTypeFiltersSpy = vi
      .spyOn(driver.trigger, 'setMessageTypeFilters')
      .mockResolvedValue(undefined)
    const refreshSpy = vi.spyOn(driver, 'refreshState').mockResolvedValue(undefined)
    const updateDeviceConfig = vi.fn(async () => undefined)
    const deviceRecord = buildDeviceRecord()

    render(
      <DrpdTriggerInstrumentView
        instrument={buildInstrument()}
        displayName="Sync Trigger"
        deviceRecord={deviceRecord}
        deviceState={{ ...buildDeviceState(driver), record: deviceRecord }}
        isEditMode={false}
        onUpdateDeviceConfig={updateDeviceConfig}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Configure' }))
    await user.selectOptions(screen.getByLabelText(/event type/i), TriggerEventType.CRC_ERROR)
    await user.selectOptions(screen.getByLabelText(/sender/i), TriggerSenderFilter.CABLE)
    await user.clear(screen.getByLabelText(/threshold/i))
    await user.type(screen.getByLabelText(/threshold/i), '7')
    await user.selectOptions(screen.getByLabelText(/auto-repeat/i), OnOffState.OFF)
    await user.selectOptions(screen.getByLabelText(/sync mode/i), TriggerSyncMode.PULSE_HIGH)
    await user.clear(screen.getByLabelText(/pulse width \(us\)/i))
    await user.type(screen.getByLabelText(/pulse width \(us\)/i), '40')
    await user.selectOptions(screen.getByLabelText(/message filter class/i), TriggerMessageTypeFilterClass.DATA)
    await user.selectOptions(screen.getByLabelText(/message filter type/i), '2')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add filter' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apply' }))

    await waitFor(() => {
      expect(setEventTypeSpy).toHaveBeenCalledWith(TriggerEventType.CRC_ERROR)
      expect(setEventThresholdSpy).toHaveBeenCalledWith(7)
      expect(setSenderFilterSpy).toHaveBeenCalledWith(TriggerSenderFilter.CABLE)
      expect(setAutoRepeatSpy).toHaveBeenCalledWith(OnOffState.OFF)
      expect(setSyncModeSpy).toHaveBeenCalledWith(TriggerSyncMode.PULSE_HIGH)
      expect(setPulseWidthSpy).toHaveBeenCalledWith(40)
      expect(setMessageTypeFiltersSpy).toHaveBeenCalledWith([
        { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 2 },
      ])
    })
    expect(refreshSpy).toHaveBeenCalled()
    expect(updateDeviceConfig).toHaveBeenCalledTimes(1)
    expect(updateDeviceConfig.mock.calls[0]?.[0]).toBe(deviceRecord.id)
    expect(
      (updateDeviceConfig.mock.calls[0]?.[1] as (
        current: Record<string, unknown> | undefined,
      ) => Record<string, unknown>)({}),
    ).toEqual({
      trigger: {
        type: TriggerEventType.CRC_ERROR,
        eventThreshold: 7,
        senderFilter: TriggerSenderFilter.CABLE,
        autorepeat: OnOffState.OFF,
        syncMode: TriggerSyncMode.PULSE_HIGH,
        syncPulseWidthUs: 40,
        messageTypeFilters: [
          { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 2 },
        ],
      },
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('disables message filter editing for events before the header is available', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setTriggerInfo(
      buildTriggerInfo({
        type: TriggerEventType.HEADER_START,
        senderFilter: TriggerSenderFilter.SINK,
        messageTypeFilters: [{ class: TriggerMessageTypeFilterClass.CONTROL, messageTypeNumber: 1 }],
      }),
    )

    render(
      <DrpdTriggerInstrumentView
        instrument={buildInstrument()}
        displayName="Sync Trigger"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Configure' }))

    expect(screen.getAllByText(/stored but ignored for this event type/i)).toHaveLength(2)
    expect(screen.getByLabelText(/sender/i)).toBeDisabled()
    expect(screen.getByLabelText(/message filter class/i)).toBeDisabled()
    expect(screen.getByLabelText(/message filter type/i)).toBeDisabled()
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add filter' })).toBeDisabled()
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove Control: GoodCRC' }),
    ).toBeDisabled()
  })

  it('keeps reset disabled unless the trigger is triggered', async () => {
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setTriggerInfo(buildTriggerInfo({ status: TriggerStatus.IDLE }))

    render(
      <DrpdTriggerInstrumentView
        instrument={buildInstrument()}
        displayName="Sync Trigger"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })

  it('resets the trigger and refreshes state when triggered', async () => {
    const user = userEvent.setup()
    const transport = new TestTransport()
    const driver = new TestDRPDDevice(transport)
    driver.setTriggerInfo(buildTriggerInfo({ status: TriggerStatus.TRIGGERED }))

    const resetSpy = vi.spyOn(driver.trigger, 'reset').mockResolvedValue(undefined)
    const refreshSpy = vi.spyOn(driver, 'refreshState').mockResolvedValue(undefined)

    render(
      <DrpdTriggerInstrumentView
        instrument={buildInstrument()}
        displayName="Sync Trigger"
        deviceState={buildDeviceState(driver)}
        isEditMode={false}
      />,
    )

    const resetButton = screen.getByRole('button', { name: 'Reset' })
    expect(resetButton).toBeEnabled()
    await user.click(resetButton)

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalled()
    })
    expect(refreshSpy).toHaveBeenCalled()
  })

  it('renders placeholders and disabled controls when no driver is connected', () => {
    render(
      <DrpdTriggerInstrumentView
        instrument={buildInstrument()}
        displayName="Sync Trigger"
        deviceState={undefined}
        isEditMode={false}
      />,
    )

    expect(screen.getAllByText('--').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Configure' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })
})
