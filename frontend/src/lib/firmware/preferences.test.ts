import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_FIRMWARE_UPDATE_CHANNEL,
  isFirmwareUpdatePromptSuppressed,
  loadFirmwareUpdateChannel,
  loadSuppressedFirmwareVersions,
  saveFirmwareUpdateChannel,
  saveSuppressedFirmwareVersions,
  suppressFirmwareUpdatePrompt,
} from './preferences'

const createStorage = (): Storage => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length
    },
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('firmware update channel preferences', () => {
  it('defaults to production', () => {
    expect(loadFirmwareUpdateChannel()).toBe(DEFAULT_FIRMWARE_UPDATE_CHANNEL)
  })

  it('persists beta channel selection', () => {
    saveFirmwareUpdateChannel('beta')

    expect(loadFirmwareUpdateChannel()).toBe('beta')
  })

  it('ignores invalid stored channel values', () => {
    window.localStorage.setItem('drpd:firmware-update:channel', 'nightly')

    expect(loadFirmwareUpdateChannel()).toBe('production')
  })
})

describe('firmware update prompt suppression preferences', () => {
  it('does not suppress prompts by default', () => {
    expect(isFirmwareUpdatePromptSuppressed('1.5.0-beta.2')).toBe(false)
  })

  it('suppresses only the exact target version', () => {
    suppressFirmwareUpdatePrompt('1.5.0-beta.2')

    expect(isFirmwareUpdatePromptSuppressed('1.5.0-beta.2')).toBe(true)
    expect(isFirmwareUpdatePromptSuppressed('1.5.0')).toBe(false)
  })

  it('loads a valid stored suppression list', () => {
    saveSuppressedFirmwareVersions(['1.5.0', '1.5.0-beta.2'])

    expect(loadSuppressedFirmwareVersions()).toEqual(new Set(['1.5.0', '1.5.0-beta.2']))
  })

  it('ignores malformed suppression payloads', () => {
    window.localStorage.setItem('drpd:firmware-update:suppressed-versions', '{"bad":true}')

    expect(loadSuppressedFirmwareVersions()).toEqual(new Set())
  })
})
