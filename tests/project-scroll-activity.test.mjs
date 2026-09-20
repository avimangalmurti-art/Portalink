import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class Target {
  constructor({ stage = true, mobile = true, outgoing = false, control = false, inert = false, interactive = false } = {}) {
    Object.assign(this, { stage, mobile, outgoing, control, inert, interactive, isConnected: true }); this.attributes = new Map();
  }
  closest(selector) {
    const matches = selector === '[data-project-stage]' ? this.stage
      : selector === '[data-mobile-project-view]' ? this.mobile
      : selector.startsWith('audio,') ? this.interactive
      : selector === 'video' ? this.video
      : selector === '[role="button"], [data-focused-page-scroll]' ? false : this.outgoing || this.control;
    return matches ? this : null;
  }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
}
function harness() {
  let effect, cleanup, deps, observer, focused = false, modal = false;
  let now = 0, timerId = 0;
  const timers = new Map(), controlQueries = [];
  const listeners = new Map(), controls = [new Target({ control: true }), new Target({ control: true, inert: true })];
  const videos = [{ controls: true, currentTime: 32, paused: false }];
  const frame = new Target();
  frame.contains = target => target instanceof Target && target.mobile;
  frame.querySelector = selector => selector.includes('aria-modal') ? modal : focused;
  frame.querySelectorAll = selector => { controlQueries.push(selector); return selector.endsWith(' video') ? videos : controls; };
  const navigation = { current: { closest: () => frame } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/useProjectScrollActivity.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Element: Target,
    window: {
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type, fn) { assert.equal(listeners.get(type), fn); listeners.delete(type); },
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, due: now + delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    document: {
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type, fn) { assert.equal(listeners.get(type), fn); listeners.delete(type); },
    },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() { observer = undefined; } },
    require: () => ({ useEffect(fn, next) { if (!deps || next.some((v, i) => v !== deps[i])) { effect = fn; deps = next; } } }),
  });
  return {
    controls, videos, frame, listeners, controlQueries,
    get timers() { return timers.size; },
    get hidden() { return frame.attributes.has('data-project-reading'); },
    render(enabled = true, path = '/project/a') {
      exports.useProjectScrollActivity(enabled, path, navigation);
      if (effect) { cleanup?.(); cleanup = effect(); effect = undefined; }
    },
    emit(type, target = new Target(), extra = {}) {
      const event = { target, isPrimary: true, button: 0, pointerId: 1, clientX: 100, clientY: 200, timeStamp: now,
        deltaY: 40, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
      listeners.get(type)?.(event); return event;
    },
    refreshDom() { observer?.(); }, focus(value) { focused = value; }, modal(value) { modal = value; },
    tick(duration) {
      const end = now + duration;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        const [id, timer] = next; now = timer.due; timers.delete(id); timer.fn();
      }
      now = end;
    },
    unmount() { cleanup?.(); cleanup = undefined; },
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

test('real scrolling hides all controls and restores after momentum ends or the idle fallback', () => {
  const h = harness(); h.render();
  h.emit('scroll'); assert.equal(h.hidden, false, 'Restored scroll on entry is not a user gesture');
  hide(h);
  assert.ok(h.controls.every(c => c.inert));
  h.emit('pointermove'); h.tick(200); assert.equal(h.hidden, true);
  h.emit('scroll'); h.tick(249); assert.equal(h.hidden, true, 'Each momentum frame restarts the idle fallback');
  h.tick(1); assert.equal(h.hidden, false);
  assert.equal(h.controls[0].inert, false); assert.equal(h.controls[1].inert, true);
  h.emit('scroll'); assert.equal(h.hidden, false, 'Programmatic scroll after completion is not a new gesture');
  hide(h); h.emit('scrollend', new Target({ stage: false })); assert.equal(h.hidden, true);
  h.emit('scrollend'); assert.equal(h.hidden, false); assert.equal(h.timers, 0);
  h.unmount();
});

test('single artwork taps toggle controls after the page double-tap window, without changing content', () => {
  const h = harness(), artwork = new Target(); h.render();
  h.emit('pointerdown', artwork);
  const release = h.emit('pointerup', artwork);
  assert.equal(release.prevented, false); assert.equal(release.stopped, false, 'Page gesture handlers still receive their events');
  h.tick(320); assert.equal(h.hidden, false);
  h.tick(20); assert.equal(h.hidden, true);
  h.tick(1000); assert.equal(h.hidden, true, 'Explicit tap-to-hide has no automatic idle reveal');
  h.emit('pointerdown', artwork); assert.equal(h.hidden, true, 'Touching before movement must not flash controls');
  h.emit('pointerup', artwork); h.tick(340); assert.equal(h.hidden, false);
  h.emit('pointerdown', new Target({ stage: false })); h.emit('pointerup'); h.tick(340); assert.equal(h.hidden, false);
  h.emit('pointerdown', artwork); h.emit('pointerup', artwork); artwork.isConnected = false;
  h.tick(340); assert.equal(h.hidden, false, 'A removed page cannot toggle the next page');
  h.unmount();
});

test('a page double tap reaches both page handlers without toggling chrome, visible or hidden', () => {
  for (const initiallyHidden of [false, true]) {
    const h = harness(), artwork = new Target(); h.render();
    if (initiallyHidden) { h.emit('pointerdown', artwork); h.emit('pointerup', artwork); h.tick(340); }
    h.emit('pointerdown', artwork); const first = h.emit('pointerup', artwork); h.tick(180);
    h.emit('pointerdown', artwork); const second = h.emit('pointerup', artwork); h.tick(400);
    assert.equal(h.hidden, initiallyHidden);
    assert.equal(first.prevented || first.stopped || second.prevented || second.stopped, false);
    assert.equal(h.emit('click', artwork).prevented, false);
    h.unmount();
  }
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
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }]) {
    h.emit('wheel'); h.emit('wheel', undefined, modifiers); h.emit('scroll'); assert.equal(h.hidden, false);
  }
  h.modal(true); h.emit('wheel'); h.emit('scroll'); assert.equal(h.hidden, false); h.modal(false);
  h.emit('pointerdown'); h.emit('pointermove', undefined, { clientY: 215 }); h.emit('pointercancel'); h.emit('scroll');
  assert.equal(h.hidden, true); h.unmount();
});

