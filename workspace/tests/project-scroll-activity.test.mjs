import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class Target {
  constructor({ stage = true, mobile = true, outgoing = false, control = false, inert = false } = {}) {
    Object.assign(this, { stage, mobile, outgoing, control, inert }); this.attributes = new Map();
  }
  closest(selector) {
    const matches = selector === '[data-project-stage]' ? this.stage
      : selector === '[data-mobile-project-view]' ? this.mobile : this.outgoing || this.control;
    return matches ? this : null;
  }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
}
function harness() {
  let effect, cleanup, deps, observer, focused = false, modal = false;
  const listeners = new Map(), controls = [new Target({ control: true }), new Target({ control: true, inert: true })];
  const videos = [{ controls: true, currentTime: 32, paused: false }];
  const frame = new Target();
  frame.contains = target => target instanceof Target && target.mobile;
  frame.querySelector = selector => selector.includes('aria-modal') ? modal : focused;
  frame.querySelectorAll = selector => selector.endsWith(' video') ? videos : controls;
  const navigation = { current: { closest: () => frame } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/useProjectScrollActivity.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Element: Target,
    document: {
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type, fn) { assert.equal(listeners.get(type), fn); listeners.delete(type); },
    },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() { observer = undefined; } },
    require: () => ({ useEffect(fn, next) { if (!deps || next.some((v, i) => v !== deps[i])) { effect = fn; deps = next; } } }),
  });
  return {
    controls, videos, frame, listeners,
    get hidden() { return frame.attributes.has('data-project-reading'); },
    render(enabled = true, path = '/project/a') {
      exports.useProjectScrollActivity(enabled, path, navigation);
      if (effect) { cleanup?.(); cleanup = effect(); effect = undefined; }
    },
    emit(type, target = new Target(), extra = {}) {
      const event = { target, isPrimary: true, button: 0, pointerId: 1, clientX: 100, clientY: 200, timeStamp: 100,
        deltaY: 40, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
      listeners.get(type)?.(event); return event;
    },
    refreshDom() { observer?.(); }, focus(value) { focused = value; }, modal(value) { modal = value; },
    unmount() { cleanup?.(); },
  };
}
const hide = h => { h.emit('wheel'); h.emit('scroll'); assert.equal(h.hidden, true); };

test('decorative PDF canvases inside a visible labelled page still start content scrolling', () => {
  const h = harness(), stage = new Target(); h.render();
  const canvas = new Target();
  canvas.closest = selector => selector === '[data-project-stage]' ? stage : selector.includes('aria-hidden') ? canvas : null;
  h.emit('wheel', canvas); h.emit('scroll', stage);
  assert.equal(h.hidden, true); h.unmount();
});

test('actual content scrolling hides all controls and stays hidden through idle until a completed tap', () => {
  const h = harness(); h.render();
  h.emit('scroll'); assert.equal(h.hidden, false, 'Restored scroll on entry is not a user gesture');
  hide(h);
  assert.ok(h.controls.every(c => c.inert));
  h.emit('scrollend'); h.emit('pointermove'); assert.equal(h.hidden, true);
  h.emit('pointerdown'); assert.equal(h.hidden, true, 'Starting another touch cannot flash controls');
  const release = h.emit('pointerup', undefined, { timeStamp: 180 });
  assert.equal(h.hidden, false); assert.equal(release.prevented, true);
  assert.equal(h.controls[0].inert, false); assert.equal(h.controls[1].inert, true);
  const click = h.emit('click'); assert.equal(click.prevented, true); assert.equal(click.stopped, true);
  assert.equal(h.emit('click').prevented, false);
  h.emit('scroll'); assert.equal(h.hidden, false, 'Residual momentum after tapping cannot hide controls again');
  h.unmount();
});

test('pan movement, cancellation, multi-touch and long holds do not reveal controls', () => {
  const h = harness(); h.render(); hide(h);
  h.emit('pointerdown'); h.emit('pointermove', undefined, { clientY: 220 }); h.emit('pointerup'); assert.equal(h.hidden, true);
  h.emit('pointerdown'); h.emit('pointercancel'); h.emit('pointerup'); assert.equal(h.hidden, true);
  h.emit('pointerdown'); h.emit('pointerdown', undefined, { isPrimary: false, pointerId: 2 }); h.emit('pointerup'); assert.equal(h.hidden, true);
  h.emit('pointerdown'); h.emit('pointerup', undefined, { timeStamp: 800 }); assert.equal(h.hidden, true);
  h.unmount();
});

test('touch panning arms hiding, but unrelated rails, pages, dialogs and pinch do not', () => {
  const h = harness(); h.render();
  for (const target of [new Target({ stage: false }), new Target({ mobile: false }), new Target({ outgoing: true }), new Target({ control: true })]) {
    h.emit('wheel', target); h.emit('scroll', target); assert.equal(h.hidden, false);
  }
  h.emit('pointerdown'); h.emit('pointerdown', undefined, { isPrimary: false, pointerId: 2 }); h.emit('pointercancel'); h.emit('scroll');
  assert.equal(h.hidden, false);
  h.modal(true); h.emit('wheel'); h.emit('scroll'); assert.equal(h.hidden, false); h.modal(false);
  h.emit('pointerdown'); h.emit('pointermove', undefined, { clientY: 215 }); h.emit('pointercancel'); h.emit('scroll');
  assert.equal(h.hidden, true); h.unmount();
});

test('media keeps its playback and controls are restored; controls mounted while hidden follow the same state', () => {
  const h = harness(); h.render(); hide(h);
  assert.equal(h.videos[0].controls, false); assert.equal(h.videos[0].currentTime, 32); assert.equal(h.videos[0].paused, false);
  const later = new Target({ control: true }); h.controls.push(later); h.refreshDom(); assert.equal(later.inert, true);
  h.emit('keydown', undefined, { key: 'Escape' });
  assert.equal(h.hidden, false); assert.equal(h.videos[0].controls, true); assert.equal(later.inert, false);
  h.unmount(); assert.equal(later.attributes.size, 0);
});

test('navigation, desktop switch, keyboard and modal opening safely restore controls', () => {
  const h = harness(); h.render(); h.focus(true); h.emit('wheel'); h.emit('scroll'); assert.equal(h.hidden, false);
  h.focus(false); hide(h); h.emit('keydown', undefined, { key: 'Tab' }); assert.equal(h.hidden, false);
  hide(h); h.modal(true); h.refreshDom(); assert.equal(h.hidden, false); h.modal(false);
  hide(h); h.render(true, '/project/b'); assert.equal(h.hidden, false); h.emit('scroll'); assert.equal(h.hidden, false);
  hide(h); h.render(false, '/profile'); assert.equal(h.hidden, false); assert.equal(h.listeners.size, 0);
  h.render(); hide(h); h.unmount(); assert.equal(h.listeners.size, 0); assert.equal(h.hidden, false);
});
