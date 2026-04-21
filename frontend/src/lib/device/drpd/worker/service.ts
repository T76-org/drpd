/**
 * @file service.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Main-thread client for the DRPD worker-backed transport/logging service.
 */

import type { DRPDUSBTransport } from '../../../transport/drpdUsb'
import {
  DRPD_TRANSPORT_INTERRUPT_ERROR_EVENT,
  DRPD_TRANSPORT_INTERRUPT_EVENT,
} from '../transport'
import type {
  HostTransportRpcRequest,
  MainToWorkerMessage,
  WorkerRpcRequest,
  WorkerToMainMessage,
} from './protocol'
import { deserializeWorkerError, serializeWorkerError } from './serialization'

const WORKER_HEARTBEAT_INTERVAL_MS = 5_000 ///< Heartbeat polling interval.
const WORKER_HEARTBEAT_TIMEOUT_MS = 20_000 ///< Max stale heartbeat age before reload.
const WORKER_RELOAD_GUARD_KEY = 'drpd:worker-stall-last-reload-ms' ///< Session storage key preventing reload loops.
const WORKER_RELOAD_GUARD_WINDOW_MS = 60_000 ///< Reload-loop suppression window.

/**
 * In-flight worker RPC promise handlers.
 */
type PendingRpc = {
  resolve: (value: unknown) => void ///< Resolve callback.
  reject: (error: Error) => void ///< Reject callback.
}

/**
 * Registered host transport and interrupt listeners.
 */
type HostTransportRegistration = {
  transport: DRPDUSBTransport ///< Main-thread DRPD USB transport.
  onInterrupt: (event: Event) => void ///< Interrupt listener.
  onInterruptError: (event: Event) => void ///< Interrupt error listener.
}

/**
 * Callback invoked for worker-emitted DRPD session events.
 */
type SessionEventHandler = (eventName: string, detail: unknown) => void

/**
 * Shared worker client singleton for DRPD transport/logging offload.
 */
export class DRPDWorkerServiceClient {
  protected static instance?: DRPDWorkerServiceClient ///< Singleton instance.

  protected readonly worker: Worker ///< Shared worker instance.
  protected rpcRequestCounter: number ///< Main-thread RPC request counter.
  protected pendingRpcs: Map<number, PendingRpc> ///< In-flight worker RPC promises.
  protected pendingRpcMethods: Map<number, WorkerRpcRequest['method']> ///< In-flight RPC method names keyed by request id.
  protected hostTransports: Map<string, HostTransportRegistration> ///< Host transport registry.
  protected transportEventHandlers: Map<string, (eventName: 'interrupt' | 'interrupterror', detail: unknown) => void> ///< Proxy event callbacks.
  protected sessionEventHandlers: Map<string, SessionEventHandler> ///< Worker DRPD session event callbacks.
  protected watchdogTimer?: ReturnType<typeof setInterval> ///< Heartbeat timer.
  protected lastHeartbeatAckMs: number ///< Last heartbeat ack timestamp.
  protected workerHealthy: boolean ///< True when heartbeat has succeeded.
  protected reloadTriggered: boolean ///< Prevent repeated reload attempts.

  /**
   * Get or create the shared worker client.
   *
   * @returns Worker service client instance.
   */
  public static getShared(): DRPDWorkerServiceClient {
    if (!DRPDWorkerServiceClient.instance) {
      DRPDWorkerServiceClient.instance = new DRPDWorkerServiceClient()
    }
    return DRPDWorkerServiceClient.instance
  }

  /**
   * Terminate and clear the shared worker client singleton.
   */
  public static resetShared(reason: string): void {
    const instance = DRPDWorkerServiceClient.instance
    if (!instance) {
      return
    }
    instance.dispose(reason)
    DRPDWorkerServiceClient.instance = undefined
  }

