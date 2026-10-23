import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const home = id => ({ featured: null, projects: [{ project: { id } }], sphere: null, homeMode: 'balanced' });
function setup({ globals = {} } = {}) {
  const requests = [], modeRequests = [];
  const discovery = {
    getHomeDiscovery(cursor) { const request = { ...deferred(), cursor, kind: 'home' }; requests.push(request); return request.promise; },
    listLocationProjects(locationId) { const request = { ...deferred(), locationId, kind: 'location' }; requests.push(request); return request.promise; },
    setHomeFeedMode(mode) { const request = { ...deferred(), mode }; modeRequests.push(request); return request.promise; },
  };
  const auth = { user: null };
  const profileData = { revision: 0, scope: {} }, services = { discovery };
  const h = hookHarness(new URL('../src/features/discovery/useFeed.ts', import.meta.url), 'useFeed', services, auth, [], profileData, {}, globals);
  return { h, requests, modeRequests, auth, profileData, services };
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
  const { h, requests, auth, profileData } = setup(); await h.flush();
  requests[0].resolve({ ...home('original'), nextCursor: { publishedAt: '2026-09-01', id: 'original' } }); await h.flush();
  h.value.loadMore(); await h.flush();
  auth.user = { id: 'different-account' }; profileData.scope = {}; h.rerender(); await h.flush();
  assert.equal(h.value.projects.length, 0, 'Previous-account cards are cleared while the new account loads');
  requests[2].resolve(home('new-account')); await h.flush();
  requests[1].resolve(home('old-account')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'new-account'); h.dispose();
});

test('completed and legitimately empty feeds remount immediately without starting a refresh', async () => {
  for (const response of [home('kept'), { ...home('empty'), projects: [] }]) {
    const { h, requests } = setup(); await h.flush();
    requests[0].resolve(response); await h.flush();
    const projects = h.value.projects, empty = h.value.isEmpty;
    h.remount();
    assert.equal(h.value.status, 'success'); assert.equal(h.value.projects, projects);
    assert.equal(h.value.isEmpty, empty); assert.equal(h.value.isRefreshing, false);
    await h.flush();
    assert.equal(requests.length, 1, 'Returning to a completed feed does not issue another placement query.');
    assert.equal(h.value.isRefreshing, false); assert.equal(h.value.refreshError, null);
    h.dispose();
  }
});

test('returning after more than fifteen minutes preserves the same completed feed until deliberate refresh', async () => {
  let now = Date.now();
  class ControlledDate extends Date { static now() { return now; } }
  const { h, requests } = setup({ globals: { Date: ControlledDate } }); await h.flush();
  requests[0].resolve(home('still-current')); await h.flush();
  h.dispose(); now += 20 * 60_000; h.remount(); await h.flush();
  assert.equal(requests.length, 1); assert.equal(h.value.projects[0].project.id, 'still-current');
  assert.equal(h.value.status, 'success'); assert.equal(h.value.isRefreshing, false);
  h.value.retry(); await h.flush();
  assert.equal(requests.length, 2); assert.equal(h.value.projects[0].project.id, 'still-current');
  assert.equal(h.value.isRefreshing, true);
  requests[1].resolve(home('explicitly-refreshed')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'explicitly-refreshed'); h.dispose();
});

test('a remount restores all loaded pages and the remaining cursor without repeating any page request', async () => {
  const { h, requests } = setup(); await h.flush();
  const firstCursor = { publishedAt: '2026-09-01', id: 'first' }, nextCursor = { publishedAt: '2026-08-01', id: 'older' };
  requests[0].resolve({ ...home('first'), nextCursor: firstCursor }); await h.flush();
  h.value.loadMore(); await h.flush(); requests[1].resolve({ ...home('older'), nextCursor }); await h.flush();
  const projects = h.value.projects;
  h.remount(); await h.flush();
  assert.equal(requests.length, 2); assert.equal(h.value.projects, projects);
  assert.deepEqual(Array.from(h.value.projects, view => view.project.id), ['first', 'older']);
  assert.deepEqual(h.value.nextCursor, nextCursor); assert.equal(h.value.isRefreshing, false);
  h.value.loadMore(); await h.flush();
  assert.equal(requests.length, 3); assert.deepEqual(requests[2].cursor, nextCursor);
  requests[2].resolve(home('oldest')); await h.flush();
  assert.deepEqual(Array.from(h.value.projects, view => view.project.id), ['first', 'older', 'oldest']); h.dispose();
});

test('returning during the initial feed request joins it instead of issuing another request', async () => {
  const { h, requests } = setup(); await h.flush();
  h.remount(); await h.flush(); h.remount(); await h.flush();
  assert.equal(requests.length, 1); assert.equal(h.value.status, 'loading'); assert.equal(h.value.isRefreshing, true);
  requests[0].resolve(home('joined-initial')); await h.flush();
  assert.equal(h.value.status, 'success'); assert.equal(h.value.projects[0].project.id, 'joined-initial');
  assert.equal(h.value.isRefreshing, false); h.dispose();
});

