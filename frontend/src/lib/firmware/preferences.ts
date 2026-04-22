/**
 * @file preferences.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Local firmware updater preference persistence.
 */

import type { FirmwareUpdateChannel } from './releases'

export const DEFAULT_FIRMWARE_UPDATE_CHANNEL: FirmwareUpdateChannel = 'production'

const UPDATE_CHANNEL_STORAGE_KEY = 'drpd:firmware-update:channel'
const SUPPRESSED_VERSIONS_STORAGE_KEY = 'drpd:firmware-update:suppressed-versions'

/**
 * Load the selected firmware update channel.
 */
export const loadFirmwareUpdateChannel = (): FirmwareUpdateChannel => {
  const stored = getFirmwarePreferenceStorage()?.getItem(UPDATE_CHANNEL_STORAGE_KEY)
  if (isFirmwareUpdateChannel(stored)) {
    return stored
  }
  return DEFAULT_FIRMWARE_UPDATE_CHANNEL
}

/**
 * Persist the selected firmware update channel.
 */
export const saveFirmwareUpdateChannel = (channel: FirmwareUpdateChannel): void => {
  getFirmwarePreferenceStorage()?.setItem(UPDATE_CHANNEL_STORAGE_KEY, channel)
}

/**
 * Return true when future prompts for the exact target version should be suppressed.
 */
export const isFirmwareUpdatePromptSuppressed = (targetVersion: string): boolean => {
  return loadSuppressedFirmwareVersions().has(targetVersion)
}

/**
 * Suppress future update prompts for one exact target version.
 */
export const suppressFirmwareUpdatePrompt = (targetVersion: string): void => {
  const versions = loadSuppressedFirmwareVersions()
  versions.add(targetVersion)
  saveSuppressedFirmwareVersions(versions)
}

/**
 * Load all exact target versions suppressed by the user.
 */
export const loadSuppressedFirmwareVersions = (): Set<string> => {
  const storage = getFirmwarePreferenceStorage()
  const raw = storage?.getItem(SUPPRESSED_VERSIONS_STORAGE_KEY)
  if (!raw) {
    return new Set()
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return new Set()
    }
    return new Set(
      parsed.filter((value): value is string => typeof value === 'string' && value.length > 0),
    )
  } catch {
    return new Set()
  }
}

/**
 * Persist all exact target versions suppressed by the user.
 */
export const saveSuppressedFirmwareVersions = (versions: Iterable<string>): void => {
  const storage = getFirmwarePreferenceStorage()
  if (!storage) {
    return
  }
  const normalized = Array.from(new Set(versions))
    .filter((version) => version.length > 0)
    .sort((left, right) => left.localeCompare(right))
  storage.setItem(SUPPRESSED_VERSIONS_STORAGE_KEY, JSON.stringify(normalized))
}

const isFirmwareUpdateChannel = (value: unknown): value is FirmwareUpdateChannel =>
  value === 'production' || value === 'beta'

const getFirmwarePreferenceStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }
  const storage = window.localStorage
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return null
  }
  return storage
}
