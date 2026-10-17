import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const PATH = '/api/internal/account-deletion/d1';
const PURPOSE = 'portalink-account-deletion-d1:v1';
const SECRET = 'ab'.repeat(32);
const NOW = 1800000000000;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const OWN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNLISTED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const JOB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const manifest = () => ({ version: 1, jobId: JOB, accountId: A, ownedProjectIds: [OWN], issuedAt: NOW / 1000, expiresAt: NOW / 1000 + 300 });
const signature = (raw, secret = SECRET, purpose = PURPOSE) => createHmac('sha256', secret).update(`${purpose}\nPOST\n${PATH}\n${raw}`).digest('hex');

function load(file, imports = {}, globals = {}) {
  const exports = {};
  const source = read(file).replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://fixture.invalid'")
    .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY', "'fixture_not_a_credential'");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Response, Request, URL, URLSearchParams, Headers, TextEncoder, TextDecoder, crypto, Date, Uint8Array, Set,
    require(name) { assert.ok(name in imports, `Unexpected source dependency ${name}`); return imports[name]; },
    fetch() { throw Error('No external API calls permitted in deletion fixture'); },
    ...globals,
  });
  return exports;
}
const handler = load('src/server/accountDeletionD1.ts');

function setup(t, { fullSchema = true, fenceSchema = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of ['0000_media_interactions.sql', '0001_saved_media_read_index.sql', '0002_page_timings.sql', ...(fullSchema ? ['0003_project_read_signals.sql'] : [])]) sqlite.exec(read('drizzle/' + file));
  if (fullSchema && fenceSchema) sqlite.exec(read('docs/pending-d1/account-deletion-fences.sql'));
  let batches = 0, prepares = 0, ambiguous = false;
  const db = {
    prepare(sql) { prepares++; let values = []; return {
      bind(...args) { values = args; return this; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: result.changes } }; },
    }; },
    async batch(statements) {
      batches++;
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(statement => statement.run());
        sqlite.exec('COMMIT');
        return ambiguous ? undefined : results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const environment = { DB: db, ACCOUNT_DELETION_D1_ENABLED: 'true', ACCOUNT_DELETION_D1_FENCE_ENABLED: 'true', ACCOUNT_DELETION_D1_HMAC_SECRET: SECRET };
  const request = (value = manifest(), options = {}) => {
    const raw = options.raw ?? JSON.stringify(value);
    const headers = new Headers({ 'content-type': 'application/json', 'x-portalink-deletion-signature': options.signature ?? signature(raw), ...options.headers });
    return new Request('https://fixture.invalid' + (options.path ?? PATH), { method: options.method ?? 'POST', headers,
      ...(['GET', 'HEAD'].includes(options.method) ? {} : { body: raw }) });
  };
  const run = (value, options = {}, env = environment) => handler.handleAccountDeletionD1(request(value, options), env, { now: () => NOW });
  const insert = (sql, ...values) => sqlite.prepare(sql).run(...values);
  const rows = table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));
  const addEngagement = (account, project) => insert("INSERT INTO media_engagements(account_id,project_id,attachment_id,page_index,kind) VALUES(?,?,?,0,'save')", account, project, 'media');
  const addComment = (id, account, project) => insert('INSERT INTO media_comments(id,account_id,project_id,attachment_id,page_index,author_name,author_avatar_url,body) VALUES(?,?,?,?,0,?,?,?)', id, account, project, 'media', account === A ? 'Departing author' : 'Surviving author', 'https://fixture.invalid/avatar.png', 'Original ' + id);
  const addAction = (id, actor, owner, project, commentId = null) => insert('INSERT INTO project_page_actions(id,owner_account_id,actor_account_id,actor_profile_id,actor_name,project_id,attachment_id,page_index,kind,at,project_title,target_path,comment_id) VALUES(?,?,?,?,?,?,?,0,?,?,?,?,?)', id, owner, actor, actor === A ? 'profile-a' : 'profile-b', actor === A ? 'Departing author' : 'Surviving author', project, 'media', commentId ? 'comment' : 'save', '2026-10-16', 'Title', '/share/fixture', commentId);
  function seed() {
    addEngagement(A, OWN); addEngagement(A, OTHER); addEngagement(B, OWN); addEngagement(B, OTHER); addEngagement(B, UNLISTED);
    addComment('departing-survivor', A, OTHER); addComment('other-survivor', B, OTHER);
    addComment('departing-owned', A, OWN); addComment('other-owned', B, OWN); addComment('unlisted-other', B, UNLISTED);
    if (!fullSchema) return;
    addAction('departing-action', A, B, OTHER, 'departing-survivor');
    addAction('survivor-action', B, B, OTHER, 'other-survivor');
    addAction('owned-action', B, A, OWN, 'other-owned');
    addAction('unlisted-action', B, A, UNLISTED, 'unlisted-other');
    for (const owner of [A, B]) insert('INSERT INTO project_notification_reads VALUES(?,?,?,?)', owner, 'notice', 'revision', '2026-10-16');
    for (const [owner, project] of [[A, OWN], [A, OTHER], [B, OWN], [B, OTHER]]) insert('INSERT INTO project_weekly_notes VALUES(?,?,?,?,?,?)', owner, project, 'week', '2026-10-16', 2, 1);
    for (const project of [OWN, OTHER, UNLISTED]) insert('INSERT INTO project_reach_events VALUES(?,?,?,?,?,?,?,?)', 'reach-' + project, '2026-10-16T00:00:00Z', project, 'anonymous-tab-' + project, 0, 2, 'own-link', '400-639');
    insert('INSERT INTO page_timings VALUES(?,?,?,?,?,?,?,?,?,?)', 'timing', '2026-10-16', 'project', 10, 20, 30, 40, '400-639', '4g', 'abcdef0');
  }
  return { sqlite, environment, request, run, rows, seed, get batches() { return batches; }, get prepares() { return prepares; }, set ambiguous(value) { ambiguous = value; } };
}

