import {motionFixture} from './helpers/motion-fixture.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function nodes(tree) {
  return React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
}
const panel = tree => nodes(tree).find(node => node.props.className === 'mobile-shared-drawer-panel');
const opener = tree => nodes(tree).find(node => node.props['data-shared-drawer-opener'] !== undefined);
const scrim = tree => nodes(tree).find(node => node.props.className === 'mobile-shared-drawer-scrim');

function harness({ reducedMotion = false, inert = false, width = 312, onEscape, enabled = true } = {}) {
  const slots = [], pendingEffects = [], animations = [], closed = [], captures = [], focused = [], frames = [], inertWrites = [];
  const listeners = new Map();
  let cursor = 0, tree, outsideBinding, location = { pathname: '/share/creator', search: '' };
  const workspace = { get inert() { return inert; }, set inert(value) { inertWrites.push(value); inert = value; } };
  const document = {
    activeElement: null,
    addEventListener(type, listener, options) {
      const entries = listeners.get(type) ?? [];
      entries.push({ listener, options }); listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      const entries = (listeners.get(type) ?? []).filter(entry => entry.listener !== listener);
      if (entries.length) listeners.set(type, entries); else listeners.delete(type);
    },
  };
  class Element {
    constructor(name, { insidePanel = false, role = null } = {}) { Object.assign(this, { name, insidePanel, role }); }
    closest(selector) { return this.role && selector.includes(`[role="${this.role}"]`) ? this : null; }
    focus(options) { assert.equal(options.preventScroll, true); focused.push(this.name); document.activeElement = this; }
  }
  document.body = new Element('body'); document.activeElement = document.body;
  const openerElement = new Element('opener');
  const panelElement = Object.assign(new Element('panel'), {
    getBoundingClientRect: () => ({ width }), contains: target => target === panelElement || Boolean(target?.insidePanel),
  });
  const surface = { parentElement: { querySelector: selector => selector === '.codex-workspace' ? workspace : null },
    querySelector: selector => selector === '[data-shared-drawer-opener]' ? openerElement : null,
    contains: target => !target.outside, setPointerCapture: id => captures.push(id) };
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback(callback, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) pendingEffects.push(() => {
        previous?.cleanup?.(); slots[index] = { deps, cleanup: callback() };
      });
    },
  };
  const motion = { motion: { div: 'motion.div', button: 'motion.button' }, useReducedMotion: () => reducedMotion,
    useMotionValue(initial) { const ref = react.useRef(null); if (!ref.current) {
      let value = initial; ref.current = { get: () => value, set: next => { value = next; } };
    } return ref.current; },
    useTransform: (value, transform) => ({ get: () => transform(value.get()) }),
    animate(value, target, options) {
      const animation = { value, target, options, stopped: false, finished: false, stop() { this.stopped = true; } };
      animations.push(animation); return animation;
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/visitor/mobile/PublicProfileDrawer.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText + '\nexports.sharedDrawerProgress = sharedDrawerProgress; exports.sharedDrawerRelease = sharedDrawerRelease;', {
    exports, document, Element, HTMLElement: Element,
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    require(name) {
    if(name.endsWith('/motion/motion')) return motionFixture;
    if (name === 'react') return react;
    if (name === 'framer-motion') return motion;
    if (name === 'lucide-react') return { PanelLeftOpenIcon: 'open-icon', PanelLeftCloseIcon: 'close-icon' };
    if (name === 'react-router-dom') return { useLocation: () => location };
    if (name.endsWith('/useModalFocus')) return { useModalFocus: (open, ref, close) => { outsideBinding = { open, ref, close }; } };
    throw new Error(`Unexpected drawer import: ${name}`);
  } });
  const props = { enabled, name: 'Creator', onClose: () => closed.push('closed'), onEscape, children: close => React.createElement('button', { onClick: close }, 'Close from navigation') };
  const render = () => {
    cursor = 0; tree = exports.PublicProfileDrawer(props);
    tree.ref.current = surface; panel(tree).ref.current = panelElement;
    if (opener(tree)?.ref) opener(tree).ref.current = openerElement;
    pendingEffects.splice(0).forEach(effect => effect());
    frames.splice(0).forEach(callback => callback());
    return tree;
  };
  const finish = () => {
    for (const animation of animations) if (!animation.stopped && !animation.finished) {
      animation.finished = true; animation.value.set(animation.target); animation.options.onComplete?.();
    }
    return render();
  };
  const event = (x = 0, y = 100, time = 0, overrides = {}) => ({
    clientX: x, clientY: y, timeStamp: time, pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, detail: 1,
    target: { closest: () => null }, currentTarget: surface,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides,
  });
  const fire = (handler, value = event()) => { tree.props[handler](value); return value; };
  render(); render(); closed.length = 0;
  return { render, finish, event, fire, workspace, inertWrites, document, focused, listeners, closed, captures, animations, exports,
    get outsideBinding() { return outsideBinding; },
    target(name, options) { return new Element(name, options); },
    keydown(overrides = {}) {
      const key = { key: 'Escape', target: document.activeElement, defaultPrevented: false,
        preventDefault() { this.prevented = true; this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides };
      for (const { listener } of listeners.get('keydown') ?? []) listener(key);
      return key;
    },
    open() { opener(tree).props.onClick(); render(); return finish(); },
    navigate(pathname, search = '') { location = { pathname, search }; render(); return render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('drawer progress follows physical width and release combines distance with recent velocity', () => {
  const { sharedDrawerProgress: progress, sharedDrawerRelease: release } = harness().exports;
  assert.equal(progress(0, 156, 312), 0.5);
  assert.equal(progress(1, -78, 312), 0.75);
  assert.equal(progress(0, -100, 312), 0);
  assert.equal(progress(1, 100, 312), 1);
  assert.equal(progress(0, 100, 0), 1);
  assert.equal(release(0.2, 30, 0.6), true, 'A deliberate quick opening flick can finish before halfway');
  assert.equal(release(0.8, -30, -0.6), false, 'A closing flick can finish before halfway');
  assert.equal(release(0.2, 23, 1), false, 'Tiny accidental motion cannot qualify by velocity alone');
  assert.equal(release(0.49, 100, 0), false);
  assert.equal(release(0.5, 100, 0), true);
});

test('edge contact captures immediately so a first move beyond the narrow edge still opens the drawer', () => {
  for (const pointerType of ['touch', 'mouse', 'pen']) {
    const h = harness(), edge = {};
    const pointer = { pointerId: 7, pointerType };
    h.fire('onPointerDownCapture', h.event(12, 100, 0, {
      ...pointer, target: { closest: selector => selector === '.mobile-shared-drawer-edge' ? edge : null },
    }));
    assert.deepEqual(h.captures, [7], `${pointerType} must be captured on contact, before any move sample`);
    assert.equal(h.render().props['data-visible'], false, 'Capture alone must not open the drawer or block the workspace');
    assert.equal(h.workspace.inert, false);
    // Pointer capture delivers this sample after the pointer has crossed into the workspace.
    h.fire('onPointerMoveCapture', h.event(168, 101, 300, pointer));
    assert.equal(panel(h.render()).props.style.opacity.get(), 0.5);
    h.fire('onPointerUpCapture', h.event(168, 101, 500, pointer));
    assert.equal(h.finish().props['data-visible'], true);
    h.unmount();
  }
  const ordinary = harness(); ordinary.open();
  ordinary.fire('onPointerDownCapture', ordinary.event(150));
  assert.deepEqual(ordinary.captures, [], 'Ordinary navigation targets retain their click until a horizontal drag is established');
  ordinary.unmount();
});

test('vertical, canceled, lost-capture and multi-touch gestures return to their committed state', () => {
  for (const initiallyOpen of [false, true]) {
    for (const mode of ['vertical', 'cancel', 'lost', 'multitouch']) {
      const h = harness(); if (initiallyOpen) h.open();
      h.fire('onPointerDownCapture', h.event(150));
      if (mode === 'vertical') h.fire('onPointerMoveCapture', h.event(155, 140, 30));
      else {
        h.fire('onPointerMoveCapture', h.event(initiallyOpen ? 50 : 250, 102, 30));
        if (mode === 'cancel') h.fire('onPointerCancel');
        if (mode === 'lost') h.fire('onLostPointerCapture');
        if (mode === 'multitouch') h.fire('onPointerDownCapture', h.event(200, 100, 40, { pointerId: 2, isPrimary: false }));
      }
      h.fire('onPointerUpCapture', h.event(initiallyOpen ? 0 : 312, 100, 50));
      const tree = h.finish();
      assert.equal(tree.props['data-visible'], initiallyOpen, `${mode} must not change the committed drawer state`);
      assert.equal(panel(tree).props.style.opacity.get(), initiallyOpen ? 1 : 0);
      h.unmount();
    }
  }
});

test('recent pointer velocity can open and close a short flick while a slow short drag settles back', () => {
  for (const quick of [false, true]) {
    const h = harness();
    h.fire('onPointerDownCapture', h.event(10, 100, 0));
    h.fire('onPointerMoveCapture', h.event(40, 101, quick ? 35 : 300));
    h.fire('onPointerUpCapture', h.event(50, 101, quick ? 55 : 500));
    assert.equal(h.finish().props['data-visible'], quick);
    if (quick) {
      h.fire('onPointerDownCapture', h.event(250, 100, 100));
      h.fire('onPointerMoveCapture', h.event(220, 101, 135));
      h.fire('onPointerUpCapture', h.event(210, 101, 155));
      assert.equal(h.finish().props['data-visible'], false);
    }
    h.unmount();
  }
});

test('drag consumes its following pointer click but preserves the next tap and keyboard activation', () => {
  const h = harness(); h.open();
  h.fire('onPointerDownCapture', h.event(200));
  h.fire('onPointerMoveCapture', h.event(100, 101, 30));
  h.fire('onPointerUpCapture', h.event(100, 101, 200));
  const click = h.fire('onClickCapture');
  assert.equal(click.prevented, true); assert.equal(click.stopped, true);
  h.fire('onPointerDownCapture', h.event(150, 100, 300));
  h.fire('onPointerUpCapture', h.event(150, 100, 330));
  assert.equal(h.fire('onClickCapture').prevented, undefined);
  h.fire('onPointerDownCapture', h.event(200, 100, 400));
  h.fire('onPointerMoveCapture', h.event(100, 101, 430));
  h.fire('onPointerCancel');
  assert.equal(h.fire('onClickCapture', h.event(0, 0, 500, { detail: 0 })).prevented, undefined,
    'A canceled drag must not swallow a later keyboard or assistive activation');
});

test('editable/menu/opener/portal presses retain their own input and cannot complete an older drag', () => {
  const excluded = ['input', 'textarea', 'select', '[contenteditable="true"]', '[role="menu"]', '[data-shared-drawer-opener]'];
  for (const selector of [...excluded, 'outside']) {
    const h = harness();
    h.fire('onPointerDownCapture', h.event(10));
    h.fire('onPointerDownCapture', h.event(10, 100, 10, {
      target: { outside: selector === 'outside', closest: query => query.includes(selector) ? {} : null },
    }));
    assert.equal(h.fire('onPointerMoveCapture', h.event(250, 100, 30)).prevented, undefined);
    h.fire('onPointerUpCapture', h.event(250, 100, 50));
    assert.equal(h.finish().props['data-visible'], false, `${selector} must not inherit the previous gesture`);
    assert.equal(h.fire('onClickCapture').prevented, undefined);
  }
});

test('pathname and query changes cancel active dragging and close immediately; unmount stops animation', () => {
  for (const changed of ['pathname', 'search']) {
    const h = harness(); h.open();
    h.fire('onPointerDownCapture', h.event(250));
    h.fire('onPointerMoveCapture', h.event(150, 102, 30));
    let tree = h.navigate(changed === 'pathname' ? '/share/creator/c/photos' : '/share/creator', changed === 'search' ? '?page=2' : '');
    assert.equal(tree.props['data-visible'], false);
    assert.equal(panel(tree).props.style.opacity.get(), 0);
    assert.equal(h.workspace.inert, false);
    h.fire('onPointerUpCapture', h.event(312, 100, 50));
    tree = h.finish();
    assert.equal(tree.props['data-visible'], false, 'The old route gesture cannot reopen navigation');
    opener(tree).props.onClick(); h.render();
    const animation = h.animations.at(-1);
    assert.equal(animation.stopped, false);
    h.unmount();
    assert.equal(animation.stopped, true);
    assert.equal(h.workspace.inert, false);
    assert.deepEqual(h.inertWrites, []);
    assert.equal(h.listeners.size, 0);
  }
});

test('viewport opener disappears while navigation is open and returns after outside dismissal', () => {
  const h = harness();
  assert.equal(opener(h.render()).props['aria-label'], 'Open profile navigation');
  h.open();
  assert.equal(h.animations.at(-1).options.duration, 0.18, 'Shared progress settles both the scrim fade and panel slide within 180ms');
  assert.equal(opener(h.render()), undefined);
  h.outsideBinding.close();
  assert.equal(h.animations.at(-1).options.duration, 0.18, 'Closing uses the same bounded progress animation');
  assert.equal(h.render().props['data-visible'], true, 'Navigation remains mounted until the closing motion finishes');
  assert.equal(h.finish().props['data-visible'], false);
  assert.equal(opener(h.render()).props['aria-label'], 'Open profile navigation');
  h.unmount();
});

test('reader and settings entries have no sidebar opener or opening gesture', () => {
  const h = harness({enabled:false});
  assert.equal(opener(h.render()), undefined);
  const event = h.event(0);
  h.fire('onPointerDownCapture', event);
  h.fire('onPointerMoveCapture', h.event(180,100,30));
  assert.equal(h.render().props['data-visible'], false);
  assert.equal(h.render().props.children.some(child => child?.props?.className === 'mobile-shared-drawer-edge'), false);
  h.unmount();
});
