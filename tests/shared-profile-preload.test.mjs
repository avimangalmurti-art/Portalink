import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { sharedProfilePreloadPlugin, sharedProfilePreloadScript } from '../scripts/shared-profile-preload.mjs';

const profileId = 'a0000000-0000-4000-8000-000000000001';
const categoryId = '00000000-0000-4000-8000-000000000002';
const projectId = '00000000-0000-4000-8000-000000000003';
const configuration = { supabaseUrl: 'https://test.supabase.co', publishableKey: 'sb_publishable_synthetic_public_key' };
const source = readFileSync(new URL('../src/services/supabase/sharedProfileBundle.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function fixture() { return { profile: { id: profileId, name: 'Creator', handle: 'creator', headline: '', location: '', avatar_url: '', nav_heading: 'Projects', stats: [], social_links: {}, links: [], is_private: false }, categories: [], projects: [], attachments: [] }; }
function harness(path = `/share/${profileId}`, fetchResult = async () => Response.json(fixture()), resolution) {
  const calls = [], timers = new Map();
  const window = { location: { pathname: path }, __PORTALINK_HANDLE__: resolution };
  const context = vm.createContext({ window, AbortController, Promise, Date, exports: {}, require(name) { assert.equal(name, '../../features/journey/journey'); return sourceModule('src/features/journey/journey.ts'); },
    setTimeout(callback, delay) { timers.set(1, { callback, delay }); return 1; }, clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => { calls.push({ url, options }); return fetchResult(url, options); },
  });
  const run = () => vm.runInContext(sharedProfilePreloadScript(configuration), context);
  run(); vm.runInContext(code, context);
  return { window, calls, timers, run, read: context.exports.readSharedProfileBundle };
}

test('classic head preload starts one anonymous request before the reader and adopts it in flight', async () => {
  let complete;
  const h = harness(`/share/${profileId.toUpperCase()}/c/${categoryId}/${projectId}`, () => new Promise(resolve => { complete = resolve; }));
  h.run(); await Promise.resolve();
  assert.equal(h.calls.length, 1);
  const { url, options } = h.calls[0];
  assert.equal(url, configuration.supabaseUrl + '/rest/v1/rpc/shared_profile_bundle');
  assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), { profile_id: profileId });
  const headers = new Headers(options.headers);
  assert.equal(headers.get('apikey'), configuration.publishableKey);
  assert.equal(headers.get('authorization'), null); assert.equal(headers.get('cookie'), null);
  assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
  assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(h.timers.get(1).delay, 8000);
  let sdkCalls = 0;
  const client = { rpc: async () => { sdkCalls++; return { data: fixture(), error: null }; } };
  const pending = h.read(client, profileId.toUpperCase());
  assert.equal(sdkCalls, 0); assert.equal(h.window.__PORTALINK_SHARED_BUNDLE_PRELOAD__, undefined);
  complete(Response.json(fixture()));
  const result = await pending;
  assert.equal(result.status, 'available'); assert.equal(result.bundle.profile.id, profileId); assert.equal(h.timers.size, 0);
  await h.read(client, profileId);
  assert.equal(sdkCalls, 1, 'A retry/invalidation makes a fresh SDK read instead of replaying the document preload');
});

test('handle shell adopts its resolved profile and starts only one bundle request', async () => {
  const h = harness('/creator', undefined, { profileId, handle: 'creator', alias: false });
  h.run();
  const result = await h.read({ rpc: async () => { throw new Error('Duplicate request'); } }, profileId);
  assert.equal(result.bundle.profile.id, profileId);
  assert.equal(h.calls.length, 1);
});

test('preload scope accepts canonical share routes and ignores normal/invalid paths', async () => {
  for (const suffix of ['', '/', `/c/${categoryId}`, `/c/${categoryId}/${projectId}`, '/collaboration']) {
    const h = harness(`/share/${profileId}${suffix}`);
    await h.window.__PORTALINK_SHARED_BUNDLE_PRELOAD__.promise;
    assert.equal(h.calls.length, 1);
  }
  for (const path of ['/', `/p/${profileId}`, '/share/not-an-id', `/share/${profileId}/edit`, `/share/${profileId}/c/not-an-id`]) {
    const h = harness(path); await Promise.resolve();
    assert.equal(h.calls.length, 0); assert.equal(h.window.__PORTALINK_SHARED_BUNDLE_PRELOAD__, undefined);
  }
});