test('disabled/missing configuration and browser or bearer credentials never reach D1', async t => {
  const s = setup(t);
  for (const environment of [{}, { DB: s.environment.DB }, { ...s.environment, ACCOUNT_DELETION_D1_ENABLED: 'false' }, { ...s.environment, ACCOUNT_DELETION_D1_FENCE_ENABLED: undefined }, { ...s.environment, ACCOUNT_DELETION_D1_HMAC_SECRET: undefined }, { ...s.environment, ACCOUNT_DELETION_D1_HMAC_SECRET: 'eyJ-service-role-jwt' }, { ...s.environment, DB: undefined }]) assert.equal((await s.run(undefined, {}, environment)).status, 503);
  assert.equal((await s.run(undefined, { headers: { origin: 'https://fixture.invalid' } })).status, 403);
  assert.equal((await s.run(undefined, { signature: 'invalid', headers: { authorization: 'Bearer service-role-placeholder' } })).status, 401);
  assert.equal((await s.run(undefined, { method: 'GET' })).status, 405);
  assert.equal(s.prepares, 0);
});

test('wrong purpose/key/signature and modified signed account/project scope cannot touch D1', async t => {
  const s = setup(t), raw = JSON.stringify(manifest());
  for (const sig of [signature(raw, 'cd'.repeat(32)), signature(raw, SECRET, 'different-purpose'), '00'.repeat(32)]) assert.equal((await s.run(undefined, { signature: sig })).status, 401);
  assert.equal((await s.run({ ...manifest(), accountId: B }, { signature: signature(raw) })).status, 401);
  assert.equal((await s.run({ ...manifest(), ownedProjectIds: [OTHER] }, { signature: signature(raw) })).status, 401);
  assert.equal(s.prepares, 0);
});

test('malformed manifests, unknown fields, UUID injection, duplicate IDs and invalid time windows fail closed', async t => {
  const s = setup(t);
  for (const value of [null, [], {}, { ...manifest(), version: 2 }, { ...manifest(), extra: true }, { ...manifest(), accountId: "' OR 1=1--" }, { ...manifest(), jobId: 'job' }, { ...manifest(), ownedProjectIds: [OWN, OWN] }, { ...manifest(), ownedProjectIds: ["') OR 1=1--"] }, { ...manifest(), ownedProjectIds: Array.from({ length: 1001 }, () => OWN) }, { ...manifest(), issuedAt: NOW / 1000 + 31 }, { ...manifest(), issuedAt: NOW / 1000 - 301, expiresAt: NOW / 1000 + 1 }, { ...manifest(), expiresAt: NOW / 1000 }, { ...manifest(), expiresAt: NOW / 1000 + 301 }, { ...manifest(), issuedAt: NOW / 1000 + .5 }]) assert.equal((await s.run(value)).status, 400);
  for (const options of [{ raw: '{' }, { headers: { 'content-type': 'text/plain' } }, { headers: { 'content-encoding': 'gzip' } }, { path: PATH + '?unbound=value' }]) assert.equal((await s.run(undefined, options)).status, 400);
  assert.equal(s.prepares, 0);
});

