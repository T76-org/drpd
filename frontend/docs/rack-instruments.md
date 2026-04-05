# Rack and Instruments

This document explains how the Rack and Instrument system works in this repo and how to build a new Instrument implementation. It is written for an agent or developer who has no prior context.

## Overview

A Rack is the top-level spatial container. It owns instrument rows only. Paired devices are stored globally at the document level and are not bound to a specific rack or instrument instance. Instruments declare which Device identifiers they support, and any compatible instrument automatically talks to the single active connected device when one exists.

The Rack JSON is the source of truth for layout, paired devices, and instrument persistence. It is stored in localStorage so users can add devices and instruments during runtime and have those changes persist between sessions.

## Key files

- `src/lib/rack/types.ts`: Rack data model (paired devices, rows, instruments).
- `src/lib/rack/loadRack.ts`: localStorage load/save of Rack JSON.
- `src/lib/device/base/types.ts`: Device base class and identifiers.
- `src/lib/instrument/types.ts`: Instrument base class and identifiers.
- `src/features/rack/RackView.tsx`: UI that loads the Rack, manages devices, and adds instruments.
- `src/features/rack/RackRenderer.tsx`: rack canvas scaling and layout.
- `src/features/rack/RowRenderer.tsx`: per-row layout and instrument rendering.
- `src/features/rack/instrumentCatalog.ts`: supported instrument definitions (registry).
- `src/features/rack/instruments/*.tsx`: concrete instrument views.

## Rack JSON shape

The Rack document is stored in localStorage under `drpd:rack:document` via `loadRackDocument` and `saveRackDocument`. The stored document has a document-level `pairedDevices` array plus a `racks` array; the UI currently uses the first rack entry. A Rack entry includes:

- `id`: stable rack id.
- `name`: displayed in the header.
- `hideHeader`: optional, hides the header when true.
- `totalUnits`: vertical height in units (1 unit = 100 px).
- Horizontal width units are derived by instrument definitions (1 width unit = 20 px).
- `rows`: list of rows, each row holding instruments.

Each row contains `instruments`, which store an `instrumentIdentifier` plus instance-specific fields (`fullScreen`, `resizable`). Horizontal width is defined by the Instrument definition, not the rack JSON. If any instrument has `fullScreen: true`, the rack renderer shows a full-screen overlay instead of the row layout.

## How compatibility works

Each Instrument definition exposes:

- `identifier`: reverse-domain identifier (unique).
- `supportedDeviceIdentifiers`: list of Device identifiers it supports.
- `defaultWidth`: either fixed width (`{ mode: 'fixed', units: <n> }`) or flex width (`{ mode: 'flex' }`).
- `defaultUnits`: default height in units.

Rows use a maximum width budget (`MAX_ROW_WIDTH_UNITS`, currently 60). Fixed-width instruments consume their configured width first. Flex-width instruments split any remaining space equally. If a row has no remaining width, flex instruments cannot be inserted into that row.

The Rack UI exposes the supported instrument catalog independently of paired-device state. When a compatible paired device is connected, matching instruments receive that active device runtime. Otherwise they render in an unassigned or disconnected state.

## How device binding works

Instrument instances are not bound to a specific paired device. The row renderer resolves the single active connected paired device at render time and passes that record and runtime state down to compatible instrument views.

In practice:

- Rack JSON stores paired devices at the document level and instrument instances remain device-agnostic.
- `RowRenderer` resolves the active compatible `RackDeviceRecord` and `RackDeviceState` from the current global connection state.
- Instrument views receive those values as props so they can talk to (or display info about) the bound device.

## Adding a new Instrument

Follow these steps to add a new Instrument implementation:

1) Create a new Instrument definition class.

