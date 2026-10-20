import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';
import { officialOrigin, publicOriginFixture, publicRedirectFixture } from './helpers/public-origin-fixture.mjs';

const legacy = 'https://portalinknetworksinc.avimangalmurti566055.chatgpt.site';
const { publicOriginRedirect } = publicRedirectFixture;
const uuid = '11111111-1111-4111-8111-111111111111';
const publicPaths = ['/creator', '/creator/c/portal/project', '/creator/collaboration',
  `/share/${uuid}`, `/share/${uuid}/c/portal/project`, '/cite/opaque%2Fitem',
  '/licenses/citable-v1', '/licenses/view-only-v1', '/sitemap.xml'];
const plainPaths = ['/licenses/citable-v1', '/licenses/view-only-v1', '/sitemap.xml'];
const expectedLocation = (path, search = '') => officialOrigin + path + search + (plainPaths.includes(path) ? '#' : '');

function compileWorker(imports, globals = {}) {
  const source = readFileSync(new URL('../src/sites-worker.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://test.supabase.co'")
    .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', "'synthetic-publishable'");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, URL, Request, Response, Headers, ...globals,
    require: name => imports[name] ?? new Proxy({}, { get: () => assert.fail('Unexpected handler access: ' + name) }),
  });
  return exports.default;
}

test('legacy public pages redirect GET/HEAD to the official host with the exact encoded path and query', () => {
  for (const method of ['GET', 'HEAD']) for (const path of publicPaths) {
    const search = '?via=friend&page=2&media=a%2Fb&view=pages&tag=x&tag=y&title=A+B%20C';
    const response = publicOriginRedirect(new Request(legacy + path + search, { method }));
    assert.equal(response.status, 301, method + path);
    assert.equal(response.headers.get('location'), expectedLocation(path, search));
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.body, null);
  }
});

test('only the exact observed legacy hostname is redirected and public query values cannot select a host', () => {
  for (const origin of [officialOrigin, 'http://localhost:5178', 'https://site.test',
    'https://another.chatgpt.site', legacy + '.attacker.example', 'https://www.portalinknetworks.com']) {
    assert.equal(publicOriginRedirect(new Request(origin + '/creator')), null, origin);
  }
  const response = publicOriginRedirect(new Request(legacy + '/creator?next=%2F%2Fattacker.example&url=https%3A%2F%2Fattacker.example'));
  assert.equal(new URL(response.headers.get('location')).origin, officialOrigin);
  assert.equal(publicOriginRedirect(new Request(legacy + '//attacker.example/creator')), null);
});

test('mutations and Authorization-bearing requests are never redirected', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    assert.equal(publicOriginRedirect(new Request(legacy + '/creator', { method })), null, method);
  }
  for (const header of ['authorization', 'proxy-authorization']) for (const method of ['GET', 'HEAD']) {
    assert.equal(publicOriginRedirect(new Request(legacy + '/creator', { method, headers: { [header]: 'Bearer synthetic' } })), null);
  }
});

test('Auth query markers remain on their issuing origin, including mixed-case encoded names', () => {
  for (const marker of ['auth', 'code', 'state', 'nonce', 'token', 'token_hash', 'access_token',
    'refresh_token', 'id_token', 'provider_token', 'provider_refresh_token', 'session', 'session_id',
    'type', 'entry', 'onboarding_return', 'error', 'error_code', 'error_description',
    'expires_at', 'expires_in', 'token_type']) {
    const encoded = encodeURIComponent(marker.toUpperCase()).replace('A', '%41');
    assert.equal(publicOriginRedirect(new Request(`${legacy}/creator?via=friend&${encoded}=synthetic`)), null, marker);
  }
});

test('legacy browser documents defer to the fragment-aware HTML guard while crawlers still redirect', () => {
  for (const method of ['GET', 'HEAD']) for (const headers of [
    { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0' },
    { 'sec-fetch-dest': 'document', 'user-agent': 'Mozilla/5.0' },
  ]) {
    for (const path of ['/old.creator', '/cite/opaque-item']) {
      assert.equal(publicOriginRedirect(new Request(legacy + path, { method, headers })), null);
    }
    const response = publicOriginRedirect(new Request(legacy + '/old.creator', {
      method, headers: { ...headers, 'user-agent': 'WhatsApp/2.0' },
    }));
    assert.equal(response.status, 301);
  }
});

test('plain license and sitemap browser documents use explicit empty fragments instead of inheriting tokens', () => {
  for (const path of plainPaths) {
    const response = publicOriginRedirect(new Request(legacy + path + '?via=reference', {
      headers: { accept: 'text/html', 'sec-fetch-dest': 'document', 'user-agent': 'Mozilla/5.0' },
    }));
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), expectedLocation(path, '?via=reference'));
    assert.ok(response.headers.get('location').endsWith('#'));
  }
});

