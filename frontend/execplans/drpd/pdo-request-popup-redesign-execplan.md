# Refactor Dr.PD PDO Request Popup To Two-Pane List + Form Layout

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `frontend/PLANS.md`, and this ExecPlan must be maintained in accordance with `frontend/PLANS.md`.

## Purpose / Big Picture

Refactor the existing Dr.PD sink "Change" popup in the rack Sink Control instrument so it matches the provided sketch: a scrollable PDO list on the left (A), voltage and current request controls on the right (B, C), and explicit Cancel / Set PDO actions (D, E). After this change, users can select a PDO from a richer list, see constraints directly, enter only allowed values, and submit requests with validation that matches PDO type-specific rules (including AVS current limits that depend on requested voltage).

The result is visible by opening the Sink Control instrument, clicking `Change`, and interacting with the redesigned popup. It is also verifiable in tests by checking list rendering, field enable/disable behavior, validation errors, submit disabling, and Escape-to-close behavior.

## Progress

- [x] (2026-02-25 15:27Z) Reviewed current sink control UI (`frontend/src/features/rack/instruments/DrpdSinkControlInstrumentView.tsx`) and styles/tests to locate the existing PDO request popup implementation (`advancedPanel` dialog).
- [x] (2026-02-25 15:27Z) Confirmed current behavior differs from requested design: popup uses a single `<select>` dropdown and Battery/AVS power entry instead of a left-side list plus voltage/current form.
- [x] (2026-02-25 15:27Z) Authored this ExecPlan for the popup redesign and validation refactor, including open questions that must be answered before implementation starts.
- [x] (2026-02-25 15:31Z) Resolved product decisions with user: use voltage+current for all PDO types, show validation immediately, auto-close popup on success, and keep two-decimal formatting.
- [x] (2026-02-25 15:45Z) Implemented popup refactor in `DrpdSinkControlInstrumentView.tsx`: two-pane list+form layout, immediate validation, dynamic Battery/AVS current limits, fixed-voltage read-only display, Cancel/Escape close, and auto-close on successful submit.
- [x] (2026-02-25 15:45Z) Updated `DrpdSinkControlInstrumentView.module.css` for the two-pane popup, selectable scrollable PDO list, and action-row layout with six-row list cap.
- [x] (2026-02-25 15:45Z) Updated `DrpdSinkControlInstrumentView.test.tsx` for listbox interactions, current-based Battery/AVS requests, immediate validation, AVS voltage-driven revalidation, Cancel/Escape close, and fixed-voltage read-only behavior.
- [x] (2026-02-25 15:45Z) Ran targeted sink-control and rack view tests successfully; ran full frontend suite and documented one unrelated existing failure in `src/lib/transport/usbtmc.test.ts`.

## Surprises & Discoveries

- Observation: The current "popup" is the inline `advancedPanel` dialog rendered inside `DrpdSinkControlInstrumentView` when `isAdvancedOpen` is true; it is not a shared modal component.
  Evidence: `frontend/src/features/rack/instruments/DrpdSinkControlInstrumentView.tsx` renders a `div` with `role="dialog"` and `className={styles.advancedPanel}` directly inside the instrument.

- Observation: Current request validation is centralized in `buildRequestArgs(...)`, which returns converted SCPI units (`voltageMv`, `currentMa`) or an error string.
  Evidence: `frontend/src/features/rack/instruments/DrpdSinkControlInstrumentView.tsx` validates by PDO type before `driver.sink.requestPdo(...)`.

- Observation: Current AVS handling uses `voltage + power` inputs and derives current; the new request explicitly changes AVS UX to a current input whose valid maximum depends on selected/requested voltage.
  Evidence: Existing AVS code path shares the `BATTERY`/`SPR_AVS`/`EPR_AVS` branch and renders `Power (W)` instead of `Current (A)` in `requestBody`.

- Observation: The repository already uses simple Escape-key listeners tied to component-local open state for popups/menus.
  Evidence: `frontend/src/features/rack/instruments/DrpdDeviceStatusInstrumentView.tsx` and `frontend/src/features/rack/RackView.tsx` attach/remove `keydown` listeners and close on `event.key === 'Escape'`.

- Observation: Successful sink PDO requests in tests still trigger warning logs from `loadSinkData()` because the minimal transport stub does not provide `ccBus.getRole()` responses after submit.
  Evidence: `DrpdSinkControlInstrumentView.test.tsx` passes while stderr shows `Failed to request PDO: Missing CC bus role response` during post-submit refresh.

