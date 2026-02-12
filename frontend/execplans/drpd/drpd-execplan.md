# Add Dr.PD USBTMC device support

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `PLANS.md` at the repo root, and this ExecPlan must be maintained in accordance with `/PLANS.md`.

## Purpose / Big Picture

The goal is to add a complete Dr.PD device driver that can communicate over USBTMC using SCPI and exposes each hardware command as an ergonomic async method with typed results. After this change, a developer can select a Dr.PD device via WebUSB, construct a Dr.PD driver instance, and call grouped APIs like `device.analogMonitor.getStatus()` or `device.trigger.getInfo()` to get structured data rather than raw SCPI strings. The behavior is demonstrated through unit tests that validate SCPI formatting, response parsing, and command coverage against the Dr.PD command set defined in `execplans/drpd/scpi.yaml`. The Rack UI also persists connected Devices, reconnects on startup, and provides a header button for connecting new Devices. The Rack UI will also support adding Instruments that declare compatibility with connected Devices, persist rack JSON (including devices and instruments) in localStorage, and offer an Add Instrument popup that filters compatible instrument classes.

## Progress

- [x] (2026-01-29 19:10Z) Drafted initial ExecPlan for Dr.PD device support using SCPI over USBTMC.
- [x] (2026-01-29 16:37Z) Implemented DRPD driver types, parsers, transport interface, and command group modules under `src/lib/device/drpd/`.
- [x] (2026-01-29 16:37Z) Implemented `DRPDDevice` wiring and `DRPDDeviceDefinition` in `src/lib/device/drpd.ts` with config lifecycle support.
- [x] (2026-01-29 16:37Z) Added unit tests for parsers, command groups, and device definition behavior.
- [x] (2026-01-29 16:37Z) Ran `npm run test` and confirmed all tests pass.
- [x] (2026-01-29 18:54Z) Added DRPD WebUSB test page and styles, then restored the RackView as the default app root.
- [x] (2026-01-29 18:54Z) Resolved ESM export collisions by re-exporting DRPD driver modules from `src/lib/device/drpd/index.ts` and `src/lib/device/index.ts`.
- [x] (2026-01-29 08:40Z) Added Rack-to-Device persistence, connect button, and auto-connect on startup using WebUSB and localStorage.
- [x] (2026-01-29 08:45Z) Added Rack UI tests covering device connection, persistence, and header controls.
- [x] (2026-01-29 16:25Z) Replaced header device list with themed dropdown menu, add device entry, disconnect controls, and cancel-safe picker handling.
- [x] (2026-01-30 15:01Z) Updated capture decoding to match revised `BUS:CC:CAPture:DATA?` response and refreshed tests/docs.
- [x] (2026-01-31 19:47Z) Added interrupt-driven DRPD device state tracking with role updates and EventTarget notifications.
- [x] (2026-02-01 03:27Z) Added analog monitor CC status derivation helper and updated device status UI labels for power/current.
- [x] (2026-02-01 03:27Z) Expanded interrupt-driven state tracking for VBUS, capture, trigger, sink info/PDO list, and message capture drain with per-message events.
- [x] (2026-01-31 17:10Z) Added Instrument base class + registry with reverse-domain identifiers and supported device identifiers.
- [x] (2026-01-31 17:20Z) Store rack JSON solely in localStorage and update it when instruments are added.
- [x] (2026-01-31 17:30Z) Added Add Instrument popup filtered by compatible device identifiers; append new instrument rows.
- [x] (2026-01-31 17:35Z) Added dummy Dr. PD-compatible instrument and tests for compatibility filtering + instrument addition.
- [x] (2026-01-31 18:10Z) Bound instrument instances to rack device record ids and surfaced device info to instrument views.
- [x] (2026-01-31 19:05Z) Added rack edit mode with drag/drop layout changes, close buttons, and transactional save/cancel.
- [x] (2026-01-31 19:20Z) Polished edit mode with pulsing glow, muted content, trash icon, and disabled device menu.
- [x] (2026-01-31 19:40Z) Adjusted edit mode pulse styling, reintroduced close X, and collapsed adjacent instrument borders.

## Surprises & Discoveries

- Observation: The SCPI YAML and Python model disagree on some command mnemonics and response shapes (for example, VBUS threshold commands and system memory response shape). This plan resolves those conflicts explicitly to avoid ambiguity.
  Evidence: `execplans/drpd/scpi.yaml` vs. `execplans/drpd/python_model/device_vbus.py` and `device_system.py`.
- Observation: Device documentation now requires Device subclasses to emit connect/disconnect events and implement configuration load/save lifecycle hooks.
  Evidence: `docs/devices.md` sections “Events: connect and disconnect” and “Configuration lifecycle”.
