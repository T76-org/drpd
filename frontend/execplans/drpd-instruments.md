# Dr.PD instruments: Device Status instrument

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `PLANS.md` at the repo root, and this ExecPlan must be maintained in accordance with `/PLANS.md`.

## Purpose / Big Picture

Create a new set of Dr.PD instruments starting with a “Device Status” instrument that serves as a compact header for the rack. After implementation, a user can add a “Device Status” instrument for a connected Dr.PD device and see live analog measurements (VBUS voltage, VBUS current, power derived from voltage * current, and CC line voltages) with a clear visual hierarchy. The feature is validated by running the app, adding the instrument, and observing values update as the device state changes; tests should confirm the instrument appears for compatible devices and that power calculation logic is correct.

## Progress

- [x] (2026-01-31 20:16Z) Created initial ExecPlan for Dr.PD instruments and Device Status scope.
- [x] (2026-01-31 20:30Z) Implemented device runtime plumbing to expose DRPD drivers to instruments via rack device state.
- [x] (2026-01-31 20:30Z) Added Device Status instrument definition, view, and styling with the specified hierarchy.
- [x] (2026-01-31 20:30Z) Added tests for instrument compatibility and derived power rendering.
- [x] (2026-01-31 20:30Z) Ran `npm run test` (96 tests passed).
- [x] (2026-02-01 00:00Z) Iterated on Device Status layout for 1-unit height, including divider styling, CC alignment, and CC status badges.

## Surprises & Discoveries

- Observation: The rack device runtime state currently tracks only connection status and does not expose a DRPD driver instance or analog monitor values to instruments.
  Evidence: `src/features/rack/RackView.tsx` stores `RackDeviceState` with `{ record, status, error }` only.

## Decision Log

- Decision: Set the Device Status instrument default height to 2 vertical units to keep it header-sized while still accommodating the four measurement groups.
  Rationale: One unit (100 px) is likely too short for readable hierarchy; 2 units provides room without dominating the rack.
  Date/Author: 2026-01-31 / Codex

- Decision: Drive the Device Status instrument from DRPD analog monitor data using the existing `DRPDDevice` state/events and let the instrument subscribe directly to the driver state instead of caching analog snapshots in rack runtime state.
  Rationale: The DRPD driver already owns analog monitor polling and state updates; instruments can subscribe to those events without duplicating storage in the rack UI.
  Date/Author: 2026-01-31 / Codex

- Decision: Use a placeholder “SET: --” line for voltage, current, and power until setpoints are available.
  Rationale: The layout sketch includes setpoints, but the scope is analog-only, so placeholders preserve the visual structure without inventing values.
  Date/Author: 2026-01-31 / Codex

- Decision: Format all values to two decimal places.
  Rationale: Consistent precision keeps the header readable and aligns with the requested formatting.
  Date/Author: 2026-01-31 / Codex

- Decision: Replace placeholder SET lines with CC status badges derived from `analogMonitorCCStatusFromVoltage` and align them in a dedicated column.
  Rationale: Status badges add useful signal without adding extra rows, and a dedicated column ensures alignment across CC rows.
  Date/Author: 2026-02-01 / Codex

## Outcomes & Retrospective

Implemented the Dr.PD Device Status instrument with a full-width, one-unit layout that highlights VBUS voltage, current, derived power, and CC line voltages with a restrained color hierarchy. Added CC status badges derived from `analogMonitorCCStatusFromVoltage`, aligned in a dedicated column, and refined divider spacing and CC layout to fit within a 1-unit header. Rack device runtime state now carries DRPD driver references and transports, enabling the instrument to subscribe to live analog monitor updates without duplicating telemetry storage. Tests cover instrument listing for compatible devices and confirm that derived power is rendered from voltage and current. All tests pass with `npm run test`.

## Context and Orientation

This project is a Vite + React + TypeScript app. The rack UI is in `src/features/rack/`. The instrument system is defined by the `Instrument` base class in `src/lib/instrument/types.ts` and the rack rendering flow in `src/features/rack/RackRenderer.tsx` and `src/features/rack/RowRenderer.tsx`. Instruments are defined in `src/features/rack/instrumentCatalog.ts` and rendered in `src/features/rack/instruments/*.tsx` via a switch in `RowRenderer`.

Dr.PD device communication is implemented in `src/lib/device/drpd/`. The `DRPDDevice` class emits events when analog monitor values change and exposes `analogMonitor.getStatus()` for immediate reads. The rack device state (`RackDeviceState`) currently tracks connection status only, so instruments do not yet have a path to receive analog monitor updates.

Definitions used in this plan:

An “Instrument” is a UI component that declares a reverse-domain identifier and is filtered by compatible device identifiers. A “Rack Device Record” is the persisted entry for a connected device in the rack JSON. A “Device Runtime” is the in-memory data required to communicate with a device during a session (transport, driver, and live telemetry).

## Plan of Work

First, add device runtime plumbing so rack instruments can access DRPD analog measurements. Update the rack device runtime state type to store the DRPD driver (and transport for cleanup) alongside the record and connection status. When a device is connected in `RackView`, create a `USBTMCTransport`, open it, create a `DRPDDevice` driver, and call `connectDevice` so the driver begins analog polling. Ensure transports are closed and drivers disconnected when the device is removed or when the component unmounts. Update auto-connect to follow the same flow (open transport, create driver, connect). Extend `RackDeviceState` to include `drpdDriver` and `transport` so instrument views can subscribe to the driver’s state without copying analog snapshots into rack state. Document any new types with docblocks and `///<` field comments.

Next, add the Device Status instrument definition in `src/features/rack/instrumentCatalog.ts` with identifier `com.mta.drpd.device-status`, display name “Device Status”, `defaultLayout: 'full'`, and `defaultUnits: 2`. Register it in `getSupportedInstruments()` alongside the placeholder instrument.

