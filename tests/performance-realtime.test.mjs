import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { hookHarness } from './helpers/hook-harness.mjs';

const notificationHook = new URL('../src/features/messages/useNotifications.ts', import.meta.url);
const messagingHook = new URL('../src/features/messages/useMessaging.ts', import.meta.url);
test('activity coalesces realtime events, polls only while disconnected, and recovers missed failed reads', async () => {
  let reads = 0, fail = false, changed, connection;
  const service = {
    async listNotifications() { reads++; if (fail) throw Error('Offline'); return []; },
    subscribeToNotifications(onChange, onStatus) { changed = onChange; connection = onStatus; return () => {}; },
  };
  const hook = hookHarness(notificationHook, 'useNotifications', { notifications: service }, { user: { id: 'one' } });
  await hook.flush(); assert.equal(reads, 1);
  connection(true); hook.runTimeouts(); await hook.flush();
  const connectedReads = reads; hook.tick(); await hook.flush(); assert.equal(reads, connectedReads);
  changed(); changed(); changed(); hook.runTimeouts(); await hook.flush(); assert.equal(reads, connectedReads + 1);
  fail = true; changed(); hook.runTimeouts(); await hook.flush();
  fail = false; const beforeRetry = reads; hook.tick(); await hook.flush(); assert.equal(reads, beforeRetry + 1);
  connection(false); hook.tick(); await hook.flush(); assert.equal(reads, beforeRetry + 2);
  hook.dispose(); hook.tick(); hook.runTimeouts(); await hook.flush(); assert.equal(reads, beforeRetry + 2);
});

test('inbox polling resumes after a read fails even when the socket remains connected', async () => {
  let reads = 0, fail = false, changed, connection;
  const messaging = {
    async listConversations() { reads++; if (fail) throw Error('Offline'); return { conversations: [], nextOffset: null }; },
    getPreferences: async () => ({ permission: 'requests' }),
    subscribeToConversationChanges(onChange, onStatus) { changed = onChange; connection = onStatus; return () => {}; },
  };
  const hook = hookHarness(messagingHook, 'useMessaging', { messaging }, { viewerProfileId: 'viewer' });
  await hook.flush(); connection(true); hook.runTimeouts(); await hook.flush();
  const initial = reads; hook.tick(); await hook.flush(); assert.equal(reads, initial);
  fail = true; changed(); changed(); hook.runTimeouts(); await hook.flush(); assert.equal(reads, initial + 1);
  fail = false; hook.tick(); await hook.flush(); assert.equal(reads, initial + 2);
  hook.dispose();
});

function loadService(scoped) {
  const channels = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'account' } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'viewer' } }) }) }) }),
    rpc: async () => scoped ? { data: 1, error: null } : { data: null, error: { code: 'PGRST202' } },
    channel(name, options) {
      const channel = { name, options, events: [], removed: false,
        on(type, filter, callback) { this.events.push({ type, filter, callback }); return this; },
        subscribe(callback) { callback?.('SUBSCRIBED'); return this; },
      }; channels.push(channel); return channel;
    },
    removeChannel: async channel => { channel.removed = true; },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/services/supabase/messagingService.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, crypto, require: () => ({ requireSupabase: () => client }) });
  return { service: exports.supabaseMessagingService, channels };
}
async function flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); }

test('migrated messaging uses a private per-thread activity channel and filtered table events', async () => {
  const { service, channels } = loadService(true); let refreshes = 0; const states = [];
  const stop = service.subscribeToMessages('thread', () => {}, state => states.push(state), () => refreshes++);
  await flush();
  assert.equal(channels.length, 2); assert.equal(states.at(-1), true);
  const activity = channels.find(channel => channel.name === 'direct-activity:thread');
  assert.equal(activity.options.config.private, true);
  assert.ok(channels.flatMap(channel => channel.events).filter(event => event.type === 'postgres_changes').every(event => event.filter.filter === 'conversation_id=eq.thread'));
  activity.events[0].callback({ payload: { conversationId: 'other' } }); assert.equal(refreshes, 0);
  activity.events[0].callback({ payload: { conversationId: 'thread' } }); assert.equal(refreshes, 1);
  stop(); assert.ok(channels.every(channel => channel.removed));
  activity.events[0].callback({ payload: { conversationId: 'thread' } }); assert.equal(refreshes, 1);
});

test('legacy servers retain deletion/reaction updates; migrated inbox filters identity and states', async () => {
  const legacy = loadService(false);
  legacy.service.subscribeToMessages('thread', () => {}); await flush();
  assert.ok(legacy.channels[0].events.some(event => event.filter.event === 'DELETE'));
  assert.ok(legacy.channels[0].events.some(event => event.filter.table === 'direct_message_reactions'));
  const current = loadService(true); const states = [];
  const stop = current.service.subscribeToConversationChanges(() => {}, value => states.push(value)); await flush();
  assert.ok(current.channels[0].events.every(event => event.filter.filter.endsWith('=eq.viewer')));
  assert.equal(states.at(-1), true); stop(); assert.equal(current.channels[0].removed, true);
});
