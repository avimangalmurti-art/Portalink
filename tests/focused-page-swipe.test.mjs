import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function harness(presentation = 'mobile') {
  const exports = {}, refs = [], moves = [], exits = [], touchListeners = new Map();
  let refIndex = 0, effect;
  class Element { constructor(control = false) { this.control = control; } closest() { return this.control ? this : null; } }
  const document = {
    addEventListener(type, listener, options) { touchListeners.set(type, { listener, options }); },
    removeEventListener(type, listener, capture) {
      assert.equal(touchListeners.get(type)?.listener, listener);
      assert.equal(capture, true);
      touchListeners.delete(type);
    },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/useFocusedPageSwipe.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Element, document, require(name) {
    if (name === 'react') return {
      useRef: current => refs[refIndex++] ??= { current },
      useLayoutEffect(run, deps) {
        if (effect && deps.every((value, index) => value === effect.deps[index])) return;
        effect?.cleanup?.();
        effect = { deps, cleanup: run() };
      },
    };
    assert.equal(name, '../../presentation/usePresentation');
    return { usePresentation: () => presentation };
  } });
  const render = (props = {}) => {
    refIndex = 0;
    return exports.useFocusedPageSwipe({ active: true, zoom: 1, onMove: d => moves.push(d), onExit: () => exits.push(true), ...props });
  };
  const event = (x = 200, y = 300, details = {}) => ({ clientX: x, clientY: y, pointerType: 'touch', pointerId: 1, isPrimary: true,
    target: new Element(), currentTarget: { getBoundingClientRect: () => ({ left: 0, right: 390 }) },
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...details });
  const touch = (type, count, target = new Element()) => {
    const capture = touchListeners.get(type);
    assert.ok(capture, `${type} must reach the document listener even when it starts outside the reader`);
    assert.equal(capture.options.capture, true);
    assert.equal(capture.options.passive, true);
    capture.listener({ type, target, touches: Array.from({ length: count }, (_, identifier) => ({ identifier })),
      preventDefault() { assert.fail('The swipe guard must leave native touch handling available'); },
      stopPropagation() { assert.fail('The pinch listener must still receive the event'); } });
  };
  return { render, event, moves, exits, Element, touch, touchListeners };
}

test('fitted mobile pages reserve horizontal swipes and navigate in both directions', () => {
  const h = harness(), view = h.render(), p = view.swipeHandlers;
  assert.equal(view.swipeStyle.touchAction, 'none');
  assert.equal(view.swipeStyle['--focused-page-touch-action'], 'none');
  for (const endX of [80, 320]) {
    p.onPointerDown(h.event()); p.onPointerMove(h.event(endX, 302));
    const end = h.event(endX, 302); p.onPointerUp(end);
    assert.equal(end.prevented, true); assert.equal(end.stopped, true);
    p.onPointerUp(end); // A release can move only once.
  }
  assert.deepEqual(h.moves, [1, -1]);
  assert.deepEqual(h.exits, []);
});

test('reading mode fits width, keeps vertical reading, and turns only horizontal swipes', () => {
  const h=harness(),view=h.render({readingMode:true}),p=view.swipeHandlers;
  assert.equal(view.swipeStyle.touchAction,'pan-y');
  p.onPointerDown(h.event());p.onPointerMove(h.event(200,400));p.onPointerUp(h.event(200,450));
  assert.deepEqual(h.exits,[]);
  p.onPointerDown(h.event());p.onPointerMove(h.event(80,302));p.onPointerUp(h.event(80,302));
  assert.deepEqual(h.moves,[1]);
});

test('a completed downward mobile swipe exits once without turning a page', () => {
  const h = harness(), p = h.render().swipeHandlers;
  p.onPointerDown(h.event()); p.onPointerMove(h.event(203, 330));
  const end = h.event(205, 400); p.onPointerUp(end); p.onPointerUp(end);
  assert.deepEqual(h.exits, [true]); assert.deepEqual(h.moves, []);
  assert.equal(end.prevented, true); assert.equal(end.stopped, true);
});

test('upward swipes, short pulls, diagonal drags and horizontal direction changes do not exit', () => {
  const h = harness(), p = h.render().swipeHandlers;
  for (const [x, y] of [[205, 200], [205, 340], [300, 400]]) {
    p.onPointerDown(h.event()); p.onPointerMove(h.event(x, y)); p.onPointerUp(h.event(x, y));
  }
  p.onPointerDown(h.event()); p.onPointerMove(h.event(220, 301)); p.onPointerUp(h.event(220, 430));
  assert.deepEqual(h.exits, []); assert.deepEqual(h.moves, []);
});

test('pinches, cancellations, controls and zoomed scrolling never dismiss the page', () => {
  const h = harness(), p = h.render().swipeHandlers;
  p.onPointerDown(h.event()); p.onPointerCancel(); p.onPointerUp(h.event(200, 450));
  p.onPointerDown(h.event()); p.onPointerDown(h.event(250, 300, { pointerId: 2, isPrimary: false })); p.onPointerUp(h.event(200, 450));
  p.onPointerDown(h.event()); p.onPointerUp(h.event(200, 450, { pointerId: 2 }));
  for (const down of [h.event(200, 300, { target: new h.Element(true) }), h.event(5), h.event(385), h.event(200, 300, { pointerType: 'mouse' })]) {
    p.onPointerDown(down); p.onPointerUp(h.event(200, 450));
  }
  p.onPointerDown(h.event()); h.render({ zoom: 2 }).swipeHandlers.onPointerUp(h.event(200, 450));
  for (const props of [{ zoom: 2 }, { active: false }]) {
    const v = h.render(props).swipeHandlers; v.onPointerDown(h.event()); v.onPointerMove(h.event(200, 340)); v.onPointerUp(h.event(200, 450));
  }
  assert.deepEqual(h.exits, []); assert.deepEqual(h.moves, []);
});

