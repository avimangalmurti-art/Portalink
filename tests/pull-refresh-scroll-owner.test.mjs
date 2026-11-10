import assert from 'node:assert/strict';
import test from 'node:test';
import { hookHarness } from './helpers/hook-harness.mjs';

function fixture({ docTop = 0, windowTop = docTop, getScrollTop, enabled = true, busy = false, feedback = true, onPull } = {}) {
  const listeners = new Map(), registrations = [], removed = [], refreshes = [], pulls = [];
  const settings = { enabled, busy, getScrollTop, onPull: feedback ? onPull ?? ((...args) => pulls.push(args)) : undefined, refresh: () => refreshes.push('refresh') };
  const document = { scrollingElement: { scrollTop: docTop }, dialog: false,
    querySelector(selector) { assert.equal(selector, '[role="dialog"][aria-modal="true"]'); return this.dialog ? {} : null; },
  };
  const surface = {
    addEventListener(type, handler, options) { registrations.push({ type, handler, options }); listeners.set(type, handler); },
    removeEventListener(type, handler) { assert.equal(listeners.get(type), handler); removed.push(type); listeners.delete(type); },
  };
  class Element { constructor(interactive = false) { this.interactive = interactive; } closest() { return this.interactive ? this : null; } }
  const ref = { current: surface };
  const args = () => [ref, settings.enabled, settings.busy, settings.refresh, settings.onPull, settings.getScrollTop];
  const h = hookHarness(new URL('../src/components/home/useHomePullRefresh.ts', import.meta.url), 'useHomePullRefresh', {}, {}, args(), undefined, {}, {
    document, window: { scrollY: windowTop }, Element,
  });
  const emit = (type, { x = 20, y = 100, touches = 1, interactive = false, cancelable = true } = {}) => {
    let prevented = false;
    const event = { touches: Array.from({ length: touches }, () => ({ clientX: x, clientY: y })), target: new Element(interactive), cancelable,
      preventDefault() { assert.equal(cancelable, true); prevented = true; },
    };
    listeners.get(type)?.(event); void h.value; return { prevented };
  };
  void h.value;
  return { settings, listeners, registrations, removed, refreshes, pulls, document, emit,
    label: () => h.value,
    update(patch) { Object.assign(settings, patch); h.options(args()); void h.value; },
    pull(options) { emit('touchstart', options); emit('touchmove', { ...options, y: (options?.y ?? 100) + 80 }); emit('touchend'); },
    dispose: h.dispose,
  };
}

test('a contained scroll owner blocks mid-results pulls even when the document is at zero', () => {
  let containedTop = 160;
  const h = fixture({ getScrollTop: () => containedTop });
  h.pull(); assert.deepEqual(h.refreshes, []); assert.equal(h.label(), '');
  containedTop = 0;
  h.emit('touchstart');
  assert.equal(h.emit('touchmove', { y: 171 }).prevented, true);
  assert.equal(h.label(), 'Pull to refresh');
  h.emit('touchmove', { y: 172 }); assert.equal(h.label(), 'Release to refresh');
  assert.deepEqual(h.refreshes, [], 'Refresh waits until the qualifying pull is released');
  h.emit('touchend'); assert.deepEqual(h.pulls.at(-1), [null, true]); h.emit('touchend');
  assert.deepEqual(h.refreshes, ['refresh']); assert.equal(h.label(), '');
  h.dispose();
});

test('a contained owner also refreshes with the optional fifth feedback callback omitted', () => {
  const h = fixture({ getScrollTop: () => 0, feedback: false });
  h.pull(); assert.deepEqual(h.refreshes, ['refresh']); assert.deepEqual(h.pulls, []); h.dispose();
});

test('supplied owner position overrides document scroll and the Home default still uses its document', () => {
  const contained = fixture({ docTop: 240, getScrollTop: () => 0 });
  contained.pull(); assert.equal(contained.refreshes.length, 1); contained.dispose();
  const home = fixture({ docTop: 240, windowTop: 0 });
  home.pull(); assert.equal(home.refreshes.length, 0);
  home.document.scrollingElement.scrollTop = 0;
  home.pull(); assert.equal(home.refreshes.length, 1); home.dispose();
  const fallback = fixture({ docTop: 0, windowTop: 240 });
  fallback.document.scrollingElement = null;
  fallback.pull(); assert.equal(fallback.refreshes.length, 0); fallback.dispose();
});

