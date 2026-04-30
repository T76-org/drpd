/**
 * @file sqliteWasmStore.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD logging store backed by SQLite-WASM with OPFS persistence when available.
 */

import type { Database, SqlValue, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import {
  CONTROL_MESSAGE_TYPES,
  DATA_MESSAGE_TYPES,
  EXTENDED_MESSAGE_TYPES,
} from '../usb-pd/message'
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
  MessageLogAnalogPoint,
  MessageLogEventMarker,
  MessageLogPulseSegment,
  MessageLogTimeAnchor,
  MessageLogTimeStripQuery,
  MessageLogTimeStripWindow,
  LoggedAnalogSample,
  LoggedCapturedMessage,
} from './types'

const DEFAULT_RETENTION_BATCH = 2_000
const SQLITE_DB_FILENAME = '/drpd/drpd-logging.sqlite3'
const LOG_FLUSH_INTERVAL_MS = 100
const LOG_FLUSH_MESSAGE_BATCH_SIZE = 256
const LOG_FLUSH_ANALOG_BATCH_SIZE = 512
const SQLITE_MAX_TIMESTAMP_US = BigInt('9223372036854775807')
let sqlite3ModulePromise: Promise<Sqlite3Static> | null = null

type SQLitePreparedStatement = ReturnType<Database['prepare']>
type PendingAnalogSample = {
  row: LoggedAnalogSample
  sequence: number
}
type PendingCapturedMessage = {
  row: LoggedCapturedMessage
  sequence: number
}

/**
 * Build default logging configuration values.
 *
 * @returns Default configuration.
 */
export const buildDefaultLoggingConfig = (): DRPDLoggingConfig => ({
  enabled: false,
  autoStartOnConnect: true,
  messagePollFallbackIntervalMs: 1_000,
  clockSyncEnabled: true,
  clockSyncResyncIntervalMs: 30_000,
  maxAnalogSamples: 1_000_000,
  maxCapturedMessages: 1_000_000,
  retentionTrimBatchSize: DEFAULT_RETENTION_BATCH,
  storageBackend: 'auto',
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
    messagePollFallbackIntervalMs:
      typeof input?.messagePollFallbackIntervalMs === 'number' &&
      Number.isFinite(input.messagePollFallbackIntervalMs) &&
      input.messagePollFallbackIntervalMs > 0
        ? Math.floor(input.messagePollFallbackIntervalMs)
        : defaults.messagePollFallbackIntervalMs,
    clockSyncEnabled: input?.clockSyncEnabled ?? defaults.clockSyncEnabled,
    clockSyncResyncIntervalMs:
      typeof input?.clockSyncResyncIntervalMs === 'number' &&
      Number.isFinite(input.clockSyncResyncIntervalMs) &&
      input.clockSyncResyncIntervalMs > 0
        ? Math.floor(input.clockSyncResyncIntervalMs)
        : defaults.clockSyncResyncIntervalMs,
    maxAnalogSamples: Math.max(1, Math.floor(input?.maxAnalogSamples ?? defaults.maxAnalogSamples)),
    maxCapturedMessages: Math.max(
      1,
      Math.floor(input?.maxCapturedMessages ?? defaults.maxCapturedMessages),
    ),
    retentionTrimBatchSize: Math.max(
      1,
      Math.floor(input?.retentionTrimBatchSize ?? defaults.retentionTrimBatchSize),
    ),
    storageBackend: input?.storageBackend === 'memory' ? 'memory' : defaults.storageBackend,
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

const normalizeSopTypeLabel = (value: string | null): string | null => {
  switch (value) {
    case 'SOP':
      return 'SOP'
    case 'SOP_PRIME':
      return "SOP'"
    case 'SOP_DOUBLE_PRIME':
      return "SOP''"
    case 'SOP_DEBUG_PRIME':
      return "SOP'-D"
    case 'SOP_DEBUG_DOUBLE_PRIME':
      return "SOP''-D"
    default:
      return null
  }
}

const resolveMessageTypeLabel = (
  row: Pick<LoggedCapturedMessage, 'messageKind' | 'messageType'>,
): string | null => {
  if (!row.messageKind || row.messageType == null) {
    return null
  }
  const mapping =
    row.messageKind === 'CONTROL'
      ? CONTROL_MESSAGE_TYPES[row.messageType]
      : row.messageKind === 'DATA'
        ? DATA_MESSAGE_TYPES[row.messageType]
        : row.messageKind === 'EXTENDED'
          ? EXTENDED_MESSAGE_TYPES[row.messageType]
          : undefined
  return mapping?.name.replaceAll('_', ' ') ?? `${row.messageKind} ${row.messageType}`
}

/**
 * Build the stable message-log selection key used by UI consumers.
 *
 * @param row - Logged row.
 * @returns Stable selection key.
 */
const buildSelectionKey = (
  row: Pick<LoggedCapturedMessage, 'entryKind' | 'startTimestampUs' | 'endTimestampUs' | 'createdAtMs' | 'eventType'>,
): string => {
  if (row.entryKind === 'event') {
    return `event:${row.startTimestampUs.toString()}:${row.createdAtMs}:${row.eventType ?? 'unknown'}`
  }
  return `message:${row.startTimestampUs.toString()}:${row.endTimestampUs.toString()}:${row.createdAtMs}`
}

/**
 * Convert pulse widths (nanoseconds) into little-endian float64 bytes.
 *
 * @param values - Pulse widths in nanoseconds.
 * @returns Byte array.
 */
const encodePulseWidthsLE = (values: Float64Array): Uint8Array => {
  const bytes = new Uint8Array(values.length * 8)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < values.length; index += 1) {
    view.setFloat64(index * 8, values[index], true)
  }
  return bytes
}

/**
 * Decode pulse widths from little-endian bytes.
 *
 * Reads modern float64 encoding first, then falls back to legacy uint16 rows.
 *
 * @param bytes - Byte array containing pulse widths.
 * @returns Decoded pulse widths in nanoseconds.
 */
const decodePulseWidthsLE = (bytes: Uint8Array): Float64Array => {
  if (bytes.length % 8 === 0) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const values = new Float64Array(bytes.byteLength / 8)
    for (let index = 0; index < values.length; index += 1) {
      values[index] = view.getFloat64(index * 8, true)
    }
    return values
  }
  if (bytes.length % 2 === 0) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const values = new Float64Array(bytes.byteLength / 2)
    for (let index = 0; index < values.length; index += 1) {
      values[index] = view.getUint16(index * 2, true)
    }
    return values
  }
  return new Float64Array()
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
 * Clamp a bigint into an inclusive range.
 *
 * @param value - Candidate value.
 * @param minimum - Inclusive minimum.
 * @param maximum - Inclusive maximum.
 * @returns Clamped value.
 */
const clampBigInt = (value: bigint, minimum: bigint, maximum: bigint): bigint => {
  if (value < minimum) {
    return minimum
  }
  if (value > maximum) {
    return maximum
  }
  return value
}

/**
 * Bound timestamp-like values to SQLite's signed 64-bit integer range.
 *
 * @param value - Candidate timestamp.
 * @returns SQLite-safe timestamp.
 */
const clampSqliteTimestampUs = (value: bigint): bigint => clampBigInt(value, 0n, SQLITE_MAX_TIMESTAMP_US)

/**
 * Bound nullable timestamp-like values to SQLite's signed 64-bit integer range.
 *
 * @param value - Candidate timestamp.
 * @returns SQLite-safe timestamp or null.
 */
const clampNullableSqliteTimestampUs = (value: bigint | null): bigint | null =>
  value === null ? null : clampSqliteTimestampUs(value)

/**
 * Normalize an analog row before it can reach SQLite bindings.
 *
 * @param sample - Analog row.
 * @returns SQLite-safe analog row.
 */
const normalizeAnalogSampleForStorage = (sample: LoggedAnalogSample): LoggedAnalogSample => ({
  ...sample,
  timestampUs: clampSqliteTimestampUs(sample.timestampUs),
  displayTimestampUs: clampNullableSqliteTimestampUs(sample.displayTimestampUs),
  wallClockUs: clampNullableSqliteTimestampUs(sample.wallClockUs),
})

/**
 * Normalize a captured-message row before it can reach SQLite bindings.
 *
 * @param message - Captured-message row.
 * @returns SQLite-safe captured-message row.
 */
const normalizeCapturedMessageForStorage = (message: LoggedCapturedMessage): LoggedCapturedMessage => {
  const startTimestampUs = clampSqliteTimestampUs(message.startTimestampUs)
  const endTimestampUs = clampSqliteTimestampUs(message.endTimestampUs)
  return {
    ...message,
    wallClockUs: clampNullableSqliteTimestampUs(message.wallClockUs),
    startTimestampUs,
    endTimestampUs: endTimestampUs < startTimestampUs ? startTimestampUs : endTimestampUs,
    displayTimestampUs: clampNullableSqliteTimestampUs(message.displayTimestampUs),
  }
}

