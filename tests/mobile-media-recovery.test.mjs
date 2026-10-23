import assert from 'node:assert/strict';
import test from 'node:test';
import { hookHarness } from './helpers/hook-harness.mjs';

function events() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type, detail = {}) { for (const callback of [...listeners.get(type) ?? []]) callback({ type, ...detail }); },
    snapshot() { return [...listeners].flatMap(([type, handlers]) => [...handlers].map(callback => ({ type, callback }))); },
    count() { return [...listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0); },
  };
}

function element({ left = 0, top = 0, width = 400, height = 600, parent = null, style = {}, blocked = false } = {}) {
  const node = { parentElement: parent, isConnected: true, blocked, clientLeft: 0, clientTop: 0,
    clientWidth: width, clientHeight: height,
    style: { display: 'block', visibility: 'visible', overflowX: 'visible', overflowY: 'visible', ...style },
    bounds: { left, top, width, height },
    getBoundingClientRect() { const r = this.bounds; return { ...r, right: r.left + r.width, bottom: r.top + r.height }; },
    closest(selector) { assert.equal(selector, '[inert], [aria-hidden="true"]'); for (let n = this; n; n = n.parentElement) if (n.blocked) return n; return null; },
  };
  return node;
}

function fixture({ presentation = 'mobile', active = true, online = true, visible = true, observer = true,
  host = element(), identity = 'project:one:page:1', ...initialOptions } = {}) {
  const window = events(), document = events(), navigator = { onLine: online };
  const calls = [], timers = new Map(), observers = [];
  let timerId = 0, mode = presentation, screenActive = active;
  const viewport = Object.assign(events(), { offsetLeft: 0, offsetTop: 0, width: 420, height: 912 });
  Object.assign(window, { innerWidth: 420, innerHeight: 912, visualViewport: viewport,
    getComputedStyle: node => node.style,
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; }, clearTimeout(id) { timers.delete(id); },
  });
  Object.assign(document, { visibilityState: visible ? 'visible' : 'hidden', modal: false,
    querySelector(selector) { assert.equal(selector, '[aria-modal="true"]'); return this.modal ? {} : null; },
  });
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; this.disconnected = false; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
    emit() { this.callback([{ target: this.target, isIntersecting: true }]); }
  }
  const hostRef = { current: host };
  let options = { hostRef, identity, failed: true, loading: false, onRetry: () => calls.push('retry'), ...initialOptions };
  const h = hookHarness(new URL('../src/components/media/useMobileMediaRecovery.ts', import.meta.url), 'useMobileMediaRecovery', {}, {}, options, undefined, {
    '../../presentation/usePresentation': { usePresentation: () => mode },
    '../../presentation/mobile/MobileBackNavigation': { useMobileScreenActive: () => screenActive },
  }, { window, document, navigator, ...(observer ? { IntersectionObserver: Observer } : {}) });
  const settle = async () => {
    for (let count = 0; count < 20; count++) {
      await h.flush();
      if (!timers.size) return;
      const due = [...timers]; timers.clear();
      for (const [, callback] of due) callback();
    }
    assert.fail('Recovery must not poll or repeat retries without a new lifecycle event');
  };
  return { h, window, document, navigator, viewport, hostRef, host, calls, timers, observers, settle,
    async render(changes = {}) {
      const { presentation: nextMode, active: nextActive, ...next } = changes;
      if (nextMode !== undefined) mode = nextMode;
      if (nextActive !== undefined) screenActive = nextActive;
      options = { ...options, ...next }; h.options(options); await settle();
    },
    async online(value) { navigator.onLine = value; window.emit(value ? 'online' : 'offline'); await settle(); },
    async visible(value) { document.visibilityState = value ? 'visible' : 'hidden'; document.emit('visibilitychange'); await settle(); },
    async pageshow(persisted = true) { window.emit('pageshow', { persisted }); await settle(); },
    async scroll() { window.emit('scroll'); await settle(); },
    dispose() { h.dispose(); },
  };
}

test('a failed page does not retry on mount, ordinary rerenders or an initial pageshow', async () => {
  const f = fixture(); await f.settle(); await f.render(); await f.pageshow(false); await f.settle();
  assert.deepEqual(f.calls, []); f.dispose();
});

test('WEB attaches no recovery listeners and lifecycle events do not change reads', async () => {
  const f = fixture({ presentation: 'web', online: false }); await f.settle();
  assert.equal(f.window.count() + f.document.count() + f.viewport.count(), 0);
  await f.online(true); await f.visible(false); await f.visible(true); await f.pageshow();
  assert.deepEqual(f.calls, []); f.dispose();
});