- Observation: Vitest emits a warning about `--localstorage-file` without a valid path during test runs.
  Evidence: `npm run test` output warnings after the DRPD test run.
- Observation: Vite ESM exports cannot re-export from a directory without an index entry; `src/lib/device/drpd.ts` and `src/lib/device/drpd/` share a basename, so explicit index re-exports are needed.
  Evidence: Runtime error “does not provide an export named DRPDDevice” from `src/lib/device/index.ts` until `./drpd/index` was added.
- Observation: Rack auto-connect only sees WebUSB devices that were previously authorized for the origin.
  Evidence: `navigator.usb.getDevices()` returns an empty list until a user grants permission.
- Observation: WebUSB `requestDevice` throws `NotFoundError` when the user cancels the picker.
  Evidence: Canceling device selection returns “No device selected” and should be treated as a non-error.
- Observation: The capture payload now includes start and end timestamps, a 32-bit decode result, and 16-bit pulse widths.
  Evidence: Updated `execplans/drpd/scpi.yaml` description for `BUS:CC:CAPture:DATA?`.
- Observation: DRPD device state updates require bridging USBTMC interrupt events to SCPI status reads.
  Evidence: `DRPDDevice` now listens to `USBTMCTransport.INTERRUPT_EVENT` and queries `STAT:DEV?`.
- Observation: CC channel status derivation lives alongside SCPI parsing so UIs can consistently interpret CC voltages.
  Evidence: `analogMonitorCCStatusFromVoltage()` in `src/lib/device/drpd/parsers.ts`.
- Observation: Message capture draining must tolerate new captures arriving during fetch, so it loops until the device returns an error and retries once on error.
  Evidence: `DRPDDevice.drainCapturedMessages()` logic.
- Observation: Instruments need stable identifiers and compatibility lists tied to device identifiers.
  Evidence: Requirement to filter instruments by supported device identifiers and uniquely identify instrument classes.

## Decision Log

- Decision: Treat `execplans/drpd/scpi.yaml` as the source of truth for command mnemonics and parameter units, and use the Python model only for grouping and response struct shapes when they do not conflict.
  Rationale: The user explicitly directs that SCPI command coverage must match `scpi.yaml`, while the Python model is guidance for structure rather than protocol authority.
  Date/Author: 2026-01-29 / Codex

- Decision: Implement the driver in a dedicated `src/lib/drpd/` module with small group classes (system, analog monitor, bus/capture, sink, trigger, test) and keep the Device identification definition in `src/lib/device/drpd.ts`.
  Rationale: This keeps the Device base-class usage aligned with `docs/devices.md` while keeping the driver code modular and small, avoiding an oversized single file.
  Date/Author: 2026-01-29 / Codex

- Decision: Represent binary capture timestamps as `bigint` in TypeScript, and expose an additional `timestampSeconds` number derived from the bigint when safe.
  Rationale: The capture protocol uses 64-bit microsecond timestamps which can exceed JavaScript safe integer limits; bigint preserves correctness while still offering a convenient number-based field for UI use.
  Date/Author: 2026-01-29 / Codex

- Decision: Parse `SYSTem:MEMory?` responses defensively, accepting either one value (free bytes) or two values (total/free) and returning a struct with optional fields.
  Rationale: The YAML description mentions only free memory, but the Python model expects two values; parsing both avoids brittle behavior while remaining compatible with either firmware response.
  Date/Author: 2026-01-29 / Codex

- Decision: Ensure the Dr.PD Device definition implements config load/save and uses the Device base class connect/disconnect event flow.
  Rationale: The Device documentation now mandates configuration persistence and connect/disconnect event emission for all Device subclasses.
  Date/Author: 2026-01-29 / Codex

- Decision: Persist rack device associations in localStorage and attempt auto-connect on startup.
  Rationale: The Rack UI must remember user-selected devices between sessions and reconnect when those devices are available.
  Date/Author: 2026-01-29 / Codex

- Decision: Present devices in a themed dropdown with an “Add Device” action and per-device disconnect.
  Rationale: The header should stay compact while still supporting device management actions.
  Date/Author: 2026-01-29 / Codex

- Decision: Introduce a base `Instrument` class with a reverse-domain identifier and supported device identifiers.
  Rationale: Instruments require stable identifiers and compatibility filtering based on rack devices.
  Date/Author: 2026-01-30 / Codex

- Decision: Persist rack JSON (devices + instruments) in localStorage and treat it as the source of truth.
  Rationale: Rack edits should survive reloads without relying on a static JSON file.
  Date/Author: 2026-01-30 / Codex

- Decision: Bind each instrument instance to a rack device record id instead of the device identifier string.
  Rationale: Rack device records are stable per-rack and allow instruments to resolve the exact device instance and its runtime state.
  Date/Author: 2026-01-31 / Codex

