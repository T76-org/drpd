/**
 * @file device.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD device driver root.
 */

import USBTMCTransport from '../../transport/usbtmc'
import type { DRPDTransport } from './transport'
import { parseUSBPDMessage } from './usb-pd/parser'
import { buildDefaultLoggingConfig, SQLiteWasmStore } from './logging'
import { buildCapturedLogSelectionKey, OnOffState as OnOffStateValues } from './types'
import type {
  AnalogMonitorChannels,
  AnalogSampleQuery,
  CapturedMessage,
  CapturedMessageQuery,
  CCBusRole,
  DRPDDeviceState,
  DRPDLogSelectionState,
  DRPDLoggingConfig,
  LogClearResult,
  LogClearScope,
  LogExportRequest,
  LogExportResult,
  LoggedAnalogSample,
  LoggedCapturedMessage,
  OnOffState,
} from './types'
import type { DRPDLogStore, DRPDLoggingDiagnostics, DRPDLogCounts } from './logging'
import { DRPDAnalogMonitor } from './analogMonitor'
import { DRPDCCBus } from './ccBus'
import { DRPDCapture } from './capture'
import { DRPDStatus } from './status'
import { DRPDSink } from './sink'
import { DRPDSystem } from './system'
import { DRPDTest } from './test'
import { DRPDTrigger } from './trigger'
import { DRPDVBus } from './vbus'

const LEGACY_CAPTURE_RETENTION = 50

/**
 * Optional DRPD device constructor overrides.
 */
export interface DRPDDeviceOptions {
  ///< Optional log store factory.
  createLogStore?: (config: DRPDLoggingConfig) => DRPDLogStore
}

/**
 * Main DRPD device driver.
 */
export class DRPDDevice extends EventTarget {
  public static readonly STATE_UPDATED_EVENT = 'stateupdated' ///< State update event.
  public static readonly ROLE_CHANGED_EVENT = 'rolechanged' ///< Role changed event.
  public static readonly CCBUS_STATUS_CHANGED_EVENT = 'ccbusstatuschanged' ///< CC bus status event.
  public static readonly VBUS_CHANGED_EVENT = 'vbuschanged' ///< VBUS change event.
  public static readonly CAPTURE_STATUS_CHANGED_EVENT = 'capturestatuschanged' ///< Capture status event.
  public static readonly ANALOG_MONITOR_CHANGED_EVENT = 'analogmonitorchanged' ///< Analog monitor event.
  public static readonly TRIGGER_CHANGED_EVENT = 'triggerchanged' ///< Trigger info event.
  public static readonly SINK_INFO_CHANGED_EVENT = 'sinkinfochanged' ///< Sink info event.
  public static readonly SINK_PDO_LIST_CHANGED_EVENT = 'sinkpdolistchanged' ///< Sink PDO list event.
  public static readonly MESSAGE_CAPTURED_EVENT = 'messagecaptured' ///< Captured message event.
  public static readonly LOG_ENTRY_ADDED_EVENT = 'logentryadded' ///< Logged entry added event.
  public static readonly LOG_ENTRY_DELETED_EVENT = 'logentrydeleted' ///< Logged entry deleted event.
  public static readonly STATE_ERROR_EVENT = 'stateerror' ///< State error event.

  public readonly system: DRPDSystem ///< System command group.
  public readonly status: DRPDStatus ///< Status command group.
  public readonly analogMonitor: DRPDAnalogMonitor ///< Analog monitor group.
  public readonly ccBus: DRPDCCBus ///< CC bus command group.
  public readonly capture: DRPDCapture ///< Capture command group.
  public readonly vbus: DRPDVBus ///< VBUS command group.
  public readonly sink: DRPDSink ///< Sink command group.
  public readonly trigger: DRPDTrigger ///< Trigger command group.
  public readonly test: DRPDTest ///< Test command group.

  protected readonly transport: DRPDTransport ///< Transport instance.
  protected state: DRPDDeviceState ///< Current device state.
  protected interruptSource?: EventTarget ///< Interrupt event source.
  protected interruptInFlight?: Promise<void> ///< In-flight interrupt handler.
  protected readonly interruptHandler: () => void ///< Interrupt handler.
  protected readonly interruptErrorHandler: (event: Event) => void ///< Interrupt error handler.
  protected analogMonitorTimer?: ReturnType<typeof setInterval> ///< Analog monitor polling timer.
  protected analogMonitorIntervalMs: number ///< Analog monitor polling interval in ms.
  protected analogMonitorPollingActive: boolean ///< Analog monitor polling active flag.
  protected analogMonitorInFlight: boolean ///< Analog monitor request in flight flag.
  protected captureDrainTimer?: ReturnType<typeof setInterval> ///< Capture drain polling timer.
  protected captureDrainIntervalMs: number ///< Capture drain polling interval in ms.
  protected captureDrainPollingActive: boolean ///< Capture drain polling active flag.
  protected captureDrainInFlight: boolean ///< Capture drain polling in flight flag.
  protected isConnected: boolean ///< True when the device is connected.
  protected debugLoggingEnabled: boolean ///< Debug logging flag.
  protected loggingConfig: DRPDLoggingConfig ///< Active logging configuration.
  protected logStore?: DRPDLogStore ///< Active log store instance.
  protected loggingStarted: boolean ///< True when logging is started.
  protected readonly createLogStore: (config: DRPDLoggingConfig) => DRPDLogStore ///< Log store factory.
  protected activeDisplayEpochStartUs: bigint | null ///< Active display-timestamp epoch anchor.
  protected pendingDisplayEpochReset: boolean ///< True when next message should reset display epoch.
  protected lastKnownDeviceTimestampUs: bigint | null ///< Last observed/synthesized stream timestamp.
  protected captureCycleTimeNs: number | null ///< Capture cycle duration in nanoseconds.

