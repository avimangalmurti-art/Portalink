import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : '';

/** Actual sharing component, motion, focus, viewport and keyboard hooks with controlled native input. */
function fixture({ presentation = 'mobile', inline = false, reduce = false, appReduce = false, providerLock = false } = {}) {
  const slots = [], dom = new Map(), listeners = new Map(), windowListeners = new Map(), viewportListeners = new Map(), timers = new Map(), calls = [], conversations = [], messages = [];
  let cursor = 0, layout = [], autofocus = [], effects = [], tree, dirty = true, mounted = true, rendering = false, now = 0, sequence = 0, writesAfterUnmount = 0, document;
  const equal = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const add = (map, name, callback) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(callback); };
  const remove = (map, name, callback) => { map.get(name)?.delete(callback); if (map.get(name)?.size === 0) map.delete(name); };
  const emit = (map, name, event = {}) => { for (const callback of [...(map.get(name) ?? [])]) if (map.get(name)?.has(callback)) callback(event); render(); };
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.props = {}; this.parentElement = null; this.isConnected = true; this.inert = false; this.tabIndex = -1; this.style = { setProperty(name, value) { this[name] = value; }, getPropertyValue(name) { return this[name] ?? ''; } }; }
    matches(selector) {
      if (selector === ':disabled') return Boolean(this.props.disabled);
      if (selector.startsWith('input:')) return this.tagName === 'INPUT';
      if (selector.startsWith('.')) return (this.props.className ?? '').split(' ').includes(selector.slice(1));
      if (/^[a-z]+$/.test(selector)) return this.tagName === selector.toUpperCase();
      const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/); return attribute ? Object.hasOwn(this.props, attribute[1]) && (attribute[2] === undefined || String(this.props[attribute[1]]) === attribute[2]) : false;
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) { if (selector.includes('[hidden]') && (node.props.hidden || node.inert || node.props['aria-hidden'] === true)) return node; if (selector.includes('[role="dialog"]') && node.props.role === 'dialog' && node.props['aria-modal'] === 'true') return node; if (node.matches(selector)) return node; } return null; }
    contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    getClientRects() { return this.isConnected ? [{}] : []; }
    querySelectorAll(selector) { const items = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]); return selector === '*' ? items : selector.startsWith('button:') ? items.filter(node => ['BUTTON', 'INPUT'].includes(node.tagName) || node.tabIndex >= 0) : items.filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    cloneNode(deep) { const clone = new Element(this.tagName); clone.props = { ...this.props }; Object.assign(clone.style, this.style); clone.tabIndex = this.tabIndex; if (deep) clone.append(...this.children.map(child => child.cloneNode(true))); return clone; }
    append(...children) { children.forEach(child => { child.parentElement = this; child.isConnected = this.isConnected; this.children.push(child); }); }
    remove() { this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.children.forEach(child => { child.isConnected = false; }); }
    focus(options) { this.focusOptions = options; document.activeElement = this; emit(listeners, 'focusin', { target: this }); }
    setAttribute(name, value) { this.props[name] = value; }
    removeAttribute(name) { delete this.props[name]; }
  }
  const opener = new Element('button'), host = new Element(), viewport = { height: 912, width: 420, offsetTop: 0, scale: 1, addEventListener: (name, callback) => add(viewportListeners, name, callback), removeEventListener: (name, callback) => remove(viewportListeners, name, callback) };
  document = { activeElement: opener, documentElement: new Element('html'), body: host,
    querySelector: selector => selector === '.app-shell' || (selector.includes('.reduce-motion') && appReduce) ? host : null, querySelectorAll: () => [],
    addEventListener: (name, callback) => add(listeners, name, callback), removeEventListener: (name, callback) => remove(listeners, name, callback) };
  const window = { visualViewport: viewport, innerWidth: 420, innerHeight: 912, matchMedia: () => ({ matches: reduce }),
    addEventListener: (name, callback) => add(windowListeners, name, callback), removeEventListener: (name, callback) => remove(windowListeners, name, callback) };
  const globals = { document, window, HTMLElement: Element,
    getComputedStyle: () => ({ opacity: '0.43', visibility: 'visible', transform: 'none', getPropertyValue: name => ({ '--m-fast': '120ms', '--m-base': '180ms', '--m-slow': '260ms' }[name] ?? '') }),
    setTimeout(callback, duration) { const id = ++sequence; timers.set(id, { callback, duration, due: now + duration }); return id; }, clearTimeout: id => timers.delete(id) };
  const effect = (queue, callback, dependencies) => { const index = cursor++, prior = slots[index]; if (!equal(prior?.dependencies, dependencies)) { slots[index] = { dependencies }; queue.push(() => { prior?.cleanup?.(); if (mounted) slots[index].cleanup = callback(); }); } };
  const react = { ...React,
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(initial) { const index = cursor++, slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, next => { if (!mounted) { writesAfterUnmount++; return; } const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } }]; },
    useCallback(callback, dependencies) { const index = cursor++; if (!equal(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, callback }; return slots[index].callback; },
    useEffect(callback, dependencies) { effect(effects, callback, dependencies); }, useLayoutEffect(callback, dependencies) { effect(layout, callback, dependencies); } };
  const flushSync = callback => { callback(); render(); };
  const motion = sourceModule('src/presentation/motion/motion.ts', { 'react-dom': { flushSync }, '../../utils/projectContinuity': {} }, globals);
  const sheet = sourceModule('src/presentation/motion/useSheetMotion.ts', { react, 'react-dom': { flushSync }, './motion': motion }, globals);
  const modal = sourceModule('src/hooks/useModalFocus.ts', { react }, globals);
  const dialogViewport = sourceModule('src/hooks/useDialogViewport.ts', { react }, globals);
  const keyboard = sourceModule('src/features/sharing/useRecipientKeyboard.ts', { react }, globals);
  const auth = { isAuthenticated: true, user: { id: 'account' }, viewerProfileId: 'viewer', phase: 'authenticated' };
  const NewChatPanel = () => React.createElement('input', { type: 'search', 'aria-label': 'Find recipient' });
  const ModalPortal = ({ children }) => children;
  const { InternalContentShareDialog } = sourceModule('src/features/sharing/InternalContentShare.tsx', {
    react, '../../contexts/AuthContext': { useAuth: () => auth }, '../../contexts/ServicesContext': { useServices: () => ({ messaging: {
      getOrCreateConversation(...args) { calls.push(['conversation', ...args]); return new Promise((resolve, reject) => conversations.push({ args, resolve, reject })); },
      sendMessage(...args) { calls.push(['send', ...args]); return new Promise((resolve, reject) => messages.push({ args, resolve, reject })); },
    } }) }, '../../components/messages/NewChatPanel': { NewChatPanel }, '../../components/ui/ModalPortal': { ModalPortal },
    '../../hooks/useDialogViewport': dialogViewport, '../../hooks/useModalFocus': modal, '../../presentation/usePresentation': { usePresentation: () => presentation },
    './useRecipientKeyboard': keyboard, '../../presentation/motion/useSheetMotion': sheet, '../../presentation/motion/motion': motion,
    'lucide-react': { ArrowLeftIcon: 'back-icon' }, './internalContentShare.css': {},
  }, globals);
  const mobileSendLock = { current: false };
  const props = { inline, mobileSendLock: providerLock || presentation === 'mobile' && !inline ? mobileSendLock : undefined, target: { title: 'Project', url: 'https://portalink.test/p/creator/c/portal/work', onSent: () => calls.push(['confirmed']) }, onClose: () => { calls.push(['close']); unmount(); } };
  function commit(node, parent = null, path = 'root') {
    if (!React.isValidElement(node)) return;
    if (node.type === ModalPortal) { React.Children.toArray(node.props.children).forEach((child, index) => commit(child, host, `${path}.${index}`)); return; }
    if (node.type === NewChatPanel) { const fresh = !dom.has(path); commit(node.type(node.props), parent, path); if (fresh) autofocus.push(() => dom.get(path)?.focus({ preventScroll: true })); return; }
    let container = parent;
    if (typeof node.type === 'string') { container = dom.get(path) ?? new Element(node.type); dom.set(path, container); container.props = { ...node.props }; container.children = []; container.parentElement = parent; container.isConnected = true; container.tabIndex = node.props.tabIndex ?? (['button', 'input'].includes(node.type) ? 0 : -1); Object.assign(container.style, node.props.style); if (parent && !parent.children.includes(container)) parent.children.push(container); if (typeof node.ref === 'function') node.ref(container); else if (node.ref) node.ref.current = container; }
    React.Children.toArray(node.props.children).forEach((child, index) => commit(child, container, `${path}.${index}`));
  }
  function render(changes = {}) { Object.assign(props, changes); if (rendering) return tree; for (let pass = 0; mounted && (dirty || pass === 0); pass++) { assert.ok(pass < 16, 'Sharing state must settle'); rendering = true; dirty = false; cursor = 0; layout = []; autofocus = []; effects = []; tree = InternalContentShareDialog(props); commit(tree); layout.splice(0).forEach(callback => callback()); autofocus.splice(0).forEach(callback => callback()); effects.splice(0).forEach(callback => callback()); rendering = false; } return tree; }
  function unmount() { if (!mounted) return; mounted = false; slots.forEach(slot => slot?.cleanup?.()); for (const node of dom.values()) node.remove(); }
  render();
  return { calls, conversations, messages, props, auth, opener, host, document, window, viewport, listeners, windowListeners, viewportListeners, timers, mobileSendLock, render, unmount,
    dom(selector) { return [...dom.values()].find(element => element.matches(selector)); },
    button(label) { return nodes(render()).find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label)); },
    select(id = 'recipient') { nodes(render()).find(node => node.type === NewChatPanel).props.onSelectCreator(id); render(); },
    focusSearch() { this.dom('input:not([type="button"])').focus({ preventScroll: true }); },
    resize(height, offsetTop = 0) { viewport.height = height; viewport.offsetTop = offsetTop; emit(viewportListeners, 'resize'); },
    emit(name, input = {}) { emit(listeners, name, input); }, pop(input = {}) { emit(windowListeners, 'popstate', input); },
    advance(duration) { const end = now + duration; for (;;) { const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0]; if (!next) break; now = next[1].due; timers.delete(next[0]); next[1].callback(); render(); } now = end; },
    async flush() { render(); await new Promise(setImmediate); render(); },
    setPresentation(value) { presentation = value; },
    get tree() { return render(); }, get mounted() { return mounted; }, get writesAfterUnmount() { return writesAfterUnmount; },
    clone() { return host.children.find(element => element.props['aria-hidden'] === 'true'); },
    reopen(changes = {}) { unmount(); slots.length = 0; dom.clear(); mounted = true; dirty = true; render(changes); },
  };
}

