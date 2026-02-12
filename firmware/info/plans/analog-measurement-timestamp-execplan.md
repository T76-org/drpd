
# Add 64-bit capture timestamp to `MEASure:ALL?` analog snapshot

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, `MEASure:ALL?` will include a 64-bit timestamp in microseconds that indicates when the VBUS values were captured. Users will be able to correlate measurements with CC-bus captures and trigger events without guessing timing. You can see this working by querying `MEASure:ALL?` and confirming that the response includes a leading timestamp field and the expected measurement payload.

## Progress

- [x] (2026-02-10 03:52Z) Audited current analog measurement flow, SCPI handlers, SCPI YAML command docs, and build/generation wiring.
- [x] (2026-02-10 03:52Z) Authored initial ExecPlan for firmware, SCPI response format, tooling/docs, and validation coverage.
- [x] (2026-02-10 03:59Z) Narrowed timestamp scope to `MEASure:ALL?` only and reconciled plan sections for consistency.
- [x] (2026-02-10 04:12Z) Corrected approach: SCPI must not trigger ADC reads; timestamp must be captured by periodic analog sampling path.
- [x] (2026-02-10 04:22Z) Refined sampling semantics: removed `readAllValues()`, timestamp now updates only inside `readVBusValues()`.
- [x] (2026-02-10 04:05Z) Implemented analog snapshot timestamp capture in `lib/phy/analog_monitor.hpp` and `lib/phy/analog_monitor.cpp`.
- [x] (2026-02-10 04:14Z) Moved snapshot ownership to periodic task (`App::_loop()`), and made `MEASure:ALL?` handler read-only against cached values.
- [x] (2026-02-10 04:05Z) Updated `lib/app/scpi.yaml` analog documentation and regenerated `lib/app/scpi_commands.cpp` via build.
- [x] (2026-02-10 04:05Z) Updated `scpi_test.py` monitor parsing/printing for timestamped `MEAS:ALL?` responses.
- [ ] Build firmware and run the defined host-side command checks (completed: full firmware build and SCPI generation, plus rebuild after periodic-task ownership fix; remaining: live device command checks).
- [x] (2026-02-10 04:05Z) Recorded outcomes and retrospective for this implementation pass.

## Surprises & Discoveries

- Observation: `MEASure:ALL?` documentation currently says “space-separated values,” but the implementation sends comma-separated values.
  Evidence: `lib/app/scpi.yaml` description for `MEASure:ALL?` vs. string concatenation with `","` in `lib/app/app_scpi_analog_monitor.cpp`.

- Observation: SCPI command trie/source generation is tied to CMake target `GenerateSCPICommands`, and generation currently runs a Python venv + pip install chain.
  Evidence: `instrument-core/t76/scpi/CMakeLists.txt` custom command for `${T76_SCPI_OUTPUT_FILE}`.

- Observation: SCPI generation succeeded offline in this environment because required dependency (`PyYAML`) was already present in the build venv.
  Evidence: build output included `Requirement already satisfied: PyYAML` and generated `lib/app/scpi_commands.cpp`.

- Observation: The main FreeRTOS loop already performs periodic analog sampling work and is the correct place to stamp snapshot timing; SCPI handlers should remain read-only accessors of cached values.
  Evidence: `App::_loop()` in `lib/app/app.cpp` runs continuously with `vTaskDelay(pdMS_TO_TICKS(10))` and calls analog monitor sampling methods.

## Decision Log

- Decision: Use microseconds (`uint64_t`) as the timestamp unit and transport it as the first CSV field in `MEASure:ALL?`.
  Rationale: The firmware already uses microsecond-resolution timestamps (`SYSTem:TIMEstamp?`, CC capture metadata), so this keeps all time-correlation paths in one unit and avoids conversion ambiguity.
  Date/Author: 2026-02-10 / Codex

- Decision: Define timestamp semantics as “VBUS capture time in firmware” and keep SCPI handlers read-only.
  Rationale: Acquisition is owned by periodic sampling; SCPI queries must not trigger conversions and should report the latest cached state.
  Date/Author: 2026-02-10 / Codex

- Decision: Keep command names unchanged; evolve only `MEASure:ALL?` payload by prepending a timestamp field.
  Rationale: This satisfies the requested scope while minimizing compatibility impact for clients that depend on existing single-measurement command formats.
  Date/Author: 2026-02-10 / Codex

- Decision: `MEASure:ALL?` must never force a new ADC capture; it returns the latest periodically sampled snapshot and timestamp.
  Rationale: SCPI query latency and behavior should not perturb acquisition timing, and acquisition ownership belongs to the periodic FreeRTOS task.
  Date/Author: 2026-02-10 / Codex

## Outcomes & Retrospective

Implemented in code:

