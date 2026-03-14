/// <reference lib="WebWorker" />
/**
 * @file drpdIo.worker.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Worker that serializes DRPD transport calls and owns log stores.
 */

import { SQLiteWasmStore } from '../logging/sqliteWasmStore'
import type { DRPDLogStore } from '../logging/types'
import { DRPDDevice } from '../device'
import type { DRPDTransport } from '../transport'
import USBTMCTransport from '../../../transport/usbtmc'
import type {
  HostTransportRpcRequest,
  MainToWorkerMessage,
  WorkerHeartbeatResult,
  WorkerRpcError,
  WorkerRpcRequest,
  WorkerRpcResult,
  WorkerToMainMessage,
} from './protocol'
import { deserializeWorkerError, serializeWorkerError } from './serialization'

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope ///< Dedicated worker global scope.

const transportQueues = new Map<string, Promise<void>>() ///< Per-transport serialization queues.
const bridgeTransports = new Map<string, HostBridgeTransport>() ///< Host-bridged transports keyed by id.
const logStores = new Map<string, DRPDLogStore>() ///< Worker-owned log stores keyed by id.
const drpdSessions = new Map<string, WorkerDRPDSession>() ///< Worker-owned DRPD sessions keyed by id.
const hostPending = new Map<
  number,
  {
    resolve: (value: unknown) => void ///< Host RPC resolve callback.
    reject: (error: unknown) => void ///< Host RPC reject callback.
  }
>() ///< Pending host-transport RPCs awaiting main-thread responses.
let hostRequestCounter = 1 ///< Monotonic host-transport RPC request id counter.
const SESSION_CLOSE_TIMEOUT_MS = 1_000 ///< Max time to wait for transport close during session teardown.

/**
 * Wait for teardown work without blocking the worker forever.
 *
 * @param promise - Promise to await.
 * @param timeoutMs - Timeout in milliseconds.
 */
const awaitWithTimeout = async (
  promise: Promise<void>,
  timeoutMs: number,
  _label: string,
): Promise<void> => {
  await Promise.race([
    promise,
    new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve()
      }, timeoutMs)
    }),
  ])
}

/**
 * Worker-side transport bridge that forwards USBTMC operations to the host.
 */
class HostBridgeTransport extends EventTarget implements DRPDTransport {
  public readonly transportId: string ///< Host transport identifier.

  /**
   * Create a host-bridged transport.
   *
   * @param transportId - Host transport identifier.
   */
  public constructor(transportId: string) {
    super()
    this.transportId = transportId
  }

  /**
   * Forward a SCPI command to the host transport.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   */
  public async sendCommand(command: string, ...params: import('../transport').DRPDSCPIParam[]): Promise<void> {
    await runTransportQueued(this.transportId, async () => {
      await callHostTransport({
        transportId: this.transportId,
        method: 'sendCommand',
        command,
        params,
      })
    })
  }

  /**
   * Forward a SCPI text query to the host transport.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @returns Parsed response tokens.
   */
  public async queryText(command: string, ...params: import('../transport').DRPDSCPIParam[]): Promise<string[]> {
    return await runTransportQueued(this.transportId, async () => {
      return (await callHostTransport({
        transportId: this.transportId,
        method: 'queryText',
        command,
        params,
      })) as string[]
    })
  }

  /**
   * Forward a SCPI binary query to the host transport.
   *
   * @param command - SCPI command mnemonic.
   * @param params - SCPI parameters.
   * @returns Binary response payload.
   */
  public async queryBinary(command: string, ...params: import('../transport').DRPDSCPIParam[]): Promise<Uint8Array> {
    return await runTransportQueued(this.transportId, async () => {
      return (await callHostTransport({
        transportId: this.transportId,
        method: 'queryBinary',
        command,
        params,
      })) as Uint8Array
    })
  }

  /**
   * Forward an error-queue check to the host transport.
   */
  public async checkError(): Promise<void> {
    await runTransportQueued(this.transportId, async () => {
      await callHostTransport({
        transportId: this.transportId,
        method: 'checkError',
      })
    })
  }
}

/**
 * Worker-owned DRPD session resources.
 */