- Decision: Implement rack edit mode as a transactional draft with cancel/commit semantics.
  Rationale: Edit operations (dragging/removing instruments) should be reversible until explicitly saved.
  Date/Author: 2026-01-31 / Codex

## Outcomes & Retrospective

Implemented the DRPD driver under `src/lib/device/drpd/` with grouped command modules, shared types/parsers, and a `DRPDDevice` wrapper. Added `DRPDDeviceDefinition` with USB identifiers, optional verification via `*IDN?`, and configuration lifecycle support. Unit tests cover parsing, command formatting via mock transport, device events/config persistence, and verification behavior. Added a DRPD WebUSB test page to connect and read analog monitor stats, then restored the RackView as the default app root. Resolved ESM export collisions by re-exporting the driver API from `src/lib/device/drpd/index.ts` and `src/lib/device/index.ts`. Updated capture decoding to include start/end timestamps, a 32-bit decode result, and 16-bit pulse widths with updated tests and parser logic. Expanded interrupt-driven device state tracking in `DRPDDevice` to refresh VBUS info, capture enable/count, trigger info, sink info, and sink PDO list, and to emit a message event for each drained capture (with a retry-once policy). Added Rack UI device persistence with a themed Devices dropdown (Add Device + Disconnect), localStorage-backed device lists per rack, startup auto-connect via `navigator.usb.getDevices()`, cancel-safe WebUSB picker handling, and an Add Instrument popup that filters instrument definitions by supported device identifiers. Rack JSON now persists in localStorage, and new instruments append new rows. All tests pass with `npm run test`, with only the existing localstorage warning emitted by Vitest.

## Context and Orientation

The project is a Vite + React + TypeScript app. WebUSB communication uses the USBTMC transport in `src/lib/transport/usbtmc.ts`, which can send SCPI commands and parse text or binary responses. Device identification is handled by the Device base class in `src/lib/device/base/types.ts` and registry helpers in `src/lib/device/base/deviceRegistry.ts`, as documented in `docs/devices.md`.

Definitions used in this plan:

USBTMC means USB Test & Measurement Class, a USB class for instruments. In this repo it is implemented by `USBTMCTransport`, which provides `sendCommand`, `queryText`, and `queryBinary` methods.

SCPI means Standard Commands for Programmable Instruments, a text protocol for instrument control. In this plan, every SCPI command in `execplans/drpd/scpi.yaml` must be represented by a typed async method in the Dr.PD driver.

A Device definition means a small class extending the `Device` base class that provides a reverse-domain identifier, display name, and USB matching filters, as described in `docs/devices.md`.

The Dr.PD driver will be structured to resemble the Python model in `execplans/drpd/python_model/` for grouping and naming of command sets, but it will use TypeScript idioms and the WebUSB USBTMC transport.

Device subclasses are also `EventTarget` emitters. They must emit `deviceconnect` and `devicedisconnect` events via `connectDevice` and `disconnectDevice`, and must implement `loadConfig` and `saveConfig` to reapply stored configuration on reconnect using `setStoredConfig`.

## Plan of Work

Create the Dr.PD TypeScript driver module under `src/lib/device/` so the main entrypoint is `src/lib/device/drpd.ts`. If the driver needs multiple files, place supporting group modules under `src/lib/device/drpd/`. The driver should be constructed around a transport interface compatible with `USBTMCTransport`, enabling both real hardware usage and deterministic unit tests. The driver will expose grouped APIs for each command family defined in `execplans/drpd/scpi.yaml`. These groups must be small, focused classes to keep files short, and each method will map directly to one SCPI command, returning a TypeScript type or enum that represents the logical result. Add Rack UI device association that uses the Device registry helpers to request devices, persists selected devices per rack in localStorage, and automatically reconnects known devices on startup using `navigator.usb.getDevices()`. Add an Instrument base class with reverse-domain identifiers and supported device identifiers, plus a popup for adding compatible instruments to the rack.

Define a shared set of enums, discriminated unions, and structs in `src/lib/device/drpd/types.ts` that mirror all possible SCPI responses. Use these types across groups, and include parsing helpers in a `src/lib/device/drpd/parsers.ts` module for SCPI response parsing and binary capture decoding. Favor returning logical units (for example, millivolts and milliamps as numbers for sink voltage/current; volts/amps as floats only if the SCPI response is specified in those units). All public functions and classes must include docblocks, and all fields must include `///<` comments per repo conventions. Avoid `private` fields; use `protected` or `public` instead.

