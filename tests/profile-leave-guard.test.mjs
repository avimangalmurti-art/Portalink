import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const api = sourceModule('src/features/profile/profileLeaveGuard.ts', { '../../hooks/useModalFocus': { dismissTopModal: () => false } });
const tick = () => new Promise(setImmediate);

/** Native traversal changes the URL before Router's independent listener sees it. */
function fixture(t, { queued = false, ignoreGo = 0, index = 2, dismissModal, controllerApi = api, windowOrder = false, routerUnmounts = false, earlyModule = false } = {}) {
  const entries = ['/', '/p/owner?view=projects#work', '/profile/edit', '/messages'].map((href, idx) => ({
    href: `https://portalink.test${href}`, state: { idx, key: `entry-${idx}`, usr: { returnTo: 'profile', opaque: [idx] }, preserve: `data-${idx}` },
  }));
  const listeners = [], timers = new Map(), moves = [], calls = [], observed = [], prompts = [], actions = [];
  let routerIndex = index, timerId = 0, now = 0, inPop = false;
  const original = entries[index];
  function pop(delta) {
    const next = Math.max(0, Math.min(entries.length - 1, index + delta));
    if (next === index) return;
    index = next; inPop = true;
    const event = { state: entries[index].state, stopped: false, stopImmediatePropagation() { this.stopped = true; } };
    const dispatch = [...listeners].filter(item => item.name === 'popstate');
    if (!windowOrder) dispatch.sort((a, b) => Number(b.capture) - Number(a.capture));
    try { for (const listener of dispatch) {
      // Window dispatch does not invoke a listener removed by an earlier
      // Router callback synchronously unmounting the route's owner.
      if (!listeners.includes(listener)) continue;
      listener.callback(event); if (event.stopped) break;
    } } finally { inPop = false; }
    return event;
  }
  const browser = {
    location: { get href() { return entries[index].href; } },
    history: {
      get state() { return entries[index].state; },
      go(delta) {
        assert.equal(inPop, false, 'Compensation must run in a new native task');
        calls.push(delta);
        if (ignoreGo-- > 0) return;
        if (queued) moves.push(delta); else queueMicrotask(() => pop(delta));
      },
      pushState() { assert.fail('The leave guard must not create history entries'); },
      replaceState() { assert.fail('The leave guard must not rewrite Router or user data'); },
    },
    addEventListener(name, callback, capture = false) { listeners.push({ name, callback, capture }); },
    removeEventListener(name, callback, capture = false) { const i = listeners.findIndex(item => item.name === name && item.callback === callback && item.capture === capture); if (i >= 0) listeners.splice(i, 1); },
    setTimeout(callback, delay = 0) { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  if (earlyModule) controllerApi = sourceModule('src/features/profile/profileLeaveGuard.ts', { '../../hooks/useModalFocus': { dismissTopModal: () => false } }, { window: browser });
  let controller;
  browser.addEventListener('popstate', event => {
    routerIndex = event.state?.idx; observed.push(event.state);
    if (routerUnmounts) controller?.detach();
  });
  controller = new controllerApi.ProfileLeaveGuardController(browser, dismissModal);
  let options = { enabled: true, blocked: false, onRequestDiscard: () => prompts.push('discard') };
  controller.attach(); controller.update(options);
  t.after(() => controller.detach());
  async function settle() {
    await tick(); let count = 0;
    while ([...timers.values()].some(timer => timer.at <= now)) {
      assert.ok(++count < 40, 'History tasks must remain bounded');
      const [id, timer] = [...timers].filter(([, value]) => value.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
      timers.delete(id); timer.callback(); await tick();
    }
  }
  return {
    browser, controller, entries, original, prompts, actions, calls, observed, timers, listeners,
    get index() { return index; }, get routerIndex() { return routerIndex; },
    update(patch) { options = { ...options, ...patch }; controller.update(options); },
    back: () => pop(-1), forward: () => pop(1), pop, settle,
    request(label) { controller.requestLeave(() => actions.push(label)); },
    unload() { const event = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } }; listeners.filter(item => item.name === 'beforeunload').forEach(item => item.callback(event)); return event; },
    async advance(ms) { now += ms; await settle(); },
    async drain() { let count = 0; await settle(); while (moves.length) { assert.ok(++count < 40, 'Queued Back/Forward must settle'); pop(moves.shift()); await settle(); } },
  };
}

test('without an enabled owner the adapter and explicit leave preserve ordinary navigation', t => {
  assert.equal(api.interceptProfileNavigation(() => assert.fail('Consultation never executes unguarded navigation')), false);
  const h = fixture(t); h.update({ enabled: false });
  assert.equal(api.interceptProfileNavigation(() => undefined), false);
  h.request('close'); assert.deepEqual(h.actions, ['close']); assert.deepEqual(h.prompts, []);
  assert.equal(h.unload().prevented, false);
});

test('dirty leave queues the first exact action, Cancel preserves the draft and Confirm replays once', t => {
  const h = fixture(t); h.request('first'); h.request('second');
  assert.deepEqual(h.prompts, ['discard']); assert.deepEqual(h.actions, []);
  h.controller.cancelLeave(); h.controller.confirmLeave(); assert.deepEqual(h.actions, []);
  h.request('chosen'); h.controller.confirmLeave(); h.controller.confirmLeave();
  assert.deepEqual(h.actions, ['chosen']); assert.deepEqual(h.prompts, ['discard', 'discard']);
});

test('confirmation bypasses adapter reentry without leaving a permanent global bypass', async t => {
  const h = fixture(t);
  const navigate = () => { if (!api.interceptProfileNavigation(navigate)) h.actions.push('navigation'); };
  navigate(); assert.equal(h.prompts.length, 1); assert.deepEqual(h.actions, []);
  h.controller.confirmLeave(); assert.deepEqual(h.actions, ['navigation']);
  await h.advance(2000); navigate(); assert.equal(h.prompts.length, 2);
});

test('busy work refuses local, adapter, confirmation and native leave without a second action', async t => {
  const h = fixture(t); h.update({ blocked: true });
  h.request('local'); assert.equal(api.interceptProfileNavigation(() => h.actions.push('adapter')), true);
  assert.equal(h.back().stopped, true); await h.settle();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.prompts.length, 0); assert.deepEqual(h.actions, []);
  h.update({ blocked: false }); h.request('ready'); h.update({ blocked: true }); h.controller.confirmLeave(); assert.deepEqual(h.actions, []);
  h.update({ blocked: false }); h.controller.confirmLeave(); assert.deepEqual(h.actions, ['ready']);
});