  /**
   * Create the shared worker client.
   */
  protected constructor() {
    this.worker = new Worker(new URL('./drpdIo.worker.ts', import.meta.url), { type: 'module' })
    this.rpcRequestCounter = 1
    this.pendingRpcs = new Map()
    this.pendingRpcMethods = new Map()
    this.hostTransports = new Map()
    this.transportEventHandlers = new Map()
    this.sessionEventHandlers = new Map()
    this.lastHeartbeatAckMs = Date.now()
    this.workerHealthy = false
    this.reloadTriggered = false

    this.worker.addEventListener('message', (event: MessageEvent<WorkerToMainMessage>) => {
      this.handleWorkerMessage(event.data)
    })
    this.worker.addEventListener('error', (event) => {
      this.triggerAutoRefresh(`worker error: ${event.message}`)
    })
    this.worker.addEventListener('messageerror', () => {
      this.triggerAutoRefresh('worker messageerror')
    })

    this.startWatchdog()
  }

  /**
   * Register a DRPD worker session event callback.
   *
   * @param sessionId - Worker session id.
   * @param handler - Event callback.
   */
  public registerDRPDSessionEvents(sessionId: string, handler: SessionEventHandler): void {
    this.sessionEventHandlers.set(sessionId, handler)
  }

  /**
   * Unregister a DRPD worker session event callback.
   *
   * @param sessionId - Worker session id.
   */
  public unregisterDRPDSessionEvents(sessionId: string): void {
    this.sessionEventHandlers.delete(sessionId)
  }

  /**
   * Register a main-thread host DRPD USB transport and forward interrupt events to the worker.
   *
   * @param transportId - Worker transport id.
   * @param transport - Main-thread DRPD USB transport.
   * @param onWorkerEvent - Callback for worker transport events mirrored back to the proxy.
   */
  public async registerHostTransport(
    transportId: string,
    transport: DRPDUSBTransport,
    onWorkerEvent: (eventName: 'interrupt' | 'interrupterror', detail: unknown) => void,
  ): Promise<void> {
    this.transportEventHandlers.set(transportId, onWorkerEvent)

    const onInterrupt = (event: Event): void => {
      const detail = event instanceof CustomEvent ? event.detail : undefined
      this.postToWorker({
        type: 'host-transport-event',
        transportId,
        eventName: 'interrupt',
        detail,
      })
    }
    const onInterruptError = (event: Event): void => {
      const detail = event instanceof CustomEvent ? event.detail : event
      this.postToWorker({
        type: 'host-transport-event',
        transportId,
        eventName: 'interrupterror',
        detail,
      })
    }
    transport.addEventListener(DRPD_TRANSPORT_INTERRUPT_EVENT, onInterrupt)
    transport.addEventListener(DRPD_TRANSPORT_INTERRUPT_ERROR_EVENT, onInterruptError)
    this.hostTransports.set(transportId, {
      transport,
      onInterrupt,
      onInterruptError,
    })

    try {
      await this.callWorker('transport.create', { transportId, kind: transport.kind })
    } catch (error) {
      this.unregisterHostTransport(transportId)
      throw error
    }
  }

  /**
   * Remove a host transport registration and detach event listeners.
   *
   * @param transportId - Worker transport id.
   */
  public unregisterHostTransport(transportId: string): void {
    const registration = this.hostTransports.get(transportId)
    if (registration) {
      registration.transport.removeEventListener(DRPD_TRANSPORT_INTERRUPT_EVENT, registration.onInterrupt)
      registration.transport.removeEventListener(
        DRPD_TRANSPORT_INTERRUPT_ERROR_EVENT,
        registration.onInterruptError,
      )
    }
    this.hostTransports.delete(transportId)
    this.transportEventHandlers.delete(transportId)
  }

  /**
   * Close and unregister a host transport.
   *
   * @param transportId - Worker transport id.
   */
  public async closeAndUnregisterHostTransport(transportId: string): Promise<void> {
    const registration = this.hostTransports.get(transportId)
    this.unregisterHostTransport(transportId)
    if (!registration) {
      return
    }
    await registration.transport.close()
  }