test('native players, 3D controls, inputs and action buttons keep their taps; scrolling still preserves playback', () => {
  const h = harness(); h.render();
  for (const target of [new Target({ interactive: true }), new Target({ control: true }), new Target({ mobile: false })]) {
    h.emit('pointerdown', target); const release = h.emit('pointerup', target); h.tick(500);
    assert.equal(h.hidden, false); assert.equal(release.prevented || release.stopped, false);
  }
  hide(h); assert.equal(h.videos[0].controls, false);
  h.tick(250); assert.equal(h.videos[0].controls, true);
  assert.equal(h.videos[0].paused, false); assert.equal(h.videos[0].currentTime, 32);
  assert.ok(h.controlQueries.every(selector => !selector.includes('[data-mobile-project-page-count]')));
  assert.ok(h.controlQueries.some(selector => selector.includes('button:not([data-mobile-page-navigator] *)')),
    'the counter and thumbnail buttons must stay usable while other chrome hides');
  const video = Object.assign(new Target(), { video: true });
  h.emit('pointerdown', video); h.emit('pointerup', video); h.tick(340); assert.equal(h.hidden, false, 'Visible native video taps stay with the player');
  const artwork = new Target();
  h.emit('pointerdown', artwork); h.emit('pointerup', artwork); h.tick(340); assert.equal(h.hidden, true);
  h.emit('pointerdown', video); h.emit('pointerup', video); h.tick(340); assert.equal(h.hidden, false, 'A video with its controls hidden can reveal them');
  h.unmount();
});

test('the Three.js model canvas owns taps while decorative PDF canvases still toggle controls', () => {
  const h = harness(), model = new Target(), pdf = new Target(); h.render();
  const closest = model.closest.bind(model);
  model.closest = selector => selector.startsWith('audio,')
    ? (selector.split(',').map(part => part.trim()).includes('canvas[role="img"]') ? model : null)
    : closest(selector);
  h.emit('pointerdown', model); const release = h.emit('pointerup', model); h.tick(340);
  assert.equal(h.hidden, false);
  assert.equal(release.prevented || release.stopped, false, 'The model retains its own pointer handlers');
  h.emit('pointerdown', pdf); h.emit('pointerup', pdf); h.tick(340);
  assert.equal(h.hidden, true, 'PDF canvases without role=img remain artwork tap surfaces');
  h.emit('pointerdown', model); h.emit('pointerup', model); h.tick(340);
  assert.equal(h.hidden, true, 'Model interaction does not toggle already hidden chrome');
  h.unmount();
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
  assert.equal(h.timers, 0);
});

test('pending single taps are cancelled by scrolling, keyboard, modal opening and route cleanup', () => {
  for (const cancel of [h => { h.emit('wheel'); h.emit('scroll'); }, h => h.emit('keydown', undefined, { key: 'Tab' }),
    h => { h.modal(true); h.refreshDom(); }, h => h.render(true, '/project/other'), h => h.unmount()]) {
    const h = harness(), artwork = new Target(); h.render();
    h.emit('pointerdown', artwork); h.emit('pointerup', artwork); cancel(h); h.tick(1000);
    assert.equal(h.hidden, false); assert.equal(h.timers, 0); h.unmount();
  }
});
