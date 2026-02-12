# Scaffold virtual rack UI

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `PLANS.md` at the repo root, and this ExecPlan must be maintained in accordance with `/PLANS.md`.

## Purpose / Big Picture

The goal is to give users a working, visual "virtual rack" UI they can open in the browser and see a rack made of rows of instruments, including full-width and half-width layouts and instruments that are different heights. After this change, a user can start the dev server, load the sample rack JSON, and see a rack layout rendered with rows, unit-based heights, and bottom-aligned instruments with empty space above shorter instruments when paired with taller ones. This scaffolding intentionally does not talk to real instruments; it only establishes the UI structure for future features, including a base instrument component that can be extended, a rack with a configurable unit height, and support for full-screen and resizable instrument modes.

## Progress

- [x] (2026-01-28 18:00Z) Capture requirements and outline an ExecPlan for the virtual rack UI scaffold.
- [x] (2026-01-28 18:15Z) Update plan to include full-screen, resizable instruments, rack height configuration, and 16:9 scaling requirements.
- [x] (2026-01-29 07:45Z) Implement rack data types, loader, and sample JSON.
- [x] (2026-01-29 07:55Z) Implement rack rendering components and CSS modules, including base instrument component.
- [x] (2026-01-29 08:05Z) Replace the current App UI with the rack view and update the entrypoint as needed.
- [x] (2026-01-29 08:15Z) Add tests for rack layout rendering, base instrument component, loader behavior, theme toggle, and header visibility.
- [x] (2026-01-29 08:20Z) Validate by running `npm run test` and manual dev server checks.

## Surprises & Discoveries

- Observation: JSDOM in Vitest did not provide a functional `localStorage` implementation.
  Evidence: Test failure when persisting theme; resolved by guarding storage access in `src/features/rack/RackView.tsx`.

## Decision Log

- Decision: Store sample rack data as a JSON file in `public/racks/sample-rack.json` and load it with `fetch` from the UI.
  Rationale: Vite serves `public/` as static assets, which keeps the JSON editable by non-developers and mirrors how future rack files might be delivered.
  Date/Author: 2026-01-28 / Codex

- Decision: Use CSS Modules for the virtual rack layout styles.
  Rationale: The repository guidance explicitly prefers CSS Modules or styled-components, and CSS Modules fit well with Vite and keep styling scoped.
  Date/Author: 2026-01-28 / Codex

- Decision: Define "row height" as the maximum unit height among instruments in a row, and align instruments to the bottom using CSS.
  Rationale: This matches the requirement for mixed-height side-by-side instruments with empty space above the shorter one.
  Date/Author: 2026-01-28 / Codex

- Decision: Treat the rack as a 16:9 canvas and scale its contents with CSS transforms to maintain relative sizing on resize.
  Rationale: The requirement says contents scale together to preserve relative sizes, and CSS transforms provide a simple scaffold before adding interactive resizing.
  Date/Author: 2026-01-28 / Codex

- Decision: Scale the rack to the viewport width and allow vertical scrolling rather than centering to fit both axes.
  Rationale: The UI should fill the window width and scroll down if needed to preserve the 16:9 rack aspect ratio.
  Date/Author: 2026-01-29 / Codex

- Decision: Add theme variables and a header toggle for light/dark/system, with persistence to localStorage when available.
  Rationale: The UI must support light/dark/system modes and provide an in-app control in the rack header.
  Date/Author: 2026-01-29 / Codex

- Decision: Remove empty rows and zero inset between instruments/rows.
  Rationale: The requirement states there should be no empty rows and no gaps between instruments.
  Date/Author: 2026-01-29 / Codex

## Outcomes & Retrospective

Implemented the rack UI scaffold with configurable rack height, full/half layouts, concrete instrument components, and 16:9 scaling. Added theme toggling (light/dark/system) with persistence, removed empty rows and all inter-row/instrument inset, and added a JSON setting to hide the header. Tests cover rack rendering, row sizing, size readouts, full-screen overlay behavior, theme toggling, and header visibility.

## Context and Orientation

The project is a Vite + React + TypeScript app. The entrypoint is `src/main.tsx` and the current root component is `src/App.tsx`. The codebase already uses Vite, React, and TypeScript, with testing via Vitest and React Testing Library. There is no existing rack UI; the current `src/App.tsx` is a USBTMC demo. This plan will replace that demo UI with a virtual rack view.

Definitions used in this plan:

A Rack is a collection of rows that represent a spatial arrangement for instruments. A Row is a horizontal band within a Rack. An Instrument is a visual block inside a row. A Unit is a vertical height measure equal to 100 pixels. A Layout is either "full" (instrument spans entire rack width) or "half" (two instruments can be side-by-side, each taking half width). A Full-screen instrument is a special layout that temporarily occupies the entire rack canvas. A Resizable instrument declares a minimum unit height and can be resized up to the full rack height (this plan only scaffolds the model and UI, not the interaction).