test('MOBILE Back freezes the visible keyboard geometry and keeps only an inert 180ms current-opacity exit', () => {
  const h = fixture(); h.focusSearch(); h.resize(530, 30); const screen = h.dom('.internal-share-screen');
  assert.equal(screen.style['--dialog-viewport-height'], '530px'); assert.equal(screen.style['--dialog-viewport-top'], '30px'); assert.equal(screen.props['data-recipient-keyboard'], 'open'); assert.equal(h.button('Cancel'), undefined);
  h.button('Back').props.onClick(); const clone = h.clone();
  assert.deepEqual(h.calls, [['close']]); assert.equal(h.mounted, false); assert.equal(h.document.activeElement, h.opener); assert.equal(h.opener.focusOptions.preventScroll, true);
  assert.ok(clone); assert.equal(clone.inert, true); assert.equal(clone.props['aria-hidden'], 'true'); assert.equal(clone.style.pointerEvents, 'none'); assert.equal(clone.querySelectorAll('[aria-modal]').length, 0);
  assert.equal(clone.style['--motion-exit-opacity'], '0.43'); assert.equal(clone.style['--dialog-viewport-height'], '530px'); assert.equal(clone.style['--dialog-viewport-top'], '30px'); assert.equal(clone.props['data-recipient-keyboard'], 'open'); assert.equal(clone.querySelectorAll('footer').length, 0);
  assert.equal(h.viewportListeners.size, 0); assert.equal(h.windowListeners.size, 0); assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0].duration, 180);
  h.resize(912); assert.equal(clone.style['--dialog-viewport-height'], '530px'); assert.equal(clone.style['--dialog-viewport-top'], '30px');
  h.advance(179); assert.equal(clone.isConnected, true); h.advance(1); assert.equal(clone.isConnected, false); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test('MOBILE Cancel and confirmed Done release their live modal before the decorative fade finishes', async () => {
  for (const action of ['Cancel', 'Done']) {
    const h = fixture();
    if (action === 'Done') { h.select(); h.button('Send').props.onClick(); h.conversations[0].resolve({ id: 'conversation', status: 'active' }); await h.flush(); h.messages[0].resolve({ id: 'message' }); await h.flush(); }
    h.button(action).props.onClick(); assert.equal(h.mounted, false); assert.equal(h.calls.filter(call => call[0] === 'close').length, 1); assert.equal(h.document.activeElement, h.opener); assert.ok(h.clone()); h.advance(180); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  }
});

