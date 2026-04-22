/**
 * @file updateCheck.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Pure firmware update eligibility decisions.
 */

import type { FirmwareRelease, FirmwareUpdateChannel } from './releases'
import { selectReleaseForChannel } from './releases'
import { isFirmwareVersionNewer, parseFirmwareVersion } from './version'

export type FirmwareUpdateDecision =
  | {
      kind: 'update-available'
      installedVersionText: string
      release: FirmwareRelease
    }
  | {
      kind: 'no-update'
      reason: 'no-release' | 'not-newer' | 'suppressed' | 'invalid-installed-version'
    }

export interface CheckForFirmwareUpdateOptions {
  installedFirmwareVersion: string
  channel: FirmwareUpdateChannel
  releases: FirmwareRelease[]
  isPromptSuppressed?: (targetVersion: string) => boolean
}

/**
 * Decide whether a connected device should prompt for a firmware update.
 */
export const checkForFirmwareUpdate = ({
  installedFirmwareVersion,
  channel,
  releases,
  isPromptSuppressed = () => false,
}: CheckForFirmwareUpdateOptions): FirmwareUpdateDecision => {
  let installedVersion
  try {
    installedVersion = parseFirmwareVersion(installedFirmwareVersion)
  } catch {
    return { kind: 'no-update', reason: 'invalid-installed-version' }
  }

  const release = selectReleaseForChannel(releases, channel)
  if (!release) {
    return { kind: 'no-update', reason: 'no-release' }
  }

  if (!isFirmwareVersionNewer(release.version, installedVersion)) {
    return { kind: 'no-update', reason: 'not-newer' }
  }

  if (isPromptSuppressed(release.versionText)) {
    return { kind: 'no-update', reason: 'suppressed' }
  }

  return {
    kind: 'update-available',
    installedVersionText: installedVersion.text,
    release,
  }
}
