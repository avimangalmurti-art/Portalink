import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const PROFILE = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const HASH = 'a'.repeat(64);
const COVER = `${PROFILE}/${PROJECT}/${HASH}/200.webp`;
const AVATAR = `${PROFILE}/${PROJECT}-face.webp`;
const SITE = 'https://portalink.test';
const SUPABASE = 'https://portalink-fixture.supabase.co';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function execute(path, require = () => ({}), globals = {}) {
  const exports = {};
  const source = read(path).replaceAll('import.meta.env.VITE_SUPABASE_URL', 'undefined');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require, URL, Request, Response, Headers, AbortSignal, crypto, Uint8Array, ...globals });
  return exports;
}
const urls = execute('src/features/media/publicMediaUrl.ts');
const { handlePublicMedia, isPublicMediaRoute } = execute('src/server/publicMedia.ts', () => urls);

function harness({ response = () => new Response('image fixture', { headers: { 'content-type': 'image/webp', etag: '"fixture-1"' } }), cache = true } = {}) {
  const calls = [], entries = new Map();
  const options = {
    supabaseUrl: SUPABASE,
    fetch: async (url, options) => { calls.push({ url: String(url), options }); return response(); },
    ...(cache ? { cache: {
      match: async request => entries.get(request.url)?.clone(),
      put: async (request, result) => { entries.set(request.url, result.clone()); },
    } } : {}),
  };
  return { calls, entries, options, request: (path = `/media/covers/${COVER}`, init) => handlePublicMedia(new Request(SITE + path, init), options) };
}

test('public covers miss once then hit the edge cache with immutable headers, MIME and ETag', async () => {
  const h = harness();
  const first = await h.request();
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(first.headers.get('content-type'), 'image/webp');
  assert.equal(first.headers.get('etag'), '"fixture-1"');
  assert.equal(first.headers.get('vary'), 'Accept');
  assert.equal(first.headers.get('x-portalink-media-cache'), 'MISS');
  assert.equal(await first.text(), 'image fixture');
  const second = await h.request();
  assert.equal(second.headers.get('x-portalink-media-cache'), 'HIT');
  assert.equal(await second.text(), 'image fixture');
  assert.equal(h.calls.length, 1);
});

test('200 and 400 public covers use confirmed Storage transformation of the 800 master', async () => {
  const h = harness();
  for (const size of [200, 400, 800]) await h.request(`/media/covers/${COVER.replace('200.webp', `${size}.webp`)}`);
  for (const [index, size] of [200, 400].entries()) {
    const url = new URL(h.calls[index].url);
    assert.equal(url.pathname, `/storage/v1/render/image/public/project-covers/${COVER.replace('200.webp', '800.webp')}`);
    assert.equal(url.searchParams.get('width'), String(size));
    assert.equal(url.searchParams.get('height'), String(size));
    assert.equal(url.searchParams.get('resize'), 'contain');
    assert.equal(url.searchParams.get('format'), 'origin');
  }
  assert.equal(h.calls[2].url, `${SUPABASE}/storage/v1/object/public/project-covers/${COVER.replace('200.webp', '800.webp')}`);
});

test('only fixed public prefixes and canonical thumbnail/object paths can be fetched', async () => {
  const h = harness();
  for (const path of [
    '/media/project-media/private.pdf', '/media/covers', '/media/covers/',
    `/media/covers/${COVER}?bucket=project-media`, `/media/covers/${COVER.replace('200.webp', 'original.pdf')}`,
    `/media/covers/${COVER.replace(HASH, 'not-hashed')}`, `/media/covers/${COVER.replace(PROFILE, '%252e%252e')}`,
    `/media/covers/${COVER.replace(PROFILE, 'https://private.test')}`, `/media/covers/${COVER.replace(PROFILE, '%00')}`,
    `/media/covers/${COVER.replace(PROFILE + '/', PROFILE + '%2f')}`, `/media/covers/${COVER.replace(PROFILE, '%5cprivate')}`,
    `/media/avatars/${PROFILE}/../private.pdf`, `/media/avatars/${PROFILE}/%2e%2e`, `/media/avatars/${PROFILE}/%GG.webp`,
  ]) assert.equal((await h.request(path)).status, 400, path);
  assert.equal(h.calls.length, 0);
  assert.equal(isPublicMediaRoute('/media/covers'), true);
  assert.equal(isPublicMediaRoute('/media/covers-wrong/file'), false);
});

