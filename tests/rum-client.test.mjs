import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { sharedProfilePreloadScript } from '../scripts/shared-profile-preload.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, ...globals });
  return exports;
}
const core = load('src/features/performance/rumCore.ts');
const json = value => JSON.parse(JSON.stringify(value));
const version = 'abcdef1234567';
function fixture() {
  let now = 100;
  const sent = [], marks = [];
  const collector = core.createRumCollector({ now: () => now, version, viewport: () => 420, connection: () => '4g',
    send: payload => sent.push(json(payload)), onMark: (...args) => marks.push(args) });
  return { collector, sent, marks, time: value => { now = value; } };
}

test('RUM emits only four route kinds, never identifiers or unrelated screens', () => {
  for (const [path, kind] of [['/share/creator', 'share'], ['/share/creator/c/category', 'share'], ['/p/creator', 'profile'],
    ['/p/creator/c/category', 'profile'], ['/share/creator/c/category/project', 'project'], ['/p/creator/c/category/project', 'project'],
    ['/', 'home'], ['/feed/following', 'home'], ['/studio', null], ['/messages', null], ['/insights', null],
    ['/p/creator/collaboration', null], ['/profile/edit', null]]) assert.equal(core.rumRouteKind(path), kind, path);
  const { collector, sent } = fixture();
  const token = collector.begin('/share/private-looking-profile-id', 7.6);
  collector.mark('data_ms', token, 125.6); collector.mark('cover_ms', token, 500.1); collector.flush();
  assert.deepEqual(sent, [{ route_kind: 'share', boot_ms: 8, data_ms: 126, cover_ms: 500, pdf_ms: null,
    vw_bucket: '400-639', conn: '4g', version }]);
  assert.doesNotMatch(JSON.stringify(sent), /private-looking|pathname|account|profile_id|user_agent|ip_address/);
});

test('one send per view across visibility, pagehide, duplicate router effects and failed transport', () => {
  const { collector, sent, time } = fixture();
  const token = collector.begin('/share/a', 10);
  assert.equal(collector.begin('/share/a', 15), token);
  collector.mark('data_ms', token, 99); collector.flush(); collector.flush();
  collector.mark('cover_ms', token, 120); collector.begin('/share/a'); collector.flush();
  assert.equal(sent.length, 1); assert.equal(sent[0].cover_ms, null);
  time(300); const project = collector.begin('/share/a/c/b/c');
  collector.mark('pdf_ms', project, 850); collector.flush();
  assert.equal(sent.length, 2); assert.equal(sent[1].boot_ms, 300); assert.equal(sent[1].pdf_ms, 850);
  let sends = 0;
  const failing = core.createRumCollector({ now: () => 1, version, viewport: () => 390, connection: () => null,
    send: () => { sends++; throw new Error('offline'); } });
  failing.begin('/'); failing.flush(); failing.flush(); assert.equal(sends, 1);
});

test('late old-route events are rejected and unused metrics remain null', () => {
  const { collector, sent } = fixture();
  const previous = collector.begin('/share/a');
  const active = collector.begin('/share/b/c/c/p', 300);
  collector.mark('data_ms', previous, 500); collector.mark('pdf_ms', previous, 600);
  collector.mark('cover_ms', active, 600); collector.mark('pdf_ms', active, 800); collector.mark('pdf_ms', active, 900);
  collector.mark('data_ms', active, -1); collector.mark('data_ms', active, NaN); collector.mark('data_ms', active, Infinity);
  collector.mark('data_ms', active, 86_400_001); collector.flush();
  assert.equal(sent[1].data_ms, null); assert.equal(sent[1].cover_ms, null); assert.equal(sent[1].pdf_ms, 800);
  collector.begin('/settings'); collector.flush(); assert.equal(sent.length, 2);
});

test('viewport and effectiveType are coarse bounded values', () => {
  assert.deepEqual([390, 400, 420, 639, 640, 1023, 1024, 1280, 1439, 1440, 4000].map(core.rumViewportBucket),
    ['<400', '400-639', '400-639', '400-639', '640-1023', '640-1023', '1024-1439', '1024-1439', '1024-1439', '1440+', '1440+']);
  for (const value of ['slow-2g', '2g', '3g', '4g']) assert.equal(core.rumConnection(value), value);
  for (const value of ['wifi', '5g', undefined, { userAgent: 'do not send' }]) assert.equal(core.rumConnection(value), 'unknown');
});

test('first data excludes auth, storage, unknown RPCs and mutations', () => {
  for (const [path, method] of [['/rest/v1/profiles', 'GET'], ['/rest/v1/projects', 'GET'],
    ['/rest/v1/portfolio_categories?select=id', 'GET'], ['/rest/v1/project_attachments', 'GET'],
    ['/rest/v1/rpc/shared_profile_bundle', 'POST'], ['/rest/v1/rpc/project_feed_page', 'POST']]) {
    assert.equal(core.isRumContentRead(`https://fixture.supabase.co${path}`, method), true, path);
  }
  for (const [path, method] of [['/auth/v1/user', 'GET'], ['/auth/v1/token', 'POST'], ['/rest/v1/profiles', 'PATCH'],
    ['/rest/v1/projects', 'DELETE'], ['/rest/v1/rpc/publish_project', 'POST'], ['/rest/v1/rpc/mark_direct_conversation_read', 'POST'],
    ['/storage/v1/object/public/project-covers/a', 'GET'], ['/api/rum', 'POST']]) {
    assert.equal(core.isRumContentRead(`https://fixture.supabase.co${path}`, method), false, path);
  }
});

