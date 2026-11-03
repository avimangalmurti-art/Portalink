import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const timestamp = '2026-11-03T10:00:00.000Z';
const uuid = index => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const target = (id = uuid(1), time = timestamp) => ({ id, timestamp: time });
const note = (id = 'one', extra = {}) => ({ id, timestamp, body: `Notification ${id}`, isUnread: true, kind: 'system', ...extra });
const plain = value => JSON.parse(JSON.stringify(value));

function notificationHook({ mobile = false, entries = [note(), note('two')], remove, list, markAll } = {}) {
  const auth = { user: { id: 'alice' } }, writes = [], reads = [], subscriptions = [];
  const service = {
    listNotifications() { reads.push(auth.user?.id); return list ? list(auth.user?.id) : Promise.resolve(entries); },
    deleteNotifications(targets) { writes.push(plain(targets)); return remove ? remove(targets) : Promise.resolve(targets); },
    markRead: async () => {}, markAllRead: markAll ?? (async () => {}),
    subscribeToNotifications(callback) { subscriptions.push(callback); return () => {}; },
  };
  const services = { notifications: service };
  const hook = hookHarness(new URL('../src/features/messages/useNotifications.ts', import.meta.url), 'useNotifications', services, auth, { mobileContinuity: mobile });
  return { hook, auth, service, services, writes, reads, subscriptions };
}

test('single and bulk notification deletion lock immediately and remove only service-confirmed revisions', async () => {
  for (const mobile of [false, true]) {
    const response = deferred(), h = notificationHook({ mobile, remove: () => response.promise });
    try {
      await h.hook.flush(); const remove = h.hook.value.deleteNotifications;
      const pending = remove(['one', 'one', 'missing', 'two']);
      assert.deepEqual(h.writes, [[target('one'), target('two')]]);
      assert.equal(h.hook.value.notifications.length, 2, 'The inbox keeps rows until deletion is confirmed.');
      assert.ok(h.hook.value.pendingIds.has('one')); assert.ok(h.hook.value.pendingIds.has('two'));
      assert.deepEqual(Array.from(await remove(['one'])), [], 'A retained callback cannot submit the same row twice.');
      assert.equal(await h.hook.value.markRead('one'), false); await h.hook.value.markAllRead();
      assert.equal(await h.hook.value.refresh(), false); h.hook.tick(); await h.hook.flush();
      assert.equal(h.reads.length, 1); assert.equal(h.writes.length, 1);
      response.resolve([target('one'), target('two', '2026-11-03T09:00:00.000Z'), target('not-requested')]);
      assert.deepEqual(Array.from(await pending), ['one']); await h.hook.flush();
      assert.deepEqual(Array.from(h.hook.value.notifications, item => item.id), ['two']);
      assert.equal(h.hook.value.unreadCount, 1); assert.equal(h.hook.value.pendingIds.size, 0);
      assert.match(h.hook.value.mutationError, /Some notifications/);
      h.service.deleteNotifications = async targets => targets;
      assert.deepEqual(Array.from(await h.hook.value.deleteNotifications(['two'])), ['two']); await h.hook.flush();
      assert.equal(h.hook.value.notifications.length, 0); assert.equal(h.hook.value.unreadCount, 0); assert.equal(h.hook.value.mutationError, null);
    } finally { h.hook.dispose(); }
  }
});

test('delete failures preserve every row, release locks and allow an explicit retry', async () => {
  for (const mobile of [false, true]) {
    const h = notificationHook({ mobile, remove() { throw new Error('Offline'); } });
    try {
      await h.hook.flush(); assert.deepEqual(Array.from(await h.hook.value.deleteNotifications(['one'])), []); await h.hook.flush();
      assert.equal(h.hook.value.notifications.length, 2); assert.equal(h.hook.value.pendingIds.size, 0); assert.match(h.hook.value.mutationError, /could not be deleted/);
      h.service.deleteNotifications = async targets => targets;
      assert.deepEqual(Array.from(await h.hook.value.deleteNotifications(['one'])), ['one']); await h.hook.flush();
      assert.deepEqual(Array.from(h.hook.value.notifications, item => item.id), ['two']);
    } finally { h.hook.dispose(); }
  }
});

