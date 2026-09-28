import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { sites } from '@openai/sites-vite-plugin'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => ({
  plugins: [react(), sites()],
  // Production cannot enter the mock graph. Explicit prototype builds and local
  // development keep their existing runtime selection; client.ts still rejects
  // invalid production configuration instead of substituting demo accounts.
  resolve: {
    alias: command === 'build' && loadEnv(mode, process.cwd(), 'VITE_').VITE_RUNTIME_MODE?.trim().toLowerCase() !== 'prototype'
      ? [{ find: /^\.\/runtimeServices$/, replacement: fileURLToPath(new URL('./src/services/productionServices.ts', import.meta.url)) }]
      : [],
  },
  // Local development only: also listen on the LAN so a phone on the same
  // network can open this preview. Build output and deployment are unchanged.
  server: {
    host: true,
  },
  build: {
    outDir: 'dist/client',
  },
}))
