import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, ...globals, require: (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}
const anchored = load('../src/utils/anchoredMenu.ts');
const positions = load('../src/features/media-interactions/mediaCommentsPosition.ts', { '../../utils/anchoredMenu': anchored });
const position = positions.positionMediaComments;

test('comments retain reading width above a small page toolbar', () => {
  const result = position({ left: 500, top: 430, bottom: 458 }, 180, { width: 1056, height: 698 });
  assert.equal(result.width, 320);
  assert.equal(result.left, 500);
  assert.equal(result.top, 244);
});

test('comments flip below a toolbar near the top and shift left at the right edge', () => {
  const result = position({ left: 980, top: 30, bottom: 58 }, 240, { width: 1056, height: 698 });
  assert.equal(result.top, 64);
  assert.equal(result.left + result.width, 1048);
});

test('narrow, short and keyboard-offset viewports contain the entire visible popup', () => {
  for (const viewport of [
    { width: 240, height: 600 },
    { width: 390, height: 230, offsetTop: 180 },
    { width: 180, height: 140, offsetLeft: 170, offsetTop: 260 },
  ]) {
    for (const height of [100, 320, 900]) {
      const result = position({ left: 1020, top: 610, bottom: 632 }, height, viewport);
      const x = viewport.offsetLeft ?? 0, y = viewport.offsetTop ?? 0;
      assert.ok(result.left >= x + 8);
      assert.ok(result.top >= y + 8);
      assert.ok(result.left + result.width <= x + viewport.width - 8);
      assert.ok(result.top + Math.min(height, result.maxHeight) <= y + viewport.height - 8);
    }
  }
});

test('pinched visual viewport offsets preserve the anchor position', () => {
  const viewport = { width: 600, height: 400, offsetLeft: 160, offsetTop: 220 };
  const result = position({ left: 200, top: 500, bottom: 528 }, 150, viewport);
  assert.equal(result.left, 200);
  assert.equal(result.top, 344);
});

function events(object = {}) {
  const listeners = new Map();
  return Object.assign(object, {
    addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
    emit(name, event) { for (const handler of [...listeners.get(name) ?? []]) handler(event); },
    listenerCount() { return [...listeners.values()].reduce((sum, items) => sum + items.size, 0); },
  });
}

function harness(fullscreen = false, mode = 'web', children = 'Comments content') {
  const attributes = new Map(), viewportStyles = new Map(), modalCalls = [];
  const shell = { setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) }, presentation = {};
  const document = events({ fullscreenElement: fullscreen ? presentation : null, body: {}, querySelector: () => shell });
  const viewport = events({ width: 1056, height: 698, offsetLeft: 0, offsetTop: 0 });
  const window = events({ visualViewport: viewport, innerWidth: 1056, innerHeight: 698 });
  const effects = [], layouts = [], frames = new Map(), states = [], observers = [];
  let rect = { left: 680, top: 430, bottom: 450 }, focused = 0, closed = 0, sequence = 0, visibility;
  const anchor = { getBoundingClientRect: () => rect, closest: () => shell };
  const trigger = { contains: (target) => target === trigger, focus: () => focused++ };
  const panel = { style: {}, scrollHeight: 180, children: [{}], contains: (target) => target === panel };
  const react = { ...React,
    useRef: () => ({ current: panel }),
    useState(initial) { const slot = states.length; states.push(typeof initial === 'function' ? initial() : initial); return [states[slot], (next) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }]; },
    useEffect: (fn) => effects.push(fn), useLayoutEffect: (fn) => layouts.push(fn),
    useCallback: (fn) => fn,
  };
  const { MediaCommentsPopover } = load('../src/features/media-interactions/MediaCommentsPopover.tsx', {
    react, 'react-dom': { createPortal: (node, host) => ({ node, host }) }, './mediaCommentsPosition': positions,
    '../../presentation/usePresentation': { usePresentation: () => mode },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: { style: { setProperty: (key, value) => viewportStyles.set(key, value) } } }) },
    '../../hooks/useModalFocus': { useModalFocus: (...args) => modalCalls.push(args) },
    '../../presentation/motion/useSheetMotion': { useSheetMotion: () => assert.fail('WEB must not start the MOBILE sheet lifecycle') },
    '../../presentation/motion/motion': { reducedMotion: () => false },
    './media-comments-motion.css': {},
  }, {
    document, window,
    requestAnimationFrame: (fn) => { frames.set(++sequence, fn); return sequence; },
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class { constructor(fn) { this.update = fn; this.observed = []; observers.push(this); } observe(node) { this.observed.push(node); } disconnect() { this.observed = []; } },
    IntersectionObserver: class { constructor(fn) { visibility = fn; } observe() {} disconnect() {} },
  });
  const closeCallback = () => closed++;
  const selected = MediaCommentsPopover({ id: 'comments-1', label: 'Comments for Page 1', anchorRef: { current: anchor }, triggerRef: { current: trigger }, onClose: closeCallback, children });
  const portal = selected.type(selected.props);
  const rendered = mode === 'mobile' ? { ...portal, scope: portal.node.props['data-presentation'], node: portal.node.props.children } : portal;
  const cleanups = [...layouts, ...effects].map((fn) => fn());
  return { ...rendered, document, window, viewport, shell, presentation, panel, trigger, states, observers, attributes, viewportStyles, modalCalls, closeCallback,
    get focused() { return focused; }, get closed() { return closed; },
    move(next) { rect = next; window.emit('scroll', {}); for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } },
    hideAnchor() { visibility?.([{ isIntersecting: false }]); },
    cleanup() { cleanups.forEach((fn) => fn?.()); },
  };
}

