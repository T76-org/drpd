/**
 * @file sqliteWasmStore.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * DRPD logging store backed by a SQLite-WASM-oriented API.
 */

import {
  LOG_SCHEMA_STATEMENTS,
  LOG_SCHEMA_VERSION,
} from './schema'
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
} from './types'

const DEFAULT_RETENTION_BATCH = 2_000

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
 * In-memory SQLite-WASM-oriented log store.
 */
export class SQLiteWasmStore implements DRPDLogStore {
  protected config: DRPDLoggingConfig ///< Retention and control settings.
  protected initialized: boolean ///< True once init has completed.
  protected analogSamples: LoggedAnalogSample[] ///< Analog sample rows.
  protected capturedMessages: LoggedCapturedMessage[] ///< Captured message rows.
  protected trimStats: { analog: number; messages: number } ///< Trim counters.

  /**
   * Create a logging store.
   *
   * @param config - Partial logging configuration.
   */
  public constructor(config?: Partial<DRPDLoggingConfig>) {
    this.config = normalizeLoggingConfig(config)
    this.initialized = false
    this.analogSamples = []
    this.capturedMessages = []
    this.trimStats = { analog: 0, messages: 0 }
  }

  /**
   * Initialize logging storage.
   */
  public async init(): Promise<void> {
    void LOG_SCHEMA_STATEMENTS
    void LOG_SCHEMA_VERSION
    this.initialized = true
  }

  /**
   * Close logging storage.
   */
  public async close(): Promise<void> {
    this.initialized = false
  }

  /**
   * Insert one analog sample.
   *
   * @param sample - Sample row.
   */
  public async insertAnalogSample(sample: LoggedAnalogSample): Promise<void> {
    this.ensureInitialized()
    this.analogSamples.push(sample)
    await this.trimAnalogSamplesIfNeeded()
  }

  /**
   * Insert one captured message.
   *
   * @param message - Message row.
   */
  public async insertCapturedMessage(message: LoggedCapturedMessage): Promise<void> {
    this.ensureInitialized()
    this.capturedMessages.push(message)
    await this.trimCapturedMessagesIfNeeded()
  }

  /**
   * Query analog sample rows.
   *
   * @param query - Query criteria.
   * @returns Matching rows in ascending timestamp order.
   */
  public async queryAnalogSamples(query: AnalogSampleQuery): Promise<LoggedAnalogSample[]> {
    this.ensureInitialized()
    const rows = this.analogSamples
      .filter(
        (row) => row.timestampUs >= query.startTimestampUs && row.timestampUs <= query.endTimestampUs,
      )
      .sort((left, right) => (left.timestampUs < right.timestampUs ? -1 : left.timestampUs > right.timestampUs ? 1 : 0))
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
    const hasMessageKinds = Boolean(query.messageKinds?.length)
    const hasSenderPowerRoles = Boolean(query.senderPowerRoles?.length)
    const hasSenderDataRoles = Boolean(query.senderDataRoles?.length)
    const hasSopKinds = Boolean(query.sopKinds?.length)

    const rows = this.capturedMessages
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

    if (!query.limit || query.limit <= 0) {
      return rows
    }
    return rows.slice(0, query.limit)
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

    const result: LogClearResult = {
      analogDeleted: 0,
      messagesDeleted: 0,
    }

    if (scope === 'analog' || scope === 'all') {
      result.analogDeleted = this.analogSamples.length
      this.analogSamples = []
    }
    if (scope === 'messages' || scope === 'all') {
      result.messagesDeleted = this.capturedMessages.length
      this.capturedMessages = []
    }

    return result
  }

  /**
   * Apply retention limits to both tables.
   */
  public async enforceRetention(): Promise<void> {
    this.ensureInitialized()
    await this.trimAnalogSamplesIfNeeded()
    await this.trimCapturedMessagesIfNeeded()
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
   * Ensure store was initialized.
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('DRPD logging store is not initialized')
    }
  }

  /**
   * Trim old analog rows when retention is exceeded.
   */
  protected async trimAnalogSamplesIfNeeded(): Promise<void> {
    const overflow = this.analogSamples.length - this.config.maxAnalogSamples
    if (overflow <= 0) {
      return
    }
    const trimSize = Math.min(
      this.analogSamples.length,
      Math.max(overflow, this.config.retentionTrimBatchSize),
    )
    this.analogSamples.splice(0, trimSize)
    this.trimStats.analog += trimSize
  }

  /**
   * Trim old captured message rows when retention is exceeded.
   */
  protected async trimCapturedMessagesIfNeeded(): Promise<void> {
    const overflow = this.capturedMessages.length - this.config.maxCapturedMessages
    if (overflow <= 0) {
      return
    }
    const trimSize = Math.min(
      this.capturedMessages.length,
      Math.max(overflow, this.config.retentionTrimBatchSize),
    )
    this.capturedMessages.splice(0, trimSize)
    this.trimStats.messages += trimSize
  }
}
