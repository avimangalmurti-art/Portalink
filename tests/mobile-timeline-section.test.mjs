import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

function events() {
  const listeners = new Map();
  return {
    addEventListener(type, callback, options) { if (!listeners.has(type)) listeners.set(type, new Map()); listeners.get(type).set(callback, options); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type, extra = {}) { for (const callback of [...listeners.get(type)?.keys() ?? []]) callback({ type, target: this, ...extra }); },
    count() { return [...listeners.values()].reduce((total, handlers) => total + handlers.size, 0); },
    listeners,
  };
}

class Node {
  constructor({ parent = null, top = 0, bottom = 912, left = 0, right = 420, style = {}, ...attributes } = {}) {
    Object.assign(this, events(), { parentElement: parent, bounds: { top, bottom, left, right }, isConnected: true,
      style: { overflowY: 'visible', overflowX: 'visible', display: 'block', visibility: 'visible', position: 'static', ...style },
      scrollTop: 0, scrollHeight: bottom - top, clientHeight: bottom - top, clientWidth: right - left, blocked: false, hidden: false, ...attributes });
  }
  getBoundingClientRect() { this.reads = (this.reads ?? 0) + 1; return { ...this.bounds, width: this.bounds.right - this.bounds.left, height: this.bounds.bottom - this.bounds.top }; }
  getClientRects() { return this.hidden || this.style.display === 'none' ? [] : [this.getBoundingClientRect()]; }
  contains(target) { for (let node = target; node; node = node.parentElement) if (node === this) return true; return false; }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector === 'button' && node.tagName === 'BUTTON') return node;
      if ((selector.includes('[inert]') || selector.includes('[aria-hidden="true"]')) && node.blocked) return node;
      if (selector.includes('[data-profile-page]') && node.profilePage) return node;
      if (selector.includes('main') && node.main) return node;
    }
    return null;
  }
  querySelector(selector) { if (selector.includes('profile-header-region')) return this.identity ?? null; return null; }
  focus() { assert.fail('Timeline indication cannot move focus.'); }
  scrollIntoView() { assert.fail('Timeline indication cannot scroll into view.'); }
  scrollTo() { assert.fail('Timeline indication cannot set a scroll position.'); }
}

