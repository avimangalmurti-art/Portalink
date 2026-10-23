import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function mount({ delayedAnchor = false, active: initialActive = true } = {}) {
  let active = initialActive, cursor = 0, dirty = false, portal = null, nextFrame = 0, unmounted = false;
  const slots = [], pending = [], frames = new Map(), observers = [], writes = [];
  const styles = new Map(), attributes = new Set();
  const events = () => {
    const listeners = new Map();
    return {
      addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
      dispatch(type) { for (const listener of [...(listeners.get(type) ?? [])]) listener(); },
      count(type) { return listeners.get(type)?.size ?? 0; },
    };
  };
  const document = { ...events(), fullscreenElement: null, body: { name: 'body' }, querySelector: () => appHost };
  const window = events(), appHost = { name: 'app' }, fullscreenHost = { name: 'fullscreen' };
  const overlay = {
    style: {
      setProperty(key, value) { styles.set(key, value); writes.push([key, value]); },
      removeProperty(key) { styles.delete(key); writes.push([key, null]); },
    },
    toggleAttribute(name, enabled) { if (enabled) attributes.add(name); else attributes.delete(name); },
  };
  const header = { bottom: 108, getBoundingClientRect() { return { bottom: this.bottom }; } };
  const anchor = { closest: () => ({ querySelector: () => header }) };
  const anchorRef = { current: delayedAnchor ? null : anchor };
  const child = React.createElement('span', { id: 'project-choice' }, 'Project');
  const hook = initialize => { const index = cursor++; return slots[index] ??= initialize(); };
  const schedule = (effect, deps, phase) => {
    const slot = hook(() => ({ deps: null, cleanup: undefined }));
    if (slot.deps && deps && deps.length === slot.deps.length && deps.every((value, index) => Object.is(value, slot.deps[index]))) return;
    pending.push({ slot, effect, deps, phase });
  };
  const attachRefs = (node, target) => {
    if (!React.isValidElement(node)) return;
    if (typeof node.ref === 'function') node.ref(target);
    else if (node.ref) node.ref.current = target;
    React.Children.toArray(node.props.children).forEach(child => attachRefs(child, target));
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobileProjectIndexPortal.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, {
    exports, document, window,
    require(name) {
      if (name === 'react') return { ...React,
        useEffect: (effect, deps) => schedule(effect, deps, 'passive'),
        useLayoutEffect: (effect, deps) => schedule(effect, deps, 'layout'),
        useRef: initial => hook(() => ({ current: initial })),
        useState(initial) {
          const slot = hook(() => ({ value: typeof initial === 'function' ? initial() : initial }));
          return [slot.value, next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } }];
        },
      };
      if (name === 'react-dom') return { createPortal: (node, host) => ({ node, host }) };
      if (name.endsWith('/MobileBackNavigation')) return { useMobileScreenActive: () => active };
      throw new Error(name);
    },
    getComputedStyle: () => ({ getPropertyValue: key => key.endsWith('bottom') ? '80px' : key.endsWith('height') ? '510px' : '0px' }),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.targets = new Set(); this.disconnected = false; observers.push(this); }
      observe(node) { this.targets.add(node); }
      disconnect() { this.targets.clear(); this.disconnected = true; }
    },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  function render() {
    assert.equal(unmounted, false);
    let commits = 0;
    do {
      assert.ok(++commits < 10, 'The actual component must settle its host update');
      dirty = false; cursor = 0;
      const next = exports.MobileProjectIndexPortal({ anchorRef, children: child });
      attachRefs(portal?.node, null);
      portal = next;
      attachRefs(portal?.node, overlay);
      for (const phase of ['layout', 'passive']) {
        const effects = pending.splice(0).sort((a, b) => (a.phase === phase ? -1 : 1) - (b.phase === phase ? -1 : 1));
        for (const entry of effects) {
          if (entry.phase !== phase) { pending.push(entry); continue; }
          entry.slot.cleanup?.();
          entry.slot.deps = entry.deps;
          entry.slot.cleanup = entry.effect();
        }
      }
    } while (dirty);
    return portal;
  }
  render();
  return {
    styles, header, attributes, document, window, appHost, fullscreenHost, writes,
    get portal() { return portal; },
    get pendingFrames() { return frames.size; },
    get activeObservers() { return observers.filter(observer => !observer.disconnected); },
    get observerTarget() { return [...observers.at(-1)?.targets ?? []][0]; },
    attach() { anchorRef.current = anchor; this.flushFrames(); },
    flushFrames() { const ready = [...frames.values()]; frames.clear(); ready.forEach(callback => callback()); if (dirty) render(); },
    updateHeader() { observers.filter(observer => !observer.disconnected).forEach(observer => observer.callback([])); if (dirty) render(); },
    setActive(value) { active = value; render(); },
    dispatchFullscreen(value) { document.fullscreenElement = value; document.dispatch('fullscreenchange'); if (dirty) render(); },
    get lastObserverCallback() { return observers.at(-1)?.callback; },
    cleanup() {
      attachRefs(portal?.node, null); portal = null;
      for (const slot of slots) slot.cleanup?.();
      unmounted = true;
    },
    get cleanedUp() { return observers.every(observer => observer.disconnected) && frames.size === 0 && window.count('resize') === 0 && document.count('fullscreenchange') === 0; },
  };
}

