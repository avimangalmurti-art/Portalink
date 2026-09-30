import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const id = number => '00000000-0000-4000-8000-' + String(number).padStart(12, '0');
const profilePath = '/share/' + id(1);
const categoryPath = profilePath + '/c/' + id(2);
const projectPath = categoryPath + '/' + id(3);
const config = { supabaseUrl: 'https://test.supabase.co', publishableKey: 'public-test-key' };
const shell = read('../index.html');
const coverPath = id(1) + '/' + id(5) + '/cover.png';
const clone = value => JSON.parse(JSON.stringify(value));

function creator(overrides = {}) {
  return { id: id(1), name: 'Test creator', headline: 'Design and architecture', is_private: false, ...overrides };
}
function attachment(overrides = {}) {
  return { id: 'cover-attachment', project_id: id(3), kind: 'image', mime_type: 'image/png',
    storage_path: coverPath, is_cover: true, position: 0,
    metadata: { widthPixels: 1600, heightPixels: 900 }, ...overrides };
}
function project(overrides = {}) {
  return { id: id(3), profile_id: id(1), category_id: id(2), title: 'Courtyard',
    summary: 'A light-filled home', is_hidden: false, position: 0, published_at: '2026-09-01T12:00:00Z',
    profile: creator(), category: { id: id(2), profile_id: id(1), is_hidden: false },
    attachments: [attachment()], ...overrides };
}

function setup() {
  const calls = [], assetRequests = [];
  const state = {
    profiles: [creator()],
    categories: [{ id: id(2), profile_id: id(1), label: 'Architecture', blurb: 'Selected projects', is_hidden: false, profile: creator() }],
    projects: [project()], status: 200, failure: null, signStatus: 200, signedURL: null,
    extraHead: '', extraBody: '', now: 1_800_000_000_000, key: config.publishableKey,
    overrideRows: null, waitForAbort: false,
  };
  class TestDate extends Date { static now() { return state.now; } }
  const globals = { URL, URLSearchParams, Request, Response, Headers, AbortSignal, Date: TestDate,
    fetch: async (address, options = {}) => {
      const url = new URL(address), headers = new Headers(options.headers);
      calls.push({ url, headers, options });
      assert.equal(url.origin, config.supabaseUrl);
      assert.equal(headers.get('apikey'), state.key);
      assert.equal(headers.get('authorization'), null, 'Never forward the viewer session');
      assert.equal(headers.get('cookie'), null);
      assert.equal(options.cache, 'no-store');
      assert.ok(options.signal instanceof AbortSignal, 'Optional upstream operations have an abort deadline');
      if (state.failure) throw state.failure;
      if (state.waitForAbort) return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
      if (url.pathname.startsWith('/storage/v1/object/sign/project-media/')) {
        assert.equal(options.method, 'POST');
        assert.ok(JSON.parse(options.body).expiresIn > 300, 'Signed cover outlives HTML cache');
        const value = state.signedURL ?? url.pathname.slice('/storage/v1'.length) + '?token=test';
        return Response.json({ signedURL: value }, { status: state.signStatus });
      }
      assert.ok(url.pathname.startsWith('/rest/v1/'));
      if (state.status !== 200) return Response.json({ message: 'private-upstream-detail' }, { status: state.status });
      if (state.overrideRows) return Response.json(state.overrideRows(url));
      const table = url.pathname.split('/').at(-1);
      let rows = clone(table === 'profiles' ? state.profiles : table === 'portfolio_categories' ? state.categories : state.projects);
      const query = url.searchParams;
      for (const key of ['id', 'profile_id', 'category_id']) {
        const constraint = query.get(key);
        if (constraint?.startsWith('eq.')) rows = rows.filter(row => row[key] === constraint.slice(3));
      }
      if (query.get('position') === 'lt.0') rows = rows.filter(row => row.position < 0);
      if (table === 'projects') {
        const arranged = query.get('order')?.startsWith('position.asc');
        rows.sort((a, b) => (arranged ? a.position - b.position : 0)
          || b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id));
      }
      return Response.json(rows.slice(0, Number(query.get('limit') ?? rows.length)));
    },
  };
  function compile(path, imports = {}) {
    const exports = {};
    const source = read(path).replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://test.supabase.co'")
      .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', "'public-test-key'");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { ...globals, exports, require: name => { assert.ok(name in imports, name); return imports[name]; } });
    return exports;
  }
  const preview = compile('../src/server/sharedPreview.ts');
  const worker = compile('../src/sites-worker.ts', { './server/sharedPreview': preview }).default;
  const html = () => shell.replace('</head>', state.extraHead + '</head>').replace('</body>', state.extraBody + '</body>');
  const request = (path, extraHeaders = {}, method = 'GET') => {
    const headers = new Headers({ accept: 'text/html', 'user-agent': 'Twitterbot/1.0' });
    for (const [name, value] of Object.entries(extraHeaders)) {
      if (value === null) headers.delete(name);
      else headers.set(name, value);
    }
    return worker.fetch(new Request('https://portalink.example' + path, { headers, method }), { ASSETS: { fetch: async request => {
      assetRequests.push(request);
      if (!['/', '/share.html'].includes(new URL(request.url).pathname)) return new Response('Not found', { status: 404 });
      const body = html();
      const responseHeaders = { 'content-type': 'text/html', etag: 'template-etag',
        'last-modified': 'yesterday', 'content-length': String(Buffer.byteLength(body)) };
      if (request.headers.has('if-none-match') || request.headers.has('if-modified-since')) {
        return new Response(null, { status: 304, headers: responseHeaders });
      }
      return new Response(request.method === 'HEAD' ? null : body, { headers: responseHeaders });
    } } });
  };
  const direct = (path = profilePath, settings = {}) => {
    const { origin = 'https://portalink.example', previewConfig = config, body = html(), headers = {}, method = 'GET' } = settings;
    state.key = previewConfig.publishableKey;
    return preview.withSharedPreview(new Response(method === 'HEAD' ? null : body, { headers: { 'content-type': 'text/html' } }),
      new Request(origin + path, { method, headers: { accept: 'text/html', ...headers } }), previewConfig);
  };
  return { state, request, direct, preview, calls, assetRequests, html,
    reads: () => calls.filter(call => call.url.pathname.startsWith('/rest/')),
    signs: () => calls.filter(call => call.url.pathname.startsWith('/storage/')) };
}

