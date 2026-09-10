import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';

function harness() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/presentation/mobile/useNavigationSwipe.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: () => ({ useRef: value => ({ current: value }) }) });
  return exports;
}
const { navigationSwipe } = harness();
const start = { x: 60, y: 100, time: 0 };
test('quick flicks and deliberate drags work in both directions', () => {
  assert.equal(navigationSwipe(start, { x: 30, y: 102, time: 60 }), 'left');
  assert.equal(navigationSwipe(start, { x: 116, y: 103, time: 500 }), 'right');
  assert.equal(navigationSwipe(start, { x: 0, y: 90, time: 900 }), 'left');
});
test('taps, vertical scroll, diagonals and slow short movements do not close navigation', () => {
  for (const end of [{ x: 60, y: 100, time: 40 }, { x: 40, y: 105, time: 10 }, { x: 30, y: 102, time: 400 }, { x: 10, y: 160, time: 80 }, { x: 10, y: 145, time: 80 }]) {
    assert.equal(navigationSwipe(start, end), null);
  }
});
function pointer(x, y, time, overrides = {}) {
  return { clientX: x, clientY: y, timeStamp: time, pointerId: 1, pointerType: 'touch', isPrimary: true, target: { closest: () => null }, currentTarget: { setPointerCapture() {}, contains: () => true }, ...overrides };
}
function click() { return { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; }
test('swiping consumes the following click, while the next tap can navigate', () => {
  let closed = 0;
  const p = harness().useNavigationSwipe('left', () => closed++);
  p.onPointerDownCapture(pointer(50, 10, 0));
  p.onPointerMoveCapture(pointer(20, 11, 30));
  p.onPointerUpCapture(pointer(20, 11, 60));
  assert.equal(closed, 1);
  const swipeClick = click(); p.onClickCapture(swipeClick);
  assert.equal(swipeClick.prevented, true); assert.equal(swipeClick.stopped, true);
  p.onPointerDownCapture(pointer(50, 10, 100)); p.onPointerUpCapture(pointer(50, 10, 150));
  const tap = click(); p.onClickCapture(tap); assert.equal(tap.prevented, false);
});
test('vertical axis locking, cancellation and unrelated pointers preserve the open rail', () => {
  const p = harness().useNavigationSwipe('left', () => assert.fail('Unexpected dismissal'));
  p.onPointerDownCapture(pointer(60, 10, 0));
  p.onPointerMoveCapture(pointer(58, 30, 20));
  p.onPointerUpCapture(pointer(0, 30, 60)); // a late diagonal cannot steal a scroll
  p.onPointerDownCapture(pointer(60, 10, 0)); p.onPointerCancel(); p.onPointerUpCapture(pointer(0, 10, 60));
  for (const overrides of [{ pointerType: 'mouse' }, { isPrimary: false }]) {
    p.onPointerDownCapture(pointer(60, 10, 0, overrides)); p.onPointerUpCapture(pointer(0, 10, 60, overrides));
  }
  p.onPointerDownCapture(pointer(60, 10, 0)); p.onPointerUpCapture(pointer(0, 10, 60, { pointerId: 2 }));
});
test('right swipes only reopen navigation and do not steal left swipes', () => {
  let opened = 0;
  const p = harness().useNavigationSwipe('right', () => opened++);
  p.onPointerDownCapture(pointer(10, 10, 0)); p.onPointerUpCapture(pointer(50, 10, 60));
  assert.equal(opened, 1);
  p.onPointerDownCapture(pointer(60, 10, 0)); p.onPointerUpCapture(pointer(10, 10, 60));
  assert.equal(opened, 1);
});

test('portaled account menus and editable controls keep their own gestures', () => {
  const p = harness().useNavigationSwipe('left', () => assert.fail('Menu gesture escaped'));
  for (const overrides of [{ currentTarget: { contains: () => false } }, { target: { closest: () => ({ role: 'menu' }) } }]) {
    p.onPointerDownCapture(pointer(60, 10, 0, overrides));
    p.onPointerUpCapture(pointer(0, 10, 60));
  }
});

test('destination callbacks never receive the click event as a message recipient', () => {
  const exports = {};
  const source = fs.readFileSync(new URL('../src/presentation/mobile/MobileNavigation.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText + '\nexports.Destination = Destination;', {
    exports,
    require: name => name === 'react' ? React : new Proxy({}, { get: () => () => null }),
  });
  let args;
  const button = exports.Destination({ item: { label: 'Messages', icon: () => null, action: (...values) => { args = values; } } });
  button.props.onClick({ type: 'click' });
  assert.deepEqual(args, []);
});

function navigationHarness() {
  const slots = [];
  const frames = [];
  const focused = [];
  let railRef;
  let cursor = 0;
  const react = {
    ...React,
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = next; }]; },
  };
  const swipe = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/presentation/mobile/useNavigationSwipe.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: swipe, require: () => react });
  const exports = {};
  const paths = { home: '/', messages: '/messages', saved: '/saved', notifications: '/notifications', insights: '/insights', controlCenter: '/appearance' };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/presentation/mobile/MobileNavigation.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText + '\nexports.Destination = Destination;', {
    exports, requestAnimationFrame: fn => frames.push(fn),
    require: name => {
      if (name === 'react') return react;
      if (name === 'react-router-dom') return { Link: 'a', useLocation: () => ({ pathname: '/' }) };
      if (name === 'framer-motion') return { motion: { nav: 'nav' }, useReducedMotion: () => true };
      if (name === './useNavigationSwipe') return swipe;
      if (name === '../../app/routes') return { buildPath: name => paths[name] };
      return new Proxy({}, { get: () => () => null });
    },
  });
  function render(props = {}) {
    cursor = 0;
    const tree = exports.MobileNavigation({ settings: null, onAppearance() {}, onPortalink() {}, onMessages() {}, onProfile() {}, isProfileActive: false, ...props });
    const [rail, dock] = React.Children.toArray(tree.props.children);
    const [toggle, group, profile] = React.Children.toArray(dock.props.children);
    const railNav = rail.props.children ? React.Children.toArray(rail.props.children.props.children)[0] : null;
    const railItems = railNav ? React.Children.toArray(railNav.props.children) : [];
    const railToggle = railItems.find(child => child.props['aria-controls'] === rail.props.id) ?? null;
    toggle.ref.current = { focus(options) {
      assert.equal(dock.props.hidden, false, 'focus must never land in the hidden dock');
      assert.equal(options.preventScroll, true);
      focused.push('dock');
    } };
    if (railToggle) {
      railRef = railToggle.ref;
      railRef.current = { focus(options) {
        assert.equal(rail.props['data-hidden'], false);
        assert.equal(options.preventScroll, false, 'the close control must be brought into view on short screens');
        focused.push('rail');
      } };
    } else if (railRef) railRef.current = null;
    frames.splice(0).forEach(fn => fn());
    return { rail, railItems, railToggle, dock, toggle, group, profile: exports.Destination(profile.props), focused };
  }
  return { render };
}

