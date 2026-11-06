import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function harness(presentation = 'mobile') {
  const slots = [], effects = [], listeners = new Map(), calls = [];
  let cursor = 0, effectCursor = 0;
  class Element {
    constructor(values = {}) { Object.assign(this, { parentElement: null, clientWidth: 390, scrollWidth: 390, overflowX: 'visible' }, values); }
    closest(selector) {
      if (selector === 'video') return this.video ?? null;
      return this.control || this.focused && selector.includes('[data-mobile-focused-view]') || this.focusedScroll && selector.includes('[data-focused-page-scroll]') ? this : null;
    }
    contains(target) { return !target.outside; }
    addEventListener(name, callback, options) { listeners.set(name, { callback, options }); }
    removeEventListener(name, callback) { if (listeners.get(name)?.callback === callback) listeners.delete(name); }
  }
  const surface = new Element(), ref = { current: surface };
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useEffect(callback, deps) {
      const index = effectCursor++, previous = effects[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        previous?.cleanup?.(); effects[index] = { deps, cleanup: callback() };
      }
    },
  };
  function compile(file, require) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, require, Element, window: { innerWidth: 390 }, getComputedStyle: node => ({ overflowX: node.overflowX }) });
    return exports;
  }
  const navigation = compile('../src/presentation/mobile/useNavigationSwipe.ts', () => react);
  const hook = compile('../src/components/media/useProjectBackSwipe.ts', name => {
    if (name === 'react') return react;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/useNavigationSwipe')) return navigation;
    if (name.endsWith('/backNavigationTransition')) return { markMobileBackNavigation() {}, markMobileForwardNavigation() {} };
    assert.fail(name);
  });
  const back = () => calls.push('back');
  const render = (props = {}) => { cursor = 0; effectCursor = 0; return hook.useProjectBackSwipe(ref, { enabled: true, scope: 'project:page', onBack: back, ...props }); };
  const point = (x = 100, y = 200, identifier = 1) => ({ clientX: x, clientY: y, identifier });
  const event = (touches, values = {}) => ({ touches, changedTouches: [], timeStamp: 0, target: new Element({ parentElement: surface }), cancelable: true, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...values });
  const fire = (name, value) => { listeners.get(name)?.callback(value); return value; };
  const start = (values = {}) => fire('touchstart', event([point()], values));
  const move = (x, y = 200, values = {}) => fire('touchmove', event([point(x, y)], { timeStamp: 100, ...values }));
  const end = (x, y = 200, values = {}) => fire('touchend', event([], { changedTouches: [point(x, y)], timeStamp: 200, ...values }));
  return { render, calls, point, event, fire, start, move, end, listeners, Element, surface };
}

test('a deliberate rightward swipe on artwork returns once and consumes tile pointer-up/click', () => {
  const h = harness(), handlers = h.render();
  assert.equal(h.listeners.get('touchmove').options.passive, false);
  h.start(); assert.equal(h.move(140).prevented, true);
  const up = h.event([], { pointerType: 'touch' }); handlers.onPointerUpCapture(up);
  assert.equal(up.stopped, true);
  h.end(220); h.end(220);
  assert.deepEqual(h.calls, ['back']);
  const click = h.event([]); handlers.onClickCapture(click); assert.equal(click.stopped, true);
  h.start(); h.end(100);
  const tap = h.event([], { pointerType: 'touch' }); handlers.onPointerUpCapture(tap); assert.equal(tap.stopped, undefined);
});

test('short, leftward, diagonal and vertical gestures retain scrolling without Back', () => {
  const h = harness(); h.render();
  for (const [x, y] of [[105, 200], [115, 200], [30, 200], [200, 290], [105, 330]]) {
    h.start(); h.move(x, y); h.end(x, y, { timeStamp: 800 });
  }
  h.start(); assert.equal(h.move(102, 225).prevented, undefined); h.move(240, 230); h.end(240, 230);
  assert.deepEqual(h.calls, []);
});

test('a quick rightward flick can return without requiring a long thumb reach', () => {
  const h = harness(); h.render(); h.start(); h.move(130); h.end(136, 200, { timeStamp: 80 });
  assert.deepEqual(h.calls, ['back']);
});

