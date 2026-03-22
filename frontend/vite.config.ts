import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === 'release' ? './' : '/',
  plugins: [react()],
  css: {
    modules: {
      generateScopedName:
        mode === 'development' ? '[name]__[local]__[hash:base64:5]' : '[hash:base64:8]',
    },
  },
  server: {
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
}))
