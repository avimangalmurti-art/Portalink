import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function compile(path, dependencies = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, ...globals, require(name) { return dependencies[name] ?? new Proxy({}, { get: (_object, key) => key === '__esModule' ? false : () => null }); } });
  return exports;
}
const { navigationSwipe } = compile('../src/presentation/mobile/useNavigationSwipe.ts');
const { studioSwipeOutcome } = compile('../src/features/studio/useStudioRowGesture.ts', { '../../presentation/mobile/useNavigationSwipe': { navigationSwipe } });
const start = { x: 250, y: 100, time: 0 };

test('Studio reuses deliberate horizontal classification and only supplied primary actions can full-swipe', () => {
  assert.equal(studioSwipeOutcome(start, { x: 210, y: 102, time: 50 }, 350, 3, true), 'left');
  assert.equal(studioSwipeOutcome(start, { x: 290, y: 102, time: 50 }, 350, 3, true), 'right');
  assert.equal(studioSwipeOutcome(start, { x: 10, y: 102, time: 400 }, 350, 3, true), 'primary');
  assert.equal(studioSwipeOutcome(start, { x: 490, y: 102, time: 400 }, 350, 3, true), 'primary');
  assert.equal(studioSwipeOutcome(start, { x: 10, y: 102, time: 400 }, 350, 3, false), 'left');
  assert.equal(studioSwipeOutcome(start, { x: 290, y: 102, time: 50 }, 350, 3, false), 'closed');
  assert.equal(studioSwipeOutcome(start, { x: 210, y: 102, time: 50 }, 350, 0, false), 'closed');
  for (const end of [{ x: 245, y: 101, time: 30 }, { x: 210, y: 102, time: 500 }, { x: 210, y: 170, time: 50 }]) {
    assert.equal(studioSwipeOutcome(start, end, 350, 3, true), 'closed');
  }
  assert.equal(studioSwipeOutcome(start, { x: 300, y: 102, time: 50 }, 350, 3, true, -144), 'closed', 'A reverse drag first closes revealed left actions');
});

