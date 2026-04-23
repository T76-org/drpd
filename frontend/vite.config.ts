import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import {
  buildDevServerConfig,
  getPublicHostname,
  hasCustomHttpsCertificate,
  isHttpsEnabled,
} from './vite/devServer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const publicHostname = getPublicHostname()
  const useGeneratedHttpsCertificate = isHttpsEnabled() && !hasCustomHttpsCertificate()

  return {
    base: mode === 'release' ? './' : '/',
    plugins: [
      react(),
      useGeneratedHttpsCertificate
        ? basicSsl({
            name: 'drpd-dev',
            domains: publicHostname === undefined ? undefined : [publicHostname],
          })
        : undefined,
    ],
    css: {
      modules: {
        generateScopedName:
          mode === 'development' ? '[name]__[local]__[hash:base64:5]' : '[hash:base64:8]',
      },
    },
    server: buildDevServerConfig(),
    optimizeDeps: {
      exclude: ['@sqlite.org/sqlite-wasm'],
    },
    worker: {
      format: 'es',
    },
  }
})
