import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

function harness(enabled = true) {
  const listeners = new Map(), calls = [];
  let install, cleanup, action, selected = false, modal = false;
  const root = { isConnected: true };
  class Element {
    constructor({ reserved = false, overflowX = 'visible', scrollWidth = 420 } = {}) {
      Object.assign(this, { reserved, overflowX, scrollWidth, clientWidth: 420, parentElement: root });
    }
    closest(selector) { return selector.startsWith('.codex-shell') ? root : this.reserved ? this : null; }
  }
  const window = { innerWidth: 420, location: { href: 'https://fixture.invalid/search' }, getSelection: () => ({ isCollapsed: !selected }) };
  const document = {
    querySelectorAll: () => modal ? [{ getClientRects: () => [{}], closest: () => null }] : [],
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  const navigation = sourceModule('src/presentation/mobile/useNavigationSwipe.ts');
  const api = sourceModule('src/presentation/mobile/useMobileBackSwipe.ts', {
    react: { useEffect: effect => { install = effect; }, useRef: value => action ??= { current: value } },
    './useNavigationSwipe': navigation,
    './backNavigationTransition': { markMobileBackNavigation: () => calls.push('mark') },
  }, { Element, window, document, getComputedStyle: node => ({ overflowX: node.overflowX }) });
  api.useMobileBackSwipe(enabled, () => calls.push('back')); cleanup = install();
  const point = (x, y = 350, identifier = 1) => ({ clientX: x, clientY: y, identifier });
  const event = (values = {}) => ({ target: new Element(), touches: [], changedTouches: [], timeStamp: 0, cancelable: true,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...values });
  const fire = (name, values) => { const result = event(values); listeners.get(name)?.(result); return result; };
  const start = (values = {}) => fire('touchstart', { touches: [point(210)], ...values });
  const move = (x, y = 350, values = {}) => fire('touchmove', { touches: [point(x, y)], timeStamp: 40, ...values });
  const end = (x, y = 350, values = {}) => fire('touchend', { changedTouches: [point(x, y)], timeStamp: 90, ...values });
  return { listeners, calls, root, Element, window, start, move, end, fire, point, action,
    selectText() { selected = true; }, showModal() { modal = true; }, cleanup() { cleanup?.(); } };
}

test('a short centre flick returns once and suppresses the dragged navigation control activation', () => {
  const h = harness(); h.start();
  assert.equal(h.move(240).prevented, true);
  const pointer = h.fire('pointerup', { pointerType: 'touch' }); assert.equal(pointer.stopped, true);
  h.end(246); h.end(246); assert.deepEqual(h.calls, ['mark', 'back']);
  assert.equal(h.fire('click', { detail: 1 }).stopped, true);
  assert.equal(h.fire('click', { detail: 1 }).stopped, undefined);
  h.cleanup(); assert.equal(h.listeners.size, 0);
});

test('vertical scrolling, leftward drags and slow incomplete swipes do not navigate', () => {
  const h = harness();
  for (const [x, y] of [[100, 350], [220, 430], [240, 385], [225, 350]]) {
    h.start(); h.move(x, y); h.end(x, y, { timeStamp: 500 });
  }
  h.start(); h.move(215, 380); h.move(320, 385); h.end(320, 385);
  assert.deepEqual(h.calls, []);
});

test('page gestures, forms, horizontal scrollers, modal controls and browser edges retain ownership', () => {
  const h = harness();
  for (const values of [
    { target: new h.Element({ reserved: true }) },
    { target: new h.Element({ overflowX: 'auto', scrollWidth: 840 }) },
    { touches: [h.point(5)] }, { touches: [h.point(415)] },
  ]) { h.start(values); assert.equal(h.move(320).prevented, undefined); h.end(320); }
  h.showModal(); h.start(); h.move(320); h.end(320);
  assert.deepEqual(h.calls, []);
  const selection = harness(); selection.selectText(); selection.start(); selection.move(320); selection.end(320);
  assert.deepEqual(selection.calls, []);
});

test('pinch, native cancellation, changed screens and unmounted roots cancel pending Back', () => {
  const h = harness();
  h.start(); h.move(260); h.fire('touchcancel'); h.end(320);
  h.start(); h.move(260, 350, { touches: [h.point(260), h.point(290, 350, 2)] }); h.end(320);
  h.start(); h.move(260, 350, { cancelable: false }); h.end(320);
  h.start(); h.move(260); h.window.location.href += '?new'; h.end(320);
  h.start(); h.move(260); h.root.isConnected = false; h.end(320);
  assert.deepEqual(h.calls, []);
});

test('keyboard and mouse activations survive a cancelled touch and desktop installs no listeners', () => {
  const h = harness(); h.start(); h.move(250); h.fire('touchcancel');
  assert.equal(h.fire('click', { detail: 0 }).prevented, undefined);
  h.start(); h.move(250); h.fire('touchcancel'); h.fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(h.fire('click', { detail: 1 }).prevented, undefined);
  const desktop = harness(false); assert.equal(desktop.listeners.size, 0);
});

test('a normal render uses the latest screen Back callback without installing more listeners', () => {
  const h = harness(); h.start(); h.move(250); h.action.current = () => h.calls.push('latest'); h.end(290);
  assert.deepEqual(h.calls, ['mark', 'latest']); assert.equal(h.listeners.size, 7);
});
