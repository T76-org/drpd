# Create device abstraction for WebUSB instruments

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `PLANS.md` at the repo root, and this ExecPlan must be maintained in accordance with `/PLANS.md`.

## Purpose / Big Picture

The goal is to give the app a consistent Device abstraction that can identify which physical USB instruments it supports and build the correct WebUSB picker filters. After this change, an Instrument can ask for a Device class by its reverse-domain identifier (for example, `com.vendor.series.model`) and either (a) match a user-selected WebUSB device to the correct Device class or (b) assemble a list of WebUSB filters so the WebUSB picker only shows compatible devices. The Device is a base class developers extend to keep a single-file device implementation, it is an event emitter with connect/disconnect events, it includes load/save configuration hooks, and it can optionally expose a static post-connect verification hook. The behavior is demonstrated through unit tests that simulate WebUSB devices and verify filter building, matching, verification, and event/config behavior end-to-end.

## Progress

- [x] (2026-01-29 16:35Z) Drafted initial ExecPlan for the Device abstraction, matching, and filter-building behavior.
- [x] (2026-01-29 17:05Z) Added Device types, identifier validation, and exports in `src/lib/device`.
- [x] (2026-01-29 17:10Z) Implemented device registry helpers for filter building and device matching.
- [x] (2026-01-29 17:20Z) Added unit tests for identifier validation, filter building, and matching behavior.
- [x] (2026-01-29 17:25Z) Ran `npm run test` and confirmed the new tests pass.
- [x] (2026-01-29 17:35Z) Updated the Device abstraction to be a base class and aligned docs/tests accordingly.
- [x] (2026-01-29 17:40Z) Re-ran `npm run test` after the base class update and confirmed tests pass.
- [x] (2026-01-29 17:55Z) Added optional static post-connect verification hook support and tests.
- [x] (2026-01-29 18:00Z) Added developer documentation in `docs/devices.md` describing Device usage and verification flow.
- [x] (2026-01-29 18:10Z) Moved Device base code into `src/lib/device/base` and updated exports and docs.
- [x] (2026-01-29 18:20Z) Added Device connect/disconnect events and load/save configuration hooks with tests and documentation.

## Surprises & Discoveries

- Observation: Vitest emitted a warning about `--localstorage-file` without a valid path during the test run.
  Evidence: Test output warning after `npm run test` (did not affect test results).

## Decision Log

- Decision: Use a `Device` base class plus a lightweight `DeviceRegistry` helper instead of a global singleton.
  Rationale: The user wants device implementations to live in a single file and to be extendable for SCPI or other behavior; a base class supports that while a stateless registry keeps tests deterministic.
  Date/Author: 2026-01-29 / Codex

- Decision: Split the two scenarios explicitly: build WebUSB picker filters only from the declared Device USB search fields, and only inspect interface alternates when matching a user-selected USBDevice after the picker returns a device.
  Rationale: Interface alternates are only available after selection (and often after opening), so filter construction must rely solely on the static search fields. Matching a selected device can then use interface alternates first, with a fallback to device-level class fields when interface data is missing or unavailable in tests.
  Date/Author: 2026-01-29 / Codex

- Decision: Add an optional static verification hook on Device classes for post-connect disambiguation.
  Rationale: Some devices share USB identifiers; a post-connect hook allows Device drivers to confirm compatibility after the system opens the device without requiring extra base-class fields.
  Date/Author: 2026-01-29 / Codex

- Decision: Make Device an event emitter with connect/disconnect events and require load/save config methods.
  Rationale: Drivers need lifecycle signaling and a consistent configuration interface so the system can reapply settings when devices reconnect.
  Date/Author: 2026-01-29 / Codex

## Outcomes & Retrospective

Implemented the Device base class, filter builder, matching logic, and optional post-connect verification hook, along with unit tests that demonstrate device-selection matching, verification filtering, and WebUSB filter construction. The tests confirm stable de-duplication of filters, serial-number matching, and class-code matching with interface fallback, delivering the intended two scenarios in a testable, UI-agnostic way. Added connect/disconnect events and load/save configuration hooks with tests, and updated documentation in `docs/devices.md` to guide single-file Device implementations, configuration reapply, and the verification flow. The base code lives in `src/lib/device/base` with exports preserved at `src/lib/device/index.ts`.

## Context and Orientation

The project is a Vite + React + TypeScript app. The core WebUSB transport class is `src/lib/transport/usbtmc.ts`, which handles USBTMC messaging but does not define device identities or how to map selected USB devices to higher-level instrument concepts. There is now a Device base class but Instruments are not modeled in code yet. Tests run with Vitest (`npm run test`) and TypeScript DOM typings include WebUSB types via `@types/w3c-web-usb`.

Definitions used in this plan:

