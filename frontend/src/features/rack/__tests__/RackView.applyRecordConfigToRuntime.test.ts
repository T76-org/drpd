import { describe, expect, it, vi } from 'vitest'
import {
  CCBusRole,
  OnOffState,
  TriggerEventType,
  TriggerMessageTypeFilterClass,
  TriggerSenderFilter,
  TriggerStatus,
  TriggerSyncMode,
  buildDefaultLoggingConfig,
} from '../../../lib/device'
import type { RackDeviceRecord } from '../../../lib/rack/types'
import { applyRecordConfigToRuntime } from '../RackView'

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
    const state = {
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
        syncMode: TriggerSyncMode.OFF,
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
      }),
      ccBus: {
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
        requestPdo: vi.fn(async (index: number, voltageMv: number, currentMa: number) => {
          calls.push(`requestPdo:${index}:${voltageMv}:${currentMa}`)
          state.sinkInfo = {
            status: 'PE_SNK_READY',
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
          state.triggerInfo.type = type
        }),
        setEventThreshold: vi.fn(async (count: number) => {
          calls.push(`setEventThreshold:${count}`)
          state.triggerInfo.eventThreshold = count
        }),
        setSenderFilter: vi.fn(async (filter: TriggerSenderFilter) => {
          calls.push(`setSenderFilter:${filter}`)
          state.triggerInfo.senderFilter = filter
        }),
        setAutoRepeat: vi.fn(async (value: OnOffState) => {
          calls.push(`setAutoRepeat:${value}`)
          state.triggerInfo.autorepeat = value
        }),
        setSyncMode: vi.fn(async (mode: TriggerSyncMode) => {
          calls.push(`setSyncMode:${mode}`)
          state.triggerInfo.syncMode = mode
        }),
        setSyncPulseWidthUs: vi.fn(async (widthUs: number) => {
          calls.push(`setSyncPulseWidthUs:${widthUs}`)
          state.triggerInfo.syncPulseWidthUs = widthUs
        }),
        setMessageTypeFilters: vi.fn(async (filters: typeof state.triggerInfo.messageTypeFilters) => {
          calls.push(`setMessageTypeFilters:${filters.length}`)
          state.triggerInfo.messageTypeFilters = filters
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
})
