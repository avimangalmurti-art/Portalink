import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };
const source = ts.createSourceFile('contentServices.ts', readFileSync(new URL('../src/services/supabase/contentServices.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'discoveryContext');

function fixture({ gate, metadataError, prepare = async () => [{ project: { id: 'one' } }], page = { rows: [{ project: { id: 'one' } }], nextCursor: { id: 'one', publishedAt: '2026-10-01' } }, pageError } = {}) {
  const pageCalls = [], preparations = [], fallback = [], filters = [];
  const records = {
    profiles: { id: 'owner', location: 'City' }, profile_follows: [{ target_profile_id: 'followed' }],
    project_engagement: [{ project_id: 'one', kind: 'like', created_at: '2026-10-01' }],
    discovery_signals: [], discovery_preferences: { home_mode: 'latest' },
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'account' } } }, error: null }) },
    from(table) {
      const query = {
        select() { return query; }, maybeSingle() { return query; },
        eq(key, value) { filters.push({ table, key, value }); return query; },
        then(resolve, reject) {
          const result = { data: records[table], error: table === 'profile_follows' ? metadataError ?? null : null };
          return Promise.resolve(table === 'profile_follows' ? gate : undefined).then(() => result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`${fn.getText(source)}\nexports.run=discoveryContext;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, requireSupabase: () => client,
    readFeedPage: async (scope, cursor, limit) => { pageCalls.push({ scope, cursor, limit }); if (pageError) throw pageError; return page; },
    feedViews: async (rows, covers) => { preparations.push({ rows, covers }); return prepare(); },
    allPublicProjectIds: async () => { fallback.push('public-ids'); return ['fallback']; },
    latestProjectIds: async () => { fallback.push('latest-ids'); return ['fallback']; },
    projectViewsForIds: async ids => { fallback.push(ids); return [{ project: { id: 'fallback' } }]; },
    buildUserContentSphere: input => input,
    isMissingDiscoveryTable: () => false, asHomeFeedMode: value => value,
  });
  return { ...exports, pageCalls, preparations, fallback, filters };
}

test('Home prepares its one public page while account ranking reads are pending and waits for both results', async () => {
  const metadata = deferred(), covers = deferred();
  const h = fixture({ gate: metadata.promise, prepare: () => covers.promise });
  let finished = false;
  const pending = h.run('home').then(result => { finished = true; return result; });
  await tick();
  assert.equal(h.pageCalls.length, 1);
  assert.equal(h.pageCalls[0].scope, 'global');
  assert.equal(h.pageCalls[0].limit, 30);
  assert.equal(h.preparations.length, 1);
  assert.equal(h.preparations[0].covers, true);
  assert.equal(finished, false);
  metadata.resolve(); await tick();
  assert.equal(finished, false);
  const views = [{ project: { id: 'one', cover: 'signed-cover.webp' } }];
  covers.resolve(views);
  const result = await pending;
  assert.equal(result.availableProjects, views);
  assert.equal(result.homeMode, 'latest');
  assert.equal(result.sphere.viewerProfile.id, 'owner');
  assert.deepEqual(Array.from(result.sphere.followedCreatorIds), ['followed']);
  assert.equal(result.nextCursor.id, 'one');
  assert.equal(h.preparations.length, 1);
  assert.ok(h.filters.filter(row => row.key === 'account_id').every(row => row.value === 'account'));
});

test('early cover errors are safely captured while existing account errors retain precedence', async () => {
  const metadata = deferred(), covers = deferred();
  const h = fixture({ gate: metadata.promise, metadataError: { message: 'Account read denied' }, prepare: () => covers.promise });
  const pending = h.run('home');
  await tick();
  covers.reject(new Error('Cover signing failed')); await tick();
  metadata.resolve();
  await assert.rejects(pending, /Account read denied/);
  assert.deepEqual(h.fallback, []);
});

test('a cover failure remains a truthful load failure without retrying or falling back', async () => {
  const h = fixture({ prepare: async () => { throw new Error('Cover signing failed'); } });
  await assert.rejects(h.run('home'), /Cover signing failed/);
  assert.equal(h.pageCalls.length, 1);
  assert.equal(h.preparations.length, 1);
  assert.deepEqual(h.fallback, []);
});

test('missing feed RPC retains the original public-ID fallback and does not prepare twice', async () => {
  const h = fixture({ page: null });
  const result = await h.run('home');
  assert.equal(result.availableProjects[0].project.id, 'fallback');
  assert.equal(h.pageCalls.length, 1);
  assert.equal(h.preparations.length, 0);
  assert.deepEqual(h.fallback, ['public-ids', ['fallback']]);
});

test('global discovery keeps its existing preparation timing and cover-only contract', async () => {
  const metadata = deferred();
  const h = fixture({ gate: metadata.promise });
  const pending = h.run('global');
  await tick();
  assert.equal(h.pageCalls[0].limit, 120);
  assert.equal(h.preparations.length, 0);
  metadata.resolve(); await pending;
  assert.equal(h.preparations.length, 1);
  assert.equal(h.preparations[0].covers, false);
});

test('feed RPC errors still fail immediately and never use the fallback', async () => {
  const h = fixture({ pageError: new Error('Feed access denied') });
  await assert.rejects(h.run('home'), /Feed access denied/);
  assert.equal(h.preparations.length, 0);
  assert.deepEqual(h.fallback, []);
});