## Plan of Work

Create TypeScript types to represent racks, rows, and instruments, including a base instrument model that can be extended later. Add rack-level configuration for total units, optional header visibility, and a fixed 16:9 aspect ratio. Provide a loader that reads the sample JSON and returns typed data. Define a view component that renders a rack, with each row computing its height as the tallest instrument in the row. Use CSS Modules to ensure rows align instruments to the bottom and to handle full-width versus half-width rendering with no gaps between instruments or rows. Add a base instrument component that renders instrument chrome and can be reused for future instrument-specific UIs, plus a couple concrete instrument implementations that display their allocated width and height to prove size awareness horizontally and vertically. Use a scaling container that preserves a 16:9 rack aspect ratio and scales contents on resize, filling the viewport width and allowing vertical scrolling when needed. Replace the current App content with the rack UI, including a theme toggle (light/dark/system) in the header. Add tests that render the rack and assert that full-width instruments span the row, half-width instruments appear side by side, that row heights reflect the max unit height, that rack height configuration is represented in the model and view, that the header can be hidden via JSON, and that concrete instrument components show their size.

## Concrete Steps

Work in `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`.

1) Add rack data types and loader.

- Create `src/lib/rack/types.ts` with exported TypeScript types and interfaces. Include docblocks for every exported type and function per the repo instructions, and use `///<` comments for key fields. Add rack-level configuration for total units and a fixed 16:9 aspect ratio. Add fields on instruments for `fullScreen` and `resizable` behavior (including a minimum unit height), plus an instrument `kind` field to select a concrete instrument component.
- Add a rack-level `hideHeader` flag for optionally hiding the header.
- Create `src/lib/rack/loadRack.ts` with a function that fetches `/racks/sample-rack.json` and returns a typed rack. The function should be async and use `fetch` and `await`.

2) Add sample rack JSON in the public folder.

- Create `public/racks/sample-rack.json` with a single rack and multiple rows. Include both full and half layouts, and include at least one row where two half instruments have different heights. Include rack-level `totalUnits` and `hideHeader` to demonstrate configurable rack height and header visibility, and include instruments that declare `fullScreen` and `resizable` (with a minimum unit height). Use the following structure (the exact values can vary, but keep the shape and demonstrate the requirements):

    {
      "racks": [
        {
          "id": "bench-rack-a",
          "name": "Bench Rack A",
          "hideHeader": false,
          "totalUnits": 9,
          "rows": [
            {
              "id": "row-1",
              "instruments": [
                {
                  "id": "psu-1",
                  "name": "Power Supply",
                  "kind": "powerSupply",
                  "units": 2,
                  "layout": "full",
                  "resizable": {
                    "minUnits": 2
                  }
                }
              ]
            },
            {
              "id": "row-2",
              "instruments": [
                {
                  "id": "scope-1",
                  "name": "Oscilloscope",
                  "kind": "oscilloscope",
                  "units": 3,
                  "layout": "half",
                  "slot": "left",
                  "resizable": {
                    "minUnits": 2
                  }
                },
                {
                  "id": "dmm-1",
                  "name": "Multimeter",
                  "kind": "multimeter",
                  "units": 1,
                  "layout": "half",
                  "slot": "right"
                }
              ]
            },
            {
              "id": "row-3",
              "instruments": [
                {
                  "id": "analyzer-1",
                  "name": "Protocol Analyzer",
                  "kind": "protocolAnalyzer",
                  "units": 4,
                  "layout": "half",
                  "slot": "left",
                  "fullScreen": false
                },
                {
                  "id": "siggen-1",
                  "name": "Signal Generator",
                  "kind": "signalGenerator",
                  "units": 4,
                  "layout": "half",
                  "slot": "right",
                  "fullScreen": false
                }
              ]
            }
          ]
        }
      ]
    }

3) Implement rack rendering components and CSS Modules.