/** Run the actual hook lifecycle with real geometry/event boundaries and no React DOM substitute. */
function fixture(initial = {}) {
  const slots = [], frames = new Map(), observers = [];
  let cursor = 0, dirty = true, effects = [], result, nextFrame = 0, screenActive = true;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = { ...React,
    useState(value) { const index = cursor++; slots[index] ??= { value: typeof value === 'function' ? value() : value }; return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useRef(value) { const index = cursor++; slots[index] ??= { current: value }; return slots[index]; },
    useMemo(factory, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useEffect(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const previous = slots[index]; slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); }); } },
  };
  react.useLayoutEffect = react.useEffect;
  react.useCallback = (callback, deps) => react.useMemo(() => callback, deps);
  const documentRoot = new Node(), body = new Node({ parent: documentRoot });
  const owner = new Node({ parent: body, top: 80, bottom: 900, style: { overflowY: 'auto' }, scrollHeight: 2400 });
  const scope = new Node({ parent: owner, top: 80, bottom: 2400, profilePage: true });
  const toolbar = new Node({ parent: scope, top: 240, bottom: 320, style: { position: 'sticky' } });
  const identity = new Node({ parent: scope, top: 80, bottom: 320, style: { position: 'sticky' } }); scope.identity = identity;
  const root = new Node({ parent: scope, top: 320, bottom: 2400 });
  const pair = new Node({ parent: root, top: 1600, bottom: 2000 });
  const focused = new Node({ parent: toolbar, tagName: 'BUTTON' });
  const viewport = Object.assign(events(), { offsetTop: 0, offsetLeft: 0, width: 420, height: 912, scale: 1 });
  const window = Object.assign(events(), { innerWidth: 420, innerHeight: 912, visualViewport: viewport, getComputedStyle: node => node.style });
  const document = Object.assign(events(), { documentElement: documentRoot, body, scrollingElement: documentRoot,
    visibilityState: 'visible', activeElement: focused, querySelector: () => null });
  const schedule = callback => { frames.set(++nextFrame, callback); return nextFrame; }, cancel = id => frames.delete(id);
  Object.assign(window, { requestAnimationFrame: schedule, cancelAnimationFrame: cancel });
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = new Set(); this.disconnected = false; observers.push(this); }
    observe(node) { this.targets.add(node); }
    disconnect() { this.disconnected = true; this.targets.clear(); }
    emit() { this.callback([]); }
  }
  const { useTimelineSection } = sourceModule('src/features/journey/useTimelineSection.ts', {
    react, '../../presentation/mobile/MobileBackNavigation': { useMobileScreenActive: () => screenActive },
  }, { window, document, HTMLElement: Node, Element: Node, getComputedStyle: node => node.style,
    ResizeObserver: Observer, requestAnimationFrame: schedule, cancelAnimationFrame: cancel });
  let options = { enabled: true, rootRef: { current: root }, toolbarRef: { current: toolbar }, pairRef: { current: pair }, contentKey: 'newest:pair:early:recent', ...initial };
  const render = () => {
    for (let count = 0; dirty; count++) {
      assert.ok(count < 15, 'The hook settles without repeated state updates.');
      cursor = 0; dirty = false; effects = []; result = useTimelineSection(options); effects.forEach(callback => callback());
    }
    return result;
  };
  const flush = () => {
    render();
    for (let count = 0; frames.size; count++) {
      assert.ok(count < 8, 'The hook schedules events, not a continuous animation/polling loop.');
      const due = [...frames.values()]; frames.clear(); due.forEach(callback => callback()); render();
    }
    return result;
  };
  return { window, document, viewport, documentRoot, body, owner, scope, toolbar, identity, root, pair, focused, observers, frames,
    get value() { return flush(); },
    update(next) { options = { ...options, ...next }; dirty = true; return flush(); },
    screen(active) { screenActive = active; dirty = true; return flush(); },
    flush,
    move(top, { bottom = top + 400, scrollTop = owner.scrollTop } = {}) { pair.bounds.top = top; pair.bounds.bottom = bottom; owner.scrollTop = scrollTop; document.emit('scroll', { target: owner }); return flush(); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('continuous mobile Timeline follows Then/Now entering the reading area and restores on reverse scroll', () => {
  const f = fixture(); assert.equal(f.value.atPairs, false);
  assert.equal(f.move(560, { scrollTop: 1040 }).atPairs, true);
  assert.equal(f.move(950, { scrollTop: 650 }).atPairs, false);
  assert.equal(f.document.activeElement, f.focused); assert.equal(f.owner.scrollTop, 650);
  f.dispose();
});

test('short final pairs become current at the reachable scroll end only while visibly on screen', () => {
  const f = fixture(); f.flush();
  const end = f.owner.scrollHeight - f.owner.clientHeight;
  assert.equal(f.move(740, { scrollTop: end - 100 }).atPairs, false);
  assert.equal(f.move(740, { scrollTop: end }).atPairs, true);
  assert.equal(f.move(940, { scrollTop: end }).atPairs, false, 'An off-screen pair cannot become current merely because the scroller is at its end.');
  f.owner.scrollHeight = f.owner.clientHeight; assert.equal(f.move(740, { scrollTop: 0 }).atPairs, false, 'A non-scrollable short page has no end-of-scroll transition.');
  f.dispose();
});

test('reading geometry clips the nested scroller to visual viewport and clipping ancestors', () => {
  const f = fixture();
  f.scope.style.overflowY = 'hidden'; f.scope.bounds.bottom = 520;
  assert.equal(f.move(500, { scrollTop: 100 }).atPairs, false,'A clipped ancestor reduces the reading region even when the scroll owner extends further.');
  assert.equal(f.move(350, { scrollTop: 180 }).atPairs, true);
  f.viewport.offsetTop = 80; f.viewport.height = 400;
  assert.equal(f.move(430, { scrollTop: 100 }).atPairs, false);
  assert.equal(f.move(350, { scrollTop: 180 }).atPairs, true);
  assert.equal(f.owner.scrollTop, 180); assert.equal(f.document.activeElement, f.focused);
  f.dispose();
});

test('opening a local popup freezes the current indication and releases observer ownership until dismissal', () => {
  const f = fixture(); f.move(560, { scrollTop: 1040 }); assert.equal(f.value.atPairs,true);
  f.update({paused:true}); assert.equal(f.value.atPairs,true);
  assert.equal(f.document.count()+f.window.count()+f.viewport.count(),0);
  assert.ok(f.observers.every(observer=>observer.disconnected));
  f.move(950,{scrollTop:650}); assert.equal(f.value.atPairs,true);
  f.update({paused:false}); assert.equal(f.value.atPairs,false);
  assert.equal(f.document.activeElement,f.focused); f.dispose();
});

test('explicit sort reset resists toolbar focus scroll but yields to deliberate scroll intent over the toolbar', () => {
  const f = fixture(); f.move(560, { scrollTop: 1040 }); assert.equal(f.value.atPairs, true);
  f.value.reset(); assert.equal(f.value.atPairs, false);
  f.document.emit('scroll', { target: f.owner }); f.flush(); assert.equal(f.value.atPairs, false);
  f.document.emit('pointerdown', { target: f.focused }); f.flush(); assert.equal(f.value.atPairs, false);
  f.document.emit('keydown', { target: f.focused, key: 'Enter' }); f.flush(); assert.equal(f.value.atPairs, false);
  f.document.emit('keydown', { target: f.focused, key: ' ' }); f.flush();
  assert.equal(f.value.atPairs, false,'Space activates a focused toolbar button and must preserve its explicit selection until the normal click.');
  for (const [type, extra] of [['keydown', { key: 'ArrowDown' }], ['keydown', { key: 'PageDown' }], ['wheel', {}], ['touchmove', {}]]) {
    f.value.reset(); assert.equal(f.value.atPairs, false);
    f.document.emit(type, { target: f.focused, ...extra }); f.flush();
    assert.equal(f.value.atPairs, true, `${type} ${extra.key ?? ''} over the toolbar represents genuine scrolling.`);
    assert.equal(f.document.activeElement, f.focused,'Tracking must leave the toolbar focus in place.');
  }
  f.value.reset(); assert.equal(f.value.atPairs, false);
  f.document.emit('keydown', { target: f.root, key: 'x' }); f.flush(); assert.equal(f.value.atPairs, false);
  f.document.emit('wheel', { target: f.root }); f.flush(); assert.equal(f.value.atPairs, true);
  for (const [type, extra] of [['touchmove', {}], ['pointerdown', {}], ['keydown', { key: 'PageDown' }], ['keydown', { key: ' ' }]]) {
    f.value.reset(); assert.equal(f.value.atPairs, false);
    f.document.emit(type, { target: f.root, ...extra }); f.flush(); assert.equal(f.value.atPairs, true, `${type} resumes scroll tracking.`);
  }
  assert.equal(f.document.activeElement, f.focused); f.dispose();
});

test('disabled, retained inactive and missing-pair lifecycles attach no tracking work', () => {
  for (const setup of [{ enabled: false }, { pairRef: { current: null } }]) {
    const f = fixture(setup); assert.equal(f.value.atPairs, false);
    assert.equal(f.document.count() + f.window.count() + f.viewport.count(), 0);
    assert.equal(f.observers.length, 0); f.dispose();
  }
  const f = fixture(); f.screen(false);
  assert.equal(f.value.atPairs, false); assert.equal(f.document.count() + f.window.count() + f.viewport.count(), 0);
  assert.ok(f.observers.every(observer => observer.disconnected));
  f.screen(true); assert.equal(f.move(560, { scrollTop: 1040 }).atPairs, true); f.dispose();
});

test('hidden document, inert ancestors and zero-size or disconnected content cannot update the current section', () => {
  const f = fixture(); f.flush();
  f.document.visibilityState = 'hidden'; assert.equal(f.move(560, { scrollTop: 1040 }).atPairs, false);
  f.document.visibilityState = 'visible'; f.document.emit('visibilitychange'); f.flush(); assert.equal(f.value.atPairs, true);
  f.scope.blocked = true; f.move(950, { scrollTop: 650 }); assert.equal(f.value.atPairs, true);
  f.scope.blocked = false; f.root.hidden = true; f.move(950); assert.equal(f.value.atPairs, true);
  f.root.hidden = false; f.pair.isConnected = false; f.move(950); assert.equal(f.value.atPairs, true);
  f.pair.isConnected = true; f.document.emit('scroll', { target: f.owner }); f.flush(); assert.equal(f.value.atPairs, false);
  f.dispose();
});

test('scroll bursts coalesce and resize/resume events remeasure without layout, focus or history writes', () => {
  const f = fixture(); f.flush(); f.pair.bounds.top = 560; f.pair.bounds.bottom = 960;
  for (let count = 0; count < 10; count++) f.document.emit('scroll', { target: f.owner });
  assert.equal(f.frames.size, 1); f.flush(); assert.equal(f.value.atPairs, true);
  f.pair.bounds.top = 950; f.pair.bounds.bottom = 1350;
  f.viewport.emit('resize'); f.flush(); assert.equal(f.value.atPairs, false);
  f.pair.bounds.top = 560; f.pair.bounds.bottom = 960;
  f.window.emit('pageshow', { persisted: true }); f.flush(); assert.equal(f.value.atPairs, true);
  f.pair.bounds.top = 950; f.pair.bounds.bottom = 1350;
  f.observers.at(-1).emit(); f.flush(); assert.equal(f.value.atPairs, false);
  assert.equal(f.owner.scrollTop, 0); assert.equal(f.document.activeElement, f.focused); f.dispose();
});

test('pinch viewport changes do not reinterpret the selected reading section', () => {
  const f=fixture(); f.move(560,{scrollTop:1040}); assert.equal(f.value.atPairs,true);
  f.viewport.scale=2; f.move(950,{scrollTop:650}); assert.equal(f.value.atPairs,true);
  f.viewport.scale=1; f.viewport.emit('resize'); f.flush(); assert.equal(f.value.atPairs,false);
  assert.equal(f.owner.scrollTop,650); f.dispose();
});

test('document scrolling is supported without a nested scroll owner or VisualViewport API',()=>{
  const f=fixture(); f.owner.style.overflowY='visible'; f.window.visualViewport=undefined;
  f.documentRoot.scrollHeight=2400; f.documentRoot.scrollTop=1040;
  assert.equal(f.move(560).atPairs,true);
  f.move(1000); assert.equal(f.value.atPairs,false);
  assert.equal(f.documentRoot.scrollTop,1040); f.dispose();
});

test('content and portalled toolbar changes replace observer ownership; disable and unmount cancel pending frames', () => {
  const f = fixture(); f.flush(); const first = f.observers.at(-1);
  f.update({ contentKey: 'oldest:new-pair:early:recent' }); assert.equal(first.disconnected, true);
  const second = f.observers.at(-1), replacement = new Node({ parent: f.scope, top: 240, bottom: 320 });
  f.update({ toolbarRef: { current: replacement }, toolbarHost: f.scope }); assert.equal(second.disconnected, true);
  assert.ok(f.observers.at(-1).targets.has(replacement));
  f.document.emit('scroll', { target: f.owner }); assert.equal(f.frames.size, 1);
  f.update({ enabled: false }); assert.equal(f.frames.size, 0); assert.equal(f.value.atPairs, false);
  assert.equal(f.document.count() + f.window.count() + f.viewport.count(), 0);
  f.update({ enabled: true }); f.document.emit('scroll', { target: f.owner }); assert.equal(f.frames.size, 1);
  f.dispose(); assert.equal(f.frames.size, 0); assert.equal(f.document.count() + f.window.count() + f.viewport.count(), 0);
  assert.ok(f.observers.every(observer => observer.disconnected));
});

test('a delayed pair starts tracking after it is committed and remeasures the new content without moving anything',()=>{
 const pairRef={current:null},f=fixture({enabled:false,pairRef});
 assert.equal(f.value.atPairs,false); assert.equal(f.observers.length,0);
 f.pair.bounds.top=560; f.pair.bounds.bottom=960; pairRef.current=f.pair;
 f.update({enabled:true,contentKey:'newest:loaded-pair:early:recent'}); assert.equal(f.value.atPairs,true);
 f.pair.bounds.top=950; f.pair.bounds.bottom=1350;
 f.update({contentKey:'newest:replacement-pair:another:recent'}); assert.equal(f.value.atPairs,false);
 assert.equal(f.owner.scrollTop,0); assert.equal(f.document.activeElement,f.focused); f.dispose();
});
