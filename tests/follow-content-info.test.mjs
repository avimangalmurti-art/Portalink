import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];

/** Actual popup, sheet-motion and modal-focus hooks with controlled commit/effect lifecycles. */
function fixture({ guest = false, reduce = false, appReduce = false, hasOptions = true, ownerOptions = false, readerInert = false, showEngagement = true } = {}) {
  const slots = [], timers = new Map(), listeners = new Map(), windowListeners = new Map(), dom = new Map(), calls = [];
  let cursor = 0, now = 0, timerId = 0, mounted = false, dirty = false, tree, layout = [], effects = [];
  const same = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const add = (map, name, callback) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(callback); };
  const remove = (map, name, callback) => { map.get(name)?.delete(callback); if (map.get(name)?.size === 0) map.delete(name); };
  const emit = (map, name, event) => { for (const callback of [...(map.get(name) ?? [])]) if (map.get(name)?.has(callback)) callback(event); flush(); };
  let document;
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.props = {}; this.isConnected = true; this.inert = false; this.tabIndex = -1; this.style = { setProperty(name, value) { this[name] = value; }, getPropertyValue(name) { return this[name] ?? ''; } }; }
    matches(selector) { return selector === ':disabled' ? Boolean(this.props.disabled) : false; }
    closest(selector) {
      for (let node = this; node; node = node.parentElement) {
        if (selector.includes('[hidden]') && (node.props.hidden || node.inert || node.props['aria-hidden'] === true || node.props['aria-hidden'] === 'true')) return node;
        if (selector.includes('[role="dialog"]') && node.props.role === 'dialog' && node.props['aria-modal'] === 'true') return node;
      }
      return null;
    }
    getClientRects() { return this.isConnected ? [{}] : []; }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    querySelectorAll(selector) { const children = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]); return selector === '*' ? children : children.filter(node => node.tagName === 'BUTTON' || node.props.href || node.tabIndex >= 0); }
    focus(options) { this.focusOptions = options; document.activeElement = this; emit(listeners, 'focusin', { target: this }); }
    setAttribute(name, value) { this.props[name] = value; }
    removeAttribute(name) { delete this.props[name]; }
  }
  const reader = new Element(), opener = new Element('button'), body = new Element('body'), host = new Element(); reader.inert = readerInert;
  host.querySelectorAll = selector => selector === '[data-premium-project-viewer]' ? [reader] : [];
  document = { body, documentElement: new Element('html'), activeElement: opener, fullscreenElement: null,
    querySelector: selector => selector === '.app-shell' || (selector.includes('.reduce-motion') && appReduce) ? host : null,
    querySelectorAll: () => [], addEventListener: (name, callback) => add(listeners, name, callback), removeEventListener: (name, callback) => remove(listeners, name, callback) };
  const window = { matchMedia: () => ({ matches: reduce }), addEventListener: (name, callback) => add(windowListeners, name, callback), removeEventListener: (name, callback) => remove(windowListeners, name, callback) };
  const globals = { document, window, HTMLElement: Element,
    getComputedStyle: element => ({ visibility: 'visible', transform: element.props?.className === 'follow-info-panel' ? 'matrix(0.98, 0, 0, 0.98, 0, 0)' : 'none', opacity: element.props?.className === 'follow-info-panel' ? '0.55' : '0.43', getPropertyValue: name => ({ '--m-fast': '120ms', '--m-base': '180ms', '--m-slow': '260ms' }[name] ?? '') }),
    setTimeout(callback, duration) { const id = ++timerId; timers.set(id, { callback, due: now + duration, duration }); return id; }, clearTimeout: id => timers.delete(id) };
  const effect = (queue, callback, dependencies) => { const index = cursor++, prior = slots[index]; if (!same(prior?.dependencies, dependencies)) { slots[index] = { dependencies }; queue.push(() => { prior?.cleanup?.(); if (mounted) slots[index].cleanup = callback(); }); } };
  const react = { ...React,
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(initial) { const index = cursor++, slot = slots[index] ??= { value: initial }; return [slot.value, next => { if (mounted) { slot.value = typeof next === 'function' ? next(slot.value) : next; dirty = true; } }]; },
    useCallback(callback, dependencies) { const index = cursor++; if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, callback }; return slots[index].callback; },
    useEffect(callback, dependencies) { effect(effects, callback, dependencies); }, useLayoutEffect(callback, dependencies) { effect(layout, callback, dependencies); } };
  const flushSync = callback => { callback(); flush(); };
  const motion = sourceModule('src/presentation/motion/motion.ts', { 'react-dom': { flushSync }, '../../utils/projectContinuity': {} }, globals);
  const sheet = sourceModule('src/presentation/motion/useSheetMotion.ts', { react, 'react-dom': { flushSync }, './motion': motion }, globals);
  const modal = sourceModule('src/hooks/useModalFocus.ts', { react }, globals);
  const { FollowContentInfoPopup } = sourceModule('src/components/media/FollowContentInfoPopup.tsx', {
    react, 'react-dom': { createPortal: node => node }, 'lucide-react': {},
    '../../hooks/useDialogViewport': { useDialogViewport: () => react.useRef(null) }, '../../hooks/useModalFocus': modal,
    '../../presentation/motion/useSheetMotion': sheet, '../../presentation/motion/motion': motion,
    '../../features/comments/useProjectComments': { useProjectComments: id => { assert.equal(id, showEngagement ? 'actual-id' : null); return { phase: 'ready', totalCount: 7 }; } },
    '../../features/engagement/EngagementBar': { EngagementFeedback: 'feedback' }, '../text/FormattedText': { FormattedText: 'formatted' }, '../ui/InterfaceIcon': { InterfaceIcon: 'icon' }, './follow-content-info.css': {},
  }, globals);
  const props = { projectId: 'actual-id', title: 'Real title', description: 'First paragraph\n\nSecond paragraph', creatorHeader: React.createElement('button', null, 'Real creator'), showEngagement,
    engagement: { count: kind => kind === 'save' ? 12 : 4, isEngaged: kind => kind === 'save', isPending: () => false, isResolving: false, resolveError: null, toggle: kind => calls.push(kind) },
    optionsContent: ownerOptions ? React.createElement('button', { type: 'button' }, 'Edit project') : undefined,
    onOptions: hasOptions ? () => calls.push('options') : undefined, onComments: () => calls.push('comments'), onRequireAccount: guest ? () => calls.push('signup') : undefined,
    onClose: () => { calls.push('close'); unmount(); } };
  function commit(node, parent = null, path = 'root') {
    if (!React.isValidElement(node)) return;
    let container = parent;
    if (typeof node.type === 'string') {
      container = dom.get(path) ?? new Element(node.type); dom.set(path, container); container.props = node.props; container.children = []; container.parentElement = parent; container.isConnected = true;
      container.tabIndex = node.props.tabIndex ?? (node.type === 'button' ? 0 : -1); Object.assign(container.style, node.props.style);
      if (parent) parent.children.push(container);
      if (typeof node.ref === 'function') node.ref(container); else if (node.ref) node.ref.current = container;
    }
    React.Children.toArray(node.props.children).forEach((child, index) => commit(child, container, path + '.' + index));
  }
  function flush() {
    if (!mounted || !dirty) return;
    cursor = 0; dirty = false; layout = []; effects = []; tree = FollowContentInfoPopup(props); commit(tree);
    layout.splice(0).forEach(callback => callback()); effects.splice(0).forEach(callback => callback()); if (dirty) flush();
  }
  function unmount() { if (!mounted) return; mounted = false; slots.forEach(slot => slot?.cleanup?.()); for (const element of dom.values()) element.isConnected = false; }
  function mount() { mounted = true; dirty = true; flush(); }
  mount();
  return { calls, reader, opener, document, listeners, windowListeners, timers, modal,
    get tree() { flush(); return tree; }, get mounted() { return mounted; },
    layer: () => [...dom.values()].find(element => Object.hasOwn(element.props, 'data-follow-info-layer')),
    dom: className => [...dom.values()].find(element => element.props.className === className),
    outside() { const overlay = nodes(tree).find(node => node.props.className === 'follow-info-overlay'), target = this.dom('follow-info-overlay'); overlay.props.onClick({ target, currentTarget: target, stopPropagation() {} }); flush(); },
    inside() { const overlay = nodes(tree).find(node => node.props.className === 'follow-info-overlay'); overlay.props.onClick({ target: {}, currentTarget: this.dom('follow-info-overlay'), stopPropagation() {} }); flush(); },
    emit(name, input = {}) { emit(listeners, name, input); }, pop(input = {}) { emit(windowListeners, 'popstate', input); },
    advance(duration) { const end = now + duration; for (;;) { const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0]; if (!next) break; now = next[1].due; timers.delete(next[0]); next[1].callback(); flush(); } now = end; },
    unmount, reopen() { unmount(); slots.length = 0; dom.clear(); mount(); } };
}

