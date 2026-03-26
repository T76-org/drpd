import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const httpsKeyPath = process.env.VITE_DEV_HTTPS_KEY
  const httpsCertPath = process.env.VITE_DEV_HTTPS_CERT
  const httpsEnabled = Boolean(httpsKeyPath && httpsCertPath)

  return {
    base: mode === 'release' ? './' : '/',
    plugins: [react()],
    css: {
      modules: {
        generateScopedName:
          mode === 'development' ? '[name]__[local]__[hash:base64:5]' : '[hash:base64:8]',
      },
    },
    server: {
      host: '0.0.0.0',
      https:
        httpsEnabled && httpsKeyPath && httpsCertPath
          ? {
              key: fs.readFileSync(httpsKeyPath),
              cert: fs.readFileSync(httpsCertPath),
            }
          : undefined,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
    optimizeDeps: {
      exclude: ['@sqlite.org/sqlite-wasm'],
    },
    worker: {
      format: 'es',
    },
  }
})
