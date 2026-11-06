import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : '';

/** Actual navigation hook with controlled React commits, native input and WAAPI completion. */
function fixture({ enabled = true, reduce = false, appReduce = false, missingTrigger = false, missingHeading = false } = {}) {
  const slots = [], animations = [], listeners = new Map(), windowListeners = new Map(), mediaListeners = new Map(), focus = [], updates = [];
  let cursor = 0, effects = [], layout = [], mounted = true, dirty = false, api, view = 'share', scope = 'creator', paintedOpacity = '1';
  const equal = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const add = (map, name, callback) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(callback); };
  const remove = (map, name, callback) => { map.get(name)?.delete(callback); if (map.get(name)?.size === 0) map.delete(name); };
  const emit = (map, name, event = {}) => { for (const callback of [...(map.get(name) ?? [])]) if (map.get(name)?.has(callback)) callback(event); render(); };
  let document;
  class Element {
    constructor(name) { this.name = name; this.props = {}; this.dataset = {}; this.isConnected = true; this.scrollTop = 0; this.scrollLeft = 0; this.children = []; this.parentElement = null; this.events = new Map(); this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } }; }
    matches(selector) { return selector.includes('[data-catalogue-qr-trigger]') && Object.hasOwn(this.props, 'data-catalogue-qr-trigger'); }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
    contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    querySelector(selector) { if (selector === '.portfolio-share-body') return body; if (selector.includes('Back')) return back; if (selector.includes('h2')) return heading; return null; }
    querySelectorAll() { return []; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 420, height: 800, bottom: 800, right: 420 }; }
    setAttribute(name, value) { this.props[name] = value; }
    removeAttribute(name) { delete this.props[name]; }
    focus(options) { document.activeElement = this; this.focusOptions = options; focus.push({ target: this.name, options, top: body.scrollTop, left: body.scrollLeft }); }
    addEventListener(name, callback) { add(this.events, name, callback); }
    removeEventListener(name, callback) { remove(this.events, name, callback); }
    animate(keyframes, options) {
      let resolve, reject;
      const animation = { keyframes, options, playState: 'running', finished: new Promise((yes, no) => { resolve = yes; reject = no; }), cancel() { this.playState = 'idle'; this.cancelled = true; paintedOpacity = '1'; reject(new Error('Animation cancelled')); }, finish() { this.playState = 'finished'; paintedOpacity = '1'; resolve(); }, fail() { this.playState = 'idle'; reject(new Error('Animation failed')); } };
      animations.push(animation); return animation;
    }
  }
  const body = new Element('body'), dialog = new Element('dialog'), trigger = new Element('View QR code'), heading = new Element('QR heading'), back = new Element('Back'), catalogue = new Element('Catalogue'), opener = new Element('Catalogue Share');
  body.props.className = 'portfolio-share-body'; dialog.children = [back, body]; body.parentElement = dialog; trigger.parentElement = body; heading.parentElement = body; trigger.props['data-catalogue-qr-trigger'] = ''; catalogue.scrollTop = 735;
  document = { activeElement: opener, documentElement: new Element('html'), querySelector: selector => selector.includes('.reduce-motion') && appReduce ? dialog : null,
    addEventListener: (name, callback) => add(listeners, name, callback), removeEventListener: (name, callback) => remove(listeners, name, callback) };
  const media = { matches: reduce, addEventListener: (name, callback) => add(mediaListeners, name, callback), removeEventListener: (name, callback) => remove(mediaListeners, name, callback) };
  const window = { matchMedia: () => media, addEventListener: (name, callback) => add(windowListeners, name, callback), removeEventListener: (name, callback) => remove(windowListeners, name, callback), scrollTo() { assert.fail('Nested Share navigation must not scroll the Catalogue.'); } };
  const globals = { document, window, HTMLElement: Element, Element,
    getComputedStyle: () => ({ opacity: paintedOpacity, getPropertyValue: name => ({ '--m-fast': '120ms', '--m-base': '180ms', '--m-enter': 'linear', '--m-exit': 'linear' }[name] ?? '') }) };
  const effect = (queue, callback, dependencies) => { const index = cursor++, prior = slots[index]; if (!equal(prior?.dependencies, dependencies)) { slots[index] = { dependencies }; queue.push(() => { prior?.cleanup?.(); if (mounted) slots[index].cleanup = callback(); }); } };
  const react = { ...React,
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(initial) { const index = cursor++, slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, next => { if (mounted) { slot.value = typeof next === 'function' ? next(slot.value) : next; dirty = true; } }]; },
    useCallback(callback, dependencies) { const index = cursor++; if (!equal(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, callback }; return slots[index].callback; },
    useEffect(callback, dependencies) { effect(effects, callback, dependencies); }, useLayoutEffect(callback, dependencies) { effect(layout, callback, dependencies); } };
  const motion = sourceModule('src/presentation/motion/motion.ts', { 'react-dom': { flushSync: callback => callback() }, '../../utils/projectContinuity': {} }, globals);
  const navigation = sourceModule('src/features/sharing/useCatalogueQrNavigation.ts', { react, '../../presentation/motion/motion': motion }, globals);
  const dialogRef = { current: dialog };
  function render(changes = {}) {
    ({ enabled, view, scope } = { enabled, view, scope, ...changes });
    if (!mounted) return api;
    for (let pass = 0; pass === 0 || dirty; pass++) { assert.ok(pass < 12); dirty = false; cursor = 0; effects = []; layout = []; api = navigation.useCatalogueQrNavigation({ enabled, view, scope, dialog: dialogRef }); api.trigger.current = view === 'share' && !missingTrigger ? trigger : null; api.heading.current = view === 'qr' && !missingHeading ? heading : null; trigger.isConnected = view === 'share'; heading.isConnected = view === 'qr'; body.children = view === 'qr' ? [heading] : [trigger]; layout.splice(0).forEach(callback => callback()); effects.splice(0).forEach(callback => callback()); }
    return api;
  }
  render();
  return { body, dialog, trigger, heading, back, catalogue, document, animations, focus, updates, listeners, windowListeners, mediaListeners, render,
    open() { api.open(() => { updates.push('qr'); view = 'qr'; }); render(); }, backToShare() { api.back(() => { updates.push('share'); view = 'share'; }); render(); },
    paint(opacity) { paintedOpacity = String(opacity); },
    input(name, target = body) { const event = { target, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; emit(body.events, name, event); emit(listeners, name, event); return event; },
    pop() { emit(windowListeners, 'popstate'); },
    reduce(value) { media.matches = value; emit(mediaListeners, 'change', { matches: value }); },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
    get view() { return view; },
  };
}