test('Follow popup uses real content and exactly comments/bookmark, with synchronous existing callbacks', () => {
  const h = fixture(), all = nodes(h.tree), group = all.find(node => node.props.role === 'group'), buttons = nodes(group).filter(node => node.type === 'button');
  assert.equal(all.find(node => node.type === 'h2').props.children, 'Real title'); assert.equal(all.find(node => node.type === 'formatted').props.text, 'First paragraph\n\nSecond paragraph');
  assert.equal(buttons.length, 2); assert.deepEqual(buttons.map(button => button.props['aria-label']), ['Comments: Real title', 'Bookmark: Real title']); assert.deepEqual(buttons.map(button => nodes(button).find(node => node.type === 'span').props.children), [7, 12]); assert.equal(buttons[1].props['aria-pressed'], true);
  buttons.forEach(button => button.props.onClick()); all.find(node => node.props['aria-label'] === 'Content options').props.onClick();
  assert.deepEqual(h.calls, ['comments', 'save', 'options']); assert.equal(h.timers.size, 0); assert.equal(all.some(node => /close/i.test(node.props['aria-label'] ?? '')), false); h.unmount();
});

test('reading-only information has no engagement footer or comment read for guests and signed-in viewers', () => {
  for (const guest of [false, true]) {
    const h = fixture({ guest, showEngagement: false }), all = nodes(h.tree);
    assert.equal(all.some(node => node.type === 'footer' || node.type === 'feedback' || node.props.role === 'group'), false);
    assert.equal(all.find(node => node.type === 'h2').props.children, 'Real title');
    assert.equal(all.find(node => node.type === 'formatted').props.text, 'First paragraph\n\nSecond paragraph');
    assert.ok(all.some(node => node.type === 'button' && node.props.children === 'Real creator'));
    h.outside(); h.advance(180); assert.deepEqual(h.calls, ['close']); h.unmount();
  }
});