test('root callbacks, app entries, APIs and internal/media/asset requests stay outside the server redirect', () => {
  for (const path of ['/', '/index.html', '/?welcome=1', '/?auth=reset-password', '/?code=synthetic',
    '/studio', '/messages', '/settings', '/api/media-interactions', '/api/exports/portfolio/a',
    '/api/portfolio-card/a', '/api/auth/google/callback', '/media/avatars/a/avatar.webp',
    '/__portalink_media/a/file', '/assets/app-12345678.js', '/sw.js']) {
    assert.equal(publicOriginRedirect(new Request(legacy + path)), null, path);
  }
});

test('the real worker redirects before accessing assets, D1 or any backend handler', async () => {
  const worker = compileWorker({
    './features/citations/publicOrigin': publicOriginFixture,
    './server/publicOriginRedirect': publicRedirectFixture,
  }, {
    fetch: () => assert.fail('A redirect must not call a backend'),
  });
  const environment = new Proxy({}, { get: (_target, key) => assert.fail('Unexpected environment access: ' + String(key)) });
  for (const method of ['GET', 'HEAD']) for (const path of publicPaths) {
    const response = await worker.fetch(new Request(legacy + path + '?via=resume', {
      method, headers: { accept: 'text/html', 'user-agent': 'Twitterbot/1.0' },
    }), environment);
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), expectedLocation(path, '?via=resume'));
  }
});

test('legacy browser aliases and UUIDs return the visitor guard without a fragment-inheriting HTTP redirect', async () => {
  const model = sourceModule('src/features/sharing/shareModel.ts');
  const address = sourceModule('src/server/shareAddress.ts', {
    '../features/citations/publicOrigin': publicOriginFixture,
    '../features/sharing/shareModel': model,
    './publicOriginRedirect': publicRedirectFixture,
  }, { Response, AbortSignal, fetch: async (url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.authorization, undefined);
    return Response.json(url.endsWith('profile_share_address') ? { handle: 'creator' }
      : { profileId: uuid, handle: 'creator', alias: true });
  } });
  const worker = compileWorker({
    './features/citations/publicOrigin': publicOriginFixture,
    './server/publicOriginRedirect': publicRedirectFixture,
    './features/sharing/shareModel': model,
    './server/shareAddress': address,
    './server/citation': { citationLicenseResponse: () => null },
    './server/publicMedia': { isPublicMediaRoute: () => false },
    './server/sharedPreview': { prefersHtml: () => true },
  });
  const visitor = readFileSync(new URL('../share.html', import.meta.url), 'utf8');
  const environment = { ASSETS: { fetch: async request => {
    assert.equal(new URL(request.url).pathname, '/share');
    return new Response(visitor, { headers: { 'content-type': 'text/html' } });
  } }, get DB() { assert.fail('A document must not access D1'); } };
  for (const path of ['/old.creator', `/share/${uuid}`]) {
    // The HTTP request never contains the browser fragment.
    const wireUrl = legacy + path + '?page=2&media=a%2Fb';
    const response = await worker.fetch(new Request(wireUrl, {
      headers: { accept: 'text/html', 'sec-fetch-dest': 'document', 'user-agent': 'Mozilla/5.0' },
    }), environment);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    const html = await response.text();
    const guard = html.match(/<script data-portalink-canonical-entry>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(guard, 'The actual visitor guard is returned');
    if (path.startsWith('/old.')) assert.match(html, /window\.__PORTALINK_HANDLE__=/, 'Handle resolution is still injected');
    for (const hash of ['#access_token=synthetic&refresh_token=synthetic&type=recovery', '#section-2']) {
      const replacements = [];
      vm.runInNewContext(guard, { URL, URLSearchParams, window: {
        location: { href: wireUrl + hash, replace: url => replacements.push(url) },
      } });
      assert.deepEqual(replacements, hash.startsWith('#access_token') ? [] : [officialOrigin + path + '?page=2&media=a%2Fb' + hash]);
    }
  }
  const officialAlias = await address.resolveShareRequest(new Request(officialOrigin + '/old.creator', {
    headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0' },
  }), { supabaseUrl: 'https://test.supabase.co', publishableKey: 'synthetic' });
  assert.equal(officialAlias.redirect.headers.get('location'), officialOrigin + '/creator');
});

test('alias and UUID canonicalization cannot bypass the method, bearer or Auth-marker exclusions', async () => {
  const server = sourceModule('src/server/shareAddress.ts', {
    '../features/citations/publicOrigin': publicOriginFixture,
    '../features/sharing/shareModel': sourceModule('src/features/sharing/shareModel.ts'),
    './publicOriginRedirect': publicRedirectFixture,
  }, { Request, Response, AbortSignal, fetch: () => assert.fail('Excluded requests must not resolve aliases') });
  for (const request of [new Request(legacy + '/old.creator', { method: 'POST' }),
    new Request(legacy + '/old.creator', { headers: { authorization: 'Bearer synthetic' } }),
    new Request(legacy + `/share/${uuid}?code=synthetic`), new Request(legacy + '/old.creator?token_hash=synthetic')]) {
    assert.equal(Object.keys(await server.resolveShareRequest(request, {})).length, 0);
  }
});