type WorkerDRPDSession = {
  transport: USBTMCTransport ///< Worker-owned USBTMC transport.
  device: DRPDDevice ///< Worker-owned DRPD device driver.
  eventForwarders: Array<{ eventName: string; handler: (event: Event) => void }> ///< Event listener registrations for cleanup.
}

const DRPD_EVENT_NAMES = [
  DRPDDevice.STATE_UPDATED_EVENT,
  DRPDDevice.ROLE_CHANGED_EVENT,
  DRPDDevice.CCBUS_STATUS_CHANGED_EVENT,
  DRPDDevice.VBUS_CHANGED_EVENT,
  DRPDDevice.CAPTURE_STATUS_CHANGED_EVENT,
  DRPDDevice.ANALOG_MONITOR_CHANGED_EVENT,
  DRPDDevice.TRIGGER_CHANGED_EVENT,
  DRPDDevice.SINK_INFO_CHANGED_EVENT,
  DRPDDevice.SINK_PDO_LIST_CHANGED_EVENT,
  DRPDDevice.MESSAGE_CAPTURED_EVENT,
  DRPDDevice.LOG_ENTRY_ADDED_EVENT,
  DRPDDevice.LOG_ENTRY_DELETED_EVENT,
  DRPDDevice.STATE_ERROR_EVENT,
] as const ///< DRPD event names forwarded from worker to main thread.

/**
 * Convert DRPD event detail into a clone-safe payload.
 *
 * @param detail - Event detail.
 * @returns Sanitized detail.
 */
const sanitizeEventDetail = (detail: unknown): unknown => {
  if (!detail || typeof detail !== 'object') {
    return detail
  }
  if (detail instanceof Error) {
    return { error: serializeWorkerError(detail) }
  }
  if (Array.isArray(detail)) {
    return detail.map((value) => sanitizeEventDetail(value))
  }
  const source = detail as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key === 'error') {
      next[key] = value instanceof Error ? serializeWorkerError(value) : sanitizeEventDetail(value)
      continue
    }
    next[key] = sanitizeEventDetail(value)
  }
  return next
}

/**
 * Resolve a user-selected USB device inside the worker from a serializable descriptor.
 *
 * @param selection - Device selection descriptor from main thread.
 * @returns Authorized USBDevice available in the worker context.
 */
const resolveWorkerUSBDevice = async (
  selection: { vendorId: number; productId: number; serialNumber: string | null; productName: string | null },
): Promise<USBDevice> => {
  if (!('usb' in navigator) || !navigator.usb) {
    throw new Error('WebUSB is not available in worker context')
  }
  const devices = await navigator.usb.getDevices()
  const matches = devices.filter((device) => {
    if (device.vendorId !== selection.vendorId || device.productId !== selection.productId) {
      return false
    }
    if (selection.serialNumber) {
      return (device.serialNumber ?? null) === selection.serialNumber
    }
    return true
  })
  if (matches.length === 1) {
    return matches[0]
  }
  if (matches.length > 1 && selection.productName) {
    const byName = matches.filter((device) => (device.productName ?? null) === selection.productName)
    if (byName.length === 1) {
      return byName[0]
    }
  }
  if (matches.length === 0) {
    throw new Error(
      `Selected USB device was not found in worker-authorized devices (VID=0x${selection.vendorId.toString(16)}, PID=0x${selection.productId.toString(16)})`,
    )
  }
  throw new Error('Multiple matching USB devices found; serial number is required to disambiguate')
}

/**
 * Post a message to the main thread.
 *
 * @param message - Message payload.
 */
const post = (message: WorkerToMainMessage): void => {
  ctx.postMessage(message)
}

/**
 * Run a transport operation under a worker-side queue to preserve wire ordering.
 *
 * @param transportId - Worker transport identifier.
 * @param action - Async operation to execute.
 * @returns Action result.
 */
const runTransportQueued = async <T>(
  transportId: string,
  action: () => Promise<T>,
): Promise<T> => {
  let release: (() => void) | undefined
  const previous = transportQueues.get(transportId) ?? Promise.resolve()
  const next = new Promise<void>((resolve) => {
    release = resolve
  })
  transportQueues.set(transportId, next)
  await previous
  try {
    return await action()
  } finally {
    release?.()
    if (transportQueues.get(transportId) === next) {
      transportQueues.delete(transportId)
    }
  }
}

