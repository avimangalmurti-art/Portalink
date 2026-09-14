import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sites } from '@openai/sites-vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), sites()],
  // Local development only: also listen on the LAN so a phone on the same
  // network can open this preview. Build output and deployment are unchanged.
  server: {
    host: true,
  },
  build: {
    outDir: 'dist/client',
  },
})
