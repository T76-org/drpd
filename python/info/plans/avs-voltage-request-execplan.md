# DRPD Python App AVS Voltage Request Support (SPR + EPR)

This ExecPlan is a living document. The sections `Progress`,
`Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective`
must be kept up to date as work proceeds.

`python/PLANS.md` is checked in and this document is maintained in
accordance with it.

## Purpose / Big Picture

After this change, the Python DRPD Textual app will let a user request
AVS contracts directly from the sink PDO table, not just PPS or fixed
PDOs. When the source advertises `SPR_AVS` or `EPR_AVS`, selecting that
row will open a setup flow where the user enters a target voltage and
submits a request. The app will send the same SCPI request path already
used by PPS (`SINK:PDO <index> <voltage_mv> <current_ma>`), so behavior
stays consistent with firmware policy for both SPR and EPR AVS.

This is observable by connecting to an AVS-capable source, selecting an
`SPR_AVS` or `EPR_AVS` PDO in the sink table, entering a voltage, and
seeing negotiated voltage/current update in the sink panel.

## Progress

- [x] (2026-02-20 00:00Z) Audited current PPS request flow in
      `python/t76/drpd/app/main_screen/sink_panel.py` and
      `python/t76/drpd/app/main_screen/sink_pps_setup_modal.py`.
- [x] (2026-02-20 00:00Z) Confirmed `DeviceSink.set_pdo(...)` already
      supports AVS requests through SCPI command `SINK:PDO`.
- [x] (2026-02-20 00:00Z) Confirmed firmware sink policy already handles
      `SPR_AVS` and `EPR_AVS` in augmented request path.
- [x] (2026-02-20 00:00Z) Authored this ExecPlan at
      `python/info/plans/avs-voltage-request-execplan.md`.
- [ ] Implement AVS setup modal and sink-panel routing.
- [ ] Add/adjust tests for AVS request behavior and regressions.
- [ ] Run targeted Python tests and record acceptance evidence.
- [ ] Validate manually against AVS-capable hardware source (SPR + EPR).

## Surprises & Discoveries

- Observation: AVS PDO parsing already exists end-to-end in Python
  device models (`SPR_PDOAVs`, `EPR_PDOAVs`), and AVS rows are already
  shown in the sink PDO table.
  Evidence: `python/t76/drpd/device/device_sink_pdos.py` and
  `python/t76/drpd/app/main_screen/sink_panel.py` currently render
  `SPR_AVS` and `EPR_AVS` types.

- Observation: UI request handling is currently asymmetric.
  Fixed PDOs are requested directly, PPS opens a modal, but AVS rows do
  nothing when selected.
  Evidence: `on_pdo_table_pdo_selected(...)` in
  `python/t76/drpd/app/main_screen/sink_panel.py` only branches for
  `FixedPDO` and `SPR_PDOPPS`.

- Observation: The firmware request path already chooses the correct AVS
  request semantics (including current derivation/clamping) once the app
  sends `SINK:PDO` with index and voltage/current values.
  Evidence: `_requestAugmentedPDO(...)` in
  `firmware/lib/logic/sink/state_handlers/select_capability.cpp` has
  dedicated branches for `SPRAVSAPDO` and `EPRAVSAPDO`.

## Decision Log

- Decision: Keep transport/API unchanged and reuse
  `DeviceSink.set_pdo(index, voltage_mv, current_ma)` for AVS requests.
  Rationale: The SCPI interface and sink firmware policy already support
  AVS through this call, so app work is primarily UI and validation.
  Date/Author: 2026-02-20 / Codex

- Decision: Introduce a dedicated AVS setup modal instead of expanding
  the existing PPS modal with many mode-specific conditionals.
  Rationale: AVS constraints are power-limited (not one max-current
  field), so a dedicated modal keeps validation and defaults explicit and
  easier to maintain.
  Date/Author: 2026-02-20 / Codex