test('Share to QR swaps immediately, focuses the heading and restores Share scroll before Back focus', () => {
  const h = fixture(), body = h.body; h.body.scrollTop = 173; h.body.scrollLeft = 11; h.open();
  assert.equal(h.view, 'qr'); assert.deepEqual(h.updates, ['qr']); assert.equal(h.body, body); assert.equal(body.scrollTop, 0); assert.equal(body.scrollLeft, 0);
  assert.equal(h.document.activeElement, h.heading); assert.equal(h.heading.focusOptions.preventScroll, true); assert.equal(h.animations.length, 1); assert.equal(h.animations[0].options.duration, 120);
  assert.deepEqual(Array.from(h.animations[0].keyframes, frame => frame.opacity), [0, 1]); assert.equal(body.dataset.catalogueQrMotion, '');
  h.body.scrollTop = 290; h.backToShare();
  assert.equal(h.view, 'share'); assert.deepEqual(h.updates, ['qr', 'share']); assert.equal(h.document.activeElement, h.trigger); assert.equal(h.trigger.focusOptions.preventScroll, true);
  assert.equal(h.focus.at(-1).top, 173); assert.equal(h.focus.at(-1).left, 11); assert.equal(h.catalogue.scrollTop, 735); assert.equal(h.animations[0].cancelled, true); h.unmount();
});

test('rapid Share and QR reversals capture painted opacity before cancellation without waiting for animation', async () => {
  const h = fixture(); h.open(); h.paint(0.37); h.backToShare();
  assert.equal(h.animations[0].cancelled, true); assert.equal(h.animations[1].keyframes[0].opacity, 0.37);
  await Promise.resolve(); assert.equal(h.animations[1].cancelled, undefined, 'An older rejected finished promise cannot cancel its replacement.'); assert.equal(h.body.dataset.catalogueQrMotion, '');
  h.paint(0.62); h.open(); assert.equal(h.animations[1].cancelled, true); assert.equal(h.animations[2].keyframes[0].opacity, 0.62); assert.deepEqual(h.updates, ['qr', 'share', 'qr']); assert.equal(h.document.activeElement, h.heading);
  h.animations[2].finish(); await Promise.resolve(); assert.equal(h.body.dataset.catalogueQrMotion, undefined); h.unmount();
});

