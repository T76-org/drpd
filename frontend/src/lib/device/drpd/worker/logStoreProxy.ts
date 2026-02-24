/**
 * @file logStoreProxy.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Worker-backed DRPD log store proxy.
 */

import type {
  AnalogSampleQuery,
  CapturedMessageQuery,
  DRPDLogStore,
  DRPDLoggingConfig,
  LogClearResult,
  LogClearScope,
  LogExportRequest,
  LogExportResult,
  LoggedAnalogSample,
  LoggedCapturedMessage,
} from '../logging/types'
import { DRPDWorkerServiceClient } from './service'

let logStoreProxyCounter = 1

/**
 * Worker-backed DRPD log store proxy.
 */
export class DRPDWorkerLogStoreProxy implements DRPDLogStore {
  protected readonly id: string ///< Worker log store id.
  protected readonly client: DRPDWorkerServiceClient ///< Shared worker client.
  protected readonly config?: Partial<DRPDLoggingConfig> ///< Initial config.
  protected created: boolean ///< True after worker-side create.
  protected closed: boolean ///< True after close.

  /**
   * Create a worker-backed log store proxy.
   *
   * @param config - Initial logging config.
   */
  public constructor(config?: Partial<DRPDLoggingConfig>) {
    this.id = `logStore-${logStoreProxyCounter++}`
    this.client = DRPDWorkerServiceClient.getShared()
    this.config = config
    this.created = false
    this.closed = false
  }

  /**
   * Initialize the worker log store.
   */
  public async init(): Promise<void> {
    this.ensureOpen()
    await this.ensureCreated()
    await this.client.callWorker('logStore.call', {
      logStoreId: this.id,
      op: 'init',
    })
  }

  /**
   * Close and delete the worker log store.
   */
  public async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    if (!this.created) {
      return
    }
    await this.client.callWorker('logStore.close', { logStoreId: this.id })
  }

  /**
   * Insert an analog sample row.
   *
   * @param sample - Analog row.
   */
  public async insertAnalogSample(sample: LoggedAnalogSample): Promise<void> {
    this.ensureOpen()
    await this.ensureCreated()
    await this.client.callWorker('logStore.call', {
      logStoreId: this.id,
      op: 'insertAnalogSample',
      sample,
    })
  }

  /**
   * Insert a captured message row.
   *
   * @param message - Captured message row.
   */
  public async insertCapturedMessage(message: LoggedCapturedMessage): Promise<void> {
    this.ensureOpen()
    await this.ensureCreated()
    await this.client.callWorker('logStore.call', {
      logStoreId: this.id,
      op: 'insertCapturedMessage',
      message,
    })
  }

  /**
   * Query analog samples.
   *
   * @param query - Query criteria.
   * @returns Matching rows.
   */
  public async queryAnalogSamples(query: AnalogSampleQuery): Promise<LoggedAnalogSample[]> {
    this.ensureOpen()
    await this.ensureCreated()
    return await this.client.callWorker<LoggedAnalogSample[]>('logStore.call', {
      logStoreId: this.id,
      op: 'queryAnalogSamples',
      query,
    })
  }

  /**
   * Query captured messages.
   *
   * @param query - Query criteria.
   * @returns Matching rows.
   */
  public async queryCapturedMessages(query: CapturedMessageQuery): Promise<LoggedCapturedMessage[]> {
    this.ensureOpen()
    await this.ensureCreated()
    return await this.client.callWorker<LoggedCapturedMessage[]>('logStore.call', {
      logStoreId: this.id,
      op: 'queryCapturedMessages',
      query,
    })
  }

  /**
   * Export log data.
   *
   * @param request - Export request.
   * @returns Export payload.
   */
  public async exportData(request: LogExportRequest): Promise<LogExportResult> {
    this.ensureOpen()
    await this.ensureCreated()
    return await this.client.callWorker<LogExportResult>('logStore.call', {
      logStoreId: this.id,
      op: 'exportData',
      request,
    })
  }

  /**
   * Clear logged rows.
   *
   * @param scope - Clear scope.
   * @returns Deleted row counts.
   */
  public async clear(scope: LogClearScope): Promise<LogClearResult> {
    this.ensureOpen()
    await this.ensureCreated()
    return await this.client.callWorker<LogClearResult>('logStore.call', {
      logStoreId: this.id,
      op: 'clear',
      scope,
    })
  }

  /**
   * Enforce retention limits.
   */
  public async enforceRetention(): Promise<void> {
    this.ensureOpen()
    await this.ensureCreated()
    await this.client.callWorker('logStore.call', {
      logStoreId: this.id,
      op: 'enforceRetention',
    })
  }

  /**
   * Lazily create the worker-side store.
   */
  protected async ensureCreated(): Promise<void> {
    if (this.created) {
      return
    }
    await this.client.callWorker('logStore.create', {
      logStoreId: this.id,
      config: this.config,
    })
    this.created = true
  }

  /**
   * Ensure the proxy has not been closed.
   */
  protected ensureOpen(): void {
    if (this.closed) {
      throw new Error('DRPD worker log store proxy is closed')
    }
  }
}