/**
 * Call the main-thread host transport.
 *
 * @param request - Host transport request shape.
 * @returns Result payload.
 */
const callHostTransport = async (
  request: Omit<HostTransportRpcRequest, 'type' | 'requestId'>,
): Promise<unknown> => {
  const requestId = hostRequestCounter++
  const message: HostTransportRpcRequest = {
    type: 'host-transport-rpc',
    requestId,
    ...request,
  }
  const result = new Promise<unknown>((resolve, reject) => {
    hostPending.set(requestId, { resolve, reject })
  })
  post(message)
  return await result
}

/**
 * Emit a transport event back to the main-thread proxy.
 *
 * @param transportId - Transport identifier.
 * @param eventName - Event name.
 * @param detail - Event detail.
 */
const emitTransportEvent = (
  transportId: string,
  eventName: 'interrupt' | 'interrupterror',
  detail: unknown,
): void => {
  post({
    type: 'transport-event',
    transportId,
    eventName,
    detail,
  })
}

/**
 * Handle worker RPCs from the main thread.
 *
 * @param request - RPC request.
 * @returns RPC result payload.
 */
const handleWorkerRpc = async (request: WorkerRpcRequest): Promise<unknown> => {
  switch (request.method) {
    case 'heartbeat': {
      const result: WorkerHeartbeatResult = { nowMs: Date.now() }
      return result
    }
    case 'transport.create':
      transportQueues.set(request.params.transportId, Promise.resolve())
      bridgeTransports.set(request.params.transportId, new HostBridgeTransport(request.params.transportId))
      return null
    case 'transport.close':
      transportQueues.delete(request.params.transportId)
      bridgeTransports.delete(request.params.transportId)
      return null
    case 'transport.call': {
      const { transportId, op } = request.params
      return await runTransportQueued(transportId, async () => {
        switch (op) {
          case 'sendCommand':
            await callHostTransport({
              transportId,
              method: 'sendCommand',
              command: request.params.command,
              params: request.params.params,
            })
            return null
          case 'queryText':
            return await callHostTransport({
              transportId,
              method: 'queryText',
              command: request.params.command,
              params: request.params.params,
            })
          case 'queryBinary':
            return await callHostTransport({
              transportId,
              method: 'queryBinary',
              command: request.params.command,
              params: request.params.params,
            })
          case 'checkError':
            await callHostTransport({
              transportId,
              method: 'checkError',
            })
            return null
        }
      })
    }
    case 'logStore.create': {
      const existing = logStores.get(request.params.logStoreId)
      if (existing) {
        return null
      }
      logStores.set(request.params.logStoreId, new SQLiteWasmStore(request.params.config))
      return null
    }
    case 'logStore.close': {
      const store = logStores.get(request.params.logStoreId)
      if (store) {
        await store.close()
        logStores.delete(request.params.logStoreId)
      }
      return null
    }
    case 'logStore.call': {
      const store = logStores.get(request.params.logStoreId)
      if (!store) {
        throw new Error(`Worker log store not found: ${request.params.logStoreId}`)
      }
      switch (request.params.op) {
        case 'init':
          await store.init()
          return null
        case 'insertAnalogSample':
          await store.insertAnalogSample(request.params.sample)
          return null
        case 'insertCapturedMessage':
          await store.insertCapturedMessage(request.params.message)
          return null
        case 'queryAnalogSamples':
          return await store.queryAnalogSamples(request.params.query)
        case 'queryCapturedMessages':
          return await store.queryCapturedMessages(request.params.query)
        case 'queryMessageLogTimeStripWindow':
          return await store.queryMessageLogTimeStripWindow(request.params.query)
        case 'exportData':
          return await store.exportData(request.params.request)
        case 'clear':
          return await store.clear(request.params.scope)
        case 'enforceRetention':
          await store.enforceRetention()
          return null
        default:
          return request.params satisfies never
      }
    }
    case 'drpdSession.create': {
      if (drpdSessions.has(request.params.sessionId)) {
        return null
      }
      const usbDevice = await resolveWorkerUSBDevice(request.params.deviceSelection)
      const transport = new USBTMCTransport(usbDevice)
      await transport.open()
      const device = new DRPDDevice(transport, {
        createLogStore: (config) => new SQLiteWasmStore(config),
      })
      const eventForwarders: WorkerDRPDSession['eventForwarders'] = DRPD_EVENT_NAMES.map((eventName) => {
        const handler = (event: Event): void => {
          const detail = event instanceof CustomEvent ? event.detail : undefined
          post({
            type: 'drpd-device-event',
            sessionId: request.params.sessionId,
            eventName,
            detail: sanitizeEventDetail(detail),
          })
        }
        device.addEventListener(eventName, handler)
        return { eventName, handler }
      })
      drpdSessions.set(request.params.sessionId, {
        transport,
        device,
        eventForwarders,
      })
      if (request.params.loggingConfig) {
        await device.configureLogging(request.params.loggingConfig as never)
      }
      return null
    }
    case 'drpdSession.dispose': {
      const session = drpdSessions.get(request.params.sessionId)
      if (!session) {
        return null
      }
      drpdSessions.delete(request.params.sessionId)
      for (const { eventName, handler } of session.eventForwarders) {
        session.device.removeEventListener(eventName, handler)
      }
      try {
        session.device.handleDisconnect()
      } catch {
        // Best-effort teardown.
      }
      session.device.detachInterrupts()
      try {
        await awaitWithTimeout(
          session.transport.close(),
          SESSION_CLOSE_TIMEOUT_MS,
          `drpdSession.dispose transport.close ${request.params.sessionId}`,
        )
      } catch {
        // Best-effort transport close.
      }
      return null
    }
    case 'drpdSession.call': {
      const session = drpdSessions.get(request.params.sessionId)
      if (!session) {
        throw new Error(`DRPD worker session not found: ${request.params.sessionId}`)
      }
      const { target, method, args } = request.params
      if (target === 'device') {
        switch (method) {
          case 'getState':
            return session.device.getState()
          case 'setDebugLoggingEnabled':
            session.device.setDebugLoggingEnabled(Boolean(args[0]))
            return null
          case 'configureLogging':
            await session.device.configureLogging(args[0] as never)
            return null
          case 'getLoggingDiagnostics':
            return session.device.getLoggingDiagnostics()
          case 'getLogCounts':
            return await session.device.getLogCounts()
          case 'setCaptureEnabled':
            await session.device.setCaptureEnabled(args[0] as never)
            return null
          case 'handleConnect':
            session.device.handleConnect()
            return null
          case 'handleDisconnect':
            session.device.handleDisconnect()
            return null
          case 'detachInterrupts':
            session.device.detachInterrupts()
            return null
          case 'refreshState':
            await session.device.refreshState()
            return null
          case 'queryAnalogSamples':
            return await session.device.queryAnalogSamples(args[0] as never)
          case 'queryCapturedMessages':
            return await session.device.queryCapturedMessages(args[0] as never)
          case 'queryMessageLogTimeStripWindow':
            return await session.device.queryMessageLogTimeStripWindow(args[0] as never)
          case 'getLogSelectionState':
            return session.device.getLogSelectionState()
          case 'setLogSelectionState':
            session.device.setLogSelectionState(args[0] as never)
            return null
          case 'clearLogSelection':
            session.device.clearLogSelection()
            return null
          case 'resolveLogSelectionKeysForIndexRange':
            return await session.device.resolveLogSelectionKeysForIndexRange(
              args[0] as number,
              args[1] as number,
            )
          case 'exportLogs':
            return await session.device.exportLogs(args[0] as never)
          case 'clearLogs':
            return await session.device.clearLogs(args[0] as never)
          default:
            throw new Error(`Unsupported DRPD device method: ${String(method)}`)
        }
      }
      if (target === 'analogMonitor') {
        if (method === 'getStatus') {
          return await session.device.analogMonitor.getStatus()
        }
        if (method === 'getAccumulatedMeasurements') {
          return await session.device.analogMonitor.getAccumulatedMeasurements()
        }
        if (method === 'resetAccumulatedMeasurements') {
          await session.device.analogMonitor.resetAccumulatedMeasurements()
          return null
        }
        throw new Error(`Unsupported analogMonitor method: ${method}`)
      }
      if (target === 'ccBus') {
        if (method === 'getRole') {
          return await session.device.ccBus.getRole()
        }
        if (method === 'setRole') {
          await session.device.ccBus.setRole(args[0] as never)
          return null
        }
        throw new Error(`Unsupported ccBus method: ${method}`)
      }
      if (target === 'capture') {
        if (method === 'setCaptureEnabled') {
          await session.device.setCaptureEnabled(args[0] as never)
          return null
        }
        throw new Error(`Unsupported capture method: ${method}`)
      }
      if (target === 'sink') {
        if (method === 'getAvailablePdoCount') {
          return await session.device.sink.getAvailablePdoCount()
        }
        if (method === 'getPdoAtIndex') {
          return await session.device.sink.getPdoAtIndex(args[0] as number)
        }
        if (method === 'getSinkInfo') {
          return await session.device.sink.getSinkInfo()
        }
        if (method === 'requestPdo') {
          await session.device.sink.requestPdo(args[0] as number, args[1] as number, args[2] as number)
          return null
        }
        throw new Error(`Unsupported sink method: ${method}`)
      }
      if (target === 'system') {
        if (method === 'identify') {
          return await session.device.system.identify()
        }
        throw new Error(`Unsupported system method: ${method}`)
      }
      if (target === 'trigger') {
        if (method === 'getInfo') {
          return await session.device.trigger.getInfo()
        }
        if (method === 'setEventType') {
          await session.device.trigger.setEventType(args[0] as never)
          return null
        }
        if (method === 'setEventThreshold') {
          await session.device.trigger.setEventThreshold(args[0] as number)
          return null
        }
        if (method === 'setAutoRepeat') {
          await session.device.trigger.setAutoRepeat(args[0] as never)
          return null
        }
        if (method === 'setSyncMode') {
          await session.device.trigger.setSyncMode(args[0] as never)
          return null
        }
        if (method === 'setSyncPulseWidthUs') {
          await session.device.trigger.setSyncPulseWidthUs(args[0] as number)
          return null
        }
        if (method === 'reset') {
          await session.device.trigger.reset()
          return null
        }
        throw new Error(`Unsupported trigger method: ${method}`)
      }
      if (target === 'vbus') {
        if (method === 'resetFault') {
          await session.device.vbus.resetFault()
          return null
        }
        if (method === 'setOvpThresholdMv') {
          await session.device.vbus.setOvpThresholdMv(args[0] as number)
          return null
        }
        if (method === 'setOcpThresholdMa') {
          await session.device.vbus.setOcpThresholdMa(args[0] as number)
          return null
        }
        throw new Error(`Unsupported vbus method: ${method}`)
      }
      throw new Error(`Unsupported DRPD session target: ${String(target)}`)
    }
  }
}