  /**
   * Invoke a worker RPC.
   *
   * @param method - Worker method name.
   * @param params - RPC params.
   * @returns RPC result payload.
   */
  public async callWorker<T>(method: WorkerRpcRequest['method'], params: unknown): Promise<T> {
    const requestId = this.rpcRequestCounter++
    const message: WorkerRpcRequest = {
      type: 'worker-rpc',
      requestId,
      method,
      params: params as never,
    }
    const result = new Promise<unknown>((resolve, reject) => {
      this.pendingRpcs.set(requestId, {
        resolve,
        reject: (error) => reject(error),
      })
      this.pendingRpcMethods.set(requestId, method)
    })
    this.postToWorker(message)
    return (await result) as T
  }

  /**
   * Send a raw message to the worker.
   *
   * @param message - Message payload.
   */
  protected postToWorker(message: MainToWorkerMessage): void {
    this.worker.postMessage(message)
  }

  /**
   * Handle a message from the worker.
   *
   * @param message - Incoming worker message.
   */
  protected handleWorkerMessage(message: WorkerToMainMessage): void {
    if (message.type === 'worker-rpc-result') {
      const pending = this.pendingRpcs.get(message.requestId)
      if (!pending) {
        return
      }
      this.pendingRpcs.delete(message.requestId)
      this.pendingRpcMethods.delete(message.requestId)
      if (this.isHeartbeatResult(message.result)) {
        this.lastHeartbeatAckMs = Date.now()
        this.workerHealthy = true
      }
      pending.resolve(message.result)
      return
    }

    if (message.type === 'worker-rpc-error') {
      const pending = this.pendingRpcs.get(message.requestId)
      if (!pending) {
        return
      }
      this.pendingRpcs.delete(message.requestId)
      this.pendingRpcMethods.delete(message.requestId)
      pending.reject(deserializeWorkerError(message.error))
      return
    }

    if (message.type === 'transport-event') {
      const handler = this.transportEventHandlers.get(message.transportId)
      if (!handler) {
        return
      }
      handler(message.eventName, message.detail)
      return
    }

    if (message.type === 'drpd-device-event') {
      const handler = this.sessionEventHandlers.get(message.sessionId)
      if (handler) {
        handler(message.eventName, message.detail)
      }
      return
    }

    if (message.type === 'host-transport-rpc') {
      void this.handleHostTransportRpc(message)
      return
    }

    if (message.type === 'worker-fatal') {
      this.triggerAutoRefresh(`worker fatal: ${message.error.message}`)
    }
  }

  /**
   * Handle a worker request to execute a host USBTMC transport operation.
   *
   * @param message - Host transport RPC request.
   */
  protected async handleHostTransportRpc(message: HostTransportRpcRequest): Promise<void> {
    const registration = this.hostTransports.get(message.transportId)
    if (!registration) {
      this.postToWorker({
        type: 'host-transport-rpc-error',
        requestId: message.requestId,
        error: serializeWorkerError(new Error(`Host transport not found: ${message.transportId}`)),
      })
      return
    }

    try {
      let result: unknown
      switch (message.method) {
        case 'sendCommand':
          if (!message.command) {
            throw new Error('Host transport sendCommand missing command')
          }
          await registration.transport.sendCommand(message.command, ...(message.params ?? []))
          result = null
          break
        case 'queryText':
          if (!message.command) {
            throw new Error('Host transport queryText missing command')
          }
          result = await registration.transport.queryText(message.command, ...(message.params ?? []))
          break
        case 'queryBinary':
          if (!message.command) {
            throw new Error('Host transport queryBinary missing command')
          }
          result = await registration.transport.queryBinary(message.command, ...(message.params ?? []))
          break
        case 'checkError':
          if (!message.command) {
            throw new Error('Host transport checkError missing command')
          }
          await registration.transport.checkError(message.command)
          result = null
          break
        case 'updateFirmware':
          if (!message.update) {
            throw new Error('Host transport updateFirmware missing payload')
          }
          if (
            !('updateFirmware' in registration.transport) ||
            typeof registration.transport.updateFirmware !== 'function'
          ) {
            throw new Error('Host transport does not support firmware updates')
          }
          await registration.transport.updateFirmware(message.update)
          result = null
          break
      }
      this.postToWorker({
        type: 'host-transport-rpc-result',
        requestId: message.requestId,
        result,
      })
    } catch (error) {
      this.postToWorker({
        type: 'host-transport-rpc-error',
        requestId: message.requestId,
        error: serializeWorkerError(error),
      })
    }
  }