Add a Device definition class in `src/lib/device/drpd.ts` that encodes the USB matching rules from the Dr.PD identification data. This file is the main Dr.PD entrypoint and should construct the driver groups from `src/lib/device/drpd/`. The `usbSearch` should include the vendor/product IDs (0x2E8A / 0x000A) and a USBTMC class/subclass/protocol entry so the picker can also match on class codes. Implement `loadConfig` and `saveConfig` so configuration is stored and re-applied on reconnect via `setStoredConfig`. Ensure usage documentation and tests cover the `connectDevice(usbDevice)` and `disconnectDevice()` event flow, because Device subclasses must emit `deviceconnect`/`devicedisconnect` events. Optionally add a static `verifyConnectedDevice` that uses `USBTMCTransport` to call `*IDN?` and confirm the manufacturer and model strings match expected values ("MTA Inc." and "Dr. PD").

On connection, the driver must call a `refreshState()` method that queries every property tracked in `DRPDDeviceState` (currently role and analog monitor) and emits the corresponding change events if values differ. Any new state properties added in the future must be included in `refreshState()` so the initial snapshot after connection is always complete.

Add unit tests for parsers and driver behavior. Use a lightweight mock transport class that records commands and returns canned responses. Tests should prove that each group method formats the SCPI command correctly, and that each response parser returns the expected typed result (including edge cases like missing data or empty capture buffers). Tests should also cover the Device definition’s USB search fields, optional verification hook behavior, connect/disconnect event emission, and configuration persistence via `loadConfig`, `saveConfig`, and `setStoredConfig`. All new tests must live near the new source files (for example, `src/lib/device/drpd/__tests__/` and `src/lib/device/drpd.test.ts`) and `npm run test` must pass.

## Concrete Steps

Work in `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`.

Create the driver module under `src/lib/device/` with the following files and responsibilities. Keep files small and split by feature if any file becomes large:

- `src/lib/device/drpd.ts` as the main Dr.PD entrypoint and Device definition.
- `src/lib/device/drpd/types.ts` for enums and response structs.
- `src/lib/device/drpd/parsers.ts` for response parsing and binary capture decoding.
- `src/lib/device/drpd/transport.ts` defining a minimal transport interface used by the driver (compatible with `USBTMCTransport`).
- `src/lib/device/drpd/device.ts` exporting the Dr.PD driver class that wires group instances together.
- `src/lib/device/drpd/<group>.ts` files for each command group (system, analog monitor, ccBus, capture, vbus, sink, trigger, test).

Add the Dr.PD Device definition in `src/lib/device/drpd.ts` and re-export it from `src/lib/device/index.ts`.

Add tests under `src/lib/device/drpd/__tests__/` and `src/lib/device/` to validate command formatting, parsing, Device connect/disconnect events, and configuration persistence behavior. Tests should use a mock transport that satisfies the driver transport interface and can inject text or binary responses.

Update `src/features/rack/RackView.tsx` to include a themed Devices dropdown in the header, persist device records per rack in localStorage, and auto-connect on startup via `navigator.usb.getDevices()`. Track device status in the UI, support disconnect, handle picker cancellations, and handle missing WebUSB gracefully.

Add Rack UI tests to stub `navigator.usb` and verify device connection persistence, picker cancellations, disconnect handling, and auto-connect behavior, along with header visibility and theme toggle coverage. Add instrument tests to verify compatibility filtering, adding instruments to new rows, and localStorage-backed rack JSON updates.

After implementation, run the test suite from the repo root with:

  npm run test

Capture any failing test output in the `Artifacts and Notes` section and update the plan as needed.

## Validation and Acceptance

Run `npm run test` and expect all tests to pass. The new tests must fail before implementation and pass after. Acceptance is satisfied when:

The Dr.PD driver exposes grouped APIs that cover every command in `execplans/drpd/scpi.yaml` and returns typed results rather than raw SCPI strings.

Unit tests demonstrate that command formatting is correct for representative methods, that parsing handles valid responses and edge cases, and that binary capture decoding returns the expected structure.

The Dr.PD Device definition provides correct WebUSB filters and (if implemented) the verification hook can confirm the `*IDN?` manufacturer and model values.

The Dr.PD Device definition implements `loadConfig`/`saveConfig`, stores configuration with `setStoredConfig`, and emits `deviceconnect`/`devicedisconnect` events when `connectDevice`/`disconnectDevice` are called.

Optionally, with real hardware, a developer can call `USBTMCTransport.requestDevice()`, create a Dr.PD driver, and execute `device.system.identify()` or `device.analogMonitor.getStatus()` to see real values. If hardware is not available, passing tests is the acceptance proxy.

The Rack header Devices dropdown adds devices, stores them per rack in localStorage, supports Disconnect, and auto-connects previously authorized devices on reload. Picker cancellation does not display an error. The Add Instrument popup lists only instruments compatible with the rack’s devices and appends new instrument rows to the rack JSON.

## Idempotence and Recovery

