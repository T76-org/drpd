# DRPD App Device Connection Panel Reconciliation

This ExecPlan is a living document. The sections `Progress`,
`Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective`
must be kept up to date as work proceeds.

`python/PLANS.md` is checked in and this document is maintained in
accordance with it.

## Purpose / Big Picture

After this change, the DRPD Textual app will recover cleanly from real
USB device topology changes without requiring restart. A user can start
the app with zero devices and immediately see the connection panel.
While the app is running, the connection panel keeps reflecting current
discovered devices. If an active device is unplugged, the app falls back
to the connection panel instead of leaving stale device state in the
main screen.

This is observable by launching the app, hot-plugging a DRPD device, and
verifying that screen transitions track the connected-device set.

## Progress

- [x] (2026-02-16 19:05Z) Created dedicated worktree
      `/tmp/drpd-device-connect-disconnect` on branch
      `codex/device-connect-disconnect-panel`.
- [x] (2026-02-16 19:10Z) Audited startup, selection-screen, and
      `watch_device` flow in `python/t76/drpd/app/app.py` and
      `python/t76/drpd/app/device_selection_screen/device_selection_screen.py`.
- [x] (2026-02-16 19:19Z) Implemented periodic app-level device
      reconciliation and idempotent selection-screen show/hide behavior
      in `python/t76/drpd/app/app.py`.
- [x] (2026-02-16 19:23Z) Hardened connect/disconnect transitions in
      `watch_device` to log and recover from runtime failures.
- [x] (2026-02-16 19:25Z) Added unit tests for active-device decision
      logic in
      `python/t76/drpd/tests/test_app_device_reconciliation.py`.
- [x] (2026-02-16 19:31Z) Extracted reconciliation policy into
      `python/t76/drpd/device_reconciliation.py` so tests can run
      without importing Textual UI modules.
- [x] (2026-02-16 22:42Z) Investigated interpreter-exit `pyvisa`
      warning after unplug+quit and identified unmanaged VISA resource
      manager lifetime in `python/t76/drpd/device/device_internal.py`.
- [x] (2026-02-16 22:46Z) Updated device transport cleanup to explicitly
      close both instrument and resource manager, and made disconnect
      idempotent.
- [x] (2026-02-16 22:49Z) Added cleanup tests in
      `python/t76/drpd/tests/test_device_internal.py`.
- [x] (2026-02-16 22:43Z) Updated device connection panel to
      auto-highlight the first detected device and clear highlight when
      the list becomes empty.
- [ ] Run the full Python test suite in an environment with all runtime
      dependencies and an attached DRPD device for manual hot-plug
      acceptance.

## Surprises & Discoveries

- Observation: Startup logic assumed at least one discovered device and
  indexed `devices[0]` in the non-multi-device path.
  Evidence: `python/t76/drpd/app/app.py` previously executed
  `logging.info('Found device %s', devices[0])` in the `else` path, which
  also handled `len(devices) == 0`.

- Observation: Device connection panel already had self-refresh behavior
  via `set_interval(1.0, self.discover_devices)`.
  Evidence:
  `python/t76/drpd/app/device_selection_screen/device_selection_screen.py`.

- Observation: Importing `t76.drpd.app` in this environment fails because
  `textual` is not installed.
  Evidence: `python3 -m unittest t76.drpd.tests.test_app_device_reconciliation`
  initially raised `ModuleNotFoundError: No module named 'textual'`.

- Observation: The unplug+quit warning originates from `pyvisa`
  `ResourceManager` cleanup at interpreter shutdown, not from app UI
  navigation state.
  Evidence: traceback shows `pyvisa.highlevel.call_close -> resource.close
  -> disable_event -> VI_ERROR_INV_OBJECT`.

## Decision Log

- Decision: Keep panel self-updates inside
  `DeviceSelectionScreen.discover_devices()` and add app-level periodic
  reconciliation for top-level state transitions.
  Rationale: This keeps the panel behavior unchanged and isolates
  navigation/active-device control in one place (`DRPDApp`).
  Date/Author: 2026-02-16 / Codex

- Decision: Only auto-connect a single device at startup; after runtime
  disconnect, return to explicit selection panel interaction.
  Rationale: Requirement states disconnect should return to connection
  panel. Startup convenience is retained without bypassing disconnect
  recovery behavior.
  Date/Author: 2026-02-16 / Codex

- Decision: Add small unit tests for deterministic reconciliation logic
  rather than deep Textual screen-integration tests.
  Rationale: This guards policy decisions (0/1/many devices and discovery
  failures) while keeping tests stable and fast in CI.
  Date/Author: 2026-02-16 / Codex

- Decision: Move reconciliation policy to a top-level helper module
  (`python/t76/drpd/device_reconciliation.py`) and keep `DRPDApp` as the
  orchestration layer.
  Rationale: This permits running policy tests even when UI dependencies
  are unavailable in the runtime.
  Date/Author: 2026-02-16 / Codex