A Device is a logical description of a physical instrument connection from the system’s point of view, and a base class developers extend when implementing a device driver. It has a reverse-domain identifier (a string formatted like `com.vendor.series.model`) and a set of USB search parameters used to identify compatible WebUSB devices. Device subclasses emit connect/disconnect events and implement load/save configuration methods; they should reapply configuration on reconnect. Device subclasses can optionally expose a static verification hook that runs after a device is opened. A DeviceRegistry is a small helper that can build WebUSB picker filters from a list of Device instances and can match a user-selected USBDevice to the correct Device.

Tests in this repo are expected to live alongside the files they cover (for example, `src/lib/device/deviceRegistry.test.ts` sits next to the base module in `src/lib/device/base`).

Discovery is explicit: the system only knows about Device subclasses that are instantiated and passed into the registry helpers.

## Plan of Work

Create a small Device module under `src/lib/device/` with a `base` subfolder that defines the Device base class (for developers to extend in a single device file), a reverse-domain identifier type and validator, and helper functions for building WebUSB filters, matching USBDevice instances, and optionally verifying compatibility after a device is opened. Device subclasses should live directly in `src/lib/device/` as one file per device. Add a developer-facing guide in `docs/devices.md` that explains the single-file Device model and verification flow. Keep the implementation self-contained and free of UI changes; use unit tests to demonstrate that matching, verification, and filtering behave as expected. Ensure all exported functions and classes have docblocks, and use `///<` comments on fields per repository conventions. Avoid `private` fields; use `public` or `protected` where needed.

## Concrete Steps

Work in `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`.

1) Add Device types and utilities.

Create `src/lib/device/base/types.ts` with a `DeviceIdentifier` type alias, a `DeviceInit` interface, an abstract `Device` base class, and a `DeviceConstructor` interface that includes an optional static verification hook (`verifyConnectedDevice`). The base class should only hold `identifier`, `displayName`, and `usbSearch` (the fields needed for matching and filters), plus the event/config lifecycle helpers. Include a validator such as `isDeviceIdentifier` that checks reverse-domain formatting (lowercase segments separated by dots, no spaces, at least two segments). Define a `DeviceUSBSearch` shape that uses WebUSB fields (vendorId, productId, classCode, subclassCode, protocolCode, serialNumber) and optionally a `note` string for human-readable context. Add docblocks and `///<` field comments.

2) Add registry helpers for matching and filter construction.

Create `src/lib/device/base/deviceRegistry.ts` with pure functions that operate on `Device` instances:

- `buildUSBFilters(devices: Device[]): USBDeviceFilter[]` that merges and de-duplicates filters so WebUSB picker filters are minimal and stable. Filters should be derived from each Device’s USB search parameters.
- `matchUSBDevice(devices: Device[], device: USBDevice): Device | null` that returns the first matching Device or null. Define “matching” as: a device matches a Device if it matches any of the Device’s USB search entries.
- `findMatchingDevices(devices: Device[], device: USBDevice): Device[]` that returns every matching Device in input order.
- `verifyMatchingDevices(devices: Device[], device: USBDevice): Promise<Device[]>` that calls the static verification hook (if present) and filters the list to verified devices.
- `matchesUSBSearch(device: USBDevice, search: DeviceUSBSearch): boolean` as a helper that checks vendorId/productId/serialNumber and class/subclass/protocol against interface alternates, falling back to device-level class fields if needed.

Include docblocks and keep everything functional (no global state). Export these helpers from `src/lib/device/index.ts` for easy import.

3) Add tests for search and matching behavior.

Create `src/lib/device/deviceRegistry.test.ts` and cover the two user scenarios plus edge cases, instantiating simple `Device` subclasses in the tests:

- Building filters from multiple Devices yields a deduplicated list with stable ordering. Use two Devices that share a vendorId but different productId values and assert the resulting filter list length and content.
- Matching a `USBDevice` with vendorId/productId picks the correct Device.
- Matching a device based on class/subclass/protocol where vendorId/productId are missing uses interface alternates if present; if interface data is missing, the device-level class fields are used instead.
- A device with a serialNumber matches a Device that specifies that serialNumber and does not match if the serialNumber differs.
- Invalid reverse-domain identifiers are rejected by `isDeviceIdentifier`.
- When two Devices match the same USB identifiers, `verifyMatchingDevices` uses static hooks to filter compatible devices.

For USBDevice mocks, define small helper factories inside the test file that return objects typed as `USBDevice` with the minimal fields used by the matching functions. Keep tests deterministic and avoid relying on browser WebUSB availability.

4) Add tests for Device events and configuration lifecycle.

Create `src/lib/device/base/deviceBase.test.ts` to validate connect/disconnect events and that stored configuration is re-applied on connect.

5) Add documentation for Device usage.

Create `docs/devices.md` explaining the Device base class, reverse-domain identifiers, USB search entries, filter construction, matching, and the optional post-connect verification hook. Include a single-file Device example and a discovery flow snippet using `findMatchingDevices` and `verifyMatchingDevices`.

