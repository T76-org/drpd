# Dr. PD Firmware Updater

This document describes the frontend firmware update flow for connected Dr. PD devices. The updater checks the firmware version installed on the connected device, compares it against release metadata, prompts the user when a newer eligible firmware exists, and uploads the selected UF2 through the resident WinUSB updater.

## Version format

Firmware versions must use one of these formats:

- Stable: `x.y.z`
- Beta: `x.y.z-beta.k`

`x`, `y`, and `z` are semantic version numbers. `k` is a positive integer that increments for beta releases of the same base version.

Ordering rules:

- Compare `major`, then `minor`, then `patch`.
- For the same `x.y.z`, stable is newer than beta.
- Beta versions with the same base version compare by beta number.

Examples:

- `1.5.0-beta.1 < 1.5.0-beta.2 < 1.5.0`
- `1.5.0 > 1.4.9`
- `2.0.0-beta.1 > 1.9.9`

Version parsing and comparison live in `src/lib/firmware/version.ts`.

## Release discovery

The frontend fetches release metadata from GitHub Releases:

`https://api.github.com/repos/T76-org/drpd/releases`

The updater does not use GitHub's latest-release endpoint because beta-channel selection needs all releases. Draft releases are ignored. Release tags are parsed as firmware versions; a leading `v` is accepted and normalized internally. Invalid tags are skipped with a console log.

GitHub release classification:

- `prerelease == false` means stable.
- `prerelease == true` means beta.

The release tag and GitHub `prerelease` flag must agree. A beta tag on a stable GitHub release, or a stable tag on a GitHub prerelease, is skipped.

Release normalization and channel selection live in `src/lib/firmware/releases.ts`.

## Firmware asset location

The browser does not download the UF2 from GitHub Release asset URLs because those URLs do not provide the CORS behavior needed by the frontend. The UF2 download URL is derived from the normalized version:

`https://t76.org/drpd/releases/<version>/drpd-firmware-combined.uf2`

For example:

`https://t76.org/drpd/releases/0.9.9/drpd-firmware-combined.uf2`

The file at that URL must be the combined UF2 for the same release version.

## Update channels

The frontend supports two firmware update channels:

- `production`
- `beta`

The selected channel is explicit user preference, not inferred from the connected device. It is persisted in local storage through `src/lib/firmware/preferences.ts`.

Channel behavior:

- Production users receive only stable releases.
- Beta users receive the newest version among stable and beta releases.
- Beta users can move automatically from a beta release to a newer stable release.
- Production users are never offered beta firmware.
- If the connected device currently has beta firmware installed while the user is on production, the frontend can still offer a newer stable release.

The channel selector is in the Rack header settings modal.

## Update check timing

The update check runs after a device connects and the frontend has read the device identity with `*IDN?`. The installed firmware version comes from the connected device identity. It is not compared against the frontend app version.

The decision flow is:

1. Device connects.
2. Frontend reads the connected device firmware version.
3. Frontend fetches GitHub Releases metadata.
4. Releases are normalized and filtered for the selected channel.
5. The newest eligible release is compared against the installed device firmware.
6. If the release is newer and not suppressed, the update prompt is shown.

Decision logic lives in `src/lib/firmware/updateCheck.ts`. Rack integration lives in `src/features/rack/RackView.tsx`.

## Prompt suppression

The update prompt includes `Do not ask again for this version`.

Suppression behavior:

- Suppression is client-local.
- Suppression is per exact target firmware version.
- Suppressing `1.5.0-beta.2` does not suppress `1.5.0`.
- Declining without checking the box does not suppress future prompts.

Suppressed versions are stored through `src/lib/firmware/preferences.ts`.

## Upload flow

When the user accepts an update:

1. The frontend downloads the UF2 from `https://t76.org/drpd/releases/<version>/drpd-firmware-combined.uf2`.
2. The existing Rack device runtime is disconnected.
3. The shared DRPD worker is reset before handoff so it cannot retain a WebUSB claim.
4. The main thread opens a short-lived DRPD transport and sends `SYST:FIRM:UPD`.
5. That transport is closed.
6. The frontend waits for the resident updater WinUSB transport.
7. The updater is opened on interface `0`.
8. `uploadDRPDFirmwareUF2(...)` uploads the combined UF2 and reports progress.

The modal remains open during upload, warns the user not to disconnect the device or refresh the page, and prevents accidental close during active upload phases.

The upload implementation reuses the existing firmware upload transport in `src/lib/device/drpd/firmwareUpdate.ts`. The modal orchestration lives in `src/features/rack/RackView.tsx`. `src/features/drpd/FirmwareUploadTestPage.tsx` remains a manual validation page for the low-level upload path.

## Console diagnostics

Firmware updater logs use the `[firmware-update]` prefix. Useful messages include:

- detected device identity and installed firmware version
- skipped draft or invalid releases
- selected update channel and candidate release
- final update decision
- prompt suppression decisions
- firmware download and upload state
- updater handoff and interface-open attempts
- upload progress, success, and failure

These logs are intentionally concise but are kept visible during hardware validation.

## Tests

Relevant tests:

- `src/lib/firmware/version.test.ts`
- `src/lib/firmware/releases.test.ts`
- `src/lib/firmware/updateCheck.test.ts`
- `src/lib/firmware/preferences.test.ts`
- `src/features/rack/__tests__/RackView.test.tsx`
- `src/lib/transport/winusb.test.ts`