test('the next pointer or keyboard input clears a MOBILE decorative exit without consuming the new interaction', () => {
  for (const name of ['pointerdown', 'keydown']) {
    const h = fixture(); h.button('Cancel').props.onClick(); const clone = h.clone(), stale = [...h.timers.values()][0].callback;
    const input = { key: 'Tab', preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; h.emit(name, input);
    assert.equal(clone.isConnected, false); assert.equal(input.prevented, undefined); assert.equal(input.stopped, undefined); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); stale(); assert.equal(h.calls.filter(call => call[0] === 'close').length, 1);
  }
});

test('OS and app reduced motion release MOBILE Send content immediately without an exit clone or timer', () => {
  for (const options of [{ reduce: true }, { appReduce: true }]) {
    const h = fixture(options); h.button('Cancel').props.onClick(); assert.equal(h.mounted, false); assert.equal(h.clone(), undefined); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); assert.equal(h.windowListeners.size, 0); assert.equal(h.viewportListeners.size, 0); assert.equal(h.document.activeElement, h.opener);
  }
});

test('native Back releases MOBILE focus and pending work immediately without consuming navigation input', async () => {
  const h = fixture(); h.select(); h.button('Send').props.onClick();
  const input = { preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; h.pop(input);
  assert.equal(h.mounted, false); assert.equal(h.document.activeElement, h.opener); assert.equal(input.prevented, undefined); assert.equal(input.stopped, undefined); assert.equal(h.clone(), undefined); assert.equal(h.timers.size, 0);
  h.conversations[0].resolve({ id: 'old-conversation', status: 'active' }); await h.flush(); assert.equal(h.messages.length, 0); assert.equal(h.writesAfterUnmount, 0); assert.equal(h.calls.some(call => call[0] === 'confirmed'), false);
});

test('reopening MOBILE Send content clears an old decorative exit and revokes stale timer authority', () => {
  const h = fixture(); h.button('Cancel').props.onClick(); const clone = h.clone(), stale = [...h.timers.values()][0].callback; h.reopen();
  assert.equal(clone.isConnected, false); assert.equal(h.mounted, true); assert.equal(h.clone(), undefined); stale(); assert.equal(h.mounted, true); assert.equal(h.document.activeElement.tagName, 'INPUT'); assert.equal(h.dom('.internal-share-page').contains(h.document.activeElement), true); assert.equal(h.calls.filter(call => call[0] === 'close').length, 1); h.unmount();
});

test('WEB and inline callers keep immediate Close without MOBILE motion or keyboard ownership', () => {
  for (const options of [{ presentation: 'web' }, { presentation: 'mobile', inline: true }, { presentation: 'web', inline: true }]) {
    const h = fixture(options), screen = h.dom('.internal-share-screen'); assert.equal(screen?.props['data-mobile-share-motion'], undefined); assert.ok(h.button('Cancel')); assert.equal(h.windowListeners.has('popstate'), false);
    h.button('Cancel').props.onClick(); assert.deepEqual(h.calls, [['close']]); assert.equal(h.clone(), undefined); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0); assert.equal(h.viewportListeners.size, 0);
  }
});

