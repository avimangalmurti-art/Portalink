import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const a = { id: 'a', participant: { id: 'alice' }, lastMessageAt: null, isUnread: true };
const b = { id: 'b', participant: { id: 'bob' }, lastMessageAt: null, isUnread: false };
const networkMessage = 'Messages could not reach the network. Check your connection and try again.';
const message = (number, conversationId = 'a', senderProfileId = 'alice') => ({
  id: `message-${String(number).padStart(4, '0')}`, conversationId, senderProfileId, body: String(number),
  createdAt: new Date(Date.UTC(2026, 8, 1) + number * 1000).toISOString(),
});
const history = (from, through) => Array.from({ length: through - from + 1 }, (_, index) => message(from + index));
const ids = (messages) => Array.from(messages, (item) => item.id);
const cursor = (item) => ({ id: item.id, createdAt: item.createdAt });
function pageFrom(messages, { before, limit = 50 } = {}) {
  const candidates = messages.filter((item) => !before || item.createdAt < before.createdAt || (item.createdAt === before.createdAt && item.id < before.id));
  const page = candidates.slice(-limit);
  return { messages: page, before: candidates.length > limit ? cursor(page[0]) : null };
}

function setup(overrides = {}, options = {}, auth = { user: { id: 'account' }, viewerProfileId: 'viewer', loginSession: {} }) {
  const subscriptions = [];
  const reads = [];
  const routes = [];
  const calls = [];
  const messaging = {
    listConversations: async () => ({ conversations: [a, b], nextOffset: null }),
    getConversation: async (id) => id === 'a' ? a : b,
    listMessages: async () => ({ messages: [], before: null }),
    getPreferences: async () => ({ permission: 'requests' }),
    subscribeToConversationChanges: () => () => {},
    subscribeToTyping: () => () => {},
    subscribeToMessages(id, onMessage, onStatus, onRefresh) {
      const subscription = { id, onMessage, onStatus, onRefresh, closed: false };
      subscriptions.push(subscription);
      return () => { subscription.closed = true; };
    },
    markConversationRead: async (...args) => { reads.push(args); },
    ...overrides,
  };
  const listMessages = messaging.listMessages;
  messaging.listMessages = (...args) => { calls.push(args); return listMessages(...args); };
  const hook = hookHarness(new URL('../src/features/messages/useMessaging.ts', import.meta.url), 'useMessaging', { messaging }, auth,
    { mobileContinuity: true, onConversationChange: (...args) => routes.push(args), ...options });
  return { hook, messaging, subscriptions, reads, routes, calls, auth };
}

test('mobile cached reopen retains messages and older cursor only after the known transport failure', async () => {
  let fail = false;
  const cached = history(101, 103);
  const before = cursor(cached[0]);
  const { hook, reads } = setup({ listMessages: async () => {
    if (fail) throw new Error(networkMessage);
    return { messages: cached, before };
  } });
  await hook.flush();
  await hook.value.openConversation(a);
  hook.value.closeConversation();
  fail = true;
  await hook.value.openConversation(a);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), ids(cached));
  assert.equal(hook.value.hasOlderMessages, true);
  assert.equal(hook.value.threadLoadError, networkMessage);
  assert.equal(hook.value.error, null);
  assert.equal(hook.value.isRefreshingThread, false);
  assert.equal(hook.value.isLoadingThread, false);
  assert.equal(reads.length, 0);
  hook.value.dismissError();
  await hook.flush();
  assert.equal(hook.value.threadLoadError, null);
  hook.dispose();
});

test('cold mobile failure stays visible through a coalesced Retry and Retry never changes the route', async () => {
  const retry = deferred();
  let attempt = 0;
  const { hook, calls, routes } = setup({ listMessages: () => ++attempt === 1 ? Promise.reject(new Error(networkMessage)) : retry.promise });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const first = hook.value.retryThread();
  const second = hook.value.retryThread();
  assert.equal(first, second);
  await hook.flush();
  assert.equal(calls.length, 2);
  assert.equal(hook.value.isRefreshingThread, true);
  assert.equal(hook.value.isLoadingThread, true);
  assert.equal(hook.value.threadLoadError, networkMessage);
  retry.resolve({ messages: [message(1)], before: null });
  assert.equal(await first, true);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), [message(1).id]);
  assert.equal(hook.value.threadLoadError, null);
  assert.equal(hook.value.isRefreshingThread, false);
  assert.deepEqual(routes, [['a', false]]);
  hook.dispose();
});