for (const direction of [-1, 1]) {
  test(`native ${direction < 0 ? 'Back' : 'Forward'} restores exact state before Cancel or confirmed replay`, async t => {
    const h = fixture(t), originalState = h.original.state;
    assert.equal(h.pop(direction).stopped, true); assert.equal(h.routerIndex, 2);
    await h.settle(); assert.equal(h.prompts.length, 1);
    assert.equal(h.index, 2); assert.equal(h.browser.location.href, h.original.href);
    assert.equal(h.browser.history.state, originalState); assert.deepEqual(h.observed, []);
    h.controller.cancelLeave(); h.controller.confirmLeave(); await h.settle(); assert.equal(h.index, 2);
    h.pop(direction); await h.settle(); h.controller.confirmLeave(); await h.settle();
    assert.equal(h.index, 2 + direction); assert.equal(h.routerIndex, 2 + direction);
    assert.equal(h.observed.length, 1); assert.equal(h.browser.history.state, h.entries[2 + direction].state);
  });
}

test('a fresh native Back restores before opening its warning; premature confirmation cannot navigate', async t => {
  const h = fixture(t, { queued: true });
  h.back(); h.controller.confirmLeave(); h.controller.confirmLeave();
  assert.equal(h.routerIndex, 2); assert.equal(h.prompts.length, 0); await h.drain();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.prompts.length, 1);
  h.controller.confirmLeave(); await h.drain();
  assert.equal(h.index, 1); assert.equal(h.routerIndex, 1); assert.equal(h.observed.length, 1); assert.equal(h.prompts.length, 1);
});