test('the popup escapes media clipping into the themed shell or fullscreen element', () => {
  for (const fullscreen of [false, true]) {
    const env = harness(fullscreen);
    assert.equal(env.host, fullscreen ? env.presentation : env.shell);
    assert.equal(env.node.props['data-media-interaction'], '');
    assert.equal(env.panel.style.width, '320px');
    env.document.fullscreenElement = fullscreen ? null : env.presentation;
    env.document.emit('fullscreenchange', {});
    assert.equal(env.states[0], fullscreen ? env.shell : env.presentation);
    env.cleanup();
  }
});

/** Actual sheet and viewport/focus/motion hooks, with controlled commits and timer lifecycles. */
function mobileSheetFixture({ fullscreen = false, reduce = false, appReduce = false, mobileMotion = true, children, onClose } = {}) {
  const slots = [], timers = new Map(), listeners = new Map(), windowListeners = new Map(), viewportListeners = new Map(), dom = new Map(), calls = [];
  let cursor = 0, now = 0, timerId = 0, mounted = false, dirty = false, portal, layout = [], effects = [], document;
  const same = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const add = (map, name, callback) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(callback); };
  const remove = (map, name, callback) => { map.get(name)?.delete(callback); if (map.get(name)?.size === 0) map.delete(name); };
  const emit = (map, name, event) => { for (const callback of [...(map.get(name) ?? [])]) if (map.get(name)?.has(callback)) callback(event); flush(); };
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.props = {}; this.isConnected = true; this.inert = false; this.tabIndex = -1;
      this.style = { setProperty(name, value) { this[name] = value; }, getPropertyValue(name) { return this[name] ?? ''; } };
    }
    matches(selector) {
      if (selector === ':disabled') return Boolean(this.props.disabled);
      if (selector.startsWith('.')) return (this.props.className ?? '').split(' ').includes(selector.slice(1));
      const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
      return attribute ? Object.hasOwn(this.props, attribute[1]) && (attribute[2] === undefined || String(this.props[attribute[1]]) === attribute[2]) : false;
    }
    closest(selector) {
      for (let node = this; node; node = node.parentElement) {
        if (selector.includes('[hidden]') && (node.props.hidden || node.inert || node.props['aria-hidden'] === true || node.props['aria-hidden'] === 'true')) return node;
        if (selector.includes('[role="dialog"]') && node.props.role === 'dialog' && node.props['aria-modal'] === 'true') return node;
        if (node.matches(selector)) return node;
      }
      return null;
    }
    getClientRects() { return this.isConnected ? [{}] : []; }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    querySelectorAll(selector) {
      const items = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      return selector === '*' ? items : selector.startsWith('button:') ? items.filter(node => ['BUTTON', 'TEXTAREA', 'INPUT'].includes(node.tagName) || node.props.href || node.tabIndex >= 0) : items.filter(node => node.matches(selector));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    focus(options) { this.focusOptions = options; document.activeElement = this; emit(listeners, 'focusin', { target: this }); }
    setAttribute(name, value) { this.props[name] = value; }
    removeAttribute(name) { delete this.props[name]; }
  }
  const frame = new Element(), opener = new Element('button'), body = new Element('body'), fullscreenHost = new Element(), anchor = new Element();
  frame.props['data-presentation'] = 'mobile'; anchor.parentElement = frame;
  document = { body, documentElement: new Element('html'), activeElement: opener, fullscreenElement: fullscreen ? fullscreenHost : null,
    querySelector: selector => selector === '.app-shell' || (selector.includes('.reduce-motion') && appReduce) ? frame : null, querySelectorAll: () => [],
    addEventListener: (name, callback) => add(listeners, name, callback), removeEventListener: (name, callback) => remove(listeners, name, callback) };
  const viewport = { width: 420, height: 912, offsetLeft: 0, offsetTop: 0, addEventListener: (name, callback) => add(viewportListeners, name, callback), removeEventListener: (name, callback) => remove(viewportListeners, name, callback) };
  const window = { visualViewport: viewport, innerWidth: 420, innerHeight: 912, matchMedia: () => ({ matches: reduce }),
    addEventListener: (name, callback) => add(windowListeners, name, callback), removeEventListener: (name, callback) => remove(windowListeners, name, callback) };
  const globals = { document, window, HTMLElement: Element,
    getComputedStyle: element => ({ visibility: 'visible', transform: 'none', opacity: element.props?.className === 'mobile-media-comments-sheet' ? '0.55' : '0.43', getPropertyValue: name => ({ '--m-fast': '120ms', '--m-base': '180ms', '--m-slow': '260ms' }[name] ?? '') }),
    setTimeout(callback, duration) { const id = ++timerId; timers.set(id, { callback, due: now + duration, duration }); return id; }, clearTimeout: id => timers.delete(id),
    ResizeObserver: class { constructor() { assert.fail('MOBILE comments must not follow or observe the hidden toolbar'); } },
    IntersectionObserver: class { constructor() { assert.fail('MOBILE comments must not dismiss when the source toolbar is hidden'); } } };
  const effect = (queue, callback, dependencies) => { const index = cursor++, prior = slots[index]; if (!same(prior?.dependencies, dependencies)) { slots[index] = { dependencies }; queue.push(() => { prior?.cleanup?.(); if (mounted) slots[index].cleanup = callback(); }); } };
  const react = { ...React,
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(initial) { const index = cursor++, slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, next => { if (mounted) { slot.value = typeof next === 'function' ? next(slot.value) : next; dirty = true; } }]; },
    useCallback(callback, dependencies) { const index = cursor++; if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, callback }; return slots[index].callback; },
    useEffect(callback, dependencies) { effect(effects, callback, dependencies); }, useLayoutEffect(callback, dependencies) { effect(layout, callback, dependencies); } };
  const flushSync = callback => { callback(); flush(); };
  const motion = load('../src/presentation/motion/motion.ts', { 'react-dom': { flushSync }, '../../utils/projectContinuity': {} }, globals);
  const sheet = load('../src/presentation/motion/useSheetMotion.ts', { react, 'react-dom': { flushSync }, './motion': motion }, globals);
  const modal = load('../src/hooks/useModalFocus.ts', { react }, globals);
  const dialogViewport = load('../src/hooks/useDialogViewport.ts', { react }, globals);
  const { MediaCommentsPopover } = load('../src/features/media-interactions/MediaCommentsPopover.tsx', {
    react, 'react-dom': { createPortal: (node, host) => ({ node, host }) }, './mediaCommentsPosition': positions,
    '../../presentation/usePresentation': { usePresentation: () => 'mobile' }, '../../hooks/useDialogViewport': dialogViewport,
    '../../hooks/useModalFocus': modal, '../../presentation/motion/useSheetMotion': sheet, '../../presentation/motion/motion': motion,
    './media-comments-motion.css': {},
  }, globals);
  const props = { id: 'comments-1', label: 'Comments for Page 1', anchorRef: { current: anchor }, triggerRef: { current: opener }, mobileMotion,
    onClose: () => { calls.push('close'); onClose?.(); unmount(); },
    children: children ?? (dismiss => React.createElement('button', { 'data-comments-close': '', 'aria-label': 'Close comments', onClick: dismiss }, 'Close')) };
  function commit(node, parent = null, path = 'root') {
    if (!React.isValidElement(node)) return;
    let container = parent;
    if (typeof node.type === 'string') {
      container = dom.get(path) ?? new Element(node.type); dom.set(path, container); container.props = { ...node.props }; container.children = []; container.parentElement = parent; container.isConnected = true;
      container.tabIndex = node.props.tabIndex ?? (['button', 'textarea'].includes(node.type) ? 0 : -1); Object.assign(container.style, node.props.style);
      if (parent) parent.children.push(container);
      if (typeof node.ref === 'function') node.ref(container); else if (node.ref) node.ref.current = container;
    }
    React.Children.toArray(node.props.children).forEach((child, index) => commit(child, container, path + '.' + index));
  }
  function flush() {
    if (!mounted || !dirty) return;
    cursor = 0; dirty = false; layout = []; effects = []; const selected = MediaCommentsPopover(props); portal = selected.type(selected.props); commit(portal.node);
    layout.splice(0).forEach(callback => callback()); effects.splice(0).forEach(callback => callback()); if (dirty) flush();
  }
  function unmount() { if (!mounted) return; mounted = false; slots.forEach(slot => slot?.cleanup?.()); for (const element of dom.values()) element.isConnected = false; }
  function mount() { mounted = true; dirty = true; flush(); }
  mount();
  return { calls, frame, opener, fullscreenHost, document, window, viewport, listeners, windowListeners, viewportListeners, timers, modal,
    get tree() { flush(); return portal.node; }, get host() { return portal.host; }, get mounted() { return mounted; },
    dom: selector => [...dom.values()].find(element => element.matches(selector)),
    outside() { const overlay = descendants(portal.node).find(node => Object.hasOwn(node.props, 'data-mobile-media-comments')), target = this.dom('[data-mobile-media-comments]'); overlay.props.onPointerDown({ target, currentTarget: target, stopPropagation() {} }); flush(); },
    inside() { const overlay = descendants(portal.node).find(node => Object.hasOwn(node.props, 'data-mobile-media-comments')); overlay.props.onPointerDown({ target: this.dom('.mobile-media-comments-sheet'), currentTarget: this.dom('[data-mobile-media-comments]'), stopPropagation() {} }); flush(); },
    close() { descendants(portal.node).find(node => node.props['aria-label'] === 'Close comments').props.onClick(); flush(); },
    emit(name, input = {}) { emit(listeners, name, input); }, pop(input = {}) { emit(windowListeners, 'popstate', input); }, viewportEvent(name = 'resize') { emit(viewportListeners, name, {}); },
    advance(duration) { const end = now + duration; for (;;) { const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0]; if (!next) break; now = next[1].due; timers.delete(next[0]); next[1].callback(); flush(); } now = end; },
    unmount, reopen() { unmount(); slots.length = 0; dom.clear(); mount(); } };
}

