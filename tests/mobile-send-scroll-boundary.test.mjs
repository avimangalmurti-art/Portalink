import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

/** Real boundary hook with native event targets, mutable scroll extents and effect cleanup. */
function fixture({ enabled = true, range = 800, position = 200 } = {}) {
  const registrations = [], slots = [];
  let cursor = 0, scrollWrites = 0, focusWrites = 0;
  class Element {
    constructor(parent = null, attributes = {}) {
      this.parentElement = parent; this.attributes = attributes; this.listeners = new Map();
      this.scrollHeight = range + 400; this.clientHeight = 400; this.position = position; this.isConnected = true;
    }
    contains(target) { for (let node = target; node; node = node.parentElement) if (node === this) return true; return false; }
    matches(selector) { return selector === '[data-mobile-scroll-end]' && Object.hasOwn(this.attributes, 'data-mobile-scroll-end'); }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    addEventListener(name, callback, options) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(callback); registrations.push({ node: this, name, callback, options }); }
    removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); if (!this.listeners.get(name)?.size) this.listeners.delete(name); }
    emit(name, values = {}) {
      const event = { type: name, target: this, cancelable: true, prevented: false, preventDefault() { if (this.cancelable) this.prevented = true; }, ...values };
      for (const callback of [...(this.listeners.get(name) ?? [])]) callback(event);
      return event;
    }
    get scrollTop() { return this.position; }
    set scrollTop(value) { scrollWrites++; this.position = value; }
    focus() { focusWrites++; }
  }
  const overlay = new Element(), header = new Element(overlay), input = new Element(header), list = new Element(overlay, { 'data-mobile-scroll-end': '' }), row = new Element(list), footer = new Element(overlay);
  const outside = new Element(null, { 'data-mobile-scroll-end': '' }), detached = new Element(outside);
  const ref = { current: overlay };
  const effect = (callback, dependencies) => {
    const index = cursor++, previous = slots[index];
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous.dependencies[item]))) slots[index] = { callback, dependencies, cleanup: previous?.cleanup, pending: true };
  };
  const react = { useLayoutEffect: effect, useEffect: effect, useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; } };
  const { useRecipientScrollBoundary } = sourceModule('src/features/sharing/useRecipientScrollBoundary.ts', { react }, { HTMLElement: Element, Element, Node: Element });
  const render = () => { cursor = 0; useRecipientScrollBoundary(enabled, ref); for (const slot of slots) if (slot?.pending) { slot.pending = false; slot.cleanup?.(); slot.cleanup = slot.callback(); } };
  render();
  const point = (x, y, identifier = 1) => ({ identifier, clientX: x, clientY: y });
  const touches = points => Object.assign(points, { item: index => points[index] ?? null });
  return { overlay, header, input, list, row, footer, outside, detached, ref, registrations,
    wheel(target = row, deltaY = 50, extra = {}) { return overlay.emit('wheel', { target, deltaX: 0, deltaY, ctrlKey: false, metaKey: false, ...extra }); },
    start(target = row, x = 180, y = 400, extra = {}) { return overlay.emit('touchstart', { target, touches: touches([point(x, y)]), ...extra }); },
    move(target = row, x = 180, y = 350, extra = {}) { return overlay.emit('touchmove', { target, touches: touches([point(x, y)]), ...extra }); },
    end(name = 'touchend') { return overlay.emit(name, { touches: touches([]) }); },
    pinch(name, target = row) { return overlay.emit(name, { target, touches: touches([point(170, 390), point(220, 420, 2)]) }); },
    setEnabled(value) { enabled = value; render(); },
    cleanup() { for (const slot of slots) slot?.cleanup?.(); },
    get scrollWrites() { return scrollWrites; }, get focusWrites() { return focusWrites; },
  };
}

test('MOBILE recipient wheel scrolling stays native inside the list and cannot chain through its ends', () => {
  const h = fixture();
  for (const delta of [-75, 75]) assert.equal(h.wheel(h.row, delta).prevented, false, 'A list with room keeps native scrolling');
  h.list.position = 0;
  assert.equal(h.wheel(h.row, -30).prevented, true); assert.equal(h.wheel(h.row, 30).prevented, false);
  h.list.position = 800;
  assert.equal(h.wheel(h.row, 30).prevented, true); assert.equal(h.wheel(h.row, -30).prevented, false);
  assert.equal(h.scrollWrites, 0, 'Containment must not reposition either reader or recipients'); assert.equal(h.focusWrites, 0);
  h.cleanup();
});

test('header, footer, empty-list and outside-recipient wheel gestures never scroll the reader', () => {
  const h = fixture();
  for (const target of [h.header, h.input, h.footer, h.overlay, h.detached]) for (const delta of [-50, 50]) assert.equal(h.wheel(target, delta).prevented, true);
  h.list.scrollHeight = h.list.clientHeight;
  for (const delta of [-50, 50]) assert.equal(h.wheel(h.row, delta).prevented, true);
  h.cleanup();
});

