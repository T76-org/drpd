# Add Dr. PD Logging Support Backed by SQLite WASM

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `PLANS.md` at the repo root, and this ExecPlan must be maintained in accordance with `/PLANS.md`.

## Purpose / Big Picture

After this change, the Dr. PD device class will continuously persist two kinds of runtime data to a local database in the browser: analog monitor samples (VBUS voltage and current) and captured USB-PD messages received from the device. The logging capacity will be configurable, and the implementation will be engineered to handle at least 1,000,000 stored points without freezing the UI. Users will be able to interrogate the recorded data by time range and message attributes (including message type and sender/receiver roles), export selected records, and clear the database on demand. Success is visible through unit tests and an integration-level test that inserts large synthetic datasets and proves query, export, and clear operations behave correctly.

## Progress

- [x] (2026-02-10 00:00Z) Reviewed current DRPD driver architecture, event flow, and existing ExecPlan requirements from `PLANS.md`.
- [x] (2026-02-10 00:00Z) Authored initial ExecPlan for SQLite WASM-backed telemetry and message logging in the `logging-support` worktree.
- [x] (2026-02-10 07:10Z) Implemented `src/lib/device/drpd/logging/` with schema definitions, typed interfaces, and `SQLiteWasmStore` insert/query/export/clear/retention behavior.
- [x] (2026-02-10 07:13Z) Integrated logging lifecycle and ingestion into `DRPDDevice` connect/disconnect, analog polling, and captured message drain paths.
- [x] (2026-02-10 07:15Z) Added logging APIs to `DRPDDevice`, persisted logging config through `DRPDDeviceDefinition`, and exported new logging types.
- [x] (2026-02-10 07:16Z) Added `loggingStore`, `loggingIntegration`, and `loggingScale` tests and validated the full suite with `npm run test` (111 passing).

## Surprises & Discoveries

- Observation: The driver already emits high-value change events (`analogmonitorchanged`, `messagecaptured`, `stateerror`) and has centralized polling/interrupt handlers, so logging can be attached in one place without duplicating protocol calls.
  Evidence: `src/lib/device/drpd/device.ts` has `pollAnalogMonitor`, `refreshAndDrainCapturedMessagesFromDevice`, and event dispatch paths.

- Observation: Analog monitor values already include a device-provided capture timestamp (`captureTimestampUs`), which is preferable to client wall-clock timestamps for range querying.
  Evidence: `src/lib/device/drpd/types.ts` defines `AnalogMonitorChannels.captureTimestampUs: bigint`.

- Observation: Captured message objects currently hold transport-level payload fields (`sop`, `decodedData`, decode result) but not all queryable metadata (message kind, sender role, receiver role), so storage should enrich rows at ingest time.
  Evidence: `CapturedMessage` in `src/lib/device/drpd/types.ts` lacks explicit sender/receiver fields.

- Observation: Batched retention trimming can intentionally undershoot the configured max row count after a trim operation.
  Evidence: With `maxAnalogSamples=5` and `retentionTrimBatchSize=2`, inserting 10 rows retained 4 rows (`6..9`) after final trim in `loggingStore.test.ts`.

## Decision Log

- Decision: Use SQLite compiled to WebAssembly (SQLite WASM) as the persistence layer, wrapped behind a repository-local storage adapter interface.
  Rationale: The user requested SQLite WASM; using an adapter isolates third-party initialization details from `DRPDDevice` and keeps tests deterministic with a mock adapter.
  Date/Author: 2026-02-10 / Codex

- Decision: Enforce capacity as a bounded retention policy per table using row-count trimming with indexed timestamp ordering, not hard-stop writes.
  Rationale: Dropping oldest rows keeps logging continuous and predictable at high volume, and avoids dead data collection once limits are hit.
  Date/Author: 2026-02-10 / Codex

- Decision: Store timestamps as integer microseconds since epoch/device time in SQLite INTEGER columns and treat `bigint` as the TypeScript boundary type.
  Rationale: INTEGER is compact and index-friendly in SQLite, while `bigint` preserves full 64-bit precision in TypeScript.
  Date/Author: 2026-02-10 / Codex

