import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const home = id => ({ featured: null, projects: [{ project: { id } }], sphere: null, homeMode: 'balanced' });
function setup() {
  const requests = [];
  const discovery = { getHomeDiscovery(cursor) { const request = { ...deferred(), cursor }; requests.push(request); return request.promise; } };
  const auth = { user: null };
  const h = hookHarness(new URL('../src/features/discovery/useFeed.ts', import.meta.url), 'useFeed', { discovery }, auth, [], { revision: 0 });
  return { h, requests, auth };
}

test('reload fetches fresh content while retaining cards, and a failed refresh remains recoverable', async () => {
  const { h, requests } = setup(); await h.flush();
  assert.equal(h.value.isRefreshing, true);
  requests[0].resolve(home('original')); await h.flush();
  assert.equal(h.value.isRefreshing, false);
  h.value.retry(); await h.flush();
  assert.equal(requests.length, 2); assert.equal(h.value.isRefreshing, true);
  assert.equal(h.value.projects[0].project.id, 'original'); assert.equal(h.value.status, 'success');
  requests[1].resolve(home('updated')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'updated'); assert.equal(h.value.isRefreshing, false);
  h.value.retry(); await h.flush(); requests[2].reject(new Error('Offline')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'updated'); assert.equal(h.value.status, 'success');
  assert.equal(h.value.isRefreshing, false); assert.ok(h.value.refreshError);
  h.value.retry(); await h.flush(); assert.equal(h.value.refreshError, null);
  requests[3].resolve(home('recovered')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'recovered'); h.dispose();
});

test('late responses cannot replace the latest cached feed on the next refresh', async () => {
  const { h, requests } = setup(); await h.flush();
  h.value.retry(); await h.flush();
  requests[1].resolve(home('newer')); await h.flush();
  requests[0].resolve(home('older')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'newer');
  h.value.retry(); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'newer');
  requests[2].resolve(home('latest')); await h.flush(); h.dispose();
});

test('a first-load failure ends the busy state and can be retried', async () => {
  const { h, requests } = setup(); await h.flush();
  requests[0].reject(new Error('Offline')); await h.flush();
  assert.equal(h.value.status, 'error'); assert.equal(h.value.isRefreshing, false);
  h.value.retry(); await h.flush(); requests[1].resolve(home('loaded')); await h.flush();
  assert.equal(h.value.status, 'success'); assert.equal(h.value.isRefreshing, false); h.dispose();
});

test('Load more appends older work without replacing cards, deduplicates overlap and retries failures', async () => {
  const { h, requests } = setup(); await h.flush();
  const cursor = { publishedAt: '2026-09-01', id: 'first' };
  requests[0].resolve({ ...home('first'), nextCursor: cursor }); await h.flush();
  h.value.loadMore(); h.value.loadMore(); await h.flush();
  assert.equal(requests.length, 2); assert.deepEqual(requests[1].cursor, cursor);
  assert.equal(h.value.projects[0].project.id, 'first');
  requests[1].reject(new Error('offline')); await h.flush();
  assert.equal(h.value.isLoadingMore, false); assert.match(h.value.loadMoreError, /offline/);
  h.value.loadMore(); await h.flush();
  requests[2].resolve({ ...home('old'), projects: [...home('first').projects, ...home('old').projects], nextCursor: null }); await h.flush();
  assert.deepEqual(Array.from(h.value.projects, view => view.project.id), ['first', 'old']);
  assert.equal(h.value.nextCursor, null); assert.equal(h.value.loadMoreError, null); h.dispose();
});

test('refresh supersedes an in-flight older page and retains the loaded page count', async () => {
  const { h, requests } = setup(); await h.flush();
  const cursor = { publishedAt: '2026-09-01', id: 'first' };
  requests[0].resolve({ ...home('first'), nextCursor: cursor }); await h.flush();
  h.value.loadMore(); await h.flush();
  requests[1].resolve({ ...home('old'), nextCursor: { ...cursor, id: 'old' } }); await h.flush();
  h.value.loadMore(); await h.flush();
  h.value.retry(); await h.flush();
  requests[3].resolve({ ...home('fresh'), nextCursor: cursor }); await h.flush();
  assert.equal(requests.length, 5);
  requests[4].resolve({ ...home('fresh-old'), nextCursor: null }); await h.flush();
  requests[2].resolve(home('stale')); await h.flush();
  assert.deepEqual(Array.from(h.value.projects, view => view.project.id), ['fresh', 'fresh-old']); h.dispose();
});

test('an older page arriving after account change cannot replace the new account feed', async () => {
  const { h, requests, auth } = setup(); await h.flush();
  requests[0].resolve({ ...home('original'), nextCursor: { publishedAt: '2026-09-01', id: 'original' } }); await h.flush();
  h.value.loadMore(); await h.flush();
  auth.user = { id: 'different-account' }; h.rerender(); await h.flush();
  assert.equal(h.value.projects.length, 0, 'Previous-account cards are cleared while the new account loads');
  requests[2].resolve(home('new-account')); await h.flush();
  requests[1].resolve(home('old-account')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'new-account'); h.dispose();
});

test('feed cache bounds old revisions and expires inactive snapshots without suppressing refresh', () => {
  const text = readFileSync(new URL('../src/features/discovery/useFeed.ts', import.meta.url), 'utf8');
  const source = ts.createSourceFile('feed.ts', text, ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter(node => ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(item => ['feedCache', 'MAX_FEED_SNAPSHOTS', 'FEED_SNAPSHOT_RETENTION_MS'].includes(item.name.getText(source))));
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getFeedCacheEntry');
  const exports = {}; let now = 100;
  vm.runInNewContext(ts.transpileModule(`${declarations.map(node => node.getText(source)).join('\n')}\n${fn.getText(source)}\nexports.get=getFeedCacheEntry;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date: { now: () => now } });
  const service = {};
  const oldest = exports.get(service, 'account:0');
  for (let i = 1; i <= 12; i++) exports.get(service, `account:${i}`);
  assert.notEqual(exports.get(service, 'account:0'), oldest);
  const current = exports.get(service, 'account:12');
  current.snapshot = { projects: ['visible'] }; current.cachedAt = now;
  assert.equal(exports.get(service, 'account:12'), current);
  now += 15 * 60_000;
  assert.equal(exports.get(service, 'account:12').snapshot, undefined);
});