test('rapid native Back coalesces compensation and never replaces the first pending destination', async t => {
  const h = fixture(t, { queued: true }); h.back(); await h.settle(); h.back(); await h.drain();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.prompts.length, 1); assert.equal(h.observed.length, 0);
  h.controller.confirmLeave(); await h.drain();
  assert.equal(h.index, 1); assert.equal(h.routerIndex, 1); assert.equal(h.observed.length, 1);
});

test('Cancel during restoration cancels the queued leave without cancelling native compensation', async t => {
  const h = fixture(t, { queued: true }); h.back(); h.controller.cancelLeave(); await h.drain();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.observed.length, 0); assert.equal(h.calls.length, 1); assert.equal(h.prompts.length, 0);
});

test('disabling a retained or changed-owner editor retires pending confirmations and native replay', async t => {
  const h = fixture(t, { queued: true }); h.back(); h.controller.confirmLeave(); h.update({ enabled: false });
  await h.drain(); h.controller.confirmLeave();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.observed.length, 0); assert.equal(h.unload().prevented, false);
  h.request('new-owner'); assert.deepEqual(h.actions, ['new-owner']);
});

test('confirmed Save return waits for an already refused Back compensation without another warning', async t => {
  const h = fixture(t, { queued: true }); h.update({ blocked: true }); h.back();
  h.update({ enabled: false, blocked: false });
  assert.equal(api.interceptProfileNavigation(() => h.browser.history.go(-1)), true);
  h.update({ enabled: false });
  assert.equal(h.routerIndex, 2); await h.drain();
  assert.equal(h.index, 1); assert.equal(h.routerIndex, 1); assert.equal(h.observed.length, 1); assert.equal(h.prompts.length, 0);
});

test('a pristine child consumes native Back without a warning or losing earlier shared draft values', async t => {
  const h = fixture(t), shared = { name: 'Earlier confirmed draft', isPrivate: true }, before = { ...shared };
  let childOpen = true;
  h.update({ enabled: false, onChildBack: () => { childOpen = false; h.update({ onChildBack: undefined }); } });
  assert.equal(h.back().stopped, true); await h.settle();
  assert.equal(childOpen, false); assert.deepEqual(shared, before); assert.equal(h.index, 2); assert.equal(h.routerIndex, 2);
  assert.equal(h.prompts.length, 0); assert.equal(h.observed.length, 0); assert.equal(h.browser.history.state, h.original.state);
});

test('dirty child Back discards only scratch, and subsequent main Back warns about the shared draft', async t => {
  const h = fixture(t); let scratch = 'Unconfirmed child edit', shared = 'Earlier shared edit', childBacks = 0;
  h.update({ onChildBack: () => { childBacks++; scratch = ''; h.update({ onChildBack: undefined }); } });
  h.back(); h.back(); await h.settle(); assert.equal(childBacks, 1); assert.equal(scratch, ''); assert.equal(shared, 'Earlier shared edit');
  assert.equal(h.index, 2); assert.equal(h.prompts.length, 0);
  h.back(); await h.settle(); assert.equal(h.prompts.length, 1); assert.equal(childBacks, 1); h.controller.cancelLeave(); assert.equal(shared, 'Earlier shared edit');
});

