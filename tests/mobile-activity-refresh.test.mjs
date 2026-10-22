import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const entry = (id = 'one', extra = {}) => ({ id, body: `Update ${id}`, timestamp: '2026-10-20T10:00:00Z', isUnread: true, kind: 'reply', ...extra });
const ids = (value) => Array.from(value.notifications, item => item.id);
const network = () => new Error('TypeError: Failed to fetch');

function setup(overrides = {}, options = { mobileContinuity: true }, auth = { user: { id: 'account' } }) {
  const subscriptions = [];
  const calls = [];
  const reads = [];
  const services = { notifications: {
    listNotifications: async () => [entry()],
    markRead: async id => { reads.push(id); },
    markAllRead: async () => { reads.push('all'); },
    subscribeToNotifications(onChange, onStatus) { const subscription = { onChange, onStatus, closed: false }; subscriptions.push(subscription); return () => { subscription.closed = true; }; },
    ...overrides,
  } };
  const list = services.notifications.listNotifications;
  services.notifications.listNotifications = (...args) => { calls.push(args); return list(...args); };
  const hook = hookHarness(new URL('../src/features/messages/useNotifications.ts', import.meta.url), 'useNotifications', services, auth, options);
  return { hook, services, subscriptions, calls, reads, auth };
}

test('cached mobile Refresh acknowledges immediately without putting retained rows in pending state', async () => {
  const next = deferred(); let count = 0;
  const { hook, calls } = setup({ listNotifications: () => ++count === 1 ? Promise.resolve([entry()]) : next.promise });
  await hook.flush(); const timestamp = hook.value.updatedAt;
  const first = hook.value.refresh();
  assert.equal(hook.value.isRefreshing, true);
  assert.equal(hook.value.status, 'success');
  assert.deepEqual(ids(hook.value), ['one']);
  assert.equal(hook.value.pendingIds.size, 0);
  assert.equal(hook.value.isMarkingAll, false);
  assert.equal(hook.value.updatedAt, timestamp);
  const duplicate = hook.value.refresh(); hook.value.retry(); hook.tick();
  assert.equal(first, duplicate); assert.equal(calls.length, 2);
  next.resolve([entry(), entry('two')]); assert.equal(await first, true); await hook.flush();
  assert.deepEqual(ids(hook.value), ['one', 'two']); assert.equal(hook.value.isRefreshing, false);
  hook.dispose();
});

test('initial mobile load coalesces with manual, background and Retry requests', async () => {
  const initial = deferred(); const { hook, calls, subscriptions } = setup({ listNotifications: () => initial.promise });
  await hook.flush();
  const first = hook.value.refresh(); const second = hook.value.refresh();
  subscriptions[0].onChange(); hook.runTimeouts(); hook.tick(); hook.value.retry();
  assert.equal(first, second); assert.equal(calls.length, 1);
  assert.equal(hook.value.isRefreshing, true); assert.equal(hook.value.status, 'loading');
  initial.resolve([entry()]); assert.equal(await first, true); await hook.flush();
  assert.equal(hook.value.status, 'success'); assert.equal(hook.value.isRefreshing, false);
  hook.dispose();
});

test('canonical transport failures keep cached updates and stay visible through Retry', async () => {
  for (const message of ['Failed to fetch', 'TypeError: Failed to fetch', 'fetch failed', 'TypeError: fetch failed', 'Load failed', 'TypeError: Load failed', 'NetworkError when attempting to fetch resource.', 'TypeError: NetworkError when attempting to fetch resource.']) {
    let result = [entry()]; const { hook } = setup({ listNotifications: async () => { if (result instanceof Error) throw result; return result; } });
    await hook.flush(); const timestamp = hook.value.updatedAt;
    result = new Error(message); assert.equal(await hook.value.refresh(), false); await hook.flush();
    assert.deepEqual(ids(hook.value), ['one'], message); assert.equal(hook.value.status, 'error', message);
    assert.match(hook.value.error, /Activity could not be loaded/); assert.equal(hook.value.updatedAt, timestamp);
    assert.equal(hook.value.isRefreshing, false);
    const retry = deferred(); result = retry.promise;
    const action = hook.value.refresh();
    assert.equal(hook.value.isRefreshing, true); assert.equal(hook.value.status, 'error');
    assert.match(hook.value.error, /Activity could not be loaded/); assert.deepEqual(ids(hook.value), ['one']);
    retry.resolve([entry('recovered')]); assert.equal(await action, true); await hook.flush();
    assert.equal(hook.value.status, 'success'); assert.equal(hook.value.error, null);
    assert.deepEqual(ids(hook.value), ['recovered']); hook.dispose();
  }
});

