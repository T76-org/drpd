/**
 * @file version.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * Firmware version parsing and comparison helpers.
 */

export interface FirmwareVersion {
  major: number
  minor: number
  patch: number
  isBeta: boolean
  isStable: boolean
  betaNumber?: number
  text: string
}

const VERSION_PATTERN = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.([1-9]\d*))?$/

/**
 * Parse a DRPD firmware version string.
 *
 * Accepted versions are x.y.z and x.y.z-beta.k. A leading v is normalized away
 * for GitHub tag compatibility.
 *
 * @param value - Version or tag string.
 * @returns Parsed firmware version.
 */
export const parseFirmwareVersion = (value: string): FirmwareVersion => {
  const trimmed = value.trim()
  const match = trimmed.match(VERSION_PATTERN)
  if (!match) {
    throw new Error(`Invalid firmware version: ${value}`)
  }

  const major = Number.parseInt(match[1], 10)
  const minor = Number.parseInt(match[2], 10)
  const patch = Number.parseInt(match[3], 10)
  const betaNumber = match[4] ? Number.parseInt(match[4], 10) : undefined
  const text = betaNumber == null
    ? `${major}.${minor}.${patch}`
    : `${major}.${minor}.${patch}-beta.${betaNumber}`

  return {
    major,
    minor,
    patch,
    isBeta: betaNumber != null,
    isStable: betaNumber == null,
    ...(betaNumber == null ? {} : { betaNumber }),
    text,
  }
}

/**
 * Compare two firmware versions.
 *
 * @returns Negative when left is older, positive when left is newer, zero when equal.
 */
export const compareFirmwareVersions = (
  left: FirmwareVersion,
  right: FirmwareVersion,
): number => {
  const major = left.major - right.major
  if (major !== 0) {
    return major
  }
  const minor = left.minor - right.minor
  if (minor !== 0) {
    return minor
  }
  const patch = left.patch - right.patch
  if (patch !== 0) {
    return patch
  }
  if (left.isStable && right.isBeta) {
    return 1
  }
  if (left.isBeta && right.isStable) {
    return -1
  }
  return (left.betaNumber ?? 0) - (right.betaNumber ?? 0)
}

/**
 * Return true when candidate is newer than installed.
 */
export const isFirmwareVersionNewer = (
  candidate: FirmwareVersion,
  installed: FirmwareVersion,
): boolean => compareFirmwareVersions(candidate, installed) > 0