All steps are additive and safe to repeat. If tests fail, update parsers or mock responses and rerun `npm run test`. If the verification hook fails against real hardware, disable it or loosen the match in a controlled way and document the change in the Decision Log.

## Artifacts and Notes

Expected Dr.PD USB identifiers and WebUSB strings:

  Vendor ID: 0x2E8A
  Product ID: 0x000A
  Manufacturer string: "MTA Inc."
  Product string: "Dr. PD"
  WebUSB URL: "t76.org/drpd"

Binary capture format for `BUS:CC:CAPture:DATA?` (from `execplans/drpd/scpi.yaml`):

  Start timestamp: 8 bytes, unsigned little-endian, microseconds.
  End timestamp: 8 bytes, unsigned little-endian, microseconds.
  Decode result: 4 bytes, unsigned little-endian (0 success, 1 invalid K-code, 2 CRC error, 3 timeout, 4 incomplete).
  SOP: 4 bytes (opaque identifier).
  Pulse count: 4 bytes unsigned little-endian.
  Pulse widths: N * 2 bytes (uint16_t per pulse width, little-endian).
  Data length: 4 bytes unsigned little-endian.
  Decoded data: M bytes.

Example mock transport response for analog monitor (MEAS:ALL?):

  "5.00 0.12 0.33 0.00 0.33 0.00 1.20 0.00 0.60"

## Interfaces and Dependencies

Use `USBTMCTransport` from `src/lib/transport/usbtmc.ts` as the real transport implementation, but define a minimal driver transport interface so tests can inject mocks. The driver should depend only on this interface and the transport’s `scpiEnum` helper for enum arguments. Rack Device connection uses WebUSB via `navigator.usb` with filters built from Device definitions, and stores rack-device associations in localStorage.

In `src/lib/device/drpd/transport.ts`, define:

  export interface DRPDTransport {
    sendCommand(command: string, ...params: (string | number | boolean | { raw: string })[]): Promise<void>
    queryText(command: string, ...params: (string | number | boolean | { raw: string })[]): Promise<string[]>
    queryBinary(command: string, ...params: (string | number | boolean | { raw: string })[]): Promise<Uint8Array>
  }

In `src/lib/device/drpd/types.ts`, define enums and structs that cover every SCPI response. At minimum include:

  export enum OnOffState { ON = 'ON', OFF = 'OFF' }
  export enum CCBusRole { DISABLED = 'DISABLED', OBSERVER = 'OBSERVER', SOURCE = 'SOURCE', SINK = 'SINK' }
  export enum CCBusRoleStatus { UNATTACHED = 'UNATTACHED', SOURCE_FOUND = 'SOURCE_FOUND', ATTACHED = 'ATTACHED' }
  export enum VBusStatus { ENABLED = 'ENABLED', DISABLED = 'DISABLED', OVP = 'OVP', OCP = 'OCP' }
  export enum TriggerStatus { IDLE = 'IDLE', ARMED = 'ARMED', TRIGGERED = 'TRIGGERED' }
  export enum TriggerEventType { OFF, PREAMBLE_START, SOP_START, HEADER_START, DATA_START, MESSAGE_COMPLETE, INVALID_KCODE, CRC_ERROR, TIMEOUT_ERROR, RUNT_PULSE_ERROR, ANY_ERROR }
  export enum TriggerSyncMode { OFF = 'OFF', PULSE_HIGH = 'PULSE_HIGH', PULSE_LOW = 'PULSE_LOW', TOGGLE = 'TOGGLE' }
  export enum CaptureDecodeResult { SUCCESS = 0, INVALID_KCODE = 1, CRC_ERROR = 2, TIMEOUT_ERROR = 3, INCOMPLETE = 4 }
  export enum SinkState { DISCONNECTED, NEGOTIATING, AWAITING_PS_READY, CONNECTED, ERROR }

  export type DeviceStatusFlags = {
    vbusStatusChanged: boolean
    roleChanged: boolean
    captureStatusChanged: boolean
    ccBusStatusChanged: boolean
    triggerStatusChanged: boolean
    sinkPdoListChanged: boolean
    sinkStatusChanged: boolean
    messageReceived: boolean
    rawValue: number
  }

  export interface DeviceIdentity { manufacturer: string; model: string; serialNumber: string; firmwareVersion: string }
  export interface MemoryUsage { freeBytes: number; totalBytes?: number }
  export interface AnalogMonitorChannels { vbus: number; ibus: number; dutCc1: number; dutCc2: number; usdsCc1: number; usdsCc2: number; adcVref: number; groundRef: number; currentVref: number }
  export interface VBusInfo { status: VBusStatus; ovpThresholdMv: number; ocpThresholdMa: number }
  export interface TriggerInfo { status: TriggerStatus; type: TriggerEventType; eventThreshold: number; autorepeat: OnOffState; eventCount: number; syncMode: TriggerSyncMode; syncPulseWidthUs: number }

  export type SinkPdo = FixedSinkPdo | VariableSinkPdo | BatterySinkPdo | AugmentedSinkPdo | null
  export interface FixedSinkPdo { type: 'FIXED'; voltageV: number; maxCurrentA: number }
  export interface VariableSinkPdo { type: 'VARIABLE'; minVoltageV: number; maxVoltageV: number; maxCurrentA: number }
  export interface BatterySinkPdo { type: 'BATTERY'; minVoltageV: number; maxVoltageV: number; maxPowerW: number }
  export interface AugmentedSinkPdo { type: 'AUGMENTED'; minVoltageV: number; maxVoltageV: number; maxCurrentA: number }
  export interface SinkInfo { status: SinkState; negotiatedPdo: SinkPdo; negotiatedVoltageMv: number; negotiatedCurrentMa: number; error: boolean }

  export interface CapturedMessage {
    startTimestampUs: bigint
    endTimestampUs: bigint
    startTimestampSeconds: number
    endTimestampSeconds: number
    decodeResult: CaptureDecodeResult
    sop: Uint8Array
    pulseCount: number
    pulseWidths: Uint16Array
    dataLength: number
    decodedData: Uint8Array
  }

  export interface DRPDDeviceState {
    role: CCBusRole | null
    ccBusRoleStatus: CCBusRoleStatus | null
    analogMonitor: AnalogMonitorChannels | null
    vbusInfo: VBusInfo | null
    captureEnabled: OnOffState | null
    captureCount: number | null
    triggerInfo: TriggerInfo | null
    sinkInfo: SinkInfo | null
    sinkPdoList: SinkPdo[] | null
  }

