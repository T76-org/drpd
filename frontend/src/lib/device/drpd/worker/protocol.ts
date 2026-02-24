/**
 * @file protocol.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Message protocol for DRPD worker-backed transport and logging services.
 */

import type { DRPDSCPIParam } from '../transport'
import type {
  AnalogSampleQuery,
  CapturedMessageQuery,
  DRPDLoggingConfig,
  LogClearResult,
  LogClearScope,
  LogExportRequest,
  LogExportResult,
  LoggedAnalogSample,
  LoggedCapturedMessage,
} from '../logging/types'

/**
 * Serialized error payload safe for postMessage.
 */
export interface SerializedWorkerError {
  name: string ///< Error name.
  message: string ///< Error message.
  stack?: string ///< Optional stack trace.
}

/**
 * Worker-side transport RPC methods.
 */
export type WorkerTransportMethod =
  | 'sendCommand'
  | 'queryText'
  | 'queryBinary'
  | 'checkError'

/**
 * Main-thread to worker RPC request.
 */
export type WorkerRpcRequest =
  | {
      type: 'worker-rpc'
      requestId: number
      method: 'heartbeat'
      params: {}
    }
  | {
      type: 'worker-rpc'
      requestId: number
      method: 'transport.create'
      params: { transportId: string }
    }
  | {
      type: 'worker-rpc'
      requestId: number
      method: 'transport.close'
      params: { transportId: string }
    }
  | {
      type: 'worker-rpc'
      requestId: number
      method: 'transport.call'
      params:
        | {
            transportId: string
            op: 'sendCommand'
            command: string
            params: DRPDSCPIParam[]
          }
        | {
            transportId: string
            op: 'queryText'
            command: string
            params: DRPDSCPIParam[]
          }
        | {
            transportId: string
            op: 'queryBinary'
            command: string
            params: DRPDSCPIParam[]
          }
        | {
            transportId: string
            op: 'checkError'
          }
    }
  | {
      type: 'worker-rpc'
      requestId: number
      method: 'logStore.create'
      params: { logStoreId: string; config?: Partial<DRPDLoggingConfig> }
    }
  | {
      type: 'worker-rpc'
      requestId: number
      method: 'logStore.close'
      params: { logStoreId: string }
    }
  | {
      type: 'worker-rpc'
      requestId: number
      method: 'logStore.call'
      params:
        | { logStoreId: string; op: 'init' }
        | { logStoreId: string; op: 'insertAnalogSample'; sample: LoggedAnalogSample }
        | { logStoreId: string; op: 'insertCapturedMessage'; message: LoggedCapturedMessage }
        | { logStoreId: string; op: 'queryAnalogSamples'; query: AnalogSampleQuery }
        | { logStoreId: string; op: 'queryCapturedMessages'; query: CapturedMessageQuery }
        | { logStoreId: string; op: 'exportData'; request: LogExportRequest }
        | { logStoreId: string; op: 'clear'; scope: LogClearScope }
        | { logStoreId: string; op: 'enforceRetention' }
    }
  | {
      type: 'worker-rpc'
      requestId: number
      method: 'drpdSession.create'
      params: {
        sessionId: string
        deviceSelection: WorkerUSBDeviceSelection
        loggingConfig?: Partial<DRPDLoggingConfig>
      }
    }
  | {
      type: 'worker-rpc'
      requestId: number
      method: 'drpdSession.dispose'
      params: { sessionId: string }
    }
  | {
      type: 'worker-rpc'
      requestId: number
      method: 'drpdSession.call'
      params:
        | {
            sessionId: string
            target: 'device'
            method:
              | 'getState'
              | 'setDebugLoggingEnabled'
              | 'configureLogging'
              | 'handleConnect'
              | 'handleDisconnect'
              | 'detachInterrupts'
              | 'refreshState'
              | 'queryAnalogSamples'
              | 'queryCapturedMessages'
              | 'exportLogs'
              | 'clearLogs'
            args: unknown[]
          }
        | {
            sessionId: string
            target: 'analogMonitor' | 'ccBus' | 'capture' | 'sink'
            method: string
            args: unknown[]
          }
    }

