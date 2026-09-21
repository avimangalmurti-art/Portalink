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

test('an overflowing quick-navigation capsule keeps horizontal gestures and clicks for native scrolling', () => {
  for (const [direction, from, to] of [['right', 10, 70], ['left', 70, 10]]) {
    let captured = 0;
    const p = harness().useNavigationSwipe(direction, () => assert.fail('Native dock scrolling must not toggle the sidebar'));
    const dock = { clientWidth: 70, scrollWidth: 144 };
    const overrides = {
      target: { closest: selector => selector === '.mobile-navigation-dock' ? dock : null },
      currentTarget: { contains: () => true, setPointerCapture() { captured++; } },
    };
    // A previous unfinished press must not leak into the excluded dock gesture.
    p.onPointerDownCapture(pointer(from, 10, 0));
    p.onPointerDownCapture(pointer(from, 10, 100, overrides));
    p.onPointerMoveCapture(pointer(to, 10, 130, overrides));
    p.onPointerUpCapture(pointer(to, 10, 160, overrides));
    assert.equal(captured, 0);
    const event = click(); p.onClickCapture(event);
    assert.equal(event.prevented, false);
    assert.equal(event.stopped, false);
  }
});

test('a quick-navigation capsule with no horizontal overflow retains sidebar swipes', () => {
  for (const scrollWidth of [143, 144]) {
    let toggled = 0, captured = 0;
    const p = harness().useNavigationSwipe('right', () => toggled++);
    const dock = { clientWidth: 144, scrollWidth };
    const overrides = {
      target: { closest: selector => selector === '.mobile-navigation-dock' ? dock : null },
      currentTarget: { contains: () => true, setPointerCapture() { captured++; } },
    };
    p.onPointerDownCapture(pointer(10, 10, 0, overrides));
    p.onPointerMoveCapture(pointer(70, 10, 30, overrides));
    p.onPointerUpCapture(pointer(70, 10, 60, overrides));
    assert.equal(toggled, 1);
    assert.equal(captured, 1);
    const event = click(); p.onClickCapture(event);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
  }
});