test('replacing the owner callback during a pull uses the current position and keeps current refresh callbacks', () => {
  const h = fixture({ getScrollTop: () => 0 });
  const registered = h.registrations.length;
  h.emit('touchstart'); h.emit('touchmove', { y: 180 });
  h.update({ getScrollTop: () => 40 }); h.emit('touchend');
  assert.equal(h.refreshes.length, 0, 'An old top-of-list callback cannot authorize refresh for a newly scrolled owner');
  h.update({ getScrollTop: () => 0, refresh: () => h.refreshes.push('current') });
  h.pull(); assert.deepEqual(h.refreshes, ['current']);
  assert.equal(h.registrations.length, registered, 'Live callback updates need not replace touch listeners');
  h.update({ getScrollTop: () => Infinity }); h.pull();
  assert.deepEqual(h.refreshes, ['current'], 'A missing Insights scroll container can fail closed');
  h.dispose();
});

test('horizontal, upward, short, pinch, canceled and form-control gestures cannot refresh', () => {
  const gestures = [
    h => { h.emit('touchstart'); assert.equal(h.emit('touchmove', { x: 120, y: 120 }).prevented, false); h.emit('touchend'); },
    h => { h.emit('touchstart'); assert.equal(h.emit('touchmove', { y: 80 }).prevented, false); h.emit('touchend'); },
    h => { h.emit('touchstart'); h.emit('touchmove', { y: 171 }); h.emit('touchend'); },
    h => { h.emit('touchstart', { touches: 2 }); h.emit('touchmove', { y: 190, touches: 2 }); h.emit('touchend'); },
    h => { h.emit('touchstart'); h.emit('touchmove', { y: 180, touches: 2 }); h.emit('touchend'); },
    h => { h.emit('touchstart'); h.emit('touchmove', { y: 180 }); h.emit('touchcancel'); h.emit('touchend'); },
    h => { h.emit('touchstart', { interactive: true }); h.emit('touchmove', { y: 180 }); h.emit('touchend'); },
  ];
  for (const gesture of gestures) {
    const h = fixture({ getScrollTop: () => 0 }); gesture(h);
    assert.deepEqual(h.refreshes, []); assert.equal(h.label(), ''); h.dispose();
  }
});

test('busy state, dialogs, scrolling away from the top and inactive surfaces prevent pending refresh', () => {
  for (const change of [
    h => h.update({ busy: true }),
    h => { h.document.dialog = true; },
    h => h.update({ getScrollTop: () => 20 }),
    h => h.update({ enabled: false }),
  ]) {
    const h = fixture({ getScrollTop: () => 0 });
    h.emit('touchstart'); h.emit('touchmove', { y: 180 }); change(h); h.emit('touchend');
    assert.deepEqual(h.refreshes, []); h.dispose();
  }
  for (const options of [{ busy: true }, { enabled: false }]) {
    const h = fixture({ getScrollTop: () => 0, ...options }); h.pull(); assert.deepEqual(h.refreshes, []); h.dispose();
  }
  const dialog = fixture({ getScrollTop: () => 0 }); dialog.document.dialog = true;
  dialog.pull(); assert.deepEqual(dialog.refreshes, []); dialog.dispose();
});

test('listeners keep a cancellable touch move and release authority when the surface is disabled or unmounted', () => {
  const h = fixture({ getScrollTop: () => 0 });
  assert.deepEqual(h.registrations.map(({ type, options }) => [type, options.passive]), [
    ['touchstart', true], ['touchmove', false], ['touchend', true], ['touchcancel', true],
  ]);
  const oldMove = h.listeners.get('touchmove'), oldEnd = h.listeners.get('touchend');
  h.emit('touchstart'); h.emit('touchmove', { y: 180 });
  h.update({ enabled: false }); assert.equal(h.listeners.size, 0);
  oldMove({ touches: [{ clientX: 20, clientY: 220 }] }); oldEnd();
  assert.deepEqual(h.refreshes, []);
  h.update({ enabled: true }); h.emit('touchstart');
  const unmountedEnd = h.listeners.get('touchend');
  h.dispose(); assert.equal(h.listeners.size, 0); unmountedEnd();
  assert.deepEqual(h.refreshes, []);
  assert.equal(h.removed.length, 8);
});