test('pristine child keeps ordinary sidebar navigation and native Forward unguarded', t => {
  const h = fixture(t); let childBacks = 0;
  h.update({ enabled: false, onChildBack: () => childBacks++ });
  assert.equal(api.interceptProfileNavigation(() => assert.fail('Adapter consultation cannot execute an unguarded action')), false);
  h.request('sidebar'); assert.deepEqual(h.actions, ['sidebar']); assert.equal(h.prompts.length, 0);
  assert.equal(h.forward().stopped, false); assert.equal(h.routerIndex, 3); assert.equal(childBacks, 0);
});

test('a photo or save lock restores child Back without dismissing its transaction', async t => {
  const h = fixture(t); let childBacks = 0;
  h.update({ enabled: false, blocked: true, onChildBack: () => childBacks++ }); h.back(); await h.settle();
  assert.equal(h.index, 2); assert.equal(childBacks, 0); assert.equal(h.prompts.length, 0);
  h.update({ blocked: false }); h.back(); await h.settle(); assert.equal(childBacks, 1); assert.equal(h.index, 2);
});

test('a retired child callback cannot dismiss a replacement screen after native compensation', async t => {
  const h = fixture(t, { queued: true }); let childBacks = 0;
  h.update({ onChildBack: () => childBacks++ }); h.back(); h.update({ enabled: false, onChildBack: undefined }); await h.drain();
  assert.equal(childBacks, 0); assert.equal(h.index, 2); assert.equal(h.observed.length, 0);
});

for (const modal of ['icon picker', 'photo choices']) for (const dirty of [false, true]) {
  test(`native Back cancels only the ${modal} above a ${dirty ? 'dirty' : 'pristine'} child`, async t => {
    let modalOpen = true, childBacks = 0, dismissals = 0;
    const shared = { name: 'Earlier shared edit' }, scratch = { name: 'Child scratch' };
    const h = fixture(t, { dismissModal: () => {
      if (!modalOpen) return false;
      assert.equal(h.index, 2, 'Modal dismissal waits for exact native restoration');
      assert.equal(h.routerIndex, 2); dismissals++; modalOpen = false; return Promise.resolve();
    } });
    h.update({ enabled: dirty, onChildBack: () => { childBacks++; h.update({ onChildBack: undefined }); } });
    h.back(); await h.settle();
    assert.equal(modalOpen, false); assert.equal(dismissals, 1); assert.equal(childBacks, 0); assert.equal(h.prompts.length, 0);
    assert.deepEqual(shared, { name: 'Earlier shared edit' }); assert.deepEqual(scratch, { name: 'Child scratch' });
    assert.equal(h.observed.length, 0); h.back(); await h.settle(); assert.equal(childBacks, 1); assert.equal(h.index, 2);
  });
}

test('cropper owns its cancellation even while the parent avatar transaction is blocked', async t => {
  for (const exporting of [false, true]) {
    let cropOpen = true, childBacks = 0, cancels = 0;
    const h = fixture(t, { dismissModal: () => {
      if (!cropOpen) return false;
      cancels++; if (!exporting) cropOpen = false;
      // The shared modal dispatcher reports a consumed modal even when that
      // cropper's synchronous export lock intentionally refuses cancellation.
      return Promise.resolve();
    } });
    h.update({ blocked: true, onChildBack: () => childBacks++ }); h.back(); await h.settle();
    assert.equal(cancels, 1); assert.equal(cropOpen, exporting); assert.equal(childBacks, 0); assert.equal(h.prompts.length, 0); assert.equal(h.index, 2); assert.equal(h.routerIndex, 2);
    h.controller.detach();
  }
});

