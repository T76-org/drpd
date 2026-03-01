/**
 * @file schema.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * SQLite schema definitions for DRPD logging.
 */

/**
 * Schema setup SQL statements.
 */
export const LOG_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS analog_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp_us INTEGER NOT NULL,
    display_timestamp_us INTEGER,
    vbus_v REAL NOT NULL,
    ibus_a REAL NOT NULL,
    role TEXT,
    created_at_ms INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS captured_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_kind TEXT NOT NULL DEFAULT 'message',
    event_type TEXT,
    event_text TEXT,
    event_wall_clock_ms INTEGER,
    start_timestamp_us INTEGER NOT NULL,
    end_timestamp_us INTEGER NOT NULL,
    display_timestamp_us INTEGER,
    decode_result INTEGER NOT NULL,
    sop_kind TEXT,
    message_kind TEXT,
    message_type INTEGER,
    message_id INTEGER,
    sender_power_role TEXT,
    sender_data_role TEXT,
    pulse_count INTEGER NOT NULL,
    raw_pulse_widths BLOB NOT NULL,
    raw_sop BLOB NOT NULL,
    raw_decoded_data BLOB NOT NULL,
    parse_error TEXT,
    created_at_ms INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS logging_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
  'CREATE INDEX IF NOT EXISTS idx_analog_samples_timestamp ON analog_samples(timestamp_us);',
  'CREATE INDEX IF NOT EXISTS idx_captured_messages_start_ts ON captured_messages(start_timestamp_us);',
  'CREATE INDEX IF NOT EXISTS idx_captured_messages_kind ON captured_messages(message_kind);',
  'CREATE INDEX IF NOT EXISTS idx_captured_messages_sender_power ON captured_messages(sender_power_role);',
  'CREATE INDEX IF NOT EXISTS idx_captured_messages_sender_data ON captured_messages(sender_data_role);',
]

/**
 * Schema version used by the logging store.
 */
export const LOG_SCHEMA_VERSION = 2