/**
 * Return true when a message has a bounded timestamp range usable for time-strip layout.
 *
 * @param row - Candidate captured-message row.
 * @returns True when the row should contribute to time-strip ranges.
 */
const isTimeStripMessage = (
  row: Pick<LoggedCapturedMessage, 'entryKind' | 'startTimestampUs' | 'endTimestampUs'>,
): boolean =>
  row.entryKind === 'message' &&
  row.endTimestampUs < SQLITE_MAX_TIMESTAMP_US &&
  row.endTimestampUs >= row.startTimestampUs

/**
 * Return a bounded, positive analog point budget.
 *
 * @param value - Requested budget.
 * @returns Normalized budget.
 */
const normalizeAnalogPointBudget = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 256
  }
  return Math.max(2, Math.min(4_096, Math.floor(value)))
}

/**
 * Downsample a dense list of analog rows while keeping endpoints.
 *
 * @param rows - Sorted analog rows.
 * @param budget - Maximum desired output rows.
 * @returns Downsampled rows.
 */
const downsampleAnalogRows = (
  rows: LoggedAnalogSample[],
  budget: number,
): LoggedAnalogSample[] => {
  if (rows.length <= budget) {
    return rows
  }
  if (budget <= 2) {
    return [rows[0], rows[rows.length - 1]]
  }
  const next: LoggedAnalogSample[] = [rows[0]]
  const lastIndex = rows.length - 1
  const stride = lastIndex / (budget - 1)
  for (let index = 1; index < budget - 1; index += 1) {
    next.push(rows[Math.round(index * stride)])
  }
  next.push(rows[lastIndex])
  return next
}

/**
 * Compute the waveform end timestamp from a logged message pulse sequence.
 *
 * @param row - Logged captured message row.
 * @returns Waveform end timestamp.
 */