/**
 * Handle messages from the main thread.
 *
 * @param event - Incoming message event.
 */
ctx.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data

  if (message.type === 'host-transport-rpc-result') {
    const pending = hostPending.get(message.requestId)
    if (!pending) {
      return
    }
    hostPending.delete(message.requestId)
    pending.resolve(message.result)
    return
  }

  if (message.type === 'host-transport-rpc-error') {
    const pending = hostPending.get(message.requestId)
    if (!pending) {
      return
    }
    hostPending.delete(message.requestId)
    pending.reject(deserializeWorkerError(message.error))
    return
  }

  if (message.type === 'host-transport-event') {
    const bridge = bridgeTransports.get(message.transportId)
    if (bridge) {
      bridge.dispatchEvent(new CustomEvent(message.eventName, { detail: message.detail }))
    }
    emitTransportEvent(message.transportId, message.eventName, message.detail)
    return
  }

  if (message.type !== 'worker-rpc') {
    return
  }

  const rpc = message
  void handleWorkerRpc(rpc)
    .then((result) => {
      const response: WorkerRpcResult = {
        type: 'worker-rpc-result',
        requestId: rpc.requestId,
        result,
      }
      post(response)
    })
    .catch((error: unknown) => {
      const response: WorkerRpcError = {
        type: 'worker-rpc-error',
        requestId: rpc.requestId,
        error: serializeWorkerError(error),
      }
      post(response)
    })
})

ctx.addEventListener('error', (event) => {
  post({
    type: 'worker-fatal',
    error: serializeWorkerError(event.error ?? new Error(event.message)),
  })
})

// Make this module a module in TS.
export {}
