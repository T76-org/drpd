# Devices: how to describe and match physical instruments

This document explains how to add a new Device definition and how Device helpers are used to connect real USB instruments. It is written for someone implementing a specific device (or supporting functionality) without prior knowledge of this repo.

## What a Device is

From the system’s point of view, a Device is a lightweight description of a physical instrument connection. From a developer’s point of view, a Device is a base class you extend to build device-specific behavior in a single module (file and optional folder). That module can include SCPI helpers or other logic, but the base class itself only contains the fields the system needs to find and identify device drivers (identifier, display name, USB search filters). Device subclasses can optionally add a static verification hook that runs after the system opens a device to confirm compatibility.

1) "Given a USB device the user picked, which Device definition matches it?"
2) "Given a list of Device definitions we support, what WebUSB filters should we pass to the picker?"

The Device layer exists so Instruments can advertise compatibility by referencing a stable reverse-domain identifier (for example, `com.acme.scope.model1000`).

## Where the code lives

- Device types: `src/lib/device/base/types.ts`
- Device matching/filter helpers: `src/lib/device/base/deviceRegistry.ts`
- Exports: `src/lib/device/index.ts` (re-exports `src/lib/device/base`)
- Tests (keep next to source): `src/lib/device/deviceRegistry.test.ts`, `src/lib/device/base/deviceBase.test.ts`
- Device subclasses: `src/lib/device/*.ts` and any per-device folders under `src/lib/device/`

## How device discovery works

There is no automatic discovery mechanism. The system only knows about Device subclasses that you explicitly instantiate and pass into the registry helpers. A typical flow is:

- Import your Device subclasses from `src/lib/device/`.
- Build a list such as `const devices = [new AcmeScope1000(), new RigolDmm3058()]`.
- Pass that list into `buildUSBFilters`, `findMatchingDevices`, and `verifyMatchingDevices`.

This keeps Device implementations self-contained and makes discovery explicit and predictable.

## Events: connect and disconnect

Device subclasses are event emitters (via `EventTarget`). Every Device should emit an event when the underlying `USBDevice` connects and disconnects:

- `Device.CONNECT_EVENT` (`deviceconnect`) when a device is connected.
- `Device.DISCONNECT_EVENT` (`devicedisconnect`) when a device is disconnected.

Use `device.connectDevice(usbDevice)` and `device.disconnectDevice()` to trigger these events. The system should call these when a USB device is opened or closed.

## Configuration lifecycle

Every Device subclass must implement:

- `loadConfig(config: unknown): Promise<void> | void`
- `saveConfig(): Promise<unknown> | unknown`

When the underlying `USBDevice` connects, the driver should automatically reapply its configuration. The base class does this by calling `loadConfig` with the last stored configuration when `connectDevice` runs.

To make that work, store the configuration after load/save using `setStoredConfig` (or store the result of `saveConfig`) so it can be re-applied on reconnect. `getStoredConfig()` lets you retrieve the cached value when saving or debugging.

## Key concepts

### Reverse-domain identifiers

Every Device definition must have a reverse-domain identifier. This is a lowercase, dot-separated string with at least two segments. Segments may include digits and internal hyphens (but must start/end with a letter or number). Examples:

- Valid: `com.acme.scope.model1000`, `com.acme.scope-1000`
- Invalid: `Acme.scope` (uppercase), `com` (single segment), `com..scope` (empty segment), `com.scope ` (trailing space)

The helper `isDeviceIdentifier` validates these rules.

### USB search entries

A Device definition includes one or more USB search entries (`usbSearch`). Each entry describes a set of USB fields used for matching and filter construction. The fields map directly to WebUSB filter fields:

- `vendorId`, `productId`
- `classCode`, `subclassCode`, `protocolCode`
- `serialNumber` (optional)

Entries can also include a `note` field for debugging/telemetry, which is ignored for matching and filter construction.

A Device matches if any entry in `usbSearch` matches the selected USB device.

## How matching works