test('declared and streamed oversized bodies are bounded before SQL', async t => {
  const s = setup(t);
  assert.equal((await s.run(undefined, { headers: { 'content-length': String(64 * 1024 + 1) } })).status, 413);
  assert.equal((await s.run(undefined, { raw: JSON.stringify({ ...manifest(), padding: 'x'.repeat(64 * 1024) }) })).status, 413);
  assert.equal(s.prepares, 0);
});

test('one atomic cleanup removes exact account/owned-project data while preserving survivors and anonymous signals', async t => {
  const s = setup(t); s.seed();
  const survivorComment = s.rows('media_comments').find(row => row.id === 'other-survivor');
  const survivorReach = s.rows('project_reach_events').filter(row => row.project_id !== OWN);
  const survivorDaily = s.rows('project_reach_daily').filter(row => row.project_id !== OWN);
  const timings = s.rows('page_timings');
  const response = await s.run();
  assert.equal(response.status, 200);
  const expectedDigest = createHash('sha256').update(JSON.stringify({ version: 1, jobId: JOB, accountId: A, ownedProjectIds: [OWN] })).digest('hex');
  assert.deepEqual(await response.json(), { completed: true, jobId: JOB, manifestDigest: expectedDigest });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(s.batches, 1);
  assert.deepEqual(s.rows('media_engagements').map(row => [row.account_id, row.project_id]), [[B, OTHER], [B, UNLISTED]]);
  const remaining = s.rows('media_comments');
  assert.deepEqual(remaining.find(row => row.id === 'other-survivor'), survivorComment);
  assert.deepEqual(remaining.map(row => row.id), ['departing-survivor', 'other-survivor', 'unlisted-other']);
  const tombstone = remaining.find(row => row.id === 'departing-survivor');
  assert.equal(tombstone.account_id, 'deleted-account'); assert.equal(tombstone.author_name, 'Deleted account'); assert.equal(tombstone.author_avatar_url, null); assert.equal(tombstone.body, '[deleted]');
  assert.deepEqual(s.rows('project_page_actions').map(row => [row.id, row.owner_account_id, row.actor_account_id]), [['survivor-action', B, B], ['unlisted-action', 'deleted-account', B]]);
  assert.deepEqual(s.rows('project_notification_reads').map(row => row.owner_account_id), [B]);
  assert.deepEqual(s.rows('project_weekly_notes').map(row => [row.owner_account_id, row.project_id]), [[B, OTHER]]);
  assert.deepEqual(s.rows('project_reach_events'), survivorReach); assert.deepEqual(s.rows('project_reach_daily'), survivorDaily);
  assert.deepEqual(s.rows('page_timings'), timings);
});

test('empty owned-project lists still clean the account without deleting anyone else’s project interactions', async t => {
  const s = setup(t); s.seed();
  assert.equal((await s.run({ ...manifest(), ownedProjectIds: [] })).status, 200);
  assert.deepEqual(s.rows('media_engagements').map(row => [row.account_id, row.project_id]), [[B, OWN], [B, OTHER], [B, UNLISTED]]);
  assert.equal(s.rows('media_comments').length, 5);
  assert.equal(s.rows('media_comments').filter(row => row.account_id === A).length, 0);
  assert.equal(s.rows('project_reach_events').length, 3);
});

test('retries and same-window replay converge idempotently; expired replay cannot run SQL', async t => {
  const s = setup(t); s.seed();
  const tables = ['account_deletion_d1_fences', 'media_engagements', 'media_comments', 'project_page_actions', 'project_notification_reads', 'project_weekly_notes', 'project_reach_events', 'project_reach_daily'];
  const first = await s.run(); assert.equal(first.status, 200);
  const before = tables.map(table => s.rows(table));
  const retry = await s.run(); assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), await first.json());
  assert.deepEqual(tables.map(table => s.rows(table)), before);
  const calls = s.batches;
  const replay = await handler.handleAccountDeletionD1(s.request(), s.environment, { now: () => NOW + 301000 });
  assert.equal(replay.status, 400); assert.equal(s.batches, calls);
});

