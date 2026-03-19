import { describe, expect, it, vi } from 'vitest'
import { OnOffState, TriggerEventType, TriggerSyncMode } from '../types'
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
    await proxy.trigger.setAutoRepeat(OnOffState.ON)
    await proxy.trigger.setSyncMode(TriggerSyncMode.PULSE_LOW)
    await proxy.trigger.setSyncPulseWidthUs(18)
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
      method: 'setAutoRepeat',
      args: [OnOffState.ON],
    })
    expect(callWorker).toHaveBeenNthCalledWith(4, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'trigger',
      method: 'setSyncMode',
      args: [TriggerSyncMode.PULSE_LOW],
    })
    expect(callWorker).toHaveBeenNthCalledWith(5, 'drpdSession.call', {
      sessionId: 'session-1',
      target: 'trigger',
      method: 'setSyncPulseWidthUs',
      args: [18],
    })
    expect(callWorker).toHaveBeenNthCalledWith(6, 'drpdSession.call', {
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

describe('DRPDWorkerDeviceProxy connect flow', () => {
  it('awaits connect-time hydration before resolving handleConnect', async () => {
    let resolveHandleConnect: (() => void) | null = null
    const callWorker = vi.fn((method: string, request?: { method?: string }) => {
      if (method === 'drpdSession.call' && request?.method === 'handleConnect') {
        return new Promise((resolve) => {
          resolveHandleConnect = () => resolve(null)
        })
      }
      return Promise.resolve(null)
    })
    const client: ProxyClientStub = {
      callWorker,
      registerDRPDSessionEvents: vi.fn(),
      unregisterDRPDSessionEvents: vi.fn(),
    }
    const proxy = new TestDRPDWorkerDeviceProxy(client)

    let settled = false
    const connectPromise = proxy.handleConnect().then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    expect(callWorker).toHaveBeenCalledWith('drpdSession.call', {
      sessionId: 'session-1',
      target: 'device',
      method: 'handleConnect',
      args: [],
    })

    resolveHandleConnect?.()
    await connectPromise

    expect(settled).toBe(true)
  })
})
