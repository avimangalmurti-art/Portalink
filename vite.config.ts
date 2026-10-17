import { requireBuildEnvironment } from './scripts/build-environment.mjs'
import { handleCitation, citationLicenseResponse } from './src/server/citation'
import {handleReferenceResolve} from './src/server/referenceResolver'
import {handlePortfolioExport} from './src/server/portfolioExport'
import { readPortfolioCard } from './src/server/sharedPreview'
import { resolveShareRequest, injectShareResolution, publicSitemap } from './src/server/shareAddress'
import { readFile } from 'node:fs/promises'
import { isPublicSharePath } from './src/features/sharing/shareModel'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { sites } from '@openai/sites-vite-plugin'
import { sharedProfilePreloadPlugin } from './scripts/shared-profile-preload.mjs'
import { appVersionHash } from './scripts/app-version.mjs'
import { publicMediaPreviewPlugin } from './scripts/public-media-preview.mjs'
import { startupStylesPlugin } from './scripts/startup-styles.mjs'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (command === 'build') requireBuildEnvironment(env)
  return {
  define: { __APP_VERSION__: JSON.stringify(appVersionHash()) },
  plugins: [react(), sites(), publicMediaPreviewPlugin({ supabaseUrl: env.VITE_SUPABASE_URL }), sharedProfilePreloadPlugin({ supabaseUrl: env.VITE_SUPABASE_URL, publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY }), {
    name: 'portalink-visitor-entry',
    configureServer(server) {
      // Development mirrors the worker's public HTML selection without a redirect.
      server.middlewares.use(async (request, response, next) => {
        const origin = `http://${request.headers.host || '127.0.0.1:5178'}`;
        const url = new URL(request.url ?? '/', origin);
        const config = { supabaseUrl: env.VITE_SUPABASE_URL, publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY };
        if(url.pathname.startsWith('/api/exports/portfolio/')){const result=await handlePortfolioExport(new Request(url,{method:request.method}),url.pathname.split('/').at(-1)??'',{PORTFOLIO_PDF_WORKER_URL:process.env.PORTFOLIO_PDF_WORKER_URL,PORTFOLIO_PDF_WORKER_SECRET:process.env.PORTFOLIO_PDF_WORKER_SECRET},config);response.statusCode=result.status;result.headers.forEach((value,key)=>response.setHeader(key,value));response.end(Buffer.from(await result.arrayBuffer()));return;}
        if(url.pathname==='/api/references/resolve'){
          const chunks:Buffer[]=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>32768){response.statusCode=413;response.end('Reference is too large.');return;}chunks.push(Buffer.from(chunk));}
          const headers=new Headers();if(request.headers.authorization)headers.set('authorization',request.headers.authorization);
          const webRequest=new Request(url,{method:request.method,headers,...(request.method==='POST'?{body:Buffer.concat(chunks).toString('utf8')}:{})});
          const result=await handleReferenceResolve(webRequest,async req=>{const authorization=req.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return null;const auth=await fetch(`${config.supabaseUrl}/auth/v1/user`,{headers:{apikey:config.publishableKey,authorization},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(5000)});return auth.ok?auth.json():null;});response.statusCode=result.status;result.headers.forEach((value,key)=>response.setHeader(key,value));response.end(await result.text());return;
        }
        if (url.pathname === '/sitemap.xml') { const result=await publicSitemap(new Request(url,{method:request.method}),config);response.statusCode=result.status;result.headers.forEach((value,key)=>response.setHeader(key,value));response.end(await result.text());return; }
        const license = citationLicenseResponse(url.pathname);
        if (license) { response.statusCode=license.status; response.setHeader('Content-Type',license.headers.get('content-type')!); response.end(await license.text()); return; }
        if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/cite/')) {
          const result=await handleCitation(new Request(url,{method:request.method}),{fetch:async()=>new Response(await server.transformIndexHtml('/cite.html',await readFile('cite.html','utf8')))},config);
          response.statusCode=result.status;result.headers.forEach((value,key)=>response.setHeader(key,value));response.end(await result.text());return;
        }
        if (request.method === 'GET' && url.pathname.startsWith('/api/portfolio-card/')) {
          try {
            const card = await readPortfolioCard(url.pathname.slice('/api/portfolio-card/'.length), origin, config);
            response.statusCode = card ? 200 : 404; response.setHeader('Content-Type','application/json'); response.setHeader('Cache-Control','no-store'); response.end(JSON.stringify(card));
          } catch { response.statusCode=503; response.end('{}'); }
          return;
        }
        if (request.method === 'GET' && request.headers.accept?.includes('text/html') && isPublicSharePath(url.pathname)) {
          try {
            const address = await resolveShareRequest(new Request(url), config);
            if (address.redirect) { response.statusCode=301; response.setHeader('Location',address.redirect.headers.get('location') ?? '/'); response.end(); return; }
            const html = await server.transformIndexHtml('/share.html', await readFile('share.html','utf8'));
            response.setHeader('Content-Type','text/html'); response.setHeader('Cache-Control','no-store'); response.end(injectShareResolution(html,address.resolution,url.origin+url.pathname)); return;
          } catch { request.url='/share.html'; }
        }
        next();
      })
    },
    generateBundle(_options, bundle) {
      // Local QA evidence only; module paths are not shipped to visitors.
      mkdirSync('logs', { recursive: true })
      writeFileSync('logs/client-module-graph.json', JSON.stringify(Object.values(bundle).filter(item => item.type === 'chunk').map(item => ({ file: item.fileName, imports: item.imports, dynamicImports: item.dynamicImports, modules: Object.keys(item.modules), renderedLengths: Object.fromEntries(Object.entries(item.modules).map(([id, module]) => [id, module.renderedLength])) })), null, 2))
    },
  }, startupStylesPlugin()],
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
    rollupOptions: { input: { googleAuth: fileURLToPath(new URL('./google-auth.html', import.meta.url)), main: fileURLToPath(new URL('./index.html', import.meta.url)), visitor: fileURLToPath(new URL('./share.html', import.meta.url)), citation: fileURLToPath(new URL('./cite.html', import.meta.url)) } },
  },
}})