test('MOBILE explicit Send rejects a duplicate tap and shows Sent only after messaging confirms success', async () => {
  const h = fixture(); assert.equal(h.button('Send').props.disabled, true); h.select(); assert.deepEqual(h.calls, []);
  const send = h.button('Send'), staleSelection = nodes(h.tree).find(node => node.props.appearance === 'account-search');
  send.props.onClick(); send.props.onClick(); staleSelection.props.onSelectCreator('different-recipient');
  assert.equal(h.conversations.length, 1); assert.deepEqual(h.conversations[0].args, ['recipient']);
  await h.flush(); assert.equal(h.button('Cancel').props.disabled, true); assert.equal(h.calls.some(call => call[0] === 'confirmed'), false);
  h.conversations[0].resolve({ id: 'conversation', status: 'active' }); await h.flush();
  assert.equal(h.messages.length, 1); assert.deepEqual(h.messages[0].args, ['conversation', 'Project\nhttps://portalink.test/p/creator/c/portal/work']);
  assert.equal(nodes(h.tree).some(node => node.props.role === 'status' && text(node) === 'Sent in Portalink.'), false);
  h.messages[0].resolve({ id: 'confirmed-message' }); await h.flush();
  assert.equal(h.calls.filter(call => call[0] === 'confirmed').length, 1); assert.ok(h.button('Done')); assert.equal(h.button('Send'), undefined);
  assert.equal(nodes(h.tree).some(node => node.props.role === 'status' && text(node) === 'Sent in Portalink.'), true); h.unmount();
});

