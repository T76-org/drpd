# Implement arbitrary-width rack rows with drag-and-drop row creation

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `PLANS.md` at the repo root, and this ExecPlan must be maintained in accordance with `/PLANS.md`.

## Purpose / Big Picture

Users can currently only place `full` or `half` instruments in a row. After this change, each instrument can define its own width behavior, rows can contain an arbitrary number of instruments side-by-side as long as total width does not exceed rack capacity, and mixed-height neighbors remain bottom-aligned by default. Drag-and-drop in edit mode will support moving an instrument between existing rows and dropping to create a new row at any insertion point. Flex-width instruments will expand to consume leftover horizontal space, and if multiple flex instruments share a row they split that space evenly.

A user should be able to open the rack editor, drag one instrument into a busy row that still has capacity, drag another instrument between rows to create a new row, and observe that fixed-width and flex-width instruments render with the expected widths while all instruments in the row stay bottom-aligned.

## Progress

- [x] (2026-02-10 04:04Z) Reviewed current rack model, renderer, drag/drop behavior, and existing ExecPlan constraints.
- [x] (2026-02-10 04:09Z) Implemented width model migration (`InstrumentWidth`, `defaultWidth`) and removed `slot` assumptions from rack types and add-instrument flow.
- [x] (2026-02-10 04:11Z) Refactored row layout computation and rendering for fixed/flex width allocations with row-capacity enforcement.
- [x] (2026-02-10 04:12Z) Refactored drag-and-drop target resolution for in-row insertion and explicit between-row new-row creation zones.
- [x] (2026-02-10 04:13Z) Added and updated tests for width allocation, capacity overflow handling, and row-creation drag/drop behavior.
- [x] (2026-02-10 04:14Z) Updated rack docs and sample rack data to describe and demonstrate fixed/flex width semantics.
- [x] (2026-02-10 04:15Z) Ran full test validation (`npm run test`) and verified all tests pass.

## Surprises & Discoveries

- Observation: Existing drag and drop already uses a snapshot-based preview (`dragStateRef`) and an explicit drop-target descriptor (`DropTarget`), so the architecture can be extended without introducing a new DnD library.
  Evidence: `src/features/rack/RackView.tsx` already has `handleInstrumentDragOver`, `getDropTarget`, and `moveInstrumentInRack`.

- Observation: Width is currently inferred only from instrument definition `defaultLayout: 'full' | 'half'`, while instance records store only an optional `slot`.
  Evidence: `src/lib/instrument/types.ts` defines `InstrumentLayout`; `src/features/rack/RowRenderer.tsx` computes width from `defaultLayout`.

- Observation: Source rows are pruned when emptied during drag moves, so an overflow fallback move may keep row count stable instead of increasing by one.
  Evidence: `removeInstrumentFromRack`/`extractInstrumentFromRack` prune empty rows; updated test expectation in `src/features/rack/__tests__/RackView.test.tsx`.

## Decision Log

- Decision: Replace binary layout (`full`/`half`) with explicit width behavior (`fixed` units or `flex`) at the instrument definition layer, and remove row `slot` dependence.
  Rationale: The requirement says instruments decide their width and rows should support arbitrary side-by-side arrangements.
  Date/Author: 2026-02-10 / Codex

- Decision: Introduce a rack-level maximum row width constant in units and enforce placement legality in drag/drop logic before previewing or committing.
  Rationale: Capacity checks must be deterministic and shared by preview and commit paths to prevent illegal transient states.
  Date/Author: 2026-02-10 / Codex

- Decision: Allocate flex width from remaining row capacity after fixed widths are applied, splitting equally across flex instruments.
  Rationale: Matches the requested behavior while keeping fixed-width instruments predictable.
  Date/Author: 2026-02-10 / Codex

- Decision: Keep overflow drop behavior deterministic by falling back to insertion as a new row at the targeted row index when in-row insertion is illegal.
  Rationale: Prevents illegal layouts while still honoring the user drop intent as closely as possible.
  Date/Author: 2026-02-10 / Codex

## Outcomes & Retrospective

Implemented the full feature set described in this plan. Instruments now declare width behavior via `defaultWidth` (`fixed` or `flex`), rows support arbitrary side-by-side instrument counts under a max width budget, mixed-height instruments remain bottom-aligned, and drag/drop supports both in-row insertion and explicit new-row creation through between-row insertion zones.

Acceptance criteria coverage:

1. More-than-two instruments per row is supported when width budget allows: validated by `src/features/rack/layout.test.ts`.
2. Illegal over-capacity drops are prevented from committing into the target row: validated by `falls back to a new row when dropping into an over-capacity row` in `src/features/rack/__tests__/RackView.test.tsx`.
3. Flex widths consume remaining row space equally: validated by both `src/features/rack/layout.test.ts` and `allocates leftover width equally to flex instruments` in `src/features/rack/__tests__/RackView.test.tsx`.
4. Bottom alignment remains in place: preserved by row CSS (`align-items: flex-end`) in `src/features/rack/RowRenderer.module.css`.
5. Between-row insertion creates new rows during drag/drop: implemented via `rack-row-insert-*` zones in `src/features/rack/RackRenderer.tsx`.
6. In-row insertion uses pointer-position indexing: implemented in `getInsertIndexFromPointer` in `src/features/rack/RowRenderer.tsx`.
7. Save edit mode persistence is unchanged and covered by existing save tests in `src/features/rack/__tests__/RackView.test.tsx`.

