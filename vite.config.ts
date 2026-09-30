import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { sites } from '@openai/sites-vite-plugin'
import { sharedProfilePreloadPlugin } from './scripts/shared-profile-preload.mjs'
import { appVersionHash } from './scripts/app-version.mjs'
import { publicMediaPreviewPlugin } from './scripts/public-media-preview.mjs'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
  define: { __APP_VERSION__: JSON.stringify(appVersionHash()) },
  plugins: [react(), sites(), publicMediaPreviewPlugin({ supabaseUrl: env.VITE_SUPABASE_URL }), sharedProfilePreloadPlugin({ supabaseUrl: env.VITE_SUPABASE_URL, publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY }), {
    name: 'portalink-visitor-entry',
    configureServer(server) {
      // Development mirrors the worker's public HTML selection without a redirect.
      server.middlewares.use((request, _response, next) => {
        if (request.method === 'GET' && request.headers.accept?.includes('text/html') && /^\/share\//.test(request.url ?? '')) request.url = '/share.html'
        next()
      })
    },
    generateBundle(_options, bundle) {
      // Local QA evidence only; module paths are not shipped to visitors.
      mkdirSync('logs', { recursive: true })
      writeFileSync('logs/client-module-graph.json', JSON.stringify(Object.values(bundle).filter(item => item.type === 'chunk').map(item => ({ file: item.fileName, imports: item.imports, dynamicImports: item.dynamicImports, modules: Object.keys(item.modules), renderedLengths: Object.fromEntries(Object.entries(item.modules).map(([id, module]) => [id, module.renderedLength])) })), null, 2))
    },
  }],
  // Production cannot enter the mock graph. Explicit prototype builds and local
  // development keep their existing runtime selection; client.ts still rejects
  // invalid production configuration instead of substituting demo accounts.
  resolve: {
    alias: command === 'build' && env.VITE_RUNTIME_MODE?.trim().toLowerCase() !== 'prototype'
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
    manifest: true,
    rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), visitor: fileURLToPath(new URL('./share.html', import.meta.url)) } },
  },
}})