function metadata(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return tags.filter(tag => {
    const key = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1];
    return key?.toLowerCase() === name.toLowerCase();
  }).map(tag => tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1]);
}
function value(html, name) {
  const values = metadata(html, name);
  assert.equal(values.length, 1, 'Exactly one ' + name + ' tag');
  return values[0];
}
function assertGeneric(html, expected = shell) {
  assert.equal(html, expected, 'Unavailable/unsafe cover keeps the original generic shell intact');
}
function assertImage(html, path = coverPath, width = 1600, height = 900) {
  assert.equal(value(html, 'og:image'), config.supabaseUrl + '/storage/v1/object/sign/project-media/' + path + '?token=test');
  assert.equal(value(html, 'twitter:image'), value(html, 'og:image'));
  assert.equal(value(html, 'og:image:width'), String(width));
  assert.equal(value(html, 'og:image:height'), String(height));
  assert.equal(value(html, 'twitter:card'), 'summary_large_image');
  assert.doesNotMatch(html.slice(0, html.indexOf('</head>')), /og\.png|Hello World — the Portalink character/);
}

test('profile card uses its first project cover, creator title, public-only queries and clean canonical URL', async () => {
  const h = setup();
  const response = await h.request(profilePath + '?token=private-value', {
    authorization: 'Bearer owner-session', cookie: 'session=private', 'if-none-match': 'template-etag',
  });
  const html = await response.text();
  assert.match(html, /<title>Test creator — Portfolio \| Portalink<\/title>/);
  assert.equal(value(html, 'og:description'), 'Design and architecture');
  assert.equal(value(html, 'og:type'), 'profile');
  assert.equal(value(html, 'og:url'), 'https://portalink.example' + profilePath);
  assert.doesNotMatch(html, /private-value|owner-session/);
  assertImage(html);
  assert.equal(h.reads()[0].url.searchParams.get('is_private'), 'eq.false');
  const projectQuery = h.reads().find(call => call.url.pathname.endsWith('/projects')).url.searchParams;
  assert.equal(projectQuery.get('profile_id'), 'eq.' + id(1));
  assert.equal(projectQuery.get('is_hidden'), 'eq.false');
  assert.equal(projectQuery.get('category.is_hidden'), 'eq.false');
  assert.equal(projectQuery.get('profile.is_private'), 'eq.false');
  assert.equal(h.assetRequests[0].headers.get('if-none-match'), null);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  for (const name of ['etag', 'last-modified', 'content-length', 'content-encoding']) assert.equal(response.headers.get(name), null);
});