test('horizontal movement and browser wheel zoom are not consumed by the vertical recipient boundary', () => {
  const h = fixture({ position: 0 });
  for (const extra of [{ deltaX: 80, deltaY: 10 }, { deltaX: -80, deltaY: -10 }, { deltaY: 0 }, { ctrlKey: true }, { metaKey: true }]) assert.equal(h.wheel(h.header, 50, extra).prevented, false);
  h.cleanup();
});

test('one-finger touch scroll remains native in a valid direction and blocks overscroll at either end', () => {
  const h = fixture();
  h.start(); assert.equal(h.move(h.row, 180, 350).prevented, false);
  h.list.position = 800; assert.equal(h.move(h.row, 180, 300).prevented, true);
  assert.equal(h.move(h.row, 180, 350).prevented, false, 'Reversing at the bottom must be immediately controllable');
  h.list.position = 0; assert.equal(h.move(h.row, 180, 400).prevented, true);
  assert.equal(h.move(h.row, 180, 350).prevented, false, 'Reversing at the top can scroll the list again');
  assert.equal(h.scrollWrites, 0); assert.equal(h.focusWrites, 0); h.cleanup();
});

test('touch gestures over screen chrome or a non-scrollable list cannot move the underlying project', () => {
  const h = fixture({ range: 0, position: 0 });
  for (const target of [h.header, h.footer, h.row, h.overlay]) { h.start(target); assert.equal(h.move(target).prevented, true); h.end(); }
  h.cleanup();
});

test('pinch and horizontal touch gestures remain available, and a cancelled gesture cannot leak into the next one', () => {
  const h = fixture({ position: 0 });
  assert.equal(h.pinch('touchstart').prevented, false); assert.equal(h.pinch('touchmove').prevented, false); h.end();
  h.start(); assert.equal(h.move(h.row, 260, 390).prevented, false); h.end('touchcancel');
  assert.equal(h.move(h.row, 180, 450).prevented, false, 'A cancelled sequence has no vertical gesture to consume');
  h.start(h.row, 180, 400); assert.equal(h.move(h.row, 180, 450).prevented, true, 'A fresh single touch starts normal top-edge containment');
  h.cleanup();
});

test('disabled WEB/inline boundary registers nothing and a presentation change removes every active listener', () => {
  const disabled = fixture({ enabled: false });
  assert.equal(disabled.overlay.listeners.size, 0); assert.equal(disabled.wheel(disabled.header).prevented, false); disabled.cleanup();
  const h = fixture(); assert.ok(h.overlay.listeners.has('wheel')); assert.ok(h.overlay.listeners.has('touchmove'));
  for (const name of ['wheel', 'touchmove']) assert.ok(h.registrations.some(entry => entry.name === name && entry.options?.passive === false), `${name} must be able to prevent scroll chaining`);
  h.start(); h.setEnabled(false); assert.equal(h.overlay.listeners.size, 0); assert.equal(h.wheel(h.header).prevented, false);
  h.setEnabled(true); assert.equal(h.move(h.row, 180, 500).prevented, false, 'Re-enabling cannot inherit the old touch position');
  h.cleanup(); assert.equal(h.overlay.listeners.size, 0); assert.equal(h.scrollWrites, 0); assert.equal(h.focusWrites, 0);
});


test('fractional end positions and newly arriving recipients keep containment accurate without a remount', () => {
  const h = fixture({ range: 0, position: 0 });
  assert.equal(h.wheel().prevented, true);
  h.list.scrollHeight = 1200;
  assert.equal(h.wheel().prevented, false, 'A completed directory load immediately permits native list scrolling');
  h.list.position = 799.5;
  assert.equal(h.wheel(h.row, 40).prevented, true, 'A fractional last pixel must not chain into the reader');
  assert.equal(h.wheel(h.row, -40).prevented, false);
  h.list.position = -12;
  assert.equal(h.wheel(h.row, -40).prevented, true, 'Safari top rubber-band positions do not grant an outward scroll');
  assert.equal(h.wheel(h.row, 40).prevented, false);
  h.cleanup();
});

test('a pinch interrupt clears one-finger history and ending it never consumes a new gesture', () => {
  const h = fixture({ position: 0 });
  h.start(); h.pinch('touchmove');
  assert.equal(h.move(h.row, 180, 450).prevented, false, 'The first remaining finger only establishes a new origin');
  assert.equal(h.move(h.row, 180, 500).prevented, true, 'Subsequent outward movement is contained normally');
  h.end(); assert.equal(h.move(h.row, 180, 550).prevented, false); h.cleanup();
});