function browserHarness(fetcher = async () => new Response('{}')) {
  let now = 100;
  const sent = [], windowEvents = new Map(), documentEvents = new Map();
  const window = { location: { pathname: '/share/fixture' }, innerWidth: 390, __PORTALINK_RUM_BOOT_MS__: 10,
    addEventListener: (name, callback) => windowEvents.set(name, callback) };
  const document = { visibilityState: 'visible', addEventListener: (name, callback) => documentEvents.set(name, callback) };
  const module = load('src/features/performance/rum.ts', { window, document, performance: { now: () => now, mark() {} }, Blob,
    navigator: { connection: { effectiveType: '4g' }, sendBeacon: (url, body) => { sent.push({ url, body }); return true; } },
    fetch: fetcher, require: name => { assert.equal(name, './rumCore'); return core; } });
  return { module, window, sent, time: value => { now = value; }, hide: () => { document.visibilityState = 'hidden'; documentEvents.get('visibilitychange')?.(); },
    pagehide: () => windowEvents.get('pagehide')?.() };
}

test('browser adopts pre-React response time, sends a single beacon, and leaves prototypes silent', async () => {
  const h = browserHarness();
  h.window.__PORTALINK_RUM_PRELOAD_DATA__ = { pathname: '/share/fixture', at: 51.4 };
  h.module.initializeRum(version, false); h.hide(); assert.equal(h.sent.length, 0);
  h.module.initializeRum(version, true); h.time(300); h.module.markRumCover(h.module.rumViewToken());
  h.hide(); h.pagehide(); h.hide();
  assert.equal(h.sent.length, 1); assert.equal(h.sent[0].url, '/api/rum');
  const payload = JSON.parse(await h.sent[0].body.text());
  assert.equal(payload.boot_ms, 10); assert.equal(payload.data_ms, 51); assert.equal(payload.cover_ms, 300);
  assert.equal(h.sent[0].body.type, 'application/json'); assert.equal(h.window.__PORTALINK_RUM_PRELOAD_DATA__, undefined);
});

test('SDK fetch wrapper preserves requests and rejects a successful response from the previous route', async () => {
  let resolveResponse;
  const calls = [];
  const h = browserHarness((...args) => { calls.push(args); return new Promise(resolve => { resolveResponse = resolve; }); });
  h.module.initializeRum(version, true);
  const options = { method: 'GET', headers: { apikey: 'local-fixture' } };
  const pending = h.module.rumSupabaseFetch('https://fixture.supabase.co/rest/v1/projects', options);
  h.window.location.pathname = '/p/another'; h.module.beginRumPageView('/p/another');
  h.time(800); const response = new Response('{}'); resolveResponse(response);
  assert.equal(await pending, response); assert.equal(calls.length, 1); assert.equal(calls[0][1], options);
  h.hide(); assert.equal(h.sent.length, 2);
  assert.equal(JSON.parse(await h.sent[1].body.text()).data_ms, null);
});

test('SDK first-data timing comes from the successful content response, not authentication', async () => {
  const h = browserHarness(); h.module.initializeRum(version, true);
  h.time(120); await h.module.rumSupabaseFetch('https://fixture.supabase.co/auth/v1/user');
  h.time(450); await h.module.rumSupabaseFetch('https://fixture.supabase.co/rest/v1/projects');
  h.time(850); await h.module.rumSupabaseFetch('https://fixture.supabase.co/rest/v1/project_attachments');
  h.hide();
  assert.equal(JSON.parse(await h.sent[0].body.text()).data_ms, 450);
});

test('classic HTML preload records its own response arrival before module adoption', async () => {
  const pathname = '/share/a0000000-0000-4000-8000-000000000001';
  const window = { location: { pathname } };
  vm.runInNewContext(sharedProfilePreloadScript({ supabaseUrl: 'https://fixture.supabase.co', publishableKey: 'sb_publishable_synthetic_fixture_key' }), {
    window, performance: { now: () => 43.7 }, AbortController, Promise, Date,
    setTimeout: () => 1, clearTimeout() {}, fetch: async () => Response.json(null),
  });
  await window.__PORTALINK_SHARED_BUNDLE_PRELOAD__.promise;
  assert.deepEqual(json(window.__PORTALINK_RUM_PRELOAD_DATA__), { pathname, at: 43.7 });
  for (const html of ['index.html', 'share.html']) assert.match(read(html), /__PORTALINK_RUM_BOOT_MS__ = performance\.now\(\)/);
});

test('instrumentation marks image loads and successful document render completion', () => {
  const image = read('src/components/ui/ResponsiveImage.tsx');
  assert.match(image, /onLoad=\{event =>[\s\S]*trackCoverPaint[\s\S]*naturalWidth > 0[\s\S]*markRumCover/);
  assert.match(read('src/components/media/ProjectCover.tsx'), /trackCoverPaint/);
  for (const source of ['PdfPage.tsx', 'PdfImageDocument.tsx']) {
    assert.match(read(`src/components/media/${source}`), /renderTask\.promise\.then\([\s\S]*setStatus\('ready'\);\s*markRumPdf\(viewToken\)/);
  }
  assert.match(read('src/components/media/DocumentAttachment.tsx'), /onLoad=\{\(\) => \{\s*markRumPdf\(viewTokenRef\.current\)/);
});