Validation run:

    cd /Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend
    npm run test

Result: 14 test files passed, 105 tests passed.

## Context and Orientation

The rack UI is implemented in `src/features/rack`. `src/features/rack/RackView.tsx` owns edit mode, drag state, and mutation helpers that update `RackDefinition`. `src/features/rack/RackRenderer.tsx` renders rows and the append drop zone. `src/features/rack/RowRenderer.tsx` computes row height and instrument dimensions and renders instrument cards.

Rack data model types live in `src/lib/rack/types.ts`. Instrument definition metadata lives in `src/lib/instrument/types.ts` and concrete instrument definitions are currently registered in `src/features/rack/instrumentCatalog.ts`.

A rack row is currently constrained by `full` vs `half` layout and optional `slot` ordering. This plan removes that model and replaces it with a width-capacity model so each row can hold any number of instruments that fit within the maximum width.

Definitions used in this plan:

Maximum row width is the rack row capacity in horizontal units (for example 12 units). Fixed-width instrument means an instrument that always consumes a fixed number of width units. Flex-width instrument means an instrument that consumes an equal share of leftover row width after fixed widths are placed. Row insertion target means a drag-and-drop region between rows that creates a new row when dropped.

## Plan of Work

First, update the core type system so instrument definitions express width behavior directly. In `src/lib/instrument/types.ts`, replace `InstrumentLayout` and `defaultLayout` with a width descriptor type:

- `InstrumentWidth` union with `fixed` and `flex` variants.
- `defaultWidth: InstrumentWidth` on `InstrumentInit` and `Instrument`.
- Keep `defaultUnits` for vertical size so mixed-height bottom alignment behavior remains unchanged.

Then migrate rack instance types in `src/lib/rack/types.ts` by removing `slot` from `RackInstrument`, because ordering is now positional within `row.instruments`.

Next, add shared layout math helpers in a new module `src/features/rack/layout.ts` (or equivalent colocated utility). This module should be the single source of truth for:

- validating whether a row can accept an instrument by width rules,
- computing row width allocation per instrument (fixed widths plus equal flex share),
- computing pixel widths from unit widths.

The core algorithm must be:

1. Resolve each instrument instance to its definition.
2. Sum fixed widths.
3. Count flex instruments.
4. Compute `remaining = maxRowWidthUnits - fixedWidthSum`.
5. Reject the layout if `remaining < 0`.
6. If `flexCount > 0`, allocate `remaining / flexCount` units to each flex instrument.
7. If `flexCount === 0`, leave `remaining` as trailing blank row space.

Row rendering changes go in `src/features/rack/RowRenderer.tsx`. Replace the current full/half width logic and slot sorting with iteration in row order and width allocation from the shared helper. Keep row height as max `defaultUnits` in the row and preserve bottom alignment by retaining flexbox alignment (`align-items: flex-end`) in CSS. The rendered width should use computed unit widths multiplied by `unitWidthPx` derived from rack width and max row width.

Rack renderer changes go in `src/features/rack/RackRenderer.tsx`. It should pass `maxRowWidthUnits` and rack pixel width context to each row. Keep existing append drop zone, but add explicit between-row insertion zones (for example before each row and after the last row) so users can create a new row from drag-and-drop without targeting an existing row.

Drag/drop logic changes go in `src/features/rack/RackView.tsx`. Replace `DropTarget` `inside/before/after/append` plus `slot` with a clearer target model:

- `insertIntoRow` with `rowId` and insertion index inside that row,
- `insertAsNewRow` with target row index.

Update `getDropTarget` to produce those target shapes based on pointer position in row and insertion-zone hits. Update `moveInstrumentInRack` to:

- extract the dragged instrument,
- attempt row insertion only when resulting row width is legal,
- otherwise fall back to nearest legal new-row insertion,
- always prune empty rows,
- preserve instrument identity and device bindings.

To support “move an instrument to form a new blank row,” new-row insertion zones must be visible in edit mode even when rows already contain instruments. Dropping on such a zone creates a new row that contains the moved instrument; source row is removed only if it becomes empty.

Update add-instrument behavior in `handleAddInstrument` so a newly added instrument starts in its own row and no longer writes `slot`.

Update instrument catalog entries in `src/features/rack/instrumentCatalog.ts` to provide `defaultWidth` values. At minimum, define one fixed-width and one flex-width example to exercise both paths in tests and manual QA.

Update documentation in `docs/rack-instruments.md` so it explains fixed and flex width behavior, row capacity, and drag/drop row creation semantics.

## Concrete Steps

Work in `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`.

