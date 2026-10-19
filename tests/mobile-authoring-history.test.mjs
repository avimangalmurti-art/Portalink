import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const api = sourceModule('src/features/publishing/mobileAuthoringHistory.ts', {}, { URL, queueMicrotask });
const markerKey = api.MOBILE_AUTHORING_HISTORY_MARKER;
const tick = () => new Promise(setImmediate);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

/** Native history and Router have separate indexes, as they do in BrowserRouter. */
function browserFixture({ queued = false, capturedCompensation = false, taskOnlyTraversal = false, ignoreInitialGo = 0 } = {}) {
  const entries = [{ href: 'https://portalink.test/', state: { usr: null, key: 'home', idx: 0 } }, { href: 'https://portalink.test/p/owner?view=projects#work', state: { usr: { profileFromDock: true }, key: 'profile', idx: 1, preserved: 'base' } }];
  const listeners = [], calls = [], routerPops = [], traversals = [], timers = new Map();
  let index = 1, routerIndex = 1, key = 0, now = 0, timerId = 0, timerTask = false, goCalls = 0;
  const location = { get href() { return entries[index].href; }, get origin() { return new URL(entries[index].href).origin; } };
  const commit = (kind, state, href) => {
    const entry = { state, href: new URL(href ?? location.href, location.href).href };
    calls.push([kind, state, entry.href]);
    if (kind === 'native-push') { entries.splice(index + 1); entries.push(entry); index++; }
    else entries[index] = entry;
  };
  const pop = delta => {
    const next = Math.max(0, Math.min(entries.length - 1, index + delta));
    if (next === index) return;
    index = next;
    const event = { state: entries[index].state, stopped: false, stopImmediatePropagation() { this.stopped = true; } };
    for (const listener of [...listeners].sort((a, b) => Number(b.capture) - Number(a.capture))) {
      listener.callback(event); if (event.stopped) break;
    }
    return event;
  };
  const traverse = delta => { if (queued) traversals.push(capturedCompensation ? { target: index + delta } : { delta }); else queueMicrotask(() => pop(delta)); };
  const browser = {
    location,
    history: {
      get state() { return entries[index].state; },
      pushState: (state, _unused, href) => commit('native-push', state, href),
      replaceState: (state, _unused, href) => commit('native-replace', state, href),
      back() { calls.push(['native-back']); if (taskOnlyTraversal && !timerTask) { calls.push(['ignored-back']); return; } traverse(-1); },
      go(delta) { calls.push(['native-go', delta]); if (++goCalls <= ignoreInitialGo || taskOnlyTraversal && !timerTask) { calls.push(['ignored-go']); return; } traverse(delta); },
    },
    addEventListener(name, callback, capture = false) { assert.equal(name, 'popstate'); listeners.push({ callback, capture }); },
    removeEventListener(name, callback, capture = false) { assert.equal(name, 'popstate'); const i = listeners.findIndex(item => item.callback === callback && item.capture === capture); if (i >= 0) listeners.splice(i, 1); },
    setTimeout(callback, delay = 0) { timers.set(++timerId, { callback, at: now + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  // Router's listener exists before the child controller's capture listener.
  browser.addEventListener('popstate', event => { routerIndex = event.state?.idx ?? 0; routerPops.push(event.state); });
  const navigator = {
    createHref: to => typeof to === 'string' ? to : `${to.pathname ?? new URL(location.href).pathname}${to.search ?? ''}${to.hash ?? ''}`,
    push(to, state, options) { calls.push(['router-push', to, state, options]); routerIndex++; browser.history.pushState({ usr: state, key: `router-${++key}`, idx: routerIndex }, '', this.createHref(to)); },
    replace(to, state, options) { calls.push(['router-replace', to, state, options]); browser.history.replaceState({ usr: state, key: `router-${++key}`, idx: routerIndex }, '', this.createHref(to)); },
    go(delta) { calls.push(['router-go', delta]); queueMicrotask(() => pop(delta)); },
  };
  const controller = api.createMobileAuthoringHistory(browser);
  const originalState = browser.history.state;
  let options = { enabled: true, active: true, scope: 'account:profile', href: '/p/owner?view=projects#work', state: originalState.usr, navigator, dismissTopModal: () => false, reopen: () => false };
  const settle = async () => {
    await tick(); let steps = 0;
    while ([...timers.values()].some(timer => timer.at <= now)) {
      assert.ok(++steps < 30, 'Task-coalesced restoration must settle');
      const [id, timer] = [...timers].filter(([, value]) => value.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
      timers.delete(id); timerTask = true; try { timer.callback(); } finally { timerTask = false; } await tick();
    }
  };
  return {
    api, browser, navigator, controller, calls, routerPops, entries, originalState,
    get options() { return options; }, get index() { return index; }, get routerIndex() { return routerIndex; },
    attach() { controller.attach(); }, detach() { controller.detach(); },
    update(patch = {}) { options = { ...options, ...patch }; controller.update(options); },
    back() { return pop(-1); }, forward() { return pop(1); },
    queueBacks(count, captured = false) { for (let i = 1; i <= count; i++) traversals.push(captured ? { target: index - i } : { delta: -1 }); },
    settle, async advance(milliseconds) { now += milliseconds; await settle(); }, get timerCount() { return timers.size; },
    async drain() { let steps = 0; await settle(); while (traversals.length) { assert.ok(++steps < 30, 'Native compensation must settle without a Back/Forward loop'); const movement = traversals.shift(); pop(movement.target === undefined ? movement.delta : movement.target - index); await settle(); } },
    get marker() { return browser.history.state?.[markerKey]; },
  };
}

test('one Router-owned entry spans setup/upload updates and StrictMode effect replay', () => {
  const h = browserFixture(); h.attach(); h.update();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2);
  assert.equal(h.calls.filter(call => call[0] === 'router-push').length, 1);
  assert.equal(h.browser.history.state.usr, h.originalState.usr);
  assert.equal(h.browser.history.state.idx, 2);
  const key = h.browser.history.state.key, token = h.marker.token;
  h.update({ dismissTopModal: () => 'upload instead of setup' });
  h.detach(); h.attach(); h.update();
  assert.equal(h.calls.filter(call => call[0] === 'router-push').length, 1);
  assert.equal(h.browser.history.state.key, key); assert.equal(h.marker.token, token);
  h.detach();
});

test('Back retains the mounted Router while restoring its exact guard and only the acknowledged close reaches Router', async () => {
  const h = browserFixture(), pending = deferred(); let closes = 0;
  h.attach(); h.update({ dismissTopModal: () => { closes++; return pending.promise; } });
  const native = h.browser.history.state;
  const event = h.back();
  assert.equal(event.stopped, true); assert.equal(h.routerIndex, 2); assert.equal(h.routerPops.length, 0); assert.equal(closes, 1);
  h.back(); h.back(); assert.equal(closes, 1); await h.settle();
  assert.equal(h.browser.history.state, native); assert.equal(h.index, 2);
  pending.resolve(); await h.settle(); h.update({ active: false }); await h.settle();
  assert.equal(h.index, 1); assert.equal(h.routerIndex, 1); assert.equal(h.routerPops.length, 1);
  assert.equal(h.browser.history.state, h.originalState);
  h.update({ active: false }); await h.settle(); assert.equal(h.index, 1);
  h.detach();
});

for (const captured of [false, true]) {
  test(`prequeued rapid Back beyond the base preserves route/draft through a held save (${captured ? 'captured targets' : 'relative traversal queue'})`, async () => {
    const h = browserFixture({ queued: true, capturedCompensation: captured }), pending = deferred(); let closes = 0;
    h.attach(); h.update({ dismissTopModal: () => { closes++; return pending.promise; } });
    const owned = h.browser.history.state;
    h.queueBacks(2, captured); await h.drain();
    assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.browser.history.state, owned);
    assert.equal(h.browser.location.href, h.entries[1].href); assert.equal(h.routerPops.length, 0); assert.equal(closes, 1);
    assert.deepEqual(h.calls.filter(call => call[0] === 'native-go').map(call => call[1]), captured ? [1] : [1, 1]);
    pending.resolve(); await h.settle(); h.update({ active: false }); await h.drain();
    assert.equal(h.index, 1); assert.equal(h.routerIndex, 1); assert.equal(h.routerPops.length, 1);
    h.back(); assert.equal(h.index, 0); assert.equal(h.routerPops.length, 2, 'A subsequent ordinary Back must leave the closed authoring flow');
    h.detach();
  });

  test(`fast close during prequeued rapid Back consumes only its base (${captured ? 'captured targets' : 'relative traversal queue'})`, async () => {
    const h = browserFixture({ queued: true, capturedCompensation: captured }); let closes = 0;
    h.attach(); h.update({ dismissTopModal: () => { closes++; h.update({ active: false }); } });
    h.queueBacks(2, captured); await h.drain();
    assert.equal(closes, 1); assert.equal(h.index, 1); assert.equal(h.routerIndex, 1);
    assert.equal(h.routerPops.length, 1); assert.equal(h.browser.history.state, h.originalState);
    h.back(); assert.equal(h.index, 0); assert.equal(h.routerPops.length, 2); h.detach();
  });
}

test('compensation runs in a new task when the browser refuses traversals inside popstate and its microtasks', async () => {
  const h = browserFixture({ queued: true, taskOnlyTraversal: true }), pending = deferred();
  h.attach(); h.update({ dismissTopModal: () => pending.promise });
  h.queueBacks(2); await h.drain();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.routerPops.length, 0);
  assert.equal(h.calls.filter(call => call[0] === 'ignored-go').length, 0);
  assert.equal(h.timerCount, 0, 'Owned-entry arrival cancels the watchdog');
  const count = h.calls.filter(call => call[0] === 'native-go').length;
  await h.advance(10_000); assert.equal(h.calls.filter(call => call[0] === 'native-go').length, count);
  pending.resolve(); h.update({ active: false }); await h.drain(); assert.equal(h.index, 1); h.detach();
});

test('fast close also starts its final native Back outside the compensation popstate', async () => {
  const h = browserFixture({ queued: true, taskOnlyTraversal: true });
  h.attach(); h.update({ dismissTopModal: () => h.update({ active: false }) });
  h.queueBacks(2); await h.drain();
  assert.equal(h.index, 1); assert.equal(h.routerIndex, 1); assert.equal(h.routerPops.length, 1);
  assert.equal(h.calls.some(call => call[0] === 'ignored-back'), false); assert.equal(h.timerCount, 0); h.detach();
});

test('an ignored traversal gets one acknowledged task-level retry and never replays dismissal', async () => {
  const h = browserFixture({ ignoreInitialGo: 1 }); let dismissals = 0;
  h.attach(); h.update({ dismissTopModal: () => { dismissals++; return false; } });
  h.back(); await h.settle(); assert.equal(h.index, 1); assert.equal(h.timerCount, 1);
  await h.advance(100);
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.routerPops.length, 0); assert.equal(dismissals, 1);
  assert.equal(h.calls.filter(call => call[0] === 'native-go').length, 2); assert.equal(h.timerCount, 0);
  h.update({ active: false }); await h.settle(); assert.equal(h.index, 1); h.back(); assert.equal(h.index, 0); h.detach();
});

test('ignored compensations stop after two reissues instead of trapping history in an unlimited retry loop', async () => {
  const h = browserFixture({ ignoreInitialGo: 20 }); h.attach(); h.update(); h.back(); await h.settle();
  await h.advance(100); await h.advance(200); await h.advance(300); await h.advance(10_000);
  assert.equal(h.calls.filter(call => call[0] === 'native-go').length, 3); assert.equal(h.timerCount, 0);
  assert.equal(h.routerPops.length, 0); assert.equal(h.routerIndex, 2); h.detach();
});

test('Close after exhausted compensation gets a fresh bounded attempt and completes its acknowledged base POP', async () => {
  const h = browserFixture({ ignoreInitialGo: 3 }); h.attach(); h.update(); h.back(); await h.settle();
  await h.advance(100); await h.advance(200); await h.advance(300);
  assert.equal(h.index, 1); assert.equal(h.timerCount, 0);
  h.update({ active: false }); await h.settle();
  assert.equal(h.index, 1); assert.equal(h.routerIndex, 1); assert.equal(h.routerPops.length, 1);
  assert.equal(h.calls.filter(call => call[0] === 'native-go').length, 4); assert.equal(h.timerCount, 0);
  h.back(); assert.equal(h.index, 0); h.detach();
});

test('an explicit later Back can recover an exhausted guard without an automatic retry loop', async () => {
  const h = browserFixture({ ignoreInitialGo: 3 }); h.attach(); h.update(); h.back(); await h.settle();
  await h.advance(100); await h.advance(200); await h.advance(300);
  h.back(); await h.settle();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.routerPops.length, 0);
  assert.equal(h.calls.filter(call => call[0] === 'native-go').length, 4); assert.equal(h.timerCount, 0); h.detach();
});