test('transformed covers preserve the actual raster MIME and cache it without accepting active content', async () => {
  for (const contentType of ['image/jpeg', 'image/png', 'image/avif', 'image/webp']) {
    const h = harness({ response: () => new Response('transformed fixture', { headers: { 'content-type': contentType, etag: '"transformed"' } }) });
    const first = await h.request();
    assert.equal(first.status, 200); assert.equal(first.headers.get('content-type'), contentType);
    assert.equal(first.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(first.headers.get('vary'), 'Accept');
    const second = await h.request();
    assert.equal(second.headers.get('x-portalink-media-cache'), 'HIT');
    assert.equal(second.headers.get('content-type'), contentType); assert.equal(h.calls.length, 1);
  }
  for (const contentType of ['image/svg+xml', 'text/html', 'application/json']) {
    const h = harness({ response: () => new Response('not a raster cover', { headers: { 'content-type': contentType } }) });
    assert.equal((await h.request()).status, 502); assert.equal(h.entries.size, 0);
  }
  for (const size of ['800', 'social']) {
    const h = harness({ response: () => new Response('wrong stored type', { headers: { 'content-type': 'image/jpeg' } }) });
    assert.equal((await h.request(`/media/covers/${COVER.replace('200.webp', size + '.webp')}`)).status, 502);
    assert.equal(h.entries.size, 0);
  }
});

test('no incoming authorization, cookies, user agent, IP, range or conditionals reach Storage', async () => {
  const h = harness();
  await h.request(undefined, { headers: {
    authorization: 'Bearer private-session', cookie: 'session=private', 'user-agent': 'private-agent',
    'x-forwarded-for': '127.0.0.2', range: 'bytes=0-10', 'if-none-match': '"other"', accept: 'image/webp',
  } });
  const forwarded = new Headers(h.calls[0].options.headers);
  assert.deepEqual([...forwarded.entries()], [['accept', 'image/webp']]);
  assert.equal(h.calls[0].options.redirect, 'manual');
  assert.equal(h.calls[0].options.method, 'GET');
  assert.equal(h.calls[0].url.startsWith(SUPABASE + '/'), true);
});

test('Accept variants have separate cache entries and HEAD / conditional requests work', async () => {
  const h = harness();
  await h.request(undefined, { headers: { accept: 'image/webp' } });
  await h.request(undefined, { headers: { accept: 'image/png' } });
  assert.equal(h.calls.length, 2);
  const head = await h.request(undefined, { method: 'HEAD', headers: { accept: 'image/webp' } });
  assert.equal(head.headers.get('x-portalink-media-cache'), 'HIT');
  assert.equal(await head.text(), '');
  const conditional = await h.request(undefined, { headers: { accept: 'image/webp', 'if-none-match': 'W/"fixture-1"' } });
  assert.equal(conditional.status, 304);
  assert.equal(await conditional.text(), '');
  assert.equal(h.calls.length, 2);
});

test('versioned avatars are immutable; legacy avatar names revalidate after five minutes', async () => {
  const h = harness();
  for (const path of [AVATAR, `${PROFILE}/registration-${PROJECT}-${HASH}`]) {
    const response = await h.request(`/media/avatars/${path}`);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  }
  const legacy = await h.request(`/media/avatars/${PROFILE}/avatar.png`);
  assert.equal(legacy.headers.get('cache-control'), 'public, max-age=300, must-revalidate');
  assert.equal(new URL(h.calls[2].url).pathname, `/storage/v1/object/public/avatars/${PROFILE}/avatar.png`);
});

test('missing cache support bypasses cleanly and missing upstream ETags use actual-byte SHA256', async () => {
  const h = harness({ cache: false, response: () => new Response('image fixture', { headers: { 'content-type': 'image/webp' } }) });
  const response = await h.request();
  assert.equal(response.headers.get('x-portalink-media-cache'), 'BYPASS');
  assert.match(response.headers.get('etag'), /^"[a-f0-9]{64}"$/);
  assert.equal(await response.text(), 'image fixture');
});

test('missing ETag hashing rejects oversized declared and streamed bodies without caching', async () => {
  for (const response of [
    () => new Response('oversized', { headers: { 'content-type': 'image/webp', 'content-length': String(9 * 1024 * 1024) } }),
    () => new Response(new Uint8Array(8 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/webp' } }),
  ]) {
    const h = harness({ response });
    assert.equal((await h.request()).status, 502);
    assert.equal(h.entries.size, 0);
  }
});

test('public SVG avatar is sandboxed and upstream cookies/private headers are discarded', async () => {
  const h = harness({ response: () => new Response('<svg/>', { headers: {
    'content-type': 'image/svg+xml; charset=utf-8', 'set-cookie': 'private=value', 'x-private': 'no', etag: '"svg"',
  } }) });
  const response = await h.request(`/media/avatars/${AVATAR.replace('.webp', '.svg')}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-private'), null);
});

test('the Sites caches.default global is used when no cache was injected', async () => {
  const h = harness();
  const { handlePublicMedia: withGlobalCache } = execute('src/server/publicMedia.ts', () => urls, { caches: { default: h.options.cache } });
  const options = { ...h.options, cache: undefined };
  const request = new Request(`${SITE}/media/covers/${COVER}`);
  assert.equal((await withGlobalCache(request, options)).headers.get('x-portalink-media-cache'), 'MISS');
  assert.equal((await withGlobalCache(request, options)).headers.get('x-portalink-media-cache'), 'HIT');
  assert.equal(h.calls.length, 1);
});

test('mutations, redirects, HTML and upstream errors never enter the public cache', async () => {
  const h = harness();
  const post = await h.request(undefined, { method: 'POST', body: 'bad' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
  assert.equal(h.calls.length, 0);
  for (const response of [
    () => new Response(null, { status: 302, headers: { location: 'https://private.test' } }),
    () => new Response('bad', { headers: { 'content-type': 'text/html' } }),
    () => new Response('bad', { status: 500 }),
    () => new Response('bad', { status: 404 }),
  ]) {
    const error = harness({ response });
    const result = await error.request();
    assert.equal(result.status >= 400, true);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(error.entries.size, 0);
  }
});

test('the configured upstream must be the existing HTTPS Supabase project shape', async () => {
  const h = harness();
  for (const supabaseUrl of ['http://private.test', 'https://private.test', 'https://user@fixture.supabase.co', 'https://fixture.supabase.co/other']) {
    assert.equal((await handlePublicMedia(new Request(`${SITE}/media/covers/${COVER}`), { ...h.options, supabaseUrl })).status, 503);
  }
  assert.equal(h.calls.length, 0);
});

test('client routing changes only this project public cover/avatar URLs', () => {
  assert.equal(urls.publicCoverUrl(COVER), `/media/covers/${COVER}`);
  assert.equal(urls.publicMediaUrl(`${SUPABASE}/storage/v1/object/public/project-covers/${COVER}`, SUPABASE), `/media/covers/${COVER}`);
  assert.equal(urls.publicMediaUrl(`${SUPABASE}/storage/v1/object/public/avatars/${AVATAR}`, SUPABASE), `/media/avatars/${AVATAR}`);
  for (const source of [
    `${SUPABASE}/storage/v1/object/sign/project-media/original.pdf?token=private`,
    `${SUPABASE}/storage/v1/object/public/project-media/original.webp`,
    `https://other.supabase.co/storage/v1/object/public/avatars/${AVATAR}`,
    `${SUPABASE}/storage/v1/object/public/avatars/${AVATAR}?download=1`,
    '/images/avatar.webp', 'blob:local-image', 'data:image/png;base64,abc',
  ]) assert.equal(urls.publicMediaUrl(source, SUPABASE), source);
});