test('browser shared navigations receive the visitor shell without waiting for metadata reads', async () => {
  for (const path of [profilePath, categoryPath, projectPath, profilePath + '/collaboration']) {
    for (const userAgent of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', null]) {
      const h = setup(); h.state.waitForAbort = true;
      const response = await h.request(path, { 'user-agent': userAgent, 'if-none-match': 'template-etag' });
      assert.equal(response.status, 200);
      assert.equal(new URL(h.assetRequests[0].url).pathname, '/share.html');
      assert.equal(h.assetRequests[0].headers.get('if-none-match'), null);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(await response.text(), shell);
      assert.equal(h.calls.length, 0, 'Browser first paint performs no worker-side Supabase read or signing');
    }
  }
});

test('normal app routes retain the app shell while shared HEAD requests stay bodyless and skip metadata', async () => {
  for (const path of ['/', '/discover', '/share', '/shared/example', '/p/' + id(1)]) {
    const h = setup(); const response = await h.request(path, { 'user-agent': 'Mozilla/5.0' });
    assert.equal(response.status, 200); assert.equal(new URL(h.assetRequests[0].url).pathname, '/');
    assert.equal(h.calls.length, 0); assert.equal(response.headers.get('cache-control'), 'no-cache');
  }
  const h = setup(); const response = await h.request(projectPath, { 'user-agent': 'Mozilla/5.0' }, 'HEAD');
  assert.equal(response.status, 200); assert.equal(await response.text(), '');
  assert.equal(new URL(h.assetRequests[0].url).pathname, '/share.html'); assert.equal(h.calls.length, 0);
});

test('project card binds every route ID and uses matching project cover, summary and article type', async () => {
  const h = setup();
  const html = await (await h.request(projectPath)).text();
  assert.match(html, /<title>Courtyard — Test creator \| Portalink<\/title>/);
  assert.equal(value(html, 'og:description'), 'A light-filled home');
  assert.equal(value(html, 'og:type'), 'article');
  assertImage(html);
  assert.equal(h.reads().length, 1);
  const query = h.reads()[0].url.searchParams;
  for (const [key, number] of [['profile_id', 1], ['category_id', 2], ['id', 3]]) assert.equal(query.get(key), 'eq.' + id(number));
  assert.equal(query.get('is_hidden'), 'eq.false');
  assert.equal(query.get('category.is_hidden'), 'eq.false');
  assert.equal(query.get('profile.is_private'), 'eq.false');
});

test('category card keeps collection title and binds its first project lookup to the collection', async () => {
  const h = setup();
  const html = await (await h.request(categoryPath)).text();
  assert.match(html, /Architecture — Test creator \| Portalink/);
  assert.equal(value(html, 'og:description'), 'Selected projects');
  assertImage(html);
  for (const call of h.reads().filter(call => call.url.pathname.endsWith('/projects'))) {
    assert.equal(call.url.searchParams.get('category_id'), 'eq.' + id(2));
    assert.equal(call.url.searchParams.get('profile_id'), 'eq.' + id(1));
  }
});

