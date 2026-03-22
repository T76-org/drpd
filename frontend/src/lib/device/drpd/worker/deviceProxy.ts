/**
 * @file deviceProxy.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Main-thread proxy for a DRPDDevice instance owned by the DRPD worker.
 */

import { DebugLogRegistry } from '../../../debugLogger'
import type {
  AccumulatedMeasurements,
  AnalogMonitorChannels,
  AnalogSampleQuery,
  CapturedMessageQuery,
  CCBusRole,
  DeviceIdentity,
  DRPDDeviceState,
  DRPDLogSelectionState,
  DRPDLoggingConfig,
  LogClearResult,
  LogClearScope,
  DRPDLogCounts,
  DRPDLoggingDiagnostics,
  LogExportRequest,
  LogExportResult,
  LoggedAnalogSample,
  LoggedCapturedMessage,
  OnOffState,
  SinkInfo,
  SinkPdo,
  TriggerEventType,
  TriggerInfo,
  TriggerSyncMode,
} from '../types'
import type { MessageLogTimeStripQuery, MessageLogTimeStripWindow } from '../logging'
import { DRPDDevice } from '../device'
import type { WorkerUSBDeviceSelection } from './protocol'
import { deserializeWorkerError } from './serialization'
import { DRPDWorkerServiceClient } from './service'

let workerDeviceSessionCounter = 1 ///< Monotonic worker DRPD session id counter.
const WORKER_CREATE_TIMEOUT_MS = 1_500 ///< Max time to wait for worker session creation before resetting the worker.

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  return await new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    promise
      .then((value) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        reject(error)
      })
  })
}

/**
 * Worker-backed DRPD device proxy that mirrors the subset of DRPDDevice used by the UI.
 */
export class DRPDWorkerDeviceProxy extends EventTarget {
  public readonly analogMonitor: {
    getStatus: () => Promise<AnalogMonitorChannels>
    getAccumulatedMeasurements: () => Promise<AccumulatedMeasurements>
    resetAccumulatedMeasurements: () => Promise<void>
  } ///< Analog monitor command-group proxy.
  public readonly ccBus: { getRole: () => Promise<CCBusRole>; setRole: (role: CCBusRole) => Promise<void> } ///< CC bus command-group proxy.
  public readonly capture: { setCaptureEnabled: (enabled: OnOffState) => Promise<void> } ///< Capture command-group proxy.
  public readonly system: { identify: () => Promise<DeviceIdentity> } ///< System command-group proxy.
  public readonly sink: {
    getAvailablePdoCount: () => Promise<number>
    getPdoAtIndex: (index: number) => Promise<SinkPdo>
    getSinkInfo: () => Promise<SinkInfo>
    requestPdo: (index: number, voltageMv: number, currentMa: number) => Promise<void>
  } ///< Sink command-group proxy.
  public readonly trigger: {
    getInfo: () => Promise<TriggerInfo>
    setEventType: (type: TriggerEventType) => Promise<void>
    setEventThreshold: (count: number) => Promise<void>
    setSenderFilter: (filter: TriggerInfo['senderFilter']) => Promise<void>
    setAutoRepeat: (enabled: OnOffState) => Promise<void>
    setSyncMode: (mode: TriggerSyncMode) => Promise<void>
    setSyncPulseWidthUs: (widthUs: number) => Promise<void>
    setMessageTypeFilters: (filters: TriggerInfo['messageTypeFilters']) => Promise<void>
    clearMessageTypeFilters: () => Promise<void>
    reset: () => Promise<void>
  } ///< Trigger command-group proxy.
  public readonly vbus: {
    resetFault: () => Promise<void>
    setOvpThresholdMv: (thresholdMv: number) => Promise<void>
    setOcpThresholdMa: (thresholdMa: number) => Promise<void>
  } ///< VBUS command-group proxy.

  protected readonly client: DRPDWorkerServiceClient ///< Shared worker client.
  protected readonly sessionId: string ///< Worker DRPD session id.
  public readonly debugLogs: DebugLogRegistry ///< Shared debug logging controller.
  protected state: DRPDDeviceState ///< Last mirrored device state.
  protected closed: boolean ///< True after close().
  protected unsubscribeDebugLogs?: () => void ///< Debug logging subscription cleanup.

