import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildDevServerConfig,
  getPublicHostname,
  hasCustomHttpsCertificate,
  isHttpsEnabled,
} from './devServer'

/**
 * Restore stubbed environment variables after each test.
 */
afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * Verify that the dev server stays on HTTP unless HTTPS is explicitly enabled.
 */
describe('buildDevServerConfig', () => {
  it('keeps the existing LAN binding and COOP/COEP headers by default', () => {
    const server = buildDevServerConfig()

    expect(server.host).toBe('0.0.0.0')
    expect(server.port).toBe(5173)
    expect(server.strictPort).toBe(true)
    expect(server.allowedHosts).toBe(true)
    expect(server.https).toBeUndefined()
    expect(server.origin).toBeUndefined()
    expect(server.headers).toEqual({
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    })
  })

  it('enables HTTPS when requested without forcing custom cert files', () => {
    vi.stubEnv('DRPD_DEV_HTTPS', '1')

    const server = buildDevServerConfig()

    expect(isHttpsEnabled()).toBe(true)
    expect(hasCustomHttpsCertificate()).toBe(false)
    expect(server.https).toEqual({})
  })

  it('publishes a stable HTTPS origin when a public host is configured', () => {
    vi.stubEnv('DRPD_DEV_HTTPS', '1')
    vi.stubEnv('DRPD_DEV_PUBLIC_HOST', 'drpd.local')

    const server = buildDevServerConfig()

    expect(getPublicHostname()).toBe('drpd.local')
    expect(server.origin).toBe('https://drpd.local:5173')
  })

  it('ignores IP literals when building certificate hostname hints', () => {
    vi.stubEnv('DRPD_DEV_PUBLIC_HOST', '192.168.68.101')

    expect(getPublicHostname()).toBeUndefined()
  })
})