test('MOBILE success focuses the retained panel before confirmation removes the focused Send action', async () => {
  const h = fixture(); h.select(); const panel = h.dom('.internal-share-page'), originalFocus = panel.focus.bind(panel);
  const sendElement = panel.querySelectorAll('button').find(element => text(element.props.children) === 'Send'); sendElement.focus({ preventScroll: true });
  let focusedBeforeSent = false;
  panel.focus = options => { focusedBeforeSent = nodes(h.tree).some(node => node.type === 'button' && ['Send', 'Sending…'].includes(text(node))); originalFocus(options); };
  h.button('Send').props.onClick(); h.conversations[0].resolve({ id: 'conversation', status: 'active' }); await h.flush(); h.messages[0].resolve({ id: 'message' }); await h.flush();
  assert.equal(focusedBeforeSent, true); assert.equal(h.document.activeElement, panel); assert.equal(panel.focusOptions.preventScroll, true); assert.ok(h.button('Done')); h.unmount();
});

test('MOBILE motion CSS keeps 120ms entry and 180ms pure exit fades with app and OS motion suppression', () => {
  const css = readFileSync(new URL('../src/features/sharing/internalContentShare.css', import.meta.url), 'utf8');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) => selector.includes('[data-mobile-share-motion]') || selector.includes('[data-share-reduce-motion]'));
  assert.ok(rules.length >= 4); assert.ok(rules.every(([, selector]) => selector.includes('[data-presentation=mobile]')));
  assert.ok(rules.some(([, selector, body]) => !selector.includes('data-motion-closing') && /animation:\s*m-fade-in var\(--m-fast\)/.test(body)));
  assert.ok(rules.some(([, selector, body]) => selector.includes('data-motion-closing') && /animation:\s*m-fade-out var\(--m-base\)/.test(body)));
  assert.equal(rules.filter(([, , body]) => /animation:\s*none!important/.test(body)).length, 2);
  assert.ok(rules.every(([, , body]) => !/\b(?:transform|translate|scale|width|height|padding|margin)\s*:/.test(body)));
  const h = fixture({ appReduce: true }); assert.equal(h.dom('.internal-share-screen').props['data-share-reduce-motion'], true); h.unmount();
});

test('MOBILE blocked invitations keep an actionable error and never claim a send', async () => {
  const h = fixture(); h.select(); h.button('Send').props.onClick(); h.conversations[0].resolve({ id: 'invitation', status: 'request', requestedByViewer: true, hasSentRequest: true }); await h.flush();
  assert.equal(h.messages.length, 0); assert.equal(h.calls.some(call => call[0] === 'confirmed'), false); assert.equal(h.button('Done'), undefined);
  assert.match(text(nodes(h.tree).find(node => node.props.role === 'alert')), /must be accepted/); assert.equal(h.button('Send').props.disabled, false); h.unmount();
});

test('changing MOBILE target or account before conversation resolution rejects old success and failure', async () => {
  for (const change of ['target', 'account']) for (const fails of [false, true]) {
    const h = fixture(); h.select(); h.button('Send').props.onClick();
    if (change === 'target') h.reopen({ target: { title: 'New project', url: 'https://portalink.test/new', onSent: () => h.calls.push(['new-confirmed']) } });
    else { h.auth.viewerProfileId = 'new-viewer'; h.auth.user = { id: 'new-account' }; h.reopen(); }
    if (fails) h.conversations[0].reject(new Error('Old request failed')); else h.conversations[0].resolve({ id: 'old-conversation', status: 'active' }); await h.flush();
    assert.equal(h.messages.length, 0); assert.equal(h.calls.some(call => /confirmed/.test(call[0])), false); assert.equal(nodes(h.tree).some(node => node.props.role === 'alert'), false);
    assert.equal(h.button('Send').props.disabled, true, 'The new session requires a new explicit recipient selection.'); h.unmount();
  }
});

