import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

/** Real hook with interruptible MotionValues; native geometry/focus/scroll are forbidden. */
function fixture({ enabled = true, refreshing = false, reduced = false, appReduced = false } = {}) {
  const slots = [], values = [], controls = [], styleWrites = [], observers = [];
  let cursor = 0, effects = [], result, prefersReduced = reduced, applicationReduced = appReduced, renders = 0;
  let options = { enabled, refreshing, scope: {} }, geometryReads = 0, focusWrites = 0, scrollWrites = 0;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const effect = (run, deps) => {
    const index = cursor++, prior = slots[index];
    if (!same(prior?.deps, deps)) {
      slots[index] = { deps };
      effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = run(); });
    }
  };
  const react = {
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: callback }; return slots[index].value; },
    useLayoutEffect: effect,
  };
  class MotionValue {
    constructor(initial) { this.value = initial; this.listeners = new Set(); values.push(this); }
    get() { return this.value; }
    jump(value) { this.value = value; for (const listener of [...this.listeners]) listener(value); }
    on(event, listener) {
      assert.equal(event, 'change'); this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
  }
  const motion = {
    useMotionValue(initial) { const ref = react.useRef(null); return ref.current ??= new MotionValue(initial); },
    animate(value, target, animation) {
      const finishers = [];
      const control = { value, from: value.get(), target, animation, stopped: false, completed: false, stops: 0,
        then(callback) { finishers.push(callback); return Promise.resolve(); },
        stop() { this.stops++; this.stopped = true; },
        advance(position) { if (!this.stopped && !this.completed) this.value.jump(position); },
        complete() { if (!this.stopped && !this.completed) { this.value.jump(this.target); this.completed = true; for (const callback of finishers) callback(); } },
        lateCompletion() { for (const callback of finishers) callback(); },
      };
      controls.push(control); return control;
    },
  };
  const events = () => ({ listeners: new Map(),
    addEventListener(name, callback, options) { this.listeners.set(name, { callback, options }); },
    removeEventListener(name, callback) { if (this.listeners.get(name)?.callback === callback) this.listeners.delete(name); },
    emit(name, props = {}) { const event = { type: name, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...props }; this.listeners.get(name)?.callback(event); return event; },
  });
  const window = events(), preference = { ...events(), get matches() { return prefersReduced; } };
  window.matchMedia = query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return preference; };
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this); }
    observe(target, options) { this.targets.push({ target, options }); }
    disconnect() { this.disconnected = true; }
    notify() { if (!this.disconnected) this.callback([]); }
  }
  const element = name => {
    const attributes = new Map();
    const target = { ...events(), parentElement: null,
    setAttribute(key, value) { attributes.set(key, String(value)); }, getAttribute(key) { return attributes.get(key) ?? null; },
    style: new Proxy({ transform: '', opacity: '0' }, { set(style, key, value) {
      assert.ok(key === 'transform' || key === 'opacity', `${name} must not change layout property ${String(key)}`);
      styleWrites.push({ name, key, value }); style[key] = value; return true;
    } }), getBoundingClientRect() { geometryReads++; throw new Error('Refresh motion must not measure layout'); },
    focus() { focusWrites++; throw new Error('Refresh motion must not move focus'); },
    scrollTo() { scrollWrites++; throw new Error('Refresh motion must not scroll the reader'); },
    };
    for (const key of ['clientHeight', 'clientWidth', 'offsetHeight', 'offsetWidth', 'scrollHeight', 'scrollWidth']) Object.defineProperty(target, key, {
      get() { geometryReads++; throw new Error(`Refresh motion must not read ${key}`); },
    });
    for (const key of ['scrollTop', 'scrollLeft']) Object.defineProperty(target, key, {
      get() { return 481; }, set() { scrollWrites++; throw new Error('Refresh motion must not alter scroll position'); },
    });
    return target;
  };
  const content = element('content'), indicator = element('indicator'), ancestor = element('ancestor');
  content.parentElement = ancestor;
  const { useHomeRefreshMotion } = sourceModule('src/components/home/useHomeRefreshMotion.ts', {
    react, 'framer-motion': motion, '../../presentation/motion/motion': { reducedMotion: () => prefersReduced || applicationReduced },
  }, { window, MutationObserver: Observer });
  const render = (change = {}) => {
    options = { ...options, ...change }; cursor = 0; effects = []; renders++; result = useHomeRefreshMotion(options);
    result.contentRef.current = content; result.indicatorRef.current = indicator;
    return result;
  };
  const commit = () => { for (const run of effects.splice(0)) run(); };
  render(); commit();
  return { values, controls, styleWrites, content, indicator, ancestor, window, preference, observers, render, commit,
    get value() { return result; }, get options() { return options; },
    get renders() { return renders; },
    get offset() { return values[0].get(); }, get opacity() { return values[1].get(); },
    get activeControls() { return controls.filter(control => !control.stopped && !control.completed); },
    update(change = {}) { render(change); commit(); },
    reduce({ os = prefersReduced, app = applicationReduced } = {}) { prefersReduced = os; applicationReduced = app; },
    notifyPreference() { for (const observer of observers) observer.notify(); },
    complete() { for (const control of [...controls]) control.complete(); },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
    assertPaintOnly() { assert.equal(geometryReads, 0); assert.equal(focusWrites, 0); assert.equal(scrollWrites, 0); },
  };
}