test('reads begun before deletion cannot resurrect rows and fresh notifications remain eligible afterward', async () => {
  for (const mobile of [false, true]) {
    const refresh = deferred(); let calls = 0;
    const h = notificationHook({ mobile, list: () => ++calls === 1 ? Promise.resolve([note()]) : refresh.promise });
    try {
      await h.hook.flush();
      // WEB uses its existing background subscription path; MOBILE retains its refresh snapshot.
      if (mobile) void h.hook.value.refresh();
      else { h.subscriptions[0](); h.hook.runTimeouts(); }
      await h.hook.flush(); assert.equal(calls, 2);
      assert.deepEqual(Array.from(await h.hook.value.deleteNotifications(['one'])), ['one']); await h.hook.flush();
      refresh.resolve([note(), note('new')]); await h.hook.flush();
      assert.equal(h.hook.value.notifications.length, 0); assert.equal(h.hook.value.pendingIds.size, 0); assert.equal(h.hook.value.isRefreshing, false);
      h.service.listNotifications = async () => [note('new')];
      assert.equal(await h.hook.value.refresh(), true); await h.hook.flush();
      assert.deepEqual(Array.from(h.hook.value.notifications, item => item.id), ['new']);
    } finally { h.hook.dispose(); }
  }
});

test('bulk-read and foreground-loading guards prevent overlapping deletion', async () => {
  for (const mobile of [false, true]) {
    const marked = deferred(), h = notificationHook({ mobile, markAll: () => marked.promise });
    try {
      await h.hook.flush(); const reading = h.hook.value.markAllRead();
      assert.deepEqual(Array.from(await h.hook.value.deleteNotifications(['one'])), []); assert.equal(h.writes.length, 0);
      marked.resolve(); await reading; await h.hook.flush();
    } finally { h.hook.dispose(); }
  }
  const refreshed = deferred(); let calls = 0;
  const h = notificationHook({ list: () => ++calls === 1 ? Promise.resolve([note()]) : refreshed.promise });
  try {
    await h.hook.flush(); const old = h.hook.value.deleteNotifications; const reading = h.hook.value.refresh();
    assert.deepEqual(Array.from(await old(['one'])), []); assert.equal(h.writes.length, 0);
    refreshed.resolve([note()]); await reading; await h.hook.flush();
  } finally { h.hook.dispose(); }
});

test('account changes, service changes and unmounts fence retained deletion callbacks and late confirmations', async () => {
  for (const mobile of [false, true]) for (const change of ['account', 'service', 'unmount']) {
    const response = deferred(), h = notificationHook({ mobile, remove: () => response.promise });
    await h.hook.flush(); const old = h.hook.value.deleteNotifications, pending = old(['one']);
    if (change === 'account') h.auth.user = { id: 'bob' };
    if (change === 'service') h.services.notifications = { ...h.service, deleteNotifications() { assert.fail('An old callback cannot use a new service.'); } };
    if (change === 'unmount') h.hook.dispose();
    else { h.hook.rerender(); await h.hook.flush(); }
    assert.deepEqual(Array.from(await old(['two'])), []); assert.equal(h.writes.length, 1);
    response.resolve([target('one')]); assert.deepEqual(Array.from(await pending), []); await h.hook.flush();
    if (change !== 'unmount') {
      assert.equal(h.hook.value.notifications.length, 2); assert.equal(h.hook.value.pendingIds.size, 0); assert.equal(h.hook.value.mutationError, null);
      h.hook.dispose();
    }
  }
});