test('sidebar and dock alternate, transferring focus to the visible navigation control', () => {
  const h = navigationHarness();
  let ui = h.render();
  assert.equal(ui.dock.props.hidden, true);
  assert.equal(ui.railToggle.props['aria-expanded'], 'true');
  const closeIndex = ui.railItems.indexOf(ui.railToggle);
  assert.equal(ui.railItems[closeIndex - 1].props.item.label, 'Profile');
  assert.equal(ui.rail.props.id, ui.toggle.props['aria-controls']);
  assert.deepEqual(React.Children.toArray(ui.group.props.children).map(child => child.props.item.label), ['Messages', 'Portals', 'Studio', 'Home']);
  assert.deepEqual(React.Children.toArray(ui.group.props.children).filter(child => child.props.item.disabled).map(child => child.props.item.label), ['Portals', 'Studio']);
  for (const expectedHidden of [true, false, true, false]) {
    (ui.railToggle ?? ui.toggle).props.onClick(); ui = h.render();
    assert.equal(ui.rail.props['data-hidden'], expectedHidden);
    assert.equal(ui.dock.props.hidden, !expectedHidden);
    assert.equal(ui.railToggle === null, expectedHidden);
    assert.equal(ui.toggle.props['aria-expanded'], !expectedHidden);
    assert.equal(ui.dock.props['aria-label'], 'Quick navigation');
    assert.equal(ui.toggle.props['aria-label'], expectedHidden ? 'Show navigation' : 'Hide navigation');
  }
  assert.deepEqual(ui.focused, ['dock', 'rail', 'dock', 'rail']);
});

test('rail and dock swipes alternate navigation without activating destinations underneath', () => {
  const h = navigationHarness(); let ui = h.render();
  for (const [from, to, hidden] of [[60, 10, true], [10, 60, false]]) {
    const surface = hidden ? 'rail' : 'dock';
    ui[surface].props.onPointerDownCapture(pointer(from, 10, 0));
    ui[surface].props.onPointerMoveCapture(pointer(to, 10, 30));
    ui[surface].props.onPointerUpCapture(pointer(to, 10, 60));
    ui = h.render();
    assert.equal(ui.rail.props['data-hidden'], hidden);
    assert.equal(ui.dock.props.hidden, !hidden);
    const event = click(); ui[surface].props.onClickCapture(event);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
  }
});

test('the separate Profile button preserves signed-in links and signed-out entry', () => {
  const h = navigationHarness(); let requested = 0;
  const guest = h.render({ onProfile: () => requested++ }).profile;
  assert.equal(guest.type, 'button'); guest.props.onClick(); assert.equal(requested, 1);
  const member = h.render({ profileHref: '/p/my-profile', isProfileActive: true }).profile;
  assert.equal(member.type, 'a'); assert.equal(member.props.to, '/p/my-profile');
  assert.equal(member.props['aria-label'], 'Profile'); assert.equal(member.props['aria-current'], 'page');
});
