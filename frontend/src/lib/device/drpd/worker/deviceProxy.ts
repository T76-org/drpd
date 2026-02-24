/**
 * @file deviceProxy.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Main-thread proxy for a DRPDDevice instance owned by the DRPD worker.
 */

import type {
  AnalogMonitorChannels,
  AnalogSampleQuery,
  CapturedMessageQuery,
  CCBusRole,
  DRPDDeviceState,
  DRPDLoggingConfig,
  LogClearResult,
  LogClearScope,
  LogExportRequest,
  LogExportResult,
  LoggedAnalogSample,
  LoggedCapturedMessage,
  OnOffState,
} from '../types'
import { DRPDDevice } from '../device'
import type { WorkerUSBDeviceSelection } from './protocol'
import { deserializeWorkerError } from './serialization'
import { DRPDWorkerServiceClient } from './service'

let workerDeviceSessionCounter = 1 ///< Monotonic worker DRPD session id counter.

/**
 * Worker-backed DRPD device proxy that mirrors the subset of DRPDDevice used by the UI.
 */
export class DRPDWorkerDeviceProxy extends EventTarget {
  public readonly analogMonitor: { getStatus: () => Promise<AnalogMonitorChannels> } ///< Analog monitor command-group proxy.
  public readonly ccBus: { setRole: (role: CCBusRole) => Promise<void> } ///< CC bus command-group proxy.
  public readonly capture: { setCaptureEnabled: (enabled: OnOffState) => Promise<void> } ///< Capture command-group proxy.
  public readonly sink: { requestPdo: (index: number, voltageMv: number, currentMa: number) => Promise<void> } ///< Sink command-group proxy.

  protected readonly client: DRPDWorkerServiceClient ///< Shared worker client.
  protected readonly sessionId: string ///< Worker DRPD session id.
  protected state: DRPDDeviceState ///< Last mirrored device state.
  protected closed: boolean ///< True after close().

  /**
   * Create and initialize a worker-backed DRPD session proxy.
   *
   * @param device - Selected WebUSB device.
   * @returns Ready proxy instance.
   */
  public static async create(device: USBDevice): Promise<DRPDWorkerDeviceProxy> {
    const client = DRPDWorkerServiceClient.getShared()
    const suffix = workerDeviceSessionCounter++
    const sessionId = `drpd-session-${suffix}`
    const proxy = new DRPDWorkerDeviceProxy(client, sessionId)
    try {
      client.registerDRPDSessionEvents(sessionId, (eventName, detail) => {
        proxy.handleWorkerDeviceEvent(eventName, detail)
      })
      const deviceSelection: WorkerUSBDeviceSelection = {
        vendorId: device.vendorId,
        productId: device.productId,
        serialNumber: device.serialNumber ?? null,
        productName: device.productName ?? null,
        manufacturerName: device.manufacturerName ?? null,
      }
      await client.callWorker('drpdSession.create', {
        sessionId,
        deviceSelection,
      })
      proxy.state = (await proxy.callDevice('getState')) as DRPDDeviceState
      return proxy
    } catch (error) {
      client.unregisterDRPDSessionEvents(sessionId)
      await client.callWorker('drpdSession.dispose', { sessionId }).catch(() => undefined)
      throw error
    }
  }

  /**
   * Create a worker-backed proxy instance. Use `create()` to initialize.
   *
   * @param client - Shared worker client.
   * @param sessionId - Worker session id.
   */
  protected constructor(client: DRPDWorkerServiceClient, sessionId: string) {
    super()
    this.client = client
    this.sessionId = sessionId
    this.state = {
      role: null,
      ccBusRoleStatus: null,
      analogMonitor: null,
      vbusInfo: null,
      captureEnabled: null,
      triggerInfo: null,
      sinkInfo: null,
      sinkPdoList: null,
    }
    this.closed = false

    this.analogMonitor = {
      getStatus: async () => (await this.callGroup('analogMonitor', 'getStatus')) as AnalogMonitorChannels,
    }
    this.ccBus = {
      setRole: async (role) => {
        await this.callGroup('ccBus', 'setRole', role)
      },
    }
    this.capture = {
      setCaptureEnabled: async (enabled) => {
        await this.callGroup('capture', 'setCaptureEnabled', enabled)
      },
    }
    this.sink = {
      requestPdo: async (index, voltageMv, currentMa) => {
        await this.callGroup('sink', 'requestPdo', index, voltageMv, currentMa)
      },
    }
  }

  /**
   * Return the latest mirrored state snapshot.
   *
   * @returns Device state snapshot.
   */
  public getState(): DRPDDeviceState {
    return { ...this.state }
  }

  /**
   * Set worker-side DRPD debug logging.
   *
   * @param enabled - True to enable worker-side debug logs.
   */
  public setDebugLoggingEnabled(enabled: boolean): void {
    void this.callDevice('setDebugLoggingEnabled', enabled)
  }

