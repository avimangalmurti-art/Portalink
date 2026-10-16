import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
function load(path, imports = {}, globals = {}) {
  const source = read(path).replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://test.supabase.co'").replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', "'test-key'");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, TextDecoder, URL, URLSearchParams, Response, Request, Headers, AbortSignal, TextEncoder, btoa, atob, crypto, setTimeout, clearTimeout, ...globals, require: (id) => {
      if (id.endsWith('/textFormatting')) return sourceModule('src/components/text/textFormatting.ts');
      if (id.endsWith('/textFormatting')) return sourceModule('src/components/text/textFormatting.ts');
      if (id === './server/referenceResolver' || id === './server/portfolioExport') return {};
      if (id === './server/citation') return { citationLicenseResponse: () => null, handleCitation: () => { throw new Error('Unexpected citation route in non-citation fixture'); } };
      if (id === './features/sharing/shareModel') return load('../src/features/sharing/shareModel.ts');
      if (id === './server/shareAddress') return load('../src/server/shareAddress.ts', {'../features/sharing/shareModel':load('../src/features/sharing/shareModel.ts')}, globals);
      if (id === './server/projectReach') return load('../src/server/projectReach.ts', {'../features/reads/readSignal':load('../src/features/reads/readSignal.ts')}, globals);
      if (id === '../../presentation/mobile/MobileProfileContext') return { MobileProfileContext: ({children})=>children };
      if (id === './server/publicMedia') return { isPublicMediaRoute: () => false };
      if (id === './server/rum' || id === './server/rumOwner') return {};
      if (id === './server/sharedPreview') return { isSharedPreviewPath: () => false, withSharedPreview: async response => response };
      if (!(id in imports)) throw new Error(`Missing ${id}`);
      return imports[id];
    } });
  return exports;
}

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(read('../drizzle/0000_media_interactions.sql'));
  sqlite.exec(read('../drizzle/0001_saved_media_read_index.sql'));
  const statements = []; let verifications = 0; let accessChecks = 0;
  const binding = {
    prepare(sql) { let values = []; return {
      bind(...args) { values = args; return this; },
      async all() { statements.push(sql); return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { return sqlite.prepare(sql).run(...values); },
    }; },
    batch(items) { return Promise.all(items.map((item) => item.run())); },
  };
  const worker = load('../src/sites-worker.ts', {}, { fetch: async (url, init) => {
    if (new URL(url).pathname === '/rest/v1/rpc/require_active_account_session') return new Response(null, {status:204});
    if (new URL(url).pathname === '/rest/v1/projects') {
      accessChecks++;
      return Response.json([{ id: 'p', category: { id: 'portal' }, attachments: [{ id: 'doc', kind: 'document', position: 0, page_count: 30 }] }]);
    }
    verifications++;
    const id = init.headers.authorization.replace('Bearer ', '');
    return id === 'expired' ? new Response('{}', { status: 401 }) : Response.json({ id });
  } }).default;
  const request = (targets, account = 'alice') => worker.fetch(new Request('https://site.test/api/media-interactions/batch', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(account ? { authorization: `Bearer ${account}` } : {}) }, body: JSON.stringify({ targets }),
  }), { DB: binding });
  return { sqlite, statements, request, get verifications() { return verifications; }, get accessChecks() { return accessChecks; } };
}
const target = (pageIndex) => ({ projectId: 'p', attachmentId: 'doc', pageIndex });

test('visible-page batch verifies once, uses two reads, and isolates own activity', async () => {
  const s = setup();
  try {
    await s.request([target(0)]);
    const add = s.sqlite.prepare('INSERT INTO media_engagements(account_id,project_id,attachment_id,page_index,kind) VALUES (?,?,?,?,?)');
    add.run('alice', 'p', 'doc', 0, 'save'); add.run('bob', 'p', 'doc', 0, 'save'); add.run('bob', 'p', 'doc', 1, 'like');
    const comment = s.sqlite.prepare('INSERT INTO media_comments(id,account_id,project_id,attachment_id,page_index,author_name,body) VALUES (?,?,?,?,?,?,?)');
    comment.run('a', 'alice', 'p', 'doc', 0, 'Alice', 'Own'); comment.run('b', 'bob', 'p', 'doc', 1, 'Bob', 'Other');
    const before = s.verifications; const beforeAccess = s.accessChecks; s.statements.length = 0;
    const response = await s.request([target(0), target(1), target(2), target(0)]);
    const { items } = await response.json();
    assert.equal(s.verifications - before, 1); assert.equal(s.statements.length, 2);
    assert.equal(s.accessChecks - beforeAccess, 1);
    assert.equal(items.length, 3); assert.equal(items[0].record.counts.save, 2); assert.equal(items[0].record.engaged.save, true);
    assert.equal(items[0].record.comments[0].canDelete, true); assert.equal(items[1].record.comments[0].canDelete, false);
    assert.equal(items[1].record.engaged.like, false); assert.deepEqual(items[2].record.comments, []);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const guest = await (await s.request([target(0)], null)).json();
    assert.equal(guest.items[0].record.engaged.save, false); assert.equal(guest.items[0].record.comments[0].canDelete, false);
  } finally { s.sqlite.close(); }
});

