import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const base = '/api/media-interactions';
const target = (projectId = 'public', attachmentId = 'pdf', pageIndex = 0) => ({ projectId, attachmentId, pageIndex });
const document = (id = 'pdf', page_count = 3, position = 0) => ({ id, kind: 'document', page_count, position });
const image = (id, position) => ({ id, kind: 'image', page_count: null, position });

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(read('../drizzle/0000_media_interactions.sql'));
  sqlite.exec(read('../drizzle/0001_saved_media_read_index.sql'));
  const executions = [];
  const calls = [];
  const projects = new Map([
    ['public', { owner: 'alice', private: false, followers: new Set(), attachments: [document()] }],
    ['private', { owner: 'alice', private: true, followers: new Set(['carol']), attachments: [document('private-pdf')] }],
    ['hidden', { owner: 'alice', private: false, hidden: true, followers: new Set(), attachments: [document()] }],
    ['hidden-portal', { owner: 'alice', private: false, hiddenPortal: true, followers: new Set(), attachments: [document()] }],
  ]);
  let accessFailure;
  let authFailure;
  const binding = {
    prepare(sql) { let values = []; return {
      bind(...args) { values = args; return this; },
      async all() { executions.push({ kind: 'read', sql, values }); return { results: sqlite.prepare(sql).all(...values) }; },
      async first() { executions.push({ kind: 'read', sql, values }); return sqlite.prepare(sql).get(...values) ?? null; },
      async run() { executions.push({ kind: 'write', sql, values }); return sqlite.prepare(sql).run(...values); },
    }; },
  };
  const source = read('../src/sites-worker.ts')
    .replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://test.supabase.co'")
    .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', "'test-publishable-key'");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URL, URLSearchParams, Response, Request, Headers, AbortSignal, crypto, btoa, atob,
    require: id => {
      if(id==='./server/referenceResolver'||id==='./server/portfolioExport')return{};
      if (id === './server/citation') return { citationLicenseResponse: () => null, handleCitation: () => { throw new Error('Unexpected citation route in non-citation fixture'); } };
      if (id === './server/publicMedia') return { isPublicMediaRoute: () => false };
      if (id === './server/rum' || id === './server/rumOwner') return {};
      if (id === './server/projectReach') return { preparePageAction: async () => null, savePagePrivately: async (_db,statement) => statement.run() };
      if (id === './features/sharing/shareModel') return { handleFromPath:()=>null,isPublicSharePath:()=>false };
      if (id === './server/shareAddress') return {};
      assert.equal(id, './server/sharedPreview');
      return { isSharedPreviewPath: () => false, withSharedPreview: async response => response };
    },
    fetch: async (url, init) => {
      const parsed = new URL(url);
      const headers = new Headers(init.headers);
      calls.push({ url: parsed, headers });
      assert.equal(parsed.origin, 'https://test.supabase.co');
      assert.equal(headers.get('apikey'), 'test-publishable-key');
      const account = headers.get('authorization')?.replace('Bearer ', '') ?? null;
      if (parsed.pathname === '/auth/v1/user') {
        if (authFailure) return authFailure();
        return account === 'expired' ? Response.json({}, { status: 401 }) : Response.json({ id: account, user_metadata: { name: account } });
      }
      assert.equal(parsed.pathname, '/rest/v1/projects');
      assert.equal(init.method, undefined);
      assert.match(parsed.searchParams.get('select'), /^(?:profile_id,category_id,title,profile:profiles!projects_profile_id_fkey!inner\(account_id\),)?id,category:portfolio_categories!inner\(id\),attachments:project_attachments\(id,kind,position,page_count:metadata->pageCount\)$/);
      assert.equal(parsed.searchParams.get('attachments.order'), 'position.asc');
      assert.equal(parsed.searchParams.get('attachments.limit'), '106');
      if (accessFailure) return accessFailure();
      // This fake models the response of the pre-existing project, category and
      // attachment SELECT policies. It is not a substitute for live RLS QA.
      const ids = JSON.parse(`[${parsed.searchParams.get('id').slice(4, -1)}]`);
      assert.ok(ids.length <= 20);
      assert.equal(parsed.searchParams.get('limit'), String(ids.length));
      return Response.json(ids.flatMap(id => {
        const project = projects.get(id);
        if (!project || (account !== project.owner && (project.hidden || project.hiddenPortal || (project.private && !project.followers.has(account))))) return [];
        return [{ id, title: id, profile_id: `profile-${project.owner}`, category_id: `portal-${id}`, profile: {account_id: project.owner}, category: { id: `portal-${id}` }, attachments: [...project.attachments].sort((a, b) => a.position - b.position) }];
      }));
    },
  });
  const request = (path, { account = null, method = 'GET', body } = {}) => exports.default.fetch(new Request(`https://site.test${path}`, {
    method, headers: { 'content-type': 'application/json', ...(account ? { authorization: `Bearer ${account}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { DB: binding, ASSETS: { fetch: async () => new Response('shell') } });
  const readTarget = (value = target(), account = null) => request(`${base}?${new URLSearchParams(value)}`, { account });
  const batch = (targets, account = null) => request(`${base}/batch`, { account, method: 'POST', body: { targets } });
  const engage = (value = target(), account = 'alice', engaged = true) => request(`${base}/engagement`, { account, method: 'POST', body: { ...value, kind: 'save', engaged } });
  const comment = (value = target(), account = 'alice') => request(`${base}/comments`, { account, method: 'POST', body: { ...value, body: 'A real comment' } });
  const removeComment = (id, value = target(), account = 'alice') => request(`${base}/comments/${id}`, { account, method: 'DELETE', body: value });
  const seedSave = (account, value = target()) => sqlite.prepare('INSERT INTO media_engagements(account_id,project_id,attachment_id,page_index,kind) VALUES (?,?,?,?,?)')
    .run(account, value.projectId, value.attachmentId, value.pageIndex, 'save');
  const seedComment = (id, account, value = target()) => sqlite.prepare('INSERT INTO media_comments(id,account_id,project_id,attachment_id,page_index,author_name,body) VALUES (?,?,?,?,?,?,?)')
    .run(id, account, value.projectId, value.attachmentId, value.pageIndex, account, `Private body ${id}`);
  return { sqlite, projects, calls, executions, request, readTarget, batch, engage, comment, removeComment, seedSave, seedComment,
    failAccess(value) { accessFailure = value; }, failAuth(value) { authFailure = value; },
    clear() { calls.length = 0; executions.length = 0; }, close() { sqlite.close(); } };
}

test('anonymous public reads use anonymous RLS and expose no account-specific state', async () => {
  const s = setup();
  try {
    s.seedSave('alice'); s.seedComment('a', 'alice');
    const response = await s.readTarget();
    assert.equal(response.status, 200);
    const record = await response.json();
    assert.equal(record.counts.save, 1); assert.equal(record.engaged.save, false);
    assert.equal(record.comments[0].canDelete, false);
    assert.equal(s.calls.length, 1); assert.equal(s.calls[0].headers.get('authorization'), null);
    assert.equal(s.executions.length, 2); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await s.engage(target(), null)).status, 401);
    assert.equal((await s.comment(target(), null)).status, 401);
  } finally { s.close(); }
});

test('private, hidden-project and hidden-portal access follows the verified caller policies', async () => {
  const s = setup();
  try {
    for (const [projectId, attachmentId] of [['private', 'private-pdf'], ['hidden', 'pdf'], ['hidden-portal', 'pdf']]) {
      const value = target(projectId, attachmentId);
      s.seedComment(projectId, 'alice', value);
      assert.equal((await s.readTarget(value, 'alice')).status, 200);
      for (const account of [null, 'bob']) {
        s.clear();
        for (const action of [() => s.readTarget(value, account), () => s.batch([value], account)]) {
          const denied = await action();
          assert.equal(denied.status, 404); assert.deepEqual(await denied.json(), { error: 'This page is not available.' });
        }
        assert.equal(s.executions.length, 0);
      }
    }
    assert.equal((await s.readTarget(target('private', 'private-pdf'), 'carol')).status, 200);
    assert.ok(s.calls.some(call => call.url.pathname === '/rest/v1/projects' && call.headers.get('authorization') === 'Bearer carol'));
  } finally { s.close(); }
});

test('revocation is checked afresh before every read or write, including comment deletion', async () => {
  const s = setup();
  try {
    const value = target('private', 'private-pdf');
    assert.equal((await s.comment(value, 'carol')).status, 201);
    const id = s.sqlite.prepare('SELECT id FROM media_comments').get().id;
    s.projects.get('private').followers.delete('carol');
    s.clear();
    for (const action of [() => s.readTarget(value, 'carol'), () => s.engage(value, 'carol'), () => s.engage(value, 'carol', false), () => s.comment(value, 'carol'), () => s.removeComment(id, value, 'carol')]) {
      assert.equal((await action()).status, 404);
    }
    assert.equal(s.calls.filter(call => call.url.pathname === '/rest/v1/projects').length, 5);
    assert.equal(s.executions.length, 0);
    assert.equal(s.sqlite.prepare('SELECT count(*) AS n FROM media_comments').get().n, 1);
    assert.equal(s.sqlite.prepare('SELECT count(*) AS n FROM media_engagements').get().n, 0);
  } finally { s.close(); }
});

test('attachment identity, project membership, current image ordinal and known PDF bounds are enforced', async () => {
  const s = setup();
  try {
    s.projects.get('public').attachments = [image('second', 3), document(), image('first', 1), { id: 'audio', kind: 'audio', position: 2 }];
    for (const value of [target('public', 'first', 0), target('public', 'second', 1), target('public', 'pdf', 2)]) assert.equal((await s.readTarget(value)).status, 200);
    for (const value of [target('missing'), target('public', 'private-pdf'), target('public', 'removed'), target('public', 'audio'), target('public', 'first', 1), target('public', 'second', 0), target('public', 'pdf', 3)]) {
      s.clear();
      assert.equal((await s.readTarget(value)).status, 404);
      assert.equal((await s.engage(value)).status, 404);
      assert.equal((await s.comment(value)).status, 404);
      assert.equal(s.executions.length, 0);
    }
    s.projects.get('public').attachments = [];
    assert.equal((await s.readTarget(target())).status, 404);
  } finally { s.close(); }
});

test('original documents without a recorded count retain their bounded browser-reader interactions', async () => {
  const s = setup();
  try {
    for (const count of [null, 0, undefined]) {
      s.projects.get('public').attachments = [{ ...document('original'), page_count: count }];
      assert.equal((await s.readTarget(target('public', 'original', 10_000))).status, 200);
    }
    for (const pageIndex of [-1, 1.1, 10_001, null, false, '0']) {
      assert.equal((await s.batch([target('public', 'original', pageIndex)])).status, 400);
    }
    assert.equal((await s.request(`${base}?projectId=public&attachmentId=original`)).status, 400);
    assert.equal((await s.request(`${base}?projectId=public&attachmentId=original&pageIndex=`)).status, 400);
  } finally { s.close(); }
});

test('a batch authorizes once, deduplicates targets, and denies the whole read if any target is forbidden', async () => {
  const s = setup();
  try {
    s.projects.get('public').attachments = [document('pdf', 25)];
    s.seedSave('alice'); s.seedSave('bob');
    const values = Array.from({ length: 19 }, (_, i) => target('public', 'pdf', i));
    const response = await s.batch([...values, values[0]], 'alice');
    assert.equal(response.status, 200);
    const { items } = await response.json();
    assert.equal(items.length, 19); assert.equal(items[0].record.counts.save, 2); assert.equal(items[0].record.engaged.save, true);
    assert.equal(s.calls.length, 2); assert.equal(s.executions.length, 2);
    s.clear();
    assert.equal((await s.batch([target(), target('private', 'private-pdf')], 'bob')).status, 404);
    assert.equal(s.executions.length, 0);
    assert.equal((await s.batch(Array.from({ length: 21 }, () => target()), 'alice')).status, 400);
  } finally { s.close(); }
});

test('upstream errors and malformed access responses fail closed without activity reads or writes', async () => {
  const s = setup();
  try {
    const failures = [
      () => Response.json({ error: 'secret upstream body' }, { status: 500 }),
      () => Response.json({}, { status: 401 }),
      () => { throw new Error('secret upstream URL'); },
      () => new Response('not JSON'),
      () => Response.json({ rows: [] }),
      () => Response.json([{ id: 'public', category: null, attachments: [document()] }]),
      () => Response.json([{ id: 'public', category: { id: 'portal' }, attachments: [document('pdf', -1)] }]),
      () => Response.json([{ id: 'public', category: { id: 'portal' }, attachments: Array.from({ length: 106 }, (_, i) => image(String(i), i)) }]),
    ];
    for (const failure of failures) {
      s.failAccess(failure); s.clear();
      for (const action of [() => s.readTarget(), () => s.batch([target()]), () => s.engage(), () => s.comment(), () => s.removeComment('a')]) {
        const response = await action(); assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: 'Page access could not be verified. Please try again.' });
      }
      assert.equal(s.executions.length, 0);
    }
  } finally { s.close(); }
});

test('expired, unavailable and malformed account verification never reaches D1 or the target query', async () => {
  const s = setup();
  try {
    assert.equal((await s.readTarget(target(), 'expired')).status, 401);
    for (const failure of [() => { throw new Error('secret auth error'); }, () => Response.json({}, { status: 500 }), () => Response.json({}), () => new Response('not JSON')]) {
      s.failAuth(failure);
      assert.equal((await s.engage()).status, 503);
    }
    assert.equal(s.executions.length, 0);
    assert.ok(s.calls.every(call => call.url.pathname === '/auth/v1/user'));
  } finally { s.close(); }
});

test('saved lists and unsave remain private and usable after content access is revoked', async () => {
  const s = setup();
  try {
    const value = target('private', 'private-pdf');
    s.seedSave('carol', value); s.seedSave('alice', value);
    s.projects.get('private').followers.clear();
    s.failAccess(() => { throw new Error('Access service is unavailable'); });
    const saved = await s.request(`${base}/saved?account_id=alice`, { account: 'carol' });
    assert.equal(saved.status, 200); assert.equal((await saved.json()).items.length, 1);
    const response = await s.request(`${base}/saved`, { account: 'carol', method: 'DELETE', body: { ...value, account_id: 'alice' } });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { removed: true });
    assert.deepEqual(s.sqlite.prepare('SELECT account_id FROM media_engagements').all().map(row => row.account_id), ['alice']);
    assert.ok(s.calls.every(call => call.url.pathname === '/auth/v1/user'));
  } finally { s.close(); }
});

test('comment deletion is scoped to the verified author and authorized target, with no forbidden response leak', async () => {
  const s = setup();
  try {
    const hidden = target('private', 'private-pdf');
    s.seedComment('public-own', 'bob'); s.seedComment('public-other', 'alice'); s.seedComment('private-own', 'bob', hidden);
    assert.equal((await s.removeComment('public-other', target(), 'bob')).status, 200);
    assert.equal((await s.removeComment('private-own', target(), 'bob')).status, 200);
    assert.equal(s.sqlite.prepare('SELECT count(*) AS n FROM media_comments').get().n, 3);
    s.clear();
    const denied = await s.removeComment('private-own', hidden, 'bob');
    assert.equal(denied.status, 404); assert.deepEqual(await denied.json(), { error: 'This page is not available.' });
    assert.equal(s.executions.length, 0);
    assert.equal((await s.removeComment('public-own', target(), 'bob')).status, 200);
    assert.deepEqual(s.sqlite.prepare('SELECT id FROM media_comments ORDER BY id').all().map(row => row.id), ['private-own', 'public-other']);
  } finally { s.close(); }
});

test('attachment storage paths stay opaque, including long Unicode and PostgREST metacharacters', async () => {
  const s = setup();
  try {
    const id = `profile/draft/文${'x'.repeat(300)},"(file)\\.pdf`;
    s.projects.get('public').attachments = [document(id)];
    assert.equal((await s.batch([target('public', id)], 'alice')).status, 200);
    assert.ok(s.calls.filter(call => call.url.pathname === '/rest/v1/projects').every(call => !call.url.search.includes('file')));
  } finally { s.close(); }
});