test('detach cancels restoration timers and StrictMode reattachment resumes only its current target', async () => {
  const h = browserFixture({ ignoreInitialGo: 1 }); h.attach(); h.update(); h.back(); await h.settle();
  assert.equal(h.timerCount, 1); h.detach(); assert.equal(h.timerCount, 0);
  await h.advance(500); assert.equal(h.calls.filter(call => call[0] === 'native-go').length, 1);
  h.attach(); h.update(); await h.settle();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.timerCount, 0);
  assert.equal(h.calls.filter(call => call[0] === 'router-push').length, 1); h.detach();
});

test('scope replacement cancels the old watchdog and safely arms the new flow after native restoration', async () => {
  const h = browserFixture({ ignoreInitialGo: 1 }); let nextDismissals = 0;
  h.attach(); h.update(); h.back(); await h.settle();
  h.update({ active: false }); h.update({ active: true, scope: 'other-account:other-profile', dismissTopModal: () => { nextDismissals++; } });
  await h.settle();
  assert.equal(h.marker.scope, 'other-account:other-profile'); assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(nextDismissals, 0);
  const count = h.calls.filter(call => call[0] === 'native-go').length;
  await h.advance(10_000); assert.equal(h.calls.filter(call => call[0] === 'native-go').length, count); assert.equal(h.timerCount, 0); h.detach();
});

