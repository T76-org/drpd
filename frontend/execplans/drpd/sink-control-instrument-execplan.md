# Add Dr.PD Sink Control Instrument

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `PLANS.md` at the repo root, and this ExecPlan must be maintained in accordance with `/PLANS.md`.

## Purpose / Big Picture

Add a new Dr.PD rack instrument that gives direct sink visibility and control from the rack canvas. After this change, a user can add a sink-focused instrument, see the currently negotiated/selected PDO, inspect all available source PDOs in a dropdown, choose one, enter request parameters that match the selected PDO type, submit the request, and see live sink state updates. The result is observable in the UI and verifiable with focused tests for rendering, parameter validation, and SCPI command dispatch.

## Progress

- [x] (2026-02-11 00:00Z) Reviewed current rack/instrument architecture, DRPD sink APIs, and existing ExecPlan conventions from `PLANS.md`.
- [x] (2026-02-11 00:00Z) Authored initial ExecPlan for a new Dr.PD sink control instrument.
- [x] (2026-02-11 21:16Z) Implemented sink control instrument definition, rendering, and data wiring (`instrumentCatalog`, `RowRenderer`, new sink control view + CSS).
- [x] (2026-02-11 21:17Z) Added and passed tests for sink state rendering, PDO dropdown/type-specific controls, Battery request conversion, and validation behavior.
- [x] (2026-02-11 21:17Z) Ran `npm run test` with full suite passing (18 files / 115 tests).

## Surprises & Discoveries

- Observation: `DRPDDevice` already maintains `sinkInfo` and `sinkPdoList` in its state and emits `SINK_INFO_CHANGED_EVENT`, `SINK_PDO_LIST_CHANGED_EVENT`, and `STATE_UPDATED_EVENT`.
  Evidence: `src/lib/device/drpd/device.ts` updates those fields in `refreshState`, interrupt handlers, and dedicated refresh helpers.

- Observation: The SCPI command used to request a sink PDO (`SINK:PDO`) accepts `(index, voltage_mv, current_ma)` only, even for Battery PDOs that are naturally specified by power.
  Evidence: `execplans/drpd/scpi.yaml` defines `SINK:PDO` with `voltage_mv` and `current_ma`; `src/lib/device/drpd/sink.ts` mirrors this signature in `requestPdo(index, voltageMv, currentMa)`.

- Observation: The rack layout system supports fixed-size instruments via `defaultWidth: { mode: 'fixed', units: <n> }` and `defaultUnits`, and row width capacity is bounded by `MAX_ROW_WIDTH_UNITS` (12).
  Evidence: `src/features/rack/instrumentCatalog.ts` and `src/features/rack/layout.ts`.

- Observation: A single `STATE_UPDATED_EVENT` subscription is sufficient for this instrument because sink info, sink PDO list, and role changes are all surfaced through `detail.changed`.
  Evidence: `src/lib/device/drpd/device.ts` emits `stateupdated` with `changed` arrays for `sinkInfo`, `sinkPdoList`, and `role`; `DrpdSinkControlInstrumentView` uses that event only.

## Decision Log

- Decision: Implement the sink controller as a separate instrument (`com.mta.drpd.sink-control`) rather than extending `Device Status`.
  Rationale: Sink control introduces interactive forms and state transitions that would overload the status panel’s compact telemetry role.
  Date/Author: 2026-02-11 / Codex

- Decision: Set the sink control instrument default size to fixed width 4 units and height 2 units.
  Rationale: This is large enough to display selected PDO, dropdown, dynamic controls, and status without crowding, while still fitting three instruments per row on a 12-unit rack.
  Date/Author: 2026-02-11 / Codex

- Decision: For Battery PDO requests, expose a power input in the UI but convert it to `current_ma` before calling `SINK:PDO`.
  Rationale: Users think in watts for Battery PDOs, but transport only accepts voltage/current; conversion keeps UI intent aligned with protocol constraints.
  Date/Author: 2026-02-11 / Codex

- Decision: Keep request validation inside the instrument view rather than extending the DRPD command group API.
  Rationale: Validation logic is UI-facing (messages, enabled states, field constraints) and does not change transport contracts.
  Date/Author: 2026-02-11 / Codex

## Outcomes & Retrospective

Implemented. The rack now includes a new `Sink Control` instrument (`com.mta.drpd.sink-control`) with fixed default size (`4w x 2u`), current sink visibility, available PDO selection, type-aware request fields, request validation, and request dispatch via `driver.sink.requestPdo(...)`.

Shipped files:

