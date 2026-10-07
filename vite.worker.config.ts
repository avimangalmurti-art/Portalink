import { productionBuildEnvironment } from './scripts/build-environment.mjs'
import { defineConfig } from 'vite'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') productionBuildEnvironment(process.cwd(), mode)
  return {
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: 'dist/server',
    ssr: 'src/sites-worker.ts',
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        format: 'es',
      },
    },
  },
}})
