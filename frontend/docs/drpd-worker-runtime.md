# Dr. PD Worker Runtime Architecture

This document explains how the Dr. PD (DRPD) device is connected and driven in the frontend after the worker refactor. It focuses on the runtime architecture (definition vs driver, worker ownership, WebUSB access, logging, and failure handling). For command groups and DRPD state/event details, see `docs/drpd-device.md`.

## Why this exists

The DRPD frontend performs frequent USBTMC requests (polling, interrupt-driven refresh, capture draining) and optional log persistence. Running that work on the main thread can block rendering and UI interactions. The current architecture moves the DRPD session into a dedicated worker so that USB communication, polling loops, and logging happen off the main thread.

## The two layers: Definition vs Driver

The DRPD integration uses the repository’s Device abstraction, which separates a lightweight definition from the live driver session.

### Definition (`DRPDDeviceDefinition`)

`src/lib/device/drpd.ts`

The definition is responsible for:

- Declaring identity and matching metadata (`identifier`, `displayName`, `usbSearch`)
- Optional post-connect verification (`verifyConnectedDevice` using `*IDN?`)
- Configuration persistence (`loadConfig`, `saveConfig`, `setStoredConfig`)
- Creating a connected runtime (`createConnectedRuntime(device)`)
- Bridging the base `Device` connect/disconnect lifecycle to the active driver (`connectDevice`, `disconnectDevice`)

The frontend should treat the definition as the entry point for creating a DRPD runtime. The frontend does not need to know whether the runtime is worker-backed or direct.

### Driver runtime (`DRPDDriverRuntime`)

`src/lib/device/drpd.ts`

`DRPDDriverRuntime` is currently a union of:

- `DRPDWorkerDeviceProxy` (normal browser/runtime path)
- `DRPDDevice` (capability fallback used mainly in environments without `Worker`, such as some tests)

Both expose the DRPD API surface the UI uses:

- `getState()`
- `refreshState()`
- `configureLogging(...)`
- `handleConnect()`, `handleDisconnect()`, `detachInterrupts()`
- DRPD command groups used by the UI (`analogMonitor`, `ccBus`, `capture`, `sink`)
- `EventTarget` DRPD events (for example `stateupdated`, `stateerror`)

## Preferred connection flow (frontend)

The frontend should use the definition factory rather than manually opening USBTMC and calling `createDriver(...)`.

Current app path (used by `RackView`) is:

1. User selects a `USBDevice` via WebUSB picker.
2. App matches it to `DRPDDeviceDefinition`.
3. App calls `definition.createConnectedRuntime(selectedDevice)`.
4. App receives:
   - `driver`: DRPD driver runtime (usually worker-backed)
   - `transport`: a closable runtime resource for cleanup
5. App calls `definition.connectDevice(selectedDevice)` to trigger the `Device` lifecycle and start the DRPD session.

The `connectDevice(...)` call remains important because it emits the base `Device.CONNECT_EVENT` and triggers driver startup (`handleConnect()`).

## Worker-backed runtime: what runs where

### Main thread

- Device picker UI (`navigator.usb.requestDevice(...)`)
- Device matching and `DRPDDeviceDefinition`
- React components and instrument views
- `DRPDWorkerDeviceProxy` (API-compatible proxy object for the UI)
- Worker watchdog / heartbeat monitoring (auto-refresh on worker stall)

### Worker thread

- Real `USBTMCTransport` instance (WebUSB access)
- Real `DRPDDevice` instance
- DRPD polling timers
- Interrupt handling
- Capture queue draining
- DRPD logging store ownership (currently `SQLiteWasmStore` interface-backed implementation)
- DRPD event generation and forwarding to main thread

This means DRPD USB communication and the DRPD session loop are both off the main thread.

## Why the worker creates the `USBTMCTransport`

The browser/runtime that prompted this design did not support structured-cloning a `USBDevice` object into the worker (`postMessage` failed with “USBDevice object could not be cloned”). To avoid cloning the object, the main thread sends a serializable selection descriptor (VID, PID, serial number, and names), and the worker resolves the actual authorized device using:

- `navigator.usb.getDevices()`

The worker then creates and opens `USBTMCTransport` itself.

This keeps WebUSB operations in the worker while avoiding `USBDevice` cloning.

## USB request serialization guarantees

The DRPD runtime must not overlap USBTMC requests on the wire. The implementation preserves that requirement in two layers:

1. Worker-side queue: the worker serializes per-transport operations before issuing transport calls.
2. `USBTMCTransport` internal queue: `src/lib/transport/usbtmc.ts` still serializes requests via `_withLock()` and `requestQueue`.

Result: one request completes before the next request is sent to the physical device.

## Logging behavior in the worker

The DRPD device driver supports logging through `DRPDLogStore`. In the worker-backed runtime:

- The worker-owned `DRPDDevice` creates and uses the log store.
- Log writes happen in the worker as part of polling/capture paths.
- Query/export/clear requests from the UI are proxied to the worker-owned driver.

This keeps logging work off the main thread and preserves ordering relative to captured messages and state updates.

## Worker stall detection and automatic page refresh

The main thread runs a watchdog in `src/lib/device/drpd/worker/service.ts`:

- Sends a worker heartbeat RPC on a fixed interval
- Tracks the time of the last successful heartbeat response
- Triggers `window.location.reload()` if the worker stalls or fails
- Also reloads on worker `error`, `messageerror`, or explicit worker fatal messages
- Uses a session-storage guard to prevent rapid reload loops

This is a defensive recovery mechanism for cases where the worker gets stuck while owning the active DRPD session.

## Capability fallback (tests and non-browser environments)

In browser environments with `Worker`, `DRPDDeviceDefinition.createConnectedRuntime(...)` uses the worker-backed runtime.

If `Worker` is unavailable (common in some test environments), the definition falls back to:

- creating a direct `USBTMCTransport` on the main thread
- creating a direct `DRPDDevice` via `createDriver(...)`

This fallback is internal to the definition and exists to keep tests and non-browser environments working. The frontend still calls the same definition API and does not decide between runtime modes.

## Error surfaces and common failures

### `USBDevice object could not be cloned`

This was caused by attempting to `postMessage` a `USBDevice` object to the worker. The current implementation avoids that by sending only a serializable descriptor and resolving the device in the worker.

### Worker cannot find the selected device

The worker resolves the device from `navigator.usb.getDevices()`. If the selected device is not present in the worker’s authorized device list, connection fails with a clear error. This can happen if:

- the browser does not expose WebUSB in workers
- the worker cannot access the authorized devices list
- multiple identical devices are present and cannot be disambiguated (for example no serial number)

### WebUSB unavailable in worker context

If the browser/runtime does not expose `navigator.usb` in the worker, DRPD worker session creation fails with an explicit error. In normal browser usage, DRPD is intended to use the worker path, so this should be treated as an environment compatibility issue.

## Files to read when changing this system

- `src/lib/device/drpd.ts` (DRPD definition, runtime factory, config lifecycle)
- `src/lib/device/drpd/device.ts` (real DRPD driver behavior)
- `src/lib/device/drpd/worker/deviceProxy.ts` (main-thread DRPD proxy)
- `src/lib/device/drpd/worker/drpdIo.worker.ts` (worker-owned DRPD session + transport)
- `src/lib/device/drpd/worker/service.ts` (main-thread worker RPC client + watchdog)
- `src/lib/transport/usbtmc.ts` (real USBTMC transport and request serialization)

## Guidance for frontend callers

- Use `DRPDDeviceDefinition.createConnectedRuntime(selectedDevice)` instead of manually opening USBTMC.
- Treat the returned `driver` as the only API you need for DRPD state, commands, and events.
- Treat the returned `transport` as a cleanup handle only (`close()` on disconnect/teardown).
- Continue calling `definition.connectDevice(device)` and `definition.disconnectDevice()` so the base `Device` lifecycle remains consistent.