test('outside dismissal leaves only180ms decorative fade while releasing focus and the mounted reader immediately', () => {
  const h = fixture(); assert.equal(h.reader.inert, true); assert.equal(h.document.activeElement, h.dom('follow-info-panel'));
  h.inside(); assert.equal(h.timers.size, 0); h.outside();
  assert.deepEqual(h.calls, []); assert.equal(h.reader.inert, false); assert.equal(h.document.activeElement, h.opener); assert.equal(h.opener.focusOptions.preventScroll, true);
  const layer = h.layer(); assert.equal(layer.props['aria-hidden'], true); assert.equal(layer.inert, true);
  assert.equal(h.dom('follow-info-overlay').style['--follow-info-exit-opacity'], '0.43'); assert.equal(h.dom('follow-info-panel').style['--follow-info-exit-opacity'], '0.55');
  assert.equal(h.dom('follow-info-panel').style['--follow-info-exit-transform'], 'matrix(0.98, 0, 0, 0.98, 0, 0)', 'Mid-entrance close captures the current paint rather than snapping to its resting pose.');
  assert.equal(h.listeners.has('focusin'), false); h.advance(179); assert.deepEqual(h.calls, []); h.advance(1); assert.deepEqual(h.calls, ['close']); assert.equal(h.mounted, false); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test('the minimize button dismisses owner and reader information once and restores focus during the fade', () => {
  for (const ownerOptions of [true, false]) {
    const h = fixture({ hasOptions: false, ownerOptions, showEngagement: ownerOptions });
    const buttons = nodes(h.tree).filter(node => node.type === 'button');
    assert.equal(buttons.some(node => node.props['aria-label'] === 'Content options'), ownerOptions);
    const minimize = buttons.find(node => node.props['aria-label'] === 'Minimize project information');
    assert.ok(minimize);
    assert.equal(h.document.activeElement, h.dom('follow-info-panel'));
    assert.equal(h.reader.inert, true);

    minimize.props.onClick();
    minimize.props.onClick();
    assert.equal(h.tree.props['data-closing'], true);
    assert.equal(h.reader.inert, false);
    assert.equal(h.document.activeElement, h.opener);
    assert.equal(h.opener.focusOptions.preventScroll, true);
    assert.equal(h.timers.size, 1);
    assert.deepEqual(h.calls, []);

    h.advance(179);
    assert.equal(h.mounted, true);
    h.advance(1);
    assert.deepEqual(h.calls, ['close']);
    assert.equal(h.mounted, false);
  }
});

test('second pointer or keyboard input finishes the fading popup once without consuming new input', () => {
  for (const name of ['pointerdown', 'keydown']) {
    const h = fixture(); h.outside(); const stale = [...h.timers.values()][0].callback;
    const input = { key: 'Tab', preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; h.emit(name, input);
    assert.deepEqual(h.calls, ['close']); assert.equal(input.prevented, undefined); assert.equal(input.stopped, undefined); assert.equal(h.reader.inert, false); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
    stale(); h.advance(180); assert.deepEqual(h.calls, ['close']);
  }
});

test('OS and app reduced motion close immediately without a timer or fading interaction blocker', () => {
  for (const options of [{ reduce: true }, { appReduce: true }]) {
    const h = fixture(options); assert.equal(h.layer().props['data-reduce-motion'], true, 'The portalled popup carries the app/OS reduced-motion policy.'); h.outside(); assert.deepEqual(h.calls, ['close']); assert.equal(h.mounted, false); assert.equal(h.reader.inert, false); assert.equal(h.document.activeElement, h.opener); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  }
});

test('Escape starts dismissal and a following Tab is available to the underlying reader instead of its old focus trap', () => {
  const h = fixture(), escape = { key: 'Escape', target: h.dom('follow-info-panel'), preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
  h.emit('keydown', escape); assert.equal(escape.defaultPrevented, true); assert.deepEqual(h.calls, []); assert.equal(h.reader.inert, false); assert.equal(h.document.activeElement, h.opener);
  const tab = { key: 'Tab', preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } }; h.emit('keydown', tab);
  assert.deepEqual(h.calls, ['close']); assert.equal(tab.defaultPrevented, undefined); assert.equal(tab.stopped, undefined); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test('native Back releases the modal and pending exit immediately without consuming history input', () => {
  for (const fading of [false, true]) {
    const h = fixture(); if (fading) h.outside(); const input = { preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; h.pop(input);
    assert.deepEqual(h.calls, ['close']); assert.equal(h.reader.inert, false); assert.equal(h.document.activeElement, h.opener); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); assert.equal(h.windowListeners.size, 0); assert.equal(input.prevented, undefined); assert.equal(input.stopped, undefined);
  }
});

test('unmount and reopen cancel old completion authority without closing or unlocking the new popup', () => {
  const h = fixture(); h.outside(); const stale = [...h.timers.values()][0].callback; h.unmount(); assert.equal(h.reader.inert, false);
  h.reopen(); stale(); assert.deepEqual(h.calls, []); assert.equal(h.mounted, true); assert.equal(h.reader.inert, true); assert.equal(h.document.activeElement, h.dom('follow-info-panel'));
  h.outside(); stale(); h.advance(180); assert.deepEqual(h.calls, ['close']); assert.equal(h.reader.inert, false);
});

test('reader preexisting inert state is preserved and guests retain the synchronous signup gate', () => {
  const h = fixture({ guest: true, readerInert: true }), group = nodes(h.tree).find(node => node.props.role === 'group');
  nodes(group).filter(node => node.type === 'button')[1].props.onClick(); assert.deepEqual(h.calls, ['signup']); assert.equal(h.timers.size, 0);
  h.outside(); assert.equal(h.reader.inert, true); h.advance(180); assert.equal(h.reader.inert, true);
});

test('search preview omits unavailable three-dot menu while keeping content and engagement', () => {
  const h = fixture({ hasOptions: false }), all = nodes(h.tree);
  assert.equal(all.some(node => node.props['aria-label'] === 'Content options'), false); assert.equal(all.find(node => node.type === 'h2').props.children, 'Real title'); assert.equal(nodes(all.find(node => node.props.role === 'group')).filter(node => node.type === 'button').length, 2); h.unmount();
});