In `src/lib/device/drpd/parsers.ts`, define helper functions that parse SCPI strings into these types. Examples include:

- `parseDeviceStatus(value: string): DeviceStatusFlags` using the bit definitions from `STATus:DEVice?` in `execplans/drpd/scpi.yaml`.
- `parseSinkPdo(values: string[]): SinkPdo` splitting a comma-separated response and mapping to the appropriate PDO type.
- `parseOnOff(value: string): OnOffState` and string-to-enum helpers for role/status types.
- `parseCapturedMessage(data: Uint8Array): CapturedMessage` per the binary format in the Artifacts section.

In `src/lib/device/drpd/device.ts`, define a main driver class that wires groups together. It should accept a `DRPDTransport` in the constructor, and expose group properties, for example:

  export class DRPDDevice {
    public readonly system: DRPDSystem
    public readonly status: DRPDStatus
    public readonly analogMonitor: DRPDAnalogMonitor
    public readonly ccBus: DRPDCCBus
    public readonly capture: DRPDCapture
    public readonly vbus: DRPDVBus
    public readonly sink: DRPDSink
    public readonly trigger: DRPDTrigger
    public readonly test: DRPDTest
    public constructor(transport: DRPDTransport) { ... }
  }

Each group should implement the SCPI command set as follows (use SCPI mnemonics from `execplans/drpd/scpi.yaml`):

System group (`src/lib/device/drpd/system.ts`):

- `identify(): Promise<DeviceIdentity>` uses `*IDN?` and returns manufacturer, model, serialNumber, firmwareVersion.
- `reset(): Promise<void>` uses `*RST`.
- `getError(): Promise<{ code: number; message: string }>` uses `SYSTem:ERRor?`.
- `getMemoryUsage(): Promise<MemoryUsage>` uses `SYSTem:MEMory?`.
- `getClockFrequencyHz(): Promise<number>` uses `SYSTem:SPeed?`.
- `getUptimeUs(): Promise<bigint>` uses `SYSTem:UPTime?` and returns microseconds.
- `getTimestampUs(): Promise<bigint>` uses `SYSTem:TIMEstamp?` and returns microseconds.

Status group (`src/lib/device/drpd/status.ts`):

- `readDeviceStatus(): Promise<DeviceStatusFlags>` uses `STATus:DEVice?` and parses bit flags. Document that reading clears the register.

Analog monitor group (`src/lib/device/drpd/analogMonitor.ts`):