test('unknown, permission and auth errors evict mobile snapshots and reject retained acknowledgement callbacks', async () => {
  for (const failure of [new Error('permission denied for table notifications'), new Error('unauthenticated'), new Error('JWT expired'), new Error('offline'), new Error('Failed to fetch private records: permission denied'), { message: 'Failed to fetch' }, null]) {
    let fail = false;
    const { hook, reads } = setup({ listNotifications: async () => { if (fail) throw failure; return [entry()]; } });
    await hook.flush(); const read = hook.value.markRead; const all = hook.value.markAllRead;
    fail = true; assert.equal(await hook.value.refresh(), false); await hook.flush();
    assert.deepEqual(ids(hook.value), []); assert.equal(hook.value.updatedAt, null);
    assert.equal(hook.value.unreadCount, 0); assert.equal(hook.value.status, 'error');
    assert.equal(await read('one'), false); await all(); assert.deepEqual(reads, []);
    hook.dispose();
  }
});

test('cold mobile failures are retryable and empty successful snapshots remain stable on refresh', async () => {
  let count = 0; const waiting = deferred();
  const { hook } = setup({ listNotifications: () => ++count === 1 ? Promise.reject(network()) : count === 2 ? Promise.resolve([]) : waiting.promise });
  await hook.flush(); assert.equal(hook.value.status, 'error'); assert.deepEqual(ids(hook.value), []);
  assert.equal(await hook.value.refresh(), true); await hook.flush(); const timestamp = hook.value.updatedAt;
  const action = hook.value.refresh(); assert.equal(hook.value.status, 'success'); assert.equal(hook.value.isRefreshing, true);
  assert.equal(hook.value.updatedAt, timestamp); waiting.resolve([]); await action; hook.dispose();
});

test('mobile realtime and visible polling failures expose Retry without clearing cached rows', async () => {
  let fail = false; const { hook, subscriptions } = setup({ listNotifications: async () => { if (fail) throw network(); return [entry()]; } });
  await hook.flush(); fail = true; subscriptions[0].onChange(); hook.runTimeouts(); await hook.flush();
  assert.equal(hook.value.status, 'error'); assert.deepEqual(ids(hook.value), ['one']); assert.match(hook.value.error, /Activity could not/);
  fail = false; hook.tick(); await hook.flush(); assert.equal(hook.value.status, 'success'); assert.equal(hook.value.error, null);
  hook.document.visibilityState = 'hidden'; fail = true; subscriptions[0].onChange(); hook.runTimeouts(); await hook.flush();
  assert.equal(hook.value.status, 'success'); hook.dispose();
});

test('mobile refresh is fenced across owner changes, including an A to B to A return', async () => {
  const first = deferred(); const second = deferred(); const third = deferred(); let count = 0;
  const { hook, auth, calls } = setup({ listNotifications: () => [first, second, third][count++].promise });
  await hook.flush(); const retainedRefresh = hook.value.refresh;
  auth.user = { id: 'other' }; hook.rerender(); assert.deepEqual(ids(hook.value), []); await hook.flush();
  assert.equal(await retainedRefresh(), false); assert.equal(calls.length, 2);
  auth.user = { id: 'account' }; hook.rerender(); await hook.flush();
  first.resolve([entry('obsolete-first')]); second.resolve([entry('other')]); await hook.flush();
  assert.deepEqual(ids(hook.value), []); assert.equal(hook.value.isRefreshing, true);
  third.resolve([entry('current')]); await hook.flush(); assert.deepEqual(ids(hook.value), ['current']); hook.dispose();
});

