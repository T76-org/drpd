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
- `totalUnits`: legacy vertical height hint retained for older saved documents.
- `rows`: list of rows, each row holding instruments.

Each row can store `flex`. Each instrument stores an `instrumentIdentifier` plus instance-specific fields (`flex`, `fullScreen`, `resizable`, `config`). `flex` is a relative CSS flex weight. If a saved document omits it, `RowRenderer` falls back to the instrument definition default.

The default document built by `loadRackDocument` is a populated Dr. PD rack: status/control instruments on the first row, a full-width timestrip shell on the second row, and log/detail instruments on the third row. IDs are stable for persistence, but the important contract is the layout and instrument identifiers.

If any instrument has `fullScreen: true`, the rack renderer shows a full-screen overlay instead of the row layout.

## How compatibility works

Each Instrument definition exposes:

- `identifier`: reverse-domain identifier (unique).
- `supportedDeviceIdentifiers`: list of Device identifiers it supports.
- `defaultFlex`: default CSS flex weight when an instance has no saved flex.
- `minWidth` and `minHeight`: CSS length clamps for user resizing.
- `defaultWidth`, `defaultUnits`, and `defaultHeightMode`: legacy unit fields retained for older helpers and tests.

Rows no longer use a grid or maximum unit budget. The rack canvas fills the available window. Rows flex vertically and instruments flex horizontally from CSS flex weights.

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
          defaultUnits: 3,
          defaultFlex: 4,
          minWidth: '14rem',
          minHeight: '10rem'
        })
      }
    }

Then register it in `getSupportedInstruments()`.

2) Add a UI component for the instrument.

Create a UI file under `src/features/rack/instruments/`, for example `AcmeScopeInstrumentView.tsx`. Render inside `InstrumentBase` and show any content you want. Size is controlled by the rack slot around the component, so the view should fill its parent and respond to available space with CSS.

Follow the standard instrument view pattern:

    import type { RackDeviceRecord, RackInstrument } from '../../../lib/rack/types'
    import { InstrumentBase } from '../InstrumentBase'
    import type { RackDeviceState } from '../RackRenderer'

    export const AcmeScopeInstrumentView = ({
      instrument,
      displayName,
      deviceRecord,
      deviceState,
    }: {
      instrument: RackInstrument
      displayName: string
      deviceRecord?: RackDeviceRecord
      deviceState?: RackDeviceState
    }) => {
      return (
        <InstrumentBase instrument={instrument} displayName={displayName}>
          <div>Device: {deviceRecord?.displayName ?? 'Unassigned'}</div>
          <div>Status: {deviceState?.status ?? 'Unknown'}</div>
        </InstrumentBase>
      )
    }

3) Wire the instrument view into the row renderer.

Update `src/features/rack/RowRenderer.tsx` to render your new view when the instrument identifier matches.

4) Test compatibility filtering.

Update tests to assert that your instrument can be rendered in a rack row and that its flex/min-size values are honored by resize behavior.

## Adding instruments in the UI

Instrument instances are added by inserting a `RackInstrument` in a row and saving the rack document. New instances should start with the catalog `defaultFlex`.

- A rack is active
- The header is not hidden
- The rack has at least one device

When the document changes, `saveRackDocument` persists the new layout to localStorage.

## Edit mode workflow

The Rack header includes an Edit button. When Edit mode is enabled:

- Every instrument shows a close (X) button in its title bar.
- Instruments gain a softly pulsing glow and a muted/blurred content area to indicate they are draggable.
- Instruments can be dragged between rows. The layout updates live during drag.
- Drop targets appear between rows (including before the first and after the last row). Dropping there creates a new row that contains the dragged instrument.
- Dropping onto an existing row inserts at the pointer position.
- Adjacent instrument borders collapse so only a single border is visible between neighbors.

Edit mode is transactional: Cancel discards all layout edits made during the session, while Save persists the updated rack JSON to localStorage.

## Resizing

Instruments are always resizable, including outside edit mode. The space between adjacent instruments is a vertical splitter. Dragging it changes the neighboring flex weights. The space between rows is a horizontal splitter with the same behavior for row flex weights.

Resize operations respect the instrument definition's `minWidth` and `minHeight`, or an instance-level `resizable.minWidth` / `resizable.minHeight` override.

## Troubleshooting

- If an instrument does not bind to a device, check that its `supportedDeviceIdentifiers` includes the active paired device identifier.
- If changes do not persist, ensure `saveRackDocument` is called after modifications.
- If resizing stops before the pointer stops moving, check `minWidth` and `minHeight` on the instrument definition or persisted instance.

## Header popup typography

Header button popovers (for example `CONFIGURE`, `RESET`, `SET PDO`, and log popups) must use the shared typography tokens defined in `src/index.css`:

- `--font-size-header-popup-base`
- `--font-size-header-popup-text`
- `--font-size-header-popup-label`
- `--font-size-header-popup-input`
- `--font-size-header-popup-hint`
- `--font-size-header-popup-button`

Use these tokens in instrument CSS modules instead of hardcoded `rem` values so popup typography remains consistent and centrally configurable.