test('batch failure rolls back all prior statements and never emits a receipt', async t => {
  const s = setup(t); s.seed();
  const before = s.rows('media_engagements'), comments = s.rows('media_comments');
  s.sqlite.exec("CREATE TRIGGER injected_failure BEFORE DELETE ON project_weekly_notes BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
  const response = await s.run(); assert.equal(response.status, 503); assert.equal((await response.json()).completed, undefined);
  assert.deepEqual(s.rows('media_engagements'), before); assert.deepEqual(s.rows('media_comments'), comments);
  assert.equal(s.rows('account_deletion_d1_fences').length, 0, 'Failed cleanup cannot leave an uncheckpointed partial fence batch.');
});

test('missing current D1 tables and an ambiguous committed response fail closed, with safe later retry', async t => {
  const incomplete = setup(t, { fullSchema: false }); incomplete.seed();
  const before = incomplete.rows('media_engagements');
  assert.equal((await incomplete.run()).status, 503); assert.deepEqual(incomplete.rows('media_engagements'), before);
  const s = setup(t); s.seed(); s.ambiguous = true;
  assert.equal((await s.run()).status, 503);
  s.ambiguous = false; assert.equal((await s.run()).status, 200);
});

test('canonical receipt digest is independent of project order and transport timestamps', async () => {
  const a = await handler.accountDeletionD1ManifestDigest({ ...manifest(), ownedProjectIds: [OWN, OTHER] });
  const b = await handler.accountDeletionD1ManifestDigest({ ...manifest(), issuedAt: 1, expiresAt: 2, ownedProjectIds: [OTHER, OWN] });
  assert.equal(a, b);
});

test('a signed changed manifest or account cannot replace the durable job scope', async t => {
  const s = setup(t); s.seed(); assert.equal((await s.run()).status, 200);
  const fences = s.rows('account_deletion_d1_fences');
  const survivors = s.rows('media_engagements');
  for (const value of [{ ...manifest(), ownedProjectIds: [OWN, OTHER] }, { ...manifest(), accountId: B, ownedProjectIds: [] }, { ...manifest(), jobId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }]) assert.equal((await s.run(value)).status, 503);
  assert.deepEqual(s.rows('account_deletion_d1_fences'), fences);
  assert.deepEqual(s.rows('media_engagements'), survivors);
});

test('a request that passed preflight before cleanup is blocked by real SQLite on its later write', async t => {
  const s = setup(t); s.seed();
  await handler.assertAccountDeletionD1WriteAllowed(s.environment.DB, [A], [OTHER]);
  const late = s.sqlite.prepare("INSERT INTO media_engagements VALUES(?,?,?,0,'like',CURRENT_TIMESTAMP)");
  assert.equal((await s.run()).status, 200);
  assert.throws(() => late.run(A, OTHER, 'arrived-after-checkpoint'), /Account deletion write blocked/);
  await assert.rejects(handler.assertAccountDeletionD1WriteAllowed(s.environment.DB, [A], [OTHER]), error => error instanceof Response && error.status === 403);
  await assert.rejects(handler.assertAccountDeletionD1WriteAllowed(s.environment.DB, [B], [OWN]), error => error instanceof Response && error.status === 403);
  await handler.assertAccountDeletionD1WriteAllowed(s.environment.DB, [B], [OTHER]);
  assert.equal(s.rows('media_engagements').some(row => row.account_id === A), false);
});

test('permanent SQLite fences cover insert/update paths, actors, owners and owned projects after cleanup', async t => {
  const s = setup(t); s.seed(); assert.equal((await s.run()).status, 200);
  const attempts = [
    ["INSERT INTO media_engagements VALUES(?,?,?,0,'like',CURRENT_TIMESTAMP)", A, OTHER, 'new'],
    ["INSERT INTO media_engagements VALUES(?,?,?,0,'like',CURRENT_TIMESTAMP)", B, OWN, 'new'],
    ['UPDATE media_engagements SET account_id=? WHERE project_id=?', A, OTHER],
    ['UPDATE media_engagements SET project_id=? WHERE project_id=?', OWN, OTHER],
    ["INSERT INTO media_comments(id,account_id,project_id,attachment_id,page_index,author_name,body) VALUES('late',?,?,?,0,'Name','Body')", A, OTHER, 'media'],
    ['UPDATE media_comments SET account_id=? WHERE id=?', A, 'other-survivor'],
    ['UPDATE media_comments SET project_id=? WHERE id=?', OWN, 'other-survivor'],
    ['UPDATE project_page_actions SET actor_account_id=? WHERE id=?', A, 'survivor-action'],
    ['UPDATE project_page_actions SET owner_account_id=? WHERE id=?', A, 'survivor-action'],
    ['UPDATE project_page_actions SET project_id=? WHERE id=?', OWN, 'survivor-action'],
    ["INSERT INTO project_notification_reads VALUES(?,'late','rev','2026-10-16')", A],
    ['UPDATE project_notification_reads SET owner_account_id=?', A],
    ["INSERT INTO project_weekly_notes VALUES(?,?,'late','2026-10-16',1,0)", A, OTHER],
    ["INSERT INTO project_weekly_notes VALUES(?,?,'late','2026-10-16',1,0)", B, OWN],
    ['UPDATE project_weekly_notes SET owner_account_id=?', A],
    ['UPDATE project_weekly_notes SET project_id=?', OWN],
    ["INSERT INTO project_reach_events VALUES('late','2026-10-16',?,'late',0,2,'own-link','400-639')", OWN],
    ['UPDATE project_reach_events SET project_id=? WHERE project_id=?', OWN, OTHER],
    ["INSERT INTO project_reach_daily(project_id,day) VALUES(?,'2026-10-17')", OWN],
    ['UPDATE project_reach_daily SET project_id=? WHERE project_id=?', OWN, OTHER],
  ];
  for (const [sql, ...values] of attempts) assert.throws(() => s.sqlite.prepare(sql).run(...values), /Account deletion write blocked/, sql);
  for (const column of ['actor_account_id', 'owner_account_id', 'project_id']) {
    const original = s.rows('project_page_actions')[0];
    const action = { ...original, id: 'late-' + column, [column]: column === 'project_id' ? OWN : A };
    assert.throws(() => s.sqlite.prepare(`INSERT INTO project_page_actions(${Object.keys(action).join(',')}) VALUES(${Object.keys(action).map(() => '?').join(',')})`).run(...Object.values(action)), /Account deletion write blocked/);
  }
  assert.throws(() => s.sqlite.exec('DELETE FROM account_deletion_d1_fences'), /fence is permanent/);
  assert.throws(() => s.sqlite.prepare('UPDATE account_deletion_d1_fences SET job_id=?').run(B), /manifest changed/);
  s.sqlite.prepare("UPDATE media_comments SET body='Survivor can still edit' WHERE id='other-survivor'").run();
  assert.equal(s.rows('media_comments').find(row => row.id === 'other-survivor').body, 'Survivor can still edit');
});

test('explicit fence opt-in with missing schema fails closed without breaking disabled legacy operation', async t => {
  const s = setup(t, { fenceSchema: false }); s.seed();
  await assert.rejects(handler.assertAccountDeletionD1WriteAllowed(s.environment.DB, [A], [OTHER]), error => error instanceof Response && error.status === 503);
  assert.equal((await s.run()).status, 503);
  assert.equal(s.rows('media_engagements').some(row => row.account_id === A), true);
  s.sqlite.prepare("INSERT INTO media_engagements VALUES(?,?,?,0,'like',CURRENT_TIMESTAMP)").run(B, OTHER, 'legacy');
  assert.equal(s.rows('media_engagements').some(row => row.attachment_id === 'legacy'), true);
  const partial = setup(t); partial.seed(); partial.sqlite.exec('DROP TRIGGER deletion_fence_comment_insert');
  assert.equal((await partial.run()).status, 503, 'A missing trigger cannot be treated as a valid fence installation.');
  assert.equal(partial.rows('account_deletion_d1_fences').length, 0);
});

test('Sites routes the exact internal path to the disabled handler instead of falling through to assets', async t => {
  const s = setup(t);
  let assets = 0;
  const imports = Object.fromEntries(['./server/googleHandoff', './server/referenceResolver', './server/portfolioExport', './server/citation', './server/sharedPreview', './features/sharing/shareModel', './server/shareAddress', './server/publicMedia', './server/rum', './server/rumOwner', './server/projectReach'].map(name => [name, {}]));
  imports['./features/launch/adultLaunch'] = { OPTIONAL_COLLECTION_ENABLED: false };
  imports['./server/accountDeletionD1'] = handler;
  const worker = load('src/sites-worker.ts', imports).default;
  const response = await worker.fetch(s.request(), { ASSETS: { fetch() { assets++; throw Error('Unexpected asset request'); } } });
  assert.equal(response.status, 503); assert.equal(assets, 0); assert.equal(s.prepares, 0);
  const now = Math.floor(Date.now() / 1000);
  const enabled = await worker.fetch(s.request({ ...manifest(), issuedAt: now, expiresAt: now + 300 }), { ...s.environment, ASSETS: { fetch() { throw Error('Unexpected asset request'); } } });
  assert.equal(enabled.status, 200);
  assert.equal((await enabled.json()).completed, true);
});

function interactionWorker() {
  const imports = Object.fromEntries(['./server/googleHandoff', './server/referenceResolver', './server/portfolioExport', './server/sharedPreview', './features/sharing/shareModel', './server/shareAddress', './server/rum', './server/rumOwner', './server/projectReach'].map(name => [name, {}]));
  imports['./features/launch/adultLaunch'] = { OPTIONAL_COLLECTION_ENABLED: false };
  imports['./server/accountDeletionD1'] = handler;
  imports['./server/citation'] = { citationLicenseResponse: () => null };
  imports['./server/publicMedia'] = { isPublicMediaRoute: () => false };
  return load('src/sites-worker.ts', imports, { AbortSignal, btoa, atob, fetch: async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://fixture.invalid');
    if (url.pathname === '/auth/v1/user') return Response.json({ id: new Headers(options.headers).get('authorization').slice(7) });
    if (url.pathname.endsWith('/require_active_account_session')) return new Response(null, { status: 204 });
    assert.equal(url.pathname, '/rest/v1/projects');
    const project = JSON.parse('[' + url.searchParams.get('id').slice(4, -1) + ']')[0];
    return Response.json([{ id: project, category: { id: 'portal' }, attachments: [{ id: 'media', kind: 'image', position: 0 }] }]);
  } }).default;
}
const engagementRequest = (account, project) => new Request('https://fixture.invalid/api/media-interactions/engagement', {
  method: 'POST', headers: { authorization: 'Bearer ' + account, 'content-type': 'application/json' },
  body: JSON.stringify({ projectId: project, attachmentId: 'media', pageIndex: 0, kind: 'like', engaged: true }),
});