function supabaseNotifications() {
  let account = 'alice', gate, inFlight = 0, maximumInFlight = 0;
  const rows = [target(uuid(1)), target(uuid(2))].map(entry => ({ id: entry.id, created_at: entry.timestamp, account_id: 'alice' }));
  const queries = [], authReads = [];
  const client = {
    auth: { async getSession() { authReads.push(account); return { data: { session: account ? { user: { id: account } } : null }, error: null }; } },
    from(table) {
      const filters = [], query = { table, filters, deleted: false };
      queries.push(query);
      const builder = {
        delete() { query.deleted = true; return builder; }, eq(key, value) { filters.push([key, value]); return builder; },
        async select() {
          inFlight++; maximumInFlight = Math.max(maximumInFlight, inFlight);
          try {
            await gate?.promise;
            if (query.filters.some(([key, value]) => key === 'id' && value === uuid(3))) return { error: { message: 'Write failed' } };
            const matches = rows.filter(row => filters.every(([key, value]) => row[key] === value));
            matches.forEach(row => rows.splice(rows.indexOf(row), 1)); return { data: matches.map(({ id }) => ({ id })), error: null };
          } finally { inFlight--; }
        },
      };
      return builder;
    },
  };
  class ServiceError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const errors = sourceModule('src/types/engagement.ts');
  const { supabaseNotificationService } = sourceModule('src/services/supabase/communityServices.ts', {
    '../../features/engagement/capabilities': { likesCapability: false }, './client': { requireSupabase: () => client },
    '../../types/engagement': errors, '../../types/comments': { CommentServiceError: ServiceError }, '../../types/social': { SocialServiceError: ServiceError },
  });
  return { service: supabaseNotificationService, rows, queries, authReads, get maximumInFlight() { return maximumInFlight; }, account(value) { account = value; }, pause() { return gate = deferred(); } };
}

test('Supabase deletes only selected account-owned exact revisions and reports partial confirmations', async () => {
  const h = supabaseNotifications();
  h.rows.push({ id: uuid(4), created_at: timestamp, account_id: 'bob' });
  const removed = await h.service.deleteNotifications([target(uuid(1)), target(uuid(2), '2026-11-03T09:00:00.000Z'), target(uuid(3)), target(uuid(4))]);
  assert.deepEqual(plain(removed), [target(uuid(1))]);
  assert.equal(h.queries.length, 4);
  for (const query of h.queries) { assert.equal(query.table, 'notifications'); assert.equal(query.deleted, true); assert.ok(query.filters.some(([key, value]) => key === 'account_id' && value === 'alice')); }
  assert.deepEqual(h.rows.map(row => row.id), [uuid(2), uuid(4)]);
  assert.ok(h.queries[0].filters.some(([key, value]) => key === 'created_at' && value === timestamp));
});

test('Supabase rejects unauthenticated or invalid deletion and masks late results after account changes', async () => {
  const h = supabaseNotifications();
  await assert.rejects(h.service.deleteNotifications([target('not-a-uuid')]), /Invalid/); assert.equal(h.authReads.length, 0);
  h.account(null); await assert.rejects(h.service.deleteNotifications([target()]), /unauthenticated/); assert.equal(h.queries.length, 0);
  h.account('alice'); const gate = h.pause(), pending = h.service.deleteNotifications([target()]);
  for (let i = 0; i < 10 && !h.queries.length; i++) await Promise.resolve();
  assert.equal(h.queries.length, 1); h.account('bob'); gate.resolve();
  assert.deepEqual(plain(await pending), []);
});

test('Supabase bulk deletion limits parallel writes and stops new batches after an account change', async () => {
  for (const switchAccount of [false, true]) {
    const h = supabaseNotifications(), selected = Array.from({ length: 17 }, (_, index) => target(uuid(index + 10)));
    h.rows.push(...selected.map(entry => ({ id: entry.id, created_at: entry.timestamp, account_id: 'alice' })));
    const gate = h.pause(), pending = h.service.deleteNotifications(selected);
    for (let i = 0; i < 10 && !h.queries.length; i++) await Promise.resolve();
    assert.equal(h.queries.length, 8, 'The first batch is bounded even when every row was selected.');
    if (switchAccount) h.account('bob');
    gate.resolve(); const removed = await pending;
    assert.equal(h.maximumInFlight, 8);
    assert.equal(h.queries.length, switchAccount ? 8 : 17);
    assert.equal(removed.length, switchAccount ? 0 : 17);
  }
});