- Decision: Manage VISA resource manager lifetime explicitly inside
  `DeviceInternal` and close it during disconnect.
  Rationale: Avoids deferred cleanup at interpreter shutdown touching
  invalid unplugged sessions and removes noisy warning path.
  Date/Author: 2026-02-16 / Codex

## Outcomes & Retrospective

Implemented outcomes:

1. Zero-device startup now reliably shows the connection panel.
2. The app periodically reconciles discovery results and current active
   device.
3. Active-device disconnect detection now transitions back to the
   selection panel.
4. Connect/disconnect cleanup failures are handled with warnings/errors
   and recovery to `device=None`.
5. Unit tests now verify selection policy decisions independently of the
   Textual runtime.
6. Device transport disconnect is now idempotent and closes both VISA
   instrument and resource manager explicitly.
7. Device selection screen now highlights the first discovered device by
   default for faster keyboard-driven selection.

Remaining gap:

- Manual device hot-plug acceptance run is still required on hardware to
  validate behavior end-to-end in the Textual runtime.

## Context and Orientation

The DRPD terminal UI lives under `python/t76/drpd/app/`.

- `python/t76/drpd/app/app.py` defines `DRPDApp`, the top-level Textual
  `App` that controls screen stack and selected device.
- `python/t76/drpd/app/device_selection_screen/device_selection_screen.py`
  defines the connection panel UI and discovers devices every second.
- `python/t76/drpd/device/discovery.py` performs USB discovery and returns
  `Device` objects.

In this repo, "connection panel" means the `DeviceSelectionScreen` shown
when no active device is selected. "Reconciliation" means comparing the
current active device against the newly discovered device list and
choosing whether to keep, clear, or auto-select an active device.

## Plan of Work

Milestone 1 introduces app-level reconciliation in
`python/t76/drpd/app/app.py`:

- Add a startup refresh that handles zero/one/many devices safely.
- Add an interval refresh to detect runtime connect/disconnect changes.
- Add explicit helper methods to show/hide the selection panel without
  duplicate pushes/pops.

Milestone 2 hardens transition reliability in `watch_device`:

- Wrap analog monitor stop and disconnect of old device with recovery
  logging.
- Wrap connect/config/bootstrap for new device and fall back to
  `self.device = None` when connection fails.

Milestone 3 adds tests in `python/t76/drpd/tests/`:

- Verify active-device choice policy for connected/disconnected/current
  cases.

## Concrete Steps

From `python/` run:

    python3 -m pytest t76/drpd/tests/test_app_device_reconciliation.py

For full suite (when dependencies are available):

    ./run_tests.sh

Manual acceptance from `python/`:

    python3 -m t76.drpd

Expected behavior:

- If no DRPD devices are connected at startup, the connection panel is
  visible.
- If device list changes while panel is visible, options update within
  roughly one second.
- If connected device is unplugged while on main screen, app returns to
  connection panel without crashing.

## Validation and Acceptance

Automated acceptance:

- `python3 -m pytest t76/drpd/tests/test_app_device_reconciliation.py`
  should pass all tests.

Behavioral acceptance on hardware:

1. Start with no devices and launch app; confirm connection panel shown.
2. Plug one device; confirm panel updates with a selectable entry.
3. Select device and reach main screen.
4. Unplug selected device; confirm automatic return to connection panel.

## Idempotence and Recovery

- App-level refresh is idempotent: each cycle recomputes state from
  current discovery results.
- If discovery fails transiently, app treats it as empty list and keeps
  running.
- If device connect fails after selection, app clears active device and
  returns to selection panel on the next reconciliation cycle.

## Artifacts and Notes

Relevant changed files:

- `python/t76/drpd/app/app.py`
- `python/t76/drpd/tests/test_app_device_reconciliation.py`

## Interfaces and Dependencies

No external interface changes were introduced. Internal interfaces added:

- `DRPDApp.choose_active_device(current_device, discovered_devices,
  allow_auto_connect_single) -> Optional[Device]`
- `DRPDApp._refresh_devices(allow_auto_connect_single=False) -> None`
- `DRPDApp._discover_devices() -> List[Device]`
- `DRPDApp._show_device_selection() -> None`
- `DRPDApp._hide_device_selection() -> None`
- `choose_active_device(current_device, discovered_devices,
  allow_auto_connect_single) -> Optional[Device]` in
  `python/t76/drpd/device_reconciliation.py`

These helpers centralize device-state policy in `DRPDApp` and preserve
existing `DeviceSelectionScreen` discovery behavior.

Revision Note (2026-02-16 / Codex): Initial version created after
implementing reconciliation and tests so future contributors can execute,
verify, and extend this behavior without prior context.
Updated to include the extracted dependency-free reconciliation helper
module after discovering Textual was unavailable in this runtime.
Updated to include pyvisa shutdown-warning investigation and explicit
resource-manager cleanup changes.