test('profile cover follows explicit negative wall ordering, otherwise newest published first', async () => {
  for (const arranged of [false, true]) {
    const h = setup();
    h.state.projects = [project({ id: id(8), position: arranged ? -2 : 5,
      published_at: '2026-08-01T12:00:00Z',
      attachments: [attachment({ project_id: id(8), storage_path: id(1) + '/' + id(5) + '/older.png' })] }), project()];
    const html = await (await h.request(profilePath)).text();
    const expected = arranged ? 'older.png' : 'cover.png';
    assert.ok(value(html, 'og:image').includes(expected));
    const lookups = h.reads().filter(call => call.url.pathname.endsWith('/projects'));
    assert.equal(lookups[0].url.searchParams.get('position'), 'lt.0');
    assert.match(lookups[0].url.searchParams.get('order'), /^position\.asc,published_at\.desc/);
    assert.equal(lookups.length, arranged ? 1 : 2);
    assert.ok(lookups.every(call => call.url.searchParams.get('limit') === '1'));
  }
});

test('profile without a headline uses the first project summary and descriptions stop at 160 Unicode characters', async () => {
  const h = setup();
  h.state.profiles[0].headline = '';
  h.state.projects[0].profile.headline = '';
  h.state.projects[0].summary = 'A' + '🏡'.repeat(180);
  const html = await (await h.request(profilePath)).text();
  const description = value(html, 'og:description');
  assert.equal([...description].length, 160);
  assert.equal(description, 'A' + '🏡'.repeat(159));
  assert.equal(value(html, 'twitter:description'), description);
  assert.equal(value(html, 'description'), description);
});

test('cover selection honors explicit cover then image preference without borrowing another project', async () => {
  const h = setup();
  h.state.projects[0].attachments = [
    attachment({ id: 'first', is_cover: false, storage_path: id(1) + '/' + id(5) + '/first.png' }),
    attachment({ id: 'selected', position: 5, storage_path: id(1) + '/' + id(5) + '/selected.png' }),
  ];
  assert.ok(value(await (await h.request(projectPath)).text(), 'og:image').includes('selected.png'));
  h.state.projects[0].attachments = [attachment({ project_id: id(9) })];
  assertGeneric(await (await h.request(projectPath)).text());
});

test('a fallback image at the final slot of the supported 105-attachment project is eligible', async () => {
  const h = setup();
  h.state.projects[0].attachments = [
    ...Array.from({ length: 104 }, (_, position) => attachment({ id: 'document-' + position,
      kind: 'document', mime_type: 'application/pdf', is_cover: false, position,
      storage_path: id(1) + '/' + id(5) + '/document-' + position + '.pdf', metadata: {} })),
    attachment({ id: 'final-image', is_cover: false, position: 104 }),
  ];
  assertImage(await (await h.request(projectPath)).text());
  assert.equal(h.reads()[0].url.searchParams.get('attachments.limit'), '105');
});

test('PDF cover uses the chosen rendered page and its actual dimensions, never the original PDF URL', async () => {
  const h = setup(), pagePath = 'posts/' + id(3) + '/pages/page_2.webp';
  h.state.projects[0].attachments = [attachment({ kind: 'document', mime_type: 'application/pdf',
    storage_path: id(1) + '/' + id(5) + '/report.pdf',
    metadata: { coverPageNumber: 2, widthPixels: 800, heightPixels: 1000, renderedPages: [
      { attachmentId: 'cover-attachment', withinDocumentIndex: 1, storagePath: 'posts/' + id(3) + '/pages/page_1.webp', width: 800, height: 1000 },
      { attachmentId: 'cover-attachment', withinDocumentIndex: 2, storagePath: pagePath, width: 1200, height: 700 },
    ] } })];
  const html = await (await h.request(projectPath)).text();
  assertImage(html, pagePath, 1200, 700);
  assert.doesNotMatch(value(html, 'og:image'), /report\.pdf/);
  assert.equal(h.signs().length, 1);
});

