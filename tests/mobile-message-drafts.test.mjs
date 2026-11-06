import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';
import { deferred } from './helpers/hook-harness.mjs';

const path = 'src/presentation/mobile/mobileMessageDrafts.ts';
const core = sourceModule(path);
const now = 1800000000000;
const plain = value => JSON.parse(JSON.stringify(value));
function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('mobile drafts survive a fresh reader, contain text only, and stay account/conversation scoped', () => {
  const store = storage(), options = { storage: store, now };
  core.saveMobileMessageDraft('account-a', 'thread-a', 'Unsent text', options);
  core.saveMobileMessageDraft('account-a', 'thread-b', 'Other draft', options);
  const reloaded = sourceModule(path);
  assert.deepEqual(plain(reloaded.readMobileMessageDrafts('account-a', options)), { 'thread-b': 'Other draft', 'thread-a': 'Unsent text' });
  assert.deepEqual(plain(reloaded.readMobileMessageDrafts('account-b', options)), {});
  const record = JSON.parse([...store.values.values()][0]);
  assert.deepEqual(Object.keys(record).sort(), ['accountId', 'drafts', 'version']);
  assert.deepEqual(Object.keys(record.drafts[0]).sort(), ['conversationId', 'revision', 'text', 'updatedAt']);
  core.clearMobileMessageDrafts('account-a', options);
  assert.equal(store.values.size, 0);
});

test('expiry does not extend on read; bounded count/length and malformed schemas fail closed', () => {
  const store = storage(), options = { storage: store, now };
  core.saveMobileMessageDraft('account', 'old', 'Expires', options);
  assert.equal(core.readMobileMessageDrafts('account', { ...options, now: now + core.MOBILE_MESSAGE_DRAFT_TTL_MS }).old, 'Expires');
  assert.deepEqual(plain(core.readMobileMessageDrafts('account', { ...options, now: now + core.MOBILE_MESSAGE_DRAFT_TTL_MS + 1 })), {});
  for (let index = 0; index < 25; index++) core.saveMobileMessageDraft('account', `thread-${index}`, 'x'.repeat(7000), { ...options, now: now + index });
  const drafts = core.readMobileMessageDrafts('account', { ...options, now: now + 30 });
  assert.ok(Object.keys(drafts).length <= core.MOBILE_MESSAGE_DRAFT_MAX_COUNT);
  assert.ok([...store.values.values()][0].length <= core.MOBILE_MESSAGE_DRAFT_MAX_RECORD);
  assert.equal(drafts['thread-24'], 'x'.repeat(7000));
  assert.equal(core.saveMobileMessageDraft('account', 'thread-24', 'x'.repeat(core.MOBILE_MESSAGE_DRAFT_MAX_TEXT + 1), { ...options, now: now + 30 }), false);
  assert.equal(core.readMobileMessageDrafts('account', { ...options, now: now + 30 })['thread-24'], undefined);
  const key = [...store.values.keys()][0];
  for (const raw of ['{', JSON.stringify({ version: 1, accountId: 'other', drafts: [] }), JSON.stringify({ version: 1, accountId: 'account', drafts: [], attachments: ['private'] }), 'x'.repeat(core.MOBILE_MESSAGE_DRAFT_MAX_RECORD + 1)]) {
    store.values.set(key, raw);
    assert.deepEqual(plain(core.readMobileMessageDrafts('account', options)), {});
    assert.equal(store.values.has(key), false);
  }
});

test('successful acknowledgement clears exactly its revision, including identical text retyped later', () => {
  const store = storage(), options = { storage: store, now };
  core.saveMobileMessageDraft('account', 'thread', 'Same text', options);
  const first = core.readMobileMessageDraft('account', 'thread', options);
  core.saveMobileMessageDraft('account', 'thread', 'Same text', options);
  core.clearSentMobileMessageDraft('account', first, options);
  assert.equal(core.readMobileMessageDrafts('account', options).thread, 'Same text');
  core.clearSentMobileMessageDraft('account', core.readMobileMessageDraft('account', 'thread', options), options);
  assert.deepEqual(plain(core.readMobileMessageDrafts('account', options)), {});
});

test('denied storage and invalid identifiers are optional and cannot throw', () => {
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('denied'); } };
  for (const store of [null, denied]) {
    const options = { storage: store, now };
    assert.deepEqual(plain(core.readMobileMessageDrafts('account', options)), {});
    assert.equal(core.saveMobileMessageDraft('account', 'thread', 'text', options), false);
    assert.doesNotThrow(() => core.clearMobileMessageDrafts('account', options));
    assert.doesNotThrow(() => core.clearSentMobileMessageDraft('account', { conversationId: 'thread', text: 'text', revision: 'revision' }, options));
  }
  assert.equal(core.saveMobileMessageDraft('account', 'https://private', 'text', { storage: storage(), now }), false);
});