test('mobile comments retain their keyboard viewport, native fullscreen host and isolated page gestures', () => {
  const h = mobileSheetFixture({ fullscreen: true }), overlay = h.dom('[data-mobile-media-comments]'), panel = h.dom('.mobile-media-comments-sheet');
  assert.equal(h.host, h.fullscreenHost); assert.equal(h.tree.props['data-presentation'], 'mobile');
  assert.equal(panel.props.role, 'dialog'); assert.equal(panel.props['aria-modal'], 'true');
  assert.equal(overlay.props.style.height, 'var(--dialog-viewport-height, 100dvh)'); assert.equal(h.frame.props['data-page-comments-open'], '');
  assert.equal(overlay.style['--dialog-viewport-height'], '912px'); assert.equal(h.document.activeElement, panel); assert.equal(panel.focusOptions.preventScroll, true);
  h.viewport.height = 390; h.viewport.offsetTop = 75; h.viewportEvent();
  assert.equal(overlay.style['--dialog-viewport-height'], '390px'); assert.equal(overlay.style['--dialog-viewport-top'], '75px'); assert.equal(overlay.style['--comments-bottom-inset'], '12px');
  h.viewport.height = 912; h.viewport.offsetTop = 0; h.viewportEvent('scroll');
  assert.equal(overlay.style['--comments-bottom-inset'], 'max(12px, env(safe-area-inset-bottom))');
  for (const name of ['onPointerUp', 'onClick', 'onDoubleClick', 'onWheel', 'onTouchMove', 'onKeyDown']) {
    const input = { stopPropagation() { this.stopped = true; } }; descendants(h.tree).find(node => Object.hasOwn(node.props, 'data-mobile-media-comments')).props[name](input); assert.equal(input.stopped, true, name);
  }
  h.inside(); assert.deepEqual(h.calls, []); assert.equal(h.timers.size, 0);
  h.unmount(); assert.equal(Object.hasOwn(h.frame.props, 'data-page-comments-open'), false); assert.equal(h.listeners.size, 0); assert.equal(h.windowListeners.size, 0); assert.equal(h.viewportListeners.size, 0);
});

