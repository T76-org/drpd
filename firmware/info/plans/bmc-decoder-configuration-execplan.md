# Persisted BMC Decoder Configuration

This ExecPlan tracks issue #210. It must remain current while implementation proceeds.

## Purpose

Allow operators to query, change, persist, and individually reset the BMC decoder CC reference
voltage and PWM frequency. Changes apply immediately, while firmware-owned constraints prevent
values outside the supported electrical and PWM ranges.

## Implementation

1. Replace hardcoded decoder defaults with overridable CMake cache variables and compile the
   defaults, bounds, and legal increments into firmware.
2. Add a version 5 persistent configuration slice owned by `BMCDecoder`, including migrations
   from versions 1 through 4.
3. Add BMC decoder apply/export and live PWM reconfiguration behavior. SCPI handlers validate,
   persist, report save failure, and only then apply accepted settings.
4. Define query, set, and per-setting reset commands under
   `SYSTem:CONFiguration:PHY:BMCDecoder:CC:VREF` in `scpi.yaml`, then regenerate dispatch code.
5. Add matching Python and TypeScript APIs, worker forwarding, and tests.
6. Add Device > Calibrate > Internal settings UI using existing menu/dialog controls, with a persisted
   safety-warning preference, staged edits, per-field defaults, validation, and Apply/Cancel.
7. Regenerate SCPI and Python documentation, update frontend/user guides, and run focused plus
   full builds and tests.

## Acceptance

- VREF accepts 0.20 V through 2.50 V on a 0.05 V grid.
- PWM frequency accepts 10,000 Hz through 500,000 Hz on a 1,000 Hz grid.
- Invalid input and flash-save failures do not change effective runtime settings.
- Valid changes survive reboot and reset commands restore build-time defaults.
- Python, TypeScript, UI, and generated documentation expose the same command contract.

## Progress

- [x] Issue #210 created and isolated branch created.
- [x] Firmware configuration, persistence, runtime application, SCPI, and tests.
- [x] Python and TypeScript APIs and tests.
- [x] Frontend warning/settings workflow and tests.
- [x] Generated and authored documentation.
- [x] Full validation. Firmware, Python, focused frontend, frontend build, and docs build pass.
  Repo-wide frontend test/lint retain unrelated baseline failures in RackView style/menu tests and
  existing React lint rules; issue-focused tests and lint pass.