test('publication arriving during a native restoration waits for the owned index before replacing', async () => {
  const h = browserFixture({ queued: true }); h.attach(); h.update();
  h.back(); assert.equal(h.routerIndex, 2); assert.equal(h.index, 1);
  assert.equal(api.replaceMobileAuthoringDestination(h.navigator, '/p/owner/c/art/new'), true);
  h.update({ active: false });
  assert.equal(h.calls.filter(call => call[0] === 'router-replace').length, 0);
  await h.drain();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.browser.location.href, 'https://portalink.test/p/owner/c/art/new');
  assert.equal(h.calls.filter(call => call[0] === 'router-replace').length, 1); assert.equal(h.marker, undefined);
  h.back(); assert.equal(h.index, 1); assert.equal(h.routerPops.length, 1); h.detach();
});

test('a new same-account opening supersedes a publication destination waiting on native restoration', async () => {
  const h = browserFixture({ queued: true }); h.attach(); h.update();
  h.back(); assert.equal(api.replaceMobileAuthoringDestination(h.navigator, '/p/owner/c/art/previous-project'), true);
  h.update({ active: false }); h.update({ active: true }); await h.drain();
  assert.equal(h.calls.filter(call => call[0] === 'router-replace').length, 0);
  assert.equal(h.browser.location.href, h.entries[1].href); assert.equal(h.index, 2); assert.equal(h.routerIndex, 2);
  assert.ok(h.marker); h.detach();
});

