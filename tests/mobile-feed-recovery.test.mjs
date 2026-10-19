import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { hookHarness } from './helpers/hook-harness.mjs';

function events() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type, detail = {}) { for (const callback of [...listeners.get(type) ?? []]) callback({ type, ...detail }); },
    snapshot() { return [...listeners].flatMap(([type, handlers]) => [...handlers].map(callback => ({ type, callback }))); },
    count() { return [...listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0); },
  };
}

function fixture({ enabled = true, identity = {}, online = true, visible = true, feed: initialFeed = {} } = {}) {
  const window = events(), document = events(), navigator = { onLine: online };
  const calls = [], timers = new Map();
  let now = 0, timerId = 0;
  const feed = { status: 'success', isRefreshing: false, isLoadingMore: false, isSavingHomeMode: false, nextCursor: null,
    refreshError: null, loadMoreError: null,
    retry: () => calls.push('retry'), loadMore: () => calls.push('load-more'), ...initialFeed };
  let options = { enabled, identity, feed };
  document.visibilityState = visible ? 'visible' : 'hidden';
  document.modal = false;
  document.querySelector = selector => { assert.equal(selector, '[aria-modal="true"]'); return document.modal ? {} : null; };
  Object.defineProperty(document, 'hidden', { get: () => document.visibilityState !== 'visible' });
  Object.assign(window, { navigator, setTimeout(callback, delay = 0) { timers.set(++timerId, { callback, due: now + delay }); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  class ClockDate extends Date { static now() { return now; } }
  const h = hookHarness(new URL('../src/features/discovery/useMobileFeedRecovery.ts', import.meta.url), 'useMobileFeedRecovery', {}, {}, options, undefined, {}, { window, document, navigator, Date: ClockDate });
  const settle = async () => {
    for (let count = 0; count < 20; count++) {
      await h.flush();
      const due = [...timers].filter(([, timer]) => timer.due <= now);
      if (!due.length) return;
      for (const [id, timer] of due) { timers.delete(id); timer.callback(); }
    }
    assert.fail('Recovery must not spin timers without a new lifecycle event');
  };
  return { h, window, document, navigator, feed, calls, timers, settle,
    async render(changes = {}) {
      if (changes.feed) Object.assign(feed, changes.feed);
      options = { ...options, ...changes, feed };
      h.options(options); await settle();
    },
    async online(value) { navigator.onLine = value; window.emit(value ? 'online' : 'offline'); await settle(); },
    async visible(value) { document.visibilityState = value ? 'visible' : 'hidden'; document.emit('visibilitychange'); await settle(); },
    async pageshow(persisted) { window.emit('pageshow', { persisted }); await settle(); },
    async elapse(ms) { now += ms; await settle(); },
    dispose() { h.dispose(); },
  };
}

test('mounting or rerendering a failed MOBILE feed does not itself request a retry', async () => {
  const f = fixture({ feed: { status: 'error' } });
  await f.settle(); await f.render(); await f.render(); await f.elapse(60_000);
  assert.deepEqual(f.calls, []);
  f.dispose();
});

test('healthy and legitimately empty feeds remain untouched across reconnect and return events', async () => {
  const f = fixture(); await f.settle();
  await f.online(false); await f.online(true);
  await f.visible(false); await f.visible(true); await f.pageshow(true);
  assert.deepEqual(f.calls, []);
  f.dispose();
});

test('reconnecting retries a failed initial read once through the existing retry action', async () => {
  const f = fixture({ online: false, feed: { status: 'error' } }); await f.settle();
  assert.deepEqual(f.calls, []);
  await f.online(true);
  assert.deepEqual(f.calls, ['retry']);
  f.dispose();
});

test('returning from the background retries a failed refresh without treating visible rerenders as return', async () => {
  const f = fixture({ feed: { refreshError: 'Offline' } }); await f.settle();
  await f.visible(true); assert.deepEqual(f.calls, []);
  await f.visible(false); assert.deepEqual(f.calls, []);
  await f.visible(true); assert.deepEqual(f.calls, ['retry']);
  await f.render(); assert.deepEqual(f.calls, ['retry']);
  f.dispose();
});

test('a restored browser page can retry a failed feed; the ordinary initial pageshow does not', async () => {
  const f = fixture({ feed: { status: 'error' } }); await f.settle();
  await f.pageshow(false); assert.deepEqual(f.calls, []);
  await f.pageshow(true); assert.deepEqual(f.calls, ['retry']);
  f.dispose();
});

test('a failed older page resumes pagination instead of replacing the loaded catalogue', async () => {
  const f = fixture({ online: false, feed: { loadMoreError: 'Page unavailable', nextCursor: { id: 'older', publishedAt: '2026-10-01' } } }); await f.settle();
  await f.online(true);
  assert.deepEqual(f.calls, ['load-more']);
  f.dispose();
});

test('initial and refresh failures take precedence over a stale pagination failure', async () => {
  for (const failed of [{ status: 'error' }, { refreshError: 'Refresh failed' }]) {
    const f = fixture({ online: false, feed: { ...failed, loadMoreError: 'Older page failed' } }); await f.settle();
    await f.online(true); assert.deepEqual(f.calls, ['retry']); f.dispose();
  }
});

test('a city or exhausted feed never invents an older page from a stale pagination error', async () => {
  const f = fixture({ online: false, feed: { loadMoreError: 'Old failure', nextCursor: null } }); await f.settle();
  await f.online(true); assert.deepEqual(f.calls, []); f.dispose();
});

test('a reconnect, foreground and restored-page burst starts only one request before React updates busy state', async () => {
  const f = fixture({ online: false, visible: false, feed: { status: 'error' } }); await f.settle();
  f.navigator.onLine = true; f.document.visibilityState = 'visible';
  f.window.emit('online'); f.document.emit('visibilitychange'); f.window.emit('pageshow', { persisted: true });
  await f.settle(); assert.deepEqual(f.calls, ['retry']);
  await f.render({ feed: { isRefreshing: true } });
  f.window.emit('online'); f.window.emit('pageshow', { persisted: true }); await f.settle();
  assert.deepEqual(f.calls, ['retry']);
  f.dispose();
});

test('a failed automatic attempt never loops on rerender or timers and remains manually retryable', async () => {
  const f = fixture({ online: false, feed: { status: 'error' } }); await f.settle();
  await f.online(true); await f.render({ feed: { isRefreshing: true } });
  await f.render({ feed: { isRefreshing: false, status: 'error' } });
  await f.render(); await f.render(); await f.elapse(60_000);
  assert.deepEqual(f.calls, ['retry']);
  f.feed.retry();
  assert.deepEqual(f.calls, ['retry', 'retry'], 'The hook does not replace or disable manual Retry');
  await f.render({ feed: { isRefreshing: true } }); await f.visible(false); await f.visible(true);
  assert.deepEqual(f.calls, ['retry', 'retry']);
  f.dispose();
});

test('hidden, offline and disabled screens cannot issue recovery reads', async () => {
  const hidden = fixture({ visible: false, online: false, feed: { status: 'error' } }); await hidden.settle();
  await hidden.online(true); await hidden.pageshow(true); assert.deepEqual(hidden.calls, []); hidden.dispose();
  const offline = fixture({ online: false, feed: { status: 'error' } }); await offline.settle();
  await offline.visible(false); await offline.visible(true); await offline.pageshow(true);
  assert.deepEqual(offline.calls, []); offline.dispose();
  // The caller supplies false for WEB, retained screens and the categories overlay.
  const disabled = fixture({ enabled: false, online: false, feed: { status: 'error' } }); await disabled.settle();
  await disabled.online(true); await disabled.visible(false); await disabled.visible(true); await disabled.pageshow(true);
  assert.deepEqual(disabled.calls, []); disabled.dispose();
});

test('existing refresh, pagination and Home-mode work cannot be duplicated by recovery events', async () => {
  for (const busy of [{ isRefreshing: true }, { isLoadingMore: true }, { isSavingHomeMode: true }, { status: 'loading' }]) {
    const f = fixture({ online: false, feed: { refreshError: 'Offline', ...busy } }); await f.settle();
    await f.online(true); await f.pageshow(true); assert.deepEqual(f.calls, [], JSON.stringify(busy)); f.dispose();
  }
});

test('a return during existing work queues one retry only if that work settles failed', async () => {
  for (const busy of ['isRefreshing', 'isLoadingMore', 'isSavingHomeMode']) {
    const f = fixture({ online: false, feed: { status: 'error', [busy]: true } }); await f.settle();
    await f.online(true); await f.pageshow(true); assert.deepEqual(f.calls, []);
    await f.render({ feed: { [busy]: false } }); assert.deepEqual(f.calls, ['retry']);
    await f.render({ feed: { isRefreshing: true } });
    await f.render({ feed: { isRefreshing: false } });
    await f.render(); await f.elapse(60_000);
    assert.deepEqual(f.calls, ['retry'], 'Failure from the automatic attempt does not create another intent');
    f.dispose();
  }
});

test('successful work consumes a queued return without an unnecessary refresh', async () => {
  const f = fixture({ online: false, feed: { status: 'loading', isRefreshing: true } }); await f.settle();
  await f.online(true); assert.deepEqual(f.calls, []);
  await f.render({ feed: { status: 'success', isRefreshing: false } });
  await f.render({ feed: { refreshError: 'A later unrelated failure' } });
  assert.deepEqual(f.calls, []);
  await f.visible(false); await f.visible(true); assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('manual Retry or Load more cancels a queued automatic retry through the stable cancel action', async () => {
  for (const action of ['retry', 'loadMore']) {
    const f = fixture({ online: false, feed: { status: 'error', isRefreshing: true } }); await f.settle();
    const cancel = f.h.value;
    assert.equal(typeof cancel, 'function');
    await f.online(true); assert.deepEqual(f.calls, []);
    cancel(); f.feed[action]();
    await f.render({ feed: { isRefreshing: false } });
    assert.equal(f.h.value, cancel, 'Manual controls keep a stable cancellation callback');
    assert.deepEqual(f.calls, [action === 'retry' ? 'retry' : 'load-more']);
    f.dispose();
  }
});

test('same-identity screen return recovers a failure but a different account or city does not retry on arrival', async () => {
  const f = fixture({ feed: { status: 'error' } }); await f.settle();
  await f.render({ enabled: false }); await f.render({ enabled: true });
  assert.deepEqual(f.calls, ['retry']);
  await f.render({ enabled: false });
  await f.render({ enabled: true, identity: { account: 'another', city: 'new-city' } });
  assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('modal authoring blocks recovery and does not retain a retry intent after the modal closes', async () => {
  const f = fixture({ online: false, feed: { status: 'error' } }); await f.settle();
  f.document.modal = true; await f.online(true); await f.pageshow(true); assert.deepEqual(f.calls, []);
  f.document.modal = false; await f.render(); assert.deepEqual(f.calls, []);
  await f.online(false); await f.online(true); assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('duplicate restored-page events cannot retry repeatedly without another away cycle', async () => {
  const f = fixture({ feed: { status: 'error' } }); await f.settle();
  await f.pageshow(true); await f.render({ feed: { isRefreshing: true } });
  await f.render({ feed: { isRefreshing: false } });
  await f.pageshow(true); await f.elapse(60_000); await f.pageshow(true);
  assert.deepEqual(f.calls, ['retry']);
  f.window.emit('pagehide'); await f.pageshow(true);
  assert.deepEqual(f.calls, ['retry', 'retry']); f.dispose();
});

test('going away cancels a queued retry before work settles', async () => {
  for (const away of ['hidden', 'offline', 'disabled']) {
    const f = fixture({ online: false, feed: { status: 'error', isRefreshing: true } }); await f.settle();
    await f.online(true);
    if (away === 'hidden') await f.visible(false);
    if (away === 'offline') await f.online(false);
    if (away === 'disabled') await f.render({ enabled: false });
    await f.render({ feed: { isRefreshing: false } });
    assert.deepEqual(f.calls, [], away); f.dispose();
  }
});

test('a selected old event callback cannot retry after resize or retained-screen deactivation', async () => {
  const f = fixture({ online: false, feed: { status: 'error' } }); await f.settle();
  const callbacks = [...f.window.snapshot(), ...f.document.snapshot()];
  await f.render({ enabled: false });
  f.navigator.onLine = true;
  for (const { type, callback } of callbacks) callback({ type, persisted: true });
  await f.settle(); assert.deepEqual(f.calls, []);
  f.dispose();
});

test('account or city replacement never invokes callbacks retained from the previous feed', async () => {
  const oldCalls = [], newCalls = [];
  const f = fixture({ online: false, feed: { status: 'error', retry: () => oldCalls.push('old') } }); await f.settle();
  await f.render({ identity: { account: 'new-account', city: 'another-city' }, feed: { status: 'loading', retry: () => newCalls.push('new') } });
  await f.online(true); assert.deepEqual(oldCalls, []); assert.deepEqual(newCalls, []);
  await f.render({ feed: { status: 'error' } });
  assert.deepEqual(newCalls, ['new'], 'Only the new account/city receives its queued reconnect retry');
  await f.online(false); await f.online(true);
  assert.deepEqual(oldCalls, []); assert.deepEqual(newCalls, ['new', 'new']);
  f.dispose();
});

test('unmount removes lifecycle listeners and queued callbacks cannot retry the disposed feed', async () => {
  const f = fixture({ online: false, feed: { status: 'error' } }); await f.settle();
  const callbacks = [...f.window.snapshot(), ...f.document.snapshot()];
  f.dispose();
  assert.equal(f.window.count() + f.document.count(), 0);
  f.navigator.onLine = true;
  for (const { type, callback } of callbacks) callback({ type, persisted: true });
  await f.elapse(60_000); assert.deepEqual(f.calls, []);
});

test('manual retry wins before a queued reconnect callback reaches its first browser task', async () => {
  const f = fixture({ online: false, feed: { status: 'error' } }); await f.settle();
  f.navigator.onLine = true; f.window.emit('online');
  f.h.value(); f.feed.retry();
  await f.settle(); assert.deepEqual(f.calls, ['retry']);
  f.dispose();
});

test('account or city replacement cancels a queued browser task rather than retrying either stale feed', async () => {
  const oldCalls = [], newCalls = [];
  const f = fixture({ online: false, feed: { status: 'error', retry: () => oldCalls.push('old') } }); await f.settle();
  f.navigator.onLine = true; f.window.emit('online');
  await f.render({ identity: {}, feed: { retry: () => newCalls.push('new') } });
  assert.deepEqual(oldCalls, []); assert.deepEqual(newCalls, []);
  f.dispose();
});

test('a remounted screen owns one lifecycle listener set and does not replay an old return', async () => {
  const f = fixture({ online: false, feed: { status: 'error' } }); await f.settle();
  const listenerCount = f.window.count() + f.document.count();
  f.h.remount(); await f.settle();
  assert.equal(f.window.count() + f.document.count(), listenerCount);
  assert.deepEqual(f.calls, []);
  await f.online(true); assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('actual HomeFeed enables recovery only for the active MOBILE feed and manual controls cancel it first', () => {
  const file = ts.createSourceFile('HomeFeed.tsx', readFileSync(new URL('../src/components/home/HomeFeed.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(file.parseDiagnostics.length, 0);
  const component = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'HomeFeed');
  const declarations = component.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]);
  const declaration = name => {
    const node = declarations.find(node => node.name.getText(file) === name);
    assert.ok(node?.initializer, `Expected actual HomeFeed ${name}`); return node.getText(file);
  };
  const feedActions = declarations.find(node => ts.isObjectBindingPattern(node.name)
    && ['requestFeedRetry', 'requestMore'].every(name => node.name.elements.some(element => element.name.getText(file) === name)));
  assert.ok(feedActions?.initializer, 'Extract the actual feed action bindings used by the manual controls');
  let retryAction, paginationAction;
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'ErrorState') {
      const prop = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === 'onRetry');
      if (prop?.initializer && ts.isJsxExpression(prop.initializer)) retryAction = prop.initializer.expression.getText(file);
    }
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'button' && node.children.some(child => child.getText(file).includes("'Load more'"))) {
      const prop = node.openingElement.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.text === 'onClick');
      if (prop?.initializer && ts.isJsxExpression(prop.initializer)) paginationAction = prop.initializer.expression.getText(file);
    }
    ts.forEachChild(node, visit);
  };
  visit(component); assert.ok(retryAction); assert.ok(paginationAction);
  const calls = [], recoveries = [], memo = [];
  let cursor = 0;
  const cancel = () => calls.push('cancel');
  const context = vm.createContext({ exports: {}, isMobile: true, screenActive: true, categoriesOpen: false, account: 'one', locationId: undefined,
    feed: { retry: () => calls.push('retry'), loadMore: () => calls.push('load-more') },
    useMemo(factory, deps) { const index = cursor++; if (!memo[index] || deps.some((value, position) => !Object.is(value, memo[index].deps[position]))) memo[index] = { value: factory(), deps }; return memo[index].value; },
    useCallback: callback => callback,
    useMobileFeedRecovery: options => { recoveries.push(options); return cancel; },
  });
  const code = `exports.render = () => { ${['recoveryIdentity', 'cancelRecovery'].map(name => `const ${declaration(name)};`).join('\n')} const ${feedActions.getText(file)}; ${['retryFeed', 'loadMoreFeed'].map(name => `const ${declaration(name)};`).join('\n')} return { retry: ${retryAction}, more: ${paginationAction} }; };`;
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const render = changes => { Object.assign(context, changes); cursor = 0; return context.exports.render(); };
  const controls = render(); const identity = recoveries.at(-1).identity;
  render(); assert.equal(recoveries.at(-1).identity, identity, 'Ordinary rerenders retain recovery scope');
  for (const state of [{ isMobile: false }, { screenActive: false }, { categoriesOpen: true }]) {
    render({ isMobile: true, screenActive: true, categoriesOpen: false, ...state });
    assert.equal(recoveries.at(-1).enabled, false);
  }
  render({ isMobile: true, screenActive: true, categoriesOpen: false }); assert.equal(recoveries.at(-1).enabled, true);
  render({ account: 'two' }); assert.notEqual(recoveries.at(-1).identity, identity);
  const accountIdentity = recoveries.at(-1).identity;
  render({ locationId: 'city' }); assert.notEqual(recoveries.at(-1).identity, accountIdentity);
  controls.retry(); controls.more();
  assert.deepEqual(calls, ['cancel', 'retry', 'cancel', 'load-more']);
});