test('a newly ignored press clears any unfinished sidebar gesture', () => {
  for (const overrides of [
    { pointerType: 'mouse' }, { isPrimary: false },
    { currentTarget: { contains: () => false } },
    { target: { closest: () => ({ role: 'menu' }) } },
  ]) {
    const p = harness().useNavigationSwipe('right', () => assert.fail('The previous press must have been cleared'));
    p.onPointerDownCapture(pointer(10, 10, 0));
    p.onPointerDownCapture(pointer(10, 10, 100, overrides));
    p.onPointerUpCapture(pointer(70, 10, 160));
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

function navigationHarness(pathname = '/') {
  const slots = [];
  const frames = [];
  const focused = [];
  const icons = { SunIcon: () => null, MoonIcon: () => null };
  let cursor = 0;
  let scrollBinding;
  let outsideBinding;
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
  const paths = { home: '/', portals: '/portals', messages: '/messages', saved: '/saved', notifications: '/notifications', insights: '/insights', controlCenter: '/appearance' };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/presentation/mobile/MobileNavigation.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText + '\nexports.Destination = Destination;', {
    exports, requestAnimationFrame: fn => frames.push(fn),
    require: name => {
      if (name === 'react') return react;
      if (name === 'lucide-react') return icons;
      if (name === 'react-router-dom') return { Link: 'a', useLocation: () => ({ pathname }) };
      if (name === 'framer-motion') return { motion: { nav: 'nav' }, useReducedMotion: () => true };
      if (name === './useNavigationSwipe') return swipe;
      if (name === './useMobileDockScroll') return { useMobileDockScroll: (enabled, path, ref) => { scrollBinding = { enabled, path, ref }; } };
      if (name === './useNavigationOutsideTap') return { useNavigationOutsideTap: (open, ref, close) => { outsideBinding = { open, ref, close }; } };
      if (name === '../../app/routes') return { buildPath: name => paths[name] };
      return new Proxy({}, { get: () => () => null });
    },
  });
  function render(props = {}) {
    cursor = 0;
    const tree = exports.MobileNavigation({ settings: null, theme: 'dark', onThemeChange() {}, onPortalink() {}, onMessages() {}, onProfile() {}, isProfileActive: false, ...props });
    const [rail, floating] = React.Children.toArray(tree.props.children);
    const [toggle, dock] = React.Children.toArray(floating.props.children);
    const [group] = React.Children.toArray(dock.props.children);
    const profile = React.Children.toArray(group.props.children).find(child => child.props.item.label === 'Profile');
    const railNav = rail.props.children ? React.Children.toArray(rail.props.children.props.children)[0] : null;
    const railItems = railNav ? React.Children.toArray(railNav.props.children) : [];
    const railToggle = railItems.find(child => child.props['aria-controls'] === rail.props.id) ?? null;
    toggle.ref.current = { focus(options) {
      assert.equal(floating.props.hidden, undefined, 'the toggle is always mounted outside the hidden destinations');
      assert.equal(options.preventScroll, true);
      focused.push('toggle');
    } };
    frames.splice(0).forEach(fn => fn());
    const appearance = railItems.find(child => child.props.item?.label.startsWith('Switch to '));
    return { layer: tree, rail, railItems, railToggle, floating, dock, toggle, group, appearance: appearance ? exports.Destination(appearance.props) : null, profile: exports.Destination(profile.props), focused };
  }
  return { render, icons, get scrollBinding() { return scrollBinding; }, get outsideBinding() { return outsideBinding; }, destination: element => exports.Destination(element.props) };
}

test('browsing scroll owns the entire floating dock only while the side rail is closed', () => {
  const h = navigationHarness('/p/creator');
  const before = h.render();
  assert.equal(h.scrollBinding.enabled, true);
  assert.equal(h.scrollBinding.path, '/p/creator');
  assert.equal(h.scrollBinding.ref, before.floating.ref);
  before.toggle.props.onClick();
  const rail = h.render();
  assert.equal(rail.rail.props['data-hidden'], false);
  assert.equal(h.scrollBinding.enabled, false);
  assert.equal(rail.floating.ref, before.floating.ref);
  assert.equal(rail.toggle.ref, before.toggle.ref);
  rail.toggle.props.onClick();
  h.render();
  assert.equal(h.scrollBinding.enabled, true);
});

test('mobile sidebar ends with Profile and has no Back destination', () => {
  const h = navigationHarness('/portals');
  let ui = h.render();
  assert.equal(ui.dock.props.hidden, false);
  ui.toggle.props.onClick();
  ui = h.render();
  const destinations = ui.railItems.filter(child => child.props.item).map(child => child.props.item.label);
  assert.equal(destinations.at(-1), 'Profile');
  assert.equal(destinations.includes('Back'), false);
  assert.ok(ui.appearance);
  assert.deepEqual(React.Children.toArray(ui.group.props.children).map(child => child.props.item.label), ['Messages', 'Studio', 'Home', 'Profile']);
});

test('the mobile appearance control switches the shared theme both ways and updates its icon and label', () => {
  const h = navigationHarness();
  let theme = 'dark';
  const changes = [];
  const onThemeChange = next => { theme = next; changes.push(next); };
  h.render().toggle.props.onClick();
  for (const [label, icon, next] of [
    ['Switch to light appearance', h.icons.SunIcon, 'light'],
    ['Switch to dark appearance', h.icons.MoonIcon, 'dark'],
  ]) {
    const ui = h.render({ theme, onThemeChange });
    assert.equal(ui.appearance.type, 'button');
    assert.equal(ui.appearance.props['aria-label'], label);
    assert.equal(ui.appearance.props.title, label);
    assert.equal(ui.appearance.props.children.props.icon, icon);
    assert.equal(ui.appearance.props['aria-current'], undefined);
    ui.appearance.props.onClick({ type: 'click' });
    assert.equal(theme, next);
  }
  assert.deepEqual(changes, ['light', 'dark']);
});

test('mobile opens with the bottom dock, then alternates around one persistent toggle', () => {
  const h = navigationHarness();
  let ui = h.render();
  assert.equal(ui.dock.props.hidden, false);
  assert.equal(ui.rail.props['data-hidden'], true);
  assert.equal(ui.railItems.length, 0);
  assert.equal(ui.toggle.props['aria-expanded'], false);
  assert.equal(ui.toggle.props['aria-label'], 'Show navigation');
  assert.equal(ui.railToggle, null);
  const toggleRef = ui.toggle.ref;
  const layerType = ui.layer.type;
  assert.equal(layerType, 'div');
  assert.equal(ui.layer.props['data-mobile-navigation-layer'], '');
  assert.equal(ui.rail.props.id, ui.toggle.props['aria-controls']);
  assert.deepEqual(React.Children.toArray(ui.group.props.children).map(child => child.props.item.label), ['Messages', 'Studio', 'Home', 'Profile']);
  assert.deepEqual(React.Children.toArray(ui.group.props.children).filter(child => child.props.item.disabled).map(child => child.props.item.label), ['Studio']);
  for (const expectedHidden of [false, true, false, true]) {
    ui.toggle.props.onClick(); ui = h.render();
    assert.equal(ui.rail.props['data-hidden'], expectedHidden);
    assert.equal(ui.dock.props.hidden, !expectedHidden);
    assert.equal(ui.railToggle, null);
    assert.equal(ui.toggle.ref, toggleRef);
    assert.equal(ui.layer.type, layerType);
    assert.equal(ui.layer.props.className, 'mobile-navigation-layer');
    assert.equal(ui.layer.props.hidden, undefined);
    assert.equal(ui.layer.props.animate, undefined);
    assert.equal(ui.floating.type, 'div');
    assert.equal(ui.floating.props.animate, undefined);
    assert.equal(ui.floating.props.hidden, undefined);
    assert.equal(ui.toggle.props['aria-expanded'], !expectedHidden);
    assert.equal(ui.dock.props['aria-label'], 'Quick navigation');
    assert.equal(ui.toggle.props['aria-label'], expectedHidden ? 'Show navigation' : 'Hide navigation');
    if (!expectedHidden) assert.equal(ui.railItems.some(child => child.props.item?.label === 'Studio'), true);
  }
  assert.deepEqual(ui.focused, ['toggle', 'toggle', 'toggle', 'toggle']);
  assert.equal(navigationHarness().render().dock.props.hidden, false, 'a new app session starts with the dock');
});

test('outside dismissal restores the dock and focus without a content-blocking overlay', () => {
  const h = navigationHarness();
  let ui = h.render();
  assert.equal(h.outsideBinding.open, false);
  assert.equal(React.Children.count(ui.layer.props.children), 2, 'only the rail and dock occupy the nonmodal navigation layer');
  ui.toggle.props.onClick();
  ui = h.render();
  assert.equal(h.outsideBinding.open, true);
  assert.equal(h.outsideBinding.ref, ui.layer.ref);
  assert.equal(ui.dock.props.hidden, true);
  // Actions inside the rail keep working without triggering dismissal.
  ui.appearance.props.onClick();
  ui = h.render();
  assert.equal(ui.rail.props['data-hidden'], false);
  h.outsideBinding.close();
  ui = h.render();
  assert.equal(ui.rail.props['data-hidden'], true);
  assert.equal(ui.dock.props.hidden, false);
  assert.equal(h.outsideBinding.open, false);
  assert.equal(ui.focused.at(-1), 'toggle');
});

test('Portals is absent from both mobile navigation forms even on the portals route', () => {
  for (const pathname of ['/', '/portals']) {
    const h = navigationHarness(pathname);
    let ui = h.render();
    assert.equal(ui.dock.props.hidden, false);
    assert.equal(React.Children.toArray(ui.group.props.children).some(child => child.props.item.label === 'Portals'), false);
    ui.toggle.props.onClick();
    ui = h.render();
    assert.equal(ui.rail.props['data-hidden'], false);
    assert.equal(ui.railItems.some(child => child.props.item?.label === 'Portals'), false);
  }
});

test('rail and dock swipes alternate navigation without activating destinations underneath', () => {
  const h = navigationHarness(); let ui = h.render();
  for (const [from, to, hidden] of [[10, 60, false], [60, 10, true]]) {
    const surface = hidden ? 'rail' : 'floating';
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

test('Profile shares the destination capsule and preserves signed-in links and signed-out entry', () => {
  const h = navigationHarness(); let requested = 0;
  const guest = h.render({ onProfile: () => requested++ }).profile;
  assert.match(guest.props.className, /mobile-dock-destination/);
  assert.equal(guest.type, 'button'); guest.props.onClick(); assert.equal(requested, 1);
  const member = h.render({ profileHref: '/p/my-profile', isProfileActive: true }).profile;
  assert.equal(member.type, 'a'); assert.equal(member.props.to, '/p/my-profile');
  assert.equal(member.props['aria-label'], 'Profile'); assert.equal(member.props['aria-current'], 'page');
});
