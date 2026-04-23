import { existsSync, readFileSync } from 'node:fs'

import type { ServerOptions } from 'vite'

/**
 * Build the Vite dev server configuration used by the frontend.
 *
 * The server stays bound to all interfaces so the app can be opened from
 * another machine on the LAN. HTTPS is opt-in through environment variables so
 * local development keeps the existing HTTP workflow unless debugging requires
 * a secure origin.
 */
export const buildDevServerConfig = (): NonNullable<ServerOptions> => {
  const https = buildHttpsConfig()
  const publicHost = process.env.DRPD_DEV_PUBLIC_HOST
  const origin = https === undefined || publicHost === undefined ? undefined : `https://${publicHost}:5173`

  return {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    origin,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    https,
  }
}

/**
 * Build the optional HTTPS configuration for the dev server.
 *
 * When `DRPD_DEV_HTTPS=1` is set, Vite starts with HTTPS enabled. If
 * `DRPD_DEV_HTTPS_CERT` and `DRPD_DEV_HTTPS_KEY` point at certificate files,
 * those files are loaded so the browser can validate a hostname-specific cert.
 * Otherwise Vite's basic-ssl plugin can attach a generated development
 * certificate to this empty HTTPS options object.
 *
 * If `DRPD_DEV_PUBLIC_HOST` is also set, the server advertises that hostname as
 * its canonical HTTPS origin so the browser and Vite client stay on the same
 * URL. This matters when Chrome is opened from another machine on the LAN.
 */
const buildHttpsConfig = (): ServerOptions['https'] | undefined => {
  if (!isEnabled(process.env.DRPD_DEV_HTTPS)) {
    return undefined
  }

  const certPath = process.env.DRPD_DEV_HTTPS_CERT
  const keyPath = process.env.DRPD_DEV_HTTPS_KEY

  if (certPath === undefined || keyPath === undefined) {
    return {}
  }

  if (!existsSync(certPath)) {
    throw new Error(`DRPD_DEV_HTTPS_CERT does not exist: ${certPath}`)
  }

  if (!existsSync(keyPath)) {
    throw new Error(`DRPD_DEV_HTTPS_KEY does not exist: ${keyPath}`)
  }

  return {
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
  }
}

/**
 * Interpret a string environment variable as an enabled/disabled flag.
 */
export const isHttpsEnabled = (): boolean => isEnabled(process.env.DRPD_DEV_HTTPS)

/**
 * Return the requested public hostname when it is usable as a DNS SAN.
 */
export const getPublicHostname = (): string | undefined => {
  const publicHost = process.env.DRPD_DEV_PUBLIC_HOST

  if (publicHost === undefined || publicHost.length === 0) {
    return undefined
  }

  if (isIPAddress(publicHost)) {
    return undefined
  }

  return publicHost
}

/**
 * Determine whether a custom certificate pair was provided explicitly.
 */
export const hasCustomHttpsCertificate = (): boolean =>
  process.env.DRPD_DEV_HTTPS_CERT !== undefined && process.env.DRPD_DEV_HTTPS_KEY !== undefined

const isEnabled = (value: string | undefined): boolean => value === '1' || value === 'true'

/**
 * Detect IPv4/IPv6 literals so they are not added as DNS SAN entries.
 */
const isIPAddress = (value: string): boolean =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(value) || value.includes(':')