Matching happens after the user has selected a device from the WebUSB picker. The helper `findMatchingDevices` checks each Device and returns all matches (keeping input order). `matchUSBDevice` returns the first match when you only need a single device.

The matching rules are:

- `vendorId` / `productId` must match when provided.
- If a `serialNumber` is provided, it must match exactly.
- If class codes are provided, the helper checks interface alternates first (when available) and falls back to device-level class fields if interfaces are missing.

This is important because many real instruments report class codes at the interface level, while test mocks often only provide device-level fields.

## Post-connect verification

After the system opens a device, it can call an optional static hook on each matching Device class to verify compatibility. This helps in situations where multiple devices share the same USB identifiers. The helper `verifyMatchingDevices` takes the matching Device instances and filters them based on the static hook:

- If a Device class does not define `verifyConnectedDevice`, it is treated as compatible.
- If it does, the method should return true/false (or a Promise) to indicate compatibility.

## How filter construction works

Filters are built before the WebUSB picker opens. Because there is no device instance yet, filters come directly from the static `usbSearch` fields in each Device definition. The helper `buildUSBFilters`:

- Converts each `usbSearch` entry into a `USBDeviceFilter`.
- Removes empty entries that have no filter fields.
- De-duplicates filters and returns them in a stable order.

## Example: defining a Device

Add a Device definition in whatever module will own the list of supported devices:

```ts
import { Device } from '../lib/device'

export class AcmeScope1000 extends Device {
  public static verifyConnectedDevice = async (device: USBDevice) => {
    // Optional: open transport + query *IDN? when available.
    return device.productId === 0x5678
  }

  public constructor() {
    super({
      identifier: 'com.acme.scope.model1000',
      displayName: 'Acme Scope 1000',
      usbSearch: [
        { vendorId: 0x1234, productId: 0x5678 },
        { vendorId: 0x1234, classCode: 0xfe, subclassCode: 0x03, protocolCode: 0x01 },
      ],
    })
  }

  public async loadConfig(config: unknown): Promise<void> {
    // Apply configuration to the device.
    this.setStoredConfig(config)
  }

  public async saveConfig(): Promise<unknown> {
    const config = { example: true }
    this.setStoredConfig(config)
    return config
  }
}

export const myDevices = [new AcmeScope1000()]
```

In this example:

- The first entry matches by vendor/product ID.
- The second entry matches by class/subclass/protocol (useful when the product ID varies across revisions).

## Example: building WebUSB filters for the picker

```ts
import { buildUSBFilters } from '../lib/device'
import { myDevices } from './myDevices'

const filters = buildUSBFilters(myDevices)
const device = await navigator.usb.requestDevice({ filters })
```

## Example: matching a selected device

```ts
import { findMatchingDevices, matchUSBDevice, verifyMatchingDevices } from '../lib/device'
import { myDevices } from './myDevices'

const selected = await navigator.usb.requestDevice({ filters: buildUSBFilters(myDevices) })
const matches = findMatchingDevices(myDevices, selected)
const verified = await verifyMatchingDevices(matches, selected)
const deviceDefinition = verified[0] ?? matchUSBDevice(myDevices, selected)

if (!deviceDefinition) {
  throw new Error('Unsupported device')
}

// Use deviceDefinition.identifier to pick an Instrument implementation.
```

## Guidance for adding a new device

- Start by finding the device’s `vendorId` and `productId` (USB descriptors or WebUSB inspection).
- If the device uses USBTMC, consider adding a class/subclass/protocol entry as a secondary search to support variants.
- Include `serialNumber` only when you truly want to target a specific unit.
- Keep `usbSearch` entries minimal. Each entry should represent one matching strategy.
- Keep the device definition and any helpers in a single module (file and optional folder) under `src/lib/device/`.
- Add or update tests near the code you touched in `src/lib/device`.

## Testing expectations

Tests live next to the code they cover. When you change device matching or filter logic, update `src/lib/device/deviceRegistry.test.ts` and run:

- `npm run test`

The tests should fail before your change and pass after.