test('preload failures retain RPC error semantics and never silently duplicate the request', async () => {
  const cases = [
    [async () => Response.json({ code: 'PGRST202', message: 'Could not find the function public.shared_profile_bundle(profile_id) in the schema cache' }, { status: 404 }), 'unsupported'],
    [async () => Response.json(null), 'available'],
    [async () => Response.json({ code: '42501', message: 'permission denied' }, { status: 403 }), /permission denied/],
    [async () => Response.json({ code: '42883', message: 'function private_dependency(uuid) does not exist' }, { status: 500 }), /private_dependency/],
    [async () => Response.json({ malformed: true }), /response is invalid/],
    [async () => { throw new Error('offline'); }, /Please try again/],
    [async () => new Response('bad JSON', { status: 500 }), /Please try again/],
  ];
  for (const [response, expected] of cases) {
    const h = harness(undefined, response); let sdkCalls = 0;
    const result = h.read({ rpc: async () => { sdkCalls++; return { data: fixture(), error: null }; } }, profileId);
    if (typeof expected === 'string') assert.equal((await result).status, expected);
    else await assert.rejects(result, expected);
    assert.equal(sdkCalls, 0); assert.equal(h.timers.size, 0);
  }
});

test('expired, mismatched or malformed preload records cannot enter a fresh profile read', async () => {
  for (const mutate of [
    record => { record.profileId = categoryId; }, record => { record.startedAt = Date.now() - 30_001; },
    record => { record.startedAt = Date.now() + 10_000; }, record => { record.startedAt = NaN; },
    record => { record.version = 2; }, record => { record.promise = {}; },
  ]) {
    const h = harness(); await h.window.__PORTALINK_SHARED_BUNDLE_PRELOAD__.promise;
    mutate(h.window.__PORTALINK_SHARED_BUNDLE_PRELOAD__); let sdkCalls = 0;
    await h.read({ rpc: async () => { sdkCalls++; return { data: fixture(), error: null }; } }, profileId);
    assert.equal(sdkCalls, 1); assert.equal(h.window.__PORTALINK_SHARED_BUNDLE_PRELOAD__, undefined);
  }
});

test('preload timeout becomes an adopted recoverable error, without an unhandled rejection', async () => {
  const h = harness(undefined, (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  await Promise.resolve(); h.timers.get(1).callback();
  const reply = await h.window.__PORTALINK_SHARED_BUNDLE_PRELOAD__.promise;
  assert.match(reply.error.message, /Please try again/); assert.equal(h.timers.size, 0);
});

test('HTML plugin injects hints in both entries, deduplicates fonts and preloads only the visitor entry', () => {
  const plugin = sharedProfilePreloadPlugin(configuration);
  const html = '<head><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin></head>';
  const main = plugin.transformIndexHtml.handler(html, { filename: '/site/index.html' });
  const visitor = plugin.transformIndexHtml.handler(html, { filename: 'C:\\site\\share.html' });
  assert.equal(main.some(tag => tag.tag === 'script'), false);
  assert.equal(main.filter(tag => tag.attrs.rel === 'preconnect').length, 1);
  assert.equal(main.filter(tag => tag.attrs.rel === 'dns-prefetch').length, 3);
  assert.equal(main.find(tag => tag.attrs.rel === 'preconnect').attrs.href, configuration.supabaseUrl);
  assert.equal(visitor.filter(tag => tag.tag === 'script').length, 1);
  assert.equal(visitor.find(tag => tag.tag === 'script').attrs.type, undefined, 'Runs as a classic script before deferred modules');
  assert.ok(visitor.every(tag => tag.injectTo === 'head-prepend'));
});

test('HTML generation supports legacy anon keys, rejects secrets/placeholders and escapes script boundaries', () => {
  const jwt = role => 'header.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature';
  assert.ok(sharedProfilePreloadScript({ ...configuration, publishableKey: jwt('anon') }));
  for (const config of [{}, { ...configuration, supabaseUrl: 'https://untrusted.example' },
    { ...configuration, publishableKey: 'YOUR_SUPABASE_PUBLIC_KEY' },
    { ...configuration, publishableKey: jwt('service_role') }, { ...configuration, publishableKey: 'sb_secret_should_never_enter_html' }]) {
    assert.equal(sharedProfilePreloadScript(config), null);
    assert.equal(sharedProfilePreloadPlugin(config).transformIndexHtml.handler('', { path: '/share.html' }).some(tag => tag.tag === 'script'), false);
  }
  const script = sharedProfilePreloadScript({ ...configuration, publishableKey: configuration.publishableKey + '</script><script>alert(1)</script>' });
  assert.doesNotMatch(script, /<\/script>/i); assert.match(script, /\\u003c/);
});