- `AnalogMonitorReadings` now includes `captureTimestampUs` (`uint64_t`).
- Timestamp capture occurs only in `AnalogMonitor::readVBusValues()` and reflects VBUS capture completion time.
- `App::_loop()` keeps periodic acquisition ownership by calling `readVBusValues()` on its existing cadence.
- `_measureAllAnalogValues` prepends cached timestamp in the SCPI CSV response and does not trigger conversions.
- Updated `MEASure:ALL?` documentation in `lib/app/scpi.yaml` to describe comma-separated output with leading VBUS capture timestamp.
- Updated `scpi_test.py` monitor path to parse and print the timestamp from `MEAS:ALL?`.

Validation completed:

- `cmake -S . -B build` succeeded.
- `cmake --build build -j` succeeded.
- SCPI code generation ran and regenerated `lib/app/scpi_commands.cpp`.

Remaining gap:

- Live hardware command validation (`python3 scpi_test.py send "MEASure:ALL?"` and `python3 scpi_test.py monitor`) was not run in this implementation pass.

## Context and Orientation

Analog measurements are managed by `T76::DRPD::PHY::AnalogMonitor` in `lib/phy/analog_monitor.hpp` and `lib/phy/analog_monitor.cpp`. The monitor currently stores voltage/current values but no explicit capture timestamp metadata. SCPI command handlers for analog measurements live in `lib/app/app_scpi_analog_monitor.cpp`, with declarations in `lib/app/app.hpp`. SCPI command syntax and command descriptions are declared in `lib/app/scpi.yaml`, and generated trie/dispatch code is emitted to `lib/app/scpi_commands.cpp`.

In this repository, “capture timestamp” means a monotonic microsecond count represented as an unsigned 64-bit integer (`uint64_t`) generated by firmware when `readVBusValues()` completes. “Corresponding SCPI commands” means ONLY this analog measurement query command:

- `MEASure:ALL?`

Host-side examples currently parse these responses in `scpi_test.py`, especially `monitor_analog_values()`. That script must be updated to reflect the new response format and serve as practical usage documentation.

## Milestones

### Milestone 1: Add timestamped analog snapshot data in the PHY layer

At the end of this milestone, the analog monitor can provide both measurement values and a 64-bit capture timestamp produced during `readVBusValues()`. Implement this by extending the analog reading data model in `lib/phy/analog_monitor.hpp` and updating `lib/phy/analog_monitor.cpp` so VBUS capture and timestamp are written together. Keep mutex behavior intact so VBUS value/timestamp pairs remain coherent. Run a build after this milestone to catch type/signature issues before SCPI work.

### Milestone 2: Surface timestamps through the specified SCPI commands

At the end of this milestone, `MEASure:ALL?` returns timestamped data while single-measurement commands keep their existing response shape. Update `lib/app/app_scpi_analog_monitor.cpp` so `MEASure:ALL?` returns one timestamp plus the full measurement vector from cached readings only (no forced sampling in handler). Preserve existing command names and response transport path (`_usbInterface.sendUSBTMCBulkData`).

### Milestone 3: Update SCPI documentation and host script expectations

At the end of this milestone, command docs describe the new `MEASure:ALL?` payload format, generated SCPI command code is refreshed, and `scpi_test.py` correctly parses and displays the timestamped all-measurement snapshot. Update `lib/app/scpi.yaml` descriptions for affected commands, regenerate `lib/app/scpi_commands.cpp`, and modify `scpi_test.py` monitor output labels/parsing to include the `MEASure:ALL?` timestamp. Validate with build + live command checks.

## Plan of Work

Start in `lib/phy/analog_monitor.hpp` by extending `AnalogMonitorReadings` with timestamp metadata. Use explicit names that document units, for example `captureTimestampUs` for VBUS capture time. Keep types fixed-width (`uint64_t`) and document units in comments.

In `lib/phy/analog_monitor.cpp`, update measurement capture routines so timestamps are recorded only in `readVBusValues()`. Stamp once at a deterministic point after VBUS voltage/current sampling completes and document that behavior inline.

In `lib/app/app.cpp`, keep the periodic FreeRTOS loop sampling path task-driven via `readVBusValues()` on its existing cadence.

In `lib/app/app_scpi_analog_monitor.cpp`, update `_measureAllAnalogValues` to emit timestamp-first CSV output from cached monitor readings. Keep all single-measurement `_measure*` handlers unchanged so their existing response contracts remain stable.

In `lib/app/scpi.yaml`, revise command descriptions to define the new `MEASure:ALL?` response schema, including timestamp type (`uint64`), units (microseconds), and value ordering. Also correct the existing separator mismatch by describing comma-separated output.

Regenerate `lib/app/scpi_commands.cpp` using the repository’s normal generation path. Do not hand-edit generated trie content.

Update `scpi_test.py` so `monitor_analog_values()` and related helper output parse the timestamp-first format and print timestamp in a compact human-readable way while preserving existing analog value formatting.

## Concrete Steps