test('page batches are bounded and expired sessions do not read activity', async () => {
  const s = setup();
  try {
    assert.equal((await s.request([])).status, 400);
    assert.equal((await s.request(Array.from({ length: 21 }, (_, i) => target(i)))).status, 400);
    assert.equal((await s.request([{ ...target(0), pageIndex: -1 }])).status, 400);
    assert.equal((await s.request([target(0)], 'expired')).status, 401);
    assert.equal(s.statements.length, 0);
  } finally { s.sqlite.close(); }
});

test('client batches ten pages, deduplicates pending targets and keeps accounts separate', async () => {
  const calls = [];
  const { readMediaInteraction } = load('../src/features/media-interactions/mediaInteractionBatch.ts', { './mediaInteractionRequest': {
    async mediaInteractionRequest(path, init, _required, account) {
      const { targets } = JSON.parse(init.body); calls.push({ path, targets, account });
      return { items: targets.map((item) => ({ target: item, record: { page: item.pageIndex, account } })) };
    },
  } });
  const first = readMediaInteraction(target(0), 'alice');
  assert.equal(first, readMediaInteraction(target(0), 'alice'));
  const result = await Promise.all([first, ...Array.from({ length: 21 }, (_, i) => readMediaInteraction(target(i + 1), 'alice')), readMediaInteraction(target(0), 'bob')]);
  assert.equal(calls.length, 4); assert.ok(calls.every((call) => call.targets.length <= 10));
  assert.equal(result[0].account, 'alice'); assert.equal(result.at(-1).account, 'bob');
  assert.deepEqual(result.slice(0, 22).map((record) => record.page), Array.from({ length: 22 }, (_, i) => i));
});

test('batched client read failures reach every queued consumer', async () => {
  const { readMediaInteraction } = load('../src/features/media-interactions/mediaInteractionBatch.ts', { './mediaInteractionRequest': {
    async mediaInteractionRequest() { throw new Error('Offline'); },
  } });
  const outcomes = await Promise.allSettled([readMediaInteraction(target(0), null), readMediaInteraction(target(1), null)]);
  assert.ok(outcomes.every((outcome) => outcome.status === 'rejected' && outcome.reason.message === 'Offline'));
});

test('Unicode attachment paths keep batched bodies below the request byte limit', async () => {
  const bodies = [];
  const { readMediaInteraction } = load('../src/features/media-interactions/mediaInteractionBatch.ts', { './mediaInteractionRequest': {
    async mediaInteractionRequest(_path, init) {
      bodies.push(init.body);
      return { items: JSON.parse(init.body).targets.map((item) => ({ target: item, record: { page: item.pageIndex } })) };
    },
  } });
  const records = await Promise.all(Array.from({ length: 20 }, (_, i) => readMediaInteraction({ ...target(i), attachmentId: '文'.repeat(1024) }, null)));
  assert.equal(records.length, 20);
  assert.ok(bodies.length > 2);
  assert.ok(bodies.every((body) => new TextEncoder().encode(body).byteLength <= 16_000));
});

test('hashed assets are immutable; HTML revalidates; missing assets never return the app shell', async () => {
  const worker = load('../src/sites-worker.ts').default;
  const paths = [];
  const environment = { ASSETS: { fetch: async (request) => {
    const path = new URL(request.url).pathname; paths.push(path);
    return new Response(path, { headers: { 'content-type': path.endsWith('.js') && !path.includes('missing') ? 'text/javascript' : 'text/html' } });
  } } };
  const get = (path) => worker.fetch(new Request(`https://site.test${path}`, { headers: { accept: 'text/html' } }), environment);
  assert.equal((await get('/assets/index-aB12_C34.js')).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await get('/p/person')).headers.get('cache-control'), 'no-cache');
  assert.equal(paths.at(-1), '/');
  assert.equal((await get('/assets/missing-12345678.js')).status, 404);
  assert.equal(paths.at(-1), '/assets/missing-12345678.js');
});