- `src/features/rack/instrumentCatalog.ts`
- `src/features/rack/RowRenderer.tsx`
- `src/features/rack/instruments/DrpdSinkControlInstrumentView.tsx`
- `src/features/rack/instruments/DrpdSinkControlInstrumentView.module.css`
- `src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx`
- `src/features/rack/__tests__/RackView.test.tsx`

Validation outcome:

- `npm run test -- src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx` passed (4 tests).
- `npm run test -- src/features/rack/__tests__/RackView.test.tsx` passed (19 tests).
- `npm run test` passed full suite (18 files, 115 tests).

## Context and Orientation

The rack UI lives in `src/features/rack/`. Instrument definitions are declared in `src/features/rack/instrumentCatalog.ts`, rendered per row in `src/features/rack/RowRenderer.tsx`, and framed by `src/features/rack/InstrumentBase.tsx`. Rack/instrument compatibility is device-identifier based (`com.mta.drpd` for Dr.PD) as documented in `docs/rack-instruments.md`.

The DRPD runtime object (`DRPDDevice`) is attached to `RackDeviceState.drpdDriver` and already exposes the sink data required for this feature:

- Current sink summary: `device.getState().sinkInfo` (`status`, negotiated PDO, negotiated voltage/current, error).
- Available PDO list: `device.getState().sinkPdoList`.
- Request action: `device.sink.requestPdo(index, voltageMv, currentMa)`.

This means the new instrument can be implemented as a UI layer on top of existing driver APIs without adding new transport commands.

Plain-language definitions used in this plan:

- PDO (Power Data Object): a source-advertised power offer describing allowed voltage/current or voltage/power ranges.
- Negotiated PDO: the power profile currently in effect between source and sink.
- Sink state: the DRPD-reported sink finite state (`DISCONNECTED`, `NEGOTIATING`, `AWAITING_PS_READY`, `CONNECTED`, `ERROR`).

## Plan of Work

Add a new instrument definition in `src/features/rack/instrumentCatalog.ts` named `DrpdSinkControlInstrument` with:

- `identifier: 'com.mta.drpd.sink-control'`
- `displayName: 'Sink Control'`
- `supportedDeviceIdentifiers: ['com.mta.drpd']`
- `defaultWidth: { mode: 'fixed', units: 4 }`
- `defaultUnits: 2`

Create `src/features/rack/instruments/DrpdSinkControlInstrumentView.tsx` and `src/features/rack/instruments/DrpdSinkControlInstrumentView.module.css`. The view subscribes to driver events and shows:

1. Current selection panel (read-only): negotiated PDO type/limits plus negotiated voltage/current and derived power.
2. Available PDO picker: dropdown of `sinkPdoList` entries labeled with human-readable summaries (for example `#2 FIXED 9.00V / 3.00A`, `#3 BATTERY 9.00-15.00V / 27.00W`).
3. Dynamic request controls: render fields based on selected PDO type.
   For `FIXED`: voltage (readonly at fixed voltage), current input.
   For `VARIABLE`: voltage input (within min/max), current input.
   For `AUGMENTED`: voltage input (within min/max), current input.
   For `BATTERY`: voltage input (within min/max), power input; derive current as `I = P / V`, then convert to mA.
4. Sink state panel: state label, error flag, and request result feedback (idle/sending/success/error).

Wire the new view in `src/features/rack/RowRenderer.tsx` with a switch case for `com.mta.drpd.sink-control`.

Validation and conversion behavior in the instrument:

- Clamp or reject out-of-range user inputs based on selected PDO constraints.
- Enforce nonzero voltage before Battery power-to-current conversion.
- Convert volts/amps/watts to millivolts/milliamps integers before calling `requestPdo`.
- Disable submit when no driver, no selected PDO, role is not `SINK`, or validation fails.

State refresh behavior:

- On mount and when driver changes, seed local state from `driver.getState()`.
- Subscribe to `DRPDDevice.STATE_UPDATED_EVENT`, `DRPDDevice.SINK_INFO_CHANGED_EVENT`, and `DRPDDevice.SINK_PDO_LIST_CHANGED_EVENT`.
- After successful request, call public `driver.refreshState()` (or wait for interrupt/state events) to reconcile sink info/PDO list, then update local feedback.

Styling approach:

- Reuse existing tokenized visual language from `InstrumentBase` and `DrpdDeviceStatusInstrumentView`.
- Keep controls compact and tabular-numeric where values are numeric.
- Ensure layout remains readable inside fixed `4w x 2u` footprint and does not overflow at typical rack scales.

## Concrete Steps

Work from `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`.

1. Update instrument catalog.

   Edit `src/features/rack/instrumentCatalog.ts`:
   add `DrpdSinkControlInstrument` and include it in `getSupportedInstruments()`.