function nodes(node) { return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : []; }
/** Executes the actual Messages composer, preserving effects and asynchronous sends. */
function composerFixture({ mobile = true, account = 'account-a', store = storage(), legacy = storage() } = {}) {
  const slots = [], events = new Map(); let cursor = 0, effects = [], dirty = true, tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = { ...React,
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!same(old?.deps, deps)) { slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const auth = { isAuthenticated: true, user: { id: account }, viewerProfileId: 'profile-a', loginSession: {} };
  const messaging = { activeConversation: { id: 'thread', status: 'active', participant: { id: 'other', displayName: 'Friend' } }, messages: [], conversations: [], status: 'success', broadcastTyping() {}, markVisibleMessagesRead() {}, searchConversations: async () => [], sendMessage: async () => true };
  const document = { visibilityState: 'visible', addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name) { events.delete(name); }, getElementById() { return null; } };
  const window = { localStorage: store, sessionStorage: legacy, setTimeout: () => 1, clearTimeout() {} };
  const drafts = sourceModule(path, {}, { window });
  const noops = new Proxy({}, { get: (_target, name) => name === '__esModule' ? false : () => null });
  const dependencies = {
    react, 'react-router-dom': { useNavigate: () => () => {}, Link: 'a' },
    '../presentation/usePresentation': { usePresentation: () => mobile ? 'mobile' : 'web' },
    '../presentation/mobile/MobileBackNavigation': { useMobileScreenActive: () => true, ScreenBack: 'screen-back' },
    '../contexts/AuthContext': { useAuth: () => auth }, '../features/messages/useMessaging': { useMessaging: () => messaging },
    '../presentation/mobile/mobileMessageDrafts': drafts,
    '../hooks/useMenuFocus': { useMenuFocus: () => ({}) },
    '../features/messages/useMobileMessageContinuity': { useMobileMessageContinuity: () => ({}) },
    './ui/ResizablePanelHandle': { ResizablePanelHandle: 'resize', useResizablePanelWidth: () => ({ width: 400 }) },
  };
  const imports = new Proxy(dependencies, { has: () => true, get: (target, name) => target[name] ?? noops });
  const api = sourceModule('src/components/MessagesPage.tsx', imports, { window, document, sessionStorage: legacy });
  function render() { for (let count = 0; count < 15 && dirty; count++) { cursor = 0; effects = []; dirty = false; tree = api.MessagesPage({ onBack() {} }); effects.forEach(fn => fn()); } return tree; }
  function textarea() { return nodes(render()).find(node => node.type === 'textarea'); }
  function findThreadElement(node) {
    if (Array.isArray(node)) return node.map(findThreadElement).find(Boolean);
    if (!React.isValidElement(node)) return undefined;
    return node.type?.name === 'MessageList' ? node : findThreadElement(node.props.children);
  }
  return { auth, messaging, store, legacy, drafts,
    threadElement: () => findThreadElement(render()),
    get text() { return textarea().props.value; },
    type(text) { textarea().props.onChange({ target: { value: text } }); render(); },
    pressReturn({ isComposing = false } = {}) {
      let prevented = false;
      let submitted = false;
      const input = textarea();
      input.props.onKeyDown({
        key: 'Enter',
        nativeEvent: { isComposing },
        currentTarget: { form: { requestSubmit() { submitted = true; } } },
        preventDefault() { prevented = true; },
      });
      return { prevented, submitted, hint: input.props.enterKeyHint };
    },
    send() { const form = nodes(render()).find(node => node.type === 'form'); form.props.onSubmit({ preventDefault() {} }); render(); },
    retry(id) { return nodes(render()).find(node => node.type?.name === 'MessageList').props.onRetry(id); },
    setMobile(value) { mobile = value; dirty = true; render(); },
    refresh() { dirty = true; render(); },
    async flush() { await Promise.resolve(); await Promise.resolve(); render(); },
  };
}

test('desktop composer typing reuses the thread element until message or action state changes', () => {
  const desktop = composerFixture({ mobile: false });
  desktop.messaging.messages = Array.from({ length: 1000 }, (_, index) => ({ id: `message-${index}`, body: `Message ${index}` }));
  desktop.refresh();
  const thread = desktop.threadElement();
  for (const draft of ['a', 'a draft', 'a draft with more text']) {
    desktop.type(draft);
    assert.equal(desktop.threadElement(), thread);
  }
  desktop.messaging.messages = [...desktop.messaging.messages, { id: 'new-message', body: 'New message' }];
  desktop.refresh();
  const received = desktop.threadElement();
  assert.notEqual(received, thread);
  desktop.messaging.pendingMessageId = 'message-1';
  desktop.refresh();
  assert.notEqual(desktop.threadElement(), received);
  const pending = desktop.threadElement();
  desktop.messaging.isReactionPending = id => id === 'message-2';
  desktop.refresh();
  assert.notEqual(desktop.threadElement(), pending);
  desktop.setMobile(true);
  const mobileThread = desktop.threadElement();
  desktop.type('Mobile draft');
  assert.notEqual(desktop.threadElement(), mobileThread, 'Mobile keeps rendering the current thread beside its draft.');
});