test('mobile backdrop and Close retain only a 180ms decorative fade and release reader controls/focus immediately', () => {
  for (const dismiss of ['outside', 'close']) {
    const h = mobileSheetFixture(); h[dismiss]();
    assert.deepEqual(h.calls, []); assert.equal(h.mounted, true); assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0].duration, 180);
    assert.equal(Object.hasOwn(h.frame.props, 'data-page-comments-open'), false); assert.equal(h.document.activeElement, h.opener); assert.equal(h.opener.focusOptions.preventScroll, true);
    assert.equal(h.tree.props['aria-hidden'], true); assert.equal(h.dom('[data-presentation="mobile"]').inert, true); assert.equal(h.listeners.has('focusin'), false);
    assert.equal(h.dom('[data-mobile-media-comments]').style['--motion-exit-opacity'], '0.43', 'The parent fade starts from its currently painted mid-entrance opacity.');
    assert.equal(h.viewportListeners.size, 0, 'The decorative exit releases keyboard/viewport listeners.');
    const height = h.dom('[data-mobile-media-comments]').style['--dialog-viewport-height']; h.viewport.height = 300; h.viewportEvent(); assert.equal(h.dom('[data-mobile-media-comments]').style['--dialog-viewport-height'], height, 'The fading sheet cannot jump as the keyboard closes.');
    h[dismiss](); assert.equal(h.timers.size, 1, 'Repeated dismissal does not restart or duplicate completion.');
    h.advance(179); assert.deepEqual(h.calls, []); h.advance(1); assert.deepEqual(h.calls, ['close']); assert.equal(h.mounted, false);
    assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); assert.equal(h.windowListeners.size, 0); assert.equal(h.viewportListeners.size, 0);
  }
});