test('Sites rejects stale authenticated writes after the checkpoint while other accounts keep working', async t => {
  const s = setup(t); s.seed(); assert.equal((await s.run()).status, 200);
  const worker = interactionWorker();
  const environment = { ...s.environment, ASSETS: { fetch() { throw Error('Unexpected assets'); } } };
  assert.equal((await worker.fetch(engagementRequest(A, OTHER), environment)).status, 403);
  assert.equal((await worker.fetch(engagementRequest(B, OWN), environment)).status, 403);
  assert.equal((await worker.fetch(engagementRequest(B, OTHER), environment)).status, 200);
  assert.equal((await worker.fetch(engagementRequest(A, OTHER), { ...environment, ACCOUNT_DELETION_D1_FENCE_ENABLED: undefined })).status, 403, 'Installed triggers keep protecting data after route/preflight flags are disabled.');
  assert.equal(s.rows('media_engagements').some(row => row.account_id === A), false);
});

test('Sites mutation guards opt in explicitly and fail closed if their schema is missing', async t => {
  const s = setup(t, { fenceSchema: false });
  const worker = interactionWorker(), assets = { fetch() { throw Error('Unexpected assets'); } };
  assert.equal((await worker.fetch(engagementRequest(B, OTHER), { DB: s.environment.DB, ASSETS: assets })).status, 200);
  assert.equal((await worker.fetch(engagementRequest(A, OTHER), { ...s.environment, ASSETS: assets })).status, 503);
  assert.equal(s.rows('media_engagements').some(row => row.account_id === A), false);
});