Create a new instrument view component `src/features/rack/instruments/DrpdDeviceStatusInstrumentView.tsx` and a CSS module `src/features/rack/instruments/DrpdDeviceStatusInstrumentView.module.css`. The layout should match the sketch: a wide left block for VBUS voltage (largest), a middle column with VBUS current and computed power, and a right column split into DUT and US/DS CC line blocks. Use restrained color accents: one primary accent for VBUS voltage, a secondary accent for current/power, and a muted accent for CC line voltages. Use consistent type scale with 2–3 sizes total. Derive power as `vbus * ibus`, in watts, and format values with a fixed number of decimals (proposed: voltage/current/power with 2–3 decimals, CC voltages with 2 decimals). When analog monitor data is missing, render em dashes or placeholders to avoid showing stale values.

Wire the new view into `src/features/rack/RowRenderer.tsx` by adding a switch case for `com.mta.drpd.device-status`. Pass the `deviceState` (now containing `analogMonitor`) and any other required props. Keep `InstrumentBase` as the frame and ensure the close button continues to work in edit mode.

Finally, update tests. Extend `src/features/rack/__tests__/RackView.test.tsx` to assert that the Device Status instrument appears in the Add Instrument list when a Dr.PD device is present. Add a focused test near the new instrument view (or in `RackView.test.tsx` if simpler) to verify that power is displayed as the product of VBUS voltage and current when analog data is present. If new runtime state plumbing changes test setup, update mocks accordingly.

## Concrete Steps

Work in `/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/frontend`.

1) Update rack device runtime state and connection flow.
   - Edit `src/features/rack/RackRenderer.tsx` to extend the `RackDeviceState` type with `drpdDriver` and `transport` fields (with docblocks and `///<` comments).
   - Edit `src/features/rack/RackView.tsx` to create and store a `USBTMCTransport` and `DRPDDevice` when connecting or auto-connecting a device.
   - Ensure transports are closed and drivers are disconnected on disconnect or unmount.

2) Add the Device Status instrument definition.
   - Edit `src/features/rack/instrumentCatalog.ts` to add a new `DeviceStatusInstrument` class and include it in `getSupportedInstruments()`.

3) Implement the Device Status instrument view and styles.
   - Create `src/features/rack/instruments/DrpdDeviceStatusInstrumentView.tsx` for the view.
   - Create `src/features/rack/instruments/DrpdDeviceStatusInstrumentView.module.css` for layout and styling.
   - Use `InstrumentBase` and ensure edit mode close behavior is respected.
   - Show VBUS voltage, VBUS current, derived power, DUT CC1/CC2, and US/DS CC1/CC2 values.

4) Wire the view into the row renderer.
   - Edit `src/features/rack/RowRenderer.tsx` to render the new view when the instrument identifier matches.

5) Update tests.
   - Extend `src/features/rack/__tests__/RackView.test.tsx` with a test that the new instrument appears in the Add Instrument list for Dr.PD devices.
   - Add a rendering test that verifies derived power output when `analogMonitor` data is present.

6) Run tests.
   - From the repo root, run `npm run test` and record the results.

## Validation and Acceptance

Run `npm run test` and expect all tests to pass. Acceptance is satisfied when:

- The Device Status instrument appears in the Add Instrument list only when a Dr.PD device is present in the rack.
- After adding the instrument, the UI renders a header-style panel that matches the sketch’s hierarchy (VBUS voltage largest, current and power secondary, CC voltages tertiary).
- Power is computed as VBUS voltage multiplied by VBUS current and displayed with consistent formatting.
- When analog monitor data changes, the UI updates without manual refresh.

## Idempotence and Recovery

Edits are additive and safe to repeat. If tests fail due to missing WebUSB stubs, update or extend mocks in `RackView.test.tsx` and rerun `npm run test`. If a runtime connection fails, disconnect devices, refresh, and retry the connection flow; ensure transports are closed on cleanup to avoid stale USB sessions.

## Artifacts and Notes

Layout targets derived from the sketch:

- Column 1 (VBUS): large numeric voltage with a small label beneath it.
- Column 2 (Current + Power): stack of current on top and power below, each with a smaller “label” line.
- Column 3 (CC Lines): two stacked blocks labeled “DUT” and “US/DS” with CC1 and CC2 values in a two-row list.

Formatting suggestions (can be adjusted if user prefers):

- VBUS voltage: 2 decimal places (e.g., 15.20 V)
- Current: 2 decimal places (e.g., 0.85 A)
- Power: 2 decimal places (e.g., 12.92 W)
- CC voltages: 2 decimal places (e.g., 1.80 V)

## Interfaces and Dependencies

Use `USBTMCTransport` from `src/lib/transport/usbtmc.ts` and `DRPDDevice` from `src/lib/device/drpd/device.ts`. `DRPDDevice` emits `STATE_UPDATED_EVENT` and `ANALOG_MONITOR_CHANGED_EVENT` and exposes `analogMonitor.getStatus()` for initial values. `RackDeviceState` is defined in `src/features/rack/RackRenderer.tsx` and should be updated to include the DRPD driver/transport so instrument views can subscribe to driver state without duplicating telemetry storage.

Change note (2026-01-31): Created initial ExecPlan for Dr.PD instruments with Device Status as the first target and added a device runtime plumbing milestone.
Change note (2026-01-31): Updated plan to reflect instrument-driven DRPD state subscriptions and removed rack-side analog snapshot caching based on user guidance.
Change note (2026-01-31): Marked plan milestones complete, documented formatting/setpoint decisions, and recorded test results after implementing Device Status instrument.
Change note (2026-02-01): Updated plan to reflect 1-unit layout refinements, CC status badges, and alignment tweaks.