test('fresh portal entry measures the header and dock after the parent ref attaches', () => {
  const h = mount({ delayedAnchor: true });
  assert.equal(h.styles.size, 0);
  h.attach();
  assert.equal(h.styles.get('--mobile-content-safe-bottom'), '80px');
  assert.equal(h.styles.get('--mobile-project-panel-top'), '120px');
  assert.equal(h.observerTarget, h.header);
  h.cleanup();
  assert.equal(h.cleanedUp, true);
});

test('profile options expansion moves the floating panel below the new header height', () => {
  const h = mount();
  assert.equal(h.styles.get('--mobile-project-panel-top'), '120px');
  h.header.bottom = 220;
  h.updateHeader();
  assert.equal(h.styles.get('--mobile-project-panel-top'), '232px');
  h.header.bottom = 0;
  h.updateHeader();
  assert.equal(h.styles.has('--mobile-project-panel-top'), false);
  h.cleanup();
  assert.equal(h.cleanedUp, true);
});

test('a retained inactive chooser creates no portal or active viewport effects', () => {
  const h = mount({ active: false });
  assert.equal(h.portal, null, 'An inactive chooser must not escape its inert screen through a portal');
  assert.equal(h.activeObservers.length, 0);
  assert.equal(h.pendingFrames, 0);
  assert.equal(h.window.count('resize'), 0);
  assert.equal(h.document.count('fullscreenchange'), 0);
  assert.equal(h.writes.length, 0);
  h.cleanup();
  assert.equal(h.cleanedUp, true);
});

test('leaving the chooser removes its portal and cancels inset work until Back reactivates it', () => {
  const h = mount();
  assert.ok(h.portal);
  const child = h.portal.node.props.children.props.children;
  const queuedObserver = h.lastObserverCallback;
  assert.equal(h.pendingFrames, 1);
  h.setActive(false);
  assert.equal(h.portal, null);
  assert.equal(h.cleanedUp, true, 'Deactivation must release observers, RAF, resize and fullscreen listeners');
  const writes = h.writes.length;
  h.header.bottom = 300;
  queuedObserver([]);
  h.window.dispatch('resize');
  h.flushFrames();
  assert.equal(h.writes.length, writes, 'Already queued inset work must not mutate an inactive chooser');
  h.setActive(true);
  assert.ok(h.portal);
  assert.equal(h.portal.node.props.children.props.children, child, 'Back uses the existing caller selection, not reconstructed content');
  assert.equal(h.styles.get('--mobile-project-panel-top'), '312px');
  assert.equal(h.activeObservers.length, 1);
  assert.equal(h.window.count('resize'), 1);
  assert.equal(h.document.count('fullscreenchange'), 1);
  h.flushFrames();
  h.cleanup();
  assert.equal(h.cleanedUp, true);
});

test('reactivation resolves the current fullscreen host and leaves no duplicate subscriptions', () => {
  const h = mount();
  assert.equal(h.portal.host, h.appHost);
  h.dispatchFullscreen(h.fullscreenHost);
  assert.equal(h.portal.host, h.fullscreenHost);
  assert.equal(h.activeObservers.length, 1);
  h.setActive(false);
  assert.equal(h.cleanedUp, true);
  h.dispatchFullscreen(null);
  assert.equal(h.portal, null);
  h.setActive(true);
  assert.equal(h.portal.host, h.appHost, 'A fullscreen change while retained must not restore into the stale host');
  assert.equal(h.activeObservers.length, 1);
  assert.equal(h.window.count('resize'), 1);
  assert.equal(h.document.count('fullscreenchange'), 1);
  h.cleanup();
  assert.equal(h.cleanedUp, true);
});