2. Implement sink control view.

   Create `src/features/rack/instruments/DrpdSinkControlInstrumentView.tsx` with:
   local form state, event subscriptions, PDO label helpers, unit conversion helpers, and submit handler that calls `driver.sink.requestPdo(...)`.

3. Add sink control styles.

   Create `src/features/rack/instruments/DrpdSinkControlInstrumentView.module.css` with a compact grid layout, input/select/button styles, status line treatments, and disabled/error states.

4. Wire row renderer.

   Edit `src/features/rack/RowRenderer.tsx`:
   import `DrpdSinkControlInstrumentView` and add switch case for `com.mta.drpd.sink-control`.

5. Add tests.

   Create `src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx` for:
   rendering sink state and negotiated PDO,
   dropdown population from `sinkPdoList`,
   type-specific control rendering,
   Battery power conversion to `current_ma`,
   disabled submit and validation error behavior.

   Update `src/features/rack/__tests__/RackView.test.tsx` to verify the new instrument appears in Add Instrument for Dr.PD-compatible racks.

6. Run validation commands.

   Run from repo root:

     npm run test -- src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx
     npm run test -- src/features/rack/__tests__/RackView.test.tsx
     npm run test

   Record concise pass/fail output snippets in this plan’s `Artifacts and Notes` section.

## Validation and Acceptance

Acceptance is satisfied when all behavior below is observable:

1. A new “Sink Control” instrument can be added for Dr.PD devices and renders at fixed size.
2. The instrument displays the currently negotiated/selected PDO and current sink state.
3. The instrument dropdown lists all available PDOs from `sinkPdoList`.
4. Selecting different PDO types updates visible parameter inputs to match allowed controls.
5. Submitting a request dispatches one `SINK:PDO` request via `driver.sink.requestPdo(index, voltageMv, currentMa)` with correctly converted integer units.
6. Invalid input combinations (out of range, empty required fields, battery power with zero voltage) are blocked with visible feedback.
7. Tests pass and existing rack/drpd tests continue to pass under `npm run test`.

## Idempotence and Recovery

All changes are additive and safe to rerun. If event-driven updates are delayed on some devices, the instrument should provide a manual refresh action (or invoke refresh helpers after submit) so users can recover to consistent state without reloading the page. If a request fails, keep user-entered values in the form and show a non-blocking error message so they can correct and retry.

## Artifacts and Notes

Expected request conversions:

- FIXED 9.0V with 1.5A request:
  `requestPdo(index, 9000, 1500)`

- VARIABLE 5.0-12.0V with 9.0V @ 2.0A request:
  `requestPdo(index, 9000, 2000)`

- BATTERY 9.0-15.0V with 12.0V @ 24W request:
  derived current `24 / 12 = 2.0A`, then `requestPdo(index, 12000, 2000)`

During implementation, append test command transcripts and any edge-case notes discovered.

Validation transcripts:

    npm run test -- src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx
    ✓ src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx (4 tests)

    npm run test -- src/features/rack/__tests__/RackView.test.tsx
    ✓ src/features/rack/__tests__/RackView.test.tsx (19 tests)

    npm run test
    Test Files  18 passed (18)
    Tests       115 passed (115)

## Interfaces and Dependencies

Use existing dependencies only (React, TypeScript, Vitest, Testing Library). No new npm package is required.

Primary interfaces touched:

- `src/features/rack/instrumentCatalog.ts`
- `src/features/rack/RowRenderer.tsx`
- `src/features/rack/instruments/DrpdSinkControlInstrumentView.tsx` (new)
- `src/features/rack/instruments/DrpdSinkControlInstrumentView.module.css` (new)
- `src/features/rack/instruments/DrpdSinkControlInstrumentView.test.tsx` (new)
- `src/features/rack/__tests__/RackView.test.tsx`

The instrument should read from:

- `RackDeviceState.drpdDriver` (`src/features/rack/RackRenderer.tsx`)
- `DRPDDevice.getState().sinkInfo`
- `DRPDDevice.getState().sinkPdoList`

The instrument should invoke:

- `driver.sink.requestPdo(index, voltageMv, currentMa)`

All newly added public functions and classes must include docblocks, and class fields should use `///<` comments when applicable, per `AGENTS.md`.

Revision Note (2026-02-11): Initial plan created for adding a fixed-size Dr.PD sink control instrument with PDO visibility, type-aware request controls, and sink state display.
Revision Note (2026-02-11): Updated the living sections after implementation and test completion to reflect shipped files, final behavior, and validation evidence.