test('a reopened MOBILE target cannot duplicate a pending send or inherit its old confirmation', async () => {
  const h = fixture(); h.select(); h.button('Send').props.onClick(); h.conversations[0].resolve({ id: 'old-conversation', status: 'active' }); await h.flush(); assert.equal(h.messages.length, 1);
  h.reopen({ target: { title: 'New project', url: 'https://portalink.test/new', onSent: () => h.calls.push(['new-confirmed']) } }); h.select('new-recipient'); h.button('Send').props.onClick();
  assert.equal(h.conversations.length, 1); assert.match(text(nodes(h.tree).find(node => node.props.role === 'alert')), /previous send is still finishing/);
  h.messages[0].resolve({ id: 'old-message' }); await h.flush(); assert.equal(h.calls.some(call => /confirmed/.test(call[0])), false); assert.equal(h.button('Done'), undefined); assert.equal(h.mobileSendLock.current, false);
  h.button('Send').props.onClick();
  h.conversations[1].resolve({ id: 'new-conversation', status: 'active' }); await h.flush(); assert.deepEqual(h.messages[1].args, ['new-conversation', 'New project\nhttps://portalink.test/new']);
  h.messages[1].resolve({ id: 'new-message' }); await h.flush(); assert.deepEqual(h.calls.filter(call => /confirmed/.test(call[0])), [['new-confirmed']]); assert.ok(h.button('Done')); h.unmount();
});

test('a pending provider send stays exclusive across MOBILE to WEB and WEB to MOBILE reopenings', async () => {
  for (const initial of ['mobile', 'web']) {
    const h = fixture({ presentation: initial, providerLock: true }); h.select(); h.button('Send').props.onClick(); h.conversations[0].resolve({ id: 'old-conversation', status: 'active' }); await h.flush();
    assert.equal(h.messages.length, 1); assert.equal(h.mobileSendLock.current, true);
    h.setPresentation(initial === 'mobile' ? 'web' : 'mobile'); h.reopen({ target: { title: 'New project', url: 'https://portalink.test/new', onSent: () => h.calls.push(['new-confirmed']) } }); h.select('new-recipient'); h.button('Send').props.onClick();
    assert.equal(h.conversations.length, 1, 'Crossing the presentation boundary cannot bypass an outstanding provider send.'); assert.equal(h.messages.length, 1); assert.match(text(nodes(h.tree).find(node => node.props.role === 'alert')), /previous send is still finishing/);
    h.messages[0].resolve({ id: 'old-message' }); await h.flush(); assert.equal(h.mobileSendLock.current, false); assert.equal(h.button('Done'), undefined); assert.equal(h.calls.some(call => call[0] === 'new-confirmed'), false);
    h.button('Send').props.onClick(); h.conversations[1].resolve({ id: 'new-conversation', status: 'active' }); await h.flush(); h.messages[1].resolve({ id: 'new-message' }); await h.flush();
    assert.equal(h.calls.filter(call => call[0] === 'new-confirmed').length, 1); assert.ok(h.button('Done')); h.unmount();
  }
});

test('unmounted MOBILE sends cannot continue a conversation or update state after their owner disappears', async () => {
  for (const phase of ['conversation', 'message']) for (const fails of [false, true]) {
    const h = fixture(); h.select(); h.button('Send').props.onClick();
    if (phase === 'message') { h.conversations[0].resolve({ id: 'conversation', status: 'active' }); await h.flush(); }
    h.unmount(); const request = phase === 'message' ? h.messages[0] : h.conversations[0];
    if (fails) request.reject(new Error('Late operation failure')); else request.resolve(phase === 'message' ? { id: 'message' } : { id: 'conversation', status: 'active' }); await h.flush();
    assert.equal(h.writesAfterUnmount, 0); assert.equal(h.calls.some(call => /confirmed/.test(call[0])), false); if (phase === 'conversation') assert.equal(h.messages.length, 0);
    assert.equal(h.listeners.size, 0); assert.equal(h.windowListeners.size, 0); assert.equal(h.viewportListeners.size, 0); assert.equal(h.timers.size, 0);
  }
});
