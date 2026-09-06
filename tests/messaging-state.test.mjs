import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const a = { id: 'a', participant: { id: 'alice' }, lastMessageAt: null, isUnread: false };
const b = { id: 'b', participant: { id: 'bob' }, lastMessageAt: null, isUnread: false };
const message = (id, conversationId = 'a', senderProfileId = 'alice', second = 1) => ({
  id, conversationId, senderProfileId, body: id, createdAt: `2026-09-01T00:00:${String(second).padStart(2, '0')}.000Z`,
});

function setup(overrides = {}, options = {}) {
  const subscriptions = [];
  const reads = [];
  const messaging = {
    listConversations: async () => ({ conversations: [a, b], nextOffset: null }),
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
  const hook = hookHarness(new URL('../src/features/messages/useMessaging.ts', import.meta.url), 'useMessaging', { messaging }, { viewerProfileId: 'viewer' }, options);
  return { hook, messaging, subscriptions, reads };
}

test('a delayed conversation load cannot replace a newer thread', async () => {
  const first = deferred();
  const { hook } = setup({ listMessages: (id) => id === 'a' ? first.promise : Promise.resolve({ messages: [message('b1', 'b', 'bob')], before: null }) });
  await hook.flush();
  const opening = hook.value.openConversation(a);
  await hook.flush();
  await hook.value.openConversation(b);
  first.resolve({ messages: [message('a1')], before: null });
  await opening;
  await hook.flush();
  assert.equal(hook.value.activeConversation.id, 'b');
  assert.deepEqual(Array.from(hook.value.messages, (item) => item.id), ['b1']);
  hook.dispose();
});

test('a delayed archive only removes the conversation that was archived', async () => {
  const archived = deferred();
  const { hook } = setup({ archiveConversation: () => archived.promise });
  await hook.flush();
  await hook.value.openConversation(a);
  const action = hook.value.archiveConversation();
  await hook.value.openConversation(b);
  archived.resolve();
  await action;
  await hook.flush();
  assert.equal(hook.value.activeConversation.id, 'b');
  assert.deepEqual(Array.from(hook.value.conversations, (item) => item.id), ['b']);
  hook.dispose();
});

test('a delayed mute cannot redirect the next send to the previously active recipient', async () => {
  const muted = deferred();
  const sentTo = [];
  const { hook } = setup({ setMuted: () => muted.promise, sendMessage: async (id) => { sentTo.push(id); return message('sent', id, 'viewer'); } });
  await hook.flush();
  await hook.value.openConversation(a);
  const action = hook.value.setMuted(true);
  await hook.value.openConversation(b);
  muted.resolve();
  await action;
  await hook.flush();
  await hook.value.sendMessage('For Bob');
  assert.deepEqual(sentTo, ['b']);
  hook.dispose();
});

test('pending sends survive reopening their thread and complete only in that thread', async () => {
  const sent = deferred();
  const { hook } = setup({ sendMessage: () => sent.promise });
  await hook.flush();
  await hook.value.openConversation(a);
  const sending = hook.value.sendMessage('For Alice');
  await hook.value.openConversation(b);
  await hook.value.openConversation(a);
  await hook.flush();
  assert.equal(hook.value.messages.length, 1);
  assert.equal(hook.value.messages[0].deliveryState, 'sending');
  await hook.value.openConversation(b);
  sent.resolve(message('sent', 'a', 'viewer'));
  await sending;
  await hook.flush();
  assert.equal(hook.value.messages.length, 0);
  hook.dispose();
});

test('receiving messages does not acknowledge them until the visible thread reports they were seen', async () => {
  const { hook, subscriptions, reads } = setup();
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  subscriptions.at(-1).onMessage(message('incoming'));
  await hook.flush();
  assert.equal(reads.length, 0);
  hook.document.visibilityState = 'hidden';
  hook.value.markVisibleMessagesRead();
  await hook.flush();
  assert.equal(reads.length, 0);
  hook.document.visibilityState = 'visible';
  hook.value.markVisibleMessagesRead();
  await hook.flush();
  assert.equal(reads.length, 1);
  assert.equal(reads[0][1], message('incoming').createdAt);
  hook.dispose();
});

test('summary changes retain the same realtime subscription and refresh removes unsent messages', async () => {
  let messages = [message('old'), message('removed', 'a', 'alice', 2)];
  const { hook, subscriptions } = setup({ listMessages: async () => ({ messages, before: null }) });
  await hook.flush();
  await hook.value.openConversation(a);
  await hook.flush();
  const subscription = subscriptions.at(-1);
  subscription.onMessage(message('new', 'a', 'alice', 3));
  await hook.flush();
  assert.equal(subscriptions.length, 1);
  assert.equal(subscription.closed, false);
  messages = [message('old'), message('new', 'a', 'alice', 3)];
  subscription.onRefresh();
  await hook.flush();
  assert.deepEqual(Array.from(hook.value.messages, (item) => item.id), ['old', 'new']);
  hook.dispose();
});

test('refresh preserves conversation pagination progress and removes conversations hidden elsewhere', async () => {
  const offsets = [];
  let hidden = false;
  const { hook } = setup({ listConversations: async ({ offset }) => {
    offsets.push(offset);
    return { conversations: offset === 0 ? (hidden ? [] : [a]) : [b], nextOffset: offset + 30 };
  } });
  await hook.flush();
  await hook.value.loadMoreConversations();
  await hook.flush();
  hidden = true;
  hook.tick();
  await hook.flush();
  assert.equal(hook.value.nextConversationOffset, 60);
  assert.deepEqual(Array.from(hook.value.conversations, (item) => item.id), ['b']);
  await hook.value.loadMoreConversations();
  assert.equal(offsets.at(-1), 60);
  hook.dispose();
});

test('normal conversation navigation pushes history and changing the routing callback does not cancel a deep link', async () => {
  const found = deferred();
  const navigations = [];
  const { hook } = setup({ getConversation: () => found.promise }, { initialConversationId: 'a', onConversationChange: (...args) => navigations.push(args) });
  await hook.flush();
  hook.options({ initialConversationId: 'a', onConversationChange: (...args) => navigations.push(args) });
  await hook.flush();
  found.resolve(a);
  await hook.flush();
  assert.equal(hook.value.activeConversation.id, 'a');
  await hook.value.openConversation(b);
  assert.deepEqual(navigations.at(-1), ['b', false]);
  hook.dispose();
});

test('signing out invalidates pending activity loads', async () => {
  const pending = deferred();
  const auth = { user: { id: 'one' } };
  const service = { listNotifications: () => pending.promise, subscribeToNotifications: () => () => {} };
  const hook = hookHarness(new URL('../src/features/messages/useNotifications.ts', import.meta.url), 'useNotifications', { notifications: service }, auth);
  await hook.flush();
  auth.user = null;
  hook.rerender();
  await hook.flush();
  pending.resolve([{ id: 'private', body: 'Private activity', isUnread: true }]);
  await hook.flush();
  assert.equal(hook.value.notifications.length, 0);
  hook.dispose();
});

test('opening an unsent draft never adds a contact to Chats, including after refresh', async () => {
  const draft = { ...a, isDraft: true, status: 'request', requestedByViewer: true };
  const { hook } = setup({ listConversations: async () => ({ conversations: [draft, b], nextOffset: null }), getOrCreateConversation: async () => draft });
  await hook.flush();
  await hook.value.startConversation('alice');
  await hook.flush();
  assert.equal(hook.value.activeConversation.id, 'a');
  assert.deepEqual(Array.from(hook.value.conversations, (item) => item.id), ['b']);
  hook.tick();
  await hook.flush();
  assert.deepEqual(Array.from(hook.value.conversations, (item) => item.id), ['b']);
  hook.dispose();
});

test('incoming requests count separately from unread chats and acceptance updates the active thread', async () => {
  const request = { ...a, status: 'request', requestedByViewer: false, isUnread: true };
  const accepted = { ...request, status: 'active' };
  const { hook } = setup({ listConversations: async () => ({ conversations: [request, { ...b, isUnread: true }], nextOffset: null }), acceptRequest: async () => accepted });
  await hook.flush();
  assert.equal(hook.value.unreadCount, 1);
  assert.equal(hook.value.requestCount, 1);
  await hook.value.openConversation(request);
  await hook.value.acceptRequest();
  await hook.flush();
  assert.equal(hook.value.activeConversation.status, 'active');
  assert.equal(hook.value.requestCount, 0);
  assert.equal(hook.value.unreadCount, 2);
  hook.dispose();
});

test('deleting a request removes only that request even when another chat opens meanwhile', async () => {
  const deleted = deferred();
  const request = { ...a, status: 'request', requestedByViewer: false };
  const { hook } = setup({ listConversations: async () => ({ conversations: [request, b], nextOffset: null }), deleteRequest: () => deleted.promise });
  await hook.flush();
  await hook.value.openConversation(request);
  const deleting = hook.value.deleteRequest();
  await hook.value.openConversation(b);
  deleted.resolve();
  await deleting;
  await hook.flush();
  assert.equal(hook.value.activeConversation.id, 'b');
  assert.deepEqual(Array.from(hook.value.conversations, (item) => item.id), ['b']);
  hook.dispose();
});

test('requests publish no read, typing or reaction activity until acceptance', async () => {
  const request = { ...a, status: 'request', requestedByViewer: false };
  let current = request;
  const typing = [];
  const channels = [];
  const reactions = [];
  const { hook, reads } = setup({
    listConversations: async () => ({ conversations: [current], nextOffset: null }),
    listMessages: async () => ({ messages: [message('invitation')], before: null }),
    subscribeToTyping: (id) => { channels.push(id); return () => {}; },
    broadcastTyping: (...args) => typing.push(args),
    toggleReaction: async (...args) => { reactions.push(args); return []; },
    acceptRequest: async () => { current = { ...request, status: 'active' }; return current; },
  });
  await hook.flush();
  await hook.value.openConversation(request);
  await hook.flush();
  hook.value.markVisibleMessagesRead();
  hook.value.broadcastTyping(true);
  assert.equal(await hook.value.toggleReaction('invitation', '❤'), false);
  await hook.flush();
  assert.equal(reads.length, 0);
  assert.equal(typing.length, 0);
  assert.equal(channels.length, 0);
  assert.equal(reactions.length, 0);
  await hook.value.acceptRequest();
  await hook.flush();
  hook.value.markVisibleMessagesRead();
  hook.value.broadcastTyping(true);
  await hook.value.toggleReaction('invitation', '❤');
  await hook.flush();
  assert.ok(reads.length > 0);
  assert.equal(channels.length, 1);
  assert.equal(typing[0][2], true);
  assert.equal(reactions.length, 1);
  hook.dispose();
});

test('a request cannot optimistically send files or broadcast sender typing', async () => {
  const request = { ...a, status: 'request', requestedByViewer: true, isDraft: true };
  const sent = [];
  const typing = [];
  const { hook } = setup({
    listConversations: async () => ({ conversations: [request], nextOffset: null }),
    sendMessage: async (...args) => { sent.push(args); return message('sent', 'a', 'viewer'); },
    broadcastTyping: (...args) => typing.push(args),
  });
  await hook.flush();
  await hook.value.openConversation(request);
  await hook.flush();
  hook.value.broadcastTyping(true);
  assert.equal(await hook.value.sendMessage('Hello', [{ name: 'image.png' }]), false);
  await hook.flush();
  assert.equal(sent.length, 0);
  assert.equal(typing.length, 0);
  assert.equal(hook.value.messages.length, 0);
  assert.match(hook.value.error, /text-only invitation/);
  assert.equal(await hook.value.sendMessage('Hello'), true);
  assert.equal(sent.length, 1);
  hook.dispose();
});

test('the followers request audience persists through a settings refresh', async () => {
  let saved;
  const { hook } = setup({ updatePreferences: async (value) => { saved = value; return value; } });
  await hook.flush();
  assert.equal(await hook.value.updatePermission('followers'), true);
  await hook.flush();
  assert.equal(saved.permission, 'followers');
  assert.equal(hook.value.preferences.permission, 'followers');
  hook.dispose();
});

test('a failed privacy save restores the previous setting', async () => {
  const { hook } = setup({ updatePreferences: async () => { throw new Error('Could not save'); } });
  await hook.flush();
  assert.equal(await hook.value.updatePermission('following'), false);
  await hook.flush();
  assert.equal(hook.value.preferences.permission, 'requests');
  assert.equal(hook.value.isSavingPreferences, false);
  assert.equal(hook.value.error, 'Message privacy could not be saved.');
  hook.dispose();
});