  /**
   * Create a DRPD device driver.
   *
   * @param transport - Transport instance.
   */
  public constructor(transport: DRPDTransport, options?: DRPDDeviceOptions) {
    super()
    this.transport = transport
    this.system = new DRPDSystem(transport)
    this.status = new DRPDStatus(transport)
    this.analogMonitor = new DRPDAnalogMonitor(transport)
    this.ccBus = new DRPDCCBus(transport)
    this.capture = new DRPDCapture(transport)
    this.vbus = new DRPDVBus(transport)
    this.sink = new DRPDSink(transport)
    this.trigger = new DRPDTrigger(transport)
    this.test = new DRPDTest(transport)
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
    this.analogMonitorIntervalMs = 250
    this.analogMonitorPollingActive = false
    this.analogMonitorInFlight = false
    this.captureDrainIntervalMs = 1000
    this.captureDrainPollingActive = false
    this.captureDrainInFlight = false
    this.isConnected = false
    this.debugLoggingEnabled = false
    this.loggingConfig = buildDefaultLoggingConfig()
    this.loggingStarted = false
    this.createLogStore = options?.createLogStore ?? ((config) => new SQLiteWasmStore(config))
    this.activeDisplayEpochStartUs = null
    this.pendingDisplayEpochReset = false
    this.lastKnownDeviceTimestampUs = null
    this.captureCycleTimeNs = null
    this.interruptHandler = () => {
      if (this.interruptInFlight) {
        return
      }
      const task = this.handleInterrupt()
      this.interruptInFlight = task
      void task.finally(() => {
        if (this.interruptInFlight === task) {
          this.interruptInFlight = undefined
        }
      })
    }
    this.interruptErrorHandler = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : event
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error: detail } }),
      )
    }

    if ('addEventListener' in transport) {
      const target = transport as unknown as EventTarget
      this.interruptSource = target
      target.addEventListener(USBTMCTransport.INTERRUPT_EVENT, this.interruptHandler)
      target.addEventListener(USBTMCTransport.INTERRUPT_ERROR_EVENT, this.interruptErrorHandler)
    }
  }

  /**
   * Access a snapshot of the current device state.
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
   * Enable or disable debug logging.
   *
   * @param enabled - True to enable debug logs.
   */
  public setDebugLoggingEnabled(enabled: boolean): void {
    this.debugLoggingEnabled = enabled
  }

  /**
   * Configure logging behavior for this device.
   *
   * @param config - Logging configuration values.
   */
  public async configureLogging(config: DRPDLoggingConfig): Promise<void> {
    this.loggingConfig = this.normalizeLoggingConfig(config)
    if (this.loggingStarted) {
      await this.stopLogging()
      if (this.loggingConfig.enabled) {
        await this.startLogging()
      }
    }
  }

  /**
   * Start the logging subsystem.
   */
  public async startLogging(): Promise<void> {
    if (this.loggingStarted || !this.loggingConfig.enabled) {
      return
    }
    try {
      await this.ensureLogStoreOpen()
      if (!this.logStore) {
        return
      }
      this.loggingStarted = true
      this.logDebug('logging: started')
    } catch (error) {
      await this.closeLogStore()
      this.loggingStarted = false
      this.dispatchEvent(new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }))
      this.logDebug(`logging: start error=${String(error)}`)
    }
  }

  /**
   * Stop the logging subsystem.
   */
  public async stopLogging(): Promise<void> {
    if (!this.loggingStarted) {
      return
    }
    this.loggingStarted = false
    this.activeDisplayEpochStartUs = null
    this.pendingDisplayEpochReset = false
    this.logDebug('logging: stopped')
  }

  /**
   * Return true when logging is currently started.
   *
   * @returns Logging state.
   */
  public isLoggingEnabled(): boolean {
    return this.loggingStarted
  }

  /**
   * Return logging backend diagnostics for debug/console tooling.
   *
   * @returns Backend diagnostics snapshot.
   */
  public getLoggingDiagnostics(): DRPDLoggingDiagnostics {
    const storeDiagnostics = this.logStore?.getDiagnostics?.()
    return (
      storeDiagnostics ?? {
        loggingStarted: this.loggingStarted,
        loggingConfigured: this.loggingConfig.enabled,
        backend: 'none',
        persistent: false,
        sqlite: false,
        opfs: false,
      }
    )
  }

  /**
   * Return current log row counts for debug/console tooling.
   *
   * @returns Log row counts.
   */
  public async getLogCounts(): Promise<DRPDLogCounts> {
    await this.ensureLogStoreAvailableForRead()
    if (!this.logStore) {
      return { analog: 0, messages: 0 }
    }
    if (typeof this.logStore.getCounts === 'function') {
      return await this.logStore.getCounts()
    }
    return {
      analog: (await this.queryAnalogSamples({
        startTimestampUs: 0n,
        endTimestampUs: BigInt('9223372036854775807'),
      })).length,
      messages: (await this.queryCapturedMessages({
        startTimestampUs: 0n,
        endTimestampUs: BigInt('9223372036854775807'),
      })).length,
    }
  }

  /**
   * Enable or disable capture, auto-enabling logging when capture is turned on.
   *
   * @param enabled - Desired capture state.
   */
  public async setCaptureEnabled(enabled: OnOffState): Promise<void> {
    if (enabled === OnOffStateValues.ON) {
      if (!this.loggingConfig.enabled) {
        await this.configureLogging({ ...this.loggingConfig, enabled: true })
      }
      if (!this.loggingStarted) {
        await this.startLogging()
      }
    }
    const previousCaptureEnabled = this.state.captureEnabled
    await this.capture.setCaptureEnabled(enabled)
    if (previousCaptureEnabled !== enabled) {
      this.state = { ...this.state, captureEnabled: enabled }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.CAPTURE_STATUS_CHANGED_EVENT, {
          detail: { previous: previousCaptureEnabled, current: enabled },
        }),
      )
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { state: this.getState(), changed: ['captureEnabled'] },
        }),
      )
      if (previousCaptureEnabled !== null) {
        await this.logSignificantEvent(
          'capture_changed',
          `Capture turned ${enabled === OnOffStateValues.ON ? 'on' : 'off'}`,
        )
      }
    }
    if (enabled === OnOffStateValues.OFF) {
      await this.stopLogging()
    }
  }

  /**
   * Query logged analog samples.
   *
   * @param query - Query criteria.
   * @returns Matching rows.
   */
  public async queryAnalogSamples(query: AnalogSampleQuery): Promise<LoggedAnalogSample[]> {
    await this.ensureLogStoreAvailableForRead()
    if (!this.logStore) {
      return []
    }
    return this.logStore.queryAnalogSamples(query)
  }

  /**
   * Query logged captured USB-PD messages.
   *
   * @param query - Query criteria.
   * @returns Matching rows.
   */
  public async queryCapturedMessages(
    query: CapturedMessageQuery,
  ): Promise<LoggedCapturedMessage[]> {
    await this.ensureLogStoreAvailableForRead()
    if (!this.logStore) {
      return []
    }
    return this.logStore.queryCapturedMessages(query)
  }

  /**
   * Return the current message-log selection state.
   *
   * @returns Selection snapshot.
   */
  public getLogSelectionState(): DRPDLogSelectionState {
    return {
      selectedKeys: [...this.state.logSelection.selectedKeys],
      anchorIndex: this.state.logSelection.anchorIndex,
      activeIndex: this.state.logSelection.activeIndex,
    }
  }

  /**
   * Replace message-log selection state.
   *
   * @param next - Next selection state.
   */
  public setLogSelectionState(next: DRPDLogSelectionState): void {
    this.updateLogSelectionState(next)
  }

  /**
   * Clear all message-log selection state.
   */
  public clearLogSelection(): void {
    this.updateLogSelectionState({
      selectedKeys: [],
      anchorIndex: null,
      activeIndex: null,
    })
  }

  /**
   * Resolve row keys for a message index range (inclusive).
   *
   * @param startIndex - Start row index.
   * @param endIndex - End row index.
   * @returns Stable row keys within the range.
   */
  public async resolveLogSelectionKeysForIndexRange(
    startIndex: number,
    endIndex: number,
  ): Promise<string[]> {
    if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex)) {
      return []
    }
    const normalizedStart = Math.max(0, Math.floor(Math.min(startIndex, endIndex)))
    const normalizedEnd = Math.max(0, Math.floor(Math.max(startIndex, endIndex)))
    const limit = normalizedEnd - normalizedStart + 1
    if (limit <= 0) {
      return []
    }
    const rows = await this.queryCapturedMessages({
      startTimestampUs: 0n,
      endTimestampUs: BigInt('9223372036854775807'),
      sortOrder: 'asc',
      offset: normalizedStart,
      limit,
    })
    return rows.map((row) => buildCapturedLogSelectionKey(row))
  }

  /**
   * Export selected logged data.
   *
   * @param request - Export request.
   * @returns Export result.
   */
  public async exportLogs(request: LogExportRequest): Promise<LogExportResult> {
    if (!this.logStore) {
      return {
        mimeType: request.format === 'json' ? 'application/json' : 'text/csv',
        payload: request.format === 'json' ? '{\"analogSamples\":[],\"capturedMessages\":[]}' : '',
        analogCount: 0,
        messageCount: 0,
      }
    }
    return this.logStore.exportData(request)
  }

  /**
   * Clear logged rows.
   *
   * @param scope - Clear scope.
   * @returns Cleared row counts.
   */
  public async clearLogs(scope: LogClearScope): Promise<LogClearResult> {
    if (!this.logStore) {
      return { analogDeleted: 0, messagesDeleted: 0 }
    }
    const result = await this.logStore.clear(scope)
    if (scope === 'messages' || scope === 'all') {
      this.activeDisplayEpochStartUs = null
      this.pendingDisplayEpochReset = false
      this.lastKnownDeviceTimestampUs = null
      if (this.state.logSelection.selectedKeys.length > 0) {
        this.clearLogSelection()
      }
    }
    if (result.analogDeleted > 0 || result.messagesDeleted > 0) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.LOG_ENTRY_DELETED_EVENT, {
          detail: {
            scope,
            analogDeleted: result.analogDeleted,
            messagesDeleted: result.messagesDeleted,
            reason: 'clear',
          },
        }),
      )
    }
    return result
  }

  /**
   * Start polling analog monitor channels.
   *
   * @param intervalMs - Poll interval in milliseconds.
   */
  public startAnalogMonitorPolling(intervalMs = 250): void {
    this.analogMonitorIntervalMs = intervalMs
    this.stopAnalogMonitorPolling()
    this.analogMonitorTimer = setInterval(() => {
      void this.pollAnalogMonitor()
    }, intervalMs)
    this.analogMonitorPollingActive = true
  }

  /**
   * Stop polling analog monitor channels.
   */
  public stopAnalogMonitorPolling(): void {
    if (this.analogMonitorTimer) {
      clearInterval(this.analogMonitorTimer)
      this.analogMonitorTimer = undefined
    }
    this.analogMonitorPollingActive = false
  }

  /**
   * Update the analog monitor polling interval.
   *
   * @param intervalMs - Poll interval in milliseconds.
   */
  public setAnalogMonitorPollingInterval(intervalMs: number): void {
    this.analogMonitorIntervalMs = intervalMs
    if (this.analogMonitorPollingActive) {
      this.startAnalogMonitorPolling(intervalMs)
    }
  }

  /**
   * Start polling the capture queue for new messages.
   *
   * @param intervalMs - Poll interval in milliseconds.
   */
  public startCaptureDrainPolling(intervalMs = 1000): void {
    this.captureDrainIntervalMs = intervalMs
    this.stopCaptureDrainPolling()
    this.captureDrainTimer = setInterval(() => {
      void this.pollCaptureDrain()
    }, intervalMs)
    this.captureDrainPollingActive = true
  }

  /**
   * Stop polling the capture queue.
   */
  public stopCaptureDrainPolling(): void {
    if (this.captureDrainTimer) {
      clearInterval(this.captureDrainTimer)
      this.captureDrainTimer = undefined
    }
    this.captureDrainPollingActive = false
  }

  /**
   * Update the capture drain polling interval.
   *
   * @param intervalMs - Poll interval in milliseconds.
   */
  public setCaptureDrainPollingInterval(intervalMs: number): void {
    this.captureDrainIntervalMs = intervalMs
    if (this.captureDrainPollingActive) {
      this.startCaptureDrainPolling(intervalMs)
    }
  }

  /**
   * Handle device connection events.
   */
  public handleConnect(): void {
    this.logDebug('connect: start')
    this.isConnected = true
    void this.runConnectTasks().finally(() => {
      if (this.isConnected) {
        this.startAnalogMonitorPolling(this.analogMonitorIntervalMs)
        this.startCaptureDrainPolling(this.captureDrainIntervalMs)
      }
    })
  }

  /**
   * Handle device disconnection events.
   */
  public handleDisconnect(): void {
    this.logDebug('disconnect: start')
    this.isConnected = false
    this.stopAnalogMonitorPolling()
    this.stopCaptureDrainPolling()
    void this.stopLogging().finally(() => this.closeLogStore())
    this.activeDisplayEpochStartUs = null
    this.pendingDisplayEpochReset = false
    this.lastKnownDeviceTimestampUs = null
    this.captureCycleTimeNs = null
    const hadRole = this.state.role !== null
    const hadRoleStatus = this.state.ccBusRoleStatus !== null
    const hadAnalog = this.state.analogMonitor !== null
    const hadVbus = this.state.vbusInfo !== null
    const hadCaptureEnabled = this.state.captureEnabled !== null
    const hadTrigger = this.state.triggerInfo !== null
    const hadSinkInfo = this.state.sinkInfo !== null
    const hadPdoList = this.state.sinkPdoList !== null
    if (
      hadRole ||
      hadRoleStatus ||
      hadAnalog ||
      hadVbus ||
      hadCaptureEnabled ||
      hadTrigger ||
      hadSinkInfo ||
      hadPdoList
    ) {
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
      const changed: string[] = []
      if (hadRole) {
        changed.push('role')
      }
      if (hadRoleStatus) {
        changed.push('ccBusRoleStatus')
      }
      if (hadAnalog) {
        changed.push('analogMonitor')
      }
      if (hadVbus) {
        changed.push('vbusInfo')
      }
      if (hadCaptureEnabled) {
        changed.push('captureEnabled')
      }
      if (hadTrigger) {
        changed.push('triggerInfo')
      }
      if (hadSinkInfo) {
        changed.push('sinkInfo')
      }
      if (hadPdoList) {
        changed.push('sinkPdoList')
      }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { state: this.getState(), changed },
        }),
      )
    }
  }

  /**
   * Refresh all tracked state from the device.
   */
  public async refreshState(): Promise<void> {
    this.logDebug('refreshState: start')
    const updated: DRPDDeviceState = { ...this.state }
    const changed: string[] = []
    const roleResult = await this.ccBus.getRole().then(
      (value) => ({ status: 'fulfilled', value } as const),
      (reason) => ({ status: 'rejected', reason } as const),
    )
    if (roleResult.status === 'fulfilled') {
      if (updated.role !== roleResult.value) {
        updated.role = roleResult.value
        changed.push('role')
      }
    } else {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error: roleResult.reason } }),
      )
    }

    const shouldQuerySink = updated.role === 'SINK'

    const results = await Promise.allSettled([
      this.ccBus.getRoleStatus(),
      this.analogMonitor.getStatus(),
      this.vbus.getInfo(),
      this.capture.getCaptureEnabled(),
      this.trigger.getInfo(),
      shouldQuerySink ? this.sink.getSinkInfo() : Promise.resolve(null),
      shouldQuerySink ? this.fetchSinkPdoList() : Promise.resolve(null)
    ])

    const [
      roleStatusResult,
      analogResult,
      vbusResult,
      captureEnabledResult,
      triggerResult,
      sinkInfoResult,
      pdoListResult
    ] = results

    if (roleStatusResult.status === 'fulfilled') {
      if (updated.ccBusRoleStatus !== roleStatusResult.value) {
        updated.ccBusRoleStatus = roleStatusResult.value
        changed.push('ccBusRoleStatus')
      }
    } else {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error: roleStatusResult.reason } }),
      )
    }

    if (analogResult.status === 'fulfilled') {
      if (!this.isAnalogMonitorEqual(updated.analogMonitor, analogResult.value)) {
        updated.analogMonitor = analogResult.value
        changed.push('analogMonitor')
      }
    } else {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error: analogResult.reason } }),
      )
    }

    if (vbusResult.status === 'fulfilled') {
      if (updated.vbusInfo !== vbusResult.value) {
        updated.vbusInfo = vbusResult.value
        changed.push('vbusInfo')
      }
    } else {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error: vbusResult.reason } }),
      )
    }

    if (captureEnabledResult.status === 'fulfilled') {
      if (updated.captureEnabled !== captureEnabledResult.value) {
        updated.captureEnabled = captureEnabledResult.value
        changed.push('captureEnabled')
      }
    } else {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error: captureEnabledResult.reason } }),
      )
    }


    if (triggerResult.status === 'fulfilled') {
      if (updated.triggerInfo !== triggerResult.value) {
        updated.triggerInfo = triggerResult.value
        changed.push('triggerInfo')
      }
    } else {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error: triggerResult.reason } }),
      )
    }

    if (shouldQuerySink) {
      if (sinkInfoResult.status === 'fulfilled') {
        if (updated.sinkInfo !== sinkInfoResult.value) {
          updated.sinkInfo = sinkInfoResult.value
          changed.push('sinkInfo')
        }
      } else {
        this.dispatchEvent(
          new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error: sinkInfoResult.reason } }),
        )
      }

      if (pdoListResult.status === 'fulfilled') {
        updated.sinkPdoList = pdoListResult.value
        changed.push('sinkPdoList')
      } else {
        this.dispatchEvent(
          new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error: pdoListResult.reason } }),
        )
      }
    } else if (this.state.sinkInfo || this.state.sinkPdoList) {
      updated.sinkInfo = null
      updated.sinkPdoList = null
      changed.push('sinkInfo', 'sinkPdoList')
    }

    if (!changed.length) {
      this.logDebug('refreshState: no changes')
      return
    }

    const previousRole = this.state.role
    const previousAnalog = this.state.analogMonitor
    const previousRoleStatus = this.state.ccBusRoleStatus
    const previousVbus = this.state.vbusInfo
    const previousCaptureEnabled = this.state.captureEnabled
    const previousTrigger = this.state.triggerInfo
    const previousSinkInfo = this.state.sinkInfo
    const previousPdoList = this.state.sinkPdoList
    this.state = updated

    if (changed.includes('role')) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.ROLE_CHANGED_EVENT, {
          detail: { role: updated.role, previousRole },
        }),
      )
      if (updated.role && previousRole !== null) {
        void this.logSignificantEvent('cc_role_changed', `CC role changed to ${updated.role}`)
      }
    }

    if (changed.includes('ccBusRoleStatus')) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.CCBUS_STATUS_CHANGED_EVENT, {
          detail: { roleStatus: updated.ccBusRoleStatus, previousRoleStatus },
        }),
      )
      if (updated.ccBusRoleStatus && previousRoleStatus !== null) {
        void this.logSignificantEvent(
          'cc_status_changed',
          `Device status changed to ${updated.ccBusRoleStatus}`,
        )
      }
    }

    if (changed.includes('analogMonitor')) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.ANALOG_MONITOR_CHANGED_EVENT, {
          detail: { previous: previousAnalog, current: updated.analogMonitor },
        }),
      )
    }

    if (changed.includes('vbusInfo')) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.VBUS_CHANGED_EVENT, {
          detail: { previous: previousVbus, current: updated.vbusInfo },
        }),
      )
    }

    if (changed.includes('captureEnabled')) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.CAPTURE_STATUS_CHANGED_EVENT, {
          detail: { previous: previousCaptureEnabled, current: updated.captureEnabled },
        }),
      )
      if (updated.captureEnabled && previousCaptureEnabled !== null) {
        void this.logSignificantEvent(
          'capture_changed',
          `Capture turned ${updated.captureEnabled === OnOffStateValues.ON ? 'on' : 'off'}`,
        )
      }
    }


    if (changed.includes('triggerInfo')) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.TRIGGER_CHANGED_EVENT, {
          detail: { previous: previousTrigger, current: updated.triggerInfo },
        }),
      )
    }

    if (changed.includes('sinkInfo')) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.SINK_INFO_CHANGED_EVENT, {
          detail: { previous: previousSinkInfo, current: updated.sinkInfo },
        }),
      )
    }

    if (changed.includes('sinkPdoList')) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.SINK_PDO_LIST_CHANGED_EVENT, {
          detail: { previous: previousPdoList, current: updated.sinkPdoList },
        }),
      )
    }

    this.dispatchEvent(
      new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
        detail: { state: this.getState(), changed },
      }),
    )
    this.logDebug(`refreshState: changed=${changed.join(',')}`)
  }

  /**
   * Stop listening for interrupt events.
   */
  public detachInterrupts(): void {
    if (!this.interruptSource) {
      return
    }
    this.interruptSource.removeEventListener(USBTMCTransport.INTERRUPT_EVENT, this.interruptHandler)
    this.interruptSource.removeEventListener(
      USBTMCTransport.INTERRUPT_ERROR_EVENT,
      this.interruptErrorHandler,
    )
    this.interruptSource = undefined
  }

  /**
   * Handle an interrupt event by querying the device status register.
   */
  protected async handleInterrupt(): Promise<void> {
    this.logDebug('interrupt: start')
    try {
      const statusFlags = await this.status.readDeviceStatus()
      const tasks: Promise<void>[] = []
      if (statusFlags.roleChanged) {
        tasks.push(this.refreshRoleFromDevice())
      }
      if (statusFlags.ccBusStatusChanged) {
        tasks.push(this.refreshRoleStatusFromDevice())
      }
      if (statusFlags.vbusStatusChanged) {
        tasks.push(this.refreshVBusFromDevice())
      }
      if (statusFlags.captureStatusChanged) {
        tasks.push(this.refreshCaptureEnabledFromDevice())
      }
      if (statusFlags.triggerStatusChanged) {
        tasks.push(this.refreshTriggerFromDevice())
      }
      if (statusFlags.sinkStatusChanged) {
        tasks.push(this.refreshSinkInfoFromDevice())
      }
      if (statusFlags.sinkPdoListChanged) {
        tasks.push(this.refreshSinkPdoListFromDevice())
      }
      await Promise.all(tasks)
      if (statusFlags.messageReceived) {
        await this.refreshAndDrainCapturedMessagesFromDevice()
      }
      this.logDebug('interrupt: done')
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
      )
      this.logDebug(`interrupt: error=${String(error)}`)
    }
  }

  /**
   * Update the stored role and emit events as needed.
   *
   * @param role - New CC bus role.
   */
  protected updateRole(role: CCBusRole): void {
    const previousRole = this.state.role
    if (previousRole === role) {
      return
    }
    const shouldClearSink = role !== 'SINK'
    const previousSinkInfo = this.state.sinkInfo
    const previousSinkPdoList = this.state.sinkPdoList
    this.state = {
      ...this.state,
      role,
      sinkInfo: shouldClearSink ? null : this.state.sinkInfo,
      sinkPdoList: shouldClearSink ? null : this.state.sinkPdoList
    }
    this.dispatchEvent(
      new CustomEvent(DRPDDevice.ROLE_CHANGED_EVENT, {
        detail: { role, previousRole },
      }),
    )
    if (previousRole !== null) {
      void this.logSignificantEvent('cc_role_changed', `CC role changed to ${role}`)
    }
    if (shouldClearSink && (previousSinkInfo || previousSinkPdoList)) {
      if (previousSinkInfo) {
        this.dispatchEvent(
          new CustomEvent(DRPDDevice.SINK_INFO_CHANGED_EVENT, {
            detail: { previous: previousSinkInfo, current: null },
          }),
        )
      }
      if (previousSinkPdoList) {
        this.dispatchEvent(
          new CustomEvent(DRPDDevice.SINK_PDO_LIST_CHANGED_EVENT, {
            detail: { previous: previousSinkPdoList, current: null },
          }),
        )
      }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { state: this.getState(), changed: ['role', 'sinkInfo', 'sinkPdoList'] },
        }),
      )
      return
    }
    this.dispatchEvent(
      new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
        detail: { state: this.getState(), changed: ['role'] },
      }),
    )
  }

  /**
   * Refresh CC bus role from the device.
   */
  protected async refreshRoleFromDevice(): Promise<void> {
    try {
      const role = await this.ccBus.getRole()
      this.updateRole(role)
      this.logDebug(`refreshRole: ${role}`)
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
      )
      this.logDebug(`refreshRole: error=${String(error)}`)
    }
  }

  /**
   * Refresh CC bus role status from the device.
   */
  protected async refreshRoleStatusFromDevice(): Promise<void> {
    try {
      const roleStatus = await this.ccBus.getRoleStatus()
      const previousRoleStatus = this.state.ccBusRoleStatus
      if (previousRoleStatus === roleStatus) {
        return
      }
      this.state = { ...this.state, ccBusRoleStatus: roleStatus }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.CCBUS_STATUS_CHANGED_EVENT, {
          detail: { roleStatus },
        }),
      )
      if (previousRoleStatus !== null) {
        void this.logSignificantEvent(
          'cc_status_changed',
          `Device status changed to ${roleStatus}`,
        )
      }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { state: this.getState(), changed: ['ccBusRoleStatus'] },
        }),
      )
      this.logDebug(`refreshRoleStatus: ${roleStatus}`)
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
      )
      this.logDebug(`refreshRoleStatus: error=${String(error)}`)
    }
  }

  /**
   * Refresh VBUS info from the device.
   */
  protected async refreshVBusFromDevice(): Promise<void> {
    try {
      const vbusInfo = await this.vbus.getInfo()
      if (this.state.vbusInfo === vbusInfo) {
        return
      }
      this.state = { ...this.state, vbusInfo }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.VBUS_CHANGED_EVENT, {
          detail: { vbusInfo },
        }),
      )
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { state: this.getState(), changed: ['vbusInfo'] },
        }),
      )
      this.logDebug('refreshVBus: updated')
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
      )
      this.logDebug(`refreshVBus: error=${String(error)}`)
    }
  }

  /**
   * Refresh capture enabled status from the device.
   */
  protected async refreshCaptureEnabledFromDevice(): Promise<void> {
    try {
      const captureEnabled = await this.capture.getCaptureEnabled()
      const previousCaptureEnabled = this.state.captureEnabled
      if (previousCaptureEnabled === captureEnabled) {
        return
      }
      this.state = { ...this.state, captureEnabled }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.CAPTURE_STATUS_CHANGED_EVENT, {
          detail: { captureEnabled },
        }),
      )
      if (previousCaptureEnabled !== null) {
        void this.logSignificantEvent(
          'capture_changed',
          `Capture turned ${captureEnabled === OnOffStateValues.ON ? 'on' : 'off'}`,
        )
      }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { state: this.getState(), changed: ['captureEnabled'] },
        }),
      )
      this.logDebug(`refreshCaptureEnabled: ${captureEnabled}`)
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
      )
      this.logDebug(`refreshCaptureEnabled: error=${String(error)}`)
    }
  }

  /**
   * Refresh trigger info from the device.
   */
  protected async refreshTriggerFromDevice(): Promise<void> {
    try {
      const triggerInfo = await this.trigger.getInfo()
      if (this.state.triggerInfo === triggerInfo) {
        return
      }
      this.state = { ...this.state, triggerInfo }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.TRIGGER_CHANGED_EVENT, {
          detail: { triggerInfo },
        }),
      )
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { state: this.getState(), changed: ['triggerInfo'] },
        }),
      )
      this.logDebug('refreshTrigger: updated')
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
      )
      this.logDebug(`refreshTrigger: error=${String(error)}`)
    }
  }

  /**
   * Refresh sink info from the device.
   */
  protected async refreshSinkInfoFromDevice(): Promise<void> {
    try {
      if (this.state.role !== 'SINK') {
        this.logDebug('refreshSinkInfo: skipped (role not SINK)')
        return
      }
      const sinkInfo = await this.sink.getSinkInfo()
      if (this.state.sinkInfo === sinkInfo) {
        return
      }
      this.state = { ...this.state, sinkInfo }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.SINK_INFO_CHANGED_EVENT, {
          detail: { sinkInfo },
        }),
      )
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { state: this.getState(), changed: ['sinkInfo'] },
        }),
      )
      this.logDebug('refreshSinkInfo: updated')
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
      )
      this.logDebug(`refreshSinkInfo: error=${String(error)}`)
    }
  }

  /**
   * Refresh sink PDO list from the device.
   */
  protected async refreshSinkPdoListFromDevice(): Promise<void> {
    try {
      if (this.state.role !== 'SINK') {
        this.logDebug('refreshSinkPdoList: skipped (role not SINK)')
        return
      }
      const pdoCount = await this.sink.getAvailablePdoCount()
      const pdoList = await Promise.all(
        Array.from({ length: pdoCount }, (_, index) => this.sink.getPdoAtIndex(index)),
      )
      this.state = { ...this.state, sinkPdoList: pdoList }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.SINK_PDO_LIST_CHANGED_EVENT, {
          detail: { sinkPdoList: pdoList },
        }),
      )
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { state: this.getState(), changed: ['sinkPdoList'] },
        }),
      )
      this.logDebug(`refreshSinkPdoList: count=${pdoList.length}`)
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
      )
      this.logDebug(`refreshSinkPdoList: error=${String(error)}`)
    }
  }

  /**
   * Refresh capture count and drain captured messages until none remain.
   */
  protected async refreshAndDrainCapturedMessagesFromDevice(): Promise<void> {
    this.logDebug('refreshAndDrainCapturedMessages: start')
    if (this.captureCycleTimeNs === null) {
      try {
        this.captureCycleTimeNs = await this.capture.getCycleTimeNs()
        this.logDebug(`refreshAndDrainCapturedMessages: captureCycleTimeNs=${this.captureCycleTimeNs}`)
      } catch (error) {
        this.dispatchEvent(
          new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
        )
        this.logDebug(`refreshAndDrainCapturedMessages: cycle time error=${String(error)}`)
      }
    }
    while (true) {
      let captureCount: number
      try {
        captureCount = await this.capture.getCapturedMessageCount()
      } catch (error) {
        this.dispatchEvent(
          new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
        )
        this.logDebug(`refreshAndDrainCapturedMessages: count error=${String(error)}`)
        break
      }

      this.logDebug(`refreshAndDrainCapturedMessages: count=${captureCount}`)

      if (captureCount <= 0) {
        this.logDebug('refreshAndDrainCapturedMessages: done')
        break
      }

      for (let index = 0; index < captureCount; index += 1) {
        try {
          const message = await this.capture.getNextCapturedMessage()
          await this.logCapturedMessage(message)
          this.dispatchEvent(
            new CustomEvent(DRPDDevice.MESSAGE_CAPTURED_EVENT, {
              detail: { message },
            }),
          )
          this.logDebug('refreshAndDrainCapturedMessages: message')
        } catch (error) {
          this.dispatchEvent(
            new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
          )
          this.logDebug(`refreshAndDrainCapturedMessages: message error=${String(error)}`)
          return
        }
      }
    }
  }

  /**
   * Run initial state refreshes on connect.
   */
  protected async runConnectTasks(): Promise<void> {
    this.logDebug('runConnectTasks: start')
    await this.ensureLogStoreOpen()
    if (this.loggingConfig.enabled && this.loggingConfig.autoStartOnConnect) {
      await this.startLogging()
    }
    try {
      this.captureCycleTimeNs = await this.capture.getCycleTimeNs()
      this.logDebug(`runConnectTasks: captureCycleTimeNs=${this.captureCycleTimeNs}`)
    } catch (error) {
      this.captureCycleTimeNs = null
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
      )
      this.logDebug(`runConnectTasks: cycle time error=${String(error)}`)
    }
    await this.refreshState()
    await this.refreshAndDrainCapturedMessagesFromDevice()
    this.logDebug('runConnectTasks: done')
  }

  /**
   * Poll analog monitor channels and update state if changed.
   */
  protected async pollAnalogMonitor(): Promise<void> {
    if (!this.isConnected) {
      return
    }
    if (this.analogMonitorInFlight) {
      this.logDebug('pollAnalogMonitor: skip (in flight)')
      return
    }
    this.analogMonitorInFlight = true
    try {
      const next = await this.analogMonitor.getStatus()
      await this.logAnalogSample(next)
      if (this.isAnalogMonitorEqual(this.state.analogMonitor, next)) {
        return
      }
      const previous = this.state.analogMonitor
      this.state = { ...this.state, analogMonitor: next }
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.ANALOG_MONITOR_CHANGED_EVENT, {
          detail: { previous, current: next },
        }),
      )
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
          detail: { state: this.getState(), changed: ['analogMonitor'] },
        }),
      )
      this.logDebug('pollAnalogMonitor: updated')
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }),
      )
      this.logDebug(`pollAnalogMonitor: error=${String(error)}`)
    } finally {
      this.analogMonitorInFlight = false
    }
  }

  /**
   * Poll the capture queue and drain any pending messages.
   */
  protected async pollCaptureDrain(): Promise<void> {
    if (!this.isConnected) {
      return
    }
    if (this.captureDrainInFlight) {
      this.logDebug('pollCaptureDrain: skip (in flight)')
      return
    }
    this.captureDrainInFlight = true
    try {
      await this.refreshAndDrainCapturedMessagesFromDevice()
    } finally {
      this.captureDrainInFlight = false
    }
  }

  /**
   * Insert one analog sample into the active log store.
   *
   * @param sample - Analog monitor sample.
   */
  protected async logAnalogSample(sample: AnalogMonitorChannels): Promise<void> {
    if (!this.loggingStarted || !this.logStore) {
      return
    }
    try {
      this.lastKnownDeviceTimestampUs = sample.captureTimestampUs
      const row: LoggedAnalogSample = {
        timestampUs: sample.captureTimestampUs,
        displayTimestampUs:
          this.activeDisplayEpochStartUs === null
            ? null
            : sample.captureTimestampUs - this.activeDisplayEpochStartUs,
        vbusV: sample.vbus,
        ibusA: sample.ibus,
        role: this.state.role,
        createdAtMs: Date.now(),
      }
      await this.logStore.insertAnalogSample(row)
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
          detail: { kind: 'analog', row },
        }),
      )
    } catch (error) {
      this.dispatchEvent(new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }))
      this.logDebug(`logging analog insert error=${String(error)}`)
    }
  }

  /**
   * Insert one captured message into the active log store.
   *
   * @param message - Captured message from the device.
   */
  protected async logCapturedMessage(message: CapturedMessage): Promise<void> {
    if (!this.loggingStarted || !this.logStore) {
      return
    }
    try {
      const row = this.toLoggedCapturedMessage(message)
      await this.logStore.insertCapturedMessage(row)
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
          detail: { kind: 'message', row },
        }),
      )
    } catch (error) {
      this.dispatchEvent(new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }))
      this.logDebug(`logging message insert error=${String(error)}`)
    }
  }

  /**
   * Insert one significant event into the captured-message stream.
   *
   * @param eventType - Significant event type.
   * @param eventSummary - Human-readable summary text.
   */
  protected async logSignificantEvent(
    eventType: 'capture_changed' | 'cc_role_changed' | 'cc_status_changed',
    eventSummary: string,
  ): Promise<void> {
    if (!this.loggingStarted || !this.logStore) {
      return
    }
    try {
      const nowMs = Date.now()
      const eventText = `${eventSummary} at ${new Date(nowMs).toLocaleString()}`
      const syntheticTimestampUs = this.nextSyntheticStreamTimestampUs()
      const row: LoggedCapturedMessage = {
        entryKind: 'event',
        eventType,
        eventText,
        eventWallClockMs: nowMs,
        startTimestampUs: syntheticTimestampUs,
        endTimestampUs: syntheticTimestampUs,
        displayTimestampUs: null,
        decodeResult: 0,
        sopKind: null,
        messageKind: null,
        messageType: null,
        messageId: null,
        senderPowerRole: null,
        senderDataRole: null,
        pulseCount: 0,
        rawPulseWidths: new Float64Array(),
        rawSop: new Uint8Array(),
        rawDecodedData: new Uint8Array(),
        parseError: null,
        createdAtMs: nowMs,
      }
      await this.logStore.insertCapturedMessage(row)
      this.pendingDisplayEpochReset = true
      this.dispatchEvent(
        new CustomEvent(DRPDDevice.LOG_ENTRY_ADDED_EVENT, {
          detail: { kind: 'event', row },
        }),
      )
    } catch (error) {
      this.dispatchEvent(new CustomEvent(DRPDDevice.STATE_ERROR_EVENT, { detail: { error } }))
      this.logDebug(`logging event insert error=${String(error)}`)
    }
  }

  /**
   * Build a synthetic monotonic stream timestamp used for event rows.
   *
   * @returns Synthetic timestamp in microseconds.
   */
  protected nextSyntheticStreamTimestampUs(): bigint {
    const next = (this.lastKnownDeviceTimestampUs ?? 0n) + 1n
    this.lastKnownDeviceTimestampUs = next
    return next
  }

  /**
   * Ensure a log store exists and is initialized for this device session.
   */
  protected async ensureLogStoreOpen(): Promise<void> {
    if (this.logStore) {
      return
    }
    const store = this.createLogStore(this.loggingConfig)
    await store.init()
    this.logStore = store
  }

  /**
   * Normalize logging config for runtime compatibility.
   */
  protected normalizeLoggingConfig(config: DRPDLoggingConfig): DRPDLoggingConfig {
    const normalized: DRPDLoggingConfig = { ...config }
    if (normalized.maxCapturedMessages <= LEGACY_CAPTURE_RETENTION) {
      normalized.maxCapturedMessages = buildDefaultLoggingConfig().maxCapturedMessages
    }
    return normalized
  }

  /**
   * Best-effort open of the log store for read/query operations.
   */
  protected async ensureLogStoreAvailableForRead(): Promise<void> {
    if (this.logStore) {
      return
    }
    try {
      await this.ensureLogStoreOpen()
    } catch (error) {
      this.logDebug(`logging: read-open error=${String(error)}`)
    }
  }

  /**
   * Close and clear the current log store, if any.
   */
  protected async closeLogStore(): Promise<void> {
    if (!this.logStore) {
      return
    }
    try {
      await this.logStore.close()
    } finally {
      this.logStore = undefined
    }
  }

  /**
   * Apply a new message-log selection state and emit a state update when changed.
   *
   * @param next - Candidate selection state.
   */
  protected updateLogSelectionState(next: DRPDLogSelectionState): void {
    const normalized: DRPDLogSelectionState = {
      selectedKeys: Array.from(new Set(next.selectedKeys)),
      anchorIndex:
        next.anchorIndex === null ? null : Math.max(0, Math.floor(next.anchorIndex)),
      activeIndex:
        next.activeIndex === null ? null : Math.max(0, Math.floor(next.activeIndex)),
    }
    const current = this.state.logSelection
    const isSame =
      current.anchorIndex === normalized.anchorIndex &&
      current.activeIndex === normalized.activeIndex &&
      current.selectedKeys.length === normalized.selectedKeys.length &&
      current.selectedKeys.every((value, index) => value === normalized.selectedKeys[index])
    if (isSame) {
      return
    }
    this.state = {
      ...this.state,
      logSelection: normalized,
    }
    this.dispatchEvent(
      new CustomEvent(DRPDDevice.STATE_UPDATED_EVENT, {
        detail: { state: this.getState(), changed: ['logSelection'] },
      }),
    )
  }

  /**
   * Convert a captured device message into a persisted log row.
   *
   * @param message - Captured message.
   * @returns Logged captured message row.
   */
  protected toLoggedCapturedMessage(message: CapturedMessage): LoggedCapturedMessage {
    const rawSop = Uint8Array.from(message.sop)
    const rawDecodedData = Uint8Array.from(message.decodedData)
    const cycleTimeNs = this.captureCycleTimeNs ?? 1
    const rawPulseWidths = Float64Array.from(message.pulseWidths, (value) => value * cycleTimeNs)
    let sopKind: string | null = null
    let messageKind: string | null = null
    let messageType: number | null = null
    let messageId: number | null = null
    let senderPowerRole: string | null = null
    let senderDataRole: string | null = null
    let parseError: string | null = null

    try {
      const usbPayload = new Uint8Array(rawSop.length + rawDecodedData.length)
      usbPayload.set(rawSop, 0)
      usbPayload.set(rawDecodedData, rawSop.length)
      const parsedMessage = parseUSBPDMessage(usbPayload, rawPulseWidths)
      const header = parsedMessage.header.messageHeader
      sopKind = parsedMessage.sop.kind
      messageKind = header.messageKind
      messageType = header.messageTypeNumber
      messageId = header.messageId
      if (sopKind === 'SOP') {
        senderPowerRole = header.powerRole
        senderDataRole = header.dataRole
      } else if (
        sopKind === 'SOP_PRIME' ||
        sopKind === 'SOP_DOUBLE_PRIME' ||
        sopKind === 'SOP_DEBUG_PRIME' ||
        sopKind === 'SOP_DEBUG_DOUBLE_PRIME'
      ) {
        // SOP'/SOP'' is communication between Source (VCONN source) and Cable Plug/VPD.
        // Normalize port endpoint as SOURCE so sinks are never rendered as SOP'/SOP'' endpoints.
        senderPowerRole = 'SOURCE'
        senderDataRole = header.cablePlug
      }
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error)
    }

    if (this.activeDisplayEpochStartUs === null || this.pendingDisplayEpochReset) {
      this.activeDisplayEpochStartUs = message.startTimestampUs
      this.pendingDisplayEpochReset = false
    }
    this.lastKnownDeviceTimestampUs = message.endTimestampUs

    return {
      entryKind: 'message',
      eventType: null,
      eventText: null,
      eventWallClockMs: null,
      startTimestampUs: message.startTimestampUs,
      endTimestampUs: message.endTimestampUs,
      displayTimestampUs: message.startTimestampUs - this.activeDisplayEpochStartUs,
      decodeResult: message.decodeResult,
      sopKind,
      messageKind,
      messageType,
      messageId,
      senderPowerRole,
      senderDataRole,
      pulseCount: message.pulseCount,
      rawPulseWidths,
      rawSop,
      rawDecodedData,
      parseError,
      createdAtMs: Date.now(),
    }
  }

  /**
   * Compare analog monitor channel values.
   *
   * @param left - Previous values.
   * @param right - New values.
   * @returns True when values match.
   */
  protected isAnalogMonitorEqual(
    left: AnalogMonitorChannels | null,
    right: AnalogMonitorChannels | null,
  ): boolean {
    if (!left || !right) {
      return left === right
    }
    return (
      left.captureTimestampUs === right.captureTimestampUs &&
      left.vbus === right.vbus &&
      left.ibus === right.ibus &&
      left.dutCc1 === right.dutCc1 &&
      left.dutCc2 === right.dutCc2 &&
      left.usdsCc1 === right.usdsCc1 &&
      left.usdsCc2 === right.usdsCc2 &&
      left.adcVref === right.adcVref &&
      left.groundRef === right.groundRef &&
      left.currentVref === right.currentVref
    )
  }

  /**
   * Fetch the full sink PDO list.
   *
   * @returns Sink PDO list.
   */
  protected async fetchSinkPdoList(): Promise<DRPDDeviceState['sinkPdoList']> {
    const pdoCount = await this.sink.getAvailablePdoCount()
    const pdoList = await Promise.all(
      Array.from({ length: pdoCount }, (_, index) => this.sink.getPdoAtIndex(index)),
    )
    return pdoList
  }

  /**
   * Log a debug message if enabled.
   *
   * @param message - Debug message.
   */
  protected logDebug(message: string): void {
    if (!this.debugLoggingEnabled) {
      return
    }
    console.debug(`[DRPDDevice] ${message}`)
  }
}