test('mobile viewport listeners release before focus restoration can synchronously collapse the keyboard', () => {
  const h = mobileSheetFixture(), overlay = h.dom('[data-mobile-media-comments]');
  h.viewport.height = 530; h.viewport.offsetTop = 30; h.viewportEvent();
  assert.equal(overlay.style['--dialog-viewport-height'], '530px'); assert.equal(overlay.style['--dialog-viewport-top'], '30px'); assert.equal(overlay.style['--comments-bottom-inset'], '12px');
  const originalFocus = h.opener.focus.bind(h.opener);
  h.opener.focus = options => {
    assert.equal(h.viewportListeners.size, 0, 'Viewport and inset subscriptions must be gone before focus dismisses the keyboard.');
    h.viewport.height = 912; h.viewport.offsetTop = 0; h.viewportEvent(); originalFocus(options);
  };
  h.close();
  assert.equal(h.document.activeElement, h.opener); assert.equal(h.opener.focusOptions.preventScroll, true); assert.equal(h.viewport.height, 912);
  assert.equal(overlay.style['--dialog-viewport-height'], '530px'); assert.equal(overlay.style['--dialog-viewport-top'], '30px'); assert.equal(overlay.style['--comments-bottom-inset'], '12px');
  h.advance(180); assert.deepEqual(h.calls, ['close']);
});

test('mobile next pointer or keyboard input completes the decorative fade once without consuming input', () => {
  for (const name of ['pointerdown', 'keydown']) {
    const h = mobileSheetFixture(); h.close(); const stale = [...h.timers.values()][0].callback;
    const input = { key: 'Tab', preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; h.emit(name, input);
    assert.deepEqual(h.calls, ['close']); assert.equal(input.prevented, undefined); assert.equal(input.stopped, undefined); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
    stale(); h.advance(180); assert.deepEqual(h.calls, ['close']);
  }
});

test('mobile Escape releases its real focus trap before the next Tab reaches the reader', () => {
  const h = mobileSheetFixture(), escape = { key: 'Escape', target: h.dom('.mobile-media-comments-sheet'), preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
  h.emit('keydown', escape); assert.equal(escape.defaultPrevented, true); assert.equal(escape.stopped, true); assert.deepEqual(h.calls, []);
  assert.equal(h.document.activeElement, h.opener); assert.equal(h.listeners.has('focusin'), false); assert.equal(Object.hasOwn(h.frame.props, 'data-page-comments-open'), false);
  const tab = { key: 'Tab', preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } }; h.emit('keydown', tab);
  assert.deepEqual(h.calls, ['close']); assert.equal(tab.defaultPrevented, undefined); assert.equal(tab.stopped, undefined); assert.equal(h.timers.size, 0);
});

test('mobile OS and app reduced motion complete dismissal immediately with no retained blocker or timer', () => {
  for (const options of [{ reduce: true }, { appReduce: true }]) {
    const h = mobileSheetFixture(options); assert.equal(h.tree.props['data-reduce-motion'], true); h.close();
    assert.deepEqual(h.calls, ['close']); assert.equal(h.mounted, false); assert.equal(h.document.activeElement, h.opener); assert.equal(h.opener.focusOptions.preventScroll, true);
    assert.equal(Object.hasOwn(h.frame.props, 'data-page-comments-open'), false); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); assert.equal(h.windowListeners.size, 0); assert.equal(h.viewportListeners.size, 0);
  }
});

test('mobile native Back and fullscreen host changes immediately finish open or fading sheets', () => {
  for (const cause of ['popstate', 'fullscreenchange']) for (const fading of [false, true]) {
    const h = mobileSheetFixture({ fullscreen: true }); if (fading) h.outside();
    const stale = [...h.timers.values()][0]?.callback, input = { preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    if (cause === 'popstate') h.pop(input); else { h.document.fullscreenElement = null; h.emit(cause, input); }
    assert.deepEqual(h.calls, ['close']); assert.equal(h.mounted, false); assert.equal(h.document.activeElement, h.opener); assert.equal(h.opener.focusOptions.preventScroll, true); assert.equal(Object.hasOwn(h.frame.props, 'data-page-comments-open'), false);
    assert.equal(input.prevented, undefined); assert.equal(input.stopped, undefined); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); assert.equal(h.windowListeners.size, 0); assert.equal(h.viewportListeners.size, 0);
    stale?.(); h.advance(180); assert.deepEqual(h.calls, ['close']);
  }
});