- Create `src/features/rack/RackView.tsx` as the top-level view. It should load the rack JSON on mount, store it in state, and render a loader or error message as needed. Include a visible rack title.
- Create `src/features/rack/RackRenderer.tsx`, `src/features/rack/RowRenderer.tsx`, and `src/features/rack/InstrumentBase.tsx` to keep components small. Use functional components with hooks and named exports. `InstrumentBase` is the base component used by all instruments; for now it renders a frame, a header with name, and a content placeholder, and accepts optional children so future instrument UIs can plug in custom content.
- Create `src/features/rack/instruments/PowerSupplyInstrument.tsx` and `src/features/rack/instruments/OscilloscopeInstrument.tsx` as concrete instrument implementations. Each should render inside `InstrumentBase` and display a size readout (allocated width and height in pixels and units) to show horizontal and vertical awareness. Use props passed from `RowRenderer` to determine the allocated size rather than measuring the DOM for now.
- Update `RowRenderer` to compute each instrument's allocated width and height (both in pixels and in units) based on rack width, layout, and unit height, and pass those values to the concrete instrument components.
- Add `src/features/rack/RackView.module.css`, `src/features/rack/RackRenderer.module.css`, `src/features/rack/RowRenderer.module.css`, and `src/features/rack/InstrumentBase.module.css` for scoped styles.
- Use CSS to set each row height based on the maximum unit height. This can be done by computing a `rowHeightPx` value in the row renderer and applying it as an inline style. Each instrument should have a height of `units * 100` pixels. Use flexbox to align instruments to the bottom of the row and leave empty space above shorter ones.
- Implement rack scaling: wrap the rack content in a container that preserves a 16:9 rack canvas and scales it to fill the viewport width, allowing vertical scrolling when needed. Use a CSS transform scale to ensure that all rack contents scale together when the rack container resizes.
- Render layout logic:
  - If an instrument has `layout: "full"`, it spans the entire width of the row.
  - If two instruments have `layout: "half"`, render them side-by-side with equal width. Use a `slot` value of `left` or `right` to keep ordering stable.
  - Use the instrument `kind` to select a concrete instrument component where available (for example, `powerSupply` uses `PowerSupplyInstrument`, `oscilloscope` uses `OscilloscopeInstrument`), and fall back to a generic `InstrumentBase` when no specific component exists.
  - If an instrument declares `fullScreen: true`, render it in a dedicated full-screen overlay area that covers the entire rack canvas and hides the row layout beneath (a single instrument at a time). For now, determine the full-screen instrument from the rack data and render it; do not provide a UI to toggle it.
  - Rows always contain instruments; do not render placeholder empty rows.

4) Replace the current App UI.

- Update `src/App.tsx` to render `RackView` instead of the USBTMC demo. Move or delete the USBTMC demo UI from App, but do not remove the USBTMC code from the repository unless explicitly required.
- Update or add `src/App.module.css` if needed to provide overall page styling and spacing for the rack view. If you add styles, keep them scoped via CSS Modules.

5) Add tests.

- Create `src/features/rack/__tests__/RackView.test.tsx`.
- Use React Testing Library to render the view, mock `fetch` to return the sample JSON, and assert that the rack name appears and that rows render with the expected number of instruments.
- Add a test that verifies row height calculations by checking inline styles for a row containing two different unit heights.
- Add a test that asserts the rack total units value is surfaced in the UI (for example, data attribute or visible label) to demonstrate that rack height is configurable in code even if not interactive yet.
- Add a test that asserts the base instrument component renders a header with the instrument name.
- Add a test that mocks a rack with `fullScreen: true` and asserts that the full-screen overlay renders and the row layout is hidden or visually obscured (for example, by presence of a full-screen container element).
- Add a test that asserts a concrete instrument implementation renders its size readout (for example, checking for width and height values rendered in the power supply or oscilloscope components).
- Add a test that hides the header via `hideHeader: true` in the rack JSON and asserts that the header title is absent.
- Update `src/setupTests.ts` or test configuration only if needed. Keep tests deterministic and not reliant on network.

## Validation and Acceptance

Run the following commands from `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`:

- `npm run dev` and open the browser at the Vite dev server URL. You should see "Bench Rack A" and a multi-row rack layout (unless a `fullScreen` instrument is declared, in which case the full-screen instrument overlay should be visible). The row with the oscilloscope and multimeter should show the multimeter aligned to the bottom with empty space above it. The full-width power supply should span the entire row width.
- Use the header theme button to cycle System → Light → Dark and confirm the UI colors update.
- `npm run test` should pass. The new tests in `RackView.test.tsx` should fail before the changes and pass after.

Acceptance is satisfied when the UI renders at least one rack from the JSON file, shows full and half layouts correctly, demonstrates mixed-height alignment within a row, scales the rack contents to fill the viewport width with vertical scrolling, displays size readouts in the concrete instrument components, supports header hiding via JSON, and provides a working theme toggle (system/light/dark).

## Idempotence and Recovery

All steps are additive and safe to re-run. If a file is created with the wrong content, edit it in place and re-run tests. No destructive operations are required. If a test fails due to stale mocks, clear and re-run with `npm run test`.

## Artifacts and Notes

Expected minimal JSON structure in `public/racks/sample-rack.json`:

    { "racks": [ { "id": "bench-rack-a", "name": "Bench Rack A", "hideHeader": false, "totalUnits": 9, "rows": [ ... ] } ] }