test('permission, auth, unavailable and unknown failures clear displayed messages and evict the cached thread', async () => {
  for (const failure of [
    'You do not have access to this conversation.',
    'Sign in to use messages.',
    'Create your profile before using messages.',
    'This conversation is not available.',
    'This conversation could not be loaded.',
    'Failed to fetch',
  ]) {
    let result = { messages: [message(1)], before: cursor(message(1)) };
    const { hook } = setup({ listMessages: async () => {
      if (result instanceof Error) throw result;
      return result;
    } });
    await hook.flush();
    await hook.value.openConversation(a);
    result = new Error(failure);
    assert.equal(await hook.value.retryThread(), false);
    await hook.flush();
    assert.deepEqual(ids(hook.value.messages), [], failure);
    assert.equal(hook.value.hasOlderMessages, false, failure);
    assert.equal(hook.value.threadLoadError, failure);
    assert.equal(hook.value.threadUnavailable, true);
    assert.equal(hook.value.isRefreshingThread, false);
    hook.value.closeConversation();
    const next = deferred();
    result = next.promise;
    const reopening = hook.value.openConversation(a);
    await hook.flush();
    assert.deepEqual(ids(hook.value.messages), [], `${failure}: no stale cache on reopen`);
    assert.equal(hook.value.isLoadingThread, true);
    next.resolve({ messages: [], before: null });
    await reopening;
    hook.dispose();
  }
});

test('mobile reopen fetches through its loaded history so new messages cannot leave a pagination hole', async () => {
  let server = history(1, 200);
  const { hook, calls } = setup({ listMessages: async (_id, options) => pageFrom(server, options) });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  await hook.value.loadOlderMessages();
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), ids(history(51, 200)));
  hook.value.closeConversation();
  server = history(1, 250);
  await hook.value.openConversation(a);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), ids(history(51, 250)));
  assert.equal(calls.at(-1)[1].before.id, message(151).id);
  await hook.value.loadOlderMessages();
  await hook.flush();
  assert.equal(calls.at(-1)[1].before.id, message(51).id);
  assert.deepEqual(ids(hook.value.messages), ids(server));
  assert.equal(hook.value.hasOlderMessages, false);
  hook.dispose();
});

test('a network failure during refresh backfill keeps all loaded history and its cursor', async () => {
  let server = history(1, 200);
  let failOlder = false;
  const { hook } = setup({ listMessages: async (_id, options) => {
    if (failOlder && options.before) throw new Error(networkMessage);
    return pageFrom(server, options);
  } });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  await hook.value.loadOlderMessages();
  await hook.flush();
  server = history(1, 350);
  failOlder = true;
  assert.equal(await hook.value.retryThread(), false);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), ids(history(51, 200)));
  assert.equal(hook.value.hasOlderMessages, true);
  assert.equal(hook.value.threadLoadError, networkMessage);
  failOlder = false;
  await hook.value.loadOlderMessages();
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), ids(history(1, 200)));
  hook.dispose();
});

test('Retry preserves a send confirmed while the fetched server snapshot was pending', async () => {
  const refreshing = deferred();
  const sending = deferred();
  let attempt = 0;
  const { hook } = setup({
    listMessages: () => ++attempt === 1 ? Promise.resolve({ messages: [message(1)], before: null }) : refreshing.promise,
    sendMessage: () => sending.promise,
  });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const retry = hook.value.retryThread();
  await hook.flush();
  const send = hook.value.sendMessage('A local send');
  await hook.flush();
  assert.equal(hook.value.messages.at(-1).deliveryState, 'sending');
  sending.resolve(message(2, 'a', 'viewer'));
  assert.equal(await send, true);
  refreshing.resolve({ messages: [message(1)], before: null });
  assert.equal(await retry, true);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), [message(1).id, message(2).id]);
  assert.equal(hook.value.messages[1].deliveryState, 'sent');
  hook.dispose();
});

