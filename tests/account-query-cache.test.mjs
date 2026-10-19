import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const hookFile = new URL('../src/features/library/useAccountQuery.ts', import.meta.url);
function cacheModule(globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/library/accountQueryCache.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...globals });
  return exports;
}
function signedIn(id = 'one') {
  const user = { id };
  return { user, session: { user, isPrototype: false }, isAuthenticated: true };
}
function mount(cache, auth, query, options) {
  return hookHarness(hookFile, 'useAccountQuery', {}, auth, [query, options], undefined, { './accountQueryCache': cache });
}

test('snapshots expire after 30 seconds and are bounded to 32 keys across service scopes', () => {
  let now = 1_000;
  const cache = cacheModule({ Date: class extends Date { static now() { return now; } } });
  const session = {}, service = {}, otherService = {};
  const put = (scope, key, data) => cache.writeAccountQuerySnapshot(session, scope, key, { data, fetchedAt: now });
  put(service, 'first', 'earliest');
  for (let index = 0; index < 32; index++) put(index % 2 ? service : otherService, String(index), index);
  assert.equal(cache.readAccountQuerySnapshot(session, service, 'first'), undefined);
  assert.equal(cache.readAccountQuerySnapshot(session, otherService, '0').data, 0);
  put(service, 'latest', 'new');
  assert.equal(cache.readAccountQuerySnapshot(session, service, '1'), undefined);
  assert.equal(cache.readAccountQuerySnapshot(session, otherService, '0').data, 0);
  now += 29_999;
  assert.equal(cache.readAccountQuerySnapshot(session, service, 'latest').data, 'new');
  now += 1;
  assert.equal(cache.readAccountQuerySnapshot(session, service, 'latest'), undefined);
});

test('a real hook remount paints the snapshot immediately with a new callback and refreshes in background', async () => {
  const cache = cacheModule(), auth = signedIn(), service = {}, first = deferred(), next = deferred();
  const options = { key: 'reads:list:7d', scope: service };
  const original = mount(cache, auth, () => first.promise, options);
  await original.flush();
  assert.equal(original.value.loading, true);
  first.resolve({ opened: 8 }); await original.flush();
  const timestamp = original.value.fetchedAt;
  original.dispose();
  let reads = 0;
  const returned = mount(cache, auth, () => { reads++; return next.promise; }, options);
  assert.equal(returned.value.data.opened, 8);
  assert.equal(returned.value.loading, false);
  assert.equal(returned.value.fetchedAt, timestamp);
  assert.equal(reads, 1);
  await returned.flush();
  assert.equal(returned.value.refreshing, true);
  next.resolve({ opened: 12 }); await returned.flush();
  assert.equal(returned.value.data.opened, 12);
  assert.equal(returned.value.refreshing, false);
  returned.dispose();
});

test('refresh failure removes the private snapshot instead of retaining a stale permission result', async () => {
  const cache = cacheModule(), auth = signedIn(), service = {}, options = { key: 'reads:summary', scope: service };
  const first = mount(cache, auth, async () => 8, options);
  await first.flush(); first.dispose();
  const failure = deferred();
  const returned = mount(cache, auth, () => failure.promise, options);
  assert.equal(returned.value.data, 8);
  failure.reject(Error('Only the project owner can see these reads.'));
  await returned.flush();
  assert.equal(returned.value.data, undefined);
  assert.match(returned.value.error, /Only the project owner/);
  assert.equal(cache.readAccountQuerySnapshot(auth.session, service, options.key), undefined);
  returned.dispose();
  const retry = mount(cache, auth, () => new Promise(() => {}), options);
  assert.equal(retry.value.loading, true);
  assert.equal(retry.value.data, undefined);
  retry.dispose();
});

test('period, service replacement and reauthentication never reuse the other query snapshot', async () => {
  const cache = cacheModule(), auth = signedIn(), service = {}, options = { key: 'reads:list:7d', scope: service };
  const first = mount(cache, auth, async () => '7-day counts', options);
  await first.flush(); first.dispose();
  for (const [currentAuth, currentOptions] of [
    [auth, { ...options, key: 'reads:list:30d' }],
    [auth, { ...options, scope: {} }],
    [signedIn('one'), options],
    [signedIn('two'), options],
  ]) {
    const isolated = mount(cache, currentAuth, () => new Promise(() => {}), currentOptions);
    assert.equal(isolated.value.data, undefined);
    assert.equal(isolated.value.loading, true);
    isolated.dispose();
  }
});

test('late A -> B -> A results cannot populate a newly accepted session or overwrite current content', async () => {
  const cache = cacheModule(), auth = signedIn('one'), service = {}, oldSession = auth.session;
  const first = deferred(), second = deferred(), third = deferred();
  const query = () => auth.session === oldSession ? first.promise : auth.user.id === 'two' ? second.promise : third.promise;
  const options = { key: 'reads:list:7d', scope: service };
  const hook = mount(cache, auth, query, options);
  await hook.flush();
  Object.assign(auth, signedIn('two')); hook.rerender();
  assert.equal(hook.value.data, undefined);
  await hook.flush();
  Object.assign(auth, signedIn('one')); hook.rerender();
  assert.equal(hook.value.data, undefined);
  await hook.flush();
  first.resolve('old one'); second.resolve('private two'); await hook.flush();
  assert.equal(hook.value.data, undefined);
  assert.equal(cache.readAccountQuerySnapshot(oldSession, service, options.key), undefined);
  assert.equal(cache.readAccountQuerySnapshot(auth.session, service, options.key), undefined);
  third.resolve('fresh one'); await hook.flush();
  assert.equal(hook.value.data, 'fresh one');
  assert.equal(cache.readAccountQuerySnapshot(auth.session, service, options.key).data, 'fresh one');
  hook.dispose();
});

test('sign-out hides cached values immediately even while the old session remains present', async () => {
  const cache = cacheModule(), auth = signedIn(), service = {};
  const hook = mount(cache, auth, async () => 'private counts', { key: 'reads:list:7d', scope: service });
  await hook.flush();
  auth.isAuthenticated = false; hook.rerender();
  assert.equal(hook.value.data, undefined);
  assert.equal(hook.value.fetchedAt, null);
  assert.equal(hook.value.loading, false);
  await hook.flush(); hook.dispose();
});

test('explicit retry starts a new read while a confirmed snapshot stays visible; defaults still query on remount', async () => {
  const cache = cacheModule(), auth = signedIn(), service = {}, next = deferred();
  let reads = 0;
  const query = () => ++reads === 1 ? Promise.resolve(8) : next.promise;
  const options = { key: 'reads:list:7d', scope: service };
  const hook = mount(cache, auth, query, options);
  await hook.flush(); hook.value.retry(); await hook.flush();
  assert.equal(reads, 2);
  assert.equal(hook.value.loading, false);
  assert.equal(hook.value.refreshing, true);
  assert.equal(hook.value.data, 8);
  next.resolve(9); await hook.flush();
  assert.equal(hook.value.data, 9);
  hook.dispose();
  const defaultFirst = mount(cache, auth, async () => 'collection');
  await defaultFirst.flush(); defaultFirst.dispose();
  const defaultReturn = mount(cache, auth, () => new Promise(() => {}));
  assert.equal(defaultReturn.value.data, undefined);
  assert.equal(defaultReturn.value.loading, true);
  defaultReturn.dispose();
});