test('the consumed entry cannot be reused by a new same-account flow before its close POP arrives', async () => {
  const h = browserFixture({ queued: true }); h.attach(); h.update(); const previous = h.marker.token;
  h.update({ active: false }); h.update({ active: true }); await h.drain();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.notEqual(h.marker.token, previous); h.detach();
});

test('a different Router replacement cancels a scheduled consume instead of navigating that destination backward', async () => {
  const h = browserFixture(); h.attach(); h.update();
  h.update({ active: false }); h.navigator.replace('/settings', { settingsReturn: '/p/owner' });
  h.update({ href: '/settings' }); await h.settle();
  assert.equal(h.browser.location.href, 'https://portalink.test/settings'); assert.equal(h.routerPops.length, 0);
  h.update({ active: true }); assert.ok(h.marker); h.detach();
});

test('busy or rejected close stays guarded and a later Back may retry safely', async () => {
  const h = browserFixture(); let calls = 0;
  h.attach(); h.update({ dismissTopModal: () => { calls++; if (calls === 1) return false; return Promise.reject(Error('Storage full')); } });
  h.back(); await h.settle(); assert.equal(h.index, 2); assert.equal(h.routerPops.length, 0);
  h.back(); await h.settle(); assert.equal(h.index, 2); assert.equal(calls, 2); assert.equal(h.routerPops.length, 0);
  h.detach();
});