test('direct Home pulls resist travel, remain bounded and interrupt the return at its current paint position', () => {
  const h = fixture(); h.complete();
  const onPull = h.value.onPull;
  onPull(30); const short = h.offset;
  assert.ok(short > 0 && short < 30);
  onPull(75); const medium = h.offset;
  assert.ok(medium > short && medium < 75); assert.equal(h.opacity, 1);
  onPull(10000); assert.equal(h.offset, 80, 'Even a very long drag cannot move the feed beyond its bounded band');
  onPull(null); const returning = h.activeControls.find(control => control.value === h.values[0]);
  assert.equal(returning.from, 80); assert.equal(returning.target, 0); assert.equal(returning.animation.type, 'spring');
  returning.advance(24); assert.equal(h.offset, 24);
  onPull(48); const next = h.offset;
  assert.ok(next > 24 && next < 48); assert.equal(returning.stopped, true);
  returning.complete(); assert.equal(h.offset, next, 'A cancelled spring cannot snap a new pull back to its earlier start or end');
  assert.equal(h.activeControls.length, 0, 'Direct manipulation owns paint until release');
  onPull(null); assert.equal(h.activeControls.filter(control => control.value === h.values[0]).length, 1);
  h.complete(); assert.equal(h.content.style.transform, ''); assert.equal(h.indicator.style.opacity, '0');
  h.assertPaintOnly(); h.dispose();
});

test('every real pending refresh reserves the top indicator band, while gesture intent alone cannot hold it', () => {
  const h = fixture(); h.complete();
  h.update({ refreshing: true });
  assert.equal(h.activeControls.find(control => control.value === h.values[0]).target, 32, 'A pending background refresh must also clear the top indicator from the tabs');
  h.complete(); assert.equal(h.offset, 32); assert.equal(h.opacity, 1); assert.equal(h.indicator.style.opacity, '1');
  h.update({ refreshing: false }); h.complete();
  h.value.onPull(100); h.value.onPull(null, true);
  assert.equal(h.activeControls.find(control => control.value === h.values[0]).target, 0, 'Gesture intent alone must not invent a pending request');
  h.update({ refreshing: true });
  let movement = h.activeControls.find(control => control.value === h.values[0]);
  assert.equal(movement.target, 32); assert.equal(h.activeControls.find(control => control.value === h.values[1]).target, 1);
  h.complete(); assert.equal(h.offset, 32); assert.equal(h.opacity, 1);
  h.update({ refreshing: false });
  movement = h.activeControls.find(control => control.value === h.values[0]);
  assert.equal(movement.target, 0); assert.equal(h.options.refreshing, false, 'Completed application state is immediate even while its visual return remains unfinished');
  assert.equal(h.activeControls.find(control => control.value === h.values[1]).target, 0);
  h.complete(); assert.equal(h.offset, 0); assert.equal(h.opacity, 0); h.assertPaintOnly(); h.dispose();
});

test('the indicator stays centered in the revealed band and fades before the tabs can overlap it', () => {
  const h = fixture(); h.complete();
  h.update({ refreshing: true });
  const movement = h.activeControls.find(control => control.value === h.values[0]);
  const fade = h.activeControls.find(control => control.value === h.values[1]);
  const renders = h.renders;
  fade.advance(1); assert.equal(h.indicator.style.opacity, '0', 'A pending request must not paint the indicator over resting tabs');
  movement.advance(24); assert.equal(h.indicator.style.opacity, '0'); assert.equal(h.indicator.style.transform, '');
  movement.advance(28); assert.equal(h.indicator.style.opacity, '0.5'); assert.equal(h.indicator.style.transform, 'translate3d(0, 2px, 0)');
  movement.advance(32); assert.equal(h.indicator.style.opacity, '1'); assert.equal(h.indicator.style.transform, 'translate3d(0, 4px, 0)');
  fade.advance(.4); assert.equal(h.indicator.style.opacity, '0.4', 'The existing fade still owns completion opacity');
  movement.advance(20); assert.equal(h.indicator.style.opacity, '0', 'Returning tabs hide the indicator before they overlap');
  movement.advance(80); assert.equal(h.indicator.style.opacity, '0.4', 'A longer pull never amplifies the fade above its own opacity');
  assert.equal(h.indicator.style.transform, 'translate3d(0, 28px, 0)');
  assert.equal(h.renders, renders, 'Reveal follows MotionValue paint without rerendering Home');
  h.update({ refreshing: false }); h.complete();
  assert.equal(h.indicator.style.opacity, '0'); assert.equal(h.indicator.style.transform, ''); assert.equal(h.content.style.transform, '');
  h.assertPaintOnly(); h.dispose();
});