  /**
   * Create and initialize a worker-backed DRPD session proxy.
   *
   * @param device - Selected WebUSB device.
   * @returns Ready proxy instance.
   */
  public static async create(
    device: USBDevice,
    debugLogs = new DebugLogRegistry(),
  ): Promise<DRPDWorkerDeviceProxy> {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const client = DRPDWorkerServiceClient.getShared()
      const suffix = workerDeviceSessionCounter++
      const sessionId = `drpd-session-${suffix}`
      const proxy = new DRPDWorkerDeviceProxy(client, sessionId, debugLogs)
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
        await withTimeout(
          client.callWorker('drpdSession.create', {
            sessionId,
            deviceSelection,
            debugLogRules: debugLogs.getScopeRules(),
          }),
          WORKER_CREATE_TIMEOUT_MS,
          'drpdSession.create',
        )
        proxy.state = (await proxy.callDevice('getState')) as DRPDDeviceState
        return proxy
      } catch (error) {
        lastError = error
        client.unregisterDRPDSessionEvents(sessionId)
        if (attempt === 0) {
          DRPDWorkerServiceClient.resetShared('drpdSession.create timeout/retry')
          continue
        }
        await client.callWorker('drpdSession.dispose', { sessionId }).catch(() => undefined)
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  /**
   * Create a worker-backed proxy instance. Use `create()` to initialize.
   *
   * @param client - Shared worker client.
   * @param sessionId - Worker session id.
   */
  protected constructor(
    client: DRPDWorkerServiceClient,
    sessionId: string,
    debugLogs = new DebugLogRegistry(),
  ) {
    super()
    this.client = client
    this.sessionId = sessionId
    this.debugLogs = debugLogs
    this.state = {
      role: null,
      ccBusRoleStatus: null,
      analogMonitor: null,
      vbusInfo: null,
      captureEnabled: null,
      triggerInfo: null,
      sinkInfo: null,
      sinkPdoList: null,
      logSelection: {
        selectedKeys: [],
        anchorIndex: null,
        activeIndex: null,
      },
    }
    this.closed = false
    this.unsubscribeDebugLogs = this.debugLogs.subscribe((scope, enabled) => {
      void this.client.callWorker('drpdSession.call', {
        sessionId: this.sessionId,
        target: 'debugLog',
        method: enabled == null ? 'clearScope' : 'setScopeEnabled',
        args: enabled == null ? [scope] : [scope, enabled],
      }).catch(() => undefined)
    })

    this.analogMonitor = {
      getStatus: async () => (await this.callGroup('analogMonitor', 'getStatus')) as AnalogMonitorChannels,
      getAccumulatedMeasurements: async () =>
        (await this.callGroup('analogMonitor', 'getAccumulatedMeasurements')) as AccumulatedMeasurements,
      resetAccumulatedMeasurements: async () => {
        await this.callGroup('analogMonitor', 'resetAccumulatedMeasurements')
      },
    }
    this.ccBus = {
      getRole: async () => (await this.callGroup('ccBus', 'getRole')) as CCBusRole,
      setRole: async (role) => {
        await this.callGroup('ccBus', 'setRole', role)
      },
    }
    this.capture = {
      setCaptureEnabled: async (enabled) => {
        await this.setCaptureEnabled(enabled)
      },
    }
    this.system = {
      identify: async () => (await this.callGroup('system', 'identify')) as DeviceIdentity,
    }
    this.sink = {
      getAvailablePdoCount: async () => (await this.callGroup('sink', 'getAvailablePdoCount')) as number,
      getPdoAtIndex: async (index) => (await this.callGroup('sink', 'getPdoAtIndex', index)) as SinkPdo,
      getSinkInfo: async () => (await this.callGroup('sink', 'getSinkInfo')) as SinkInfo,
      requestPdo: async (index, voltageMv, currentMa) => {
        await this.callGroup('sink', 'requestPdo', index, voltageMv, currentMa)
      },
    }
    this.trigger = {
      getInfo: async () => (await this.callGroup('trigger', 'getInfo')) as TriggerInfo,
      setEventType: async (type) => {
        await this.callGroup('trigger', 'setEventType', type)
      },
      setEventThreshold: async (count) => {
        await this.callGroup('trigger', 'setEventThreshold', count)
      },
      setSenderFilter: async (filter) => {
        await this.callGroup('trigger', 'setSenderFilter', filter)
      },
      setAutoRepeat: async (enabled) => {
        await this.callGroup('trigger', 'setAutoRepeat', enabled)
      },
      setSyncMode: async (mode) => {
        await this.callGroup('trigger', 'setSyncMode', mode)
      },
      setSyncPulseWidthUs: async (widthUs) => {
        await this.callGroup('trigger', 'setSyncPulseWidthUs', widthUs)
      },
      setMessageTypeFilters: async (filters) => {
        await this.callGroup('trigger', 'setMessageTypeFilters', filters)
      },
      clearMessageTypeFilters: async () => {
        await this.callGroup('trigger', 'clearMessageTypeFilters')
      },
      reset: async () => {
        await this.callGroup('trigger', 'reset')
      },
    }
    this.vbus = {
      resetFault: async () => {
        await this.callGroup('vbus', 'resetFault')
      },
      setOvpThresholdMv: async (thresholdMv: number) => {
        await this.callGroup('vbus', 'setOvpThresholdMv', thresholdMv)
      },
      setOcpThresholdMa: async (thresholdMa: number) => {
        await this.callGroup('vbus', 'setOcpThresholdMa', thresholdMa)
      },
    }
  }

  /**
   * Return the latest mirrored state snapshot.
   *
   * @returns Device state snapshot.
   */
  public getState(): DRPDDeviceState {
    return {
      ...this.state,
      logSelection: {
        selectedKeys: [...this.state.logSelection.selectedKeys],
        anchorIndex: this.state.logSelection.anchorIndex,
        activeIndex: this.state.logSelection.activeIndex,
      },
    }
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
   * Return worker-side logging backend diagnostics.
   *
   * @returns Backend diagnostics snapshot.
   */
  public async getLoggingDiagnostics(): Promise<DRPDLoggingDiagnostics> {
    return (await this.callDevice('getLoggingDiagnostics')) as DRPDLoggingDiagnostics
  }

  /**
   * Return worker-side log row counts.
   *
   * @returns Log row counts.
   */
  public async getLogCounts(): Promise<DRPDLogCounts> {
    return (await this.callDevice('getLogCounts')) as DRPDLogCounts
  }

  /**
   * Enable or disable capture on the worker-side device.
   *
   * Turning capture on also ensures logging is enabled/started on the worker device.
   *
   * @param enabled - Desired capture state.
   */
  public async setCaptureEnabled(enabled: OnOffState): Promise<void> {
    await this.callDevice('setCaptureEnabled', enabled)
  }

  /**
   * Start connect-time worker tasks (mirrors DRPDDevice.handleConnect()).
   */
  public async handleConnect(): Promise<void> {
    await this.callDevice('handleConnect')
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
   * Query a worker-optimized time-strip render window.
   *
   * @param query - Time-strip query criteria.
   * @returns Prepared window payload.
   */
  public async queryMessageLogTimeStripWindow(
    query: MessageLogTimeStripQuery,
  ): Promise<MessageLogTimeStripWindow> {
    return (await this.callDevice('queryMessageLogTimeStripWindow', query)) as MessageLogTimeStripWindow
  }

  /**
   * Read worker-side message-log selection state.
   *
   * @returns Selection snapshot.
   */
  public async getLogSelectionState(): Promise<DRPDLogSelectionState> {
    return (await this.callDevice('getLogSelectionState')) as DRPDLogSelectionState
  }

  /**
   * Write worker-side message-log selection state.
   *
   * @param next - Next selection state.
   */
  public async setLogSelectionState(next: DRPDLogSelectionState): Promise<void> {
    await this.callDevice('setLogSelectionState', next)
  }

  /**
   * Clear worker-side message-log selection state.
   */
  public async clearLogSelection(): Promise<void> {
    await this.callDevice('clearLogSelection')
  }

  /**
   * Resolve message-log row keys for an index range.
   *
   * @param startIndex - Start row index.
   * @param endIndex - End row index.
   * @returns Stable row keys.
   */
  public async resolveLogSelectionKeysForIndexRange(
    startIndex: number,
    endIndex: number,
  ): Promise<string[]> {
    return (await this.callDevice(
      'resolveLogSelectionKeysForIndexRange',
      startIndex,
      endIndex,
    )) as string[]
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
    this.unsubscribeDebugLogs?.()
    this.unsubscribeDebugLogs = undefined
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
  protected async callGroup(target: 'analogMonitor' | 'ccBus' | 'capture' | 'sink' | 'system' | 'trigger' | 'vbus', method: string, ...args: unknown[]): Promise<unknown> {
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