- Decision: Ingest captured USB-PD messages into both raw and enriched columns (raw bytes plus parsed message metadata).
  Rationale: Raw bytes preserve auditability; enriched columns provide fast filtering by message kind, sender, and receiver without reparsing blobs during every query.
  Date/Author: 2026-02-10 / Codex

- Decision: Keep the logging store behind `DRPDLogStore` and use `SQLiteWasmStore` as the default implementation, with constructor injection for tests.
  Rationale: This keeps `DRPDDevice` independent of storage internals, enables deterministic integration tests, and preserves a migration path to a concrete SQLite-WASM engine while keeping API stable.
  Date/Author: 2026-02-10 / Codex

## Outcomes & Retrospective

Implemented in the `logging-support` worktree. `DRPDDevice` now supports configurable logging lifecycle control, ingestion of analog and captured message telemetry, metadata-enriched message persistence, and typed query/export/clear APIs. Logging configuration is persisted and normalized through `DRPDDeviceDefinition`.

Validation results:

- Added dependency `@sqlite.org/sqlite-wasm`.
- Added store tests in `src/lib/device/drpd/__tests__/loggingStore.test.ts`.
- Added device integration tests in `src/lib/device/drpd/__tests__/loggingIntegration.test.ts`.
- Added 1,000,000-row retention/query test in `src/lib/device/drpd/__tests__/loggingScale.test.ts`.
- Ran `npm run test` with all files passing (17 files, 111 tests).

Follow-up candidate: wire `SQLiteWasmStore` to the concrete SQLite-WASM runtime engine for durable browser persistence when runtime integration details are finalized.

## Context and Orientation

The Dr. PD driver root is `src/lib/device/drpd/device.ts`. It owns polling, interrupt handling, and event emission, so it is the correct integration point for starting/stopping logging and ingesting records. Analog samples come from `DRPDAnalogMonitor.getStatus()` and include VBUS voltage/current and a capture timestamp. Captured USB-PD messages are fetched via `DRPDCapture.getNextCapturedMessage()` and emitted as `DRPDDevice.MESSAGE_CAPTURED_EVENT`.

Type definitions are in `src/lib/device/drpd/types.ts`. Parsing helpers are in `src/lib/device/drpd/parsers.ts`. USB-PD decode support is in `src/lib/device/drpd/usb-pd/`, with `parseUSBPDMessage` producing structured message headers that can be mined for query metadata such as message class, power role (source/sink), and data role (DFP/UFP). Existing tests under `src/lib/device/drpd/__tests__/` already mock transport behavior and can be extended for logging paths.

SQLite WASM means SQLite (the relational database engine) compiled to WebAssembly so it runs in-browser. In this plan, SQLite WASM will be encapsulated in a local adapter module so the rest of the driver only calls typed methods like `insertAnalogSample` and `queryMessages`.

## Plan of Work

Create a new storage package under `src/lib/device/drpd/logging/` with three responsibilities: database lifecycle, query APIs, and export helpers. Add `sqliteWasmStore.ts` for real SQLite WASM wiring, `schema.ts` for schema creation/migration SQL, and `types.ts` for query/export request types. Keep driver code unaware of SQL strings by introducing an interface `DRPDLogStore` consumed by `DRPDDevice`.

Define two primary tables and one optional metadata table. The `analog_samples` table stores per-sample telemetry (`timestamp_us`, `vbus_v`, `ibus_a`, plus optional role snapshot). The `captured_messages` table stores both raw capture payload and enriched decoded metadata: capture start/end timestamps, decode result, SOP kind, USB-PD message kind/type, message id, sender power role, sender data role, pulse count, pulse widths, and decoded payload bytes. Add indexes on `timestamp_us`, `message_kind`, `sender_power_role`, and `sender_data_role` so filter queries remain fast at large row counts.

Add configurable limits to the device configuration model. Extend `DRPDDevice` and `DRPDDeviceDefinition.loadConfig/saveConfig` to support a `logging` block:
`enabled`, `maxAnalogSamples`, `maxCapturedMessages`, and `autoStartOnConnect`. Default limits should be conservative but scalable (for example, 1,000,000 each for analog and messages). On connect, if logging is enabled and `autoStartOnConnect` is true, initialize the store and begin ingesting. On disconnect, flush queued writes and close database handles cleanly.