1. Edit `src/lib/instrument/types.ts` to introduce `InstrumentWidth` and `defaultWidth`, and update all call sites of `defaultLayout`.
2. Edit `src/features/rack/instrumentCatalog.ts` to migrate definitions to the new width model.
3. Edit `src/lib/rack/types.ts` to remove `slot` from `RackInstrument`.
4. Add `src/features/rack/layout.ts` with pure functions for row capacity checks and width allocation.
5. Refactor `src/features/rack/RowRenderer.tsx` to consume computed per-instrument widths and preserve bottom alignment.
6. Refactor `src/features/rack/RackRenderer.tsx` to expose between-row insertion zones in edit mode.
7. Refactor drag/drop in `src/features/rack/RackView.tsx` (`DropTarget`, `getDropTarget`, `moveInstrumentInRack`, helper functions) for arbitrary-width row insertion and new-row creation.
8. Update tests in `src/features/rack/__tests__/RackView.test.tsx` and add focused utility tests in `src/features/rack/layout.test.ts`.
9. Update `docs/rack-instruments.md` and sample data where needed.
10. Run validation commands and update this plan’s `Progress`, `Decision Log`, `Surprises & Discoveries`, and `Outcomes & Retrospective` with actual results.

Expected command sequence:

    cd /Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend
    npm run test

Optional targeted test loop during development:

    cd /Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend
    npm run test -- src/features/rack/__tests__/RackView.test.tsx src/features/rack/layout.test.ts

## Validation and Acceptance

Run `npm run test` from `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend` and expect all tests to pass.

Acceptance criteria are behavior-based:

1. A row can contain more than two instruments when their combined fixed widths (plus any flex allocation) do not exceed max row width.
2. Attempting to drop an instrument into a row that would exceed max width does not commit an illegal layout.
3. Flex-width instruments consume all leftover row width, and multiple flex instruments receive equal width.
4. Rows with mixed heights render instruments bottom-aligned by default.
5. Dragging to between-row insertion zones creates a new row containing the dragged instrument.
6. Dragging into an existing row inserts the instrument at the indicated position when capacity allows.
7. Saving edit mode persists the new row structure and ordering.

Manual verification in dev server:

    cd /Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend
    npm run dev

In the browser, enter Edit mode, drag instruments across multiple rows, and verify the exact behaviors above.

## Idempotence and Recovery

These changes are safe to apply incrementally. If a refactor step breaks rendering, keep the shared layout helpers pure and test-driven so behavior can be restored by fixing helper outputs before touching UI wiring. If drag/drop behavior regresses, use `dragStateRef.snapshot` as rollback ground truth during `dragEnd` for cancelled drops.

No destructive data migration is required because rack documents currently in localStorage are test/development fixtures. If old local data causes runtime shape mismatch after removing `slot`, clear `drpd:rack:document` in browser localStorage and reload.

## Artifacts and Notes

Expected width allocation examples for helper tests:

    maxRowWidthUnits = 12
    row = [fixed(3), fixed(2), flex]
    fixedSum = 5
    remaining = 7
    flexCount = 1
    allocation = [3, 2, 7]

    maxRowWidthUnits = 12
    row = [fixed(4), flex, flex]
    fixedSum = 4
    remaining = 8
    flexCount = 2
    allocation = [4, 4, 4]

Expected illegal drop example:

    maxRowWidthUnits = 12
    target row current fixed sum = 10
    dragged instrument fixed width = 3
    result: cannot insert into this row; show new-row fallback preview instead

## Interfaces and Dependencies

In `src/lib/instrument/types.ts`, define:

    export type InstrumentWidth =
      | { mode: 'fixed'; units: number }
      | { mode: 'flex' }

    export interface InstrumentInit {
      identifier: InstrumentIdentifier
      displayName: string
      supportedDeviceIdentifiers: DeviceIdentifier[]
      defaultWidth: InstrumentWidth
      defaultUnits: number
    }

    export abstract class Instrument {
      public readonly defaultWidth: InstrumentWidth
      public readonly defaultUnits: number
    }

In `src/features/rack/layout.ts`, define pure helpers:

    export interface RowInstrumentWidthAllocation {
      instrumentId: string
      widthUnits: number
    }

    export const MAX_ROW_WIDTH_UNITS = 12

    export const canInsertInstrumentIntoRow = (...): boolean
    export const allocateRowInstrumentWidths = (...): RowInstrumentWidthAllocation[]

`allocateRowInstrumentWidths` must return widths in row order and throw or return an explicit failure when fixed widths exceed row capacity.

In `src/features/rack/RackView.tsx`, update drag target and move interfaces:

    interface DropTarget {
      mode: 'insertIntoRow' | 'insertAsNewRow'
      rowId?: string
      rowIndex: number
      insertIndex?: number
    }

Use only existing React, TypeScript, and Vitest dependencies. Do not add a third-party drag-and-drop library.

Change note (2026-02-10): Created this ExecPlan to implement arbitrary-width and flex-width instruments with capacity-constrained drag-and-drop row editing, because the current full/half layout model cannot satisfy the new side-by-side placement requirements.
Change note (2026-02-10): Updated plan status to complete after implementing width-model migration, row-capacity allocation, between-row insertion zones, drag/drop insertion refactor, docs/sample updates, and passing full test validation.