test('service replacement ignores late private snapshots and retained refreshes', async () => {
  const old = deferred(); const fresh = deferred();
  const { hook, services } = setup({ listNotifications: () => old.promise });
  await hook.flush(); const refresh = hook.value.refresh;
  services.notifications = { ...services.notifications, listNotifications: () => fresh.promise };
  hook.rerender(); await hook.flush(); assert.equal(await refresh(), false);
  old.resolve([entry('obsolete')]); await hook.flush(); assert.deepEqual(ids(hook.value), []);
  fresh.resolve([entry('new-service')]); await hook.flush(); assert.deepEqual(ids(hook.value), ['new-service']); hook.dispose();
});

test('mobile to WEB and WEB to mobile switches fence old requests and load the current mode', async () => {
  const mobile = deferred(); const web = deferred(); const returned = deferred(); let count = 0;
  const { hook } = setup({ listNotifications: () => [mobile, web, returned][count++].promise });
  await hook.flush(); hook.options({ mobileContinuity: false }); await hook.flush();
  assert.equal(hook.value.isRefreshing, false); mobile.resolve([entry('old-mobile')]); await hook.flush(); assert.deepEqual(ids(hook.value), []);
  hook.options({ mobileContinuity: true }); await hook.flush(); web.resolve([entry('old-web')]); await hook.flush();
  assert.deepEqual(ids(hook.value), []); assert.equal(hook.value.isRefreshing, true);
  returned.resolve([entry('current-mobile')]); await hook.flush(); assert.deepEqual(ids(hook.value), ['current-mobile']); hook.dispose();
});

test('unmount and logout prevent late refreshes and retained writes from taking effect', async () => {
  const next = deferred(); let count = 0;
  const { hook, auth, reads, calls } = setup({ listNotifications: () => ++count === 1 ? Promise.resolve([entry()]) : next.promise });
  await hook.flush(); const refresh = hook.value.refresh; const read = hook.value.markRead;
  const action = refresh(); auth.user = null; hook.rerender(); await hook.flush();
  assert.deepEqual(ids(hook.value), []); assert.equal(hook.value.isRefreshing, false);
  assert.equal(await read('one'), false); next.resolve([entry('obsolete')]); assert.equal(await action, false);
  await hook.flush(); assert.deepEqual(ids(hook.value), []); hook.dispose();
  assert.equal(await refresh(), false); assert.deepEqual(reads, []); assert.equal(calls.length, 2);
});

test('row acknowledgements can finish during mobile refresh without stale unread reversion', async () => {
  const refresh = deferred(); const write = deferred(); let count = 0;
  const { hook, calls } = setup({ listNotifications: () => ++count === 1 ? Promise.resolve([entry()]) : refresh.promise, markRead: () => write.promise });
  await hook.flush(); const loading = hook.value.refresh(); const marking = hook.value.markRead('one');
  assert.equal(hook.value.isRefreshing, true); assert.ok(hook.value.pendingIds.has('one'));
  write.resolve(); assert.equal(await marking, true); await hook.flush();
  assert.equal(hook.value.notifications[0].isUnread, false); assert.equal(hook.value.isRefreshing, false);
  refresh.resolve([entry()]); assert.equal(await loading, false); await hook.flush();
  assert.equal(hook.value.notifications[0].isUnread, false); assert.equal(hook.value.pendingIds.size, 0); assert.equal(calls.length, 2); hook.dispose();
});

test('acknowledgement revision checks preserve a newly fetched unread notification revision', async () => {
  const refresh = deferred(); const write = deferred(); let count = 0;
  const revised = entry('one', { timestamp: '2026-10-20T11:00:00Z' });
  const { hook } = setup({ listNotifications: () => ++count === 1 ? Promise.resolve([entry()]) : refresh.promise, markRead: () => write.promise });
  await hook.flush(); const loading = hook.value.refresh(); const marking = hook.value.markRead('one');
  refresh.resolve([revised]); assert.equal(await loading, true); await hook.flush();
  write.resolve(); assert.equal(await marking, true); await hook.flush();
  assert.equal(hook.value.notifications[0].timestamp, revised.timestamp); assert.equal(hook.value.notifications[0].isUnread, true); hook.dispose();
});