test('Retry covers older pagination that finishes while its first page is pending', async () => {
  const refreshing = deferred();
  let server = history(1, 200);
  let held = false;
  const { hook } = setup({ listMessages: async (_id, options) => {
    if (held && !options.before) return refreshing.promise;
    return pageFrom(server, options);
  } });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  held = true;
  const retry = hook.value.retryThread();
  await hook.flush();
  await hook.value.loadOlderMessages();
  await hook.flush();
  server = history(1, 350);
  refreshing.resolve(pageFrom(server, { limit: 100 }));
  assert.equal(await retry, true);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), ids(history(51, 350)));
  assert.equal(hook.value.hasOlderMessages, true);
  await hook.value.loadOlderMessages();
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), ids(server));
  assert.equal(hook.value.hasOlderMessages, false);
  hook.dispose();
});

test('late Retry success cannot replace a later A-to-B-to-A opening or dispatch through its old callback', async () => {
  const pending = deferred();
  let attempt = 0;
  const { hook, calls } = setup({ listMessages: (id) => {
    if (id === 'b') return Promise.resolve({ messages: [message(1, 'b', 'bob')], before: null });
    attempt += 1;
    return attempt === 2 ? pending.promise : Promise.resolve({ messages: [message(attempt)], before: null });
  } });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const oldRetry = hook.value.retryThread;
  const retry = oldRetry();
  await hook.flush();
  await hook.value.openConversation(b);
  await hook.value.openConversation(a);
  pending.resolve({ messages: [message(99)], before: null });
  assert.equal(await retry, false);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), [message(3).id]);
  const count = calls.length;
  assert.equal(await oldRetry(), false);
  assert.equal(calls.length, count);
  hook.dispose();
});

test('closing a pending Retry prevents late errors and does not discard the last confirmed cache', async () => {
  const pending = deferred();
  let attempt = 0;
  const { hook } = setup({ listMessages: () => ++attempt === 2 ? pending.promise : Promise.resolve({ messages: [message(1)], before: null }) });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const retry = hook.value.retryThread();
  await hook.flush();
  hook.value.closeConversation();
  pending.reject(new Error('You do not have access to this conversation.'));
  assert.equal(await retry, false);
  await hook.flush();
  assert.equal(hook.value.activeConversation, null);
  assert.equal(hook.value.threadLoadError, null);
  assert.equal(hook.value.isRefreshingThread, false);
  const reopening = hook.value.openConversation(a);
  assert.deepEqual(ids(hook.value.messages), [message(1).id]);
  await reopening;
  hook.dispose();
});

test('owner and login-session changes invalidate Retry, including an account A-to-B-to-A cycle', async () => {
  const pending = deferred();
  let attempt = 0;
  const { hook, auth, calls } = setup({ listMessages: () => ++attempt === 2 ? pending.promise : Promise.resolve({ messages: [message(1)], before: null }) });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const oldRetry = hook.value.retryThread;
  const retry = oldRetry();
  await hook.flush();
  auth.user = { id: 'other-account' };
  auth.viewerProfileId = 'other-profile';
  auth.loginSession = {};
  hook.rerender();
  assert.equal(hook.value.activeConversation, null);
  assert.deepEqual(ids(hook.value.messages), []);
  await hook.flush();
  auth.user = { id: 'account' };
  auth.viewerProfileId = 'viewer';
  auth.loginSession = {};
  hook.rerender();
  await hook.flush();
  pending.resolve({ messages: [message(99)], before: null });
  assert.equal(await retry, false);
  assert.equal(await oldRetry(), false);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), []);
  assert.equal(calls.length, 2);
  hook.dispose();
});