- Decision: AVS modal will require voltage input and make current input
  optional, defaulting to `0` (firmware computes best allowed current for
  the chosen AVS PDO and voltage).
  Rationale: The user asked for requesting AVS voltages specifically; a
  voltage-first UX avoids duplicating complex AVS current-band/power math
  in Textual UI while preserving advanced override if provided.
  Date/Author: 2026-02-20 / Codex

## Outcomes & Retrospective

Current outcomes (planning phase):

1. Identified that no low-level protocol changes are needed in Python.
2. Scoped implementation to app-layer modal routing, input validation,
   and tests.
3. Confirmed firmware behavior is already compatible for both SPR and
   EPR AVS requests.

Remaining work:

- Implement AVS modal and selection wiring.
- Add automated tests for selection behavior and validation.
- Execute runtime verification against real AVS-capable hardware.

## Context and Orientation

The DRPD Python app sink request flow spans three layers.

`python/t76/drpd/app/main_screen/sink_panel.py` renders discovered PDOs
and handles row selection. Right now:

- `FixedPDO` selection immediately calls `device.sink.set_pdo(...)`.
- `SPR_PDOPPS` selection opens `SinkPPSSetupModal`.
- `SPR_PDOAVs` and `EPR_PDOAVs` have no request handler.

`python/t76/drpd/app/main_screen/sink_pps_setup_modal.py` provides the
current example for modal input validation, default value loading from
negotiated sink status, and SCPI submission.

`python/t76/drpd/device/device_sink.py` is the app transport surface.
`set_pdo(index, voltage_mv, current_ma)` sends SCPI command:

- `SINK:PDO <index> <voltage_mv> <current_ma>`

The firmware already maps this call to fixed/variable/battery/PPS/AVS
policy in sink logic, including AVS-specific voltage clamp and current
selection.

In this plan:

- AVS means adjustable-voltage augmented PDOs represented by
  `SPR_PDOAVs` and `EPR_PDOAVs` in Python.
- SPR AVS means standard-power-range AVS advertised in SPR source
  capabilities.
- EPR AVS means extended-power-range AVS advertised after EPR capability
  exchange.

## Plan of Work

### Milestone 1: Add AVS setup modal and route PDO selection

Create `python/t76/drpd/app/main_screen/sink_avs_setup_modal.py` as a
new Textual `ModalScreen` specialized for AVS PDOs.

It should accept:

- `device: Device`
- `pdo_index: int`
- `pdo: SPR_PDOAVs | EPR_PDOAVs`

The modal should follow the same operational pattern as PPS modal:

- show voltage input with min/max placeholder and validator
- optionally show current input (amps) for manual override
- load defaults from negotiated status when available
- submit via `await device.sink.set_pdo(pdo_index, voltage_mv, current_ma)`
- show inline error messages for invalid input or SCPI failure

Voltage validation is mandatory and must clamp/reject outside PDO range.
Current validation (if entered) should reject negative values and convert
A to mA. If current is blank, send `0` to defer current derivation to
firmware AVS policy.

Update `python/t76/drpd/app/main_screen/sink_panel.py`:

- import `SinkAVSSetupModal`
- in `on_pdo_table_pdo_selected(...)`, add branch for
  `SPR_PDOAVs` and `EPR_PDOAVs` to open AVS modal.

No behavior change is needed in `DeviceSink` transport methods.

### Milestone 2: Keep styling and UX coherent

Update `python/t76/drpd/app/app.tcss` only as needed so the AVS modal is
readable and visually aligned with the existing PPS modal.

Preferred approach is to reuse existing modal classes where possible
(`.pps-modal-screen`, `.pps-modal-label`, input row layout) and only add
new selectors when IDs differ.

Ensure keyboard behavior parity with PPS modal:

- Escape cancels.
- Enter in input submits.

### Milestone 3: Add automated tests for AVS request behavior

Add tests that cover new app behavior without requiring hardware.

1. Extend sink-panel behavior tests (new file if needed, for example
   `python/t76/drpd/tests/test_sink_panel_pdo_selection.py`) to assert:

   - selecting `SPR_PDOAVs` pushes AVS modal
   - selecting `EPR_PDOAVs` pushes AVS modal
   - existing fixed/PPS selection behavior remains unchanged

