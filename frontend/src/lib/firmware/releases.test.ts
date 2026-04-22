import { describe, expect, it } from 'vitest'

import {
  DRPD_FIRMWARE_ASSET_NAME,
  DRPD_FIRMWARE_DOWNLOAD_BASE_URL,
  normalizeGitHubFirmwareReleases,
  selectFirmwareAsset,
  selectReleaseForChannel,
  type GitHubRelease,
} from './releases'

const asset = (name = DRPD_FIRMWARE_ASSET_NAME) => ({
  id: 1234,
  url: `https://api.github.com/repos/T76-org/drpd/releases/assets/1234`,
  name,
  browser_download_url: `https://example.test/${name}`,
  size: 123,
})

const release = (
  tagName: string,
  overrides: Partial<GitHubRelease> = {},
): GitHubRelease => ({
  tag_name: tagName,
  draft: false,
  prerelease: tagName.includes('-beta.'),
  assets: [asset()],
  ...overrides,
})

describe('firmware asset selection', () => {
  it('selects the expected combined UF2 asset', () => {
    expect(selectFirmwareAsset([
      asset('notes.txt'),
      asset(),
    ])).toMatchObject({
      id: 1234,
      name: DRPD_FIRMWARE_ASSET_NAME,
      downloadUrl: `https://example.test/${DRPD_FIRMWARE_ASSET_NAME}`,
    })
  })

  it('uses the GitHub Pages firmware URL when a version is known', () => {
    expect(selectFirmwareAsset([asset()], '1.2.3-beta.4')).toMatchObject({
      name: DRPD_FIRMWARE_ASSET_NAME,
      downloadUrl: `${DRPD_FIRMWARE_DOWNLOAD_BASE_URL}/1.2.3-beta.4/${DRPD_FIRMWARE_ASSET_NAME}`,
    })
  })

  it('returns null when the combined UF2 asset is missing', () => {
    expect(selectFirmwareAsset([asset('other.uf2')])).toBeNull()
  })
})

describe('GitHub firmware release normalization', () => {
  it('ignores drafts', () => {
    const logs: string[] = []
    const normalized = normalizeGitHubFirmwareReleases([
      release('1.0.0', { draft: true }),
      release('1.0.1'),
    ], { log: (message) => logs.push(message) })

    expect(normalized.map((entry) => entry.versionText)).toEqual(['1.0.1'])
    expect(logs).toEqual(['Skipping draft firmware release 1.0.0'])
  })

  it('skips invalid tags safely', () => {
    const logs: string[] = []
    const normalized = normalizeGitHubFirmwareReleases([
      release('not-a-version'),
      release('1.0.0'),
    ], { log: (message) => logs.push(message) })

    expect(normalized.map((entry) => entry.versionText)).toEqual(['1.0.0'])
    expect(logs).toEqual(['Skipping firmware release with invalid tag not-a-version'])
  })

  it('skips releases missing the expected firmware asset', () => {
    const logs: string[] = []
    const normalized = normalizeGitHubFirmwareReleases([
      release('1.0.0', { assets: [asset('other.uf2')] }),
      release('1.0.1'),
    ], { log: (message) => logs.push(message) })

    expect(normalized.map((entry) => entry.versionText)).toEqual(['1.0.1'])
    expect(logs).toEqual([
      `Skipping firmware release 1.0.0; missing ${DRPD_FIRMWARE_ASSET_NAME}`,
    ])
  })

  it('skips prerelease/tag mismatches so production cannot receive beta tags', () => {
    const logs: string[] = []
    const normalized = normalizeGitHubFirmwareReleases([
      release('1.0.0-beta.1', { prerelease: false }),
      release('1.0.0', { prerelease: true }),
      release('1.0.1'),
    ], { log: (message) => logs.push(message) })

    expect(normalized.map((entry) => entry.versionText)).toEqual(['1.0.1'])
    expect(logs).toEqual([
      'Skipping stable firmware release with beta tag 1.0.0-beta.1',
      'Skipping prerelease firmware release with stable tag 1.0.0',
    ])
  })

  it('normalizes selected firmware assets to the public t76.org release path', () => {
    const normalized = normalizeGitHubFirmwareReleases([
      release('1.2.3'),
    ])

    expect(normalized[0]?.asset.downloadUrl).toBe(
      'https://t76.org/drpd/releases/1.2.3/drpd-firmware-combined.uf2',
    )
  })
})

describe('firmware release channel selection', () => {
  it('selects the highest stable release for production', () => {
    const normalized = normalizeGitHubFirmwareReleases([
      release('1.4.1'),
      release('1.5.0-beta.1'),
      release('1.4.2'),
    ])

    expect(selectReleaseForChannel(normalized, 'production')?.versionText).toBe('1.4.2')
  })

  it('selects the highest version overall for beta', () => {
    const normalized = normalizeGitHubFirmwareReleases([
      release('1.4.1'),
      release('1.5.0-beta.1'),
    ])

    expect(selectReleaseForChannel(normalized, 'beta')?.versionText).toBe('1.5.0-beta.1')
  })

  it('allows beta users to move from beta to newer stable releases', () => {
    const normalized = normalizeGitHubFirmwareReleases([
      release('1.5.0-beta.2'),
      release('1.5.0'),
    ])

    expect(selectReleaseForChannel(normalized, 'beta')?.versionText).toBe('1.5.0')
  })

  it('returns null when no production release is available', () => {
    const normalized = normalizeGitHubFirmwareReleases([
      release('1.6.0-beta.1'),
    ])

    expect(selectReleaseForChannel(normalized, 'production')).toBeNull()
  })
})