test('presentation changes invalidate mobile Retry and old callbacks without changing the cached owner', async () => {
  const pending = deferred();
  let attempt = 0;
  const { hook } = setup({ listMessages: () => ++attempt === 2 ? pending.promise : Promise.resolve({ messages: [message(attempt)], before: null }) });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const oldRetry = hook.value.retryThread;
  const retry = oldRetry();
  await hook.flush();
  hook.options({ mobileContinuity: false });
  await hook.flush();
  pending.resolve({ messages: [message(99)], before: null });
  assert.equal(await retry, false);
  await hook.flush();
  assert.equal(hook.value.threadLoadError, null);
  assert.equal(hook.value.isRefreshingThread, false);
  assert.deepEqual(ids(hook.value.messages), [message(3).id]);
  hook.options({ mobileContinuity: true });
  await hook.flush();
  assert.equal(await oldRetry(), false);
  assert.equal(await hook.value.retryThread(), true);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), [message(5).id]);
  hook.dispose();
});

test('unmount invalidates pending and retained Retry callbacks', async () => {
  const pending = deferred();
  let attempt = 0;
  const { hook, calls } = setup({ listMessages: () => ++attempt === 2 ? pending.promise : Promise.resolve({ messages: [message(1)], before: null }) });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const oldRetry = hook.value.retryThread;
  const retry = oldRetry();
  await hook.flush();
  hook.dispose();
  pending.resolve({ messages: [message(99)], before: null });
  assert.equal(await retry, false);
  assert.equal(await oldRetry(), false);
  assert.equal(calls.length, 2);
});

test('a cold load restarts in the new presentation without an extra history callback', async () => {
  for (const initialMobile of [true, false]) {
    const first = deferred();
    const second = deferred();
    let attempt = 0;
    const { hook, calls, routes } = setup({ listMessages: () => ++attempt === 1 ? first.promise : second.promise }, { mobileContinuity: initialMobile });
    await hook.flush();
    const opening = hook.value.openConversation(a);
    await hook.flush();
    assert.equal(hook.value.isLoadingThread, true);
    hook.options({ mobileContinuity: !initialMobile, onConversationChange: (...args) => routes.push(args) });
    await hook.flush();
    assert.equal(calls.length, 2);
    assert.equal(calls[1][1].limit, initialMobile ? 50 : 100);
    assert.equal(hook.value.isLoadingThread, true);
    first.resolve({ messages: [message(99)], before: null });
    await opening;
    await hook.flush();
    assert.deepEqual(ids(hook.value.messages), []);
    assert.equal(hook.value.isLoadingThread, true);
    second.resolve({ messages: [message(2)], before: null });
    await hook.flush();
    assert.deepEqual(ids(hook.value.messages), [message(2).id]);
    assert.equal(hook.value.isLoadingThread, false);
    assert.deepEqual(routes, [['a', false]]);
    hook.dispose();
  }
});

test('closing a mobile deep link rejects a late conversation lookup before route effects clean up', async () => {
  const found = deferred();
  const { hook, calls, routes } = setup({ getConversation: () => found.promise }, { initialConversationId: 'a' });
  await hook.flush();
  hook.value.closeConversation();
  found.resolve(a);
  await hook.flush();
  assert.equal(hook.value.activeConversation, null);
  assert.deepEqual(ids(hook.value.messages), []);
  assert.equal(calls.length, 0);
  assert.deepEqual(routes, [[null, true]]);
  hook.dispose();
});

test('clearing the routed conversation invalidates a pending mobile Retry and its error', async () => {
  const pending = deferred();
  let attempt = 0;
  const { hook } = setup({ listMessages: () => ++attempt === 2 ? pending.promise : Promise.resolve({ messages: [message(1)], before: null }) }, { initialConversationId: 'a' });
  await hook.flush();
  const retry = hook.value.retryThread();
  await hook.flush();
  hook.options({ mobileContinuity: true, initialConversationId: null });
  await hook.flush();
  pending.reject(new Error(networkMessage));
  assert.equal(await retry, false);
  await hook.flush();
  assert.equal(hook.value.activeConversation, null);
  assert.equal(hook.value.threadLoadError, null);
  assert.equal(hook.value.isRefreshingThread, false);
  hook.dispose();
});