test('mobile mutation flights block new refresh requests and duplicate acknowledgements', async () => {
  const write = deferred(); const { hook, calls, reads } = setup({ markRead: id => { reads.push(id); return write.promise; } });
  await hook.flush(); const first = hook.value.markRead('one');
  assert.equal(await hook.value.markRead('one'), false); assert.equal(await hook.value.refresh(), false);
  hook.value.retry(); hook.tick(); await hook.flush(); assert.equal(calls.length, 1); assert.deepEqual(reads, ['one']);
  write.resolve(); assert.equal(await first, true); await hook.flush(); assert.equal(hook.value.notifications[0].isUnread, false); hook.dispose();
});

test('mark-all confirms before changing rows and revalidates after its refresh guard releases', async () => {
  const write = deferred(); const refreshed = deferred(); let count = 0;
  const { hook, calls } = setup({ listNotifications: () => ++count === 1 ? Promise.resolve([entry()]) : refreshed.promise, markAllRead: () => write.promise });
  await hook.flush(); const action = hook.value.markAllRead();
  assert.equal(hook.value.notifications[0].isUnread, true); assert.equal(hook.value.isMarkingAll, true);
  assert.equal(await hook.value.refresh(), false); assert.equal(calls.length, 1);
  write.resolve(); await action; await hook.flush();
  assert.equal(hook.value.notifications[0].isUnread, false); assert.equal(hook.value.isMarkingAll, false);
  assert.equal(hook.value.isRefreshing, true); assert.equal(calls.length, 2);
  refreshed.resolve([entry('one', { isUnread: false }), entry('new')]); await hook.flush();
  assert.equal(hook.value.notifications[1].isUnread, true); assert.equal(hook.value.isRefreshing, false); hook.dispose();
});

test('mutation failures preserve unread rows and release mobile refresh guards', async () => {
  const { hook, calls } = setup({ markRead: async () => { throw network(); }, markAllRead: async () => { throw network(); } });
  await hook.flush(); assert.equal(await hook.value.markRead('one'), false); await hook.flush();
  assert.equal(hook.value.notifications[0].isUnread, true); assert.match(hook.value.mutationError, /could not be marked/);
  assert.equal(hook.value.pendingIds.size, 0); await hook.value.markAllRead(); await hook.flush();
  assert.equal(hook.value.isMarkingAll, false); assert.match(hook.value.mutationError, /Notifications could not/);
  assert.equal(await hook.value.refresh(), true); assert.equal(calls.length, 2); hook.dispose();
});

test('synchronous service failures release the mobile flight so Retry can recover', async () => {
  let fail = true; const { hook, calls } = setup({ listNotifications: () => { if (fail) throw network(); return Promise.resolve([entry()]); } });
  await hook.flush(); assert.equal(hook.value.isRefreshing, false); assert.equal(hook.value.status, 'error');
  fail = false; assert.equal(await hook.value.refresh(), true); await hook.flush(); assert.equal(calls.length, 2); assert.deepEqual(ids(hook.value), ['one']); hook.dispose();
});

test('ordinary WEB keeps foreground loading and row guards, silent background errors and legacy Retry', async () => {
  const response = deferred(); let result = [entry()];
  const { hook, subscriptions, reads } = setup({ listNotifications: async () => { if (result instanceof Error) throw result; return result; } }, {});
  await hook.flush(); result = network(); subscriptions[0].onChange(); hook.runTimeouts(); await hook.flush();
  assert.equal(hook.value.status, 'success'); assert.equal(hook.value.error, null); assert.deepEqual(ids(hook.value), ['one']);
  result = response.promise; assert.equal(hook.value.retry(), undefined);
  assert.equal(hook.value.status, 'loading'); assert.ok(hook.value.pendingIds.has('one')); assert.equal(hook.value.isMarkingAll, true);
  assert.equal(hook.value.isRefreshing, false); assert.equal(await hook.value.markRead('one'), false); assert.deepEqual(reads, []);
  response.reject(network()); await hook.flush(); assert.equal(hook.value.status, 'error'); assert.deepEqual(ids(hook.value), ['one']);
  assert.equal(hook.value.updatedAt, null); hook.dispose();
});