test('head rewrite escapes text, replaces duplicate metadata regardless of order/case, and preserves the entire body', async () => {
  const h = setup();
  h.state.profiles[0].name = 'A " & <script>alert(1)</script>';
  h.state.profiles[0].headline = "It's <b>work</b>";
  h.state.projects[0].profile = { ...h.state.profiles[0] };
  h.state.extraHead = '<TITLE>STALE-TITLE</TITLE><meta content="STALE-TITLE" property="og:title"><meta content="STALE-IMAGE" property="og:image:secure_url">'
    + '<META NAME="TWITTER:IMAGE:ALT" CONTENT="STALE-ALT"><meta property="og:image:width" content="999">'
    + '<meta name="twitter:image0" content="STALE-CARD"><link href="https://stale.example" rel="canonical">'
    + '<meta content="STALE-DESC" NAME="DESCRIPTION"><meta content="STALE-TYPE" PROPERTY="OG:TYPE">';
  h.state.extraBody = '<p>body-preserved</p><meta name="description" content="BODY-META"><script>const title = "<title>BODY-TITLE</title>";</script>';
  const html = await (await h.request(profilePath)).text();
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.includes('A &quot; &amp; &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(head.includes('It&#39;s &lt;b&gt;work&lt;/b&gt;'));
  assert.doesNotMatch(head, /<script>alert|STALE-|stale\.example|TWITTER:IMAGE:ALT/);
  assert.equal((head.match(/<title>/gi) ?? []).length, 1);
  assert.equal((head.match(/rel="canonical"/gi) ?? []).length, 1);
  assertImage(head);
  assert.equal(html.slice(html.indexOf('<body')), h.html().slice(h.html().indexOf('<body')));
});

test('private, missing and mismatched targets keep generic tags and never return a prior cached card', async () => {
  const h = setup();
  assertImage(await (await h.request(profilePath)).text());
  for (const rows of [[], [creator({ is_private: true, name: 'Secret' })], [creator({ id: id(9), name: 'Wrong creator' })]]) {
    h.state.profiles = rows;
    assertGeneric(await (await h.request(profilePath, { authorization: 'Bearer owner-session' })).text());
  }
  assert.equal(h.signs().length, 1);
});

test('hidden or mismatched project, creator and category relationships fail closed', async () => {
  for (const overrides of [
    { is_hidden: true }, { id: id(9) }, { profile_id: id(9) }, { category_id: id(9) },
    { profile: creator({ id: id(9) }) }, { profile: creator({ is_private: true }) },
    { category: { id: id(2), profile_id: id(1), is_hidden: true } },
    { category: { id: id(9), profile_id: id(1), is_hidden: false } },
    { category: { id: id(2), profile_id: id(9), is_hidden: false } },
    { profile: null }, { category: null },
  ]) {
    const h = setup();
    h.state.overrideRows = () => [project(overrides)];
    assertGeneric(await (await h.request(projectPath)).text());
    assert.equal(h.signs().length, 0);
  }
});

test('missing, unusable, multipart, video and dimensionless covers keep the generic preview', async () => {
  const cases = [
    [], [attachment({ metadata: {} })], [attachment({ metadata: { widthPixels: 0, heightPixels: 900 } })],
    [attachment({ metadata: { widthPixels: 1200.5, heightPixels: 900 } })],
    [attachment({ metadata: { widthPixels: 1600, heightPixels: 900, multipart: { parts: 2 } } })],
    [attachment({ kind: 'video', mime_type: 'video/mp4', storage_path: id(1) + '/' + id(5) + '/video.mp4' })],
    [attachment({ kind: 'document', mime_type: 'application/pdf', storage_path: id(1) + '/' + id(5) + '/report.pdf', metadata: {} })],
    [attachment({ kind: 'image', mime_type: 'image/svg+xml', storage_path: id(1) + '/' + id(5) + '/vector.svg' })],
  ];
  for (const attachments of cases) {
    const h = setup();
    h.state.projects[0].attachments = attachments;
    assertGeneric(await (await h.request(projectPath)).text());
    assert.equal(h.signs().length, 0);
  }
});

test('cover object paths reject external URLs, sibling profiles, traversal, query strings and control characters', async () => {
  for (const storage_path of [
    '', 'https://evil.test/cover.png', '/absolute/cover.png', id(9) + '/' + id(5) + '/cover.png',
    id(1) + '/../cover.png', id(1) + '/%2e%2e/cover.png', id(1) + '/' + id(5) + '/a%2fsecret.png',
    coverPath + '?token=secret', coverPath + '#fragment', coverPath + '\n', coverPath.replaceAll('/', '\\'),
    'posts/' + id(9) + '/pages/page_1.webp',
  ]) {
    const h = setup();
    h.state.projects[0].attachments = [attachment({ storage_path })];
    assertGeneric(await (await h.request(projectPath)).text());
    assert.equal(h.signs().length, 0, storage_path);
  }
});

test('rendered PDF pages must belong to the selected attachment and project and have dimensions', async () => {
  const valid = { attachmentId: 'cover-attachment', withinDocumentIndex: 1, storagePath: 'posts/' + id(3) + '/pages/page_1.webp', width: 900, height: 1200 };
  for (const invalid of [
    { attachmentId: 'other-attachment' }, { withinDocumentIndex: 2 },
    { storagePath: 'posts/' + id(9) + '/pages/page_1.webp' },
    { storagePath: 'posts/' + id(3) + '/pages/../../secret.webp' }, { width: 0 }, { height: undefined },
  ]) {
    const h = setup();
    h.state.projects[0].attachments = [attachment({ kind: 'document', mime_type: 'application/pdf',
      storage_path: id(1) + '/' + id(5) + '/report.pdf', metadata: { renderedPages: [{ ...valid, ...invalid }] } })];
    assertGeneric(await (await h.request(projectPath)).text());
    assert.equal(h.signs().length, 0);
  }
});

test('only same-origin signed image URLs for the exact requested storage object are accepted', async () => {
  const path = '/storage/v1/object/sign/project-media/' + coverPath;
  for (const signedURL of [
    'https://evil.test' + path + '?token=test', 'http://test.supabase.co' + path + '?token=test',
    'https://owner:secret@test.supabase.co' + path + '?token=test',
    'https://test.supabase.co' + path + '?token=test&download=secret',
    'https://test.supabase.co' + path + '?token=test#fragment',
    path + '?token=test&width=120', path + '?token=test&token=other',
    path + '?token=', path, path.replace('cover.png', 'other.png') + '?token=test',
    '//evil.test/cover.png?token=test', '/object/public/project-media/' + coverPath,
  ]) {
    const h = setup();
    h.state.signedURL = signedURL;
    assertGeneric(await (await h.request(projectPath)).text());
  }
  const h = setup();
  h.state.signedURL = config.supabaseUrl + path + '?token=test';
  assertImage(await (await h.request(projectPath)).text());
});

test('upstream and Storage failures keep generic HTML and do not poison the next successful preview', async () => {
  const h = setup();
  assertImage(await (await h.request(profilePath)).text());
  h.state.status = 503;
  assertGeneric(await (await h.request(profilePath)).text());
  h.state.status = 200;
  h.state.failure = new Error('private-upstream-detail');
  assertGeneric(await (await h.request(profilePath)).text());
  h.state.failure = null;
  h.state.now += 300_001;
  h.state.signStatus = 503;
  assertGeneric(await (await h.request(profilePath)).text());
  h.state.signStatus = 200;
  assertImage(await (await h.request(profilePath)).text());
});

test('a stalled upstream is aborted and falls back to the generic shell instead of serving a cached card', async () => {
  const h = setup();
  assertImage(await (await h.request(profilePath)).text());
  h.state.waitForAbort = true;
  // AbortSignal.timeout uses an unref'ed timer, so hold this test alive while
  // the actual production deadline fires without inventing a network service.
  const keepAlive = setTimeout(() => {}, 3_000);
  try {
    assertGeneric(await (await h.request(profilePath)).text());
    assert.equal(h.signs().length, 1);
  } finally { clearTimeout(keepAlive); }
});

test('five-minute cache reuses signing but rechecks public access every time and excludes query strings', async () => {
  const h = setup();
  const first = await (await h.request(profilePath + '?page=1')).text();
  const initialReads = h.reads().length;
  h.state.now += 299_000;
  assert.equal(await (await h.request(profilePath + '?page=2')).text(), first);
  assert.ok(h.reads().length > initialReads, 'Public permissions rechecked before cache hits');
  assert.equal(h.signs().length, 1);
  h.state.now += 1_001;
  assertImage(await (await h.request(profilePath)).text());
  assert.equal(h.signs().length, 2);
});

test('cache invalidates changed text, cover path, dimensions and SPA shell before expiry', async () => {
  const h = setup();
  await h.request(profilePath);
  h.state.profiles[0].name = 'Updated creator';
  h.state.projects[0].profile.name = 'Updated creator';
  assert.match(await (await h.request(profilePath)).text(), /Updated creator — Portfolio/);
  h.state.projects[0].attachments[0].storage_path = id(1) + '/' + id(5) + '/new.png';
  assertImage(await (await h.request(profilePath)).text(), id(1) + '/' + id(5) + '/new.png');
  h.state.projects[0].attachments[0].metadata = { widthPixels: 900, heightPixels: 1600 };
  assertImage(await (await h.request(profilePath)).text(), id(1) + '/' + id(5) + '/new.png', 900, 1600);
  h.state.extraHead = '<meta name="build-revision" content="second-shell">';
  assert.match(await (await h.request(profilePath)).text(), /second-shell/);
});

test('cache isolates path, canonical origin and publishable configuration', async () => {
  const h = setup();
  await h.direct(profilePath);
  await h.direct(projectPath);
  assert.equal(h.signs().length, 2);
  const otherOrigin = await (await h.direct(profilePath, { origin: 'https://preview.portalink.example' })).text();
  assert.equal(value(otherOrigin, 'og:url'), 'https://preview.portalink.example' + profilePath);
  assert.equal(h.signs().length, 3);
  await h.direct(profilePath, { previewConfig: { ...config, publishableKey: 'another-public-key' } });
  assert.equal(h.signs().length, 4);
});

test('crawler HTML, wildcard and absent Accept headers work; higher JSON preference or HTML exclusion skips metadata', async () => {
  for (const accept of ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', '*/*', null]) {
    const h = setup();
    const response = await h.request(profilePath, { accept, 'if-none-match': 'template-etag', 'if-modified-since': 'yesterday' });
    assert.equal(response.status, 200);
    assertImage(await response.text());
    assert.equal(new URL(h.assetRequests[0].url).pathname, '/share.html');
    assert.equal(h.assetRequests[0].headers.get('if-none-match'), null);
    assert.equal(h.assetRequests[0].headers.get('if-modified-since'), null);
  }
  for (const accept of ['application/json', 'application/json;q=1,text/html;q=0.8', 'text/html;q=0,*/*;q=1']) {
    const h = setup();
    await h.request(profilePath, { accept });
    assert.equal(h.calls.length, 0, accept);
  }
});

test('HTML preference parser respects specificity and q values', () => {
  const { prefersHtml } = setup().preview;
  assert.equal(typeof prefersHtml, 'function');
  for (const accept of ['', '*/*', 'text/*', 'text/html', 'TEXT/HTML;Q=1,application/json;q=0.2']) assert.equal(prefersHtml(accept), true, accept);
  for (const accept of ['application/json', 'text/html;q=0,*/*;q=1', 'text/html;q=0.2,application/json;q=0.9']) assert.equal(prefersHtml(accept), false, accept);
});

test('HEAD navigation stays bodyless, strips stale validators and makes no Supabase lookup', async () => {
  for (const accept of ['text/html', '*/*', null]) {
    const h = setup();
    const response = await h.request(projectPath, { accept, 'if-none-match': 'template-etag', 'if-modified-since': 'yesterday' }, 'HEAD');
    assert.equal(response.status, 200);
    assert.equal(response.body, null);
    assert.equal(await response.text(), '');
    assert.equal(new URL(h.assetRequests[0].url).pathname, '/share.html');
    assert.equal(h.assetRequests[0].method, 'HEAD');
    assert.equal(h.assetRequests[0].headers.get('if-none-match'), null);
    assert.equal(h.assetRequests[0].headers.get('if-modified-since'), null);
    for (const name of ['etag', 'last-modified', 'content-length', 'content-encoding']) assert.equal(response.headers.get(name), null);
    assert.equal(h.calls.length, 0);
  }
});

test('ordinary navigation keeps the normal shell and generic metadata without a lookup', async () => {
  const h = setup();
  for (const path of ['/', '/settings']) {
    const response = await h.request(path);
    assert.equal(response.status, 200);
    assertGeneric(await response.text());
    assert.equal(new URL(h.assetRequests.at(-1).url).pathname, '/');
  }
  assert.equal(h.calls.length, 0);
});

test('all invalid /share/ paths use the visitor shell without metadata lookup for preferred HTML', async () => {
  const paths = ['/share/', '/share/not-a-record', profilePath + '/c/invalid', profilePath + '/extra', profilePath + '/collaboration/extra'];
  for (const accept of ['text/html', '*/*', null]) {
    const h = setup();
    for (const path of paths) {
      for (const userAgent of ['Twitterbot/1.0', 'Mozilla/5.0', 'UnrecognizedPreviewBot/1.0']) {
        const response = await h.request(path, { accept, 'user-agent': userAgent,
          'if-none-match': 'template-etag', 'if-modified-since': 'yesterday' });
        assert.equal(response.status, 200);
        assertGeneric(await response.text());
        const assetRequest = h.assetRequests.at(-1);
        assert.equal(new URL(assetRequest.url).pathname, '/share.html');
        assert.equal(assetRequest.headers.get('if-none-match'), null);
        assert.equal(assetRequest.headers.get('if-modified-since'), null);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
      }
    }
    assert.equal(h.calls.length, 0, 'Invalid shared paths never enter metadata queries');
  }
});

test('invalid shared HEAD uses the visitor entry and non-HTML requests keep the original path', async () => {
  const path = '/share/not-a-record/extra';
  const h = setup();
  const response = await h.request(path, { 'if-none-match': 'template-etag' }, 'HEAD');
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(new URL(h.assetRequests.at(-1).url).pathname, '/share.html');
  assert.equal(h.assetRequests.at(-1).headers.get('if-none-match'), null);
  for (const accept of ['application/json', 'application/json;q=1,text/html;q=0.8', 'text/html;q=0,*/*;q=1']) {
    await h.request(path, { accept });
    assert.equal(new URL(h.assetRequests.at(-1).url).pathname, path);
  }
  assert.equal(h.calls.length, 0);
});

test('non-HTML and unsuccessful asset responses pass through unchanged', async () => {
  const h = setup();
  for (const response of [new Response('not HTML', { headers: { 'content-type': 'application/json' } }),
    new Response('Unavailable', { status: 503, headers: { 'content-type': 'text/html' } })]) {
    const result = await h.preview.withSharedPreview(response, new Request('https://portalink.example' + profilePath, { headers: { accept: 'text/html' } }), config);
    assert.equal(result, response);
  }
  assert.equal(h.calls.length, 0);
});