test('OS and in-app Reduce Motion reserve a static pending band without springs or faded delay', () => {
  for (const reduced of [{ reduced: true }, { appReduced: true }]) {
    const h = fixture(reduced); assert.equal(h.controls.length, 0);
    h.value.onPull(100); assert.equal(h.offset, 0); assert.equal(h.opacity, 1); assert.equal(h.indicator.style.opacity, '0'); assert.equal(h.content.style.transform, '');
    h.value.onPull(null); assert.equal(h.opacity, 0);
    h.update({ refreshing: true }); assert.equal(h.offset, 32); assert.equal(h.opacity, 1); assert.equal(h.indicator.style.opacity, '1'); assert.equal(h.controls.length, 0);
    assert.equal(h.content.style.transform, 'translate3d(0, 32px, 0)');
    h.update({ refreshing: false }); assert.equal(h.offset, 0); assert.equal(h.opacity, 0); assert.equal(h.indicator.style.opacity, '0'); assert.equal(h.controls.length, 0);
    h.assertPaintOnly(); h.dispose();
  }
});

test('a native OS preference event interrupts a live spring and restores optional motion without any React rerender', () => {
  const h = fixture(); h.value.onPull(100); h.value.onPull(null, true); h.update({ refreshing: true });
  const prior = [...h.activeControls]; prior.find(control => control.value === h.values[0]).advance(18);
  const renders = h.renders;
  assert.equal(h.indicator.getAttribute('data-refresh-reduced'), 'false');
  assert.equal(h.preference.listeners.size, 1);
  h.reduce({ os: true }); h.preference.emit('change', { matches: true });
  assert.equal(h.renders, renders, 'An actual matchMedia change must work without a hook rerender');
  assert.equal(h.indicator.getAttribute('data-refresh-reduced'), 'true', 'The indicator explicitly stops its CSS rotation');
  assert.equal(h.offset, 32); assert.equal(h.opacity, 1); assert.equal(h.indicator.style.opacity, '1'); assert.ok(prior.every(control => control.stopped));
  for (const control of prior) control.complete(); assert.equal(h.offset, 32);
  h.reduce({ os: false }); h.preference.emit('change', { matches: false });
  assert.equal(h.renders, renders); assert.equal(h.indicator.getAttribute('data-refresh-reduced'), 'false');
  assert.equal(h.activeControls.length, 2); assert.ok(h.activeControls.every(control => !prior.includes(control)));
  h.assertPaintOnly(); h.dispose();
  assert.equal(h.preference.listeners.size, 0);
  const controls = h.controls.length, writes = h.styleWrites.length;
  h.reduce({ os: true }); h.preference.emit('change', { matches: true });
  assert.equal(h.controls.length, controls); assert.equal(h.styleWrites.length, writes, 'Detached OS events cannot resume motion after cleanup');
});

test('changing in-app Reduce Motion stops live motion through ancestor classes without another request or render', () => {
  const h = fixture(); h.value.onPull(100); h.value.onPull(null, true); h.update({ refreshing: true });
  h.activeControls.find(control => control.value === h.values[0]).advance(20);
  const prior = [...h.activeControls], count = h.controls.length;
  assert.ok(h.observers.at(-1).targets.some(item => item.target === h.ancestor));
  h.reduce({ app: true }); h.notifyPreference();
  assert.equal(h.indicator.getAttribute('data-refresh-reduced'), 'true');
  assert.equal(h.offset, 32); assert.equal(h.opacity, 1); assert.equal(h.indicator.style.opacity, '1'); assert.equal(h.controls.length, count);
  assert.ok(prior.every(control => control.stopped));
  for (const control of prior) control.lateCompletion(); assert.equal(h.offset, 32);
  h.notifyPreference(); assert.equal(h.controls.length, count, 'An unrelated class mutation cannot restart settled reduced-motion state');
  h.reduce({ app: false }); h.notifyPreference();
  assert.equal(h.indicator.getAttribute('data-refresh-reduced'), 'false'); assert.equal(h.activeControls.length, 2);
  h.assertPaintOnly(); h.dispose(); assert.ok(h.observers.every(observer => observer.disconnected));
});