Run the following from repository root (`/Users/marcot/Library/CloudStorage/Dropbox/HardwareProjects/drpd/firmware`):

    rg -n "AnalogMonitorReadings|allReadings|_measureAllAnalogValues|MEASure:ALL\\?" lib/phy lib/app scpi_test.py

Edit files:

- `lib/phy/analog_monitor.hpp`
- `lib/phy/analog_monitor.cpp`
- `lib/app/app.cpp`
- `lib/app/app.hpp` (only if helper declarations or return-shape helpers are introduced)
- `lib/app/app_scpi_analog_monitor.cpp`
- `lib/app/scpi.yaml`
- `scpi_test.py`

Regenerate SCPI generated source through the build flow:

    cmake -S . -B build
    cmake --build build -j

If the environment already has configured build artifacts, rerunning `cmake --build build -j` is acceptable and should refresh `lib/app/scpi_commands.cpp` through `GenerateSCPICommands` when YAML changed.

## Validation and Acceptance

Validation must prove behavior, not just compilation.

1. Build succeeds with no new compile errors:

       cmake -S . -B build
       cmake --build build -j

2. Static response-shape checks in source:

       rg -n "MEASure:ALL\\?|_measureAllAnalogValues|captureTimestampUs|timestamp" lib/app lib/phy scpi_test.py

3. Device command checks (using connected hardware and existing script):

       python3 scpi_test.py send "MEASure:ALL?"
       python3 scpi_test.py monitor

Expected acceptance behavior:

- `MEASure:ALL?` returns 10 comma-separated fields where field 0 is a decimal 64-bit timestamp in microseconds and fields 1-9 keep the existing analog value order.
- Single analog queries (for example `MEASure:VOLTage:VBUS?`) keep their existing payload format without timestamp.
- Repeated `MEASure:ALL?` queries do not trigger new conversions; timestamps advance only when periodic `readVBusValues()` runs.
- The timestamp represents VBUS capture time, not a simultaneous capture time for CC/reference values.
- `scpi_test.py monitor` prints a timestamp column and continues to print all analog values without index errors.
- SCPI YAML descriptions match actual payloads (`MEASure:ALL?` timestamp present, comma-separated order documented; single-value commands unchanged unless explicitly updated for wording clarity).

## Idempotence and Recovery

All edits are additive/transformational and safe to reapply. If response formatting breaks clients during development, use `git diff` to verify field ordering and ensure timestamp is first only for `MEASure:ALL?`. Generated file drift should be resolved by rebuilding (`cmake --build build -j`) rather than manual edits to `lib/app/scpi_commands.cpp`.

If build fails after SCPI YAML edits, verify the YAML syntax first, then rerun build. If host script parsing fails, compare received token count in `scpi_test.py` against the defined response schema and adjust indexing accordingly.

## Artifacts and Notes

Expected response examples after implementation:

    MEASure:ALL?
    1234567890,20.012,0.431,0.611,0.010,0.598,0.004,3.301,0.002,0.015

    MEASure:VOLTage:VBUS?
    20.012

    MEASure:VOLTage:CC:DUT1?
    0.611

Note: Numeric precision of floating-point fields depends on `std::to_string` formatting unless explicitly changed.

## Interfaces and Dependencies

The implementation must preserve these interfaces and behaviors:

- `T76::DRPD::PHY::AnalogMonitorReadings` in `lib/phy/analog_monitor.hpp` gains timestamp field(s) using `uint64_t`.
- `T76::DRPD::PHY::AnalogMonitor::allReadings() const` continues returning `AnalogMonitorReadings`, now including timestamp metadata.
- `T76::DRPD::App::_loop()` in `lib/app/app.cpp` owns periodic acquisition and timestamp updates for `MEASure:ALL?`.
- Existing SCPI handler entrypoints in `T76::DRPD::App` remain callable by generated command dispatch:
  - `_measureAllAnalogValues(const std::vector<T76::SCPI::ParameterValue> &)`
  - All existing single-value `_measure*` handlers remain compatible with their current response shape (no timestamp added).

Use existing Pico SDK time primitives already used in this firmware codebase for microsecond timestamps. Keep output transport through `_usbInterface.sendUSBTMCBulkData(...)` unchanged.

## Plan Revision Note

Added this initial ExecPlan on 2026-02-10 to define end-to-end implementation of timestamped analog measurements, including SCPI payload changes and documentation/script updates, because the repository previously contained only generic ExecPlan guidance and no feature-specific plan.

Updated on 2026-02-10 to narrow scope so only `MEASure:ALL?` includes the timestamp, and to align milestones, implementation steps, validation criteria, and examples with that requirement.

Updated on 2026-02-10 to enforce acquisition ownership: periodic FreeRTOS sampling updates timestamped snapshots, while SCPI reads cached data without forcing conversions.

Updated on 2026-02-10 to remove `readAllValues()` and define timestamp semantics explicitly as VBUS capture time from `readVBusValues()`.