test('native Back delegates to the current upload callback after the setup handoff', async () => {
  const h = browserFixture(), calls = [];
  h.attach(); h.update({ dismissTopModal: () => calls.push('setup') });
  h.update({ dismissTopModal: () => calls.push('upload') }); h.back(); await h.settle();
  assert.deepEqual(calls, ['upload']);
  assert.equal(h.calls.filter(call => call[0] === 'router-push').length, 1);
  h.detach();
});

test('closed current-runtime Forward reopens the ordinary recovery chooser once and reuses its entry', async () => {
  const h = browserFixture(); let reopens = 0;
  h.attach(); h.update({ reopen: () => { reopens++; } }); const token = h.marker.token;
  h.update({ active: false }); await h.settle(); h.forward(); await h.settle();
  assert.equal(reopens, 1); assert.equal(h.routerPops.length, 2); assert.equal(h.marker.token, token);
  h.update({ active: false }); assert.equal(h.index, 2, 'The asynchronous ordinary chooser may still be opening.');
  h.update({ active: true }); assert.equal(h.marker.token, token);
  assert.equal(h.calls.filter(call => call[0] === 'router-push').length, 1);
  h.detach();
});

test('late refusal from a Forward chooser cannot consume a subsequently opened flow', async () => {
  const h = browserFixture(), pending = deferred();
  h.attach(); h.update({ reopen: () => pending.promise });
  h.update({ active: false }); await h.settle(); h.forward(); await h.settle();
  h.update({ active: true }); const token = h.marker.token;
  pending.resolve(false); await h.settle();
  assert.equal(h.index, 2); assert.equal(h.marker.token, token);
  h.detach();
});

test('Forward cannot reopen a stale runtime or another account and preserves Router metadata when stripping', async () => {
  for (const reload of [false, true]) {
    const h = browserFixture(); let reopens = 0;
    h.attach(); h.update({ reopen: () => { reopens++; } }); const native = h.browser.history.state;
    h.update({ active: false }); await h.settle();
    if (reload) {
      h.detach();
      const next = api.createMobileAuthoringHistory(h.browser); next.attach(); next.update({ ...h.options, active: false });
      h.forward(); await h.settle(); next.detach();
    } else {
      h.update({ scope: 'other-account:profile', active: false }); h.forward(); await h.settle(); h.detach();
    }
    assert.equal(reopens, 0); assert.equal(h.marker, undefined);
    assert.equal(h.browser.history.state.usr, native.usr); assert.equal(h.browser.history.state.key, native.key); assert.equal(h.browser.history.state.idx, native.idx);
  }
});

test('desktop/public opt-out and absent navigator do not touch normal history', () => {
  for (const patch of [{ enabled: false }, { enabled: false, active: false }, { navigator: null }]) {
    const h = browserFixture(); h.attach(); h.update(patch);
    assert.deepEqual(h.calls, []); assert.equal(h.marker, undefined);
    h.back(); assert.equal(h.routerPops.length, 1); assert.equal(h.index, 0); h.detach();
  }
});

test('resize retires the MOBILE marker without a close callback or later Forward reopen', async () => {
  const h = browserFixture(); let actions = 0;
  h.attach(); h.update({ dismissTopModal: () => actions++, reopen: () => actions++ });
  h.update({ enabled: false, active: false }); await h.settle();
  assert.equal(h.index, 1); assert.equal(actions, 0);
  h.update({ enabled: true, active: false }); h.forward(); await h.settle();
  assert.equal(actions, 0); assert.equal(h.marker, undefined); h.detach();
});