test('mobile unmount and reopen revoke the old fade timer without unlocking or closing the new composer', () => {
  const h = mobileSheetFixture(); h.outside(); const stale = [...h.timers.values()][0].callback; h.unmount();
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); assert.equal(h.windowListeners.size, 0); assert.equal(h.viewportListeners.size, 0);
  h.reopen(); stale(); assert.deepEqual(h.calls, []); assert.equal(h.mounted, true); assert.equal(h.frame.props['data-page-comments-open'], ''); assert.equal(h.document.activeElement, h.dom('.mobile-media-comments-sheet'));
  h.outside(); stale(); h.advance(180); assert.deepEqual(h.calls, ['close']); assert.equal(Object.hasOwn(h.frame.props, 'data-page-comments-open'), false);
});

test('other mobile sheets keep their static children, original focus policy and immediate dismissal', () => {
  const h = mobileSheetFixture({ mobileMotion: false, children: React.createElement('p', null, 'Existing sheet content') });
  assert.equal(h.tree.props['data-mobile-comments-motion'], undefined); assert.equal(h.tree.props['data-reduce-motion'], undefined); assert.equal(h.tree.props['data-closing'], undefined);
  assert.equal(descendants(h.tree).find(node => node.type === 'p').props.children, 'Existing sheet content'); assert.equal(h.dom('.mobile-media-comments-sheet').focusOptions.preventScroll, false);
  assert.equal(h.windowListeners.has('popstate'), false); h.outside(); assert.deepEqual(h.calls, ['close']); assert.equal(h.mounted, false); assert.equal(h.timers.size, 0);
});

test('desktop render-prop children receive the original immediate Close callback', () => {
  const h = harness(false, 'web', dismiss => React.createElement('button', { onClick: dismiss }, 'Existing action'));
  assert.equal(h.node.props.children.props.onClick, h.closeCallback); h.node.props.children.props.onClick(); assert.equal(h.closed, 1); assert.equal(h.focused, 0); h.cleanup();
});