Expected row height calculation in `RowRenderer`:

    const maxUnits = Math.max(1, ...row.instruments.map((instrument) => instrument.units))
    const rowHeightPx = maxUnits * 100

## Interfaces and Dependencies

Create the following interfaces in `src/lib/rack/types.ts`:

    export type InstrumentLayout = 'full' | 'half'

    export type InstrumentSlot = 'left' | 'right'

    export type InstrumentKind =
      | 'powerSupply'
      | 'oscilloscope'
      | 'multimeter'
      | 'protocolAnalyzer'
      | 'signalGenerator'

    export interface InstrumentResizableConfig {
      ///< Minimum height in units when resizing is allowed.
      minUnits: number
    }

    export interface RackInstrument {
      ///< Stable identifier for rendering and tracking.
      id: string
      ///< Display name for UI.
      name: string
      ///< Concrete instrument type identifier.
      kind: InstrumentKind
      ///< Height in units (1 unit = 100 px).
      units: number
      ///< Horizontal layout mode.
      layout: InstrumentLayout
      ///< Half-layout slot when layout is "half".
      slot?: InstrumentSlot
      ///< Render this instrument as a full-screen overlay when true.
      fullScreen?: boolean
      ///< Resizable configuration for future UI.
      resizable?: InstrumentResizableConfig
    }

    export interface RackRow {
      ///< Stable identifier for the row.
      id: string
      ///< Instruments in this row.
      instruments: RackInstrument[]
    }

    export interface RackDefinition {
      ///< Stable identifier for the rack.
      id: string
      ///< Display name for the rack.
      name: string
      ///< Toggle to hide the header for this rack.
      hideHeader?: boolean
      ///< Total vertical units available in the rack.
      totalUnits: number
      ///< Rows in the rack.
      rows: RackRow[]
    }

    export interface RackDocument {
      ///< Full document of racks.
      racks: RackDefinition[]
    }

In `src/lib/rack/loadRack.ts`, define:

    /** Load the rack document from the public rack JSON file. */
    export const loadRackDocument = async (): Promise<RackDocument> => {
      // fetch and validate shape lightly, then return
    }

In `src/features/rack/RackView.tsx`, define:

    /** Render the rack view with rack selection and layout rendering. */
    export const RackView = () => { ... }

In `src/features/rack/RackRenderer.tsx`, define:

    /** Render a single rack definition as a column of rows. */
    export const RackRenderer = ({ rack }: { rack: RackDefinition }) => { ... }

In `src/features/rack/RowRenderer.tsx`, define:

    /** Render a row with full or half layout instruments aligned to the bottom. */
    export const RowRenderer = ({ row }: { row: RackRow }) => { ... }

In `src/features/rack/InstrumentBase.tsx`, define:

    /** Base instrument frame used by all instrument UIs. */
    export const InstrumentBase = ({
      instrument,
      children
    }: {
      instrument: RackInstrument
      children?: React.ReactNode
    }) => { ... }

Use `fetch` (built into browsers) to load the JSON, React for UI, and CSS Modules for styling. No additional dependencies are required.

In `src/features/rack/instruments/PowerSupplyInstrument.tsx`, define:

    /** Power supply instrument UI that renders a size readout. */
    export const PowerSupplyInstrument = ({
      instrument,
      allocatedWidthPx,
      allocatedHeightPx,
      allocatedWidthUnits,
      allocatedHeightUnits
    }: {
      instrument: RackInstrument
      allocatedWidthPx: number
      allocatedHeightPx: number
      allocatedWidthUnits: number
      allocatedHeightUnits: number
    }) => { ... }

In `src/features/rack/instruments/OscilloscopeInstrument.tsx`, define:

    /** Oscilloscope instrument UI that renders a size readout. */
    export const OscilloscopeInstrument = ({
      instrument,
      allocatedWidthPx,
      allocatedHeightPx,
      allocatedWidthUnits,
      allocatedHeightUnits
    }: {
      instrument: RackInstrument
      allocatedWidthPx: number
      allocatedHeightPx: number
      allocatedWidthUnits: number
      allocatedHeightUnits: number
    }) => { ... }

Note: This ExecPlan was created to direct implementation of the virtual rack UI scaffold based on the user request on 2026-01-28, and it defines the initial structure and acceptance criteria.

Change note (2026-01-28): Updated the ExecPlan to add base instrument extensibility, full-screen and resizable instrument support, configurable rack height, and 16:9 scaling requirements per the latest user request.
Change note (2026-01-28): Updated the ExecPlan to rename the feature paths to `rack` (removing the `virtualRack` naming) and to add concrete instrument implementations with size awareness.
Change note (2026-01-29): Updated the ExecPlan progress to completed, removed empty row handling, added header visibility, theme toggle, and width-based scaling with scroll behavior.