## Decision Log

- Decision: Scope this work to the existing Sink Control instrument popup (`Change` dialog) instead of introducing a new shared modal framework.
  Rationale: The request is a targeted UI refactor of an existing control path, and the current implementation is local to `DrpdSinkControlInstrumentView`; a local refactor minimizes risk and test surface.
  Date/Author: 2026-02-25 / Codex

- Decision: Keep validation and request argument conversion in the frontend instrument view (likely by refactoring `buildRequestArgs(...)` into clearer type-specific helpers) rather than changing the DRPD transport API.
  Rationale: The transport contract (`requestPdo(index, voltageMv, currentMa)`) already matches device behavior; the requested changes are UI/validation semantics and layout.
  Date/Author: 2026-02-25 / Codex

- Decision: Treat AVS current validation as dynamic (recomputed whenever voltage input changes) and gate submission based on the live validity result.
  Rationale: The user explicitly requires AVS current limits to depend on requested voltage and to be rechecked when voltage changes.
  Date/Author: 2026-02-25 / Codex

- Decision: Use `Voltage + Current` inputs for all PDO types, including Battery and AVS, instead of Battery/AVS power entry.
  Rationale: The user explicitly requested a current field for all PDO types and the sketch labels field C as current. Battery/AVS current validation will be derived from PDO power limits where applicable.
  Date/Author: 2026-02-25 / Codex

- Decision: Show validation errors immediately while typing and auto-close the popup after a successful request.
  Rationale: The user requested immediate feedback and auto-close behavior; this also simplifies the dialog state after submission.
  Date/Author: 2026-02-25 / Codex

## Outcomes & Retrospective

Implemented in the Sink Control instrument popup without introducing new dependencies. The popup now uses a left-side selectable PDO list and right-side request form, validates voltage/current immediately, recalculates Battery/AVS current limits as voltage changes, supports Cancel and Escape close, and auto-closes after a successful request.

Validation outcome:

- Targeted sink-control tests passed (`8` tests).
- Rack view regression test passed (`19` tests).
- Full frontend suite did not fully pass due an unrelated existing failure in `src/lib/transport/usbtmc.test.ts` (`formats SCPI parameters correctly` expectation mismatch).

## Context and Orientation

The affected UI is the Dr.PD sink control rack instrument in `frontend/src/features/rack/instruments/DrpdSinkControlInstrumentView.tsx`, with styles in `frontend/src/features/rack/instruments/DrpdSinkControlInstrumentView.module.css` and behavior tests in `frontend/src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx`.

Current behavior:

- The user opens a request dialog by clicking the `Change` button in the Sink Control instrument.
- The dialog shows a `<select>` dropdown listing PDOs and a small form with type-specific inputs.
- `buildRequestArgs(...)` validates input and converts user values to `(voltageMv, currentMa)` for `driver.sink.requestPdo(index, voltageMv, currentMa)`.
- For Battery and AVS PDOs, the UI currently asks for power and derives current.

Requested redesign behavior (mapping the sketch labels):

- A: Replace the dropdown with a visible list of PDOs on the left, max height equal to 6 rows/items, scrollable if more entries exist. Each list item must show a primary line (PDO type) and a smaller secondary line (voltage and current range, or voltage and power range when current is not the canonical limit).
- B: Voltage field on the right must be editable only for PDO types that allow choosing voltage. For fixed-voltage PDOs it must display the fixed voltage but not allow editing.
- C: Current field on the right must be used for PPS and AVS PDOs. For AVS, maximum current depends on `maxPowerW / requestedVoltageV`, so changing voltage changes the allowed current range and may invalidate current input.
- D: Cancel button closes the popup. Escape key must also close the popup.
- E: Set PDO button submits only when all validation passes.

Plain-language terms:

- PDO (Power Data Object): A source-offered power profile (for example fixed 9V/3A, variable range, PPS range, AVS power-limited range).
- PPS (Programmable Power Supply, here `SPR_PPS`): A PDO where the sink can request a voltage and current within allowed limits.
- AVS (Adjustable Voltage Supply, here `SPR_AVS` / `EPR_AVS`): A power-limited PDO where current limits depend on the requested voltage because the PDO is expressed as maximum power.

## Open Questions and Required Answers

