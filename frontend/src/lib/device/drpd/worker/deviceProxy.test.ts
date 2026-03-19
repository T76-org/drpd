import { describe, expect, it, vi } from 'vitest'
import {
  OnOffState,
  TriggerEventType,
  TriggerSenderFilter,
  TriggerStatus,
  TriggerMessageTypeFilterClass,
  TriggerSyncMode,
} from '../types'
import type { DRPDDeviceState } from '../types'
import { DRPDDevice } from '../device'
import { DRPDWorkerDeviceProxy } from './deviceProxy'

/**
 * Minimal client contract used to exercise proxy RPC calls.
 */
interface ProxyClientStub {
  callWorker: ReturnType<typeof vi.fn>
  registerDRPDSessionEvents: ReturnType<typeof vi.fn>
  unregisterDRPDSessionEvents: ReturnType<typeof vi.fn>
}

/**
 * Test harness that exposes the protected worker proxy constructor.
 */
class TestDRPDWorkerDeviceProxy extends DRPDWorkerDeviceProxy {
  /**
   * Create a proxy with a stubbed worker client.
   *
   * @param client - Stubbed worker client.
   * @param sessionId - Session identifier.
   */
  public constructor(client: ProxyClientStub, sessionId = 'session-1') {
    super(client as never, sessionId)
  }

  /**
   * Deliver a worker-forwarded device event to the proxy.
   *
   * @param eventName - Event name.
   * @param detail - Event detail payload.
   */
  public emitWorkerDeviceEvent(eventName: string, detail: unknown): void {
    this.handleWorkerDeviceEvent(eventName, detail)
  }
}

describe('DRPDWorkerDeviceProxy trigger group', () => {
  it('forwards trigger commands to the worker session RPC', async () => {
    const callWorker = vi.fn(async () => null)
    const client: ProxyClientStub = {
      callWorker,
      registerDRPDSessionEvents: vi.fn(),
      unregisterDRPDSessionEvents: vi.fn(),
    }
    const proxy = new TestDRPDWorkerDeviceProxy(client)

    await proxy.trigger.setEventType(TriggerEventType.CRC_ERROR)
    await proxy.trigger.setEventThreshold(5)
    await proxy.trigger.setSenderFilter(TriggerSenderFilter.CABLE)
    await proxy.trigger.setAutoRepeat(OnOffState.ON)
    await proxy.trigger.setSyncMode(TriggerSyncMode.PULSE_LOW)
    await proxy.trigger.setSyncPulseWidthUs(18)
    await proxy.trigger.setMessageTypeFilters([
      { class: TriggerMessageTypeFilterClass.CONTROL, messageTypeNumber: 3 },
      { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 2 },
    ])
    await proxy.trigger.clearMessageTypeFilters()
    await proxy.trigger.reset()

    expect(callWorker).toHaveBeenNthCalledWith(1, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'trigger',
      method: 'setEventType',
      args: [TriggerEventType.CRC_ERROR],
    })
    expect(callWorker).toHaveBeenNthCalledWith(2, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'trigger',
      method: 'setEventThreshold',
      args: [5],
    })
    expect(callWorker).toHaveBeenNthCalledWith(3, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'trigger',
      method: 'setSenderFilter',
      args: [TriggerSenderFilter.CABLE],
    })
    expect(callWorker).toHaveBeenNthCalledWith(4, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'trigger',
      method: 'setAutoRepeat',
      args: [OnOffState.ON],
    })
    expect(callWorker).toHaveBeenNthCalledWith(5, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'trigger',
      method: 'setSyncMode',
      args: [TriggerSyncMode.PULSE_LOW],
    })
    expect(callWorker).toHaveBeenNthCalledWith(6, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'trigger',
      method: 'setSyncPulseWidthUs',
      args: [18],
    })
    expect(callWorker).toHaveBeenNthCalledWith(7, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'trigger',
      method: 'setMessageTypeFilters',
      args: [[
        { class: TriggerMessageTypeFilterClass.CONTROL, messageTypeNumber: 3 },
        { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 2 },
      ]],
    })
    expect(callWorker).toHaveBeenNthCalledWith(8, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'trigger',
      method: 'clearMessageTypeFilters',
      args: [],
    })
    expect(callWorker).toHaveBeenNthCalledWith(9, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'trigger',
      method: 'reset',
      args: [],
    })
  })
})

describe('DRPDWorkerDeviceProxy analog monitor group', () => {
  it('forwards accumulated measurement calls to the worker session RPC', async () => {
    const callWorker = vi.fn(async () => null)
    const client: ProxyClientStub = {
      callWorker,
      registerDRPDSessionEvents: vi.fn(),
      unregisterDRPDSessionEvents: vi.fn(),
    }
    const proxy = new TestDRPDWorkerDeviceProxy(client)

    await proxy.analogMonitor.getAccumulatedMeasurements()
    await proxy.analogMonitor.resetAccumulatedMeasurements()

    expect(callWorker).toHaveBeenNthCalledWith(1, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'analogMonitor',
      method: 'getAccumulatedMeasurements',
      args: [],
    })
    expect(callWorker).toHaveBeenNthCalledWith(2, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'analogMonitor',
      method: 'resetAccumulatedMeasurements',
      args: [],
    })
  })
})

describe('DRPDWorkerDeviceProxy worker state mirroring', () => {
  it('preserves trigger message type filters from stateupdated events', () => {
    const callWorker = vi.fn(async () => null)
    const client: ProxyClientStub = {
      callWorker,
      registerDRPDSessionEvents: vi.fn(),
      unregisterDRPDSessionEvents: vi.fn(),
    }
    const proxy = new TestDRPDWorkerDeviceProxy(client)
    const nextState: DRPDDeviceState = {
      ...proxy.getState(),
      triggerInfo: {
        status: TriggerStatus.ARMED,
        type: TriggerEventType.MESSAGE_COMPLETE,
        eventThreshold: 3,
        senderFilter: TriggerSenderFilter.SOURCE,
        autorepeat: OnOffState.ON,
        eventCount: 8,
        syncMode: TriggerSyncMode.TOGGLE,
        syncPulseWidthUs: 25,
        messageTypeFilters: [
          { class: TriggerMessageTypeFilterClass.CONTROL, messageTypeNumber: 3 },
          { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 2 },
        ],
      },
    }

    const stateUpdatedSpy = vi.fn()
    proxy.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, stateUpdatedSpy)

    proxy.emitWorkerDeviceEvent(DRPDDevice.STATE_UPDATED_EVENT, {
      state: nextState,
      changed: ['triggerInfo'],
    })

    expect(proxy.getState().triggerInfo?.messageTypeFilters).toEqual([
      { class: TriggerMessageTypeFilterClass.CONTROL, messageTypeNumber: 3 },
      { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 2 },
    ])
    expect(proxy.getState().triggerInfo?.senderFilter).toBe(TriggerSenderFilter.SOURCE)
    expect(stateUpdatedSpy).toHaveBeenCalledTimes(1)
    expect((stateUpdatedSpy.mock.calls[0][0] as CustomEvent).detail.state.triggerInfo.messageTypeFilters).toEqual([
      { class: TriggerMessageTypeFilterClass.CONTROL, messageTypeNumber: 3 },
      { class: TriggerMessageTypeFilterClass.DATA, messageTypeNumber: 2 },
    ])
    expect((stateUpdatedSpy.mock.calls[0][0] as CustomEvent).detail.state.triggerInfo.senderFilter).toBe(
      TriggerSenderFilter.SOURCE,
    )
  })
})
