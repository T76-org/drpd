# Dr. PD Device Driver Guide

This document explains how the Dr. PD (DRPD) device driver is structured in this repo, how to connect to it, and how to observe its internal state. It is written for someone with no prior context. USB-PD message decoding is documented separately in `docs/drpd-message-decoding.md` and is not repeated here.

Runtime architecture (definition vs driver, worker ownership, WebUSB in worker, logging in worker, and worker watchdog behavior) is documented separately in `docs/drpd-worker-runtime.md`.
Logging backend details (SQLite/OPFS persistence, capture/logging coupling, and DevTools debug helpers such as `window.__drpdLogs`) are documented separately in `docs/drpd-logging.md`.

## Overview

The DRPD device driver is implemented as a set of command groups that wrap SCPI over USBTMC. The driver exposes strongly typed methods for each SCPI command and keeps an internal state snapshot that observers can subscribe to via `EventTarget` events. The driver is instantiated with a `DRPDTransport`, which can be backed by `USBTMCTransport` for real hardware or by test doubles.

## Key files

- `src/lib/device/drpd.ts`: Device definition (`DRPDDeviceDefinition`) and entry point exports.
- `src/lib/device/drpd/device.ts`: Driver wrapper (`DRPDDevice`) and state/event handling.
- `src/lib/device/drpd/types.ts`: Shared enums, response structures, and `DRPDDeviceState`.
- `src/lib/device/drpd/parsers.ts`: SCPI response parsing and capture payload decoding.
- `src/lib/device/drpd/*.ts`: Command groups (system, analog monitor, cc bus, capture, sink, trigger, vbus, test).
- `src/lib/device/drpd/transport.ts`: Minimal DRPD transport interface.
- `src/lib/transport/usbtmc.ts`: WebUSB USBTMC transport.

## Device definition and identification

`DRPDDeviceDefinition` extends the base `Device` class and provides:

- `identifier`: `com.mta.drpd`
- `displayName`: `Dr. PD`
- `usbSearch`: VID/PID (0x2E8A / 0x000A) and a USBTMC class filter
- Optional verification via `*IDN?` (manufacturer `MTA Inc.`, model `Dr. PD`)

`DRPDDeviceDefinition` implements `loadConfig` and `saveConfig` and uses `setStoredConfig` so configuration is re-applied on reconnect. It also caches the active driver instance so `connectDevice` and `disconnectDevice` can call into the driver to start/stop polling. Debug logging is disabled by default; call `driver.setDebugLoggingEnabled(true)` to enable it.

## Creating a driver instance

There are two ways to create a DRPD runtime:

- Preferred app path: `DRPDDeviceDefinition.createConnectedRuntime(device)` (used by frontend features; hides worker-backed vs direct implementation details)
- Low-level/manual path: `DRPDDeviceDefinition.createDriver(transport)` (useful for tests and direct transport experiments)

The examples below show the low-level/manual path because it is easier to illustrate end-to-end. For production/frontend usage in this repo, prefer `createConnectedRuntime(device)` and let the definition choose the runtime mechanism.

Use `DRPDDeviceDefinition.createDriver(transport)` to build a driver for an already-open transport. For example:

    import USBTMCTransport from '../lib/transport/usbtmc'
    import { DRPDDeviceDefinition } from '../lib/device'

    const definition = new DRPDDeviceDefinition()
    const device = await navigator.usb.requestDevice({
      filters: definition.usbSearch.map(({ vendorId, productId, classCode, subclassCode, protocolCode }) => ({
        vendorId,
        productId,
        classCode,
        subclassCode,
        protocolCode,
      })),
    })

    const transport = new USBTMCTransport(device)
    await transport.open()

    const driver = definition.createDriver(transport)
    await definition.connectDevice(device)

When you are finished, call `definition.disconnectDevice()` and `transport.close()`.

### Preferred frontend connection path (worker-backed in browser runtimes)

The frontend should use the definition runtime factory and avoid manual transport management:

    const definition = new DRPDDeviceDefinition()
    const selected = await navigator.usb.requestDevice({ filters: buildUSBFilters([definition]) })
    const runtime = await definition.createConnectedRuntime(selected)
    const driver = runtime.driver

    await definition.connectDevice(selected)

    // ... use driver ...

    definition.disconnectDevice()
    await runtime.transport.close()

## Command groups

The driver provides grouped APIs for each SCPI command family:

- `driver.system`: identification, reset, system status
- `driver.status`: `STAT:DEV?` status register parsing
- `driver.analogMonitor`: analog measurements (`MEAS:*`)
- `driver.ccBus`: CC bus role and role status
- `driver.capture`: capture controls and `BUS:CC:CAP:DATA?` parsing
- `driver.vbus`: VBUS status and threshold controls
- `driver.sink`: sink PDO operations and negotiated status
- `driver.trigger`: trigger configuration
- `driver.test`: test-only commands

These are thin wrappers over `USBTMCTransport.sendCommand`, `queryText`, and `queryBinary`, with typed parsing in `parsers.ts`.

## Device state and events

`DRPDDevice` maintains a `DRPDDeviceState` snapshot with the following fields:

- `role`: current CC bus role (`DISABLED`, `OBSERVER`, `SOURCE`, `SINK`), or `null` if unknown
- `ccBusRoleStatus`: role status (`UNATTACHED`, `SOURCE_FOUND`, `ATTACHED`), or `null` if unknown
- `analogMonitor`: latest analog monitor channels, or `null` if unknown
- `vbusInfo`: VBUS status + thresholds, or `null` if unknown
- `captureEnabled`: capture enable state, or `null` if unknown
- `captureCount`: captured message count, or `null` if unknown
- `triggerInfo`: full trigger info, or `null` if unknown
- `sinkInfo`: full sink status, negotiated PDO, voltage/current, or `null` if unknown
- `sinkPdoList`: full sink PDO list, or `null` if unknown