test('inactive and disabled mobile pages attach no recovery listeners', async () => {
  for (const state of [{ active: false }, { enabled: false }]) {
    const f = fixture({ online: false, ...state }); await f.settle();
    assert.equal(f.window.count() + f.document.count(), 0);
    await f.online(true); await f.pageshow(); assert.deepEqual(f.calls, []); f.dispose();
  }
});

test('reconnecting retries one failed visible media read', async () => {
  const f = fixture({ online: false }); await f.settle(); await f.online(true);
  assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('hidden to visible retries, while an already visible event is not a return', async () => {
  const f = fixture(); await f.settle(); await f.visible(true); assert.deepEqual(f.calls, []);
  await f.visible(false); await f.visible(true); assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('a persisted pageshow retries once until a new away cycle', async () => {
  const f = fixture(); await f.settle(); await f.pageshow(); await f.pageshow(); await f.render();
  assert.deepEqual(f.calls, ['retry']);
  f.window.emit('pagehide'); await f.pageshow(); assert.deepEqual(f.calls, ['retry', 'retry']); f.dispose();
});

test('Safari reconnect, foreground and pageshow bursts coalesce before React marks a request busy', async () => {
  const f = fixture({ visible: false, online: false }); await f.settle();
  f.navigator.onLine = true; f.document.visibilityState = 'visible';
  f.window.emit('online'); f.document.emit('visibilitychange'); f.window.emit('pageshow', { persisted: true });
  await f.settle(); assert.deepEqual(f.calls, ['retry']);
  await f.render({ loading: true }); await f.pageshow(); f.window.emit('online'); await f.settle();
  assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('healthy pages never refetch and consume their event instead of saving it for a later failure', async () => {
  const f = fixture({ online: false, failed: false }); await f.settle(); await f.online(true);
  await f.visible(false); await f.visible(true); await f.pageshow(); await f.render({ failed: true });
  assert.deepEqual(f.calls, []);
  await f.online(false); await f.online(true); assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('a return during a pending read waits for settlement and recovers only a failure', async () => {
  for (const failed of [true, false]) {
    const f = fixture({ online: false, loading: true, failed: false }); await f.settle(); await f.online(true);
    assert.deepEqual(f.calls, []);
    await f.render({ loading: false, failed }); assert.deepEqual(f.calls, failed ? ['retry'] : []);
    await f.render({ failed: true }); await f.settle(); assert.deepEqual(f.calls, failed ? ['retry'] : []); f.dispose();
  }
});

test('an automatic attempt that fails again never loops on rerender, scroll or observer events', async () => {
  const f = fixture({ online: false }); await f.settle(); await f.online(true);
  await f.render({ loading: true }); await f.render({ loading: false, failed: true });
  await f.render(); await f.scroll(); await f.pageshow(); await f.settle();
  assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('a failed offscreen page keeps one intent until it approaches within 120px', async () => {
  const host = element({ top: 1300 });
  const f = fixture({ online: false, host }); await f.settle(); await f.online(true);
  assert.deepEqual(f.calls, []); assert.equal(f.observers.length, 1);
  assert.equal(f.observers[0].options.rootMargin, '120px');
  await f.scroll(); assert.deepEqual(f.calls, []);
  host.bounds.top = 1020; await f.scroll(); assert.deepEqual(f.calls, ['retry']);
  assert.equal(f.observers[0].disconnected, true); assert.equal(f.viewport.count(), 0); f.dispose();
});

test('an observer can recover a newly visible page after layout changes without a scroll', async () => {
  const f = fixture({ online: false, host: element({ top: 1500 }) }); await f.settle(); await f.online(true);
  f.host.bounds.top = 300; f.observers[0].emit(); await f.settle();
  assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('captured nested scroll and resize remain usable when IntersectionObserver is unavailable', async () => {
  const f = fixture({ online: false, observer: false, host: element({ top: 1600 }) }); await f.settle(); await f.online(true);
  assert.deepEqual(f.calls, []); f.host.bounds.top = 400;
  f.window.emit('resize'); await f.settle(); assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('a page inside the window but far beyond its clipping scroll ancestor does not load', async () => {
  const parent = element({ top: 100, height: 150, style: { overflowY: 'auto' } });
  const host = element({ top: 500, height: 100, parent });
  const f = fixture({ online: false, host }); await f.settle(); await f.online(true);
  assert.deepEqual(f.calls, []);
  host.bounds.top = 350; await f.scroll(); assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('horizontal clipping and an entirely offscreen clipping ancestor also prevent reads', async () => {
  const parent = element({ top: 100, width: 100, height: 600, style: { overflowX: 'hidden' } });
  const f = fixture({ online: false, host: element({ left: 300, top: 100, width: 80, parent }) });
  await f.settle(); await f.online(true); assert.deepEqual(f.calls, []); f.dispose();
  const outside = element({ top: 2000, height: 300, style: { overflowY: 'scroll' } });
  const second = fixture({ online: false, host: element({ top: 500, parent: outside }) });
  await second.settle(); await second.online(true); assert.deepEqual(second.calls, []); second.dispose();
});

test('visual viewport dimensions and offsets govern proximity while mobile browser chrome changes', async () => {
  const f = fixture({ online: false, host: element({ top: 850, height: 100 }) });
  f.viewport.offsetTop = 100; f.viewport.height = 500;
  await f.settle(); await f.online(true); assert.deepEqual(f.calls, []);
  f.viewport.height = 700; f.viewport.emit('resize'); await f.settle(); assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('modal, inert and aria-hidden surroundings block and discard recovery intent', async () => {
  for (const block of ['modal', 'host', 'ancestor']) {
    const parent = element(); const f = fixture({ online: false, host: element({ parent }) });
    await f.settle();
    if (block === 'modal') f.document.modal = true;
    if (block === 'host') f.host.blocked = true;
    if (block === 'ancestor') parent.blocked = true;
    await f.online(true); assert.deepEqual(f.calls, [], block);
    f.document.modal = false; f.host.blocked = false; parent.blocked = false;
    await f.scroll(); await f.render(); assert.deepEqual(f.calls, [], 'Uncovering does not resurrect discarded work');
    await f.online(false); await f.online(true); assert.deepEqual(f.calls, ['retry']); f.dispose();
  }
});

test('zero-sized and CSS-hidden media cannot recover until genuinely rendered near the viewport', async () => {
  for (const hidden of ['size', 'display', 'visibility']) {
    const f = fixture({ online: false });
    if (hidden === 'size') f.host.bounds.height = 0;
    if (hidden === 'display') f.host.style.display = 'none';
    if (hidden === 'visibility') f.host.style.visibility = 'hidden';
    await f.settle(); await f.online(true); assert.deepEqual(f.calls, [], hidden);
    f.host.bounds.height = 600; f.host.style.display = 'block'; f.host.style.visibility = 'visible';
    await f.scroll(); assert.deepEqual(f.calls, ['retry']); f.dispose();
  }
});

test('hidden or offline pages never recover from the other lifecycle signal', async () => {
  const hidden = fixture({ visible: false, online: false }); await hidden.settle(); await hidden.online(true); await hidden.pageshow();
  assert.deepEqual(hidden.calls, []); hidden.dispose();
  const offline = fixture({ online: false }); await offline.settle(); await offline.visible(false); await offline.visible(true); await offline.pageshow();
  assert.deepEqual(offline.calls, []); offline.dispose();
});

test('same-identity screen return recovers but arrival at a new source or identity does not', async () => {
  const f = fixture(); await f.settle(); await f.render({ active: false }); await f.render({ active: true });
  assert.deepEqual(f.calls, ['retry']);
  await f.render({ active: false }); await f.render({ active: true, identity: 'project:two:page:1' });
  assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('near-page or other eligibility toggles do not invent a screen return or retry an initial failure', async () => {
  const f = fixture({ enabled: false, loading: true, failed: false }); await f.settle();
  await f.render({ enabled: true }); await f.render({ loading: false, failed: true });
  assert.deepEqual(f.calls, [], 'The first eligible load can fail without a synthetic return retry');
  await f.render({ enabled: false }); await f.render({ enabled: true });
  assert.deepEqual(f.calls, [], 'Scrolling back near a page does not grant another lifecycle attempt');
  await f.visible(false); await f.visible(true); assert.deepEqual(f.calls, ['retry']); f.dispose();
});

test('a return while ineligible does not save an intent for a later eligibility change', async () => {
  const f = fixture({ enabled: false }); await f.settle();
  await f.render({ active: false }); await f.render({ active: true }); await f.render({ enabled: true });
  assert.deepEqual(f.calls, []); f.dispose();
});

test('changing presentation alone is not a retained mobile-screen return', async () => {
  const f = fixture({ presentation: 'web' }); await f.settle();
  await f.render({ presentation: 'mobile' }); assert.deepEqual(f.calls, []);
  await f.render({ presentation: 'web' }); await f.render({ active: false });
  await f.render({ presentation: 'mobile', active: true }); assert.deepEqual(f.calls, []); f.dispose();
});

test('manual Retry cancels queued loading or offscreen recovery through a stable callback', async () => {
  for (const pending of ['loading', 'offscreen']) {
    const f = fixture({ online: false, loading: pending === 'loading', host: element({ top: pending === 'offscreen' ? 1600 : 0 }) });
    await f.settle(); const cancel = f.h.value; await f.online(true); cancel(); f.calls.push('manual');
    f.host.bounds.top = 0; await f.render({ loading: false }); await f.scroll();
    assert.equal(f.h.value, cancel); assert.deepEqual(f.calls, ['manual']); f.dispose();
  }
});

test('manual Retry wins before a queued browser task and cancels selected observer callbacks', async () => {
  const f = fixture({ online: false }); await f.settle(); f.navigator.onLine = true; f.window.emit('online');
  f.h.value(); f.calls.push('manual'); await f.settle(); assert.deepEqual(f.calls, ['manual']); f.dispose();
  const offscreen = fixture({ online: false, host: element({ top: 1600 }) }); await offscreen.settle(); await offscreen.online(true);
  const callback = offscreen.observers[0]; offscreen.h.value(); offscreen.host.bounds.top = 0;
  callback.emit(); await offscreen.settle(); assert.deepEqual(offscreen.calls, []); offscreen.dispose();
});

test('identity changes cancel queued tasks and stale callbacks cannot reach a replacement source', async () => {
  const f = fixture({ online: false }); await f.settle(); const stale = [...f.window.snapshot(), ...f.document.snapshot()];
  f.navigator.onLine = true; f.window.emit('online'); await f.render({ identity: 'replacement', onRetry: () => f.calls.push('new') });
  for (const { type, callback } of stale) callback({ type, persisted: true });
  await f.settle(); assert.deepEqual(f.calls, []);
  await f.online(false); await f.online(true); assert.deepEqual(f.calls, ['new']); f.dispose();
});

test('pending work uses the latest callback within the same identity', async () => {
  const f = fixture({ online: false, loading: true }); await f.settle(); await f.online(true);
  await f.render({ onRetry: () => f.calls.push('latest'), loading: false });
  assert.deepEqual(f.calls, ['latest']); f.dispose();
});

test('going away clears queued offscreen and loading work before it could settle', async () => {
  for (const away of ['hidden', 'offline', 'inactive', 'disabled', 'web']) {
    const f = fixture({ online: false, loading: true, host: element({ top: 1600 }) }); await f.settle(); await f.online(true);
    if (away === 'hidden') await f.visible(false);
    if (away === 'offline') await f.online(false);
    if (away === 'inactive') await f.render({ active: false });
    if (away === 'disabled') await f.render({ enabled: false });
    if (away === 'web') await f.render({ presentation: 'web' });
    f.host.bounds.top = 0; await f.render({ loading: false }); await f.scroll(); assert.deepEqual(f.calls, [], away); f.dispose();
  }
});

test('disconnecting a host discards intent and cannot retry an element that reappears later', async () => {
  const f = fixture({ online: false }); await f.settle(); f.host.isConnected = false; await f.online(true);
  f.host.isConnected = true; await f.render(); await f.scroll(); assert.deepEqual(f.calls, []); f.dispose();
});

test('unmount removes lifecycle and pending visibility watchers; stale callbacks cannot retry', async () => {
  const f = fixture({ online: false, host: element({ top: 1600 }) }); await f.settle(); await f.online(true);
  const stale = [...f.window.snapshot(), ...f.document.snapshot(), ...f.viewport.snapshot()]; const observer = f.observers[0];
  f.dispose(); assert.equal(f.window.count() + f.document.count() + f.viewport.count(), 0); assert.equal(observer.disconnected, true);
  f.host.bounds.top = 0; for (const { type, callback } of stale) callback({ type, persisted: true }); observer.emit();
  await f.settle(); assert.deepEqual(f.calls, []);
});

test('remount owns one listener set without replaying an old return', async () => {
  const f = fixture({ online: false }); await f.settle(); const count = f.window.count() + f.document.count();
  f.h.remount(); await f.settle(); assert.equal(f.window.count() + f.document.count(), count);
  assert.deepEqual(f.calls, []); await f.online(true); assert.deepEqual(f.calls, ['retry']); f.dispose();
});
