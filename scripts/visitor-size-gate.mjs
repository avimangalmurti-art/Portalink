import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

export function visitorSize(manifest, readAsset) {
  const visited = new Set(), files = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing visitor dependency: ${key}`);
    files.add(chunk.file);
    for (const css of chunk.css ?? []) files.add(css);
    // First-paint entry graph. Lazy editor/PDF chunks are not downloaded initially.
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  if (!manifest['share.html']?.isEntry) throw new Error('Missing visitor entry');
  visit('share.html');
  return [...files].reduce((bytes, file) => bytes + gzipSync(readAsset(file)).length, 0);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve('dist/client');
  const bytes = visitorSize(JSON.parse(readFileSync(resolve(root, '.vite/manifest.json'), 'utf8')), file => readFileSync(resolve(root, file)));
  console.log(`Visitor initial JS/CSS: ${bytes} bytes gzipped (limit 350000).`);
  if (bytes > 350000) throw new Error('Visitor bundle exceeds 350 KB gzip budget');
}