const computePulseTraceEndTimestampUs = (
  row: Pick<LoggedCapturedMessage, 'startTimestampUs' | 'endTimestampUs' | 'rawPulseWidths'>,
): bigint => {
  let totalDurationUs = 0
  for (const widthNs of row.rawPulseWidths) {
    totalDurationUs += widthNs / 1_000
  }
  const derivedEndTimestampUs = row.startTimestampUs + BigInt(Math.ceil(totalDurationUs))
  return derivedEndTimestampUs > row.endTimestampUs ? derivedEndTimestampUs : row.endTimestampUs
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
    displayTimestampUs: row.displayTimestampUs?.toString() ?? null,
    wallClockUs: row.wallClockUs?.toString() ?? null,
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
    entryKind: row.entryKind,
    eventType: row.eventType,
    eventText: row.eventText,
    eventWallClockMs: row.eventWallClockMs,
    wallClockUs: row.wallClockUs?.toString() ?? null,
    startTimestampUs: row.startTimestampUs.toString(),
    endTimestampUs: row.endTimestampUs.toString(),
    displayTimestampUs: row.displayTimestampUs?.toString() ?? null,
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
  protected maxObservedPulseTraceDurationUs: bigint | null ///< Largest pulse-trace duration seen so far.
  protected committedCounts: DRPDLogCounts ///< Counts already committed to SQLite.
  protected db?: Database ///< Open SQLite database handle.
  protected memoryFallback?: MemoryFallbackState ///< Test/runtime fallback if SQLite cannot start.
  protected backendKind: 'sqlite-opfs' | 'sqlite-memory' | 'memory-fallback' ///< Active backend kind.
  protected insertAnalogStmt?: SQLitePreparedStatement ///< Reused analog insert statement.
  protected insertCapturedMessageStmt?: SQLitePreparedStatement ///< Reused captured-message insert statement.
  protected pendingAnalogSamples: PendingAnalogSample[] ///< Rows waiting to be flushed.
  protected pendingCapturedMessages: PendingCapturedMessage[] ///< Rows waiting to be flushed.
  protected nextPendingSequence: number ///< Monotonic sequence for pending row ordering.
  protected flushTimer: ReturnType<typeof globalThis.setTimeout> | null ///< Pending scheduled flush timer.
  protected flushInFlight: Promise<void> | null ///< Active flush task, when any.
  protected flushStats: {
    count: number
    lastDurationMs: number
    lastAnalogRows: number
    lastMessageRows: number
  } ///< Batched flush diagnostics.

  /**
   * Create a logging store.
   *
   * @param config - Partial logging configuration.
   */
  public constructor(config?: Partial<DRPDLoggingConfig>) {
    this.config = normalizeLoggingConfig(config)
    this.initialized = false
    this.trimStats = { analog: 0, messages: 0 }
    this.maxObservedPulseTraceDurationUs = null
    this.committedCounts = { analog: 0, messages: 0 }
    this.backendKind = 'memory-fallback'
    this.pendingAnalogSamples = []
    this.pendingCapturedMessages = []
    this.nextPendingSequence = 1
    this.flushTimer = null
    this.flushInFlight = null
    this.flushStats = {
      count: 0,
      lastDurationMs: 0,
      lastAnalogRows: 0,
      lastMessageRows: 0,
    }
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
      try {
        this.db.exec('PRAGMA synchronous = NORMAL;')
      } catch {
        // Best-effort performance tuning only.
      }
      for (const statement of LOG_SCHEMA_STATEMENTS) {
        this.db.exec(statement)
      }
      this.ensureColumnExists('analog_samples', 'display_timestamp_us', 'INTEGER')
      this.ensureColumnExists('analog_samples', 'wall_clock_us', 'INTEGER')
      this.ensureColumnExists(
        'captured_messages',
        'entry_kind',
        "TEXT NOT NULL DEFAULT 'message'",
      )
      this.ensureColumnExists('captured_messages', 'event_type', 'TEXT')
      this.ensureColumnExists('captured_messages', 'event_text', 'TEXT')
      this.ensureColumnExists('captured_messages', 'event_wall_clock_ms', 'INTEGER')
      this.ensureColumnExists('captured_messages', 'wall_clock_us', 'INTEGER')
      this.ensureColumnExists('captured_messages', 'display_timestamp_us', 'INTEGER')
      this.db.exec(
        'INSERT OR REPLACE INTO logging_metadata(key, value) VALUES(?, ?)',
        { bind: ['schema_version', String(LOG_SCHEMA_VERSION)] },
      )
      await this.enforceRetentionCore()
      this.committedCounts = {
        analog: this.selectCount('SELECT COUNT(*) FROM analog_samples'),
        messages: this.selectCount('SELECT COUNT(*) FROM captured_messages'),
      }
      this.prepareStatements()
    } catch {
      // Keep tests and unsupported runtimes usable, but production worker path
      // should use the SQLite branch above (with OPFS when available).
      this.finalizeStatements()
      this.clearFlushTimer()
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
      await this.flush()
      this.finalizeStatements()
      this.db?.close()
    } finally {
      this.clearFlushTimer()
      this.flushInFlight = null
      this.db = undefined
      this.initialized = false
    }
  }

  /**
   * Flush any queued rows to SQLite.
   */
  public async flush(): Promise<void> {
    this.ensureInitialized()
    if (this.memoryFallback) {
      return
    }
    if (this.flushInFlight) {
      await this.flushInFlight
      if (this.pendingAnalogSamples.length > 0 || this.pendingCapturedMessages.length > 0) {
        await this.flush()
      }
      return
    }
    if (this.pendingAnalogSamples.length === 0 && this.pendingCapturedMessages.length === 0) {
      return
    }
    this.clearFlushTimer()
    const analogBatch = this.pendingAnalogSamples
    const messageBatch = this.pendingCapturedMessages
    this.pendingAnalogSamples = []
    this.pendingCapturedMessages = []
    const run = this.flushPendingBatches(analogBatch, messageBatch)
    this.flushInFlight = run
    try {
      await run
    } finally {
      if (this.flushInFlight === run) {
        this.flushInFlight = null
      }
    }
    if (this.pendingAnalogSamples.length > 0 || this.pendingCapturedMessages.length > 0) {
      await this.flush()
    }
  }

  /**
   * Insert one analog sample.
   *
   * @param sample - Sample row.
   */
  public async insertAnalogSample(sample: LoggedAnalogSample): Promise<void> {
    this.ensureInitialized()
    const normalizedSample = normalizeAnalogSampleForStorage(sample)
    if (this.memoryFallback) {
      this.memoryFallback.analogSamples.push(normalizedSample)
      await this.trimAnalogSamplesIfNeededMemory()
      return
    }
    this.pendingAnalogSamples.push({
      row: normalizedSample,
      sequence: this.nextPendingSequence++,
    })
    this.scheduleFlush()
  }

  /**
   * Insert one captured message.
   *
   * @param message - Message row.
   */
  public async insertCapturedMessage(message: LoggedCapturedMessage): Promise<void> {
    this.ensureInitialized()
    const normalizedMessage = normalizeCapturedMessageForStorage(message)
    this.notePulseTraceDuration(normalizedMessage)
    if (this.memoryFallback) {
      this.memoryFallback.capturedMessages.push(normalizedMessage)
      await this.trimCapturedMessagesIfNeededMemory()
      return
    }
    this.pendingCapturedMessages.push({
      row: normalizedMessage,
      sequence: this.nextPendingSequence++,
    })
    this.scheduleFlush()
  }

  /**
   * Schedule a background flush if one is not already pending.
   */
  protected scheduleFlush(): void {
    if (this.flushInFlight) {
      return
    }
    if (
      this.pendingCapturedMessages.length >= LOG_FLUSH_MESSAGE_BATCH_SIZE ||
      this.pendingAnalogSamples.length >= LOG_FLUSH_ANALOG_BATCH_SIZE
    ) {
      void this.flush().catch(() => undefined)
      return
    }
    if (this.flushTimer !== null) {
      return
    }
    this.flushTimer = globalThis.setTimeout(() => {
      this.flushTimer = null
      void this.flush().catch(() => undefined)
    }, LOG_FLUSH_INTERVAL_MS)
  }

  /**
   * Cancel any scheduled flush timer.
   */
  protected clearFlushTimer(): void {
    if (this.flushTimer === null) {
      return
    }
    globalThis.clearTimeout(this.flushTimer)
    this.flushTimer = null
  }

  /**
   * Prepare the reusable insert statements.
   */
  protected prepareStatements(): void {
    const db = this.requireDb()
    this.insertAnalogStmt = db.prepare(
      'INSERT INTO analog_samples(timestamp_us, display_timestamp_us, wall_clock_us, vbus_v, ibus_a, role, created_at_ms) VALUES(?, ?, ?, ?, ?, ?, ?)',
    )
    this.insertCapturedMessageStmt = db.prepare(
      [
        'INSERT INTO captured_messages(',
        'entry_kind,event_type,event_text,event_wall_clock_ms,wall_clock_us,start_timestamp_us,end_timestamp_us,display_timestamp_us,decode_result,sop_kind,message_kind,message_type,message_id,',
        'sender_power_role,sender_data_role,pulse_count,raw_pulse_widths,raw_sop,raw_decoded_data,parse_error,created_at_ms',
        ') VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ],
    )
  }

  /**
   * Finalize any reusable insert statements.
   */
  protected finalizeStatements(): void {
    this.insertAnalogStmt?.finalize()
    this.insertCapturedMessageStmt?.finalize()
    this.insertAnalogStmt = undefined
    this.insertCapturedMessageStmt = undefined
  }

  /**
   * Commit one batch of queued rows.
   *
   * @param analogBatch - Pending analog rows.
   * @param messageBatch - Pending captured-message rows.
   */
  protected async flushPendingBatches(
    analogBatch: PendingAnalogSample[],
    messageBatch: PendingCapturedMessage[],
  ): Promise<void> {
    if (analogBatch.length === 0 && messageBatch.length === 0) {
      return
    }
    const db = this.requireDb()
    const analogStmt = this.insertAnalogStmt
    const messageStmt = this.insertCapturedMessageStmt
    if (!analogStmt || !messageStmt) {
      throw new Error('DRPD SQLite insert statements are not prepared')
    }
    const flushStartedAt = Date.now()
    try {
      db.exec('BEGIN')
      for (const sample of analogBatch) {
        analogStmt.bind([
          sample.row.timestampUs,
          sample.row.displayTimestampUs,
          sample.row.wallClockUs,
          sample.row.vbusV,
          sample.row.ibusA,
          sample.row.role,
          sample.row.createdAtMs,
        ]).stepReset()
      }
      for (const message of messageBatch) {
        messageStmt.bind([
          message.row.entryKind,
          message.row.eventType,
          message.row.eventText,
          message.row.eventWallClockMs,
          message.row.wallClockUs,
          message.row.startTimestampUs,
          message.row.endTimestampUs,
          message.row.displayTimestampUs,
          message.row.decodeResult,
          message.row.sopKind,
          message.row.messageKind,
          message.row.messageType,
          message.row.messageId,
          message.row.senderPowerRole,
          message.row.senderDataRole,
          message.row.pulseCount,
          encodePulseWidthsLE(message.row.rawPulseWidths),
          message.row.rawSop,
          message.row.rawDecodedData,
          message.row.parseError,
          message.row.createdAtMs,
        ]).stepReset()
      }
      db.exec('COMMIT')
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // Best-effort rollback.
      }
      this.pendingAnalogSamples = analogBatch.concat(this.pendingAnalogSamples)
      this.pendingCapturedMessages = messageBatch.concat(this.pendingCapturedMessages)
      throw error
    }
    this.committedCounts.analog += analogBatch.length
    this.committedCounts.messages += messageBatch.length
    const trimmed = await this.enforceRetentionCore()
    this.committedCounts.analog = Math.max(0, this.committedCounts.analog - trimmed.analog)
    this.committedCounts.messages = Math.max(0, this.committedCounts.messages - trimmed.messages)
    this.flushStats = {
      count: this.flushStats.count + 1,
      lastDurationMs: Date.now() - flushStartedAt,
      lastAnalogRows: analogBatch.length,
      lastMessageRows: messageBatch.length,
    }
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
    const pendingRows = this.pendingAnalogSamples
      .filter(
        (sample) =>
          sample.row.timestampUs >= query.startTimestampUs &&
          sample.row.timestampUs <= query.endTimestampUs,
      )
      .sort((left, right) =>
        left.row.timestampUs < right.row.timestampUs
          ? -1
          : left.row.timestampUs > right.row.timestampUs
            ? 1
            : left.sequence - right.sequence,
      )
      .map((sample) => sample.row)
    const committedRows = await this.queryCommittedAnalogSamples({
      ...query,
      limit:
        query.limit && query.limit > 0
          ? query.limit + pendingRows.length
          : query.limit,
    })
    const rows = committedRows.concat(pendingRows).sort((left, right) =>
      left.timestampUs < right.timestampUs ? -1 : left.timestampUs > right.timestampUs ? 1 : 0,
    )
    if (!query.limit || query.limit <= 0) {
      return rows
    }
    return rows.slice(0, query.limit)
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
    const hasPending =
      this.pendingCapturedMessages.length > 0 &&
      query.endTimestampUs >= this.pendingCapturedMessages[0]?.row.startTimestampUs
    if (!hasPending) {
      return await this.queryCommittedCapturedMessages(query)
    }

    const isUnfilteredFullRange =
      query.startTimestampUs === 0n &&
      query.endTimestampUs === SQLITE_MAX_TIMESTAMP_US &&
      !query.messageKinds?.length &&
      !query.senderPowerRoles?.length &&
      !query.senderDataRoles?.length &&
      !query.sopKinds?.length

    const pendingRows = this.filterPendingCapturedMessages(query)
    if (isUnfilteredFullRange && (offset > 0 || limit !== null)) {
      if (sortOrder === 'asc') {
        if (offset >= this.committedCounts.messages) {
          return limit === null
            ? pendingRows.slice(offset - this.committedCounts.messages)
            : pendingRows.slice(
                offset - this.committedCounts.messages,
                offset - this.committedCounts.messages + limit,
              )
        }
        if (limit !== null && offset + limit <= this.committedCounts.messages) {
          return await this.queryCommittedCapturedMessages(query)
        }
        const committedRows = await this.queryCommittedCapturedMessages({
          ...query,
          offset,
          limit: Math.max(0, this.committedCounts.messages - offset),
        })
        const remaining = limit === null ? pendingRows : pendingRows.slice(0, Math.max(0, limit - committedRows.length))
        return committedRows.concat(remaining)
      }
      if (offset >= pendingRows.length) {
        return await this.queryCommittedCapturedMessages({
          ...query,
          offset: offset - pendingRows.length,
          limit: limit ?? undefined,
        })
      }
      const head = limit === null ? pendingRows.slice(offset) : pendingRows.slice(offset, offset + limit)
      if (limit !== null && head.length >= limit) {
        return head
      }
      const tail = await this.queryCommittedCapturedMessages({
        ...query,
        offset: 0,
        limit: limit === null ? undefined : limit - head.length,
      })
      return head.concat(tail)
    }

    const committedRows = await this.queryCommittedCapturedMessages({
      ...query,
      offset: undefined,
      limit: undefined,
    })
    const mergedRows = committedRows.concat(pendingRows).sort((left, right) => {
      const cmp =
        left.startTimestampUs < right.startTimestampUs
          ? -1
          : left.startTimestampUs > right.startTimestampUs
            ? 1
            : left.createdAtMs - right.createdAtMs
      return sortOrder === 'desc' ? -cmp : cmp
    })
    const pagedRows = offset > 0 ? mergedRows.slice(offset) : mergedRows
    return limit === null ? pagedRows : pagedRows.slice(0, limit)
  }

  /**
   * Query committed analog rows from SQLite only.
   *
   * @param query - Query criteria.
   * @returns Matching committed rows.
   */
  protected async queryCommittedAnalogSamples(query: AnalogSampleQuery): Promise<LoggedAnalogSample[]> {
    const sql = [
      'SELECT timestamp_us, display_timestamp_us, wall_clock_us, vbus_v, ibus_a, role, created_at_ms',
      'FROM analog_samples',
      'WHERE timestamp_us >= ? AND timestamp_us <= ?',
      'ORDER BY timestamp_us ASC, id ASC',
      query.limit && query.limit > 0 ? 'LIMIT ?' : '',
    ]
      .filter(Boolean)
      .join(' ')

    const bind: Array<SqlValue> = [
      clampSqliteTimestampUs(query.startTimestampUs),
      clampSqliteTimestampUs(query.endTimestampUs),
    ]
    if (query.limit && query.limit > 0) {
      bind.push(Math.floor(query.limit))
    }
    const records = this.requireDb().selectObjects(sql, bind)
    return records.map((record) => ({
      timestampUs: toBigIntValue(record.timestamp_us as SqlValue, 'analog.timestamp_us'),
      displayTimestampUs:
        record.display_timestamp_us === null || record.display_timestamp_us === undefined
          ? null
          : toBigIntValue(record.display_timestamp_us as SqlValue, 'analog.display_timestamp_us'),
      wallClockUs:
        record.wall_clock_us === null || record.wall_clock_us === undefined
          ? null
          : toBigIntValue(record.wall_clock_us as SqlValue, 'analog.wall_clock_us'),
      vbusV: toNumberValue(record.vbus_v as SqlValue, 'analog.vbus_v'),
      ibusA: toNumberValue(record.ibus_a as SqlValue, 'analog.ibus_a'),
      role: (record.role ?? null) as string | null,
      createdAtMs: toNumberValue(record.created_at_ms as SqlValue, 'analog.created_at_ms'),
    }))
  }

  /**
   * Query committed captured-message rows from SQLite only.
   *
   * @param query - Query criteria.
   * @returns Matching committed rows.
   */
  protected async queryCommittedCapturedMessages(
    query: CapturedMessageQuery,
  ): Promise<LoggedCapturedMessage[]> {
    const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc'
    const offset =
      query.offset != null && Number.isFinite(query.offset) && query.offset > 0
        ? Math.floor(query.offset)
        : 0
    const limit =
      query.limit != null && Number.isFinite(query.limit) && query.limit > 0
        ? Math.floor(query.limit)
        : null
    const clauses = ['start_timestamp_us >= ?', 'start_timestamp_us <= ?']
    const bind: Array<SqlValue> = [
      clampSqliteTimestampUs(query.startTimestampUs),
      clampSqliteTimestampUs(query.endTimestampUs),
    ]
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
      'SELECT entry_kind, event_type, event_text, event_wall_clock_ms, wall_clock_us, start_timestamp_us, end_timestamp_us, display_timestamp_us, decode_result, sop_kind, message_kind,',
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
      entryKind: ((record.entry_kind as string | null) ?? 'message') as LoggedCapturedMessage['entryKind'],
      eventType: (record.event_type ?? null) as LoggedCapturedMessage['eventType'],
      eventText: (record.event_text ?? null) as string | null,
      eventWallClockMs:
        record.event_wall_clock_ms === null || record.event_wall_clock_ms === undefined
          ? null
          : toNumberValue(record.event_wall_clock_ms as SqlValue, 'message.event_wall_clock_ms'),
      wallClockUs:
        record.wall_clock_us === null || record.wall_clock_us === undefined
          ? null
          : toBigIntValue(record.wall_clock_us as SqlValue, 'message.wall_clock_us'),
      startTimestampUs: toBigIntValue(record.start_timestamp_us as SqlValue, 'message.start_timestamp_us'),
      endTimestampUs: toBigIntValue(record.end_timestamp_us as SqlValue, 'message.end_timestamp_us'),
      displayTimestampUs:
        record.display_timestamp_us === null || record.display_timestamp_us === undefined
          ? null
          : toBigIntValue(record.display_timestamp_us as SqlValue, 'message.display_timestamp_us'),
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
   * Filter queued message rows using the same semantics as SQLite queries.
   *
   * @param query - Query criteria.
   * @returns Matching pending rows in query sort order.
   */
  protected filterPendingCapturedMessages(query: CapturedMessageQuery): LoggedCapturedMessage[] {
    const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc'
    const rows = this.pendingCapturedMessages
      .filter(({ row }) => {
        if (row.startTimestampUs < query.startTimestampUs || row.startTimestampUs > query.endTimestampUs) {
          return false
        }
        if (query.messageKinds?.length && (!row.messageKind || !query.messageKinds.includes(row.messageKind))) {
          return false
        }
        if (
          query.senderPowerRoles?.length &&
          (!row.senderPowerRole || !query.senderPowerRoles.includes(row.senderPowerRole))
        ) {
          return false
        }
        if (
          query.senderDataRoles?.length &&
          (!row.senderDataRole || !query.senderDataRoles.includes(row.senderDataRole))
        ) {
          return false
        }
        if (query.sopKinds?.length && (!row.sopKind || !query.sopKinds.includes(row.sopKind))) {
          return false
        }
        return true
      })
      .sort((left, right) => {
        const cmp =
          left.row.startTimestampUs < right.row.startTimestampUs
            ? -1
            : left.row.startTimestampUs > right.row.startTimestampUs
              ? 1
              : left.sequence - right.sequence
        return sortOrder === 'desc' ? -cmp : cmp
      })
      .map(({ row }) => row)
    return rows
  }

  /**
   * Query a worker-optimized time-strip render window.
   *
   * @param query - Time-strip window query.
   * @returns Prepared window payload.
   */
  public async queryMessageLogTimeStripWindow(
    query: MessageLogTimeStripQuery,
  ): Promise<MessageLogTimeStripWindow> {
    this.ensureInitialized()
    const normalizedDurationUs = query.windowDurationUs > 0n ? query.windowDurationUs : 1n
    const stats = await this.getTimeStripBoundaryStats()
    if (!stats.earliestTimestampUs || !stats.latestTimestampUs) {
      return {
        windowStartUs: query.windowStartUs,
        windowEndUs: query.windowStartUs + normalizedDurationUs,
        windowDurationUs: normalizedDurationUs,
        earliestTimestampUs: null,
        latestTimestampUs: null,
        earliestDisplayTimestampUs: null,
        latestDisplayTimestampUs: null,
        windowStartDisplayTimestampUs: null,
        windowEndDisplayTimestampUs: null,
        hasMoreBefore: false,
        hasMoreAfter: false,
        pulses: [],
        analogPoints: [],
        events: [],
        timeAnchors: [],
      }
    }

    const maxWindowStartUs = stats.latestTimestampUs > normalizedDurationUs
      ? stats.latestTimestampUs - normalizedDurationUs
      : stats.earliestTimestampUs
    const windowStartUs = clampBigInt(
      query.windowStartUs,
      stats.earliestTimestampUs,
      maxWindowStartUs < stats.earliestTimestampUs ? stats.earliestTimestampUs : maxWindowStartUs,
    )
    const windowEndUs = windowStartUs + normalizedDurationUs
    const analogBudget = normalizeAnalogPointBudget(query.analogPointBudget)
    const maxPulseTraceDurationUs = await this.getMaxObservedPulseTraceDurationUs()
    const messageLookbackUs =
      maxPulseTraceDurationUs > normalizedDurationUs ? maxPulseTraceDurationUs : normalizedDurationUs
    const capturedRows = (
      await this.queryCapturedMessages({
        startTimestampUs: windowStartUs > messageLookbackUs ? windowStartUs - messageLookbackUs : 0n,
        endTimestampUs: windowEndUs,
        sortOrder: 'asc',
      })
    )
    const messages = capturedRows.filter(
      (row) =>
        isTimeStripMessage(row) &&
        computePulseTraceEndTimestampUs(row) >= windowStartUs &&
        row.startTimestampUs <= windowEndUs,
    )
    const events = capturedRows
      .filter(
        (row): row is LoggedCapturedMessage & { eventType: NonNullable<LoggedCapturedMessage['eventType']> } =>
          row.entryKind === 'event' &&
          row.eventType !== null &&
          row.startTimestampUs >= windowStartUs &&
          row.startTimestampUs <= windowEndUs,
      )
      .map<MessageLogEventMarker>((row) => ({
        selectionKey: buildSelectionKey(row),
        eventType: row.eventType,
        timestampUs: row.startTimestampUs,
        displayTimestampUs: row.displayTimestampUs,
        wallClockUs: row.wallClockUs ?? (row.eventWallClockMs === null ? null : BigInt(row.eventWallClockMs) * 1000n),
      }))
    const analogRows = downsampleAnalogRows(
      await this.queryAnalogSamplesForTimeStripWindow(windowStartUs, windowEndUs),
      analogBudget,
    )
    const pulses = messages.map<MessageLogPulseSegment>((row) => {
      const durationUs = row.endTimestampUs - row.startTimestampUs
      const displayStartTimestampUs = row.displayTimestampUs
      const traceEndTimestampUs = computePulseTraceEndTimestampUs(row)
      return {
        selectionKey: buildSelectionKey(row),
        startTimestampUs: row.startTimestampUs,
        endTimestampUs: row.endTimestampUs,
        traceEndTimestampUs,
        displayStartTimestampUs,
        displayEndTimestampUs:
          displayStartTimestampUs === null ? null : displayStartTimestampUs + durationUs,
        wallClockUs: row.wallClockUs ?? BigInt(row.createdAtMs) * 1000n,
        sopLabel: normalizeSopTypeLabel(row.sopKind),
        messageLabel: resolveMessageTypeLabel(row),
        pulseWidthsNs: Float64Array.from(row.rawPulseWidths),
      }
    })
    const analogPoints = analogRows.map<MessageLogAnalogPoint>((row) => ({
      timestampUs: row.timestampUs,
      displayTimestampUs: row.displayTimestampUs,
      wallClockUs: row.wallClockUs ?? BigInt(row.createdAtMs) * 1000n,
      vbusV: row.vbusV,
      ibusA: row.ibusA,
    }))
    const timeAnchors = this.buildTimeStripAnchors(pulses, analogPoints, stats)

    return {
      windowStartUs,
      windowEndUs,
      windowDurationUs: normalizedDurationUs,
      earliestTimestampUs: stats.earliestTimestampUs,
      latestTimestampUs: stats.latestTimestampUs,
      earliestDisplayTimestampUs: stats.earliestDisplayTimestampUs,
      latestDisplayTimestampUs: stats.latestDisplayTimestampUs,
      windowStartDisplayTimestampUs: this.resolveDisplayTimestampAt(windowStartUs, pulses, analogPoints, timeAnchors),
      windowEndDisplayTimestampUs: this.resolveDisplayTimestampAt(windowEndUs, pulses, analogPoints, timeAnchors),
      hasMoreBefore: windowStartUs > stats.earliestTimestampUs,
      hasMoreAfter: windowEndUs < stats.latestTimestampUs,
      pulses,
      analogPoints,
      events,
      timeAnchors,
    }
  }

  /**
   * Export selected rows as JSON or CSV.
   *
   * @param request - Export request.
   * @returns Export payload.
   */
  public async exportData(request: LogExportRequest): Promise<LogExportResult> {
    this.ensureInitialized()
    await this.flush()

    const analogQuery: AnalogSampleQuery = request.analogQuery ?? {
      startTimestampUs: 0n,
      endTimestampUs: SQLITE_MAX_TIMESTAMP_US,
    }
    const messageQuery: CapturedMessageQuery = request.messageQuery ?? {
      startTimestampUs: 0n,
      endTimestampUs: SQLITE_MAX_TIMESTAMP_US,
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
      lines.push('timestamp_us,display_timestamp_us,wall_clock_us,vbus_v,ibus_a,role,created_at_ms')
      for (const row of analog) {
        lines.push(
          [
            row.timestampUs.toString(),
            row.displayTimestampUs?.toString() ?? '',
            row.wallClockUs?.toString() ?? '',
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
          'entry_kind',
          'event_type',
          'event_text',
          'event_wall_clock_ms',
          'wall_clock_us',
          'start_timestamp_us',
          'end_timestamp_us',
          'display_timestamp_us',
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
            row.entryKind,
            toCSVField(row.eventType ?? ''),
            toCSVField(row.eventText ?? ''),
            row.eventWallClockMs?.toString() ?? '',
            row.wallClockUs?.toString() ?? '',
            row.startTimestampUs.toString(),
            row.endTimestampUs.toString(),
            row.displayTimestampUs?.toString() ?? '',
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
    await this.flush()

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
        this.maxObservedPulseTraceDurationUs = null
      }
      return result
    }

    await this.flush()
    const db = this.requireDb()
    const result: LogClearResult = {
      analogDeleted: 0,
      messagesDeleted: 0,
    }

    if (scope === 'analog' || scope === 'all') {
      result.analogDeleted = this.selectCount('SELECT COUNT(*) FROM analog_samples')
      db.exec('DELETE FROM analog_samples')
      this.committedCounts.analog = 0
    }
    if (scope === 'messages' || scope === 'all') {
      result.messagesDeleted = this.selectCount('SELECT COUNT(*) FROM captured_messages')
      db.exec('DELETE FROM captured_messages')
      this.maxObservedPulseTraceDurationUs = null
      this.committedCounts.messages = 0
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
    await this.flush()
    const trimmed = await this.enforceRetentionCore()
    this.committedCounts.analog = Math.max(0, this.committedCounts.analog - trimmed.analog)
    this.committedCounts.messages = Math.max(0, this.committedCounts.messages - trimmed.messages)
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
      clockSyncConfigured: this.config.clockSyncEnabled,
      clockSyncActive: false,
      clockSyncResyncIntervalMs: this.config.clockSyncResyncIntervalMs,
      pendingAnalogRows: this.pendingAnalogSamples.length,
      pendingMessageRows: this.pendingCapturedMessages.length,
      flushCount: this.flushStats.count,
      lastFlushDurationMs: this.flushStats.lastDurationMs,
      lastFlushAnalogRows: this.flushStats.lastAnalogRows,
      lastFlushMessageRows: this.flushStats.lastMessageRows,
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
      analog: this.committedCounts.analog + this.pendingAnalogSamples.length,
      messages: this.committedCounts.messages + this.pendingCapturedMessages.length,
    }
  }

  /**
   * Return earliest/latest timestamps needed by the time-strip.
   *
   * @returns Boundary stats across message and analog tables.
   */
  protected async getTimeStripBoundaryStats(): Promise<{
    earliestTimestampUs: bigint | null
    latestTimestampUs: bigint | null
    earliestDisplayTimestampUs: bigint | null
    latestDisplayTimestampUs: bigint | null
  }> {
    this.ensureInitialized()
    if (this.memoryFallback) {
      const analog = this.memoryFallback.analogSamples
      const messages = this.memoryFallback.capturedMessages
        .filter(isTimeStripMessage)
      const absoluteStarts = [
        ...messages.map((row) => row.startTimestampUs),
        ...analog.map((row) => row.timestampUs),
      ]
      const absoluteEnds = [
        ...messages.map((row) => row.endTimestampUs),
        ...analog.map((row) => row.timestampUs),
      ]
      const displayStarts = [
        ...messages.map((row) => row.displayTimestampUs).filter((value): value is bigint => value !== null),
        ...analog.map((row) => row.displayTimestampUs).filter((value): value is bigint => value !== null),
      ]
      const displayEnds = [
        ...messages
          .map((row) =>
            row.displayTimestampUs === null
              ? null
              : row.displayTimestampUs + (row.endTimestampUs - row.startTimestampUs),
          )
          .filter((value): value is bigint => value !== null),
        ...analog.map((row) => row.displayTimestampUs).filter((value): value is bigint => value !== null),
      ]
      if (absoluteStarts.length === 0 || absoluteEnds.length === 0) {
        return {
          earliestTimestampUs: null,
          latestTimestampUs: null,
          earliestDisplayTimestampUs: null,
          latestDisplayTimestampUs: null,
        }
      }
      return {
        earliestTimestampUs: absoluteStarts.reduce((minimum, value) => value < minimum ? value : minimum),
        latestTimestampUs: absoluteEnds.reduce((maximum, value) => value > maximum ? value : maximum),
        earliestDisplayTimestampUs:
          displayStarts.length > 0
            ? displayStarts.reduce((minimum, value) => value < minimum ? value : minimum)
            : null,
        latestDisplayTimestampUs:
          displayEnds.length > 0
            ? displayEnds.reduce((maximum, value) => value > maximum ? value : maximum)
            : null,
      }
    }

    const db = this.requireDb()
    const earliestMessage = db.selectObjects(
      [
        'SELECT start_timestamp_us, end_timestamp_us, display_timestamp_us',
        'FROM captured_messages',
        "WHERE entry_kind = 'message' AND end_timestamp_us < ?",
        'ORDER BY start_timestamp_us ASC, id ASC LIMIT 1',
      ].join(' '),
      [SQLITE_MAX_TIMESTAMP_US],
    )[0]
    const latestMessage = db.selectObjects(
      [
        'SELECT start_timestamp_us, end_timestamp_us, display_timestamp_us',
        'FROM captured_messages',
        "WHERE entry_kind = 'message' AND end_timestamp_us < ?",
        'ORDER BY end_timestamp_us DESC, id DESC LIMIT 1',
      ].join(' '),
      [SQLITE_MAX_TIMESTAMP_US],
    )[0]

    const earliestAnalog = db.selectObjects(
      'SELECT timestamp_us, display_timestamp_us FROM analog_samples ORDER BY timestamp_us ASC, id ASC LIMIT 1',
    )[0]
    const latestAnalog = db.selectObjects(
      'SELECT timestamp_us, display_timestamp_us FROM analog_samples ORDER BY timestamp_us DESC, id DESC LIMIT 1',
    )[0]
    const earliestTimestampCandidates: bigint[] = []
    const latestTimestampCandidates: bigint[] = []
    const earliestDisplayCandidates: bigint[] = []
    const latestDisplayCandidates: bigint[] = []
    if (earliestMessage && latestMessage) {
      const start = toBigIntValue(earliestMessage.start_timestamp_us as SqlValue, 'timestrip.earliest_message_ts')
      const end = toBigIntValue(latestMessage.end_timestamp_us as SqlValue, 'timestrip.latest_message_ts')
      earliestTimestampCandidates.push(start)
      latestTimestampCandidates.push(end)
      if (earliestMessage.display_timestamp_us !== null && earliestMessage.display_timestamp_us !== undefined) {
        earliestDisplayCandidates.push(
          toBigIntValue(earliestMessage.display_timestamp_us as SqlValue, 'timestrip.earliest_message_display_ts'),
        )
      }
      if (latestMessage.display_timestamp_us !== null && latestMessage.display_timestamp_us !== undefined) {
        latestDisplayCandidates.push(
          toBigIntValue(latestMessage.display_timestamp_us as SqlValue, 'timestrip.latest_message_display_ts') +
            (end - toBigIntValue(latestMessage.start_timestamp_us as SqlValue, 'timestrip.latest_message_start_ts')),
        )
      }
    }
    if (earliestAnalog) {
      earliestTimestampCandidates.push(toBigIntValue(earliestAnalog.timestamp_us as SqlValue, 'timestrip.earliest_analog_ts'))
      if (earliestAnalog.display_timestamp_us !== null && earliestAnalog.display_timestamp_us !== undefined) {
        earliestDisplayCandidates.push(
          toBigIntValue(earliestAnalog.display_timestamp_us as SqlValue, 'timestrip.earliest_analog_display_ts'),
        )
      }
    }
    if (latestAnalog) {
      latestTimestampCandidates.push(toBigIntValue(latestAnalog.timestamp_us as SqlValue, 'timestrip.latest_analog_ts'))
      if (latestAnalog.display_timestamp_us !== null && latestAnalog.display_timestamp_us !== undefined) {
        latestDisplayCandidates.push(
          toBigIntValue(latestAnalog.display_timestamp_us as SqlValue, 'timestrip.latest_analog_display_ts'),
        )
      }
    }
    const committed = {
      earliestTimestampUs:
        earliestTimestampCandidates.length > 0
          ? earliestTimestampCandidates.reduce((minimum, value) => value < minimum ? value : minimum)
          : null,
      latestTimestampUs:
        latestTimestampCandidates.length > 0
          ? latestTimestampCandidates.reduce((maximum, value) => value > maximum ? value : maximum)
          : null,
      earliestDisplayTimestampUs:
        earliestDisplayCandidates.length > 0
          ? earliestDisplayCandidates.reduce((minimum, value) => value < minimum ? value : minimum)
          : null,
      latestDisplayTimestampUs:
        latestDisplayCandidates.length > 0
          ? latestDisplayCandidates.reduce((maximum, value) => value > maximum ? value : maximum)
          : null,
    }
    if (this.pendingAnalogSamples.length === 0 && this.pendingCapturedMessages.length === 0) {
      return committed
    }
    const pendingAnalog = this.pendingAnalogSamples.map((sample) => sample.row)
    const pendingMessages = this.pendingCapturedMessages
      .map((message) => message.row)
      .filter(isTimeStripMessage)
    const earliestTimestampCandidatesWithPending = [
      ...(committed.earliestTimestampUs === null ? [] : [committed.earliestTimestampUs]),
      ...pendingAnalog.map((row) => row.timestampUs),
      ...pendingMessages.map((row) => row.startTimestampUs),
    ]
    const latestTimestampCandidatesWithPending = [
      ...(committed.latestTimestampUs === null ? [] : [committed.latestTimestampUs]),
      ...pendingAnalog.map((row) => row.timestampUs),
      ...pendingMessages.map((row) => row.endTimestampUs),
    ]
    const earliestDisplayCandidatesWithPending = [
      ...(committed.earliestDisplayTimestampUs === null ? [] : [committed.earliestDisplayTimestampUs]),
      ...pendingAnalog
        .map((row) => row.displayTimestampUs)
        .filter((value): value is bigint => value !== null),
      ...pendingMessages
        .map((row) => row.displayTimestampUs)
        .filter((value): value is bigint => value !== null),
    ]
    const latestDisplayCandidatesWithPending = [
      ...(committed.latestDisplayTimestampUs === null ? [] : [committed.latestDisplayTimestampUs]),
      ...pendingAnalog
        .map((row) => row.displayTimestampUs)
        .filter((value): value is bigint => value !== null),
      ...pendingMessages
        .map((row) =>
          row.displayTimestampUs === null
            ? null
            : row.displayTimestampUs + (row.endTimestampUs - row.startTimestampUs),
        )
        .filter((value): value is bigint => value !== null),
    ]
    return {
      earliestTimestampUs:
        earliestTimestampCandidatesWithPending.length > 0
          ? earliestTimestampCandidatesWithPending.reduce((minimum, value) => value < minimum ? value : minimum)
          : null,
      latestTimestampUs:
        latestTimestampCandidatesWithPending.length > 0
          ? latestTimestampCandidatesWithPending.reduce((maximum, value) => value > maximum ? value : maximum)
          : null,
      earliestDisplayTimestampUs:
        earliestDisplayCandidatesWithPending.length > 0
          ? earliestDisplayCandidatesWithPending.reduce((minimum, value) => value < minimum ? value : minimum)
          : null,
      latestDisplayTimestampUs:
        latestDisplayCandidatesWithPending.length > 0
          ? latestDisplayCandidatesWithPending.reduce((maximum, value) => value > maximum ? value : maximum)
          : null,
    }
  }

  /**
   * Track one message trace duration for future time-strip lookback windows.
   *
   * @param row - Captured message row.
   */
  protected notePulseTraceDuration(
    row: Pick<LoggedCapturedMessage, 'entryKind' | 'startTimestampUs' | 'endTimestampUs' | 'rawPulseWidths'>,
  ): void {
    if (row.entryKind !== 'message') {
      return
    }
    const traceDurationUs = computePulseTraceEndTimestampUs(row) - row.startTimestampUs
    if (this.maxObservedPulseTraceDurationUs === null || traceDurationUs > this.maxObservedPulseTraceDurationUs) {
      this.maxObservedPulseTraceDurationUs = traceDurationUs
    }
  }

  /**
   * Return the maximum known pulse-trace duration across logged messages.
   *
   * @returns Largest derived trace duration in microseconds.
   */
  protected async getMaxObservedPulseTraceDurationUs(): Promise<bigint> {
    if (this.maxObservedPulseTraceDurationUs !== null) {
      return this.maxObservedPulseTraceDurationUs
    }
    this.ensureInitialized()
    let maximumDurationUs = 0n
    if (this.memoryFallback) {
      for (const row of this.memoryFallback.capturedMessages) {
        if (row.entryKind !== 'message') {
          continue
        }
        const traceDurationUs = computePulseTraceEndTimestampUs(row) - row.startTimestampUs
        if (traceDurationUs > maximumDurationUs) {
          maximumDurationUs = traceDurationUs
        }
      }
      this.maxObservedPulseTraceDurationUs = maximumDurationUs
      return maximumDurationUs
    }
    const records = this.requireDb().selectObjects(
      [
      'SELECT entry_kind, start_timestamp_us, end_timestamp_us, raw_pulse_widths',
        'FROM captured_messages',
        "WHERE entry_kind = 'message'",
      ].join(' '),
    )
    for (const record of records) {
      const row = {
        entryKind: 'message' as const,
        startTimestampUs: toBigIntValue(record.start_timestamp_us as SqlValue, 'message.start_timestamp_us'),
        endTimestampUs: toBigIntValue(record.end_timestamp_us as SqlValue, 'message.end_timestamp_us'),
        rawPulseWidths: decodePulseWidthsLE(
          toBlobValue(record.raw_pulse_widths as SqlValue, 'message.raw_pulse_widths'),
        ),
      }
      const traceDurationUs = computePulseTraceEndTimestampUs(row) - row.startTimestampUs
      if (traceDurationUs > maximumDurationUs) {
        maximumDurationUs = traceDurationUs
      }
    }
    this.maxObservedPulseTraceDurationUs = maximumDurationUs
    return maximumDurationUs
  }

  /**
   * Query message rows that overlap the given visible window.
   *
   * @param windowStartUs - Inclusive window start.
   * @param windowEndUs - Inclusive window end.
   * @returns Overlapping message rows.
   */
  protected async queryMessagesOverlappingWindow(
    windowStartUs: bigint,
    windowEndUs: bigint,
  ): Promise<LoggedCapturedMessage[]> {
    this.ensureInitialized()
    if (this.memoryFallback) {
      return this.memoryFallback.capturedMessages
        .filter(
          (row) =>
            row.entryKind === 'message' &&
            row.endTimestampUs >= windowStartUs &&
            row.startTimestampUs <= windowEndUs,
        )
        .sort((left, right) =>
          left.startTimestampUs < right.startTimestampUs
            ? -1
            : left.startTimestampUs > right.startTimestampUs
              ? 1
              : 0,
        )
    }

    const sql = [
      'SELECT entry_kind, event_type, event_text, event_wall_clock_ms, wall_clock_us, start_timestamp_us, end_timestamp_us, display_timestamp_us, decode_result, sop_kind, message_kind,',
      'message_type, message_id, sender_power_role, sender_data_role, pulse_count,',
      'raw_pulse_widths, raw_sop, raw_decoded_data, parse_error, created_at_ms',
      'FROM captured_messages',
      "WHERE entry_kind = 'message' AND end_timestamp_us >= ? AND start_timestamp_us <= ?",
      'ORDER BY start_timestamp_us ASC, id ASC',
    ].join(' ')
    return this.requireDb().selectObjects(sql, [windowStartUs, windowEndUs]).map((record) => ({
      entryKind: ((record.entry_kind as string | null) ?? 'message') as LoggedCapturedMessage['entryKind'],
      eventType: (record.event_type ?? null) as LoggedCapturedMessage['eventType'],
      eventText: (record.event_text ?? null) as string | null,
      eventWallClockMs:
        record.event_wall_clock_ms === null || record.event_wall_clock_ms === undefined
          ? null
          : toNumberValue(record.event_wall_clock_ms as SqlValue, 'message.event_wall_clock_ms'),
      wallClockUs:
        record.wall_clock_us === null || record.wall_clock_us === undefined
          ? null
          : toBigIntValue(record.wall_clock_us as SqlValue, 'message.wall_clock_us'),
      startTimestampUs: toBigIntValue(record.start_timestamp_us as SqlValue, 'message.start_timestamp_us'),
      endTimestampUs: toBigIntValue(record.end_timestamp_us as SqlValue, 'message.end_timestamp_us'),
      displayTimestampUs:
        record.display_timestamp_us === null || record.display_timestamp_us === undefined
          ? null
          : toBigIntValue(record.display_timestamp_us as SqlValue, 'message.display_timestamp_us'),
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
   * Query analog samples for a visible strip window, including boundary points
   * just outside the visible window so sparse telemetry still draws a trace.
   *
   * @param windowStartUs - Inclusive visible start timestamp.
   * @param windowEndUs - Inclusive visible end timestamp.
   * @returns Sorted analog samples for rendering.
   */
  protected async queryAnalogSamplesForTimeStripWindow(
    windowStartUs: bigint,
    windowEndUs: bigint,
  ): Promise<LoggedAnalogSample[]> {
    const insideWindow = await this.queryAnalogSamples({
      startTimestampUs: windowStartUs,
      endTimestampUs: windowEndUs,
    })

    const before = await this.queryNearestAnalogSampleBefore(windowStartUs)
    const after = await this.queryNearestAnalogSampleAfter(windowEndUs)
    const rows = [
      ...(before ? [before] : []),
      ...insideWindow,
      ...(after ? [after] : []),
    ]
    const deduped = new Map<string, LoggedAnalogSample>()
    for (const row of rows) {
      deduped.set(
        `${row.timestampUs.toString()}:${row.wallClockUs?.toString() ?? row.createdAtMs.toString()}`,
        row,
      )
    }
    return Array.from(deduped.values()).sort((left, right) =>
      left.timestampUs < right.timestampUs ? -1 : left.timestampUs > right.timestampUs ? 1 : 0,
    )
  }

  /**
   * Query the nearest analog sample at or before the given timestamp.
   *
   * @param timestampUs - Probe timestamp.
   * @returns Matching row, if any.
   */
  protected async queryNearestAnalogSampleBefore(
    timestampUs: bigint,
  ): Promise<LoggedAnalogSample | null> {
    this.ensureInitialized()
    if (this.memoryFallback) {
      const rows = this.memoryFallback.analogSamples
        .filter((row) => row.timestampUs <= timestampUs)
        .sort((left, right) =>
          left.timestampUs < right.timestampUs ? -1 : left.timestampUs > right.timestampUs ? 1 : 0,
        )
      return rows.length > 0 ? rows[rows.length - 1] ?? null : null
    }
    const pending = this.pendingAnalogSamples
      .filter((row) => row.row.timestampUs <= timestampUs)
      .sort((left, right) =>
        left.row.timestampUs < right.row.timestampUs
          ? -1
          : left.row.timestampUs > right.row.timestampUs
            ? 1
            : left.sequence - right.sequence,
      )
      .at(-1)?.row ?? null
    const record = this.requireDb().selectObjects(
      [
        'SELECT timestamp_us, display_timestamp_us, wall_clock_us, vbus_v, ibus_a, role, created_at_ms',
        'FROM analog_samples',
        'WHERE timestamp_us <= ?',
        'ORDER BY timestamp_us DESC, id DESC LIMIT 1',
      ].join(' '),
      [timestampUs],
    )[0]
    const committed = !record ? null : {
      timestampUs: toBigIntValue(record.timestamp_us as SqlValue, 'analog.timestamp_us'),
      displayTimestampUs:
        record.display_timestamp_us === null || record.display_timestamp_us === undefined
          ? null
          : toBigIntValue(record.display_timestamp_us as SqlValue, 'analog.display_timestamp_us'),
      wallClockUs:
        record.wall_clock_us === null || record.wall_clock_us === undefined
          ? null
          : toBigIntValue(record.wall_clock_us as SqlValue, 'analog.wall_clock_us'),
      vbusV: toNumberValue(record.vbus_v as SqlValue, 'analog.vbus_v'),
      ibusA: toNumberValue(record.ibus_a as SqlValue, 'analog.ibus_a'),
      role: (record.role ?? null) as string | null,
      createdAtMs: toNumberValue(record.created_at_ms as SqlValue, 'analog.created_at_ms'),
    }
    if (!committed) {
      return pending
    }
    if (!pending || committed.timestampUs >= pending.timestampUs) {
      return committed
    }
    return pending
  }

  /**
   * Query the nearest analog sample at or after the given timestamp.
   *
   * @param timestampUs - Probe timestamp.
   * @returns Matching row, if any.
   */
  protected async queryNearestAnalogSampleAfter(
    timestampUs: bigint,
  ): Promise<LoggedAnalogSample | null> {
    this.ensureInitialized()
    if (this.memoryFallback) {
      const rows = this.memoryFallback.analogSamples
        .filter((row) => row.timestampUs >= timestampUs)
        .sort((left, right) =>
          left.timestampUs < right.timestampUs ? -1 : left.timestampUs > right.timestampUs ? 1 : 0,
        )
      return rows[0] ?? null
    }
    const pending = this.pendingAnalogSamples
      .filter((row) => row.row.timestampUs >= timestampUs)
      .sort((left, right) =>
        left.row.timestampUs < right.row.timestampUs
          ? -1
          : left.row.timestampUs > right.row.timestampUs
            ? 1
            : left.sequence - right.sequence,
      )[0]?.row ?? null
    const record = this.requireDb().selectObjects(
      [
        'SELECT timestamp_us, display_timestamp_us, wall_clock_us, vbus_v, ibus_a, role, created_at_ms',
        'FROM analog_samples',
        'WHERE timestamp_us >= ?',
        'ORDER BY timestamp_us ASC, id ASC LIMIT 1',
      ].join(' '),
      [timestampUs],
    )[0]
    const committed = !record ? null : {
      timestampUs: toBigIntValue(record.timestamp_us as SqlValue, 'analog.timestamp_us'),
      displayTimestampUs:
        record.display_timestamp_us === null || record.display_timestamp_us === undefined
          ? null
          : toBigIntValue(record.display_timestamp_us as SqlValue, 'analog.display_timestamp_us'),
      wallClockUs:
        record.wall_clock_us === null || record.wall_clock_us === undefined
          ? null
          : toBigIntValue(record.wall_clock_us as SqlValue, 'analog.wall_clock_us'),
      vbusV: toNumberValue(record.vbus_v as SqlValue, 'analog.vbus_v'),
      ibusA: toNumberValue(record.ibus_a as SqlValue, 'analog.ibus_a'),
      role: (record.role ?? null) as string | null,
      createdAtMs: toNumberValue(record.created_at_ms as SqlValue, 'analog.created_at_ms'),
    }
    if (!committed) {
      return pending
    }
    if (!pending || committed.timestampUs <= pending.timestampUs) {
      return committed
    }
    return pending
  }

  /**
   * Build a bounded set of host/device anchors for wall-clock interpolation.
   *
   * @param pulses - Visible message pulse segments.
   * @param analogPoints - Visible analog points.
   * @param stats - Boundary stats.
   * @returns Anchor list sorted by device timestamp.
   */
  protected buildTimeStripAnchors(
    pulses: MessageLogPulseSegment[],
    analogPoints: MessageLogAnalogPoint[],
    stats: {
      earliestTimestampUs: bigint | null
      latestTimestampUs: bigint | null
      earliestDisplayTimestampUs: bigint | null
      latestDisplayTimestampUs: bigint | null
    },
  ): MessageLogTimeAnchor[] {
    const candidates: MessageLogTimeAnchor[] = []
    for (const point of analogPoints) {
      candidates.push({
        timestampUs: point.timestampUs,
        displayTimestampUs: point.displayTimestampUs,
        wallClockUs: point.wallClockUs,
        approximate: false,
      })
    }
    for (const pulse of pulses) {
      candidates.push({
        timestampUs: pulse.startTimestampUs,
        displayTimestampUs: pulse.displayStartTimestampUs,
        wallClockUs: pulse.wallClockUs,
        approximate: true,
      })
      candidates.push({
        timestampUs: pulse.endTimestampUs,
        displayTimestampUs: pulse.displayEndTimestampUs,
        wallClockUs: pulse.wallClockUs,
        approximate: true,
      })
    }

    if (candidates.length === 0 && stats.earliestTimestampUs !== null && stats.latestTimestampUs !== null) {
      candidates.push({
        timestampUs: stats.earliestTimestampUs,
        displayTimestampUs: stats.earliestDisplayTimestampUs,
        wallClockUs: null,
        approximate: true,
      })
      candidates.push({
        timestampUs: stats.latestTimestampUs,
        displayTimestampUs: stats.latestDisplayTimestampUs,
        wallClockUs: null,
        approximate: true,
      })
    }

    const deduped = new Map<string, MessageLogTimeAnchor>()
    for (const candidate of candidates) {
      const key = [
        candidate.timestampUs.toString(),
        candidate.displayTimestampUs?.toString() ?? 'null',
        candidate.wallClockUs?.toString() ?? 'null',
      ].join(':')
      if (!deduped.has(key)) {
        deduped.set(key, candidate)
      }
    }
    const anchors = Array.from(deduped.values()).sort((left, right) =>
      left.timestampUs < right.timestampUs ? -1 : left.timestampUs > right.timestampUs ? 1 : 0,
    )
    if (anchors.length <= 8) {
      return anchors
    }
    return downsampleAnalogRows(
      anchors.map((anchor) => ({
        timestampUs: anchor.timestampUs,
        displayTimestampUs: anchor.displayTimestampUs,
        vbusV: 0,
        ibusA: 0,
        role: null,
        wallClockUs: anchor.wallClockUs,
        createdAtMs: Number(anchor.wallClockUs === null ? 0n : anchor.wallClockUs / 1000n),
      })),
      8,
    ).map((row) => {
      const matchingAnchor = anchors.find((anchor) => anchor.timestampUs === row.timestampUs)
      return matchingAnchor ?? {
        timestampUs: row.timestampUs,
        displayTimestampUs: row.displayTimestampUs,
        wallClockUs: row.wallClockUs ?? BigInt(row.createdAtMs) * 1000n,
        approximate: true,
      }
    })
  }

  /**
   * Resolve a display timestamp for an absolute device timestamp.
   *
   * @param timestampUs - Absolute device timestamp.
   * @param pulses - Visible pulse segments.
   * @param analogPoints - Visible analog points.
   * @param anchors - Time anchors.
   * @returns Display timestamp, when inferable.
   */
  protected resolveDisplayTimestampAt(
    timestampUs: bigint,
    pulses: MessageLogPulseSegment[],
    analogPoints: MessageLogAnalogPoint[],
    anchors: MessageLogTimeAnchor[],
  ): bigint | null {
    for (const point of analogPoints) {
      if (point.timestampUs === timestampUs && point.displayTimestampUs !== null) {
        return point.displayTimestampUs
      }
    }
    for (const pulse of pulses) {
      if (pulse.startTimestampUs === timestampUs && pulse.displayStartTimestampUs !== null) {
        return pulse.displayStartTimestampUs
      }
      if (pulse.endTimestampUs === timestampUs && pulse.displayEndTimestampUs !== null) {
        return pulse.displayEndTimestampUs
      }
    }
    const withDisplay = anchors.filter((anchor) => anchor.displayTimestampUs !== null)
    if (withDisplay.length === 0) {
      return null
    }
    let nearest = withDisplay[0]
    let nearestDistance = nearest.timestampUs > timestampUs
      ? nearest.timestampUs - timestampUs
      : timestampUs - nearest.timestampUs
    for (const anchor of withDisplay.slice(1)) {
      const distance = anchor.timestampUs > timestampUs
        ? anchor.timestampUs - timestampUs
        : timestampUs - anchor.timestampUs
      if (distance < nearestDistance) {
        nearest = anchor
        nearestDistance = distance
      }
    }
    return nearest.displayTimestampUs === null
      ? null
      : nearest.displayTimestampUs + (timestampUs - nearest.timestampUs)
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
    if (this.config.storageBackend === 'memory') {
      return new sqlite3.oo1.DB(':memory:', 'c')
    }
    if (typeof sqlite3.oo1.OpfsDb === 'function') {
      try {
        return new sqlite3.oo1.OpfsDb(SQLITE_DB_FILENAME, 'c')
      } catch {
        // OPFS can be advertised but fail during open when the browser's
        // cached file-system state changes. Keep SQLite available for the
        // current session instead of disabling logging entirely.
      }
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
   * Ensure a table has a required column, adding it when missing.
   *
   * @param tableName - Table name.
   * @param columnName - Column name to enforce.
   * @param columnDefinition - SQLite column definition.
   */
  protected ensureColumnExists(
    tableName: string,
    columnName: string,
    columnDefinition: string,
  ): void {
    const db = this.requireDb()
    const columns = db.selectObjects(
      `PRAGMA table_info(${tableName})`,
    ) as Array<{ name?: string }>
    if (columns.some((column) => column.name === columnName)) {
      return
    }
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
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
  protected async enforceRetentionCore(): Promise<{ analog: number; messages: number }> {
    const analog = await this.trimAnalogSamplesIfNeededSql()
    const messages = await this.trimCapturedMessagesIfNeededSql()
    return { analog, messages }
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
  protected async trimAnalogSamplesIfNeededSql(): Promise<number> {
    const count = this.selectCount('SELECT COUNT(*) FROM analog_samples')
    const overflow = count - this.config.maxAnalogSamples
    if (overflow <= 0) {
      return 0
    }
    const trimSize = Math.min(count, Math.max(overflow, this.config.retentionTrimBatchSize))
    this.requireDb().exec(
      'DELETE FROM analog_samples WHERE id IN (SELECT id FROM analog_samples ORDER BY timestamp_us ASC, id ASC LIMIT ?)',
      { bind: [trimSize] },
    )
    this.trimStats.analog += trimSize
    return trimSize
  }

  /**
   * Trim old captured-message rows when retention is exceeded (SQLite).
   */
  protected async trimCapturedMessagesIfNeededSql(): Promise<number> {
    const count = this.selectCount('SELECT COUNT(*) FROM captured_messages')
    const overflow = count - this.config.maxCapturedMessages
    if (overflow <= 0) {
      return 0
    }
    const trimSize = Math.min(count, Math.max(overflow, this.config.retentionTrimBatchSize))
    this.requireDb().exec(
      'DELETE FROM captured_messages WHERE id IN (SELECT id FROM captured_messages ORDER BY start_timestamp_us ASC, id ASC LIMIT ?)',
      { bind: [trimSize] },
    )
    this.trimStats.messages += trimSize
    return trimSize
  }
}