test('mobile Return keeps typing while desktop Enter submits outside IME composition', () => {
  const mobile = composerFixture();
  mobile.type('A draft');
  assert.deepEqual(mobile.pressReturn(), { prevented: false, submitted: false, hint: 'enter' });
  assert.equal(mobile.text, 'A draft');
  const desktop = composerFixture({ mobile: false });
  assert.deepEqual(desktop.pressReturn(), { prevented: true, submitted: true, hint: undefined });
  assert.deepEqual(desktop.pressReturn({ isComposing: true }), { prevented: false, submitted: false, hint: undefined });
});

test('actual mobile composer survives relaunch and failed send; success clears after acknowledgement', async () => {
  const store = storage(); const first = composerFixture({ store }); first.type('Unsent text');
  const fresh = composerFixture({ store }); assert.equal(fresh.text, 'Unsent text');
  fresh.messaging.sendMessage = async () => false; fresh.send(); await fresh.flush();
  assert.equal(fresh.text, 'Unsent text'); assert.equal(fresh.drafts.readMobileMessageDrafts('account-a').thread, 'Unsent text');
  const pending = deferred(); fresh.messaging.sendMessage = () => pending.promise; fresh.send();
  assert.equal(fresh.text, 'Unsent text'); pending.resolve(true); await fresh.flush();
  assert.equal(fresh.text, ''); assert.equal(fresh.drafts.readMobileMessageDrafts('account-a').thread, undefined);
});

test('late success preserves newer typing, a remounted draft and a replacement account', async () => {
  const f = composerFixture(); f.type('sent'); const pending = deferred(); f.messaging.sendMessage = () => pending.promise; f.send();
  f.type('new'); f.type('sent'); pending.resolve(true); await f.flush(); assert.equal(f.text, 'sent');
  const later = deferred(); f.messaging.sendMessage = () => later.promise; f.send();
  const newView = composerFixture({ store: f.store }); newView.type('newly typed elsewhere');
  later.resolve(true); await f.flush(); assert.equal(newView.drafts.readMobileMessageDrafts('account-a').thread, 'newly typed elsewhere');
  f.type('account-a text'); const switchSend = deferred(); f.messaging.sendMessage = () => switchSend.promise; f.send();
  f.auth.user = { id: 'account-b' }; f.refresh(); f.type('account-b text');
  switchSend.resolve(true); await f.flush(); assert.equal(f.text, 'account-b text');
});

test('token refresh preserves text and responsive WEB keeps legacy session storage/send behavior', async () => {
  const f = composerFixture(); f.type('retained'); f.auth.loginSession = {}; f.refresh(); assert.equal(f.text, 'retained');
  f.setMobile(false); assert.equal(f.text, 'retained'); assert.equal(JSON.parse(f.legacy.getItem('portalink-message-drafts:profile-a')).thread, 'retained');
  const pending = deferred(); f.messaging.sendMessage = () => pending.promise; f.send(); assert.equal(f.text, '');
  pending.resolve(false); await f.flush(); assert.equal(f.text, '', 'WEB retains pre-send clearing');
  f.type('desktop text'); f.setMobile(true); assert.equal(f.text, 'desktop text');
  assert.equal(f.drafts.readMobileMessageDrafts('account-a').thread, 'desktop text');
});

test('retrying a failed mobile message clears its original draft but preserves later replacement text', async () => {
  for (const editAfterFailure of [false, true]) {
    const f = composerFixture(); f.type('original'); f.messaging.sendMessage = async () => false;
    f.send(); await f.flush();
    f.messaging.messages = [{ id: 'failed', body: 'original', deliveryState: 'failed' }];
    f.messaging.retryMessage = async () => true;
    f.refresh();
    if (editAfterFailure) f.type('replacement');
    await f.retry('failed'); await f.flush();
    assert.equal(f.text, editAfterFailure ? 'replacement' : '');
    assert.equal(f.drafts.readMobileMessageDrafts('account-a').thread, editAfterFailure ? 'replacement' : undefined);
  }
});

test('actual mobile composer remains usable when device storage is denied', async () => {
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('denied'); } };
  const f = composerFixture({ store: denied });
  f.type('In memory'); assert.equal(f.text, 'In memory');
  f.messaging.sendMessage = async () => false; f.send(); await f.flush();
  assert.equal(f.text, 'In memory');
});