For analog monitor CC voltages, `src/lib/device/drpd/parsers.ts` includes
`analogMonitorCCStatusFromVoltage()` to convert a CC voltage into a coarse
status bucket (Disconnected, SinkTxNG, SinkTxOK, VConn, Unknown). UI code can
use this helper to label CC lines consistently.

Consumers can subscribe using `EventTarget`:

- `DRPDDevice.STATE_UPDATED_EVENT` (`stateupdated`): fired whenever any tracked state changes
- `DRPDDevice.ROLE_CHANGED_EVENT` (`rolechanged`): fired when role changes
- `DRPDDevice.CCBUS_STATUS_CHANGED_EVENT` (`ccbusstatuschanged`): fired when role status changes
- `DRPDDevice.ANALOG_MONITOR_CHANGED_EVENT` (`analogmonitorchanged`): fired when analog monitor values change
- `DRPDDevice.VBUS_CHANGED_EVENT` (`vbuschanged`): fired when VBUS info changes
- `DRPDDevice.CAPTURE_STATUS_CHANGED_EVENT` (`capturestatuschanged`): fired when capture enable state changes
- `DRPDDevice.CAPTURE_COUNT_CHANGED_EVENT` (`capturecountchanged`): fired when capture count changes
- `DRPDDevice.TRIGGER_CHANGED_EVENT` (`triggerchanged`): fired when trigger info changes
- `DRPDDevice.SINK_INFO_CHANGED_EVENT` (`sinkinfochanged`): fired when sink info changes
- `DRPDDevice.SINK_PDO_LIST_CHANGED_EVENT` (`sinkpdolistchanged`): fired when sink PDO list changes
- `DRPDDevice.MESSAGE_CAPTURED_EVENT` (`messagecaptured`): fired for each captured message fetched
- `DRPDDevice.STATE_ERROR_EVENT` (`stateerror`): fired when state refresh fails (previous state is preserved)

Events include a `detail` payload. `stateupdated` includes `{ state, changed }` where `changed` is a list of keys that were updated. Other events include the new values and, when available, the previous values (for example `{ role, previousRole }` or `{ previous, current }`).

### Interrupt-driven updates

`DRPDDevice` listens to `USBTMCTransport.INTERRUPT_EVENT`. When an interrupt arrives, it queries `STAT:DEV?`. If the status indicates a role change, it calls `DRPDCCBus.getRole()` and updates state (emitting role and state update events). If any error occurs, `stateerror` is emitted and the previous state remains unchanged.

Other interrupt bits map to their respective refreshers: VBUS updates call `vbus.getInfo()`, capture status updates call `capture.getCaptureEnabled()`, trigger updates call `trigger.getInfo()`, sink status updates call `sink.getSinkInfo()`, sink PDO list updates call `sink.getAvailablePdoCount()` + `sink.getPdoAtIndex()`, and message received triggers a capture drain plus a capture-count refresh. State refreshers emit both the specific event and a `stateupdated` event; `messagecaptured` is emitted for each drained message without a `stateupdated` payload.

### Analog monitor polling

Analog monitor values are polled on a timer. By default, polling starts automatically on connect at 250ms intervals after the initial `refreshState()` completes. On connect, the driver calls `refreshState()` to query every tracked state property immediately so the initial snapshot is complete. You can control polling behavior via:

- `driver.startAnalogMonitorPolling(intervalMs)`
- `driver.stopAnalogMonitorPolling()`
- `driver.setAnalogMonitorPollingInterval(intervalMs)`

### Capture drain on connect and message interrupts

On connect, the driver queries the captured message count. If the count is greater than zero, it repeatedly calls `BUS:CC:CAPture:DATA?` until the device reports an error (new captures can arrive while draining). The same drain logic runs when the message-received interrupt bit is set. Each fetched message emits `messagecaptured`. Fetch errors are retried once before emitting `stateerror`.

Polling emits `analogmonitorchanged` and `stateupdated` only when the values differ from the last sample.

### Capture and logging behavior

In the current frontend runtime, capture toggling also controls whether log writes are active:

- Turning capture ON auto-enables logging writes.
- Turning capture OFF stops logging writes.

The logging backend itself is opened on connect (so historical logs can be queried immediately) and closed on disconnect. See `docs/drpd-logging.md` for backend and persistence details.

## Recommended usage pattern

- Use `DRPDDeviceDefinition` to define and match the device.
- Use `USBTMCTransport` to open the device.
- Use `DRPDDeviceDefinition.createDriver()` to build a driver.
- Call `connectDevice` to start state tracking.
- Subscribe to `stateupdated` and specific change events as needed.

Example:

    const definition = new DRPDDeviceDefinition()
    const driver = definition.createDriver(transport)

    driver.addEventListener(DRPDDevice.STATE_UPDATED_EVENT, (event) => {
      const detail = (event as CustomEvent<{ state: DRPDDeviceState; changed: string[] }>).detail
      console.log('State updated', detail.changed, detail.state)
    })

    await definition.connectDevice(device)

## Tests and test page

- Unit tests live under `src/lib/device/drpd/__tests__/`, `src/lib/device/drpd.test.ts`, and alongside USB-PD parsing code.
- A simple WebUSB test page exists at `src/features/drpd/DrpdTestPage.tsx` for manual device connection and analog monitor reads. This is not the default app root; switch to it manually if needed.

## What is not covered here

USB-PD message parsing and SOP/header decoding is documented in `docs/drpd-message-decoding.md`. Refer to that document for USB-PD payload structure, message classification, and parsing extension points.