test('the ready subscription and simultaneous Retry share the initial mobile request', async () => {
  const pending = deferred();
  const { hook, calls } = setup({
    listMessages: () => pending.promise,
    subscribeToMessages(_id, _onMessage, onStatus) { onStatus(true); return () => {}; },
  });
  await hook.flush();
  const opening = hook.value.openConversation(a);
  await hook.flush();
  const retry = hook.value.retryThread();
  await hook.flush();
  assert.equal(calls.length, 1);
  pending.resolve({ messages: [message(1)], before: null });
  await opening;
  assert.equal(await retry, true);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), [message(1).id]);
  hook.dispose();
});

test('ordinary successful background refresh clears the current thread error and reconciles removals', async () => {
  let result = { messages: [message(1), message(2)], before: null };
  const { hook, subscriptions, reads } = setup({ listMessages: async () => {
    if (result instanceof Error) throw result;
    return result;
  } });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  result = new Error(networkMessage);
  subscriptions.at(-1).onRefresh();
  hook.runTimeouts();
  await hook.flush();
  assert.equal(hook.value.threadLoadError, networkMessage);
  assert.deepEqual(ids(hook.value.messages), ids(history(1, 2)));
  result = { messages: [message(1), message(3)], before: null };
  subscriptions.at(-1).onRefresh();
  hook.runTimeouts();
  await hook.flush();
  assert.equal(hook.value.threadLoadError, null);
  assert.deepEqual(ids(hook.value.messages), [message(1).id, message(3).id]);
  assert.equal(reads.length, 0);
  hook.value.markVisibleMessagesRead();
  await hook.flush();
  assert.equal(reads.length, 1);
  hook.dispose();
});

test('access rejection invalidates an older page that was already pending', async () => {
  const older = deferred();
  let denied = false;
  const { hook } = setup({ listMessages: async (_id, options) => {
    if (options.before) return older.promise;
    if (denied) throw new Error('You do not have access to this conversation.');
    return pageFrom(history(1, 200), options);
  } });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const loading = hook.value.loadOlderMessages();
  await hook.flush();
  denied = true;
  assert.equal(await hook.value.retryThread(), false);
  older.resolve({ messages: history(51, 100), before: cursor(message(51)) });
  assert.equal(await loading, false);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), []);
  assert.equal(hook.value.hasOlderMessages, false);
  assert.equal(hook.value.isLoadingOlder, false);
  assert.equal(hook.value.threadLoadError, 'You do not have access to this conversation.');
  hook.dispose();
});

test('a rejected mobile thread ignores queued incoming and local-send completion until successful Retry', async () => {
  const sending = deferred();
  let result = { messages: [message(1)], before: null };
  const { hook, subscriptions } = setup({
    listMessages: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    sendMessage: () => sending.promise,
  });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const send = hook.value.sendMessage('An already dispatched message');
  await hook.flush();
  result = new Error('You do not have access to this conversation.');
  assert.equal(await hook.value.retryThread(), false);
  await hook.flush();
  assert.equal(hook.value.threadUnavailable, true);
  hook.value.dismissError();
  await hook.flush();
  assert.equal(hook.value.threadLoadError, null);
  assert.equal(hook.value.threadUnavailable, true);
  subscriptions.at(-1).onMessage(message(3));
  sending.resolve(message(2, 'a', 'viewer'));
  assert.equal(await send, true);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), []);
  result = { messages: [message(1), message(2, 'a', 'viewer')], before: null };
  assert.equal(await hook.value.retryThread(), true);
  await hook.flush();
  assert.equal(hook.value.threadUnavailable, false);
  assert.deepEqual(ids(hook.value.messages), [message(1).id, message(2).id]);
  subscriptions.at(-1).onMessage(message(3));
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), ids(history(1, 3)));
  hook.dispose();
});