test('returning during an explicit refresh retains cards and joins the refresh already in progress', async () => {
  const { h, requests } = setup(); await h.flush();
  requests[0].resolve(home('before-refresh')); await h.flush();
  h.value.retry(); await h.flush();
  h.remount(); await h.flush();
  assert.equal(requests.length, 2); assert.equal(h.value.status, 'success'); assert.equal(h.value.isRefreshing, true);
  assert.equal(h.value.projects[0].project.id, 'before-refresh');
  requests[1].resolve(home('joined-refresh')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'joined-refresh'); assert.equal(h.value.isRefreshing, false);
  h.remount(); await h.flush(); assert.equal(requests.length, 2); h.dispose();
});

test('a completed initial response after navigation warms only its own scope for the next mount', async () => {
  const { h, requests } = setup(); await h.flush(); h.dispose();
  requests[0].resolve(home('completed-away')); await h.flush();
  h.remount(); await h.flush();
  assert.equal(requests.length, 1); assert.equal(h.value.projects[0].project.id, 'completed-away');
  assert.equal(h.value.status, 'success'); assert.equal(h.value.isRefreshing, false); h.dispose();
});

test('a disposed refresh response cannot replace the newer explicit refresh or its return snapshot', async () => {
  const { h, requests } = setup(); await h.flush(); requests[0].resolve(home('original')); await h.flush();
  h.value.retry(); await h.flush(); h.dispose(); h.remount(); await h.flush();
  assert.equal(requests.length, 2, 'The new mount joins the old refresh until the viewer explicitly replaces it.');
  h.value.retry(); await h.flush(); requests[2].resolve(home('latest')); await h.flush();
  requests[1].resolve(home('disposed-old-refresh')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'latest');
  h.remount(); await h.flush();
  assert.equal(requests.length, 3); assert.equal(h.value.projects[0].project.id, 'latest'); h.dispose();
});

test('account A to B to A uses fresh visibility scopes and confirmed mutation revisions trigger fresh reads', async () => {
  const { h, requests, auth, profileData } = setup();
  auth.user = { id: 'account-a' }; profileData.scope = {}; await h.flush();
  requests[0].resolve(home('account-a')); await h.flush();
  h.value.retry(); await h.flush();
  auth.user = { id: 'account-b' }; profileData.scope = {}; h.rerender(); await h.flush();
  assert.equal(requests.length, 3); assert.equal(h.value.projects.length, 0);
  requests[1].resolve(home('obsolete-account-a')); requests[2].resolve(home('account-b')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'account-b');
  auth.user = { id: 'account-a' }; profileData.scope = {}; h.remount(); await h.flush();
  assert.equal(requests.length, 4, 'The new A visibility scope cannot reuse the previous A session cache.');
  assert.equal(h.value.projects.length, 0); requests[3].resolve(home('current-account-a')); await h.flush();
  profileData.revision += 1; h.rerender(); await h.flush();
  assert.equal(requests.length, 5); assert.equal(h.value.projects.length, 0);
  requests[4].resolve(home('confirmed-mutation')); await h.flush();
  h.remount(); await h.flush(); assert.equal(requests.length, 5);
  assert.equal(h.value.projects[0].project.id, 'confirmed-mutation'); h.dispose();
});

test('a same-account scope replacement rejects an old page even when its revision and account key match', async () => {
  const { h, requests, profileData } = setup(); await h.flush();
  requests[0].resolve({ ...home('previous-scope'), nextCursor: { publishedAt: '2026-09-01', id: 'old' } }); await h.flush();
  h.value.loadMore(); await h.flush();
  profileData.scope = {}; h.rerender(); await h.flush();
  assert.equal(requests.length, 3); assert.equal(h.value.projects.length, 0);
  requests[2].resolve(home('current-scope')); await h.flush();
  requests[1].resolve(home('obsolete-page')); await h.flush();
  assert.deepEqual(Array.from(h.value.projects, view => view.project.id), ['current-scope']);
  h.remount(); await h.flush(); assert.equal(requests.length, 3); h.dispose();
});