test('old-version mobile session drafts migrate once; successful send and relaunch cannot resurrect them', async () => {
  const store = storage(), legacy = storage();
  legacy.setItem('portalink-message-drafts:profile-a', JSON.stringify({ thread: 'Old version draft' }));
  const f = composerFixture({ store, legacy });
  assert.equal(f.text, 'Old version draft');
  assert.equal(legacy.getItem('portalink-message-drafts:profile-a'), null);
  assert.equal(f.drafts.readMobileMessageDrafts('account-a').thread, 'Old version draft');
  f.send(); await f.flush(); assert.equal(f.text, '');
  assert.equal(composerFixture({ store, legacy }).text, '');
});

test('legacy migration prefers durable text and never reads an unknown account/profile key', () => {
  const store = storage(), legacy = storage(), options = { storage: store, legacyStorage: legacy, now };
  core.saveMobileMessageDraft('account', 'thread', 'New durable', options);
  legacy.setItem('portalink-message-drafts:profile', JSON.stringify({ thread: 'Stale session', another: 'Migrate me', attachment: { name: 'Do not migrate' } }));
  assert.deepEqual(plain(core.migrateMobileMessageDrafts('account', 'profile', options)), { thread: 'New durable', another: 'Migrate me' });
  assert.deepEqual(JSON.parse(legacy.getItem('portalink-message-drafts:profile')), { attachment: { name: 'Do not migrate' } });
  const blockedLegacy = { getItem() { assert.fail('Unknown profile must not read old session drafts'); } };
  assert.deepEqual(plain(core.migrateMobileMessageDrafts(null, 'profile', { ...options, legacyStorage: blockedLegacy })), {});
  assert.equal(core.migrateMobileMessageDrafts('account', null, { ...options, legacyStorage: blockedLegacy }).thread, 'New durable');
});

test('random UUID failure is optional for durable saves and migration still preserves live text', () => {
  const failing = sourceModule(path, {}, { crypto: { randomUUID() { throw Error('Unavailable'); } } });
  const store = storage(), legacy = storage(), options = { storage: store, legacyStorage: legacy, now };
  assert.equal(failing.saveMobileMessageDraft('account', 'thread', 'Text', options), false);
  legacy.setItem('portalink-message-drafts:profile', JSON.stringify({ thread: 'Session text' }));
  assert.equal(failing.migrateMobileMessageDrafts('account', 'profile', options).thread, 'Session text');
  assert.equal(store.values.size, 0);
  assert.equal(JSON.parse(legacy.getItem('portalink-message-drafts:profile')).thread, 'Session text');
});

test('MOBILE-owned draft sent successfully after WEB resize cannot resurrect on cold MOBILE launch', async () => {
  const f = composerFixture(); f.type('Mobile text'); f.setMobile(false);
  const pending = deferred(); f.messaging.sendMessage = () => pending.promise;
  f.send(); assert.equal(f.text, '', 'WEB still clears the visible composer immediately');
  pending.resolve(true); await f.flush();
  assert.equal(composerFixture({ store: f.store, legacy: f.legacy }).text, '');
});

test('failed WEB send keeps the mobile recovery copy; successful WEB Retry retires only its submitted revision', async () => {
  for (const newerMobileText of [false, true]) {
    const f = composerFixture(); f.type('Mobile draft'); f.setMobile(false);
    f.messaging.sendMessage = async () => false; f.send(); await f.flush();
    assert.equal(f.text, '', 'WEB failed-send appearance stays unchanged');
    assert.equal(f.drafts.readMobileMessageDrafts('account-a').thread, 'Mobile draft');
    f.messaging.messages = [{ id: 'failed-web', body: 'Mobile draft', deliveryState: 'failed' }];
    const retry = deferred(); f.messaging.retryMessage = () => retry.promise;
    f.refresh();
    const completion = f.retry('failed-web');
    if (newerMobileText) { f.setMobile(true); f.type('New mobile text'); }
    else f.type('New web text');
    retry.resolve(true); await completion; await f.flush();
    assert.equal(f.text, newerMobileText ? 'New mobile text' : 'New web text');
    assert.equal(f.drafts.readMobileMessageDrafts('account-a').thread, newerMobileText ? 'New mobile text' : undefined);
  }
});

test('an ordinary WEB composer never takes ownership of a separate mobile recovery copy', async () => {
  const store = storage(), legacy = storage();
  core.saveMobileMessageDraft('account-a', 'thread', 'Mobile-only copy', { storage: store });
  legacy.setItem('portalink-message-drafts:profile-a', JSON.stringify({ thread: 'Mobile-only copy' }));
  const f = composerFixture({ mobile: false, store, legacy });
  f.send(); await f.flush(); assert.equal(f.text, '');
  assert.equal(core.readMobileMessageDrafts('account-a', { storage: store }).thread, 'Mobile-only copy');
});