test('comments motion CSS scopes pure fades and pointer release to opted-in MOBILE comments', () => {
  const css = readFileSync(new URL('../src/features/media-interactions/media-comments-motion.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
  assert.ok(rules.length >= 4); assert.ok(rules.every(rule => rule.selector.startsWith("[data-presentation='mobile'][data-mobile-comments-motion]")));
  const entry = rules.find(rule => rule.selector === "[data-presentation='mobile'][data-mobile-comments-motion] > [data-mobile-media-comments]");
  const exit = rules.find(rule => rule.selector.endsWith('[data-closing] > [data-mobile-media-comments]'));
  const release = rules.find(rule => rule.selector.endsWith('[data-closing]'));
  assert.match(entry.body, /animation:\s*m-fade-in var\(--m-fast\)/); assert.match(exit.body, /animation:\s*m-fade-out var\(--m-base\)/); assert.match(release.body, /pointer-events:\s*none/);
  const reduced = rules.find(rule => rule.selector.includes('[data-reduce-motion]')); assert.ok(reduced); assert.match(reduced.body, /animation:\s*none\s*!important/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/); assert.equal(rules.filter(rule => /animation:\s*none\s*!important/.test(rule.body)).length, 2);
  assert.doesNotMatch(css, /\b(?:transform|translate|scale|width|height|padding|margin)\s*:/, 'Comments motion cannot alter the established surface geometry.');
});

test('popup events stay out of the page viewer and Escape returns focus to its trigger', () => {
  const env = harness();
  for (const name of ['onPointerDown', 'onPointerUp', 'onClick', 'onDoubleClick', 'onWheel', 'onTouchMove', 'onKeyDown']) {
    let stopped = false;
    env.node.props[name]({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true, name);
  }
  let prevented = false, stopped = false;
  env.node.props.onKeyDownCapture({ key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(env.closed, 1);
  assert.equal(env.focused, 1);
  env.cleanup();
});

test('outside press and scrolling the anchor out of view dismiss comments', () => {
  const env = harness();
  env.document.emit('pointerdown', { target: env.panel });
  env.document.emit('pointerdown', { target: env.trigger });
  assert.equal(env.closed, 0);
  env.document.emit('pointerdown', { target: {} });
  assert.equal(env.closed, 1);
  env.hideAnchor();
  assert.equal(env.closed, 2);
  env.cleanup();
});

test('scrolling tracks the anchor and unmount removes viewport and document listeners', () => {
  const env = harness();
  env.move({ left: 200, top: 300, bottom: 320 });
  assert.equal(env.states[1].left, 200);
  assert.equal(env.states[1].top, 112);
  assert.ok(env.observers[0].observed.includes(env.panel));
  env.cleanup();
  assert.equal(env.document.listenerCount(), 0);
  assert.equal(env.window.listenerCount(), 0);
  assert.equal(env.viewport.listenerCount(), 0);
  assert.equal(env.observers[0].observed.length, 0);
});

function interactionBarHarness(mode, guest = false) {
  const states = [];
  let cursor = 0, retries = 0, dismissals = 0; const gates = [];
  const activity = {
    record: { engaged: { like: false, save: false, repost: false }, counts: { like: 0, save: 0, repost: 0 }, comments: [] },
    pendingKind: null, isResolvingEngagement: true, isLoading: false, isPostingComment: false,
    failure: 'Page activity is offline.', commentResumeToken: 0, shareState: 'idle',
    retry: () => { retries++; }, dismissFailure: () => { dismissals++; },
    toggle() {}, share() {}, postComment() {}, deleteComment() {},
  };
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useContext: () => guest ? {shared:true,projectId:'project',attachmentId:'attachment',pageIndex:0} : null, useRef: initial => ({ current: initial }), useId: () => 'comments-id',
    useEffect() {}, useLayoutEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
  };
  const popover = () => null;
  const icon = () => null;
  const { MediaInteractionBar } = load('../src/features/media-interactions/MediaInteractionBar.tsx', {
    '../../components/ui/ConfirmationDialog': {ConfirmationDialog:'confirmation'},
    '../references/ownCitation':{ownPageCitation:()=>{throw new Error('Unexpected owner copy in visitor fixture');}},
    '../citations/useCiteTarget': {useCiteTarget:()=>({surface:null,citedIn:null,open(){}})},
    '../citations/CiteSheet': {CiteSheet:()=>null},
    '../citations/CitedIn': {CitedIn:()=>null},
    '../engagement/capabilities': {likesCapability:false},
    '../sharing/InternalContentShare': {useInternalContentShare:()=>()=>{throw new Error('Unexpected share in comments fixture');}},
    react,
    'lucide-react': Object.fromEntries(['BookmarkIcon', 'HeartIcon', 'Loader2Icon', 'MessageCircleIcon', 'Repeat2Icon', 'SendIcon', 'Trash2Icon', 'XIcon'].map(name => [name, icon])),
    '../../components/ui/InterfaceIcon': { InterfaceIcon: icon },
    '../../components/publishing/ProjectFormDialog': { ProjectFormDialog: 'project-form' },
    '../../components/ui/Button': { Button: 'button' },
    '../../contexts/AuthContext': { useAuth: () => ({ isAuthenticated: !guest, requestAuthenticatedDestination: (intent,view) => gates.push({intent,view}) }) },
    '../auth/registration': { readSharedReturnPath: () => null },
    './ProjectSharePathContext': { ProjectSharePathContext: {} }, './MobilePageContext': { MobilePageContext: {} },
    '../../presentation/mobile/MobileContextActions': { useMobileScreenActions() {} },
    '../../presentation/mobile/contextActions': { contextActions: () => ({ primary: [], groups: [] }) },
    '../media/publicMediaUrl': { publicMediaUrl: source => source },
    './useMediaInteractions': { useMediaInteractions: () => activity },
    './mediaToolbarLayout': {
      mediaToolbarLayout: () => ({ width: 200, unit: 40, slots: [1, 1, 1, 1, 1] }),
      mobileFocusedMediaToolbarLayout: () => ({ width: 200, unit: 40, slots: [1, 1, 1, 1, 1] }),
    },
    '../../presentation/usePresentation': { usePresentation: () => mode },
    './useMediaPageSize': { useMediaPageSize: () => ({ ref: { current: null }, pageWidth: 390, hostWidth: 390, isVisible: true }) },
    './MediaCommentsPopover': { MediaCommentsPopover: popover },
  }, {window:{location:{pathname:'/share/creator/c/portal/project',search:'?page=2'}}});
  const render = (changes = {}) => {
    cursor = 0;
    return MediaInteractionBar({ target: { projectId: 'project', attachmentId: 'attachment', pageIndex: 0, label: 'Original source' }, ...changes });
  };
  return { gates, activity, render, popover, get retries() { return retries; }, get dismissals() { return dismissals; } };
}

function descendants(node) {
  if (!React.isValidElement(node)) return [];
  const children = typeof node.props.children === 'function' ? node.props.children(node.props.onClose) : node.props.children;
  return [node, ...React.Children.toArray(children).flatMap(descendants)];
}

test('the actual mobile Comments header uses animated dismissal while its parent preserves the unposted draft', () => {
  const env = interactionBarHarness('mobile'); env.activity.failure = null; env.activity.isResolvingEngagement = false;
  descendants(env.render()).find(node => node.props['aria-label'] === 'Show comments for Page 1').props.onClick();
  descendants(env.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: 'Keep this unposted draft' } });
  const popover = descendants(env.render()).find(node => node.type === env.popover);
  assert.equal(popover.props.mobileMotion, true); assert.equal(typeof popover.props.children, 'function');
  const h = mobileSheetFixture({ children: popover.props.children, onClose: popover.props.onClose }); h.close();
  assert.deepEqual(h.calls, []); assert.equal(descendants(env.render()).find(node => node.type === 'textarea').props.value, 'Keep this unposted draft');
  h.advance(180); assert.deepEqual(h.calls, ['close']); assert.equal(descendants(env.render()).some(node => node.type === env.popover), false);
  descendants(env.render()).find(node => node.props['aria-label'] === 'Show comments for Page 1').props.onClick();
  assert.equal(descendants(env.render()).find(node => node.type === 'textarea').props.value, 'Keep this unposted draft');
});

test('focused mobile owner and visitor actions all fit the same four-column row', () => {
  for (const isOwner of [true, false]) {
    const env = interactionBarHarness('mobile');
    const toolbar = descendants(env.render({ placement: 'focused', isOwner })).find(node => node.props.className === 'media-item-engagement-bar shrink-0');
    assert.equal(descendants(toolbar).filter(node => node.type === 'button').length, 4);
    assert.equal(toolbar.props.style.gridTemplateColumns, 'repeat(4, minmax(44px, 1fr))');
    assert.equal(toolbar.props.style.minWidth, 196);
  }
});

test('shared mobile guest page actions stay tappable while resolving and prompt Create account', () => {
  const env = interactionBarHarness('mobile', true);
  const nodes = descendants(env.render());
  const actions = nodes.filter(node => node.type === 'button' && /^Save:|^Show comments for|^Share Page/.test(node.props['aria-label'] ?? ''));
  assert.equal(actions.length, 3);
  env.activity.toggle = env.activity.share = () => assert.fail('Guest action must not write or share');
  for (const action of actions) { assert.ok(!action.props.disabled); action.props.onClick(); }
  assert.equal(env.gates.length, 3);
  assert.ok(env.gates.every(call => call.view === 'signUp' && call.intent.path === '/share/creator/c/portal/project?page=2'));
  assert.equal(descendants(env.render()).some(node => node.type === env.popover), false);
});

for (const mode of ['mobile', 'web']) {
  test(`${mode} exposes first-read retry outside closed Comments and keeps recovery reachable inside`, () => {
    const env = interactionBarHarness(mode);
    let nodes = descendants(env.render());
    const actions = nodes.filter(node => node.type === 'button' && /^Save:/.test(node.props['aria-label'] ?? ''));
    assert.equal(actions.length, 1);
    assert.ok(actions.every(node => node.props.disabled));
    assert.equal(nodes.some(node => node.type === env.popover), false);
    const retry = nodes.find(node => node.props['aria-label'] === 'Retry page activity for Page 1');
    assert.ok(retry, 'Retry is reachable without opening Comments');
    assert.equal(retry.type, 'button');
    assert.equal(retry.props.disabled, undefined);
    retry.props.onClick(); assert.equal(env.retries, 1);

    nodes.find(node => node.props['aria-label'] === 'Show comments for Page 1').props.onClick();
    nodes = descendants(env.render());
    assert.equal(nodes.some(node => node.type === env.popover), true);
    assert.equal(nodes.some(node => node.props['aria-label'] === 'Retry page activity for Page 1'), false);
    const insideRetry = nodes.find(node => node.type === 'button' && node.props.children === 'Try again');
    assert.ok(insideRetry);
    insideRetry.props.onClick(); assert.equal(env.retries, 2);
    assert.equal(nodes.some(node => node.type === 'button' && node.props.children === 'Dismiss'), false,
      'Unresolved failure cannot be dismissed while engagement remains blocked');

    env.activity.isResolvingEngagement = false;
    nodes = descendants(env.render());
    const dismiss = nodes.find(node => node.type === 'button' && node.props.children === 'Dismiss');
    assert.ok(dismiss, 'Ordinary post-load failures retain their dismiss action');
    dismiss.props.onClick(); assert.equal(env.dismissals, 1);
    const recoveredActions = nodes.filter(node => node.type === 'button' && /^Save:/.test(node.props['aria-label'] ?? ''));
    assert.equal(recoveredActions.length, 1);
    assert.equal(recoveredActions[0].props.disabled, false);

    env.activity.failure = null;
    nodes = descendants(env.render());
    assert.equal(nodes.some(node => node.type === 'button' && node.props.children === 'Try again'), false);
    assert.equal(nodes.some(node => node.props.role === 'alert'), false);
  });
}