test('one owner per MotionValue stops superseded controls, clears paint and detaches every subscription on unmount', () => {
  const h = fixture();
  assert.deepEqual(h.values.map(value => value.listeners.size), [1, 1]);
  for (let index = 0; index < 8; index++) {
    h.value.onPull(90); h.value.onPull(null);
    assert.equal(h.activeControls.length, 2);
    assert.equal(h.activeControls.filter(control => control.value === h.values[0]).length, 1);
    assert.equal(h.activeControls.filter(control => control.value === h.values[1]).length, 1);
  }
  h.dispose(); assert.ok(h.controls.every(control => control.stopped));
  assert.ok(h.controls.every(control => control.stops === 1), 'Each animation control must be cancelled once by its owner');
  assert.deepEqual(h.values.map(value => value.listeners.size), [0, 0]);
  assert.equal(h.content.style.transform, ''); assert.equal(h.indicator.style.opacity, '0');
  assert.equal(h.content.listeners.size, 0); assert.equal(h.window.listeners.size, 0); assert.equal(h.preference.listeners.size, 0); assert.ok(h.observers.every(observer => observer.disconnected));
  const writes = h.styleWrites.length; for (const control of h.controls) { control.complete(); control.lateCompletion(); }
  assert.equal(h.styleWrites.length, writes); h.assertPaintOnly();
});

test('inactive Home and replacement account scopes cancel held motion and reject stale pull callbacks immediately', () => {
  const h = fixture(); h.value.onPull(100); h.value.onPull(null, true); h.update({ refreshing: true }); h.complete();
  const stale = h.value.onPull, before = h.styleWrites.length;
  h.render({ scope: {} });
  stale(100); assert.equal(h.styleWrites.length, before, 'An old account callback is inert before replacement layout effects');
  h.commit(); assert.deepEqual(h.values.map(value => value.listeners.size), [1, 1]);
  stale(100); assert.equal(h.offset, 0);
  assert.equal(h.activeControls.find(control => control.value === h.values[0]).from, 0, 'A replacement scope starts a new band from rest instead of inheriting the old pull');
  h.complete(); assert.equal(h.offset, 32, 'The replacement scope may reserve its own band only because its real refresh remains pending');
  h.update({ enabled: false });
  assert.equal(h.offset, 0); assert.equal(h.opacity, 0); assert.equal(h.activeControls.length, 0);
  assert.deepEqual(h.values.map(value => value.listeners.size), [0, 0]); assert.equal(h.content.listeners.size, 0); assert.equal(h.window.listeners.size, 0); assert.equal(h.preference.listeners.size, 0);
  const stoppedWrites = h.styleWrites.length; h.value.onPull(100); stale(null);
  assert.equal(h.styleWrites.length, stoppedWrites);
  h.update({ enabled: true, refreshing: false }); h.complete();
  h.value.onPull(36); assert.ok(h.offset > 0); h.assertPaintOnly(); h.dispose();
  const unmounted = h.styleWrites.length; h.value.onPull(90); assert.equal(h.styleWrites.length, unmounted);
});

test('a disabled WEB or city hook never translates content, starts animation or shows an indicator', () => {
  const h = fixture({ enabled: false, refreshing: true });
  assert.equal(h.controls.length, 0); assert.equal(h.offset, 0); assert.equal(h.opacity, 0);
  assert.deepEqual(h.values.map(value => value.listeners.size), [0, 0]); assert.equal(h.content.listeners.size, 0); assert.equal(h.window.listeners.size, 0); assert.equal(h.preference.listeners.size, 0); assert.equal(h.observers.length, 0);
  h.value.onPull(120); h.value.onPull(null); assert.equal(h.controls.length, 0);
  assert.equal(h.content.style.transform, ''); assert.equal(h.indicator.style.opacity, '0'); h.assertPaintOnly(); h.dispose();
});

test('wheel, document scroll and scroll keys immediately release paint and leave native interaction untouched', () => {
  for (const input of ['wheel', 'scroll', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']) {
    const h = fixture(); h.value.onPull(100); h.value.onPull(null, true); h.update({ refreshing: true }); h.complete();
    assert.equal(h.offset, 32);
    const event = input === 'scroll' ? h.window.emit('scroll') : input === 'wheel' ? h.content.emit('wheel') : h.content.emit('keydown', { key: input });
    assert.equal(event.defaultPrevented, false); assert.equal(h.offset, 0); assert.equal(h.opacity, 0); assert.equal(h.activeControls.length, 0);
    h.update({ refreshing: false }); h.complete(); assert.equal(h.offset, 0, 'Completion after native scrolling cannot reinstate the abandoned band');
    h.assertPaintOnly(); h.dispose();
  }
  const h = fixture(); h.value.onPull(100); const before = h.offset;
  h.content.emit('keydown', { key: 'a' }); assert.equal(h.offset, before, 'Typing and non-scroll keyboard commands stay outside interruption handling');
  h.dispose();
});
