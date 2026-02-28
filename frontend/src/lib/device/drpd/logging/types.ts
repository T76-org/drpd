/**
 * @file types.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Logging type definitions for DRPD runtime telemetry.
 */

/**
 * Logging configuration values for DRPD runtime telemetry.
 */
export interface DRPDLoggingConfig {
  ///< True when logging is enabled.
  enabled: boolean
  ///< True to auto-start logging when a device connects.
  autoStartOnConnect: boolean
  ///< Maximum retained analog samples.
  maxAnalogSamples: number
  ///< Maximum retained captured messages.
  maxCapturedMessages: number
  ///< Number of rows to trim per retention batch.
  retentionTrimBatchSize: number
}

/**
 * Logged analog sample row.
 */
export interface LoggedAnalogSample {
  ///< Capture timestamp in microseconds.
  timestampUs: bigint
  ///< VBUS voltage in volts.
  vbusV: number
  ///< IBUS current in amps.
  ibusA: number
  ///< Optional role snapshot.
  role: string | null
  ///< Row creation time in milliseconds since epoch.
  createdAtMs: number
}

/**
 * Logged captured USB-PD message row.
 */
export interface LoggedCapturedMessage {
  ///< Capture start timestamp in microseconds.
  startTimestampUs: bigint
  ///< Capture end timestamp in microseconds.
  endTimestampUs: bigint
  ///< Raw decode result code.
  decodeResult: number
  ///< SOP kind derived from decoded payload.
  sopKind: string | null
  ///< Message kind (CONTROL, DATA, EXTENDED).
  messageKind: string | null
  ///< Message type number from the header.
  messageType: number | null
  ///< Message id from the header.
  messageId: number | null
  ///< Sender power role (SOURCE/SINK) when present.
  senderPowerRole: string | null
  ///< Sender data role (DFP/UFP) when present.
  senderDataRole: string | null
  ///< Number of captured pulses.
  pulseCount: number
  ///< Raw pulse widths as uint16 values.
  rawPulseWidths: Uint16Array
  ///< Raw SOP bytes.
  rawSop: Uint8Array
  ///< Raw decoded USB-PD data bytes.
  rawDecodedData: Uint8Array
  ///< Optional parse error string.
  parseError: string | null
  ///< Row creation time in milliseconds since epoch.
  createdAtMs: number
}

/**
 * Analog sample query criteria.
 */
export interface AnalogSampleQuery {
  ///< Inclusive start timestamp in microseconds.
  startTimestampUs: bigint
  ///< Inclusive end timestamp in microseconds.
  endTimestampUs: bigint
  ///< Optional row limit.
  limit?: number
}

/**
 * Captured message query criteria.
 */
export interface CapturedMessageQuery {
  ///< Inclusive start timestamp in microseconds.
  startTimestampUs: bigint
  ///< Inclusive end timestamp in microseconds.
  endTimestampUs: bigint
  ///< Sort order by start timestamp.
  sortOrder?: 'asc' | 'desc'
  ///< Optional message kind filter.
  messageKinds?: string[]
  ///< Optional sender power role filter.
  senderPowerRoles?: string[]
  ///< Optional sender data role filter.
  senderDataRoles?: string[]
  ///< Optional SOP kind filter.
  sopKinds?: string[]
  ///< Optional row offset from the ordered result set.
  offset?: number
  ///< Optional row limit.
  limit?: number
}

/**
 * Log export format type.
 */
export type LogExportFormat = 'json' | 'csv'

/**
 * Log export request.
 */
export interface LogExportRequest {
  ///< Export payload format.
  format: LogExportFormat
  ///< True to include analog samples.
  includeAnalog: boolean
  ///< True to include captured messages.
  includeMessages: boolean
  ///< Optional analog query filter.
  analogQuery?: AnalogSampleQuery
  ///< Optional captured message query filter.
  messageQuery?: CapturedMessageQuery
}

/**
 * Log export result.
 */
export interface LogExportResult {
  ///< Export payload MIME type.
  mimeType: string
  ///< UTF-8 export payload.
  payload: string
  ///< Number of analog samples exported.
  analogCount: number
  ///< Number of captured messages exported.
  messageCount: number
}

/**
 * Log clear scopes.
 */
export type LogClearScope = 'analog' | 'messages' | 'all'

/**
 * Count of cleared rows.
 */
export interface LogClearResult {
  ///< Number of analog rows deleted.
  analogDeleted: number
  ///< Number of captured message rows deleted.
  messagesDeleted: number
}

/**
 * Logging backend diagnostics for debug/console inspection.
 */
export interface DRPDLoggingDiagnostics {
  ///< True when the device logging subsystem has started.
  loggingStarted: boolean
  ///< True when logging is configured enabled.
  loggingConfigured: boolean
  ///< Backend identifier.
  backend: 'none' | 'sqlite-opfs' | 'sqlite-memory' | 'memory-fallback'
  ///< True when rows persist across page reloads.
  persistent: boolean
  ///< True when the SQLite engine is active (vs fallback arrays).
  sqlite: boolean
  ///< True when SQLite is using OPFS.
  opfs: boolean
}

/**
 * Row counts for DRPD log tables.
 */
export interface DRPDLogCounts {
  ///< Number of analog rows.
  analog: number
  ///< Number of captured message rows.
  messages: number
}

/**
 * DRPD logging store contract.
 */
export interface DRPDLogStore {
  /**
   * Initialize storage resources.
   */
  init(): Promise<void>

  /**
   * Close storage resources.
   */
  close(): Promise<void>

  /**
   * Insert one analog sample row.
   *
   * @param sample - Analog sample row.
   */
  insertAnalogSample(sample: LoggedAnalogSample): Promise<void>

  /**
   * Insert one captured message row.
   *
   * @param message - Captured message row.
   */
  insertCapturedMessage(message: LoggedCapturedMessage): Promise<void>

  /**
   * Query analog sample rows.
   *
   * @param query - Query criteria.
   * @returns Matching rows.
   */
  queryAnalogSamples(query: AnalogSampleQuery): Promise<LoggedAnalogSample[]>

  /**
   * Query captured message rows.
   *
   * @param query - Query criteria.
   * @returns Matching rows.
   */
  queryCapturedMessages(query: CapturedMessageQuery): Promise<LoggedCapturedMessage[]>

  /**
   * Export selected log data.
   *
   * @param request - Export request.
   * @returns Export result payload and metadata.
   */
  exportData(request: LogExportRequest): Promise<LogExportResult>

  /**
   * Clear logged rows by scope.
   *
   * @param scope - Clear scope.
   * @returns Deleted row counts.
   */
  clear(scope: LogClearScope): Promise<LogClearResult>

  /**
   * Enforce configured retention limits.
   */
  enforceRetention(): Promise<void>

  /**
   * Return backend diagnostics for debug tooling.
   */
  getDiagnostics?(): DRPDLoggingDiagnostics

  /**
   * Return current row counts for log tables.
   */
  getCounts?(): Promise<DRPDLogCounts>
}