function hookHarness(overrides = {}) {
  const slots = [], effects = [], timers = new Map(), calls = [];
  let cursor = 0, timerId = 0;
  const react = { ...React,
    useCallback(callback, dependencies) { const i = cursor++; if (!slots[i] || dependencies.some((dep, j) => dep !== slots[i].dependencies[j])) slots[i] = { callback, dependencies }; return slots[i].callback; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect(callback, dependencies) {
      const i = cursor++, previous = slots[i];
      if (!previous || dependencies.some((dep, j) => dep !== previous.dependencies[j])) {
        effects.push(() => { previous?.cleanup?.(); slots[i] = { dependencies, cleanup: callback() }; });
      }
    },
  };
  const api = compile('../src/features/studio/useStudioRowGesture.ts', {
    react, '../../presentation/mobile/useNavigationSwipe': { navigationSwipe },
  }, {
    window: { innerWidth: 390 },
    setTimeout(callback, delay) { assert.equal(delay, 500); timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  const props = { enabled: true, leftCount: 2, hasPrimary: true, onPrimary() { calls.push('primary'); }, onMenu() { calls.push('menu'); }, ...overrides };
  const render = () => { cursor = 0; const hook = api.useStudioRowGesture(props); effects.splice(0).forEach(effect => effect()); return hook; };
  return { props, calls, render,
    expirePress() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); },
    get timerCount() { return timers.size; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function pointer(x, y, time, overrides = {}) {
  return { clientX: x, clientY: y, timeStamp: time, pointerId: 1, pointerType: 'touch', isPrimary: true,
    target: { closest: () => null }, currentTarget: { contains: () => true, getBoundingClientRect: () => ({ width: 350 }), setPointerCapture() {} }, ...overrides };
}
function click(detail = 1) { return { detail, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; }
function swipe(h, from, to, endTime = 150) {
  h.render().handlers.onPointerDownCapture(pointer(from, 100, 0));
  h.render().handlers.onPointerMoveCapture(pointer(to, 101, endTime - 10));
  h.render().handlers.onPointerUpCapture(pointer(to, 101, endTime));
}

test('left/right reveals action targets, full swipe invokes once, and the resulting tap is consumed', () => {
  const h = hookHarness();
  swipe(h, 250, 190); assert.equal(h.render().offset, -144);
  h.render().close(); swipe(h, 120, 180); assert.equal(h.render().offset, 72);
  h.render().close(); swipe(h, 320, 60, 400); assert.equal(h.render().offset, 0);
  assert.deepEqual(h.calls, ['primary']);
  const suppressed = click(); h.render().handlers.onClickCapture(suppressed);
  assert.equal(suppressed.prevented, true); assert.equal(suppressed.stopped, true);
  h.render().handlers.onPointerDownCapture(pointer(200, 100, 500)); h.render().handlers.onPointerUpCapture(pointer(200, 100, 550));
  const tap = click(); h.render().handlers.onClickCapture(tap); assert.equal(tap.prevented, false);
  swipe(h, 320, 60, 400);
  const keyboard = click(0); h.render().handlers.onClickCapture(keyboard); assert.equal(keyboard.prevented, false);
});

test('vertical intent, cancellation, browser edges and non-row controls cannot trigger actions', () => {
  const h = hookHarness();
  h.render().handlers.onPointerDownCapture(pointer(300, 100, 0));
  h.render().handlers.onPointerMoveCapture(pointer(295, 130, 20));
  h.render().handlers.onPointerMoveCapture(pointer(50, 130, 40));
  h.render().handlers.onPointerUpCapture(pointer(50, 130, 60));
  assert.equal(h.render().offset, 0);
  h.render().handlers.onPointerDownCapture(pointer(300, 100, 0)); h.render().handlers.onPointerCancel();
  h.render().handlers.onPointerUpCapture(pointer(50, 100, 60));
  for (const point of [pointer(10, 100, 0), pointer(380, 100, 0), pointer(300, 100, 0, { isPrimary: false }), pointer(300, 100, 0, { pointerType: 'mouse' }), pointer(300, 100, 0, { target: { closest: () => ({}) } }), pointer(300, 100, 0, { currentTarget: { contains: () => false } })]) {
    h.render().handlers.onPointerDownCapture(point);
    h.render().handlers.onPointerUpCapture(pointer(50, 100, 60));
    h.expirePress();
  }
  assert.deepEqual(h.calls, []); assert.equal(h.timerCount, 0);
});

test('a tap dismisses revealed actions without opening and a second finger cancels partial movement', () => {
  const h = hookHarness();
  swipe(h, 250, 190);
  assert.equal(h.render().offset, -144);
  h.render().handlers.onPointerDownCapture(pointer(180, 100, 200));
  h.render().handlers.onPointerUpCapture(pointer(180, 100, 230));
  assert.equal(h.render().offset, 0);
  const tap = click(); h.render().handlers.onClickCapture(tap); assert.equal(tap.prevented, true);
  h.render().handlers.onPointerDownCapture(pointer(280, 100, 300));
  h.render().handlers.onPointerMoveCapture(pointer(250, 101, 320));
  assert.equal(h.render().offset, -30); assert.equal(h.render().dragging, true);
  h.render().handlers.onPointerDownCapture(pointer(260, 110, 330, { isPrimary: false, pointerId: 2 }));
  assert.equal(h.render().offset, 0); assert.equal(h.render().dragging, false);
  h.render().handlers.onPointerUpCapture(pointer(20, 100, 400));
  h.expirePress(); assert.deepEqual(h.calls, []);
});

test('long-press opens once and motion, scrolling, cancellation, selection or unmount cancels it', () => {
  const h = hookHarness();
  h.render().handlers.onPointerDownCapture(pointer(200, 100, 0)); h.expirePress();
  assert.deepEqual(h.calls, ['menu']);
  const context = { ...click(), target: { closest: () => null } }; h.render().handlers.onContextMenu(context);
  assert.equal(context.prevented, true); assert.deepEqual(h.calls, ['menu']);
  h.render().handlers.onPointerUpCapture(pointer(200, 100, 550));
  const tap = click(); h.render().handlers.onClickCapture(tap); assert.equal(tap.prevented, true);
  for (const cancel of [
    p => p.onPointerMoveCapture(pointer(211, 100, 50)),
    p => p.onPointerMoveCapture(pointer(200, 111, 50)),
    p => p.onPointerCancel(),
    () => { h.props.enabled = false; h.render(); h.props.enabled = true; h.render(); },
  ]) {
    h.render().handlers.onPointerDownCapture(pointer(200, 100, 0)); cancel(h.render().handlers); h.expirePress();
  }
  h.render().handlers.onPointerDownCapture(pointer(200, 100, 0)); h.unmount(); h.expirePress();
  assert.deepEqual(h.calls, ['menu']);
});

function nodes(node) { return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : []; }
test('selection presents real checkboxes, explicit options remain accessible, and destructive actions cannot become full swipe', () => {
  let hookOptions;
  const { StudioRow } = compile('../src/features/studio/StudioRow.tsx', {
    react: { ...React, useId: () => 'studio-row-description', useRef: () => ({ current: { focus() {} } }) },
    './useStudioRowGesture': { useStudioRowGesture(options) { hookOptions = options; return { offset: 0, dragging: false, close() {}, handlers: {} }; } },
  });
  const calls = [];
  const props = { id: 'item', title: 'Project', secondary: 'Creator', selecting: false, selected: false, onSelect() { calls.push('select'); }, onOpen() { calls.push('open'); }, onMenu() { calls.push('menu'); }, actions: [{ id: 'remove', label: 'Unsave', onAction() {} }], primaryAction: { id: 'delete', label: 'Delete', destructive: true, onAction() { assert.fail('Destructive full swipe'); } } };
  let tree = StudioRow(props);
  assert.equal(hookOptions.hasPrimary, false); hookOptions.onPrimary();
  const options = nodes(tree).find(node => node.props['aria-label'] === 'Options for Project');
  assert.equal(options.props['aria-haspopup'], 'dialog'); assert.match(options.props.className, /h-11 w-11/);
  options.props.onClick(); assert.deepEqual(calls, ['menu']);
  const open = nodes(tree).find(node => node.props['aria-label'] === 'Open Project');
  assert.equal(open.props['aria-describedby'], 'studio-row-description');
  assert.equal(nodes(tree).find(node => node.props.id === 'studio-row-description').props.children, 'Creator');
  assert.ok(nodes(StudioRow({ ...props, unread: true })).some(node => node.props['aria-label'] === 'Open Project, unread'));
  tree = StudioRow({ ...props, selecting: true, selected: true });
  assert.equal(hookOptions.enabled, false);
  const checkbox = nodes(tree).find(node => node.type === 'input');
  assert.equal(checkbox.props.type, 'checkbox'); assert.equal(checkbox.props.checked, true);
  checkbox.props.onChange(); assert.deepEqual(calls, ['menu', 'select']);
  assert.equal(nodes(tree).some(node => node.props['aria-haspopup'] === 'dialog'), false);
});

test('Studio action sheet uses shared modal focus, explicit close and invokes only the chosen action', () => {
  const calls = [];
  const { StudioActionSheet } = compile('../src/features/studio/StudioActionSheet.tsx', {
    react: { ...React, useId: () => 'studio-options', useRef: () => ({ current: null }) },
    '../../hooks/useModalFocus': { useModalFocus(open, _ref, _close, preventScroll) { assert.equal(open, true); assert.equal(preventScroll, true); } },
  });
  const tree = StudioActionSheet({ title: 'Project options', actions: [{ id: 'open', label: 'Open', onAction() { calls.push('open'); } }], onClose() { calls.push('close'); } });
  const dialog = nodes(tree).find(node => node.props.role === 'dialog');
  assert.equal(dialog.props['aria-modal'], 'true'); assert.equal(dialog.props['aria-labelledby'], 'studio-options');
  const action = nodes(tree).find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('Open'));
  assert.match(action.props.className, /min-h-\[44px\]/); action.props.onClick(); assert.deepEqual(calls, ['close', 'open']);
  nodes(tree).find(node => node.props['aria-label'] === 'Close Studio options').props.onClick();
  assert.deepEqual(calls, ['close', 'open', 'close']);
});