2. Add modal input/submit tests for AVS modal (new file, for example
   `python/t76/drpd/tests/test_sink_avs_setup_modal.py`) to assert:

   - out-of-range voltage is rejected
   - blank voltage is rejected
   - blank current submits `current_ma=0`
   - valid voltage/current produces expected `set_pdo` call arguments

Use `AsyncMock`/`MagicMock` and isolate from USB dependencies.

### Milestone 4: Manual acceptance on AVS-capable source

Run app against hardware and verify both paths:

- SPR AVS source contract request from AVS row
- EPR AVS source contract request from AVS row after EPR entry

Confirm sink panel updates negotiated voltage/current and no app errors
are logged for nominal requests.

## Concrete Steps

From repository root:

    cd python

Implement and run targeted tests incrementally:

    python3 -m pytest t76/drpd/tests/test_device_sink.py
    python3 -m pytest t76/drpd/tests/test_panel_fault_tolerance.py
    python3 -m pytest t76/drpd/tests/test_sink_panel_pdo_selection.py
    python3 -m pytest t76/drpd/tests/test_sink_avs_setup_modal.py

If these pass, run broader suite as environment permits:

    ./run_tests.sh

Manual runtime check:

    cd python
    python3 -m t76.drpd

Expected interactive behavior:

- Selecting `SPR_AVS` or `EPR_AVS` opens AVS modal.
- Entering valid voltage and confirming sends request without crash.
- Sink panel negotiated setpoints update after contract transition.

## Validation and Acceptance

Automated acceptance criteria:

1. New AVS modal tests pass.
2. Existing sink request tests continue to pass (no regressions in
   `DeviceSink` or sink panel fault tolerance).

Behavioral acceptance criteria on hardware:

1. With an SPR AVS-capable source, selecting an SPR AVS PDO and entering
   a valid voltage results in successful renegotiation.
2. With an EPR AVS-capable source, selecting an EPR AVS PDO and entering
   a valid voltage results in successful renegotiation while in EPR mode.
3. Invalid AVS input is blocked in UI with inline error messaging and no
   crash.

## Idempotence and Recovery

This change is idempotent at the app layer:

- Re-opening the AVS modal repeatedly does not alter device state until
  the user confirms.
- If SCPI request fails, modal remains open and shows error so the user
  can retry or cancel.
- Existing fixed/PPS flows remain available even if AVS request fails.

If tests fail during implementation, recover by:

- running the specific failing test module first
- isolating modal validation logic from transport mocks
- verifying sink panel selection branching did not regress fixed/PPS
  paths

## Artifacts and Notes

Key implementation targets:

- `python/t76/drpd/app/main_screen/sink_panel.py`
- `python/t76/drpd/app/main_screen/sink_avs_setup_modal.py` (new)
- `python/t76/drpd/app/app.tcss` (if selector additions are needed)
- `python/t76/drpd/tests/test_sink_panel_pdo_selection.py` (new)
- `python/t76/drpd/tests/test_sink_avs_setup_modal.py` (new)

Reference behavior source:

- `python/t76/drpd/app/main_screen/sink_pps_setup_modal.py`

## Interfaces and Dependencies

No external protocol/interface changes are required.

Internal app additions required by this plan:

- New class
  `t76.drpd.app.main_screen.sink_avs_setup_modal.SinkAVSSetupModal`
  with constructor:
  `__init__(device: Device, pdo_index: int, pdo: SPR_PDOAVs | EPR_PDOAVs, ...)`

- Updated sink-panel selection branch in
  `SinkPanel.on_pdo_table_pdo_selected(...)` to route AVS PDOs to the new
  modal.

Existing dependency paths to keep unchanged:

- `DeviceSink.set_pdo(...)` command semantics.
- SCPI command `SINK:PDO` handled by firmware sink policy.

Revision Note (2026-02-20 / Codex): Initial ExecPlan created after
reviewing current PPS implementation and sink firmware AVS request path.
Chose a dedicated AVS modal with voltage-first UX to satisfy "requesting
AVS voltages" while reusing existing transport and policy logic.