test('next body input cancels only decorative motion and never consumes the interaction', () => {
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    const h = fixture(); h.open(); const event = h.input(type); assert.equal(h.animations[0].cancelled, true); assert.equal(event.prevented, undefined); assert.equal(event.stopped, undefined); assert.equal(h.body.dataset.catalogueQrMotion, undefined); h.unmount();
  }
  const h = fixture(); h.open(); h.backToShare(); const active = h.animations.at(-1); h.input('pointerdown', h.trigger); assert.equal(active.cancelled, undefined, 'The QR trigger keeps current paint available for its own navigation handler.'); h.unmount();
});

test('native Back, scope changes, presentation changes and unmount clean up the current animation and listeners', async () => {
  for (const cause of ['back', 'scope', 'presentation', 'unmount']) {
    const h = fixture(); h.open(); const old = h.animations[0];
    if (cause === 'back') h.pop(); else if (cause === 'scope') h.render({ scope: 'other-creator' }); else if (cause === 'presentation') h.render({ enabled: false }); else h.unmount();
    assert.equal(old.cancelled, true); assert.equal(h.body.dataset.catalogueQrMotion, undefined); await Promise.resolve();
    h.unmount(); assert.equal(h.body.events.size, 0); assert.equal(h.windowListeners.size, 0); assert.equal(h.mediaListeners.size, 0);
  }
});

test('app and OS reduced motion retain immediate navigation and focus without animation', () => {
  for (const options of [{ reduce: true }, { appReduce: true }]) {
    const h = fixture(options); h.body.scrollTop = 144; h.open(); assert.equal(h.document.activeElement, h.heading); assert.equal(h.animations.length, 0); h.backToShare(); assert.equal(h.body.scrollTop, 144); assert.equal(h.document.activeElement, h.trigger); h.unmount();
  }
  const h = fixture(); h.open(); h.reduce(true); assert.equal(h.animations[0].cancelled, true); h.backToShare(); assert.equal(h.animations.length, 1); h.unmount();
});

test('WEB retains its original navigation callback behavior without mobile focus, scrolling or motion', () => {
  const h = fixture({ enabled: false }); h.body.scrollTop = 184; h.open(); h.backToShare();
  assert.deepEqual(h.updates, ['qr', 'share']); assert.equal(h.animations.length, 0); assert.equal(h.focus.length, 0); assert.equal(h.body.scrollTop, 184); assert.equal(h.body.events.size, 0); assert.equal(h.windowListeners.size, 0); h.unmount();
});

test('missing focus refs and rejected or unavailable WAAPI never delay the requested view change', async () => {
  const fallback = fixture({ missingTrigger: true, missingHeading: true }); fallback.body.scrollTop = 169; fallback.open(); assert.equal(fallback.document.activeElement, fallback.back); fallback.backToShare(); assert.equal(fallback.document.activeElement, fallback.back); assert.equal(fallback.focus.at(-1).top, 169); assert.equal(fallback.back.focusOptions.preventScroll, true); fallback.unmount();
  const failed = fixture(); failed.open(); failed.animations[0].fail(); await Promise.resolve(); assert.equal(failed.view, 'qr'); assert.equal(failed.document.activeElement, failed.heading); assert.equal(failed.body.dataset.catalogueQrMotion, undefined); failed.unmount();
  const unavailable = fixture(); unavailable.body.animate = undefined; unavailable.open(); assert.equal(unavailable.view, 'qr'); assert.equal(unavailable.document.activeElement, unavailable.heading); assert.equal(unavailable.animations.length, 0); unavailable.unmount();
});

