import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { publicMediaPreviewPlugin } from '../scripts/public-media-preview.mjs';

function execute(path, require = () => ({})) {
  const exports = {};
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('import.meta.env.VITE_SUPABASE_URL', 'undefined');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require, URL, Request, Response, Headers, AbortSignal, crypto, Uint8Array });
  return exports;
}
const urls = execute('src/features/media/publicMediaUrl.ts');
const handler = execute('src/server/publicMedia.ts', () => urls);

function harness(module = handler) {
  let middleware, loaded = 0, passed = 0;
  const plugin = publicMediaPreviewPlugin({ supabaseUrl: 'https://fixture.supabase.co' });
  plugin.configureServer({
    middlewares: { use(value) { middleware = value; } },
    async ssrLoadModule(path) { assert.equal(path, '/src/server/publicMedia.ts'); loaded++; return module; },
  });
  return { plugin, get loaded() { return loaded; }, get passed() { return passed; },
    async request(url, method = 'GET', headers = {}) {
      const response = new PassThrough();
      const parts = [];
      response.headers = {};
      response.setHeader = (name, value) => { response.headers[name] = value; };
      response.on('data', chunk => parts.push(chunk));
      await middleware({ url, method, headers }, response, () => { passed++; response.end(); });
      return { status: response.statusCode, headers: response.headers, body: Buffer.concat(parts).toString() };
    },
  };
}

test('Vite media middleware preserves app/private-original routes and runs only in development', async () => {
  const h = harness();
  assert.equal(h.plugin.apply, 'serve');
  for (const path of ['/share/profile', '/assets/app.js', '/__portalink_media/original.pdf', '/api/media-interactions']) await h.request(path);
  assert.equal(h.passed, 4);
  assert.equal(h.loaded, 0);
});

test('unsupported public-media prefixes return 404, never the SPA fallback', async () => {
  const h = harness();
  for (const path of ['/media/project-media/private.pdf', '/media', '/media/covers-not/file']) {
    const response = await h.request(path);
    assert.equal(response.status, 404);
    assert.equal(response.body, '');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  assert.equal(h.passed, 0);
});

test('development uses the real worker validation without contacting Storage', async () => {
  const h = harness();
  for (const path of ['/media/covers/not-a-cover.webp', '/media/avatars/%252e%252e/private']) {
    const response = await h.request(path);
    assert.equal(response.status, 400);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  assert.equal((await h.request('/media/covers/invalid', 'POST')).status, 405);
  assert.equal(h.passed, 0);
});

test('the response bridge streams bytes and passes only public image request headers', async () => {
  let input, options;
  const h = harness({ ...handler, async handlePublicMedia(request, config) {
    input = request; options = config;
    return new Response('fixture image', { headers: { 'content-type': 'image/webp', 'x-portalink-media-cache': 'BYPASS' } });
  } });
  const result = await h.request('/media/covers/fixture', 'GET', { accept: 'image/webp', 'if-none-match': '"old"', authorization: 'Bearer secret', cookie: 'secret=value' });
  assert.equal(result.status, 200);
  assert.equal(result.body, 'fixture image');
  assert.equal(result.headers['x-portalink-media-cache'], 'BYPASS');
  assert.deepEqual([...input.headers], [['accept', 'image/webp'], ['if-none-match', '"old"']]);
  assert.equal(options.supabaseUrl, 'https://fixture.supabase.co');
});