test('document overview canvas accepts a short centre swipe while focused page turns and zoom panning remain owned by the page', () => {
  const h = harness(), handlers = h.render();
  const overviewCanvas = new h.Element({ parentElement: h.surface });
  h.start({ target: overviewCanvas, touches: [h.point(195)] });
  assert.equal(h.move(225).prevented, true);
  h.end(231, 200, { timeStamp: 80 });
  assert.deepEqual(h.calls, ['back']);

  for (const target of [new h.Element({ focused: true }), new h.Element({ focusedScroll: true })]) {
    h.start({ target, touches: [h.point(195)] });
    assert.equal(h.move(260).prevented, undefined);
    const up = h.event([], { pointerType: 'touch' });
    handlers.onPointerUpCapture(up);
    assert.equal(up.stopped, undefined);
    h.end(280);
  }
  assert.deepEqual(h.calls, ['back']);
});

test('pinches, cancellations and noncancelable native panning cannot become Back', () => {
  const h = harness(); h.render();
  h.start(); h.move(140); h.fire('touchcancel', h.event([])); h.end(240);
  h.start(); h.fire('touchstart', h.event([h.point(), h.point(150, 200, 2)]));
  h.end(150, 200, { touches: [h.point()] }); h.move(240); h.end(240);
  h.start(); h.move(240, 200, { cancelable: false }); h.end(240);
  h.start(); h.move(240, 200, { touches: [h.point(240, 200, 2)] }); h.end(240, 200, { changedTouches: [h.point(240, 200, 2)] });
  assert.deepEqual(h.calls, []);
});

test('controls, portals, phone edges and horizontal scrollers keep their own gestures', () => {
  const h = harness(); h.render();
  for (const values of [
    { target: new h.Element({ control: true }) }, { target: new h.Element({ outside: true }) },
    { touches: [h.point(5)] }, { touches: [h.point(385)] },
    { target: new h.Element({ parentElement: h.surface, scrollWidth: 800, overflowX: 'auto' }) },
    { target: new h.Element({ video: { controls: true, getBoundingClientRect: () => ({ bottom: 230 }) } }) },
  ]) { h.start(values); assert.equal(h.move(250).prevented, undefined); h.end(250); }
  assert.deepEqual(h.calls, []);
  // Video artwork away from the native transport remains navigable.
  h.start({ target: new h.Element({ video: { controls: true, getBoundingClientRect: () => ({ bottom: 600 }) } }) });
  h.move(240); h.end(240); assert.deepEqual(h.calls, ['back']);
});

test('focused/overlay modes, changed projects and WEB do not install or retain navigation', () => {
  const h = harness(); h.render(); h.start(); h.move(140); h.render({ enabled: false }); h.end(240);
  assert.equal(h.listeners.size, 0); assert.deepEqual(h.calls, []);
  h.render(); h.start(); h.move(140); h.render({ scope: 'another-project:page' }); h.end(240);
  assert.deepEqual(h.calls, []);
  h.render({ onBack: undefined }); assert.equal(h.listeners.size, 0);
  const web = harness('web'); web.render(); web.start(); web.move(240); web.end(240);
  assert.equal(web.listeners.size, 0); assert.deepEqual(web.calls, []);
});

test('ordinary rerenders use the latest Back callback without cancelling the gesture', () => {
  const h = harness(); h.render(); h.start(); h.move(140);
  h.render({ onBack: () => h.calls.push('latest back') }); h.end(240);
  assert.deepEqual(h.calls, ['latest back']);
});

test('cancelled touch drags cannot swallow later keyboard, assistive or mouse activation', () => {
  const h = harness(), handlers = h.render();
  h.start(); h.move(140); h.fire('touchcancel', h.event([]));
  const keyboard = h.event([], { detail: 0 }); handlers.onClickCapture(keyboard);
  assert.equal(keyboard.prevented, undefined);
  h.start(); h.move(140); h.fire('touchcancel', h.event([]));
  handlers.onPointerDownCapture(h.event([], { pointerType: 'mouse' }));
  const mouse = h.event([], { detail: 1 }); handlers.onClickCapture(mouse);
  assert.equal(mouse.prevented, undefined); assert.deepEqual(h.calls, []);
});