- `getStatus(): Promise<AnalogMonitorChannels>` uses `MEASure:ALL?` and returns the 9-channel struct.
- `getVBusVoltage(): Promise<number>` uses `MEASure:VOLTage:VBUS?`.
- `getVBusCurrent(): Promise<number>` uses `MEASure:CURRent:VBUS?`.
- `getDutCc1Voltage(): Promise<number>` uses `MEASure:VOLTage:CC:DUT1?`.
- `getDutCc2Voltage(): Promise<number>` uses `MEASure:VOLTage:CC:DUT2?`.
- `getUsdsCc1Voltage(): Promise<number>` uses `MEASure:VOLTage:CC:USDS1?`.
- `getUsdsCc2Voltage(): Promise<number>` uses `MEASure:VOLTage:CC:USDS2?`.
- `getAdcVrefVoltage(): Promise<number>` uses `MEASure:VOLTage:REF:ADC?`.
- `getCurrentRefVoltage(): Promise<number>` uses `MEASure:VOLTage:REF:CURRent?`.
- `getGroundRefVoltage(): Promise<number>` uses `MEASure:VOLTage:REF:GND?`.

CC bus / mode group (`src/lib/device/drpd/ccBus.ts`):

- `getRole(): Promise<CCBusRole>` uses `BUS:CC:ROLE?`.
- `setRole(role: CCBusRole): Promise<void>` uses `BUS:CC:ROLE` with enum parameter.
- `getRoleStatus(): Promise<CCBusRoleStatus>` uses `BUS:CC:ROLE:STATus?`.

Capture group (`src/lib/device/drpd/capture.ts`):

- `getCycleTimeNs(): Promise<number>` uses `BUS:CC:CAPture:CYCLETIME?`.
- `getCapturedMessageCount(): Promise<number>` uses `BUS:CC:CAPture:COUNT?`.
- `getNextCapturedMessage(): Promise<CapturedMessage>` uses `BUS:CC:CAPture:DATA?` and throws when no messages are available (device returns error).
- `setCaptureEnabled(state: OnOffState): Promise<void>` uses `BUS:CC:CAPture:EN`.
- `getCaptureEnabled(): Promise<OnOffState>` uses `BUS:CC:CAPture:EN?`.
- `clearCapturedMessages(): Promise<void>` uses `BUS:CC:CAPture:CLEAR`.

VBus group (`src/lib/device/drpd/vbus.ts`):

- `getStatus(): Promise<VBusStatus>` uses `BUS:VBUS:STATus?`.
- `resetFault(): Promise<void>` uses `BUS:VBUS:RESET`.
- `setOvpThresholdMv(thresholdMv: number): Promise<void>` uses `BUS:VBUS:OVPThreshold`.
- `getOvpThresholdMv(): Promise<number>` uses `BUS:VBUS:OVPThreshold?`.
- `setOcpThresholdMa(thresholdMa: number): Promise<void>` uses `BUS:VBUS:OCPThreshold`.
- `getOcpThresholdMa(): Promise<number>` uses `BUS:VBUS:OCPThreshold?`.
- `getInfo(): Promise<VBusInfo>` combines status and thresholds.

Sink group (`src/lib/device/drpd/sink.ts`):

- `getAvailablePdoCount(): Promise<number>` uses `SINK:PDO:COUNT?`.
- `getPdoAtIndex(index: number): Promise<SinkPdo>` uses `SINK:PDO?`.
- `requestPdo(index: number, voltageMv: number, currentMa: number): Promise<void>` uses `SINK:PDO`.
- `getStatus(): Promise<SinkState>` uses `SINK:STATUS?`.
- `getNegotiatedPdo(): Promise<SinkPdo>` uses `SINK:STATUS:PDO?`.
- `getNegotiatedVoltageMv(): Promise<number>` uses `SINK:STATUS:VOLTAGE?`.
- `getNegotiatedCurrentMa(): Promise<number>` uses `SINK:STATUS:CURRENT?`.
- `getErrorStatus(): Promise<boolean>` uses `SINK:STATUS:ERROR?`.
- `getSinkInfo(): Promise<SinkInfo>` combines status, negotiated PDO/voltage/current, and error.

Trigger group (`src/lib/device/drpd/trigger.ts`):

- `reset(): Promise<void>` uses `TRIGger:RESET`.
- `getStatus(): Promise<TriggerStatus>` uses `TRIGger:STATus?`.
- `setEventType(type: TriggerEventType): Promise<void>` uses `TRIGger:EVent:TYPE`.
- `getEventType(): Promise<TriggerEventType>` uses `TRIGger:EVent:TYPE?`.
- `setEventThreshold(count: number): Promise<void>` uses `TRIGger:EVent:THRESHold`.
- `getEventThreshold(): Promise<number>` uses `TRIGger:EVent:THRESHold?`.
- `setAutoRepeat(state: OnOffState): Promise<void>` uses `TRIGger:EVent:AUTOREPEAT`.
- `getAutoRepeat(): Promise<OnOffState>` uses `TRIGger:EVent:AUTOREPEAT?`.
- `getEventCount(): Promise<number>` uses `TRIGger:EVent:COUNT?`.
- `setSyncMode(mode: TriggerSyncMode): Promise<void>` uses `TRIGger:SYNC:MODE`.
- `getSyncMode(): Promise<TriggerSyncMode>` uses `TRIGger:SYNC:MODE?`.
- `setSyncPulseWidthUs(widthUs: number): Promise<void>` uses `TRIGger:SYNC:PULSEwidth`.
- `getSyncPulseWidthUs(): Promise<number>` uses `TRIGger:SYNC:PULSEwidth?`.
- `getInfo(): Promise<TriggerInfo>` aggregates the above into one struct.