Integrate ingestion into existing runtime paths. In `pollAnalogMonitor`, write one row after a successful analog update, using the device timestamp from `captureTimestampUs`. In message drain paths (`drainCapturedMessages` and interrupt-triggered fetch), enrich `CapturedMessage` by running USB-PD parsing (`parseUSBPDMessage`) and then insert into `captured_messages`, including `pulseCount` and the full pulse-width sequence (stored as a BLOB of uint16 little-endian values, with optional decoded array projection at query time). Parsing failures must not drop rows; store the raw message with nullable metadata and a parse error marker.

Implement bounded retention without table scans by trimming oldest rows when row counts exceed configured maxima. Prefer batched inserts and periodic trimming (for example, every N inserts) to avoid high per-sample overhead. Record trim counts in metadata for diagnostics.

Expose interrogation APIs directly on `DRPDDevice` so callers do not touch SQL. Add methods for:
`queryAnalogSamples`, `queryCapturedMessages`, `exportLogs`, and `clearLogs`. Query methods accept explicit timestamp ranges and optional filter criteria. Export supports at least JSON and CSV output. Clear supports scoped clears (`analog`, `messages`, or `all`) and returns deleted row counts.

Add unit tests for schema creation, retention trimming, and query filters. Extend device-state tests to verify that connect/disconnect controls logging lifecycle and that ingestion happens from both polling and interrupt-driven message paths. Add a scale-oriented test (can be marked slow) that inserts at least 1,000,000 synthetic records into SQLite WASM or a test adapter with equivalent SQL behavior, then validates bounded memory growth assumptions and query latency guardrails.

## Concrete Steps

From repo root `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/logging-support`, install SQLite WASM and add logging modules:

    npm install @sqlite.org/sqlite-wasm
    mkdir -p src/lib/device/drpd/logging

Create or edit:

    src/lib/device/drpd/logging/types.ts
    src/lib/device/drpd/logging/schema.ts
    src/lib/device/drpd/logging/sqliteWasmStore.ts
    src/lib/device/drpd/logging/index.ts
    src/lib/device/drpd/device.ts
    src/lib/device/drpd/types.ts
    src/lib/device/drpd.ts
    src/lib/device/drpd/__tests__/deviceState.test.ts
    src/lib/device/drpd/__tests__/loggingStore.test.ts
    src/lib/device/drpd/__tests__/loggingIntegration.test.ts

Run verification:

    npm run test

Optional scale run (if split into dedicated test file):

    npm run test -- src/lib/device/drpd/__tests__/loggingScale.test.ts

Expected successful output pattern:

    RUN  v2.x.x /Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/logging-support
    ✓ src/lib/device/drpd/__tests__/loggingStore.test.ts (...)
    ✓ src/lib/device/drpd/__tests__/loggingIntegration.test.ts (...)
    ✓ src/lib/device/drpd/__tests__/loggingScale.test.ts (...)
    Test Files  ... passed

## Validation and Acceptance

Acceptance is satisfied when all of the following are true:

1. With logging enabled, analog polling records VBUS voltage/current with timestamped rows and respects configured maximum count by evicting oldest rows.
2. Every captured message fetched from the device is persisted, including raw payload and pulse data, and can be filtered by timestamp range and by message metadata (`message kind`, `sender power role`, `sender data role`, and SOP).
3. `DRPDDevice` exposes typed methods to interrogate data, export selected data, and clear database content without direct SQL usage by callers.
4. Export returns deterministic JSON and CSV payloads that include selected columns and preserve timestamp precision.
5. A test demonstrates the system can manage at least 1,000,000 datapoints (analog and/or message rows) while queries still return correct results.
6. Existing DRPD behavior (state events, polling, interrupt handling) remains intact and all prior tests continue to pass.

## Idempotence and Recovery

Schema setup must use `CREATE TABLE IF NOT EXISTS` and versioned migration checks so repeated initialization is safe. Logging start/stop methods must be idempotent: calling start twice should not create duplicate timers or duplicate subscriptions, and calling stop twice should not throw. If database initialization fails, `DRPDDevice` should emit `STATE_ERROR_EVENT` with clear error details and continue device operation without logging. Clearing logs must be transactional so partial failures do not leave mixed table states.

