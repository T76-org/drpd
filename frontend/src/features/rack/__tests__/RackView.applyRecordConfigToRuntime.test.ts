import { describe, expect, it, vi } from 'vitest'
import {
  CCBusRole,
  type DRPDDeviceState,
  OnOffState,
  SinkState,
  TriggerEventType,
  TriggerMessageTypeFilterClass,
  type TriggerMessageTypeFilter,
  TriggerSenderFilter,
  TriggerStatus,
  TriggerSyncMode,
  buildDefaultLoggingConfig,
} from '../../../lib/device'
import type { RackDeviceRecord } from '../../../lib/rack/types'
import { applyRecordConfigToRuntime } from '../applyRecordConfigToRuntime'

const buildRecord = (): RackDeviceRecord => ({
  id: 'device-1',
  identifier: 'com.mta.drpd',
  displayName: 'Dr. PD',
  vendorId: 0x2e8a,
  productId: 0x000a,
  config: {
    logging: buildDefaultLoggingConfig(),
    role: CCBusRole.SINK,
    captureEnabled: OnOffState.ON,
    sinkRequest: {
      index: 0,
      voltageMv: 5000,
      currentMa: 2000,
    },
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
  },
})

describe('applyRecordConfigToRuntime', () => {
  it('reapplies saved role, capture, sink, and trigger settings in connect order', async () => {
    const calls: string[] = []
    const state: Pick<DRPDDeviceState, 'role' | 'captureEnabled' | 'sinkInfo' | 'triggerInfo'> = {
      role: CCBusRole.OBSERVER,
      captureEnabled: OnOffState.OFF,
      sinkInfo: null,
      triggerInfo: {
        status: TriggerStatus.IDLE,
        type: TriggerEventType.OFF,
        eventThreshold: 1,
        senderFilter: TriggerSenderFilter.ANY,
        autorepeat: OnOffState.ON,
        eventCount: 0,
        syncMode: TriggerSyncMode.PULSE_LOW,
        syncPulseWidthUs: 1,
        messageTypeFilters: [],
      },
    }

    const driver = {
      configureLogging: vi.fn(async () => {
        calls.push('configureLogging')
      }),
      getState: vi.fn(() => state),
      refreshState: vi.fn(async () => {
        calls.push('refreshState')
        if (state.role === CCBusRole.SINK && state.sinkInfo == null) {
          state.sinkInfo = {
            status: SinkState.PE_SNK_READY,
            negotiatedPdo: null,
            negotiatedVoltageMv: 0,
            negotiatedCurrentMa: 0,
            error: false,
          }
        }
      }),
      ccBus: {
        getRole: vi.fn(async () => state.role),
        setRole: vi.fn(async (role: CCBusRole) => {
          calls.push(`setRole:${role}`)
          state.role = role
        }),
      },
      setCaptureEnabled: vi.fn(async (captureEnabled: OnOffState) => {
        calls.push(`setCaptureEnabled:${captureEnabled}`)
        state.captureEnabled = captureEnabled
      }),
      sink: {
        getSinkInfo: vi.fn(async () => state.sinkInfo),
        getAvailablePdoCount: vi.fn(async () => 1),
        requestPdo: vi.fn(async (index: number, voltageMv: number, currentMa: number) => {
          calls.push(`requestPdo:${index}:${voltageMv}:${currentMa}`)
          state.sinkInfo = {
            status: SinkState.PE_SNK_READY,
            negotiatedPdo: null,
            negotiatedVoltageMv: voltageMv,
            negotiatedCurrentMa: currentMa,
            error: false,
          }
        }),
      },
      trigger: {
        setEventType: vi.fn(async (type: TriggerEventType) => {
          calls.push(`setEventType:${type}`)
          state.triggerInfo!.type = type
        }),
        setEventThreshold: vi.fn(async (count: number) => {
          calls.push(`setEventThreshold:${count}`)
          state.triggerInfo!.eventThreshold = count
        }),
        setSenderFilter: vi.fn(async (filter: TriggerSenderFilter) => {
          calls.push(`setSenderFilter:${filter}`)
          state.triggerInfo!.senderFilter = filter
        }),
        setAutoRepeat: vi.fn(async (value: OnOffState) => {
          calls.push(`setAutoRepeat:${value}`)
          state.triggerInfo!.autorepeat = value
        }),
        setSyncMode: vi.fn(async (mode: TriggerSyncMode) => {
          calls.push(`setSyncMode:${mode}`)
          state.triggerInfo!.syncMode = mode
        }),
        setSyncPulseWidthUs: vi.fn(async (widthUs: number) => {
          calls.push(`setSyncPulseWidthUs:${widthUs}`)
          state.triggerInfo!.syncPulseWidthUs = widthUs
        }),
        setMessageTypeFilters: vi.fn(async (filters: TriggerMessageTypeFilter[]) => {
          calls.push(`setMessageTypeFilters:${filters.length}`)
          state.triggerInfo!.messageTypeFilters = filters
        }),
      },
    }

    await applyRecordConfigToRuntime(buildRecord(), {
      drpdDriver: driver as never,
    })

    expect(driver.configureLogging).toHaveBeenCalledTimes(1)
    expect(driver.ccBus.setRole).toHaveBeenCalledWith(CCBusRole.SINK)
    expect(driver.setCaptureEnabled).toHaveBeenCalledWith(OnOffState.ON)
    expect(driver.sink.requestPdo).toHaveBeenCalledWith(0, 5000, 2000)
    expect(driver.trigger.setEventType).toHaveBeenCalledWith(TriggerEventType.CRC_ERROR)
    expect(driver.trigger.setEventThreshold).toHaveBeenCalledWith(7)
    expect(driver.trigger.setSenderFilter).toHaveBeenCalledWith(TriggerSenderFilter.CABLE)
    expect(driver.trigger.setAutoRepeat).toHaveBeenCalledWith(OnOffState.OFF)
    expect(driver.trigger.setSyncMode).toHaveBeenCalledWith(TriggerSyncMode.PULSE_HIGH)
    expect(driver.trigger.setSyncPulseWidthUs).toHaveBeenCalledWith(40)
    expect(driver.trigger.setMessageTypeFilters).toHaveBeenCalledWith([
      { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 2 },
    ])
    expect(calls).toEqual([
      'configureLogging',
      'setRole:SINK',
      'refreshState',
      'setCaptureEnabled:ON',
      'requestPdo:0:5000:2000',
      'refreshState',
      'setEventType:CRC_ERROR',
      'setEventThreshold:7',
      'setSenderFilter:CABLE',
      'setAutoRepeat:OFF',
      'setSyncMode:PULSE_HIGH',
      'setSyncPulseWidthUs:40',
      'setMessageTypeFilters:1',
      'refreshState',
    ])
  })

  it('waits for sink mode readiness before replaying the stored sink request', async () => {
    vi.useFakeTimers()
    const state: Pick<DRPDDeviceState, 'role' | 'captureEnabled' | 'sinkInfo' | 'triggerInfo' | 'sinkPdoList'> = {
      role: CCBusRole.OBSERVER,
      captureEnabled: OnOffState.OFF,
      sinkInfo: null,
      triggerInfo: null,
      sinkPdoList: null,
    }
    let roleChecks = 0
    let pdoChecks = 0
    const driver = {
      configureLogging: vi.fn(async () => undefined),
      getState: vi.fn(() => state),
      refreshState: vi.fn(async () => {
        if (roleChecks >= 2) {
          state.role = CCBusRole.SINK
          state.sinkPdoList = [null]
          state.sinkInfo = {
            status: SinkState.PE_SNK_READY,
            negotiatedPdo: null,
            negotiatedVoltageMv: 0,
            negotiatedCurrentMa: 0,
            error: false,
          }
        }
      }),
      ccBus: {
        getRole: vi.fn(async () => {
          roleChecks += 1
          return state.role
        }),
        setRole: vi.fn(async (role: CCBusRole) => {
          state.role = roleChecks >= 2 ? role : CCBusRole.OBSERVER
        }),
      },
      setCaptureEnabled: vi.fn(async () => undefined),
      sink: {
        getAvailablePdoCount: vi.fn(async () => {
          pdoChecks += 1
          return state.role === CCBusRole.SINK ? 1 : 0
        }),
        getSinkInfo: vi.fn(async () => state.sinkInfo),
        requestPdo: vi.fn(async () => undefined),
      },
      trigger: {
        setEventType: vi.fn(async () => undefined),
        setEventThreshold: vi.fn(async () => undefined),
        setSenderFilter: vi.fn(async () => undefined),
        setAutoRepeat: vi.fn(async () => undefined),
        setSyncMode: vi.fn(async () => undefined),
        setSyncPulseWidthUs: vi.fn(async () => undefined),
        setMessageTypeFilters: vi.fn(async () => undefined),
      },
    }

    const task = applyRecordConfigToRuntime(buildRecord(), {
      drpdDriver: driver as never,
    })
    await vi.runAllTimersAsync()
    await task

    expect(roleChecks).toBeGreaterThanOrEqual(2)
    expect(pdoChecks).toBeGreaterThanOrEqual(1)
    expect(driver.sink.requestPdo).toHaveBeenCalledWith(0, 5000, 2000)
    vi.useRealTimers()
  })
})
