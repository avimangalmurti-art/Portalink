import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { measureEntry } from '../scripts/measure-entry-assets.mjs';

// Run after npm run build: verify emitted dependencies, not just source imports.
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const graph = JSON.parse(read('logs/client-module-graph.json'));
const manifest = JSON.parse(read('dist/client/.vite/manifest.json'));
function initialModules(entry) {
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const chunk = graph.find(item => item.file === file);
    assert.ok(chunk, `Missing emitted chunk ${file}`);
    chunk.imports.forEach(visit);
  }
  visit(manifest[entry].file);
  return [...visited].flatMap(file => graph.find(item => item.file === file).modules).map(file => file.replaceAll('\\', '/'));
}
test('both HTML entries exist and the public initial graph contains no unopened product features', () => {
  assert.notEqual(manifest['index.html'].file, manifest['share.html'].file);
  const modules = initialModules('share.html');
  for (const forbidden of [/pdfjs-dist/, /PdfPage\.tsx$/, /DocumentAttachment\.tsx$/, /VideoAttachment\.tsx$/, /MobileVideoPlayer\.tsx$/, /services\/(mocks|prototype)\//,
    /messagingService\.ts$/, /PublishProjectDialog/, /ProjectEditorDialog/, /ProfileEditorDialog/, /AuthDialog\.tsx$/, /Onboarding/, /PortalinkSplashLoader/, /PortalsPage/, /ControlCenterPage/, /Notification.*Page/]) {
    assert.deepEqual(modules.filter(file => forbidden.test(file)), [], String(forbidden));
  }
  assert.ok(modules.some(file => /visitorServices\.ts$/.test(file)));
  assert.ok(initialModules('index.html').some(file => /productionServices\.ts$/.test(file)));
});
test('visitor HTML starts the public read before its module scripts and does not request splash media', () => {
  const html = read('dist/client/share.html');
  const preload = html.indexOf('data-shared-bundle-preload');
  assert.ok(preload >= 0 && preload < html.indexOf('type="module"'));
  assert.ok(html.includes('shared_profile_bundle'));
  assert.ok(!/portalink-welcome-loop|portalink-splash|preboot|apple-touch-startup-image/.test(html));
  assert.ok(html.includes('display=swap'));
  for (const entry of ['index.html', 'share.html']) {
    const shell = read(`dist/client/${entry}`);
    assert.match(shell, /rel="preconnect"[^>]*supabase\.co/);
    assert.match(shell, /rel="dns-prefetch"[^>]*fonts\.gstatic\.com/);
  }
});
test('measurement follows every emitted static import and reports each entry separately', () => {
  const directory = fileURLToPath(new URL('../dist/client', import.meta.url));
  const visitor = measureEntry(directory, 'share.html'), main = measureEntry(directory, 'index.html');
  assert.ok(visitor.jsBytes > 100000 && visitor.jsBytes < main.jsBytes);
  assert.equal(visitor.jsBytes, visitor.js.reduce((sum, chunk) => sum + chunk.bytes, 0));
  assert.ok(visitor.cssBytes > 0);
});

test('the lazy public welcome loads the same button styles as the main welcome', () => {
  const loader = Object.values(manifest).find(chunk => chunk.name === 'PortalinkSplashLoader');
  assert.ok(loader, 'welcome remains a separately loaded public feature');
  const styles = (loader.css ?? []).map(path => read('dist/client/' + path)).join('\n');
  assert.match(styles, /mobile-share-create/);
  assert.match(styles, /mobile-share-secondary/);
  assert.match(styles, /border-radius:999px/);
  assert.match(styles, /flex-direction:column/);
  assert.doesNotMatch(styles, /mobile-navigation-dock|profile-editor-page/);
});