function combinedNotifications({ baseDelete = async entries => entries, d1Delete } = {}) {
  let account = 'alice'; const calls = [], base = [], listeners = [];
  const existing = { listNotifications: async () => [], markRead: async () => {}, markAllRead: async () => {},
    async deleteNotifications(entries) { base.push(plain(entries)); return baseDelete(entries); },
    subscribeToNotifications(callback) { listeners.push(callback); return () => {}; } };
  const api = sourceModule('src/services/supabase/readSignalService.ts', {
    './client': { requireSupabase: () => ({ auth: { getSession: async () => ({ data: { session: account ? { user: { id: account } } : null }, error: null }) } }) },
    '../../features/media-interactions/mediaInteractionRequest': { async mediaInteractionRequest(path, init, required, expected) {
      const body = JSON.parse(init.body); calls.push({ path, body, required, expected });
      return d1Delete ? d1Delete(body.notifications) : { dismissed: body.notifications };
    } },
  });
  return { service: api.withPageNotifications(existing), calls, base, account(value) { account = value; } };
}

test('combined deletion partitions stores, authenticates D1 and confirms only requested exact revisions', async () => {
  const page = target(`d1:page:${uuid(1)}`), week = target(`d1:week:2026-11-01:${uuid(2)}`);
  const h = combinedNotifications({ d1Delete: async () => ({ dismissed: [{ id: page.id, revision: page.timestamp }, { id: week.id, revision: '2026-11-03T11:00:00.000Z' }] }) });
  let changed = 0; const unsubscribe = h.service.subscribeToNotifications(() => changed++);
  const removed = await h.service.deleteNotifications([target(), page, week]);
  assert.deepEqual(plain(removed), [target(), page]); assert.deepEqual(h.base, [[target()]]);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].path, '/api/reach/dismiss'); assert.equal(h.calls[0].required, true); assert.equal(h.calls[0].expected, 'alice');
  assert.deepEqual(h.calls[0].body, { notifications: [{ id: page.id, revision: page.timestamp }, { id: week.id, revision: week.timestamp }] });
  assert.equal(changed, 1); unsubscribe(); await h.service.deleteNotifications([target()]); assert.equal(changed, 1);
});

test('combined deletion preserves partial success across backend failure and fences account changes', async () => {
  const page = target(`d1:page:${uuid(1)}`), response = deferred();
  const h = combinedNotifications({ d1Delete: () => response.promise });
  const pending = h.service.deleteNotifications([target(), page]);
  await Promise.resolve(); await Promise.resolve(); response.reject(new Error('Unavailable'));
  assert.deepEqual(plain(await pending), [target()]);
  const blocked = combinedNotifications({ baseDelete: async () => { throw new Error('Unavailable'); }, d1Delete: async () => { throw new Error('Unavailable'); } });
  await assert.rejects(blocked.service.deleteNotifications([target(), page]), /could not be deleted/);
  const late = deferred(), switched = combinedNotifications({ d1Delete: () => late.promise });
  const action = switched.service.deleteNotifications([page]); await Promise.resolve(); await Promise.resolve(); switched.account('bob');
  late.resolve({ dismissed: [{ id: page.id, revision: page.timestamp }] }); assert.deepEqual(plain(await action), []);
});

test('combined deletion bounds D1 batches and validates selections before calling either store', async () => {
  const h = combinedNotifications();
  await assert.rejects(h.service.deleteNotifications([target('bad')]), /Invalid/); assert.equal(h.calls.length, 0); assert.equal(h.base.length, 0);
  const selected = Array.from({ length: 101 }, (_, index) => target(`d1:page:${uuid(index + 1)}`));
  assert.equal((await h.service.deleteNotifications(selected)).length, 101);
  assert.deepEqual(h.calls.map(call => call.body.notifications.length), [100, 1]);
  assert.ok(h.calls.every(call => JSON.stringify(call.body).length < 16 * 1024));
});
