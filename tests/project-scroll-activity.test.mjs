import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class ScrollTarget {
  constructor({ stage = true, mobile = true, outgoing = false } = {}) {
    Object.assign(this, { stage, mobile, outgoing });
  }
  closest(selector) {
    const matches = selector === '[data-project-stage]' ? this.stage
      : selector === '[data-mobile-project-view]' ? this.mobile : this.outgoing;
    return matches ? this : null;
  }
}

function harness() {
  const slots = [], effects = [], timers = new Map(), listeners = new Map();
  let cursor = 0, now = 0, id = 0, focused = false;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = next; }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i])) {
        effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  const document = {
    addEventListener(type, handler, options) {
      if (type.startsWith('scroll')) { assert.equal(options.capture, true); assert.equal(options.passive, true); }
      listeners.set(type, handler);
    },
    removeEventListener(type, handler, capture) {
      if (type.startsWith('scroll')) assert.equal(capture, true);
      assert.equal(listeners.get(type), handler);
      listeners.delete(type);
    },
  };
  const navigation = { current: { querySelector: () => focused ? {} : null } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/useProjectScrollActivity.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, document, HTMLElement: ScrollTarget, require: () => react,
    setTimeout(fn, delay) { const key = ++id; timers.set(key, { fn, due: now + delay }); return key; },
    clearTimeout(key) { timers.delete(key); },
  });
  return {
    listeners, timers,
    render(enabled = true, path = '/project/a') {
      cursor = 0;
      const value = exports.useProjectScrollActivity(enabled, path, navigation);
      effects.splice(0).forEach(effect => effect());
      return value;
    },
    emit(type, target) { listeners.get(type)?.({ target }); },
    focus(value) { focused = value; listeners.get('focusin')?.({}); },
    advance(ms) {
      now += ms;
      for (const [key, timer] of timers) if (timer.due <= now) { timers.delete(key); timer.fn(); }
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('project scrolling and momentum keep navigation hidden until 200ms of idle', () => {
  const h = harness(), page = new ScrollTarget();
  assert.equal(h.render(), false);
  h.emit('scroll', page);
  assert.equal(h.render(), true);
  h.advance(150);
  h.emit('scroll', page);
  h.advance(150);
  assert.equal(h.render(), true);
  h.advance(50);
  assert.equal(h.render(), false);
  assert.equal(h.timers.size, 0);
});

test('only the active mobile media stage can hide navigation, and unrelated events cannot restore it early', () => {
  const h = harness(), page = new ScrollTarget();
  h.render();
  for (const target of [null, {}, new ScrollTarget({ stage: false }), new ScrollTarget({ mobile: false }), new ScrollTarget({ outgoing: true })]) {
    h.emit('scroll', target);
    assert.equal(h.render(), false, 'Other screens, rails and hidden layers must not change the dock');
  }
  h.emit('scroll', page);
  h.emit('scrollend', new ScrollTarget({ stage: false }));
  assert.equal(h.render(), true);
  h.emit('scrollend', page);
  assert.equal(h.render(), true, 'Discrete scrollend events must not flicker the dock between gestures');
  h.advance(200);
  assert.equal(h.render(), false);
  assert.equal(h.timers.size, 0);
});

test('navigation and route changes restore the dock and remove stale listeners and timers', () => {
  const h = harness(), page = new ScrollTarget();
  h.render(); h.emit('scroll', page);
  assert.equal(h.render(true, '/profile'), false);
  assert.equal(h.timers.size, 0);
  h.emit('scroll', page);
  assert.equal(h.render(false, '/profile'), false);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.render(true, '/project/b'), false);
  h.emit('scroll', page);
  h.unmount();
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
});

test('keyboard-focused navigation stays available and focus restores an idle-pending dock', () => {
  const h = harness(), page = new ScrollTarget();
  h.render(); h.focus(true); h.emit('scroll', page);
  assert.equal(h.render(), false);
  h.focus(false); h.emit('scroll', page);
  assert.equal(h.render(), true);
  h.focus(true);
  assert.equal(h.render(), false);
  assert.equal(h.timers.size, 0);
});
