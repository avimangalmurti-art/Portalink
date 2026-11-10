import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class Target {
  constructor({ stage = true, mobile = true, outgoing = false, control = false, inert = false, interactive = false } = {}) {
    Object.assign(this, { stage, mobile, outgoing, control, inert, interactive, isConnected: true }); this.attributes = new Map();
    this.scrollTop = this.scrollLeft = 0; this.scrollHeight = 2000; this.clientHeight = 600; this.scrollWidth = this.clientWidth = 390;
  }
  closest(selector) {
    const matches = selector === '[data-project-stage]' ? this.stage
      : selector === '[data-mobile-project-view]' ? this.mobile
      : selector.startsWith('audio,') ? this.interactive
      : selector === 'video' ? this.video
      : selector === '[data-mobile-project-page-count]' ? false
      : selector === '[role="button"], [data-focused-page-scroll]' ? false : this.outgoing || this.control;
    return matches ? this : null;
  }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  matches() { return false; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
}
function harness(nativeScrollEnd = false) {
  let effect, cleanup, deps, observer, focused = false, modal = false, overview = false;
  let now = 0, timerId = 0;
  const timers = new Map(), controlQueries = [];
  const listeners = new Map(), listenerOptions = new Map(), controls = [new Target({ control: true }), new Target({ control: true, inert: true })];
  const videos = [Object.assign(new Target(), { controls: true, currentTime: 32, paused: false })];
  const frame = new Target();
  frame.contains = target => target instanceof Target && target.mobile;
  frame.querySelector = selector => {
    if (selector.includes('aria-modal')) return modal;
    if (selector.startsWith('[data-mobile-page-reader]')) return overview;
    if (!selector.includes(':focus-visible')) return false;
    if (focused instanceof Target && focused.kind === 'back') return selector.includes('.mobile-project-back:focus-visible') ? focused : null;
    return focused;
  };
  frame.querySelectorAll = selector => { controlQueries.push(selector); return selector.endsWith(' video') ? videos : controls; };
  const navigation = { current: { closest: () => frame } };
  const surface = new Target();
  const document = {
    scrollingElement: new Target(),
    addEventListener(type, fn, options) { listeners.set(type, fn); listenerOptions.set(type, options); },
    removeEventListener(type, fn) { assert.equal(listeners.get(type), fn); listeners.delete(type); },
  };
  if (nativeScrollEnd) { surface.onscrollend = null; document.onscrollend = null; }
  const settling = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/navigationScrollSettling.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: settling });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/mobile/useProjectScrollActivity.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Element: Target, HTMLElement: Target, performance: { now: () => now },
    window: {
      addEventListener(type, fn, options) { listeners.set(type, fn); listenerOptions.set(type, options); },
      removeEventListener(type, fn) { assert.equal(listeners.get(type), fn); listeners.delete(type); },
      setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, due: now + delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    document,
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() { observer = undefined; } },
    require: name => name === './navigationScrollSettling' ? settling : { useEffect(fn, next) { if (!deps || next.some((v, i) => v !== deps[i])) { effect = fn; deps = next; } } },
  });
  return {
    controls, videos, frame, surface, document, listeners, listenerOptions, controlQueries,
    get timers() { return timers.size; },
    get hidden() { return frame.attributes.has('data-project-reading'); },
    get scrolling() { return frame.attributes.has('data-project-scrolling'); },
    render(enabled = true, path = '/project/a') {
      exports.useProjectScrollActivity(enabled, path, navigation);
      if (effect) { cleanup?.(); cleanup = effect(); effect = undefined; }
    },
    emit(type, target = surface, extra = {}) {
      const event = { target, isPrimary: true, button: 0, pointerId: 1, clientX: 100, clientY: 200, timeStamp: now,
        deltaY: 40, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
      listeners.get(type)?.(event); return event;
    },
    refreshDom() { observer?.(); }, focus(value) { focused = value; }, modal(value) { modal = value; }, overview(value) { overview = value; },
    scroll(target, top, elapsed = 16, left = 0) { this.tick(elapsed); const owner = target === document ? document.scrollingElement : target; owner.scrollTop = top; owner.scrollLeft = left; this.emit('scroll', target); },
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
const readerControls = (h, { inertBack = false, inertHeader = false } = {}) => {
  const back = new Target({ control: true, inert: inertBack });
  const header = new Target({ control: true, inert: inertHeader });
  back.kind = 'back';
  back.matches = selector => selector === '.mobile-project-back:not(.mobile-project-portal-preview)';
  header.matches = selector => selector === '[data-document-reader-header]';
  h.controls.push(back, header);
  return { back, header };
};
const pageCounter = () => {
  const counter = new Target({ control: true }), closest = counter.closest.bind(counter);
  counter.closest = selector => selector === '[data-mobile-project-page-count]' ? counter : closest(selector);
  counter.matches = selector => selector === ':focus-visible' && Boolean(counter.keyboardFocus);
  return counter;
};

test('scrolling disables Back and keeps the counter header usable until the momentum settles', () => {
  const h = harness(), { back, header } = readerControls(h);
  h.render();
  h.emit('scroll');
  assert.equal(h.scrolling, false, 'Restored or programmatic positions must retain resting controls');
  hide(h);
  assert.equal(h.scrolling, true);
  assert.equal(back.inert, true, 'A hidden Back cannot intercept a tap on the relocated counter');
  assert.equal(back.attributes.has('data-project-reading-control'), false);
  assert.equal(header.inert, false, 'The visible counter must not inherit inert from its header');
  assert.ok(h.controls.filter(control => control !== back && control !== header).every(control => control.inert));
  h.tick(50); h.emit('scroll'); h.tick(99);
  assert.equal(back.inert, true); assert.equal(header.inert, false); assert.equal(h.scrolling, true);
  h.tick(1);
  assert.equal(h.scrolling, false); assert.equal(h.hidden, false); assert.equal(back.inert, false); assert.equal(header.inert, false);
  h.emit('pointerdown'); h.emit('pointerup'); h.tick(340);
  assert.equal(h.hidden, true);
  assert.equal(h.scrolling, false, 'An artwork tap retains its distinct chrome state');
  assert.equal(back.inert, false);
  assert.equal(header.inert, true, 'An explicit tap still hides the complete header');
  assert.equal(back.attributes.has('data-project-reading-control'), false);
  h.unmount();
  assert.equal(back.inert, false); assert.equal(header.inert, false); assert.equal(h.scrolling, false);
});

test('starting a scroll from tap-hidden chrome enables only the counter header and restores on idle', () => {
  const h = harness(), { back, header } = readerControls(h), artwork = new Target();
  h.render(); h.emit('pointerdown', artwork); h.emit('pointerup', artwork);
  assert.equal(header.inert, true); assert.equal(back.inert, false); assert.equal(h.timers, 0);
  h.emit('pointerdown', artwork); h.emit('pointermove', artwork, { clientY: 225 }); h.emit('pointercancel', artwork);
  h.emit('scroll', artwork);
  assert.equal(h.scrolling, true); assert.equal(back.inert, true); assert.equal(header.inert, false);
  assert.equal(h.controls[0].inert, true, 'The counter exception cannot reveal unrelated chrome');
  h.tick(100);
  assert.equal(h.scrolling, false); assert.equal(h.hidden, false); assert.equal(back.inert, false); assert.equal(header.inert, false);
  h.unmount();
});

test('reader controls mounted during a scroll follow its state without overriding an existing inert value', () => {
  const h = harness(); h.render(); hide(h);
  const { back, header } = readerControls(h);
  const disabled = readerControls(h, { inertBack: true, inertHeader: true });
  h.refreshDom();
  assert.equal(back.inert, true); assert.equal(header.inert, false);
  assert.equal(disabled.back.inert, true); assert.equal(disabled.header.inert, true);
  h.tick(100);
  assert.equal(back.inert, false); assert.equal(header.inert, false);
  assert.equal(disabled.back.inert, true); assert.equal(disabled.header.inert, true);
  hide(h); h.unmount();
  assert.equal(h.hidden, false); assert.equal(h.scrolling, false); assert.equal(h.timers, 0);
  assert.equal(back.inert, false); assert.equal(header.inert, false);
  assert.equal(disabled.back.inert, true); assert.equal(disabled.header.inert, true);
});

test('pointer focus keeps the scrolling counter in place through activation while keyboard focus restores chrome', () => {
  const h = harness(), { back, header } = readerControls(h), counter = pageCounter();
  h.render(); hide(h); h.tick(50);
  const down = h.emit('pointerdown', counter); h.emit('focusin', counter); const up = h.emit('pointerup', counter);
  assert.equal(down.prevented || down.stopped || up.prevented || up.stopped, false, 'Counter activation keeps its normal events');
  assert.equal(h.scrolling, true, 'Pointer focus cannot move the counter away between down and click');
  assert.equal(back.inert, true); assert.equal(header.inert, false);
  assert.equal(h.timers, 1, 'Release starts a fresh quiet-reading interval');
  h.tick(99); assert.equal(h.scrolling, true);
  h.tick(1); assert.equal(h.scrolling, false); assert.equal(back.inert, false);
  hide(h); counter.keyboardFocus = true; h.emit('focusin', counter);
  assert.equal(h.scrolling, false); assert.equal(h.hidden, false); assert.equal(back.inert, false);
  assert.equal(h.timers, 0);
  h.emit('pointerdown'); h.emit('pointerup'); assert.equal(h.hidden, true);
  counter.keyboardFocus = false; h.emit('focusin', counter);
  assert.equal(h.hidden, false, 'Pointer focus during ordinary tap-hidden chrome still reveals the counter');
  hide(h); h.emit('focusin', new Target({ control: true }));
  assert.equal(h.hidden, false, 'The pointer-focus exception belongs only to the counter');
  h.unmount();
});

test('counter click restores controls before the page-preview callback without consuming activation', () => {
  const h = harness(), { back, header } = readerControls(h), counter = pageCounter();
  h.render(); hide(h); h.tick(50);
  h.emit('pointerdown', counter); h.emit('focusin', counter);
  assert.equal(h.scrolling, true); assert.equal(h.timers, 0, 'Pointer focus cannot return the counter before click resolves its target');
  h.emit('pointerup', counter);
  assert.equal(h.scrolling, true); assert.equal(h.timers, 1);
  assert.equal(h.listenerOptions.get('click'), true, 'The restoration must run in capture before React opens and focuses previews');
  const click = h.emit('click', counter);
  let opened = 0;
  const openPreviews = event => {
    assert.equal(event.target, counter, 'The resolved click retains the counter as its target');
    assert.equal(h.hidden, false); assert.equal(h.scrolling, false);
    assert.equal(back.inert, false); assert.equal(header.inert, false);
    assert.equal(h.timers, 0, 'Preview focus cannot race an old idle deadline');
    opened++;
  };
  assert.equal(click.prevented || click.stopped, false);
  openPreviews(click);
  assert.equal(opened, 1); h.tick(1000); assert.equal(h.hidden, false);
  for (const target of [new Target(), new Target({ control: true }), Object.assign(pageCounter(), { mobile: false })]) {
    hide(h); h.emit('click', target);
    assert.equal(h.scrolling, true, 'Only an in-frame counter activation restores scrolling chrome');
    h.tick(100);
  }
  h.emit('pointerdown'); h.emit('pointerup'); assert.equal(h.hidden, true);
  h.emit('click', counter); assert.equal(h.hidden, true, 'A click alone cannot change ordinary tap-hidden chrome');
  h.unmount();
});

test('a late counter press holds its position past idle until its own release or cancellation', () => {
  for (const release of ['pointerup', 'pointercancel']) {
    const h = harness(), { back, header } = readerControls(h), counter = pageCounter();
    h.render(); hide(h); h.tick(90);
    h.emit('pointerdown', counter, { pointerId: 7 }); h.emit('focusin', counter);
    assert.equal(h.timers, 0, 'A held press suspends the nearly expired idle deadline');
    h.tick(1400);
    assert.equal(h.scrolling, true); assert.equal(back.inert, true); assert.equal(header.inert, false);
    h.emit('pointerup', counter, { pointerId: 9 });
    h.tick(1000);
    assert.equal(h.timers, 0); assert.equal(h.scrolling, true, 'An unrelated pointer cannot release the counter');
    const event = h.emit(release, counter, { pointerId: 7 });
    assert.equal(event.prevented || event.stopped, false);
    assert.equal(h.timers, 1);
    h.tick(99); assert.equal(h.scrolling, true);
    h.tick(1); assert.equal(h.scrolling, false); assert.equal(back.inert, false); assert.equal(header.inert, false);
    h.unmount();
  }
});

test('restoring or leaving the reader clears a held counter press and late release cannot restart idle', () => {
  for (const restore of [h => h.emit('keydown', undefined, { key: 'Escape' }),
    h => { h.modal(true); h.refreshDom(); }, h => h.render(true, '/project/another'), h => h.unmount()]) {
    const h = harness(), { back } = readerControls(h), counter = pageCounter();
    h.render(); hide(h); h.tick(90); h.emit('pointerdown', counter); h.tick(1000);
    assert.equal(h.scrolling, true); assert.equal(h.timers, 0);
    restore(h);
    assert.equal(h.scrolling, false); assert.equal(back.inert, false);
    h.emit('pointerup', counter); h.tick(1000);
    assert.equal(h.scrolling, false); assert.equal(h.timers, 0);
    h.unmount();
  }
});

test('a keyboard-focused Back stays visible and usable when content starts scrolling', () => {
  const h = harness(), { back, header } = readerControls(h);
  h.render(); h.focus(back); h.emit('wheel'); h.emit('scroll');
  assert.equal(h.hidden, false); assert.equal(h.scrolling, false);
  assert.equal(back.inert, false); assert.equal(header.inert, false);
  h.focus(false); hide(h); assert.equal(back.inert, true);
  h.unmount(); assert.equal(back.inert, false);
});

test('decorative PDF canvases inside a visible labelled page still start content scrolling', () => {
  const h = harness(), stage = new Target(); h.render();
  const canvas = new Target();
  canvas.closest = selector => selector === '[data-project-stage]' ? stage : selector.includes('aria-hidden') ? canvas : null;
  h.emit('wheel', canvas); h.emit('scroll', stage);
  assert.equal(h.hidden, true); h.unmount();
});

test('scroll momentum uses the same 100ms fallback as the platform navigation', () => {
  const h = harness(); h.render();
  h.emit('scroll'); assert.equal(h.hidden, false, 'Restored scroll on entry is not a user gesture');
  hide(h);
  assert.ok(h.controls.every(c => c.inert));
  h.emit('pointermove'); h.tick(50); assert.equal(h.hidden, true);
  h.emit('scroll'); h.tick(99); assert.equal(h.hidden, true, 'Each momentum frame restarts the quiet pause');
  h.tick(1); assert.equal(h.hidden, false);
  assert.equal(h.controls[0].inert, false); assert.equal(h.controls[1].inert, true);
  h.emit('scroll'); assert.equal(h.hidden, false, 'Programmatic scroll after completion is not a new gesture');
  hide(h); h.emit('scrollend', new Target({ stage: false })); assert.equal(h.hidden, true);
  h.emit('scrollend'); assert.equal(h.hidden, false, 'A matching native end returns controls immediately');
  assert.equal(h.timers, 0);
  h.unmount();
});

test('native scrollend returns document and nested reader controls immediately and ignores other owners', () => {
  for (const documentOverview of [false, true]) {
    const h = harness(true), { back, header } = readerControls(h);
    const owner = documentOverview ? h.document : h.surface;
    h.overview(documentOverview); h.render();
    h.emit('wheel'); h.emit('scroll', owner);
    assert.equal(h.hidden, true); assert.equal(h.scrolling, true);
    assert.equal(h.timers, 0, 'Native scrollend owns completion, without a duplicate fallback timer');
    h.tick(1000); assert.equal(h.hidden, true, 'A paused native gesture waits for its actual end');
    h.emit('scrollend', new Target()); assert.equal(h.hidden, true);
    h.emit('scrollend', owner);
    assert.equal(h.hidden, false); assert.equal(h.scrolling, false);
    assert.equal(back.inert, false); assert.equal(header.inert, false); assert.equal(h.timers, 0);
    h.emit('scroll', owner); assert.equal(h.hidden, false, 'Restored positions without new intent stay visible');
    h.unmount(); assert.equal(h.listeners.size, 0);
  }
});

test('reader controls return during the same slow tail as the dock and stay visible until movement accelerates', () => {
  for (const nativeScrollEnd of [false, true]) {
    const h = harness(nativeScrollEnd), owner = h.surface, { back } = readerControls(h); h.render();
    h.emit('wheel', owner); h.scroll(owner, 0, 0); h.scroll(owner, 16);
    assert.equal(h.hidden, true); assert.equal(back.inert, true);
    for (const top of [18, 20]) { h.emit('wheel', owner); h.scroll(owner, top); assert.equal(h.hidden, true, 'Fewer than 48ms of slowing does not reveal'); }
    h.emit('wheel', owner); h.scroll(owner, 22);
    assert.equal(h.hidden, false); assert.equal(h.scrolling, false); assert.equal(back.inert, false);
    for (const top of [24, 26, 28, 32]) { h.emit('wheel', owner); h.scroll(owner, top); assert.equal(h.hidden, false, 'Low-speed events retain the returned controls'); }
    h.emit('wheel', owner); h.scroll(owner, 48);
    assert.equal(h.hidden, true, 'Fresh fast movement hides again without requiring a new route or gesture');
    for (const top of [50, 52]) { h.scroll(owner, top); assert.equal(h.hidden, true); }
    h.scroll(owner, 54); assert.equal(h.hidden, false);
    h.emit('scrollend', owner); assert.equal(h.timers, 0); h.unmount();
  }
});

test('an artwork tap after slow-tail return owns its hidden state despite the previous native scrollend', () => {
  const h = harness(true), owner = h.surface, artwork = new Target(); h.render();
  h.emit('wheel', owner); h.scroll(owner, 0, 0); h.scroll(owner, 16);
  for (const top of [18, 20, 22]) h.scroll(owner, top);
  assert.equal(h.hidden, false, 'Slow movement has already returned the controls before native completion');
  h.emit('pointerdown', artwork); const release = h.emit('pointerup', artwork);
  assert.equal(release.prevented || release.stopped, false);
  assert.equal(h.hidden, true); assert.equal(h.scrolling, false); assert.equal(h.timers, 0);
  h.emit('scrollend', owner);
  h.tick(340);
  assert.equal(h.hidden, true, 'The old scroll owner cannot undo an explicit artwork tap');
  assert.equal(h.scrolling, false); assert.equal(h.timers, 0);
  h.emit('pointerdown', artwork); h.emit('pointerup', artwork);
  assert.equal(h.hidden, false, 'The next independent artwork tap still reveals the controls');
  h.unmount();
});

test('reader sampling rejects stationary events, resets for another owner and uses document horizontal displacement', () => {
  const h = harness(true), first = h.surface, second = Object.assign(new Target(), { onscrollend: null }); h.render();
  h.emit('wheel', first); h.scroll(first, 0, 0); h.scroll(first, 16); h.scroll(first, 18);
  h.scroll(first, 18, 48); assert.equal(h.hidden, true, 'Stationary timestamps cannot count as a slowing tail');
  h.scroll(second, 70);
  for (const top of [72, 74, 76, 78]) { h.scroll(second, top); assert.equal(h.hidden, true, 'A new owner cannot inherit fast samples'); }
  h.scroll(second, 110); h.scroll(second, 112); h.scroll(second, 114); h.scroll(second, 116);
  assert.equal(h.hidden, false); h.emit('scrollend', second);
  h.overview(true); h.document.scrollingElement.scrollWidth = 2000;
  h.emit('wheel', first, { deltaX: 20, deltaY: 0 }); h.scroll(h.document, 0, 0, 0); h.scroll(h.document, 0, 16, 16);
  for (const left of [18, 20]) { h.scroll(h.document, 0, 16, left); assert.equal(h.hidden, true); }
  h.scroll(h.document, 0, 16, 22); assert.equal(h.hidden, false);
  h.emit('scrollend', h.document); assert.equal(h.timers, 0); h.unmount();
});

test('a held scrolling counter stays under the finger through native completion and deceleration', () => {
  const h = harness(true), owner = h.surface, { back, header } = readerControls(h), counter = pageCounter(); h.render();
  h.emit('wheel', owner); h.scroll(owner, 0, 0); h.scroll(owner, 16);
  h.emit('pointerdown', counter); h.emit('focusin', counter);
  for (const top of [18, 20, 22, 24]) h.scroll(owner, top);
  h.emit('scrollend', owner); h.tick(1000);
  assert.equal(h.scrolling, true); assert.equal(back.inert, true); assert.equal(header.inert, false); assert.equal(h.timers, 0);
  h.emit('pointerup', counter);
  assert.equal(h.scrolling, true, 'Release cannot relocate the counter before its click resolves');
  assert.equal(h.timers, 1, 'A released counter has a bounded fallback if native completion was consumed while held');
  h.emit('scrollend', owner);
  assert.equal(h.scrolling, true, 'A late native end between release and click cannot relocate the resolved click target');
  assert.equal(back.inert, true); assert.equal(header.inert, false); assert.equal(h.timers, 1);
  h.tick(99); assert.equal(h.scrolling, true);
  const click = h.emit('click', counter);
  assert.equal(click.prevented || click.stopped, false);
  assert.equal(h.hidden, false); assert.equal(h.scrolling, false); assert.equal(back.inert, false);
  assert.equal(h.timers, 0); h.unmount();
});

test('a released counter without a click returns after its bounded fallback despite late native completion', () => {
  const h = harness(true), owner = h.surface, { back, header } = readerControls(h), counter = pageCounter(); h.render();
  h.emit('wheel', owner); h.emit('scroll', owner);
  h.emit('pointerdown', counter); h.emit('focusin', counter); h.emit('pointerup', counter);
  h.emit('scrollend', owner);
  assert.equal(h.scrolling, true); assert.equal(h.timers, 1);
  h.tick(99); assert.equal(h.scrolling, true); assert.equal(back.inert, true); assert.equal(header.inert, false);
  h.tick(1);
  assert.equal(h.hidden, false); assert.equal(h.scrolling, false);
  assert.equal(back.inert, false); assert.equal(header.inert, false); assert.equal(h.timers, 0);
  h.unmount();
});

test('route, desktop and unmount cleanup clear a native reader deceleration cycle', () => {
  for (const finish of [h => h.render(true, '/project/other'), h => h.render(false), h => h.unmount()]) {
    const h = harness(true), owner = h.surface; h.render();
    h.emit('wheel', owner); h.scroll(owner, 0, 0); h.scroll(owner, 16); h.scroll(owner, 18);
    assert.equal(h.hidden, true); finish(h);
    assert.equal(h.hidden, false); assert.equal(h.scrolling, false); assert.equal(h.timers, 0);
    h.tick(1000); assert.equal(h.hidden, false);
    if (h.listeners.size) h.unmount();
  }
});

test('single artwork taps toggle controls immediately without a timer or changing content', () => {
  const h = harness(), artwork = new Target(); h.render();
  h.emit('pointerdown', artwork);
  const release = h.emit('pointerup', artwork);
  assert.equal(release.prevented, false); assert.equal(release.stopped, false, 'Page gesture handlers still receive their events');
  assert.equal(h.hidden, true, 'The first pointer-up hides controls before any clock advance');
  assert.equal(h.timers, 0);
  h.tick(340); assert.equal(h.hidden, true);
  h.tick(1000); assert.equal(h.hidden, true, 'Explicit tap-to-hide has no automatic idle reveal');
  h.emit('pointerdown', artwork); assert.equal(h.hidden, true, 'Touching before movement must not flash controls');
  h.emit('pointerup', artwork); assert.equal(h.hidden, false, 'A reveal tap is immediate too');
  assert.equal(h.timers, 0);
  h.emit('pointerdown', new Target({ stage: false })); h.emit('pointerup'); h.tick(340); assert.equal(h.hidden, false);
  h.emit('pointerdown', artwork); artwork.isConnected = false; h.emit('pointerup', artwork);
  assert.equal(h.hidden, false, 'A page removed during the gesture cannot toggle the next page');
  h.unmount();
});

test('a page double tap restores its original chrome state and reaches both page handlers', () => {
  for (const initiallyHidden of [false, true]) {
    const h = harness(), artwork = new Target(); h.render();
    if (initiallyHidden) { h.emit('pointerdown', artwork); h.emit('pointerup', artwork); h.tick(340); }
    h.emit('pointerdown', artwork); const first = h.emit('pointerup', artwork); h.tick(180);
    assert.equal(h.hidden, !initiallyHidden, 'The first tap takes effect immediately');
    h.emit('pointerdown', artwork); const second = h.emit('pointerup', artwork); h.tick(400);
    assert.equal(h.hidden, initiallyHidden);
    assert.equal(first.prevented || first.stopped || second.prevented || second.stopped, false);
    assert.equal(h.emit('click', artwork).prevented, false);
    h.unmount();
  }
});

test('double-tap rollback preserves the original scroll-idle deadline without delaying either tap', () => {
  const h = harness(), { back, header } = readerControls(h), artwork = new Target(); h.render(); hide(h); h.tick(20);
  h.emit('pointerdown', artwork); h.emit('pointerup', artwork);
  assert.equal(h.hidden, false); assert.equal(h.timers, 0, 'A single reveal cancels the scroll timer immediately');
  assert.equal(h.scrolling, false); assert.equal(back.inert, false); assert.equal(header.inert, false);
  h.tick(20); h.emit('pointerdown', artwork); h.emit('pointerup', artwork); assert.equal(h.hidden, true);
  assert.equal(h.scrolling, true, 'Double-tap rollback retains the scrolling layout, not the tap-hidden layout');
  assert.equal(back.inert, true); assert.equal(header.inert, false);
  h.tick(59); assert.equal(h.hidden, true);
  h.tick(1); assert.equal(h.hidden, false, 'The original 100ms deadline remains, rather than restarting after double tap');
  assert.equal(h.scrolling, false); assert.equal(back.inert, false); assert.equal(header.inert, false);
  assert.equal(h.timers, 0); h.unmount();
});

test('expired scroll deadlines and unrelated gestures cannot restore stale idle timers', () => {
  const expired = harness(), artwork = new Target(); expired.render(); hide(expired); expired.tick(50);
  expired.emit('pointerdown', artwork); expired.emit('pointerup', artwork); expired.tick(150);
  expired.emit('pointerdown', artwork); expired.emit('pointerup', artwork);
  assert.equal(expired.hidden, false); assert.equal(expired.timers, 0, 'An elapsed original deadline cannot hide chrome again');
  expired.unmount();
  for (const clear of [h => { h.emit('wheel', artwork); h.emit('scroll', artwork); },
    h => h.emit('keydown', artwork, { key: 'Tab' }), h => h.render(true, '/project/other')]) {
    const h = harness(); h.render(); hide(h); h.tick(20);
    h.emit('pointerdown', artwork); h.emit('pointerup', artwork); clear(h);
    h.emit('pointerdown', artwork); h.emit('pointerup', artwork);
    assert.equal(h.timers, 0); h.tick(1000); assert.equal(h.timers, 0); h.unmount();
  }
});

test('focus gained by a tapped page does not turn a reveal tap into another hide', () => {
  const h = harness(), artwork = new Target(); h.render(); hide(h);
  h.emit('pointerdown', artwork); h.emit('focusin', artwork);
  assert.equal(h.hidden, false);
  h.emit('pointerup', artwork); h.tick(340);
  assert.equal(h.hidden, false); h.unmount();
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
  h.tick(100); assert.equal(h.videos[0].controls, true);
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

test('scroll restoration respects the current requested video controls instead of a stale snapshot', () => {
  const h = harness(), video = h.videos[0];
  video.controls = false; video.setAttribute('data-video-controls-requested', 'false');
  h.render(); hide(h); h.tick(100);
  assert.equal(video.controls, false, 'Finishing a scroll must not reveal untouched playback controls');
  hide(h);
  video.setAttribute('data-video-controls-requested', 'true');
  h.tick(100);
  assert.equal(video.controls, true, 'A first tap during reading mode supersedes the captured false value');
  hide(h);
  video.setAttribute('data-video-controls-requested', 'false');
  h.emit('keydown', undefined, { key: 'Escape' });
  assert.equal(video.controls, false, 'A reset clip must not inherit the previous revealed state');
  assert.equal(video.currentTime, 32); assert.equal(video.paused, false);
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
  const h = harness(), { back, header } = readerControls(h);
  const restored = () => {
    assert.equal(h.hidden, false); assert.equal(h.scrolling, false);
    assert.equal(back.inert, false); assert.equal(header.inert, false);
    assert.equal(h.controls[1].inert, true, 'Pre-existing inert controls retain their own state');
    assert.equal(h.timers, 0);
  };
  h.render(); h.focus(true); h.emit('wheel'); h.emit('scroll'); restored();
  h.focus(false); hide(h); h.emit('keydown', undefined, { key: 'Tab' }); restored();
  hide(h); h.emit('focusin'); restored();
  hide(h); h.modal(true); h.refreshDom(); restored(); h.modal(false);
  hide(h); h.render(true, '/project/b'); restored(); h.emit('scroll'); restored();
  hide(h); h.render(false, '/profile'); restored(); assert.equal(h.listeners.size, 0);
  h.render(); hide(h); h.unmount(); assert.equal(h.listeners.size, 0); restored();
  assert.equal(h.timers, 0);
});

test('immediate taps leave no delayed change after scrolling, keyboard, modal opening or route cleanup', () => {
  for (const cancel of [h => { h.emit('wheel'); h.emit('scroll'); }, h => h.emit('keydown', undefined, { key: 'Tab' }),
    h => { h.modal(true); h.refreshDom(); }, h => h.render(true, '/project/other'), h => h.unmount()]) {
    const h = harness(), artwork = new Target(); h.render();
    h.emit('pointerdown', artwork); h.emit('pointerup', artwork); assert.equal(h.hidden, true);
    cancel(h); h.tick(1000);
    assert.equal(h.hidden, false); assert.equal(h.timers, 0); h.unmount();
  }
});

test('double-tap metadata expires and cancelled multi-touch cannot undo a later independent tap', () => {
  const h = harness(), artwork = new Target(); h.render();
  h.emit('pointerdown', artwork); h.emit('pointerup', artwork); assert.equal(h.hidden, true);
  h.tick(320); h.emit('pointerdown', artwork);
  // Focus can reveal controls between down/up. An expired pair must retain
  // this new tap's original reveal intent, never roll back the earlier tap.
  h.emit('focusin', artwork); h.emit('pointerup', artwork); assert.equal(h.hidden, false);
  h.emit('pointerdown', artwork); h.emit('pointerdown', artwork, { isPrimary: false, pointerId: 2 });
  h.emit('pointerup', artwork); assert.equal(h.hidden, false);
  h.emit('pointerdown', artwork); h.emit('pointerup', artwork); assert.equal(h.hidden, true);
  assert.equal(h.timers, 0); h.unmount();
});