Test group (`src/lib/device/drpd/test.ts`):

- `setVbusManagerState(state: OnOffState): Promise<void>` uses `TEST:VBUSMAN:EN`.
- `getVbusManagerState(): Promise<OnOffState>` uses `TEST:VBUSMAN:EN?`.
- `setCc1Role(role: TestCcRole): Promise<void>` uses `TEST:CCROLE:CC1`.
- `getCc1Role(): Promise<TestCcRole>` uses `TEST:CCROLE:CC1?`.
- `setCc2Role(role: TestCcRole): Promise<void>` uses `TEST:CCROLE:CC2`.
- `getCc2Role(): Promise<TestCcRole>` uses `TEST:CCROLE:CC2?`.
- `setDutChannel(channel: CcChannel): Promise<void>` uses `TEST:CCBUS:DUT:CHANNEL`.
- `getDutChannel(): Promise<CcChannel>` uses `TEST:CCBUS:DUT:CHANNEL?`.
- `setUsdsChannel(channel: CcChannel): Promise<void>` uses `TEST:CCBUS:USDS:CHANNEL`.
- `getUsdsChannel(): Promise<CcChannel>` uses `TEST:CCBUS:USDS:CHANNEL?`.
- `setCcMuxState(state: OnOffState): Promise<void>` uses `TEST:CCBUS:MUX`.
- `getCcMuxState(): Promise<OnOffState>` uses `TEST:CCBUS:MUX?`.

Define `TestCcRole` enum with values: SOURCE_DEFAULT, SOURCE_15, SOURCE_30, SINK, EMARKER, VCONN, OFF. Define `CcChannel` enum with values: CC1, CC2.

In `src/lib/device/drpd.ts`, define:

  export class DRPDDeviceDefinition extends Device {
    public static verifyConnectedDevice?: (device: USBDevice) => Promise<boolean> | boolean
    public constructor() { ... }
    public loadConfig(config: unknown): Promise<void> | void { ... }
    public saveConfig(): Promise<unknown> | unknown { ... }
  }

Populate `identifier` with a reverse-domain identifier (for example, `com.mta.drpd`), `displayName` with "Dr. PD", and `usbSearch` with vendor/product IDs and USBTMC class/subclass/protocol. Include the WebUSB URL string in documentation or a `note` field if useful for debugging.

When the application opens a real device, call `connectDevice(usbDevice)` on the Dr.PD Device instance so the base class emits `Device.CONNECT_EVENT` and applies stored config. When closing, call `disconnectDevice()` to emit `Device.DISCONNECT_EVENT`. Tests should verify these events fire with `addEventListener`.

Finally, export Dr.PD driver modules from `src/lib/device/drpd/index.ts` and update `src/lib/device/index.ts` to export the Dr.PD Device definition.

Change note (2026-01-29): Initial ExecPlan created for Dr.PD USBTMC driver support and command coverage.
Change note (2026-01-29): Updated plan to incorporate Device connect/disconnect events and configuration lifecycle requirements from `docs/devices.md`.
Change note (2026-01-29): Updated file layout to place Dr.PD driver entrypoint in `src/lib/device/drpd.ts` with group modules under `src/lib/device/drpd/`.
Change note (2026-01-29): Updated plan to include Rack-to-Device persistence, themed devices dropdown, cancel-safe picker handling, and auto-connect behavior in the Rack UI.
Change note (2026-01-30): Updated plan to add Instrument identifiers, compatibility filtering, Add Instrument popup, and localStorage-backed rack JSON updates.
Change note (2026-01-31): Completed Instrument system work (base class, compatibility filtering, localStorage-backed rack JSON, Add Instrument UI, and tests).
Change note (2026-01-29): Updated progress and outcomes after implementing the DRPD driver and tests.
Change note (2026-01-29): Added note about the DRPD test page and the explicit export fixes for ESM module resolution.
Change note (2026-01-30): Updated capture decode documentation and implementation to match revised `BUS:CC:CAPture:DATA?` format.
Change note (2026-01-31): Added interrupt-driven DRPD device state tracking and role change events.
Change note (2026-02-01): Expanded interrupt-driven state updates and message capture drain behavior.
Change note (2026-02-01): Added analog monitor CC status derivation helper and refreshed device status UI labels.
