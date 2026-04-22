import { describe, expect, it } from 'vitest'

import {
  normalizeGitHubFirmwareReleases,
  type GitHubRelease,
} from './releases'
import { checkForFirmwareUpdate } from './updateCheck'

const asset = {
  name: 'drpd-firmware-combined.uf2',
  browser_download_url: 'https://example.test/drpd-firmware-combined.uf2',
}

const release = (tagName: string): GitHubRelease => ({
  tag_name: tagName,
  draft: false,
  prerelease: tagName.includes('-beta.'),
  assets: [asset],
})

const releases = (...tags: string[]) => normalizeGitHubFirmwareReleases(tags.map(release))

describe('checkForFirmwareUpdate', () => {
  it('offers newest stable release to production users', () => {
    const decision = checkForFirmwareUpdate({
      installedFirmwareVersion: '1.4.0',
      channel: 'production',
      releases: releases('1.4.1', '1.5.0-beta.1'),
    })

    expect(decision).toMatchObject({
      kind: 'update-available',
      installedVersionText: '1.4.0',
      release: { versionText: '1.4.1' },
    })
  })

  it('offers newest beta release to beta users when it is newest overall', () => {
    const decision = checkForFirmwareUpdate({
      installedFirmwareVersion: '1.4.0',
      channel: 'beta',
      releases: releases('1.4.1', '1.5.0-beta.1'),
    })

    expect(decision).toMatchObject({
      kind: 'update-available',
      release: { versionText: '1.5.0-beta.1' },
    })
  })

  it('offers stable release over installed beta on beta channel', () => {
    const decision = checkForFirmwareUpdate({
      installedFirmwareVersion: '1.5.0-beta.2',
      channel: 'beta',
      releases: releases('1.5.0'),
    })

    expect(decision).toMatchObject({
      kind: 'update-available',
      release: { versionText: '1.5.0' },
    })
  })

  it('offers stable release over installed beta on production channel', () => {
    const decision = checkForFirmwareUpdate({
      installedFirmwareVersion: '1.5.0-beta.2',
      channel: 'production',
      releases: releases('1.5.0'),
    })

    expect(decision).toMatchObject({
      kind: 'update-available',
      release: { versionText: '1.5.0' },
    })
  })

  it('does not offer beta releases to production users', () => {
    const decision = checkForFirmwareUpdate({
      installedFirmwareVersion: '1.5.0',
      channel: 'production',
      releases: releases('1.6.0-beta.1'),
    })

    expect(decision).toEqual({ kind: 'no-update', reason: 'no-release' })
  })

  it('does not prompt for suppressed target versions', () => {
    const decision = checkForFirmwareUpdate({
      installedFirmwareVersion: '1.5.0-beta.1',
      channel: 'beta',
      releases: releases('1.5.0-beta.2'),
      isPromptSuppressed: (targetVersion) => targetVersion === '1.5.0-beta.2',
    })

    expect(decision).toEqual({ kind: 'no-update', reason: 'suppressed' })
  })

  it('prompts when a newer unsuppressed target version appears', () => {
    const decision = checkForFirmwareUpdate({
      installedFirmwareVersion: '1.5.0-beta.1',
      channel: 'beta',
      releases: releases('1.5.0-beta.2', '1.5.0'),
      isPromptSuppressed: (targetVersion) => targetVersion === '1.5.0-beta.2',
    })

    expect(decision).toMatchObject({
      kind: 'update-available',
      release: { versionText: '1.5.0' },
    })
  })

  it('rejects malformed installed firmware versions without prompting', () => {
    const decision = checkForFirmwareUpdate({
      installedFirmwareVersion: '1.0',
      channel: 'production',
      releases: releases('1.0.1'),
    })

    expect(decision).toEqual({ kind: 'no-update', reason: 'invalid-installed-version' })
  })
})