test('default controller dispatches the actual shared modal dismissal before its child Back', async t => {
  const document = { activeElement: null, addEventListener() {}, removeEventListener() {} };
  class Element {
    isConnected = true;
    getClientRects() { return [{}]; }
    closest() { return null; }
    contains(target) { return target === this; }
    querySelectorAll() { return []; }
    focus() { document.activeElement = this; }
  }
  const modal = sourceModule('src/hooks/useModalFocus.ts', { react: { useEffect() {}, useRef: value => ({ current: value }) } }, { document, HTMLElement: Element, getComputedStyle: () => ({ visibility: 'visible' }) });
  const controllerApi = sourceModule('src/features/profile/profileLeaveGuard.ts', { '../../hooks/useModalFocus': modal });
  let cancelled = 0, childBacks = 0;
  const release = modal.containModalFocus(new Element(), () => { cancelled++; release(); });
  t.after(release);
  const h = fixture(t, { controllerApi }); h.update({ onChildBack: () => childBacks++ }); h.back(); await h.settle();
  assert.equal(cancelled, 1); assert.equal(childBacks, 0); assert.equal(h.prompts.length, 0); assert.equal(h.routerIndex, 2);
  h.back(); await h.settle(); assert.equal(cancelled, 1); assert.equal(childBacks, 1);
});

test('Back on an existing Discard dialog cancels that modal without queuing another warning or losing edits', async t => {
  let modalOpen = false, dismissals = 0;
  const h = fixture(t, { dismissModal: () => {
    if (!modalOpen) return false;
    dismissals++; modalOpen = false; h.controller.cancelLeave(); return Promise.resolve();
  } });
  h.request('sidebar'); modalOpen = true; assert.equal(h.prompts.length, 1);
  h.back(); await h.settle(); h.controller.confirmLeave();
  assert.equal(dismissals, 1); assert.equal(h.prompts.length, 1); assert.deepEqual(h.actions, []); assert.equal(h.index, 2); assert.equal(h.observed.length, 0);
  h.back(); await h.settle(); assert.equal(h.prompts.length, 2);
});

test('closing a child during compensation cannot turn that same Back into a whole-profile discard warning', async t => {
  const h = fixture(t, { queued: true }); h.update({ onChildBack: () => assert.fail('Old child must not close twice') });
  h.back(); h.update({ onChildBack: undefined }); await h.drain();
  assert.equal(h.prompts.length, 0); assert.equal(h.index, 2); assert.equal(h.routerIndex, 2);
});

test('only dirty active entries receive a generic document-unload warning', t => {
  const h = fixture(t); const warning = h.unload(); assert.equal(warning.prevented, true); assert.equal(warning.returnValue, '');
  h.update({ enabled: false }); assert.equal(h.unload().prevented, false);
  h.update({ enabled: true }); assert.equal(h.unload().prevented, true);
  h.controller.detach(); assert.equal(h.unload().prevented, false);
  assert.equal(h.listeners.filter(item => item.name === 'beforeunload').length, 0);
  assert.equal(h.back().stopped, false); assert.equal(h.routerIndex, 1);
});

test('early dispatcher protects a freshly pushed editor before Router can synchronously unmount its late owner', async t => {
  const h = fixture(t, { earlyModule: true, windowOrder: true, routerUnmounts: true });
  assert.equal(h.back().stopped, true); await h.settle();
  assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); assert.equal(h.prompts.length, 1);
  assert.equal(h.observed.length, 0); assert.equal(h.browser.history.state, h.original.state);
  h.controller.cancelLeave(); h.request('still mounted'); assert.equal(h.prompts.length, 2);
  h.controller.confirmLeave(); assert.deepEqual(h.actions, ['still mounted']);
});

test('early dispatcher preserves pristine navigation and its permanent listener is harmless after owner teardown', t => {
  const h = fixture(t, { earlyModule: true, windowOrder: true, routerUnmounts: true });
  h.update({ enabled: false });
  assert.equal(h.back().stopped, false); assert.equal(h.routerIndex, 1); assert.equal(h.observed.length, 1);
  assert.equal(h.forward().stopped, false); assert.equal(h.routerIndex, 2); assert.equal(h.observed.length, 2);
  assert.deepEqual(h.calls, []); assert.equal(h.prompts.length, 0);
});

