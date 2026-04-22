/**
 * @file releases.ts
 * @copyright Copyright (c) 2026 MTA, Inc.
 *
 * GitHub Releases normalization and channel-aware firmware selection.
 */

import {
  compareFirmwareVersions,
  parseFirmwareVersion,
  type FirmwareVersion,
} from './version'

export const DRPD_FIRMWARE_ASSET_NAME = 'drpd-firmware-combined.uf2'
export const DRPD_FIRMWARE_DOWNLOAD_BASE_URL = 'https://t76.org/drpd/releases'

export type FirmwareUpdateChannel = 'production' | 'beta'

export interface GitHubReleaseAsset {
  id?: number
  url?: string
  name: string
  browser_download_url: string
  size?: number
  content_type?: string
}

export interface GitHubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  name?: string | null
  html_url?: string
  assets?: GitHubReleaseAsset[]
}

export interface FirmwareReleaseAsset {
  id?: number
  name: string
  downloadUrl: string
  size?: number
  contentType?: string
}

export interface FirmwareRelease {
  tagName: string
  releaseName?: string
  releaseUrl?: string
  version: FirmwareVersion
  versionText: string
  channel: FirmwareUpdateChannel
  asset: FirmwareReleaseAsset
}

export interface NormalizeGitHubFirmwareReleasesOptions {
  log?: (message: string) => void
}

/**
 * Fetch all GitHub releases for a repository.
 */
export const fetchGitHubReleases = async (
  owner: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubRelease[]> => {
  const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub releases request failed: ${response.status} ${response.statusText}`)
  }
  return await response.json() as GitHubRelease[]
}

/**
 * Convert GitHub release API records into selectable firmware releases.
 */
export const normalizeGitHubFirmwareReleases = (
  releases: GitHubRelease[],
  options: NormalizeGitHubFirmwareReleasesOptions = {},
): FirmwareRelease[] => {
  const normalized: FirmwareRelease[] = []
  for (const release of releases) {
    if (release.draft) {
      options.log?.(`Skipping draft firmware release ${release.tag_name}`)
      continue
    }

    let version: FirmwareVersion
    try {
      version = parseFirmwareVersion(release.tag_name)
    } catch {
      options.log?.(`Skipping firmware release with invalid tag ${release.tag_name}`)
      continue
    }

    if (release.prerelease && !version.isBeta) {
      options.log?.(`Skipping prerelease firmware release with stable tag ${release.tag_name}`)
      continue
    }
    if (!release.prerelease && !version.isStable) {
      options.log?.(`Skipping stable firmware release with beta tag ${release.tag_name}`)
      continue
    }

    const asset = selectFirmwareAsset(release.assets ?? [], version.text)
    if (!asset) {
      options.log?.(`Skipping firmware release ${version.text}; missing ${DRPD_FIRMWARE_ASSET_NAME}`)
      continue
    }

    normalized.push({
      tagName: release.tag_name,
      ...(release.name ? { releaseName: release.name } : {}),
      ...(release.html_url ? { releaseUrl: release.html_url } : {}),
      version,
      versionText: version.text,
      channel: release.prerelease ? 'beta' : 'production',
      asset,
    })
  }
  return normalized
}

/**
 * Select the newest firmware release eligible for an update channel.
 */
export const selectReleaseForChannel = (
  releases: FirmwareRelease[],
  channel: FirmwareUpdateChannel,
): FirmwareRelease | null => {
  const eligible = releases.filter((release) =>
    channel === 'beta' ? true : release.channel === 'production',
  )
  if (eligible.length === 0) {
    return null
  }
  return [...eligible].sort((left, right) =>
    compareFirmwareVersions(right.version, left.version),
  )[0]
}

/**
 * Select the firmware UF2 asset from a GitHub release.
 */
export const selectFirmwareAsset = (
  assets: GitHubReleaseAsset[],
  versionText?: string,
): FirmwareReleaseAsset | null => {
  const asset = assets.find((candidate) => candidate.name === DRPD_FIRMWARE_ASSET_NAME)
  if (!asset) {
    return null
  }
  return {
    ...(asset.id == null ? {} : { id: asset.id }),
    name: asset.name,
    downloadUrl: versionText
      ? `${DRPD_FIRMWARE_DOWNLOAD_BASE_URL}/${versionText}/${DRPD_FIRMWARE_ASSET_NAME}`
      : asset.browser_download_url,
    ...(asset.size == null ? {} : { size: asset.size }),
    ...(asset.content_type ? { contentType: asset.content_type } : {}),
  }
}
