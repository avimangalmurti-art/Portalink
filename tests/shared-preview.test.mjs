import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const profilePath = `/share/${id(1)}`;
const categoryPath = `${profilePath}/c/${id(2)}`;
const projectPath = `${categoryPath}/${id(3)}`;
const profile = { name: 'Test creator', is_private: false };

function setup() {
  const calls = [], assetRequests = [];
  let rows = [{ id: id(1), ...profile, headline: 'Design and architecture' }];
  let status = 200;
  let extraMeta = '', failure = null;
  const globals = { URL, URLSearchParams, Request, Response, Headers, AbortSignal,
    fetch: async (address, options) => {
      const url = new URL(address);
      const headers = new Headers(options.headers);
      calls.push({ url, headers, options });
      assert.equal(url.origin, 'https://test.supabase.co');
      assert.equal(headers.get('apikey'), 'public-test-key');
      assert.equal(headers.get('authorization'), null, 'Never forward the owner session to preview reads');
      assert.equal(headers.get('cookie'), null);
      assert.equal(options.cache, 'no-store');
      if (failure) throw failure;
      return Response.json(rows, { status });
    },
  };
  function compile(path, imports = {}) {
    const exports = {};
    const source = read(path).replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://test.supabase.co'")
      .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', "'public-test-key'");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { ...globals, exports, require: name => { assert.ok(name in imports); return imports[name]; } });
    return exports;
  }
  const preview = compile('../src/server/sharedPreview.ts');
  const worker = compile('../src/sites-worker.ts', { './server/sharedPreview': preview }).default;
  const request = (path, extraHeaders = {}, method = 'GET') => {
    const headers = new Headers({ accept: 'text/html' });
    for (const [name, value] of Object.entries(extraHeaders)) {
      if (value === null) headers.delete(name);
      else headers.set(name, value);
    }
    return worker.fetch(new Request(`https://portalink.example${path}`, { headers, method }), { ASSETS: { fetch: async request => {
      assetRequests.push(request);
      // Only the root asset exists; shared links must explicitly reach it.
      if (new URL(request.url).pathname !== '/') return new Response('Not found', { status: 404 });
      const html = read('../index.html').replace('</head>', `${extraMeta}</head>`);
      const headers = { 'content-type': 'text/html', etag: 'template-etag', 'last-modified': 'yesterday', 'content-length': String(Buffer.byteLength(html)) };
      if (request.headers.has('if-none-match') || request.headers.has('if-modified-since')) return new Response(null, { status: 304, headers });
      return new Response(request.method === 'HEAD' ? null : html, { headers });
    } } });
  };
  return { request, calls, assetRequests, setRows: next => { rows = next; }, setStatus: next => { status = next; },
    setExtraMeta: value => { extraMeta = value; }, setFailure: value => { failure = value; } };
}

const avatar = file => `https://test.supabase.co/storage/v1/object/public/avatars/account/${file}.webp`;
function assertTextOnly(html) {
  assert.doesNotMatch(html, /(?:property|name)=["'](?:og|twitter):image[^"']*["']/i);
  assert.match(html, /name="twitter:card" content="summary"/);
  assert.doesNotMatch(html, /Hello World — the Portalink character/);
}

test('public profile previews identify the creator and strip viewer credentials and conditional template headers', async () => {
  const h = setup();
  const response = await h.request(`${profilePath}?token=private-value`, { authorization: 'Bearer owner-session', cookie: 'session=private', 'if-none-match': 'template-etag' });
  const html = await response.text();
  assert.ok(html.includes('<title>Test creator | Portalink</title>'));
  assert.ok(html.includes('name="description" content="Design and architecture"'));
  assert.ok(html.includes(`property="og:url" content="https://portalink.example${profilePath}"`));
  assert.ok(!html.includes('private-value'));
  assert.equal(h.calls[0].url.searchParams.get('is_private'), 'eq.false');
  assert.equal(h.assetRequests[0].headers.get('if-none-match'), null);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('etag'), null);
  assert.equal(response.headers.get('last-modified'), null);
});

test('shared GET navigation works with wildcard or absent Accept and bypasses stale template validators', async () => {
  for (const accept of ['*/*', null]) {
    const h = setup();
    const response = await h.request(profilePath, { accept, 'if-none-match': 'template-etag', 'if-modified-since': 'yesterday' });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes('<title>Test creator | Portalink</title>'));
    assert.equal(new URL(h.assetRequests[0].url).pathname, '/');
    assert.equal(h.assetRequests[0].method, 'GET');
    assert.equal(h.assetRequests[0].headers.get('accept'), accept);
    assert.equal(h.assetRequests[0].headers.get('if-none-match'), null);
    assert.equal(h.assetRequests[0].headers.get('if-modified-since'), null);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(h.calls.length, 1);
  }
});