## Validation and Acceptance

Run the following commands from `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`:

- `npm run test` and expect all tests to pass. The new tests in `src/lib/device/deviceRegistry.test.ts` should fail before the implementation and pass after.

Acceptance is satisfied when unit tests show that a mock USBDevice can be matched to the correct Device, when filter construction produces stable de-duplicated filters, when post-connect verification can disambiguate devices, and when reverse-domain identifiers are validated consistently.

## Idempotence and Recovery

All steps are additive and safe to re-run. If tests fail, adjust the matching helpers or test fixtures and re-run `npm run test`. No destructive operations are required.

## Artifacts and Notes

Expected reverse-domain identifier examples:

  Valid: `com.acme.scope.model1000`
  Invalid: `Acme.scope`, `com`, `com..scope`, `com.scope `

Example matching rule summary:

  A USBDevice matches a Device when any USB search entry matches vendorId/productId/serialNumber and (if provided) class/subclass/protocol values are found on at least one interface alternate or, failing that, on the device-level class fields.

## Interfaces and Dependencies

Define these interfaces and functions:

In `src/lib/device/base/types.ts`, define:

  export type DeviceIdentifier = string

  export interface DeviceUSBSearch {
    ///< USB vendor ID.
    vendorId?: number
    ///< USB product ID.
    productId?: number
    ///< USB interface class code.
    classCode?: number
    ///< USB interface subclass code.
    subclassCode?: number
    ///< USB interface protocol code.
    protocolCode?: number
    ///< USB serial number to match.
    serialNumber?: string
    ///< Optional note for display/debugging.
    note?: string
  }

  export interface DeviceInit {
    ///< Reverse-domain identifier for the device.
    identifier: DeviceIdentifier
    ///< Human-readable device name.
    displayName: string
    ///< One or more USB search entries used for matching and filters.
    usbSearch: DeviceUSBSearch[]
  }

  /** Validate that a string is a reverse-domain identifier like com.vendor.model. */
  export const isDeviceIdentifier = (value: string): value is DeviceIdentifier => { ... }

  /** Base class for device drivers; subclasses live in one file per device. */
  export abstract class Device {
    public static readonly CONNECT_EVENT: string
    public static readonly DISCONNECT_EVENT: string
    public readonly identifier: DeviceIdentifier
    public readonly displayName: string
    public readonly usbSearch: DeviceUSBSearch[]
    public abstract loadConfig(config: unknown): Promise<void> | void
    public abstract saveConfig(): Promise<unknown> | unknown
    public setStoredConfig(config: unknown): void
    public getStoredConfig(): unknown | undefined
    public connectDevice(device: USBDevice): Promise<void>
    public disconnectDevice(): void
    protected constructor(init: DeviceInit) { ... }
  }

  /** Constructor interface with optional verification hook. */
  export interface DeviceConstructor {
    new (): Device
    verifyConnectedDevice?: (device: USBDevice) => Promise<boolean> | boolean
  }

In `src/lib/device/base/deviceRegistry.ts`, define:

  /** Build a stable, de-duplicated WebUSB filter list from Devices. */
  export const buildUSBFilters = (devices: Device[]): USBDeviceFilter[] => { ... }

  /** Match a selected USBDevice to the first compatible Device. */
  export const matchUSBDevice = (
    devices: Device[],
    device: USBDevice,
  ): Device | null => { ... }

  /** Return all Devices that match the USB identifiers. */
  export const findMatchingDevices = (
    devices: Device[],
    device: USBDevice,
  ): Device[] => { ... }

  /** Verify matching Devices using their static verification hooks. */
  export const verifyMatchingDevices = (
    devices: Device[],
    device: USBDevice,
  ): Promise<Device[]> => { ... }

  /** Check whether a USBDevice satisfies a DeviceUSBSearch entry. */
  export const matchesUSBSearch = (device: USBDevice, search: DeviceUSBSearch): boolean => { ... }

The registry helpers should only depend on WebUSB types (`USBDevice`, `USBDeviceFilter`) and the new Device types. No new third-party dependencies are required.

Change note (2026-01-29): Initial ExecPlan created for the Device abstraction and WebUSB matching/filter behavior.
Change note (2026-01-29): Clarified that interface-level class matching only applies after a device is selected; filter construction uses static search fields only.
Change note (2026-01-29): Updated progress, surprises, and outcomes after implementing the Device utilities and tests.
Change note (2026-01-29): Clarified that tests should live next to the device files they cover.
Change note (2026-01-29): Updated the plan to treat Device as a base class and align examples and interfaces accordingly.
Change note (2026-01-29): Added optional post-connect verification support for Device drivers.
Change note (2026-01-29): Added documentation requirements and recorded the docs update for Device usage.
Change note (2026-01-29): Moved base Device code into `src/lib/device/base` and updated paths.
Change note (2026-01-29): Added Device event lifecycle and configuration requirements.