  /**
   * Configure DRPD logging behavior.
   *
   * @param config - Logging config.
   */
  public async configureLogging(config: DRPDLoggingConfig): Promise<void> {
    await this.callDevice('configureLogging', config)
  }

  /**
   * Start connect-time worker tasks (mirrors DRPDDevice.handleConnect()).
   */
  public handleConnect(): void {
    void this.callDevice('handleConnect')
  }

  /**
   * Stop worker-side polling/logging and clear mirrored state.
   */
  public handleDisconnect(): void {
    void this.callDevice('handleDisconnect')
  }

  /**
   * Detach worker-side interrupt listeners.
   */
  public detachInterrupts(): void {
    void this.callDevice('detachInterrupts')
  }

  /**
   * Refresh state from the worker-owned device.
   */
  public async refreshState(): Promise<void> {
    await this.callDevice('refreshState')
  }

  /**
   * Query analog logs.
   *
   * @param query - Query criteria.
   * @returns Matching rows.
   */
  public async queryAnalogSamples(query: AnalogSampleQuery): Promise<LoggedAnalogSample[]> {
    return (await this.callDevice('queryAnalogSamples', query)) as LoggedAnalogSample[]
  }

  /**
   * Query captured message logs.
   *
   * @param query - Query criteria.
   * @returns Matching rows.
   */
  public async queryCapturedMessages(query: CapturedMessageQuery): Promise<LoggedCapturedMessage[]> {
    return (await this.callDevice('queryCapturedMessages', query)) as LoggedCapturedMessage[]
  }

  /**
   * Export logs.
   *
   * @param request - Export request.
   * @returns Export payload.
   */
  public async exportLogs(request: LogExportRequest): Promise<LogExportResult> {
    return (await this.callDevice('exportLogs', request)) as LogExportResult
  }

  /**
   * Clear logs.
   *
   * @param scope - Clear scope.
   * @returns Clear result.
   */
  public async clearLogs(scope: LogClearScope): Promise<LogClearResult> {
    return (await this.callDevice('clearLogs', scope)) as LogClearResult
  }

  /**
   * Close the worker session and the underlying host transport.
   */
  public async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    this.client.unregisterDRPDSessionEvents(this.sessionId)
    try {
      await this.client.callWorker('drpdSession.dispose', { sessionId: this.sessionId })
    } finally {
      // Session dispose closes the worker-owned USB transport.
    }
  }

  /**
   * Handle an event emitted by the worker-owned DRPD device.
   *
   * @param eventName - DRPD event name.
   * @param detail - Event detail payload.
   */
  protected handleWorkerDeviceEvent(eventName: string, detail: unknown): void {
    const normalizedDetail = this.normalizeWorkerEventDetail(detail)
    if (
      eventName === DRPDDevice.STATE_UPDATED_EVENT &&
      normalizedDetail &&
      typeof normalizedDetail === 'object'
    ) {
      const probe = normalizedDetail as { state?: DRPDDeviceState }
      if (probe.state) {
        this.state = probe.state
      }
    }
    this.dispatchEvent(new CustomEvent(eventName, { detail: normalizedDetail }))
  }

  /**
   * Restore serialized errors inside worker event details.
   *
   * @param detail - Worker event detail.
   * @returns Local event detail.
   */
  protected normalizeWorkerEventDetail(detail: unknown): unknown {
    if (!detail || typeof detail !== 'object') {
      return detail
    }
    if (Array.isArray(detail)) {
      return detail.map((value) => this.normalizeWorkerEventDetail(value))
    }
    const source = detail as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(source)) {
      if (
        key === 'error' &&
        value &&
        typeof value === 'object' &&
        'name' in (value as Record<string, unknown>) &&
        'message' in (value as Record<string, unknown>)
      ) {
        next[key] = deserializeWorkerError(value as never)
        continue
      }
      next[key] = this.normalizeWorkerEventDetail(value)
    }
    return next
  }

  /**
   * Invoke a worker DRPD device method.
   *
   * @param method - Method name.
   * @param args - Method arguments.
   * @returns RPC result.
   */
  protected async callDevice(method: string, ...args: unknown[]): Promise<unknown> {
    this.ensureOpen()
    return await this.client.callWorker('drpdSession.call', {
      sessionId: this.sessionId,
      target: 'device',
      method,
      args,
    })
  }

  /**
   * Invoke a worker DRPD command-group method.
   *
   * @param target - Command-group target name.
   * @param method - Method name.
   * @param args - Method args.
   * @returns RPC result.
   */
  protected async callGroup(target: 'analogMonitor' | 'ccBus' | 'capture' | 'sink', method: string, ...args: unknown[]): Promise<unknown> {
    this.ensureOpen()
    return await this.client.callWorker('drpdSession.call', {
      sessionId: this.sessionId,
      target,
      method,
      args,
    })
  }

  /**
   * Ensure the proxy has not been closed.
   */
  protected ensureOpen(): void {
    if (this.closed) {
      throw new Error('DRPD worker device proxy is closed')
    }
  }
}
