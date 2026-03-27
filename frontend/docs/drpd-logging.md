# Dr. PD Logging and Debug Facilities

This document describes the DRPD frontend logging subsystem (SQLite/OPFS-backed log persistence) and the browser DevTools debug helpers used to inspect it.

For DRPD command groups and state/event behavior, see `docs/drpd-device.md`. For worker runtime architecture, see `docs/drpd-worker-runtime.md`.

## Overview

The DRPD frontend logs two categories of runtime telemetry:

- Analog samples (including `VBUS` and `IBUS`)
- Captured USB-PD messages

The logging backend is implemented by `src/lib/device/drpd/logging/sqliteWasmStore.ts` and uses real SQLite via `@sqlite.org/sqlite-wasm`.

## Storage backend and persistence

### Primary backend (persistent)

When available, the worker-owned DRPD runtime opens a SQLite database using the OPFS VFS (`sqlite3.oo1.OpfsDb`). This persists data across page reloads and browser restarts for the same origin.

- DB file path (inside OPFS): `/drpd/drpd-logging.sqlite3`
- Schema: `src/lib/device/drpd/logging/schema.ts`

### Fallbacks

If OPFS is not available but SQLite-WASM initializes, the store falls back to SQLite in-memory (`sqlite-memory` backend). If SQLite initialization fails entirely, it falls back to a memory-array implementation (`memory-fallback`) to keep tests and unsupported runtimes working.

These fallbacks are not persistent.

## Dev/hosting requirements for OPFS

OPFS support in the sqlite-wasm worker path requires cross-origin isolation:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

The local Vite dev server is configured with these headers in `vite.config.ts`. Production hosting must also send them for OPFS persistence to work.

When you access the dev server through a LAN IP such as `192.168.199.1`, plain HTTP is not a trustworthy origin, so Chrome will ignore COOP/COEP headers there. Use `localhost` during local development if you need those headers to take effect.

## Log lifecycle behavior

### Backend creation

The DRPD device opens a log backend on connect, even when capture is off and logging writes are disabled. This allows querying existing history and inspecting backend diagnostics immediately after connect.

### Capture/logging coupling

- Turning capture ON auto-enables and starts logging writes.
- Turning capture OFF stops logging writes.
- The backend stays open while the device is connected so logs remain queryable.
- The backend is closed on device disconnect.

## What gets stored

### Analog rows (`analog_samples`)

Stored fields include:

- `timestamp_us`: device timestamp (microseconds)
- `vbus_v`: VBUS voltage
- `ibus_a`: IBUS current
- `role`: role snapshot
- `created_at_ms`: host/computer timestamp (`Date.now()` at insert time)

### Captured message rows (`captured_messages`)

Stored fields include:

- `start_timestamp_us`: device capture start timestamp
- `end_timestamp_us`: device capture end timestamp
- message metadata (`message_kind`, roles, IDs, etc.)
- raw capture blobs (`raw_pulse_widths`, `raw_sop`, `raw_decoded_data`)
- `created_at_ms`: host/computer timestamp (`Date.now()` at insert time)

This means both device time and host time are available for later correlation.

## DevTools debug helper (`window.__drpdLogs`)

When `RackView` is loaded, the frontend registers a DevTools helper on `window`:

- `window.__drpdLogs.devices()`
- `window.__drpdLogs.driver(deviceId?)`
- `await window.__drpdLogs.diagnostics(deviceId?)`
- `await window.__drpdLogs.count(kind?, deviceId?)`
- `await window.__drpdLogs.queryAnalog(query?, deviceId?)`
- `await window.__drpdLogs.queryMessage(query?, deviceId?)`
- `await window.__drpdLogs.queryMessages(query?, deviceId?)` (alias)
- `await window.__drpdLogs.export(request, deviceId?)`
- `await window.__drpdLogs.clear(scope, deviceId?)`
- `window.__drpdLogs.help()`

If exactly one DRPD device is connected, `deviceId` is optional. If multiple are connected, pass a `deviceId` from `devices()`.

### Diagnostics

`diagnostics()` reports the active backend and persistence status, including:

- `backend`: `sqlite-opfs`, `sqlite-memory`, `memory-fallback`, or `none`
- `persistent`
- `sqlite`
- `opfs`
- `loggingStarted`
- `loggingConfigured`

### Counts

`count()` supports:

- `await window.__drpdLogs.count()` -> `{ analog, messages }`
- `await window.__drpdLogs.count('analog')` -> number
- `await window.__drpdLogs.count('messages')` -> number

### Query helpers

`queryAnalog()` and `queryMessage()` support:

- `last` (default `20`)
- `startTimestampUs`
- `endTimestampUs`

Examples:

```js
await window.__drpdLogs.diagnostics()
await window.__drpdLogs.count()
await window.__drpdLogs.count('analog')
await window.__drpdLogs.queryAnalog()
await window.__drpdLogs.queryMessage({ last: 50, startTimestampUs: 0n, endTimestampUs: 10_000_000n })
```

## Clearing logs

Logs are retained until explicitly cleared (or trimmed by configured retention limits). Use:

- `await window.__drpdLogs.clear('analog')`
- `await window.__drpdLogs.clear('messages')`
- `await window.__drpdLogs.clear('all')`

## Relevant implementation files

- `src/lib/device/drpd/logging/sqliteWasmStore.ts`
- `src/lib/device/drpd/logging/schema.ts`
- `src/lib/device/drpd/device.ts`
- `src/lib/device/drpd/worker/deviceProxy.ts`
- `src/lib/device/drpd/worker/drpdIo.worker.ts`
- `src/features/rack/RackView.tsx`
