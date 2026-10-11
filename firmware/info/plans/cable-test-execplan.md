# Cable Test mode

## Purpose and approved scope

Single-ended e-marker identity discovery on Port 1 of Dr. PD. Far end stays
unplugged. Both orientations supported. Mode > Cable Test opens a dialog; close
returns Disabled. Identity only; no SVID/mode discovery. User authorized implementation
and live validation on connected Dr. PD (USB serial 2D784F584994A97E).

## Design

A dedicated core-1 controller owns CC probing, VCONN sequencing and SOP-prime
Discover Identity. Sink policy remains disabled. Port 2 and VBUS isolated.
Start through BUS:CC:ROLE CABLE_TEST; poll CABLE:TEST? for one coherent snapshot,
including generation, evidence and raw VDOs. Polling renews a three-second lease;
loss of host, close or role change stops transmission and VCONN. Mode is never
persisted. Discovery finishes by removing VCONN and resuming Ra monitoring so
unplug/replacement clears results without leaving the marker powered.

No Ra cannot distinguish an empty port, unmarked cable or damaged cable. Ra plus
no reply means nonresponding marker or electrical/power fault. Valid GoodCRC
provides stronger evidence of a PD responder. Identity ratings are advertised,
not measured. Initial 3.x discovery supports bounded 2.0 fallback and BUSY retries.

## Work and validation

- [x] Firmware controller, GPIO initialization correction, SCPI snapshot and transient role.
- [x] TypeScript/worker/Python APIs and dialog with complete identity metadata.
- [x] Host protocol and lifecycle tests, frontend/API tests, full builds.
- [x] Generated references and authored usage documentation.
- [x] Exact-device preflight, application image update, live discovery and Disabled cleanup.
- [ ] User-assisted unplug/replug/orientation checks; report physical coverage precisely.

## Discoveries

PLANS.md not present in repository; existing firmware/info/plans format used.
VCONN GPIOs already registered. Existing Sink cable inquiry deliberately rejects
VCONN use, so Cable Test does not relax Sink policy. Documentation states about
5 mA available VCONN current; active cable compatibility requires live qualification.

## Validation evidence (2026-10-06)

- Release firmware build passed; all six host tests passed. Frontend full suite:
  89 files / 841 tests passed; after final UI ordering/revision gating, relevant
  dialog/worker and RackView suites passed again. Frontend production build passed.
- Python suite: 323 passed, one live-device smoke skipped in the sandbox. Separate
  explicitly authorized PyUSB hardware validation ran outside the USB sandbox.
- Documentation generation and production build passed. Cable Test files pass
  ESLint. Full repository lint reports 13 errors / 19 warnings; existing RackView
  errors were reproduced from HEAD through ESLint stdin, and remaining errors are
  in unrelated files.
- USB preflight found one Dr. PD, serial 2D784F584994A97E, R2605-A, firmware 0.9.26.
  Full flash backup saved and verified at
  `/tmp/drpd-before-cable-test-2D784F584994A97E.uf2`. Application-only UF2 was loaded
  and verified; resident bootloader and persistent settings were preserved.
- Actual identity received in approximately 300 ms, VCONN on CC1, communication
  on CC2, matching GoodCRC. Complete body:
  `41A800FF0000601C000000000000000043260A00`.
  Advertised passive cable, 5 A, 50 V, EPR, USB4 Gen3; VID/PID/XID zero.
  These are advertised ratings, not measured cable performance.
- Chrome/WebUSB dialog displayed the real decoded identity. Closing returned
  Disabled. GPIO-role readback confirmed both OFF. VCONN switched off after
  discovery, with both contacts returning to default Rp for removal monitoring.
- Host-loss experiment withheld CABLE:TEST? for 3.5 seconds after successful
  identity. Readback: Disabled/Unattached, CC1 OFF, CC2 OFF.
  Evidence saved at `/tmp/drpd-cable-lease-evidence.json`.
- Live testing exposed and fixed stale ADC samples in the new mode, SOP-only
  power-role filtering incorrectly rejecting cable-plug responses, and missing
  browser-worker RPC routing. Captured SOP-prime header regression is host-tested.
- User-assisted physical removal and flipped insertion remain pending. Both
  orientation classifications pass host tests; only CC1 VCONN has been physically
  demonstrated so far. Unmarked, broken-marker, legacy and active cables have
  not been physically qualified.

## Intermittent stop investigation (2026-10-06)

The existing localhost:5173 Chrome session reproduced `Invalid Cable Test
snapshot`. That is a rejected response, not direct evidence of USB loss. Added
the actual received fields to the parser error so a recurrence is diagnosable.
The malformed reply itself did not recur after refreshing/reconnecting, so its
contents and original cause remain unconfirmed.

Independently, the core-1 lease check sampled the clock before loading the atomic
core-0 renewal timestamp. A renewal crossing a millisecond boundary could look
newer than the sampled clock; unsigned subtraction then wrapped to a huge age
and stopped the session. The controller now samples the lease before the clock
and uses a signed wrap-safe elapsed comparison. Host regression cases cover a
concurrent newer renewal, the exact three-second boundary and timer wrap.

Release build and all six firmware tests pass. Application-only correction was
flashed and verified on serial 2D784F584994A97E. Identity still succeeds, and
withholding polls for 3.5 seconds still returns Disabled with both contacts OFF.
Six dialog tests and ten snapshot/API tests pass; frontend build and changed-file
lint pass. A five-minute sustained Chrome run remained at successful identity
without a read failure. Screenshot: `/tmp/drpd-cable-stable-session.jpg`.
The lease fix must not be asserted as the proven cause of the earlier malformed
response. The user's existing dialog was left open for continued observation.

## Earlier hardware compatibility review (2026-10-11)

Exported KiCad XML netlists for R2601-B, R2603-A, and R2605-A confirm the same
GPIO14/15 VCONN enables through Q401/Q402 to U403/U404, with MOSFET drains on
DUT CC1/CC2. Both role muxes have floating channel 0 and the same default-Rp
resistor paths and select GPIOs. CC routing and sensing are present on all three.
R2605-A adds shared 100-ohm R423 before both VCONN switch sources; earlier
revisions connect those sources directly to +5V. R2601-B is a historical prototype
and reports as legacy R2603-A under the current revision detector.

The existing hardware-selected BMC encoder uses DualPinLegacy on earlier boards;
CableTestController uses that encoder without replacing its mode. Removed the
R2605-A-only SCPI/menu restriction and updated the current support documentation.
No older board was physically exercised: schematic/firmware compatibility is
established, while physical cable discovery and signal quality remain unqualified.