test('shared HEAD navigation strips stale validators, remains bodyless and skips preview reads', async () => {
  for (const accept of ['text/html', '*/*', null]) {
    const h = setup();
    const response = await h.request(projectPath, { accept, 'if-none-match': 'template-etag', 'if-modified-since': 'yesterday' }, 'HEAD');
    assert.equal(response.status, 200);
    assert.equal(response.body, null);
    assert.equal(await response.text(), '');
    assert.equal(new URL(h.assetRequests[0].url).pathname, '/');
    assert.equal(h.assetRequests[0].method, 'HEAD');
    assert.equal(h.assetRequests[0].headers.get('if-none-match'), null);
    assert.equal(h.assetRequests[0].headers.get('if-modified-since'), null);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    for (const name of ['etag', 'last-modified', 'content-length', 'content-encoding']) assert.equal(response.headers.get(name), null);
    assert.equal(h.calls.length, 0);
  }
});

test('project and portal previews bind all route IDs and require public visible parents', async () => {
  const h = setup();
  h.setRows([{ id: id(3), title: 'Courtyard', summary: 'A light-filled home', profile, category: { id: id(2), is_hidden: false } }]);
  let html = await (await h.request(projectPath)).text();
  assert.ok(html.includes('Courtyard — Test creator | Portalink'));
  assert.ok(html.includes('A light-filled home'));
  const query = h.calls[0].url.searchParams;
  for (const [key, value] of [['profile_id', id(1)], ['category_id', id(2)], ['id', id(3)]]) assert.equal(query.get(key), `eq.${value}`);
  assert.equal(query.get('is_hidden'), 'eq.false');
  assert.equal(query.get('category.is_hidden'), 'eq.false');
  assert.equal(query.get('profile.is_private'), 'eq.false');
  h.setRows([{ id: id(2), label: 'Architecture', blurb: 'Selected projects', profile }]);
  html = await (await h.request(categoryPath)).text();
  assert.ok(html.includes('Architecture — Test creator | Portalink'));
  assert.equal(h.calls[1].url.pathname, '/rest/v1/portfolio_categories');
});