test('a retained older-page callback cannot refill a rejected mobile thread', async () => {
  let denied = false;
  const { hook, calls } = setup({ listMessages: async (_id, options) => {
    if (denied) throw new Error('This conversation is not available.');
    return pageFrom(history(1, 200), options);
  } });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const oldLoadOlder = hook.value.loadOlderMessages;
  denied = true;
  assert.equal(await hook.value.retryThread(), false);
  await hook.flush();
  const count = calls.length;
  assert.equal(await oldLoadOlder(), false);
  assert.equal(calls.length, count);
  assert.deepEqual(ids(hook.value.messages), []);
  hook.dispose();
});

test('Earlier messages rejects an authoritative access failure and a network failure remains retryable', async () => {
  for (const failure of ['You do not have access to this conversation.', networkMessage]) {
    const { hook } = setup({ listMessages: async (_id, options) => {
      if (options.before) throw new Error(failure);
      return pageFrom(history(1, 200), options);
    } });
    await hook.flush();
    await hook.value.openConversation(a);
    await hook.flush();
    assert.equal(await hook.value.loadOlderMessages(), false);
    await hook.flush();
    assert.equal(hook.value.threadLoadError, failure);
    assert.equal(hook.value.isLoadingOlder, false);
    assert.equal(hook.value.error, null);
    if (failure === networkMessage) {
      assert.deepEqual(ids(hook.value.messages), ids(history(101, 200)));
      assert.equal(hook.value.hasOlderMessages, true);
      assert.equal(hook.value.threadUnavailable, false);
    } else {
      assert.deepEqual(ids(hook.value.messages), []);
      assert.equal(hook.value.hasOlderMessages, false);
      assert.equal(hook.value.threadUnavailable, true);
    }
    assert.equal(await hook.value.retryThread(), true);
    await hook.flush();
    assert.equal(hook.value.threadUnavailable, false);
    assert.equal(hook.value.threadLoadError, null);
    hook.dispose();
  }
});

test('old mobile subscription and send completions cannot refill a new owner using the same conversation id', async () => {
  const sending = deferred();
  let server = [message(1)];
  const { hook, auth, subscriptions } = setup({
    listMessages: async () => ({ messages: server, before: null }),
    sendMessage: () => sending.promise,
  });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const oldSubscription = subscriptions.at(-1);
  const send = hook.value.sendMessage('An old owner send');
  await hook.flush();
  auth.user = { id: 'other-account' };
  auth.viewerProfileId = 'other-profile';
  auth.loginSession = {};
  hook.rerender();
  await hook.flush();
  server = [message(10)];
  await hook.value.openConversation(a);
  await hook.flush();
  oldSubscription.onMessage(message(99));
  sending.resolve(message(2, 'a', 'viewer'));
  assert.equal(await send, true);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), [message(10).id]);
  hook.dispose();
});

test('a same-owner send still completes after changing presentation', async () => {
  const sending = deferred();
  const { hook } = setup({
    listMessages: async () => ({ messages: [message(1)], before: null }),
    sendMessage: () => sending.promise,
  });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const send = hook.value.sendMessage('A send across resizing');
  await hook.flush();
  hook.options({ mobileContinuity: false });
  await hook.flush();
  sending.resolve(message(2, 'a', 'viewer'));
  assert.equal(await send, true);
  await hook.flush();
  assert.deepEqual(ids(hook.value.messages), [message(1).id, message(2).id]);
  hook.dispose();
});

test('the default WEB path retains its existing load/error behavior and does not expose mobile Retry', async () => {
  let fail = false;
  const { hook, calls } = setup({ listMessages: async () => {
    if (fail) throw new Error(networkMessage);
    return { messages: [message(1)], before: null };
  } }, { mobileContinuity: false });
  await hook.flush();
  await hook.value.openConversation(a);
  hook.value.closeConversation();
  fail = true;
  await hook.value.openConversation(a);
  await hook.flush();
  assert.equal(calls[0][1].limit, 50);
  assert.deepEqual(ids(hook.value.messages), []);
  assert.equal(hook.value.error, networkMessage);
  assert.equal(hook.value.threadLoadError, null);
  assert.equal(hook.value.threadUnavailable, false);
  assert.equal(hook.value.isRefreshingThread, false);
  assert.equal(await hook.value.retryThread(), false);
  hook.dispose();
});
