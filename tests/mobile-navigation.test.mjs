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
  const effects = [];
  const listeners = new Map();
  let search = '', dirty = false;
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
    constructor(name, { insideNavigation = false, role = null } = {}) { Object.assign(this, { name, insideNavigation, role }); }
    closest(selector) { return this.role && selector.includes(`[role="${this.role}"]`) ? this : null; }
    focus(options) { assert.equal(options.preventScroll, true); focused.push(this.name); document.activeElement = this; }
  }
  const toggleElement = new Element('toggle', { insideNavigation: true });
  const layerElement = { contains: target => Boolean(target?.insideNavigation) };
  const icons = { SunIcon: () => null, MoonIcon: () => null };
  let cursor = 0;
  let scrollBinding;
  let outsideBinding;
  const react = {
    ...React,
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => {
      const value = typeof next === 'function' ? next(slots[i]) : next;
      if (!Object.is(slots[i], value)) { slots[i] = value; dirty = true; }
    }]; },
    useEffect(callback, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((dep, index) => !Object.is(dep, previous.deps[index]))) effects.push(() => {
        previous?.cleanup?.(); slots[i] = { deps, cleanup: callback() };
      });
    },
  };
  const swipe = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/presentation/mobile/useNavigationSwipe.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: swipe, require: () => react });
  const exports = {};
  const paths = { home: '/', portals: '/portals', studio: '/studio', messages: '/messages', saved: '/saved', notifications: '/notifications', insights: '/insights', controlCenter: '/settings' };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/presentation/mobile/MobileNavigation.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText + '\nexports.Destination = Destination;', {
    exports, document, Element, requestAnimationFrame: fn => frames.push(fn),
    require: name => {
      if (name === 'react') return react;
      if (name === 'lucide-react') return icons;
      if (name === 'react-router-dom') return { Link: 'a', useLocation: () => ({ pathname, search }) };
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
    dirty = false;
    const tree = exports.MobileNavigation({ settings: null, theme: 'dark', onThemeChange() {}, onPortalink() {}, onMessages() {}, onProfile() {}, isProfileActive: false, ...props });
    const [rail, floating] = React.Children.toArray(tree.props.children);
    const [dock] = React.Children.toArray(floating.props.children);
    const [group] = React.Children.toArray(dock.props.children);
    const [toggle, ...destinations] = React.Children.toArray(group.props.children);
    const profile = destinations.find(child => child.props.item.label === 'Profile');
    const railNav = rail.props.children ? React.Children.toArray(rail.props.children.props.children)[0] : null;
    const railItems = railNav ? React.Children.toArray(railNav.props.children) : [];
    const railToggle = railItems.find(child => child.props['aria-controls'] === rail.props.id) ?? null;
    assert.equal(floating.props.hidden, undefined, 'the combined toggle and destinations stay mounted');
    assert.equal(React.Children.count(floating.props.children), 1, 'one combined quick-navigation pill has no separate toggle');
    assert.equal(group.props.className, 'mobile-navigation-dock');
    assert.equal(toggle.type, 'button');
    assert.equal(toggle.props['aria-controls'], rail.props.id);
    assert.equal(destinations.length, 4);
    toggle.ref.current = toggleElement;
    tree.ref.current = layerElement;
    effects.splice(0).forEach(effect => effect());
    if (dirty) return render(props);
    frames.splice(0).forEach(fn => fn());
    const appearance = railItems.find(child => child.props.item?.label.startsWith('Switch to '));
    return { layer: tree, rail, railItems, railToggle, floating, dock, toggle, group, destinations, appearance: appearance ? exports.Destination(appearance.props) : null, profile: exports.Destination(profile.props), focused };
  }
  return { render, icons, document, listeners, focused,
    target: (name, options) => new Element(name, options),
    navigate: (nextPath, nextSearch = '') => { pathname = nextPath; search = nextSearch; },
    keydown(overrides = {}) {
      const event = { key: 'Escape', target: document.activeElement, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides };
      for (const { listener } of listeners.get('keydown') ?? []) listener(event);
      return event;
    },
    unmount: () => { for (const slot of slots) slot?.cleanup?.(); },
    get pendingFrames() { return frames.length; }, get scrollBinding() { return scrollBinding; }, get outsideBinding() { return outsideBinding; }, destination: element => exports.Destination(element.props) };
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

test('mobile sidebar reverses its destinations while preserving the bottom dock order', () => {
  const h = navigationHarness('/portals');
  let ui = h.render();
  assert.equal(ui.dock.props.hidden ?? false, false);
  ui.toggle.props.onClick();
  ui = h.render({ settings: React.createElement('button', { 'aria-label': 'Settings' }), liveControl: React.createElement('button', { 'aria-label': 'Leave live session' }) });
  const destinations = ui.railItems.filter(child => child.props.item).map(child => child.props.item.label);
  assert.deepEqual(destinations, ['Profile', 'Home', 'Messages', 'Studio', 'Videos', 'Search', 'Portalink', 'Bookmarks', 'Analytics', 'Switch to light appearance']);
  assert.equal(ui.railItems[0].props['aria-label'], 'Leave live session');
  assert.equal(ui.railItems.at(-2).props['aria-label'], 'Settings');
  assert.equal(destinations.includes('Back'), false);
  assert.ok(ui.appearance);
  assert.deepEqual(ui.destinations.map(child => child.props.item.label), ['Messages', 'Studio', 'Home', 'Profile']);
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

test('the combined five-button pill stays visible around one persistent toggle in both rail states', () => {
  const h = navigationHarness();
  let ui = h.render();
  assert.equal(ui.dock.props.hidden ?? false, false);
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
  assert.deepEqual(React.Children.toArray(ui.group.props.children).map(child => child.props.item?.label ?? child.props['aria-label']), ['Show navigation', 'Messages', 'Studio', 'Home', 'Profile']);
  assert.deepEqual(ui.destinations.filter(child => child.props.item.disabled).map(child => child.props.item.label), []);
  for (const expectedHidden of [false, true, false, true]) {
    ui.toggle.props.onClick(); ui = h.render();
    assert.equal(ui.rail.props['data-hidden'], expectedHidden);
    assert.equal(ui.dock.props.hidden ?? false, false);
    assert.notEqual(ui.dock.props['aria-hidden'], true);
    assert.notEqual(ui.dock.props.animate?.opacity, 0);
    assert.equal(ui.railToggle, null);
    assert.equal(ui.toggle.ref, toggleRef);
    assert.equal(ui.toggle.ref.current, h.document.activeElement);
    assert.deepEqual(React.Children.toArray(ui.group.props.children).map(child => child.props.item?.label ?? child.props['aria-label']), [expectedHidden ? 'Show navigation' : 'Hide navigation', 'Messages', 'Studio', 'Home', 'Profile']);
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
  assert.equal(navigationHarness().render().dock.props.hidden ?? false, false, 'a new app session starts with the dock');
});

test('outside dismissal keeps the combined dock visible without taking focus from the underlying action', () => {
  const h = navigationHarness();
  let ui = h.render();
  assert.equal(h.outsideBinding.open, false);
  assert.equal(React.Children.count(ui.layer.props.children), 2, 'only the rail and dock occupy the nonmodal navigation layer');
  ui.toggle.props.onClick();
  ui = h.render();
  assert.equal(h.outsideBinding.open, true);
  assert.equal(h.outsideBinding.ref, ui.layer.ref);
  assert.equal(ui.dock.props.hidden ?? false, false);
  // Actions inside the rail keep working without triggering dismissal.
  ui.appearance.props.onClick();
  ui = h.render();
  assert.equal(ui.rail.props['data-hidden'], false);
  const focusedBeforeDismissal = [...ui.focused];
  assert.deepEqual(focusedBeforeDismissal, ['toggle'], 'Explicit opening still focuses the persistent toggle');
  h.outsideBinding.close();
  assert.equal(h.pendingFrames, 0, 'Outside dismissal must not queue toggle focus after the clicked page control focuses');
  ui = h.render();
  assert.equal(ui.rail.props['data-hidden'], true);
  assert.equal(ui.dock.props.hidden ?? false, false);
  assert.equal(h.outsideBinding.open, false);
  assert.deepEqual(ui.focused, focusedBeforeDismissal);
  h.render();
  assert.deepEqual(ui.focused, focusedBeforeDismissal, 'Later renders cannot restore focus left by outside dismissal');
});

test('quick destinations retain their actions, links and accessibility while the rail is open', () => {
  const h = navigationHarness('/messages');
  const calls = [];
  const props = { onMessages: (...args) => calls.push(args), profileHref: '/p/my-profile' };
  let ui = h.render(props);
  ui.toggle.props.onClick();
  ui = h.render(props);
  assert.equal(ui.rail.props['data-hidden'], false);
  assert.equal(ui.dock.props.hidden ?? false, false);
  const [messages, studio, home, profile] = ui.destinations.map(h.destination);
  assert.deepEqual([messages, studio, home, profile].map(child => child.props['aria-label']), ['Messages', 'Studio', 'Home', 'Profile']);
  assert.equal(messages.props['aria-current'], 'page');
  messages.props.onClick({ type: 'click' });
  assert.deepEqual(calls, [[]]);
  assert.equal(h.render(props).rail.props['data-hidden'], false, 'a dock control is part of navigation, not an outside dismissal');
  assert.equal(studio.type, 'a');
  assert.equal(studio.props.to, '/studio');
  assert.equal(studio.props.disabled, undefined);
  assert.equal(home.type, 'a');
  assert.equal(home.props.to, '/');
  assert.equal(profile.type, 'a');
  assert.equal(profile.props.to, '/p/my-profile');
  h.unmount();
});

test('Studio is an enabled dock destination and retains active state through its Bookmarks alias', () => {
  const h = navigationHarness('/studio');
  for (const [pathname, active] of [['/studio', true], ['/saved', true], ['/messages', false]]) {
    h.navigate(pathname);
    const ui = h.render();
    const studio = h.destination(ui.destinations.find(child => child.props.item.label === 'Studio'));
    assert.equal(studio.type, 'a');
    assert.equal(studio.props.to, '/studio');
    assert.equal(studio.props['aria-current'], active ? 'page' : undefined);
    assert.equal(studio.props['aria-label'], 'Studio');
    assert.equal(ui.destinations.length, 4, 'Studio joins the existing opener and four destinations');
  }
  h.navigate('/saved');
  h.render().toggle.props.onClick();
  const bookmarks = h.render().railItems.find(child => child.props.item?.label === 'Bookmarks');
  assert.equal(h.destination(bookmarks).props.to, '/saved');
  assert.equal(h.destination(bookmarks).props['aria-current'], 'page');
  h.unmount();
});

test('pathname and query navigation close the rail without stealing focus from the new destination', () => {
  const h = navigationHarness('/messages');
  for (const [pathname, search] of [['/p/creator', ''], ['/messages', '?conversation=one'], ['/messages', '?conversation=two']]) {
    h.render().toggle.props.onClick();
    let ui = h.render();
    assert.equal(ui.rail.props['data-hidden'], false);
    const destination = h.target('destination');
    h.document.activeElement = destination;
    const focusBefore = [...h.focused];
    h.navigate(pathname, search);
    ui = h.render();
    assert.equal(ui.rail.props['data-hidden'], true);
    assert.equal(ui.dock.props.hidden ?? false, false);
    assert.equal(h.outsideBinding.open, false);
    assert.equal(h.document.activeElement, destination);
    assert.deepEqual(h.focused, focusBefore);
    assert.equal(h.pendingFrames, 0);
  }
  h.unmount();
});

test('ordinary sidebar control taps and unchanged routes keep navigation open', () => {
  const h = navigationHarness('/p/creator');
  let settingsOpened = 0;
  const settings = React.createElement('button', { 'aria-label': 'Settings', onClick: () => settingsOpened++ });
  h.render().toggle.props.onClick();
  let ui = h.render({ settings });
  const target = h.target('settings', { insideNavigation: true });
  ui.rail.props.onPointerDownCapture(pointer(60, 10, 0, { target }));
  ui.rail.props.onPointerUpCapture(pointer(60, 10, 90, { target }));
  const tap = click(); ui.rail.props.onClickCapture(tap);
  assert.equal(tap.prevented, false);
  ui.railItems.find(item => item.props['aria-label'] === 'Settings').props.onClick();
  ui.appearance.props.onClick();
  h.navigate('/p/creator');
  ui = h.render({ settings, theme: 'light' });
  assert.equal(settingsOpened, 1);
  assert.equal(ui.rail.props['data-hidden'], false);
  assert.equal(h.outsideBinding.open, true);
  assert.deepEqual(ui.railItems.filter(item => item.props.item?.disabled).map(item => item.props.item.label), ['Videos', 'Search']);
  for (const item of ui.railItems.filter(item => item.props.item?.disabled)) assert.equal(h.destination(item).props.disabled, true);
  h.unmount();
});

test('Escape closes the rail and returns focus only when navigation currently owns it', () => {
  for (const insideNavigation of [false, true]) {
    const h = navigationHarness();
    h.render().toggle.props.onClick(); h.render();
    const active = h.target(insideNavigation ? 'navigation item' : 'page input', { insideNavigation });
    h.document.activeElement = active;
    const before = h.focused.length;
    const event = h.keydown();
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, undefined, 'Escape is observed at document bubble phase without a propagation trap.');
    assert.equal(h.pendingFrames, 0);
    assert.equal(h.render().rail.props['data-hidden'], true);
    assert.equal(h.focused.length, before + Number(insideNavigation));
    assert.equal(h.document.activeElement.name, insideNavigation ? 'toggle' : 'page input');
    assert.equal(h.listeners.has('keydown'), false);
    assert.equal(h.keydown().defaultPrevented, false, 'A closed rail does not claim Escape.');
    h.unmount();
  }
});

test('Escape respects handled keys and external dialogs or menus, and removes its listener on unmount', () => {
  const h = navigationHarness();
  h.render().toggle.props.onClick(); h.render();
  assert.equal(h.listeners.get('keydown').length, 1);
  for (const { options } of h.listeners.get('keydown')) assert.notEqual(typeof options === 'object' ? options?.capture : options, true);
  for (const override of [{ key: 'Tab' }, { defaultPrevented: true },
    ...['menu', 'dialog', 'alertdialog'].map(role => ({ target: h.target(role, { role }) }))]) {
    const before = h.focused.length;
    const event = h.keydown(override);
    assert.equal(event.defaultPrevented, override.defaultPrevented ?? false);
    assert.equal(h.render().rail.props['data-hidden'], false);
    assert.equal(h.focused.length, before);
  }
  h.unmount();
  assert.equal(h.listeners.has('keydown'), false);
});

test('Portals is absent from both mobile navigation forms even on the portals route', () => {
  for (const pathname of ['/', '/portals']) {
    const h = navigationHarness(pathname);
    let ui = h.render();
    assert.equal(ui.dock.props.hidden ?? false, false);
    assert.equal(ui.destinations.some(child => child.props.item.label === 'Portals'), false);
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
    assert.equal(ui.dock.props.hidden ?? false, false);
    const event = click(); ui[surface].props.onClickCapture(event);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
  }
  assert.deepEqual(ui.focused, ['toggle', 'toggle'], 'Deliberate sidebar swipes retain the existing focus return');
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