test('old close consumption cannot dismiss or consume a new scope opening', async () => {
  const h = browserFixture(), oldClose = deferred(); let newCalls = 0;
  h.attach(); h.update({ dismissTopModal: () => oldClose.promise }); h.back();
  h.update({ active: false });
  h.update({ active: true, scope: 'next-account:next-profile', dismissTopModal: () => { newCalls++; return false; } });
  await h.settle(); const token = h.marker.token;
  oldClose.resolve(); await h.settle();
  assert.equal(h.marker.scope, 'next-account:next-profile'); assert.equal(h.marker.token, token);
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(newCalls, 0);
  h.back(); await h.settle(); assert.equal(newCalls, 1); h.detach();
});

test('publication replaces its owned stop and preserves destination state/options without an extra Back stop', async () => {
  const h = browserFixture(); h.attach(); h.update();
  const destination = { pathname: '/p/owner/c/studies/project/new', search: '?page=2', hash: '#art' };
  const state = { fromPublication: true }, options = { preventScrollReset: true };
  assert.equal(api.replaceMobileAuthoringDestination(h.navigator, destination, state, options, () => h.calls.push(['before-navigation'])), true);
  const call = h.calls.find(call => call[0] === 'router-replace');
  assert.equal(call[1], destination); assert.equal(call[2], state); assert.equal(call[3], options);
  assert.ok(h.calls.findIndex(call => call[0] === 'before-navigation') < h.calls.findIndex(call => call[0] === 'router-replace'));
  assert.equal(h.marker, undefined); assert.equal(h.index, 2);
  h.update({ active: false, href: '/p/owner/c/studies/project/new?page=2#art', state }); await h.settle();
  assert.equal(h.calls.filter(call => call[0] === 'native-back').length, 0);
  h.back(); assert.equal(h.index, 1); assert.equal(h.browser.location.href, h.entries[1].href); h.detach();
});

test('publication targeting the exact base consumes the guard rather than duplicating the page', async () => {
  const h = browserFixture(); h.attach(); h.update();
  assert.equal(api.replaceMobileAuthoringDestination(h.navigator, h.options.href), true);
  await h.settle();
  assert.equal(h.index, 1); assert.equal(h.routerIndex, 1); assert.equal(h.routerPops.length, 1);
  assert.equal(h.calls.filter(call => call[0] === 'router-push').length, 1);
  assert.equal(h.calls.filter(call => call[0] === 'router-replace').length, 0);
  h.update({ active: false }); await h.settle(); h.forward(); await h.settle();
  assert.equal(h.marker, undefined); h.detach();
});

test('publication helper ignores unrelated navigators, disabled owners and external destinations', () => {
  const h = browserFixture(); h.attach(); h.update();
  const before = () => assert.fail('An unowned navigation must not capture or change motion');
  assert.equal(api.replaceMobileAuthoringDestination({ ...h.navigator }, '/elsewhere', undefined, undefined, before), false);
  assert.equal(api.replaceMobileAuthoringDestination(h.navigator, 'https://elsewhere.test/', undefined, undefined, before), false);
  h.detach(); assert.equal(api.replaceMobileAuthoringDestination(h.navigator, '/elsewhere'), false);
});

test('hook effect replay retains its controller and balances the capture listener', () => {
  const h = browserFixture(), refs = [], effects = []; let cursor = 0;
  const { useMobileAuthoringHistory } = sourceModule('src/features/publishing/useMobileAuthoringHistory.ts', {
    react: { useRef(value) { return refs[cursor++] ??= { current: value }; }, useLayoutEffect(effect) { effects.push(effect); } },
    './mobileAuthoringHistory': api,
  }, { window: h.browser });
  const render = () => { cursor = 0; useMobileAuthoringHistory(h.options); };
  render(); const mount = effects.shift(), update = effects.shift(); const cleanup = mount(); update();
  cleanup(); const secondCleanup = mount(); update();
  assert.equal(h.calls.filter(call => call[0] === 'router-push').length, 1);
  secondCleanup(); h.back(); assert.equal(h.routerPops.length, 1, 'Detached hook cannot intercept another screen.');
});
