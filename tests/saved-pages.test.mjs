import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter } from 'react-router-dom';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
function load(path, imports = {}, globals = {}) {
  const source = read(path).replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://test.supabase.co'").replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', "'test-key'");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, URL, URLSearchParams, Response, Request, Headers, AbortSignal, btoa, atob, ...globals, require: (id) => {
    if (id === './server/sharedPreview') return { isSharedPreviewPath: () => false, withSharedPreview: async response => response };
    if (!(id in imports)) throw new Error(`Missing test import ${id}`);
    return imports[id];
  } });
  return exports;
}

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(read('../drizzle/0000_media_interactions.sql'));
  sqlite.exec(read('../drizzle/0001_saved_media_read_index.sql'));
  return { sqlite, binding: {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async run() { return sqlite.prepare(sql).run(...values); },
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  } };
}

function workerFor(db) {
  const worker = load('../src/sites-worker.ts', {}, {
    fetch: async (url, init) => {
      if (new URL(url).pathname === '/rest/v1/projects') {
        return Response.json([{ id: 'project', category: { id: 'portal' }, attachments: [
          { id: 'original/file.pdf', kind: 'document', position: 0, page_count: 8 },
        ] }]);
      }
      assert.equal(url, 'https://test.supabase.co/auth/v1/user');
      const account = init.headers.authorization?.replace('Bearer ', '');
      return account === 'expired' ? new Response('{}', { status: 401 }) : Response.json({ id: account });
    },
  }).default;
  return (path, { account = 'alice', method = 'GET', body } = {}) => worker.fetch(new Request(`https://site.test${path}`, {
    method, headers: account ? { authorization: `Bearer ${account}`, 'content-type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), { DB: db.binding, ASSETS: { fetch: async () => new Response('shell') } });
}

const savedPath = '/api/media-interactions/saved';
async function readyDb() {
  const db = database(); const request = workerFor(db);
  assert.equal((await request(savedPath)).status, 200);
  return { db, request };
}
function add(db, account, page, kind = 'save', attachment = 'document') {
  db.sqlite.prepare('INSERT INTO media_engagements(account_id,project_id,attachment_id,page_index,kind,created_at) VALUES (?,?,?,?,?,?)')
    .run(account, 'project', attachment, page, kind, '2026-09-03 12:00:00');
}

test('saved pages reads existing bookmarks privately and paginates same-time saves without duplicates', async () => {
  const { db, request } = await readyDb();
  try {
    for (let page = 0; page < 27; page++) add(db, 'alice', page);
    add(db, 'bob', 99); add(db, 'alice', 70, 'like');
    const firstResponse = await request(`${savedPath}?account_id=bob`);
    assert.equal(firstResponse.headers.get('cache-control'), 'no-store');
    const first = await firstResponse.json();
    assert.equal(first.items.length, 24); assert.equal(first.items[0].pageIndex, 26);
    assert.ok(first.nextCursor);
    const second = await (await request(`${savedPath}?${new URLSearchParams({ cursor: first.nextCursor })}`)).json();
    const pages = [...first.items, ...second.items].map((item) => item.pageIndex);
    assert.equal(new Set(pages).size, 27); assert.equal(second.nextCursor, null);
    assert.ok(!pages.includes(99) && !pages.includes(70));
    assert.ok(first.items.every((item) => !('account_id' in item) && !('saved_row' in item)));
    const reopened = await (await workerFor(db)(savedPath)).json();
    assert.equal(reopened.items[0].pageIndex, 26);
    const plan = db.sqlite.prepare("EXPLAIN QUERY PLAN SELECT * FROM media_engagements WHERE account_id = ? AND kind = 'save'").all('alice');
    assert.match(plan.map((row) => row.detail).join(' '), /USING INDEX/);
  } finally { db.sqlite.close(); }
});

test('signed-out and expired sessions cannot list or remove page bookmarks', async () => {
  const { db, request } = await readyDb();
  try {
    for (const account of [null, 'expired']) {
      assert.equal((await request(savedPath, { account })).status, 401);
      assert.equal((await request(savedPath, { account, method: 'DELETE', body: { projectId: 'p', attachmentId: 'a', pageIndex: 0 } })).status, 401);
    }
    assert.equal((await request(`${savedPath}?cursor=invalid`)).status, 400);
  } finally { db.sqlite.close(); }
});

test('removing one page is idempotent and leaves other pages, accounts, likes and reposts untouched', async () => {
  const { db, request } = await readyDb();
  try {
    add(db, 'alice', 0); add(db, 'alice', 1); add(db, 'bob', 0); add(db, 'alice', 0, 'like'); add(db, 'alice', 0, 'repost');
    const body = { projectId: 'project', attachmentId: 'document', pageIndex: 0, account_id: 'bob' };
    assert.equal((await request(savedPath, { method: 'DELETE', body })).status, 200);
    assert.equal((await request(savedPath, { method: 'DELETE', body })).status, 200);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM media_engagements').get().n, 4);
    const alice = await (await request(savedPath)).json();
    const bob = await (await request(savedPath, { account: 'bob' })).json();
    assert.equal(alice.items[0].pageIndex, 1); assert.equal(bob.items.length, 1);
  } finally { db.sqlite.close(); }
});

test('the existing page bookmark action and Saved Pages share the same durable rows', async () => {
  const { db, request } = await readyDb();
  try {
    const body = { projectId: 'project', attachmentId: 'original/file.pdf', pageIndex: 5, kind: 'save', engaged: true };
    for (let n = 0; n < 2; n++) assert.equal((await request('/api/media-interactions/engagement', { method: 'POST', body })).status, 200);
    const result = await (await request(savedPath)).json();
    assert.equal(result.items.length, 1); assert.equal(result.items[0].pageIndex, 5);
    assert.equal(result.items[0].attachmentId, 'original/file.pdf');
    assert.equal((await request('/api/media-interactions/engagement', { method: 'POST', body: { ...body, engaged: false } })).status, 200);
    assert.equal((await (await request(savedPath)).json()).items.length, 0);
  } finally { db.sqlite.close(); }
});

const routes = load('../src/app/routes.ts', { '../components/navigation': { navigationDestinations: [] } });
const presentation = load('../src/features/library/savedPages.ts', { '../../app/routes': routes, '../media-interactions/mediaInteractionRequest': {} }).savedPagePresentation;
const view = {
  creator: { id: 'creator', name: 'Creator' },
  project: { id: 'project', categoryId: 'portal', title: 'Project', cover: 'never-use-the-cover', attachments: [
    { id: 'original/a b?#.pdf', kind: 'document', sourceUrl: 'original-pdf', metadata: { pageCount: 8, renderedPages: [{ withinDocumentIndex: 5, sourceUrl: 'actual-page-five', aspectRatio: 0.7 }] } },
    { id: 'image-two', kind: 'image', sourceUrl: 'second-image' },
    { id: 'image-one', kind: 'image', sourceUrl: 'first-image' },
  ] },
};
const target = { projectId: 'project', attachmentId: 'original/a b?#.pdf', pageIndex: 4 };

test('PDF card uses the saved page preview and an encoded exact-page link, not the project cover', () => {
  const item = presentation(target, view);
  assert.equal(item.source, 'actual-page-five'); assert.equal(item.pageNumber, 5);
  const url = new URL(item.href, 'https://site.test');
  assert.equal(url.pathname, '/p/creator/c/portal/project');
  assert.equal(url.searchParams.get('media'), target.attachmentId);
  assert.equal(url.searchParams.get('page'), '5');
  const unrendered = presentation({ ...target, pageIndex: 2 }, view);
  assert.equal(unrendered.source, 'original-pdf'); assert.equal(unrendered.kind, 'document'); assert.equal(unrendered.pageNumber, 3);
});

test('images resolve by attachment identity after reordering; inaccessible or removed pages never show a substitute', () => {
  const image = presentation({ ...target, attachmentId: 'image-one', pageIndex: 0 }, view);
  assert.equal(image.source, 'first-image'); assert.equal(image.pageNumber, 2);
  assert.equal(new URL(image.href, 'https://site.test').searchParams.get('media'), 'image-one');
  assert.equal(presentation(target, undefined), null);
  assert.equal(presentation({ ...target, attachmentId: 'missing' }, view), null);
  assert.equal(presentation({ ...target, pageIndex: 9 }, view), null);
  assert.equal(presentation({ ...target, projectId: 'wrong' }, view), null);
});

function savedPageModule(useSearchParams) {
  return load('../src/features/library/PersonalPages.tsx', {
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: ({ children }) => React.createElement(React.Fragment, null, children) },
    react: React, 'lucide-react': {}, 'react-router-dom': { useSearchParams },
    '../../app/routes': routes, '../../contexts/AuthContext': { useAuth: () => ({ isAuthenticated: true, user: { id: 'a' } }) },
    '../../contexts/ServicesContext': {}, '../../components/profile/ActivityCollectionPage': { ActivityCollectionPage: () => null }, '../../components/profile/CreatorAvatar': {},
    '../../components/ui/InterfaceIcon': { InterfaceIcon: () => null }, '../../components/ui/StateViews': {}, '../../components/messages/InboxPanel': {},
    '../../types/profile': {}, './useAccountQuery': {}, './SavedPagesCollection': { SavedPagesCollection: () => React.createElement('section', { 'aria-label': 'Saved pages' }) },
  });
}

test('Pages tab has its own collection and does not activate Projects or Creators', () => {
  const pages = savedPageModule(() => [new URLSearchParams('tab=pages'), () => {}]);
  const html = renderToStaticMarkup(React.createElement(pages.SavedPage, { onBack() {}, onOpenProject() {} }));
  assert.match(html, /aria-pressed="true"[^>]*>Pages<\/button>/);
  assert.match(html, /aria-label="Saved pages"/);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-pressed="false"/g) ?? []).length, 2);
});