Resolved on 2026-02-25 with the user:

1. Battery PDOs will use `Voltage + Current` (same as all other PDO types).
2. Validation errors will be shown immediately while typing.
3. Popup will auto-close after successful `Set PDO`.
4. Two-decimal formatting is acceptable for PDO list entries.

## Plan of Work

Refactor the popup portion of `frontend/src/features/rack/instruments/DrpdSinkControlInstrumentView.tsx` from a compact dropdown form into a two-pane dialog layout while preserving the existing driver integration and instrument shell.

First, separate UI metadata and validation logic into small helpers in `DrpdSinkControlInstrumentView.tsx` (or a colocated helper module if the file grows too large). The helpers should answer:

- What fields are shown for the selected PDO type (`voltage`, `current`, `power`, read-only vs editable)?
- What label text and range text to display in the left list secondary line?
- What the allowed voltage/current/power ranges are right now, including AVS current max as `maxPowerW / requestedVoltage`.
- Whether the current form state is valid, with a user-visible error message and converted SCPI arguments.

Then replace the existing `<select>` in the dialog header with a scrollable list component inside the dialog body. Each row should be a button-like selectable item that:

- updates `selectedIndex`,
- shows active/selected styling,
- displays two lines (type and details),
- supports keyboard focus,
- stays within a container capped to six visible items (using CSS max-height based on row height and `overflow-y: auto`).

Next, redesign the right pane form to match the sketch:

- `Voltage` row and input (read-only for fixed PDOs, editable for other PDO types).
- `Current` row and input for all PDO types except fixed-voltage-only current may still be editable while voltage stays read-only.
- For Battery and AVS (power-limited PDOs), recalculate the allowed current maximum from `maxPowerW / requestedVoltageV` whenever voltage changes.
- Action row with `Cancel` and `Set PDO` buttons.

Add popup lifecycle behavior:

- `Cancel` closes the popup and preserves or resets form state according to current defaulting behavior (prefer reset to selected PDO defaults on next open).
- Escape key closes the popup while open.
- `Set PDO` remains disabled while sending or when validation fails, and successful requests auto-close the popup.

Finally, update tests in `frontend/src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx` to cover the redesigned interactions and guard against regressions in request conversion and validation.

## Concrete Steps

Work from `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/monorepo/frontend`.

1. Review and answer the open questions in this plan before implementation starts. Update the `Decision Log` and assumptions accordingly.

2. Edit `src/features/rack/instruments/DrpdSinkControlInstrumentView.tsx`:

   - Refactor popup render structure into left list (A) and right form/action pane (B/C/D/E).
   - Add Escape key listener tied to `isAdvancedOpen`.
   - Refactor validation to distinguish PPS/AVS current validation and dynamic AVS current max computation.
   - Ensure fixed-voltage PDOs render voltage as read-only and non-editable.
   - Ensure submit is blocked with visible error when inputs are invalid.

3. Edit `src/features/rack/instruments/DrpdSinkControlInstrumentView.module.css`:

   - Add two-pane popup layout styles.
   - Add scrollable PDO list styles capped at six rows.
   - Add selected/hover/focus states for PDO list items.
   - Add field/action row styling that matches the sketch proportions within the current instrument popup footprint.

4. Edit `src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx`:

   - Replace/adjust tests that assume a `<select>` dropdown.
   - Add a test that renders more than six PDOs and verifies the list container is scrollable/capped (class/style assertion).
   - Add tests for fixed-voltage read-only behavior.
   - Add tests for PPS/AVS current input validation and AVS current revalidation after voltage edits.
   - Add tests for `Cancel` and Escape closing the popup.
   - Keep request argument dispatch assertions (`requestPdo(index, voltageMv, currentMa)`) for supported PDO types.

5. Run validation commands and record results in this plan:

     cd /Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/monorepo/frontend
     npm run test -- src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx
     npm run test -- src/features/rack/__tests__/RackView.test.tsx
     npm run test

Completed on 2026-02-25. See `Artifacts and Notes` for observed outputs.

## Validation and Acceptance

Acceptance is satisfied when all of the following are demonstrably true in the running UI and covered by tests where practical:

1. Clicking `Change` opens a popup that visually matches the requested structure: left PDO list (A), right-side voltage/current form (B/C), and `Cancel` / `Set PDO` buttons (D/E).
2. The PDO list shows each entry with two lines (type + smaller details line) and is capped to six visible items with vertical scrolling for additional entries.
3. Selecting a PDO updates the right-side form and range/helper text.
4. Fixed-voltage PDOs show voltage but do not allow editing.
5. All PDO types use a current input (not power input), with validation that blocks submit when out of range.
6. Battery and AVS current limits are recalculated when voltage changes, and a previously valid current can become invalid (or vice versa) based on the new voltage.
7. `Cancel` closes the popup and pressing Escape also closes it.
8. `Set PDO` calls `driver.sink.requestPdo(index, voltageMv, currentMa)` only when validation passes, and remains disabled or blocked otherwise.
9. Existing sink control behavior outside the popup (instrument render, driver wiring) continues to work and tests pass.

## Idempotence and Recovery

This refactor is local to frontend component/style/test files and can be repeated safely. If a validation refactor introduces regressions, the safest recovery is to keep UI layout changes but temporarily route request conversion through the previous `buildRequestArgs(...)` logic while adding tests for the failing PDO type, then reintroduce type-specific validation changes incrementally.

If popup keyboard handling causes global Escape conflicts, scope the listener strictly to `isAdvancedOpen === true` and remove it in cleanup, matching the existing patterns used elsewhere in the rack UI.

## Artifacts and Notes

Expected request conversion examples that must remain correct after the refactor:

- `SPR_PPS`, selected index `2`, user enters `9.0 V` and `2.5 A`:
  `requestPdo(2, 9000, 2500)`

- `EPR_AVS` with `maxPowerW = 140`, user enters `20.0 V` and `5.0 A`:
  validation passes only if `5.0 <= 140 / 20.0 = 7.0 A`, then `requestPdo(index, 20000, 5000)`

- `EPR_AVS` with `maxPowerW = 140`, user enters `28.0 V` and `6.0 A`:
  validation fails because `6.0 A > 140 / 28.0 = 5.0 A`; submit must be blocked and error shown.

Add test transcripts and any styling/layout constraints discovered during implementation to this section.

Validation transcripts (2026-02-25):

    npm run test -- src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx
    ✓ src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx (8 tests)

    npm run test -- src/features/rack/__tests__/RackView.test.tsx
    ✓ src/features/rack/__tests__/RackView.test.tsx (19 tests)

    npm run test
    FAIL  src/lib/transport/usbtmc.test.ts > USBTMCTransport > formats SCPI parameters correctly
    Expected: "MEAS:VOLT 1, ON, \"a\"\"b\", NORM"
    Received: "MEAS:VOLT 1 ON \"a\"\"b\" NORM"

Implementation notes:

- Battery PDOs now use `Voltage + Current` in the popup, but their current limit is still derived from `maxPowerW / requestedVoltageV`, so the UI labels these ranges as power-limited.
- The left PDO list uses `role="listbox"` + `role="option"` buttons and CSS `max-height` + `overflow-y: auto` to cap visible entries at six rows.

## Interfaces and Dependencies

Use existing dependencies only (React, TypeScript, CSS Modules, Vitest, Testing Library). Do not add new npm packages for this refactor.

Primary files to modify:

- `frontend/src/features/rack/instruments/DrpdSinkControlInstrumentView.tsx`
- `frontend/src/features/rack/instruments/DrpdSinkControlInstrumentView.module.css`
- `frontend/src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx`

Existing interface/behavior that must be preserved:

- `driver.sink.requestPdo(index, voltageMv, currentMa)` transport signature in the frontend driver API.
- `isAdvancedOpen` popup lifecycle semantics (local component state).
- Sink PDO data source from `driver.getState().sinkPdoList` and refresh path via `loadSinkData()`.

Suggested internal helper interfaces after refactor (names can vary, behavior must exist):

- A helper that returns per-PDO list display metadata (title + secondary detail string).
- A helper that returns live input constraints for the selected PDO and current voltage value.
- A helper that validates form state and returns converted SCPI arguments plus a user-visible error message.

Revision Note (2026-02-25): Initial ExecPlan created for refactoring the Sink Control PDO request popup to the sketch-based two-pane design with scrollable PDO list, voltage/current validation changes, and Escape/Cancel support. Includes open questions that must be answered before implementation begins.
Revision Note (2026-02-25): Updated with resolved product decisions, implemented behavior, test coverage/results, and an unrelated full-suite failure observed during validation.