test('taps, vertical scroll, diagonal motion and cancelled swipes do not turn pages', () => {
  const h = harness(), p = h.render().swipeHandlers;
  p.onPointerDown(h.event()); p.onPointerUp(h.event(225));
  p.onPointerDown(h.event()); p.onPointerMove(h.event(202, 320)); p.onPointerUp(h.event(80, 350));
  p.onPointerDown(h.event()); p.onPointerUp(h.event(100, 400));
  p.onPointerDown(h.event()); p.onPointerCancel(); p.onPointerUp(h.event(80));
  assert.deepEqual(h.moves, []);
});

test('pinching and releases from other pointers cannot turn a page', () => {
  const h = harness(), p = h.render().swipeHandlers;
  p.onPointerDown(h.event()); p.onPointerDown(h.event(250, 300, { pointerId: 2, isPrimary: false }));
  p.onPointerUp(h.event(80));
  p.onPointerDown(h.event()); p.onPointerUp(h.event(80, 300, { pointerId: 2 }));
  assert.deepEqual(h.moves, []);
});

test('captured native multitouch cancels an armed turn even without a second reader pointerdown', () => {
  for (const detectedBy of ['touchstart', 'touchmove']) for (const nativeEndFirst of [false, true]) {
    const h = harness(), p = h.render().swipeHandlers;
    p.onPointerDown(h.event(200));
    h.touch('touchstart', 1);
    p.onPointerMove(h.event(172));
    // The second contact starts on a different element. Only the document sees
    // the two native touches and the reader receives the original pointer-up.
    h.touch(detectedBy, 2, new h.Element(true));
    p.onPointerMove(h.event(120));
    if (nativeEndFirst) h.touch('touchend', 1);
    const release = h.event(120);
    p.onPointerUp(release);
    assert.deepEqual(h.moves, []);
    assert.deepEqual(h.exits, []);
    assert.equal(release.prevented, undefined, 'The pinch still owns the release at the fitted zoom.');
    if (!nativeEndFirst) h.touch('touchend', 1);
    p.onPointerDown(h.event(200, 300, { pointerId: 2 }));
    p.onPointerUp(h.event(120, 300, { pointerId: 2 }));
    assert.deepEqual(h.moves, [], 'A remaining finger cannot restart the turn.');
    h.touch('touchend', 0);
    p.onPointerDown(h.event(200, 300, { pointerId: 3 }));
    h.touch('touchstart', 1);
    p.onPointerMove(h.event(120, 300, { pointerId: 3 }));
    p.onPointerUp(h.event(120, 300, { pointerId: 3 }));
    assert.deepEqual(h.moves, [1], 'A fresh one-finger swipe still turns the page.');
  }
});

test('native touch cancellation and leaving the focused reader release the multitouch guard', () => {
  const h = harness();
  const swipe = () => {
    const p = h.render().swipeHandlers;
    p.onPointerDown(h.event()); p.onPointerUp(h.event(120));
  };
  assert.equal(h.render({ active: false }).isMobile, true);
  assert.equal(h.touchListeners.size, 0);
  h.render();
  h.touch('touchstart', 2);
  h.touch('touchcancel', 0);
  swipe();
  h.touch('touchstart', 2);
  h.render({ active: false });
  assert.equal(h.touchListeners.size, 0);
  swipe();
  assert.deepEqual(h.moves, [1, 1]);
});

test('zoomed pages retain native panning, including when a pinch starts mid-gesture', () => {
  const h = harness(), fit = h.render();
  fit.swipeHandlers.onPointerDown(h.event());
  const zoomed = h.render({ zoom: 2 });
  assert.equal(zoomed.swipeStyle.touchAction, 'pan-x pan-y');
  zoomed.swipeHandlers.onPointerUp(h.event(80));
  zoomed.swipeHandlers.onPointerDown(h.event()); zoomed.swipeHandlers.onPointerUp(h.event(80));
  assert.deepEqual(h.moves, []);
});

test('controls, phone edges, mouse drags and overview pages keep their own interactions', () => {
  const h = harness(), p = h.render().swipeHandlers;
  for (const down of [h.event(200, 300, { target: new h.Element(true) }), h.event(5), h.event(385), h.event(200, 300, { pointerType: 'mouse' })]) {
    p.onPointerDown(down); p.onPointerUp(h.event(80));
  }
  const inactive = h.render({ active: false });
  inactive.swipeHandlers.onPointerDown(h.event()); inactive.swipeHandlers.onPointerUp(h.event(80));
  assert.equal(inactive.swipeStyle.touchAction, 'pan-x pan-y');
  assert.deepEqual(h.moves, []);
});

test('WEB retains its existing touch panning and swipe navigation', () => {
  const h = harness('web'), view = h.render();
  assert.equal(view.isMobile, false);
  assert.equal(h.touchListeners.size, 0);
  assert.equal(view.swipeStyle.touchAction, 'pan-x pan-y');
  view.swipeHandlers.onPointerDown(h.event());
  const end = h.event(80); view.swipeHandlers.onPointerUp(end);
  assert.deepEqual(h.moves, [1]); assert.equal(end.prevented, undefined);
  view.swipeHandlers.onPointerDown(h.event()); view.swipeHandlers.onPointerUp(h.event(200, 450));
  assert.deepEqual(h.exits, []);
});