## Artifacts and Notes

Use these SQL shapes as implementation anchors:

    CREATE TABLE IF NOT EXISTS analog_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_us INTEGER NOT NULL,
      vbus_v REAL NOT NULL,
      ibus_a REAL NOT NULL,
      role TEXT,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS captured_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_timestamp_us INTEGER NOT NULL,
      end_timestamp_us INTEGER NOT NULL,
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
    );

    CREATE INDEX IF NOT EXISTS idx_analog_samples_timestamp ON analog_samples(timestamp_us);
    CREATE INDEX IF NOT EXISTS idx_captured_messages_start_ts ON captured_messages(start_timestamp_us);
    CREATE INDEX IF NOT EXISTS idx_captured_messages_kind ON captured_messages(message_kind);
    CREATE INDEX IF NOT EXISTS idx_captured_messages_sender_power ON captured_messages(sender_power_role);
    CREATE INDEX IF NOT EXISTS idx_captured_messages_sender_data ON captured_messages(sender_data_role);

Suggested query contract examples:

    queryAnalogSamples({
      startTimestampUs: 1_730_000_000_000_000n,
      endTimestampUs: 1_730_000_100_000_000n,
      limit: 5000
    })

    queryCapturedMessages({
      startTimestampUs: 1_730_000_000_000_000n,
      endTimestampUs: 1_730_000_100_000_000n,
      messageKinds: ['CONTROL', 'DATA'],
      senderPowerRoles: ['SOURCE'],
      senderDataRoles: ['DFP']
    })

## Interfaces and Dependencies

Add the SQLite WASM runtime dependency:

    @sqlite.org/sqlite-wasm

Define the storage interface in `src/lib/device/drpd/logging/types.ts`:

    export interface DRPDLogStore {
      init(): Promise<void>
      close(): Promise<void>
      insertAnalogSample(sample: LoggedAnalogSample): Promise<void>
      insertCapturedMessage(message: LoggedCapturedMessage): Promise<void>
      queryAnalogSamples(query: AnalogSampleQuery): Promise<LoggedAnalogSample[]>
      queryCapturedMessages(query: CapturedMessageQuery): Promise<LoggedCapturedMessage[]>
      exportData(request: LogExportRequest): Promise<LogExportResult>
      clear(scope: 'analog' | 'messages' | 'all'): Promise<{ analogDeleted: number; messagesDeleted: number }>
      enforceRetention(): Promise<void>
    }

Add logging controls on `DRPDDevice` in `src/lib/device/drpd/device.ts`:

    public async configureLogging(config: DRPDLoggingConfig): Promise<void>
    public async startLogging(): Promise<void>
    public async stopLogging(): Promise<void>
    public isLoggingEnabled(): boolean
    public async queryAnalogSamples(query: AnalogSampleQuery): Promise<LoggedAnalogSample[]>
    public async queryCapturedMessages(query: CapturedMessageQuery): Promise<LoggedCapturedMessage[]>
    public async exportLogs(request: LogExportRequest): Promise<LogExportResult>
    public async clearLogs(scope: 'analog' | 'messages' | 'all'): Promise<{ analogDeleted: number; messagesDeleted: number }>

Extend configuration persisted by `DRPDDeviceDefinition` (`src/lib/device/drpd.ts`) to include:

    export interface DRPDLoggingConfig {
      enabled: boolean
      autoStartOnConnect: boolean
      maxAnalogSamples: number
      maxCapturedMessages: number
      retentionTrimBatchSize: number
    }

All public functions and classes added in this work must include docblocks, and class fields must use `///<` comments to match repository conventions in `AGENTS.md`.

Revision Note (2026-02-10): Added this new ExecPlan to define end-to-end logging support for Dr. PD in the `logging-support` worktree, including database design, driver APIs, retention strategy, and validation requirements requested by the user.
Revision Note (2026-02-10): Updated the captured message storage design to explicitly persist pulse count and pulse width data for every message, and reflected that requirement in ingestion and acceptance criteria.
Revision Note (2026-02-10): Marked implementation complete, updated living sections with results and decisions, and recorded full test validation after shipping logging module/device integration/tests in this worktree.
