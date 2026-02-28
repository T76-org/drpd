/**
 * @file sqliteWasmStore.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD logging store backed by SQLite-WASM with OPFS persistence when available.
 */

import type { Database, SqlValue, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import {
  LOG_SCHEMA_STATEMENTS,
  LOG_SCHEMA_VERSION,
} from './schema'
import type {
  AnalogSampleQuery,
  CapturedMessageQuery,
  DRPDLogCounts,
  DRPDLogStore,
  DRPDLoggingDiagnostics,
  DRPDLoggingConfig,
  LogClearResult,
  LogClearScope,
  LogExportRequest,
  LogExportResult,
  LoggedAnalogSample,
  LoggedCapturedMessage,
} from './types'

const DEFAULT_RETENTION_BATCH = 2_000
const SQLITE_DB_FILENAME = '/drpd/drpd-logging.sqlite3'
let sqlite3ModulePromise: Promise<Sqlite3Static> | null = null

/**
 * Build default logging configuration values.
 *
 * @returns Default configuration.
 */
export const buildDefaultLoggingConfig = (): DRPDLoggingConfig => ({
  enabled: false,
  autoStartOnConnect: true,
  maxAnalogSamples: 1_000_000,
  maxCapturedMessages: 1_000_000,
  retentionTrimBatchSize: DEFAULT_RETENTION_BATCH,
})

/**
 * Normalize a partial logging configuration.
 *
 * @param input - Partial config from caller.
 * @returns Normalized logging config.
 */
export const normalizeLoggingConfig = (
  input: Partial<DRPDLoggingConfig> | undefined,
): DRPDLoggingConfig => {
  const defaults = buildDefaultLoggingConfig()
  return {
    enabled: input?.enabled ?? defaults.enabled,
    autoStartOnConnect: input?.autoStartOnConnect ?? defaults.autoStartOnConnect,
    maxAnalogSamples: Math.max(1, Math.floor(input?.maxAnalogSamples ?? defaults.maxAnalogSamples)),
    maxCapturedMessages: Math.max(
      1,
      Math.floor(input?.maxCapturedMessages ?? defaults.maxCapturedMessages),
    ),
    retentionTrimBatchSize: Math.max(
      1,
      Math.floor(input?.retentionTrimBatchSize ?? defaults.retentionTrimBatchSize),
    ),
  }
}

/**
 * Load and initialize the sqlite-wasm module once per runtime.
 *
 * @returns sqlite3 API namespace.
 */
const getSQLite3 = async (): Promise<Sqlite3Static> => {
  if (!sqlite3ModulePromise) {
    sqlite3ModulePromise = import('@sqlite.org/sqlite-wasm').then(async (mod) => await mod.default())
  }
  return await sqlite3ModulePromise
}

/**
 * Escape one CSV field.
 *
 * @param value - Field value.
 * @returns Escaped CSV token.
 */
const toCSVField = (value: string): string => {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

/**
 * Convert a byte array into a lowercase hex string.
 *
 * @param data - Byte array.
 * @returns Hex string.
 */
const toHex = (data: Uint8Array): string => {
  return Array.from(data)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert a uint16 array into little-endian bytes.
 *
 * @param values - Uint16 values.
 * @returns Byte array.
 */
const encodePulseWidthsLE = (values: Uint16Array): Uint8Array => {
  const bytes = new Uint8Array(values.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < values.length; index += 1) {
    view.setUint16(index * 2, values[index], true)
  }
  return bytes
}

/**
 * Decode little-endian uint16 values from a byte array.
 *
 * @param bytes - Byte array containing uint16 values.
 * @returns Decoded uint16 array.
 */
const decodePulseWidthsLE = (bytes: Uint8Array): Uint16Array => {
  if (bytes.length % 2 !== 0) {
    return new Uint16Array()
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const values = new Uint16Array(bytes.byteLength / 2)
  for (let index = 0; index < values.length; index += 1) {
    values[index] = view.getUint16(index * 2, true)
  }
  return values
}

/**
 * Convert a SQL integer-ish value into bigint.
 *
 * @param value - SQL row value.
 * @param label - Field label for errors.
 * @returns bigint value.
 */
const toBigIntValue = (value: SqlValue | undefined, label: string): bigint => {
  if (typeof value === 'bigint') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value))
  }
  if (typeof value === 'string' && value.length > 0) {
    return BigInt(value)
  }
  throw new Error(`Invalid SQLite bigint value for ${label}`)
}

/**
 * Convert a SQL numeric value into number.
 *
 * @param value - SQL row value.
 * @param label - Field label for errors.
 * @returns number value.
 */
const toNumberValue = (value: SqlValue | undefined, label: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'bigint') {
    return Number(value)
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  throw new Error(`Invalid SQLite number value for ${label}`)
}

/**
 * Convert a SQL blob value into bytes.
 *
 * @param value - SQL row value.
 * @param label - Field label for errors.
 * @returns byte array.
 */
const toBlobValue = (value: SqlValue | undefined, label: string): Uint8Array => {
  if (value instanceof Uint8Array) {
    return value
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  throw new Error(`Invalid SQLite blob value for ${label}`)
}

/**
 * Build a deterministic JSON-safe analog row.
 *
 * @param row - Analog row.
 * @returns JSON-safe row.
 */
const toSerializableAnalog = (row: LoggedAnalogSample): Record<string, unknown> => {
  return {
    timestampUs: row.timestampUs.toString(),
    vbusV: row.vbusV,
    ibusA: row.ibusA,
    role: row.role,
    createdAtMs: row.createdAtMs,
  }
}

/**
 * Build a deterministic JSON-safe captured message row.
 *
 * @param row - Captured row.
 * @returns JSON-safe row.
 */
const toSerializableMessage = (row: LoggedCapturedMessage): Record<string, unknown> => {
  return {
    startTimestampUs: row.startTimestampUs.toString(),
    endTimestampUs: row.endTimestampUs.toString(),
    decodeResult: row.decodeResult,
    sopKind: row.sopKind,
    messageKind: row.messageKind,
    messageType: row.messageType,
    messageId: row.messageId,
    senderPowerRole: row.senderPowerRole,
    senderDataRole: row.senderDataRole,
    pulseCount: row.pulseCount,
    rawPulseWidths: Array.from(row.rawPulseWidths),
    rawSopHex: toHex(row.rawSop),
    rawDecodedDataHex: toHex(row.rawDecodedData),
    parseError: row.parseError,
    createdAtMs: row.createdAtMs,
  }
}

/**
 * In-memory rows used only if SQLite initialization is unavailable.
 */
interface MemoryFallbackState {
  analogSamples: LoggedAnalogSample[]
  capturedMessages: LoggedCapturedMessage[]
}

/**
 * SQLite-WASM-backed log store.
 */
export class SQLiteWasmStore implements DRPDLogStore {
  protected config: DRPDLoggingConfig ///< Retention and control settings.
  protected initialized: boolean ///< True once init has completed.
  protected trimStats: { analog: number; messages: number } ///< Trim counters.
  protected db?: Database ///< Open SQLite database handle.
  protected memoryFallback?: MemoryFallbackState ///< Test/runtime fallback if SQLite cannot start.
  protected backendKind: 'sqlite-opfs' | 'sqlite-memory' | 'memory-fallback' ///< Active backend kind.

  /**
   * Create a logging store.
   *
   * @param config - Partial logging configuration.
   */
  public constructor(config?: Partial<DRPDLoggingConfig>) {
    this.config = normalizeLoggingConfig(config)
    this.initialized = false
    this.trimStats = { analog: 0, messages: 0 }
    this.backendKind = 'memory-fallback'
  }

  /**
   * Initialize logging storage.
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }
    void LOG_SCHEMA_VERSION
    try {
      const sqlite3 = await getSQLite3()
      this.db = this.openDatabase(sqlite3)
      this.backendKind = this.dbVfsLooksLikeOpfs(this.db) ? 'sqlite-opfs' : 'sqlite-memory'
      this.db.exec('PRAGMA busy_timeout = 5000;')
      try {
        this.db.exec('PRAGMA journal_mode = WAL;')
      } catch {
        // Not all runtimes/VFS combinations support WAL. Continue.
      }
      for (const statement of LOG_SCHEMA_STATEMENTS) {
        this.db.exec(statement)
      }
      this.db.exec(
        'INSERT OR REPLACE INTO logging_metadata(key, value) VALUES(?, ?)',
        { bind: ['schema_version', String(LOG_SCHEMA_VERSION)] },
      )
      await this.enforceRetentionCore()
    } catch {
      // Keep tests and unsupported runtimes usable, but production worker path
      // should use the SQLite branch above (with OPFS when available).
      this.db?.close()
      this.db = undefined
      this.memoryFallback = {
        analogSamples: [],
        capturedMessages: [],
      }
      this.backendKind = 'memory-fallback'
    }
    this.initialized = true
  }

  /**
   * Close logging storage.
   */
  public async close(): Promise<void> {
    if (!this.initialized) {
      return
    }
    try {
      this.db?.close()
    } finally {
      this.db = undefined
      this.initialized = false
    }
  }

  /**
   * Insert one analog sample.
   *
   * @param sample - Sample row.
   */
  public async insertAnalogSample(sample: LoggedAnalogSample): Promise<void> {
    this.ensureInitialized()
    if (this.memoryFallback) {
      this.memoryFallback.analogSamples.push(sample)
      await this.trimAnalogSamplesIfNeededMemory()
      return
    }
    const db = this.requireDb()
    const stmt = db.prepare(
      'INSERT INTO analog_samples(timestamp_us, vbus_v, ibus_a, role, created_at_ms) VALUES(?, ?, ?, ?, ?)',
    )
    try {
      stmt.bind([
        sample.timestampUs,
        sample.vbusV,
        sample.ibusA,
        sample.role,
        sample.createdAtMs,
      ])
      stmt.stepFinalize()
    } finally {
      stmt.finalize()
    }
    await this.trimAnalogSamplesIfNeededSql()
  }

  /**
   * Insert one captured message.
   *
   * @param message - Message row.
   */
  public async insertCapturedMessage(message: LoggedCapturedMessage): Promise<void> {
    this.ensureInitialized()
    if (this.memoryFallback) {
      this.memoryFallback.capturedMessages.push(message)
      await this.trimCapturedMessagesIfNeededMemory()
      return
    }
    const db = this.requireDb()
    const stmt = db.prepare(
      [
        'INSERT INTO captured_messages(',
        'start_timestamp_us,end_timestamp_us,decode_result,sop_kind,message_kind,message_type,message_id,',
        'sender_power_role,sender_data_role,pulse_count,raw_pulse_widths,raw_sop,raw_decoded_data,parse_error,created_at_ms',
        ') VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ],
    )
    try {
      stmt.bind([
        message.startTimestampUs,
        message.endTimestampUs,
        message.decodeResult,
        message.sopKind,
        message.messageKind,
        message.messageType,
        message.messageId,
        message.senderPowerRole,
        message.senderDataRole,
        message.pulseCount,
        encodePulseWidthsLE(message.rawPulseWidths),
        message.rawSop,
        message.rawDecodedData,
        message.parseError,
        message.createdAtMs,
      ])
      stmt.stepFinalize()
    } finally {
      stmt.finalize()
    }
    await this.trimCapturedMessagesIfNeededSql()
  }

  /**
   * Query analog sample rows.
   *
   * @param query - Query criteria.
   * @returns Matching rows in ascending timestamp order.
   */
  public async queryAnalogSamples(query: AnalogSampleQuery): Promise<LoggedAnalogSample[]> {
    this.ensureInitialized()
    if (this.memoryFallback) {
      const rows = this.memoryFallback.analogSamples
        .filter(
          (row) => row.timestampUs >= query.startTimestampUs && row.timestampUs <= query.endTimestampUs,
        )
        .sort((left, right) =>
          left.timestampUs < right.timestampUs ? -1 : left.timestampUs > right.timestampUs ? 1 : 0,
        )
      if (!query.limit || query.limit <= 0) {
        return rows
      }
      return rows.slice(0, query.limit)
    }

    const sql = [
      'SELECT timestamp_us, vbus_v, ibus_a, role, created_at_ms',
      'FROM analog_samples',
      'WHERE timestamp_us >= ? AND timestamp_us <= ?',
      'ORDER BY timestamp_us ASC, id ASC',
      query.limit && query.limit > 0 ? 'LIMIT ?' : '',
    ]
      .filter(Boolean)
      .join(' ')

    const bind: Array<SqlValue> = [query.startTimestampUs, query.endTimestampUs]
    if (query.limit && query.limit > 0) {
      bind.push(Math.floor(query.limit))
    }
    const records = this.requireDb().selectObjects(sql, bind)
    return records.map((record) => ({
      timestampUs: toBigIntValue(record.timestamp_us as SqlValue, 'analog.timestamp_us'),
      vbusV: toNumberValue(record.vbus_v as SqlValue, 'analog.vbus_v'),
      ibusA: toNumberValue(record.ibus_a as SqlValue, 'analog.ibus_a'),
      role: (record.role ?? null) as string | null,
      createdAtMs: toNumberValue(record.created_at_ms as SqlValue, 'analog.created_at_ms'),
    }))
  }

  /**
   * Query captured message rows.
   *
   * @param query - Query criteria.
   * @returns Matching rows in ascending start timestamp order.
   */
  public async queryCapturedMessages(
    query: CapturedMessageQuery,
  ): Promise<LoggedCapturedMessage[]> {
    this.ensureInitialized()
    const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc'
    const offset =
      query.offset != null && Number.isFinite(query.offset) && query.offset > 0
        ? Math.floor(query.offset)
        : 0
    const limit =
      query.limit != null && Number.isFinite(query.limit) && query.limit > 0
        ? Math.floor(query.limit)
        : null
    if (this.memoryFallback) {
      const hasMessageKinds = Boolean(query.messageKinds?.length)
      const hasSenderPowerRoles = Boolean(query.senderPowerRoles?.length)
      const hasSenderDataRoles = Boolean(query.senderDataRoles?.length)
      const hasSopKinds = Boolean(query.sopKinds?.length)
      const rows = this.memoryFallback.capturedMessages
        .filter((row) => {
          if (row.startTimestampUs < query.startTimestampUs || row.startTimestampUs > query.endTimestampUs) {
            return false
          }
          if (hasMessageKinds && (!row.messageKind || !query.messageKinds?.includes(row.messageKind))) {
            return false
          }
          if (
            hasSenderPowerRoles &&
            (!row.senderPowerRole || !query.senderPowerRoles?.includes(row.senderPowerRole))
          ) {
            return false
          }
          if (
            hasSenderDataRoles &&
            (!row.senderDataRole || !query.senderDataRoles?.includes(row.senderDataRole))
          ) {
            return false
          }
          if (hasSopKinds && (!row.sopKind || !query.sopKinds?.includes(row.sopKind))) {
            return false
          }
          return true
        })
        .sort((left, right) =>
          left.startTimestampUs < right.startTimestampUs
            ? -1
            : left.startTimestampUs > right.startTimestampUs
              ? 1
              : 0,
        )
      const sortedRows = sortOrder === 'desc' ? rows.reverse() : rows
      const pagedRows = offset > 0 ? sortedRows.slice(offset) : sortedRows
      if (limit === null) {
        return pagedRows
      }
      return pagedRows.slice(0, limit)
    }

    const clauses = ['start_timestamp_us >= ?', 'start_timestamp_us <= ?']
    const bind: Array<SqlValue> = [query.startTimestampUs, query.endTimestampUs]
    if (query.messageKinds?.length) {
      clauses.push(`message_kind IN (${query.messageKinds.map(() => '?').join(', ')})`)
      bind.push(...query.messageKinds)
    }
    if (query.senderPowerRoles?.length) {
      clauses.push(`sender_power_role IN (${query.senderPowerRoles.map(() => '?').join(', ')})`)
      bind.push(...query.senderPowerRoles)
    }
    if (query.senderDataRoles?.length) {
      clauses.push(`sender_data_role IN (${query.senderDataRoles.map(() => '?').join(', ')})`)
      bind.push(...query.senderDataRoles)
    }
    if (query.sopKinds?.length) {
      clauses.push(`sop_kind IN (${query.sopKinds.map(() => '?').join(', ')})`)
      bind.push(...query.sopKinds)
    }

    const sqlParts = [
      'SELECT start_timestamp_us, end_timestamp_us, decode_result, sop_kind, message_kind,',
      'message_type, message_id, sender_power_role, sender_data_role, pulse_count,',
      'raw_pulse_widths, raw_sop, raw_decoded_data, parse_error, created_at_ms',
      'FROM captured_messages',
      `WHERE ${clauses.join(' AND ')}`,
      `ORDER BY start_timestamp_us ${sortOrder.toUpperCase()}, id ${sortOrder.toUpperCase()}`,
    ]
    if (limit !== null) {
      sqlParts.push('LIMIT ?')
      bind.push(limit)
    } else if (offset > 0) {
      sqlParts.push('LIMIT -1')
    }
    if (offset > 0) {
      sqlParts.push('OFFSET ?')
      bind.push(offset)
    }
    const sql = sqlParts.join(' ')

    return this.requireDb().selectObjects(sql, bind).map((record) => ({
      startTimestampUs: toBigIntValue(record.start_timestamp_us as SqlValue, 'message.start_timestamp_us'),
      endTimestampUs: toBigIntValue(record.end_timestamp_us as SqlValue, 'message.end_timestamp_us'),
      decodeResult: toNumberValue(record.decode_result as SqlValue, 'message.decode_result'),
      sopKind: (record.sop_kind ?? null) as string | null,
      messageKind: (record.message_kind ?? null) as string | null,
      messageType:
        record.message_type === null || record.message_type === undefined
          ? null
          : toNumberValue(record.message_type as SqlValue, 'message.message_type'),
      messageId:
        record.message_id === null || record.message_id === undefined
          ? null
          : toNumberValue(record.message_id as SqlValue, 'message.message_id'),
      senderPowerRole: (record.sender_power_role ?? null) as string | null,
      senderDataRole: (record.sender_data_role ?? null) as string | null,
      pulseCount: toNumberValue(record.pulse_count as SqlValue, 'message.pulse_count'),
      rawPulseWidths: decodePulseWidthsLE(toBlobValue(record.raw_pulse_widths as SqlValue, 'message.raw_pulse_widths')),
      rawSop: toBlobValue(record.raw_sop as SqlValue, 'message.raw_sop'),
      rawDecodedData: toBlobValue(record.raw_decoded_data as SqlValue, 'message.raw_decoded_data'),
      parseError: (record.parse_error ?? null) as string | null,
      createdAtMs: toNumberValue(record.created_at_ms as SqlValue, 'message.created_at_ms'),
    }))
  }

  /**
   * Export selected rows as JSON or CSV.
   *
   * @param request - Export request.
   * @returns Export payload.
   */
  public async exportData(request: LogExportRequest): Promise<LogExportResult> {
    this.ensureInitialized()

    const analogQuery: AnalogSampleQuery = request.analogQuery ?? {
      startTimestampUs: 0n,
      endTimestampUs: BigInt('9223372036854775807'),
    }
    const messageQuery: CapturedMessageQuery = request.messageQuery ?? {
      startTimestampUs: 0n,
      endTimestampUs: BigInt('9223372036854775807'),
    }

    const analog = request.includeAnalog ? await this.queryAnalogSamples(analogQuery) : []
    const messages = request.includeMessages
      ? await this.queryCapturedMessages(messageQuery)
      : []

    if (request.format === 'json') {
      const payload = JSON.stringify(
        {
          analogSamples: analog.map(toSerializableAnalog),
          capturedMessages: messages.map(toSerializableMessage),
        },
        null,
        2,
      )
      return {
        mimeType: 'application/json',
        payload,
        analogCount: analog.length,
        messageCount: messages.length,
      }
    }

    const lines: string[] = []
    if (request.includeAnalog) {
      lines.push('analog_samples')
      lines.push('timestamp_us,vbus_v,ibus_a,role,created_at_ms')
      for (const row of analog) {
        lines.push(
          [
            row.timestampUs.toString(),
            row.vbusV.toString(),
            row.ibusA.toString(),
            toCSVField(row.role ?? ''),
            row.createdAtMs.toString(),
          ].join(','),
        )
      }
    }

    if (request.includeMessages) {
      if (lines.length > 0) {
        lines.push('')
      }
      lines.push('captured_messages')
      lines.push(
        [
          'start_timestamp_us',
          'end_timestamp_us',
          'decode_result',
          'sop_kind',
          'message_kind',
          'message_type',
          'message_id',
          'sender_power_role',
          'sender_data_role',
          'pulse_count',
          'raw_pulse_widths_hex',
          'raw_sop_hex',
          'raw_decoded_data_hex',
          'parse_error',
          'created_at_ms',
        ].join(','),
      )
      for (const row of messages) {
        lines.push(
          [
            row.startTimestampUs.toString(),
            row.endTimestampUs.toString(),
            row.decodeResult.toString(),
            toCSVField(row.sopKind ?? ''),
            toCSVField(row.messageKind ?? ''),
            row.messageType?.toString() ?? '',
            row.messageId?.toString() ?? '',
            toCSVField(row.senderPowerRole ?? ''),
            toCSVField(row.senderDataRole ?? ''),
            row.pulseCount.toString(),
            toHex(encodePulseWidthsLE(row.rawPulseWidths)),
            toHex(row.rawSop),
            toHex(row.rawDecodedData),
            toCSVField(row.parseError ?? ''),
            row.createdAtMs.toString(),
          ].join(','),
        )
      }
    }

    return {
      mimeType: 'text/csv',
      payload: `${lines.join('\n')}\n`,
      analogCount: analog.length,
      messageCount: messages.length,
    }
  }

  /**
   * Clear logged rows by scope.
   *
   * @param scope - Clear scope.
   * @returns Deleted row counts.
   */
  public async clear(scope: LogClearScope): Promise<LogClearResult> {
    this.ensureInitialized()

    if (this.memoryFallback) {
      const result: LogClearResult = {
        analogDeleted: 0,
        messagesDeleted: 0,
      }
      if (scope === 'analog' || scope === 'all') {
        result.analogDeleted = this.memoryFallback.analogSamples.length
        this.memoryFallback.analogSamples = []
      }
      if (scope === 'messages' || scope === 'all') {
        result.messagesDeleted = this.memoryFallback.capturedMessages.length
        this.memoryFallback.capturedMessages = []
      }
      return result
    }

    const db = this.requireDb()
    const result: LogClearResult = {
      analogDeleted: 0,
      messagesDeleted: 0,
    }

    if (scope === 'analog' || scope === 'all') {
      result.analogDeleted = this.selectCount('SELECT COUNT(*) FROM analog_samples')
      db.exec('DELETE FROM analog_samples')
    }
    if (scope === 'messages' || scope === 'all') {
      result.messagesDeleted = this.selectCount('SELECT COUNT(*) FROM captured_messages')
      db.exec('DELETE FROM captured_messages')
    }

    return result
  }

  /**
   * Apply retention limits to both tables.
   */
  public async enforceRetention(): Promise<void> {
    this.ensureInitialized()
    if (this.memoryFallback) {
      await this.trimAnalogSamplesIfNeededMemory()
      await this.trimCapturedMessagesIfNeededMemory()
      return
    }
    await this.enforceRetentionCore()
  }

  /**
   * Access trim metrics for diagnostics/tests.
   *
   * @returns Trim counters.
   */
  public getTrimStats(): { analog: number; messages: number } {
    return { ...this.trimStats }
  }

  /**
   * Return backend diagnostics for debug tooling.
   *
   * @returns Logging backend diagnostics.
   */
  public getDiagnostics(): DRPDLoggingDiagnostics {
    return {
      loggingStarted: this.initialized,
      loggingConfigured: true,
      backend: this.backendKind,
      persistent: this.backendKind === 'sqlite-opfs',
      sqlite: this.backendKind === 'sqlite-opfs' || this.backendKind === 'sqlite-memory',
      opfs: this.backendKind === 'sqlite-opfs',
    }
  }

  /**
   * Return current row counts for both log tables.
   *
   * @returns Table row counts.
   */
  public async getCounts(): Promise<DRPDLogCounts> {
    this.ensureInitialized()
    if (this.memoryFallback) {
      return {
        analog: this.memoryFallback.analogSamples.length,
        messages: this.memoryFallback.capturedMessages.length,
      }
    }
    return {
      analog: this.selectCount('SELECT COUNT(*) FROM analog_samples'),
      messages: this.selectCount('SELECT COUNT(*) FROM captured_messages'),
    }
  }

  /**
   * Ensure store was initialized.
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DRPD logging store is not initialized')
    }
  }

  /**
   * Open a SQLite database, preferring OPFS persistence when available.
   *
   * @param sqlite3 - sqlite3 API namespace.
   * @returns Open database handle.
   */
  protected openDatabase(sqlite3: Sqlite3Static): Database {
    if (typeof sqlite3.oo1.OpfsDb === 'function') {
      return new sqlite3.oo1.OpfsDb(SQLITE_DB_FILENAME, 'c')
    }
    return new sqlite3.oo1.DB(':memory:', 'c')
  }

  /**
   * Best-effort detection of whether the opened DB uses the OPFS VFS.
   *
   * @param db - Open database handle.
   * @returns True when the backing VFS appears to be OPFS.
   */
  protected dbVfsLooksLikeOpfs(db: Database): boolean {
    try {
      return db.dbVfsName()?.toLowerCase() === 'opfs'
    } catch {
      return false
    }
  }

  /**
   * Return the open SQLite handle or throw.
   */
  protected requireDb(): Database {
    if (!this.db) {
      throw new Error('DRPD SQLite database is not open')
    }
    return this.db
  }

  /**
   * Query a scalar count.
   *
   * @param sql - SQL text.
   * @returns Count value.
   */
  protected selectCount(sql: string): number {
    const value = this.requireDb().selectValue(sql)
    return toNumberValue((value ?? 0) as SqlValue, 'count')
  }

  /**
   * Apply retention to both SQLite-backed tables.
   */
  protected async enforceRetentionCore(): Promise<void> {
    await this.trimAnalogSamplesIfNeededSql()
    await this.trimCapturedMessagesIfNeededSql()
  }

  /**
   * Trim old analog rows when retention is exceeded (memory fallback).
   */
  protected async trimAnalogSamplesIfNeededMemory(): Promise<void> {
    if (!this.memoryFallback) {
      return
    }
    const overflow = this.memoryFallback.analogSamples.length - this.config.maxAnalogSamples
    if (overflow <= 0) {
      return
    }
    const trimSize = Math.min(
      this.memoryFallback.analogSamples.length,
      Math.max(overflow, this.config.retentionTrimBatchSize),
    )
    this.memoryFallback.analogSamples.splice(0, trimSize)
    this.trimStats.analog += trimSize
  }

  /**
   * Trim old captured-message rows when retention is exceeded (memory fallback).
   */
  protected async trimCapturedMessagesIfNeededMemory(): Promise<void> {
    if (!this.memoryFallback) {
      return
    }
    const overflow =
      this.memoryFallback.capturedMessages.length - this.config.maxCapturedMessages
    if (overflow <= 0) {
      return
    }
    const trimSize = Math.min(
      this.memoryFallback.capturedMessages.length,
      Math.max(overflow, this.config.retentionTrimBatchSize),
    )
    this.memoryFallback.capturedMessages.splice(0, trimSize)
    this.trimStats.messages += trimSize
  }

  /**
   * Trim old analog rows when retention is exceeded (SQLite).
   */
  protected async trimAnalogSamplesIfNeededSql(): Promise<void> {
    const count = this.selectCount('SELECT COUNT(*) FROM analog_samples')
    const overflow = count - this.config.maxAnalogSamples
    if (overflow <= 0) {
      return
    }
    const trimSize = Math.min(count, Math.max(overflow, this.config.retentionTrimBatchSize))
    this.requireDb().exec(
      'DELETE FROM analog_samples WHERE id IN (SELECT id FROM analog_samples ORDER BY timestamp_us ASC, id ASC LIMIT ?)',
      { bind: [trimSize] },
    )
    this.trimStats.analog += trimSize
  }

  /**
   * Trim old captured-message rows when retention is exceeded (SQLite).
   */
  protected async trimCapturedMessagesIfNeededSql(): Promise<void> {
    const count = this.selectCount('SELECT COUNT(*) FROM captured_messages')
    const overflow = count - this.config.maxCapturedMessages
    if (overflow <= 0) {
      return
    }
    const trimSize = Math.min(count, Math.max(overflow, this.config.retentionTrimBatchSize))
    this.requireDb().exec(
      'DELETE FROM captured_messages WHERE id IN (SELECT id FROM captured_messages ORDER BY start_timestamp_us ASC, id ASC LIMIT ?)',
      { bind: [trimSize] },
    )
    this.trimStats.messages += trimSize
  }
}