test('same-key scope ABA rejects retained Home mode and page callbacks and late mode results without blocking current mode changes', async () => {
  for (const outcome of ['success', 'failure']) {
    const { h, requests, modeRequests, auth, profileData } = setup();
    auth.user = { id: 'account-a' }; profileData.scope = {}; await h.flush();
    requests[0].resolve({ ...home('old-a'), nextCursor: { publishedAt: '2026-09-01', id: 'old-a' } }); await h.flush();
    const old = h.value;
    old.setHomeMode('following'); await h.flush(); assert.equal(modeRequests.length, 1);
    auth.user = { id: 'account-b' }; profileData.scope = {}; h.rerender(); await h.flush();
    requests[1].resolve(home('account-b')); await h.flush();
    auth.user = { id: 'account-a' }; profileData.scope = {}; h.rerender(); await h.flush();
    requests[2].resolve(home('current-a')); await h.flush();
    old.setHomeMode('nearby'); old.loadMore(); await h.flush();
    assert.equal(modeRequests.length, 1, 'An old scope cannot start a preference mutation after the same account returns.');
    assert.equal(requests.length, 3, 'An old scope cannot issue a page query through its retained callback.');
    if (outcome === 'success') modeRequests[0].resolve({ ...home('obsolete-mode'), homeMode: 'following' });
    else modeRequests[0].reject(new Error('Obsolete preference failure'));
    await h.flush();
    assert.equal(h.value.projects[0].project.id, 'current-a'); assert.equal(h.value.homeMode, 'balanced');
    assert.equal(h.value.homeModeError, null); assert.equal(h.value.isSavingHomeMode, false);
    h.value.setHomeMode('following'); await h.flush(); assert.equal(modeRequests.length, 2);
    modeRequests[1].resolve({ ...home('current-mode'), homeMode: 'following' }); await h.flush();
    assert.equal(h.value.projects[0].project.id, 'current-mode'); assert.equal(h.value.homeMode, 'following');
    h.remount(); await h.flush();
    assert.equal(requests.length, 3); assert.equal(h.value.projects[0].project.id, 'current-mode'); h.dispose();
  }
});

test('late pre-mutation initial data cannot replace or restore the confirmed revision snapshot', async () => {
  const { h, requests, profileData } = setup(); await h.flush();
  profileData.revision += 1; h.rerender(); await h.flush();
  requests[1].resolve(home('after-mutation')); await h.flush();
  requests[0].resolve(home('before-mutation')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'after-mutation');
  h.remount(); await h.flush();
  assert.equal(requests.length, 2); assert.equal(h.value.projects[0].project.id, 'after-mutation'); h.dispose();
});

test('location feeds remain separate from Home and restore their own completed placement', async () => {
  const { h, requests } = setup(); await h.flush();
  requests[0].resolve(home('home')); await h.flush();
  h.options(['city-a']); await h.flush();
  assert.equal(requests[1].kind, 'location'); assert.equal(requests[1].locationId, 'city-a');
  assert.equal(h.value.projects.length, 0); requests[1].resolve(home('city-a').projects); await h.flush();
  h.remount(); await h.flush(); assert.equal(requests.length, 2); assert.equal(h.value.projects[0].project.id, 'city-a');
  h.options(['city-b']); await h.flush();
  assert.equal(requests[2].locationId, 'city-b'); requests[2].resolve(home('city-b').projects); await h.flush();
  h.remount([]); await h.flush();
  assert.equal(requests.length, 3); assert.equal(h.value.projects[0].project.id, 'home'); assert.equal(h.value.sphere, null); h.dispose();
});

test('replacing the discovery service cannot reuse another service cache under the same account and scope', async () => {
  const { h, requests, services } = setup(); await h.flush();
  requests[0].resolve(home('old-service')); await h.flush();
  const next = deferred(); let calls = 0;
  services.discovery = { getHomeDiscovery() { calls++; return next.promise; } };
  h.remount(); await h.flush();
  assert.equal(calls, 1); assert.equal(h.value.projects.length, 0);
  next.resolve(home('new-service')); await h.flush();
  h.remount(); await h.flush(); assert.equal(calls, 1); assert.equal(h.value.projects[0].project.id, 'new-service'); h.dispose();
});

test('feed cache bounds old revisions independently within each account scope and service', () => {
  const text = readFileSync(new URL('../src/features/discovery/useFeed.ts', import.meta.url), 'utf8');
  const source = ts.createSourceFile('feed.ts', text, ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter(node => ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(item => ['feedCache', 'MAX_FEED_SNAPSHOTS'].includes(item.name.getText(source))));
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getFeedCacheEntry');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`${declarations.map(node => node.getText(source)).join('\n')}\n${fn.getText(source)}\nexports.get=getFeedCacheEntry;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports });
  const service = {}, scope = {}, otherScope = {};
  const oldest = exports.get(service, scope, 'account:0');
  for (let i = 1; i <= 12; i++) exports.get(service, scope, `account:${i}`);
  assert.notEqual(exports.get(service, scope, 'account:0'), oldest);
  const current = exports.get(service, scope, 'account:12');
  current.snapshot = { projects: ['visible'] };
  assert.equal(exports.get(service, scope, 'account:12'), current);
  assert.notEqual(exports.get(service, otherScope, 'account:12'), current);
  assert.notEqual(exports.get({}, scope, 'account:12'), current);
});