/**
 * Worker RPC success response.
 */
export interface WorkerRpcResult {
  type: 'worker-rpc-result' ///< Discriminator for RPC success.
  requestId: number ///< Correlates to the request.
  result: unknown ///< RPC result payload.
}

/**
 * Worker RPC error response.
 */
export interface WorkerRpcError {
  type: 'worker-rpc-error' ///< Discriminator for RPC failure.
  requestId: number ///< Correlates to the request.
  error: SerializedWorkerError ///< Serialized error payload.
}

/**
 * Worker request to main-thread transport host.
 */
export interface HostTransportRpcRequest {
  type: 'host-transport-rpc' ///< Discriminator for host transport RPC.
  requestId: number ///< Correlates to the worker-side request.
  transportId: string ///< Host transport identifier.
  method: WorkerTransportMethod ///< Host transport method to invoke.
  command?: string ///< Optional SCPI command string.
  params?: DRPDSCPIParam[] ///< Optional SCPI arguments.
}

/**
 * Main-thread response to worker host transport request.
 */
export interface HostTransportRpcResult {
  type: 'host-transport-rpc-result' ///< Discriminator for host RPC success.
  requestId: number ///< Correlates to the request.
  result: unknown ///< Host transport result payload.
}

/**
 * Main-thread response to worker host transport request failure.
 */
export interface HostTransportRpcError {
  type: 'host-transport-rpc-error' ///< Discriminator for host RPC error.
  requestId: number ///< Correlates to the request.
  error: SerializedWorkerError ///< Serialized failure payload.
}

/**
 * Main-thread notification to worker that a transport emitted an interrupt event.
 */
export interface HostTransportEvent {
  type: 'host-transport-event' ///< Discriminator for host transport events.
  transportId: string ///< Host transport identifier.
  eventName: 'interrupt' | 'interrupterror' ///< Transport event name.
  detail: unknown ///< Event detail payload.
}

/**
 * Worker notification to main-thread proxy transport.
 */
export interface WorkerTransportEvent {
  type: 'transport-event' ///< Discriminator for worker transport events.
  transportId: string ///< Transport identifier.
  eventName: 'interrupt' | 'interrupterror' ///< Transport event name.
  detail: unknown ///< Event detail payload.
}

/**
 * Worker notification mirroring DRPD device events.
 */
export interface WorkerDRPDDeviceEvent {
  type: 'drpd-device-event' ///< Discriminator for DRPD device events.
  sessionId: string ///< Worker DRPD session identifier.
  eventName: string ///< DRPD event name.
  detail: unknown ///< Event detail payload.
}

/**
 * Serializable identifier for a user-selected USB device.
 */
export interface WorkerUSBDeviceSelection {
  vendorId: number ///< USB vendor ID.
  productId: number ///< USB product ID.
  serialNumber: string | null ///< Optional serial number.
  productName: string | null ///< Optional product name.
  manufacturerName: string | null ///< Optional manufacturer name.
}

/**
 * Worker notification that it is shutting down or encountered a fatal error.
 */
export interface WorkerFatalMessage {
  type: 'worker-fatal' ///< Discriminator for fatal worker failures.
  error: SerializedWorkerError ///< Fatal error payload.
}

/**
 * All messages from main thread to worker.
 */
export type MainToWorkerMessage =
  | WorkerRpcRequest
  | HostTransportRpcResult
  | HostTransportRpcError
  | HostTransportEvent

/**
 * All messages from worker to main thread.
 */
export type WorkerToMainMessage =
  | WorkerRpcResult
  | WorkerRpcError
  | HostTransportRpcRequest
  | WorkerTransportEvent
  | WorkerDRPDDeviceEvent
  | WorkerFatalMessage

/**
 * RPC result shapes used by callers.
 */
export interface WorkerHeartbeatResult {
  nowMs: number ///< Worker wall-clock timestamp in milliseconds.
}

/**
 * Union of possible `logStore.call` return values.
 */
export type WorkerLogStoreCallResult =
  | void
  | LoggedAnalogSample[]
  | LoggedCapturedMessage[]
  | LogExportResult
  | LogClearResult