function shareDialogFixture(presentation = 'mobile') {
  const slots = [], calls = [], trigger = { current: null }, heading = { current: null }, options = [];
  let cursor = 0, closed = 0;
  const react = { ...React, useEffect() {}, useId: () => 'share-heading', useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; }, useState(initial) { const index = cursor++, slot = slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; } };
  const { ProfileShareDialog } = sourceModule('src/features/sharing/ProfileShareDialog.tsx', {
    react, '../citations/publicOrigin': { PUBLIC_ORIGIN: 'https://portalinknetworks.com' },
    './useCatalogueQrNavigation': { useCatalogueQrNavigation(value) { options.push(value); return { trigger, heading, open(update) { calls.push('open'); update(); }, back(update) { calls.push('back'); update(); } }; } },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back' }, '../../contexts/ProfileDataContext': { useProfileData: () => ({ invalidateProfiles() {} }) },
    '../../contexts/ServicesContext': { useServices: () => ({ profiles: {} }) }, '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../../hooks/useModalFocus': { useModalFocus() {} }, '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    '../../components/ui/ModalPortal': { ModalPortal: 'modal-portal' }, '../../components/ui/Button': { Button: 'button' }, '../../utils/copyPublicLink': {},
    '../../components/profile/CreatorAvatar': { CreatorAvatar: 'avatar' }, './PortfolioPreview': { PortfolioPreview: 'preview' }, './shareModel': sourceModule('src/features/sharing/shareModel.ts'), '../publishing/firstProject': {},
    './usePortfolioAddressValidation': { usePortfolioAddressValidation: () => ({ status: 'current', message: 'Current' }) }, './PortfolioNoteComposer': { PortfolioNoteComposer: 'note-composer' }, './PortfolioQrScreen': { PortfolioQrScreen: 'qr-screen' }, './portfolioQr': {},
    './PortfolioSharePreview': { PortfolioSharePreview: 'identity-preview', PortfolioPreviewBoundary: 'preview-boundary' }, './sharing.css': {}, 'lean-qr': {}, 'lucide-react': new Proxy({}, { get: (_target, key) => key }),
  }, { React, window: { location: { origin: 'https://preview.invalid' } }, localStorage: { setItem() {} }, navigator: {}, DOMException });
  const profile = { id: 'creator', name: 'Creator', handle: 'mira', projects: [], categories: [] };
  const render = () => { cursor = 0; return ProfileShareDialog({ profile, owner: false, onClose: () => closed++ }); };
  return { calls, trigger, heading, options, render, button(label) { return nodes(render()).find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label)); }, get closed() { return closed; } };
}

test('the actual MOBILE Share trigger and QR Back route through the navigation hook and retain its focus refs', () => {
  const h = shareDialogFixture(), trigger = h.button('View QR code');
  assert.equal(trigger.ref, h.trigger); assert.equal(trigger.props['data-catalogue-qr-trigger'], true); assert.equal(h.options.at(-1).enabled, true); assert.equal(h.options.at(-1).scope, 'creator');
  trigger.props.onClick(); let tree = h.render(); assert.deepEqual(h.calls, ['open']); assert.equal(nodes(tree).find(node => node.type === 'qr-screen').props.headingRef, h.heading);
  const back = nodes(tree).find(node => node.props['aria-label'] === 'Back'), delegated = nodes(tree).find(node => node.type === 'screen-back'); assert.equal(delegated.props.action, back.props.onClick); back.props.onClick();
  tree = h.render(); assert.deepEqual(h.calls, ['open', 'back']); assert.ok(h.button('View QR code')); assert.equal(nodes(tree).some(node => node.type === 'qr-screen'), false);
  h.button('Back').props.onClick(); assert.equal(h.closed, 1); assert.deepEqual(h.calls, ['open', 'back']);
  const web = shareDialogFixture('web'); assert.equal(web.render().type, 'modal-portal'); assert.equal(web.options.at(-1).enabled, false); assert.equal(web.button('View QR code'), undefined); web.button('Close share').props.onClick(); assert.equal(web.closed, 1); assert.deepEqual(web.calls, []);
});

test('the actual QR heading accepts its navigation ref and becomes programmatically focusable only when supplied', () => {
  const { PortfolioQrScreen } = sourceModule('src/features/sharing/PortfolioQrScreen.tsx', {
    react: { useRef: () => ({ current: null }), useState: initial => [initial, () => {}], useEffect() {} }, 'lucide-react': new Proxy({}, { get: (_target, key) => key }),
    '../../components/profile/CreatorAvatar': { CreatorAvatar: 'avatar' }, '../../components/ui/Button': { Button: 'button' }, './portfolioQr': {},
  }, { React });
  const props = { profile: { name: 'Creator', projects: [], categories: [] }, url: 'https://portalinknetworks.com/mira', heading: 'qr-heading', busy: false, onSave() {}, onCopy() {}, onSend() {} }, headingRef = { current: null };
  const target = nodes(PortfolioQrScreen({ ...props, headingRef })).find(node => node.type === 'h2'); assert.equal(target.ref, headingRef); assert.equal(target.props.tabIndex, -1); assert.equal(target.props.id, 'qr-heading');
  assert.equal(nodes(PortfolioQrScreen(props)).find(node => node.type === 'h2').props.tabIndex, undefined);
});