test('metadata escapes creator text as text and omits an unrelated image when the profile has none', async () => {
  const h = setup();
  h.setRows([{ id: id(1), name: 'A " & <script>alert(1)</script>', headline: "It's <b>work</b>", is_private: false }]);
  const html = await (await h.request(profilePath)).text();
  assert.ok(html.includes('A &quot; &amp; &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('It&#39;s &lt;b&gt;work&lt;/b&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assertTextOnly(html);
});

test('two public creator links use their own trusted avatar and matching text without inherited image dimensions', async () => {
  const h = setup();
  for (const [number, name, headline, file] of [[1, 'Alice', 'Architecture by Alice', 'alice'], [4, 'Bea', 'Photography by Bea', 'bea']]) {
    h.setRows([{ id: id(number), name, headline, is_private: false, avatar_url: avatar(file) }]);
    const response = await h.request(`/share/${id(number)}`);
    const html = await response.text();
    assert.match(html, new RegExp(`<title>${name} \\| Portalink</title>`));
    assert.ok(html.includes(`property="og:description" content="${headline}"`));
    assert.ok(html.includes(`name="twitter:description" content="${headline}"`));
    assert.ok(html.includes(`property="og:image" content="${avatar(file)}"`));
    assert.ok(html.includes(`name="twitter:image" content="${avatar(file)}"`));
    assert.ok(html.includes(`property="og:image:alt" content="${name}&#39;s profile image"`));
    assert.ok(html.includes(`name="twitter:image:alt" content="${name}&#39;s profile image"`));
    assert.match(html, /name="twitter:card" content="summary"/);
    assert.doesNotMatch(html, /(?:og:image|twitter:image):(?:width|height|type|secure_url)/);
    assert.doesNotMatch(html, /og\.png|Hello World — the Portalink character/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  assert.ok(h.calls.every(call => call.url.searchParams.get('select').includes('avatar_url')));
});

test('unsafe, signed, credential-bearing, transformed or non-avatar image URLs never enter shared metadata', async () => {
  const h = setup();
  const unsafe = [undefined, '', 'data:image/png;base64,private', '//test.supabase.co/storage/v1/object/public/avatars/a.webp',
    'http://test.supabase.co/storage/v1/object/public/avatars/a.webp', 'https://other.supabase.co/storage/v1/object/public/avatars/a.webp',
    'https://test.supabase.co.evil.test/storage/v1/object/public/avatars/a.webp',
    'https://owner:secret@test.supabase.co/storage/v1/object/public/avatars/a.webp',
    'https://test.supabase.co/storage/v1/object/sign/project-media/a.webp?token=secret',
    'https://test.supabase.co/storage/v1/object/public/project-media/a.webp',
    `${avatar('a')}?token=secret`, `${avatar('a')}?width=128`, `${avatar('a')}#access_token=secret`,
    'https://test.supabase.co/storage/v1/object/public/avatars/',
    'https://test.supabase.co/storage/v1/object/public/avatars/%2e%2e%2fproject-media/a.webp',
    'https://test.supabase.co/storage/v1/object/public/avatars/a%0a.webp', `${avatar('a')}\n`,
  ];
  for (const avatar_url of unsafe) {
    h.setRows([{ id: id(1), ...profile, avatar_url }]);
    const html = await (await h.request(profilePath)).text();
    assertTextOnly(html);
    assert.doesNotMatch(html, /secret|evil\.test|data:image/);
    assert.ok(html.includes('Test creator | Portalink'));
  }
});

test('shared metadata removes every inherited image variant regardless of attribute order or casing', async () => {
  const h = setup();
  h.setExtraMeta(`<meta content="https://stale.example/old" property='og:image:secure_url'><META NAME='TWITTER:IMAGE:ALT' CONTENT='STALE-ALT'><meta property="og:image:url" content="STALE-URL"><meta name="twitter:image:src" content="STALE-SRC"><meta property="og:image:width" content="999"><meta name="twitter:image0" content="STALE-OLD-CARD">`);
  h.setRows([{ id: id(1), ...profile, avatar_url: avatar('fresh') }]);
  const html = await (await h.request(profilePath)).text();
  assert.doesNotMatch(html, /stale\.example|STALE-|og:image:width|TWITTER:IMAGE:ALT/);
  assert.equal((html.match(/property="og:image"/g) ?? []).length, 1);
  assert.equal((html.match(/name="twitter:image"/g) ?? []).length, 1);
  assert.ok(html.includes(avatar('fresh')));
});

test('category and project previews stay text-only instead of borrowing the creator or global image', async () => {
  const h = setup();
  const creatorWithAvatar = { ...profile, avatar_url: avatar('creator') };
  h.setRows([{ id: id(2), label: 'Architecture', blurb: 'Selected projects', profile: creatorWithAvatar }]);
  assertTextOnly(await (await h.request(categoryPath)).text());
  h.setRows([{ id: id(3), title: 'Courtyard', summary: 'A light-filled home', avatar_url: avatar('irrelevant'), profile: creatorWithAvatar, category: { id: id(2), is_hidden: false } }]);
  const html = await (await h.request(projectPath)).text();
  assertTextOnly(html); assert.ok(html.includes('Courtyard — Test creator | Portalink'));
});

test('private, missing, mismatched and unavailable targets reveal no custom metadata or cached prior preview', async () => {
  const h = setup();
  assert.ok((await (await h.request(profilePath)).text()).includes('Test creator | Portalink'));
  for (const rows of [[], [{ id: id(1), name: 'Secret', is_private: true, avatar_url: avatar('secret') }], [{ id: id(9), name: 'Wrong creator', is_private: false, avatar_url: avatar('wrong') }]]) {
    h.setRows(rows);
    const response = await h.request(profilePath, { authorization: 'Bearer owner-session' });
    const html = await response.text();
    assert.ok(!html.includes('Test creator | Portalink'));
    assert.ok(!html.includes('Secret') && !html.includes('Wrong creator'));
    assertTextOnly(html);
    assert.ok(!html.includes(avatar('secret')) && !html.includes(avatar('wrong')));
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  h.setStatus(503);
  h.setRows({ message: 'upstream-private-detail' });
  let html = await (await h.request(profilePath)).text();
  assert.ok(!html.includes('upstream-private-detail')); assertTextOnly(html);
  h.setFailure(Error('upstream-private-detail'));
  html = await (await h.request(profilePath)).text();
  assert.ok(!html.includes('upstream-private-detail')); assertTextOnly(html);
});

test('ordinary navigation and invalid shared routes make no preview query', async () => {
  const h = setup();
  for (const path of ['/', '/settings', '/share/not-a-record', `${profilePath}/c/invalid`, `${profilePath}/extra`]) {
    const response = await h.request(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    const html = await response.text();
    assert.ok(html.includes('property="og:image" content="https://portalinknetworksinc.'));
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
  }
  assert.equal(h.calls.length, 0);
});