test('missing native indexes are left to browser semantics without history rewriting', t => {
  const h = fixture(t); h.update({ enabled: false }); delete h.original.state.idx; h.update({ enabled: true });
  assert.equal(h.back().stopped, false); assert.equal(h.routerIndex, 1); assert.deepEqual(h.calls, []);
  assert.equal(h.unload().prevented, true);
});

test('teardown and StrictMode reattach do not write history or replay abandoned actions', async t => {
  const h = fixture(t); h.request('stale'); h.controller.detach(); h.controller.attach();
  h.controller.confirmLeave(); await h.settle(); assert.deepEqual(h.actions, []); assert.deepEqual(h.calls, []);
  assert.equal(h.listeners.filter(item => item.name === 'popstate' && item.capture).length, 1);
  h.request('fresh'); h.controller.confirmLeave(); assert.deepEqual(h.actions, ['fresh']);
});

test('ignored compensation retries are bounded and a later user attempt can recover', async t => {
  const h = fixture(t, { ignoreGo: 3 }); h.back(); await h.settle();
  await h.advance(100); await h.advance(200); await h.advance(300);
  assert.equal(h.calls.length, 3); assert.equal(h.routerIndex, 2);
  await h.advance(10000); assert.equal(h.calls.length, 3);
  h.back(); await h.settle(); assert.equal(h.index, 2); assert.equal(h.routerIndex, 2); h.controller.cancelLeave();
});

test('actual MotionNavigation routes push, replace and go through the guard and preserves unguarded calls', t => {
  const h = fixture(t), navigationContext = React.createContext(null), immediateContext = React.createContext(null);
  const called = [], location = { pathname: '/profile/edit', search: '', hash: '' };
  const original = { createHref: to => typeof to === 'string' ? to : to.pathname, push: (...args) => called.push(['push', ...args]), replace: (...args) => called.push(['replace', ...args]), go: delta => called.push(['go', delta]) };
  const context = { navigator: original };
  const react = { ...React, useContext: target => target === navigationContext ? context : null, useRef: value => ({ current: value }), useLayoutEffect: () => undefined, useMemo: compute => compute() };
  const { MotionNavigation } = sourceModule('src/presentation/motion/MotionNavigation.tsx', {
    react, 'react-dom': { flushSync: action => action() }, 'framer-motion': { MotionConfig: 'motion', useReducedMotion: () => false },
    'react-router-dom': { UNSAFE_NavigationContext: navigationContext, useLocation: () => location },
    './ImageMotion': { ImageMotion: 'image-motion' }, './motion': { motionUpdate: action => action(), interruptNavigationMotion() {}, motionMs: () => 200, motionSeconds: () => .2, motionCurve: () => 'linear' },
    '../../features/sharing/shareModel': { handleFromPath: () => null }, '../../features/publishing/mobileAuthoringHistory': { replaceMobileAuthoringDestination: () => false },
    '../../features/profile/profileLeaveGuard': api, './navigationContext': { ImmediateNavigationContext: immediateContext },
  }, { window: { location: { href: h.browser.location.href }, setTimeout: h.browser.setTimeout, clearTimeout: h.browser.clearTimeout, addEventListener() {}, removeEventListener() {} }, document: { documentElement: { dataset: {} }, dispatchEvent() {} }, Event: class {} });
  const routed = MotionNavigation({ children: null }), tree = routed.type(routed.props);
  const decorated = tree.props.children.props.value.navigator;
  for (const [name, args] of [['push', ['/messages', { draft: 'state' }, { preventScrollReset: true }]], ['replace', ['/search?q=x', { exact: true }]], ['go', [-1]]]) {
    h.update({ enabled: true }); decorated[name](...args); assert.equal(called.length, 0);
    h.controller.cancelLeave(); decorated[name](...args); h.controller.confirmLeave();
    assert.deepEqual(called.pop(), [name, ...args]); h.update({ enabled: false });
  }
  decorated.push('/ordinary'); assert.deepEqual(called, [['push', '/ordinary']]);
});