function descendants(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(descendants)];
}

test('Saved tab handlers replace history, retain their URL selection, and leave in one Back step', async () => {
  for (const origin of ['/p/creator', '/', '/portalink/san-francisco']) {
    const router = createMemoryRouter([{ path: '*', element: null }], { initialEntries: [origin, '/saved'], initialIndex: 1 });
    const pages = savedPageModule(() => [new URLSearchParams(router.state.location.search), (next, options) => {
      assert.equal(options?.replace, true, 'every collection change must replace, not push');
      return router.navigate(`?${new URLSearchParams(next)}`, options);
    }]);
    const render = () => pages.SavedPage({ onBack: () => router.navigate(-1), onOpenProject() {} });
    try {
      // Include repeat selection and returning to Projects, which clears ?tab.
      for (const label of ['Pages', 'Creators', 'Projects', 'Projects', 'Pages']) {
        const tab = descendants(render()).find((item) => item.type === 'button' && item.props.children === label);
        assert.ok(tab, `${label} control exists`);
        await tab.props.onClick();
        assert.equal(router.state.location.pathname, '/saved');
        assert.equal(new URLSearchParams(router.state.location.search).get('tab'), label === 'Projects' ? null : label.toLowerCase());
        const selected = descendants(render()).find((item) => item.type === 'button' && item.props['aria-pressed']);
        assert.equal(selected.props.children, label, 'selection is restored from the URL on a fresh render');
      }
      const header = React.Children.toArray(render().props.children)[0];
      await header.props.onBack();
      assert.equal(router.state.location.pathname, origin, 'Back returns to the actual entry screen, not a forced profile');
      await router.navigate(1);
      assert.equal(router.state.location.pathname + router.state.location.search, '/saved?tab=pages', 'Forward restores the last selected collection');
    } finally { router.dispose(); }
  }
});