  /**
   * Start the worker heartbeat watchdog.
   */
  protected startWatchdog(): void {
    if (this.watchdogTimer || typeof window === 'undefined') {
      return
    }
    this.watchdogTimer = setInterval(() => {
      void this.tickWatchdog()
    }, WORKER_HEARTBEAT_INTERVAL_MS)
  }

  /**
   * Heartbeat tick. Requests a heartbeat and reloads if the worker stalls.
   */
  protected async tickWatchdog(): Promise<void> {
    if (this.reloadTriggered) {
      return
    }
    const now = Date.now()
    if (this.workerHealthy && now - this.lastHeartbeatAckMs > WORKER_HEARTBEAT_TIMEOUT_MS) {
      this.triggerAutoRefresh('worker heartbeat timeout')
      return
    }
    try {
      await this.callWorker('heartbeat', {})
    } catch {
      this.triggerAutoRefresh('worker heartbeat RPC failed')
    }
  }

  /**
   * Trigger an automatic page refresh after worker stall/failure detection.
   *
   * @param reason - Debug reason string.
   */
  protected triggerAutoRefresh(reason: string): void {
    if (this.reloadTriggered || typeof window === 'undefined') {
      return
    }
    this.reloadTriggered = true
    try {
      const storage = window.sessionStorage
      const previous = Number.parseInt(storage.getItem(WORKER_RELOAD_GUARD_KEY) ?? '0', 10)
      const now = Date.now()
      if (Number.isFinite(previous) && now - previous < WORKER_RELOAD_GUARD_WINDOW_MS) {
        console.error(`[DRPDWorker] Worker stall detected but suppressing reload loop: ${reason}`)
        return
      }
      storage.setItem(WORKER_RELOAD_GUARD_KEY, String(now))
    } catch {
      // Ignore storage failures and continue reload.
    }
    console.error(`[DRPDWorker] Worker stall detected, reloading page: ${reason}`)
    window.location.reload()
  }

  /**
   * Check whether a worker RPC result is the heartbeat payload shape.
   *
   * @param value - Unknown RPC result.
   * @returns True when the result looks like a heartbeat response.
   */
  protected isHeartbeatResult(value: unknown): value is { nowMs: number } {
    if (!value || typeof value !== 'object') {
      return false
    }
    const probe = value as { nowMs?: unknown }
    return typeof probe.nowMs === 'number'
  }

  /**
   * Dispose the worker client and reject pending RPCs.
   *
   * @param reason - Debug reason.
   */
  protected dispose(reason: string): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer)
      this.watchdogTimer = undefined
    }
    for (const [requestId, pending] of this.pendingRpcs) {
      const method = this.pendingRpcMethods.get(requestId)
      if (method === 'heartbeat') {
        pending.resolve(undefined)
        continue
      }
      pending.reject(new Error(`DRPD worker client disposed: ${reason} (request ${requestId})`))
    }
    this.pendingRpcs.clear()
    this.pendingRpcMethods.clear()
    this.transportEventHandlers.clear()
    this.sessionEventHandlers.clear()
    this.hostTransports.clear()
    this.worker.terminate()
  }
}