Create a new file in `src/features/rack/instrumentCatalog.ts` or a new module in the same folder. Extend `Instrument` and provide the required metadata:

    import { Instrument } from '../../lib/instrument'

    export class AcmeScopeInstrument extends Instrument {
      public constructor() {
        super({
          identifier: 'com.acme.scope.instrument',
          displayName: 'Acme Scope',
          supportedDeviceIdentifiers: ['com.acme.scope.model1000'],
          defaultWidth: { mode: 'fixed', units: 4 },
          defaultUnits: 3
        })
      }
    }

Then register it in `getSupportedInstruments()`.

2) Add a UI component for the instrument.

Create a UI file under `src/features/rack/instruments/`, for example `AcmeScopeInstrumentView.tsx`. Render inside `InstrumentBase` and show any content you want. The view receives the allocated pixel size and units, so you can show a readout or use it for layout.

Follow the standard instrument view pattern:

    import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
    import { InstrumentBase } from '../InstrumentBase'
    import type { RackDeviceState } from '../RackRenderer'

    export const AcmeScopeInstrumentView = ({
      instrument,
      displayName,
      deviceRecord,
      deviceState,
      allocatedWidthPx,
      allocatedHeightPx,
      allocatedWidthUnits,
      allocatedHeightUnits
    }: {
      instrument: RackInstrument
      displayName: string
      deviceRecord?: RackDeviceRecord
      deviceState?: RackDeviceState
      allocatedWidthPx: number
      allocatedHeightPx: number
      allocatedWidthUnits: number
      allocatedHeightUnits: number
    }) => {
      return (
        <InstrumentBase instrument={instrument} displayName={displayName}>
          <div>Device: {deviceRecord?.displayName ?? 'Unassigned'}</div>
          <div>Status: {deviceState?.status ?? 'Unknown'}</div>
          <div>Width: {allocatedWidthPx}px</div>
          <div>Height: {allocatedHeightPx}px</div>
          <div>Units: {allocatedWidthUnits}w × {allocatedHeightUnits}h</div>
        </InstrumentBase>
      )
    }

3) Wire the instrument view into the row renderer.

Update `src/features/rack/RowRenderer.tsx` to render your new view when the instrument identifier matches.

4) Test compatibility filtering.

Update `src/features/rack/__tests__/RackView.test.tsx` to assert that your instrument appears in the Add Instrument list when the rack includes a compatible device identifier, and that adding it appends a new row.

## Adding instruments in the UI

The Rack header includes an Add Instrument button that appears only when:

- A rack is active
- The header is not hidden
- The rack has at least one device

When the user selects an instrument, a new row is appended to the Rack and saved to localStorage.

## Edit mode workflow

The Rack header includes an Edit button. When Edit mode is enabled:

- Every instrument shows a close (X) button in its title bar.
- Instruments gain a softly pulsing glow and a muted/blurred content area to indicate they are draggable.
- Instruments can be dragged between rows. The layout updates live during drag.
- Drop targets appear between rows (including before the first and after the last row). Dropping there creates a new row that contains the dragged instrument.
- Dropping onto an existing row inserts at the pointer position when the row stays within max width.
- Adjacent instrument borders collapse so only a single border is visible between neighbors.

Edit mode is transactional: Cancel discards all layout edits made during the session, while Save persists the updated rack JSON to localStorage.

## Troubleshooting

- If an instrument does not appear in the Add Instrument list, check that its `supportedDeviceIdentifiers` includes a device identifier present in the rack’s `devices` list.
- If changes do not persist, ensure `saveRackDocument` is called after modifications.
- If the UI shows “No compatible instruments,” confirm that at least one device has been added to the rack.

## Header popup typography

Header button popovers (for example `CONFIGURE`, `RESET`, `SET PDO`, and log popups) must use the shared typography tokens defined in `src/index.css`:

- `--font-size-header-popup-base`
- `--font-size-header-popup-text`
- `--font-size-header-popup-label`
- `--font-size-header-popup-input`
- `--font-size-header-popup-hint`
- `--font-size-header-popup-button`

Use these tokens in instrument CSS modules instead of hardcoded `rem` values so popup typography remains consistent and centrally configurable.
