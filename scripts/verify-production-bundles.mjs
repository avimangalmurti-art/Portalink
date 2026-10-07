import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { productionBuildEnvironment } from './build-environment.mjs';

export function verifyClientEntries(manifest, readChunk, env) {
  const host = new URL(env.VITE_SUPABASE_URL.trim()).hostname;
  for (const entry of ['index.html', 'share.html']) {
    if (!manifest[entry]?.isEntry) throw new Error(`Build verification failed: ${entry} entry is missing.`);
    const visited = new Set();
    const chunks = [];
    function visit(key) {
      if (visited.has(key)) return;
      visited.add(key);
      const chunk = manifest[key];
      if (!chunk) throw new Error(`Build verification failed: ${entry} has a missing chunk.`);
      chunks.push(readChunk(chunk.file));
      for (const dependency of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) visit(dependency);
    }
    visit(entry);
    if (!chunks.some(text => text.includes(host) && text.includes(env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()))) throw new Error(`Build verification failed: ${entry} lacks the configured Supabase host/key.`);
  }
}
if (process.argv.includes('--verify')) {
  const env = productionBuildEnvironment();
  const output = resolve('dist/client');
  const manifest = JSON.parse(readFileSync(resolve(output, '.vite/manifest.json'), 'utf8'));
  verifyClientEntries(manifest, file => readFileSync(resolve(output, file), 'utf8'), env);
  console.log('Verified main and visitor bundle graphs contain the configured Supabase host and publishable key.');
}
