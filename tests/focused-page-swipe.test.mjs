import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function harness(presentation = 'mobile') {
  const exports = {}, ref = { current: null }, moves = [];
  class Element { constructor(control = false) { this.control = control; } closest() { return this.control ? this : null; } }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/useFocusedPageSwipe.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Element, require(name) {
    if (name === 'react') return { useRef: () => ref };
    assert.equal(name, '../../presentation/usePresentation');
    return { usePresentation: () => presentation };
  } });
  const render = (props = {}) => exports.useFocusedPageSwipe({ active: true, zoom: 1, onMove: d => moves.push(d), ...props });
  const event = (x = 200, y = 300, details = {}) => ({ clientX: x, clientY: y, pointerType: 'touch', pointerId: 1, isPrimary: true,
    target: new Element(), currentTarget: { getBoundingClientRect: () => ({ left: 0, right: 390 }) },
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...details });
  return { render, event, moves, Element };
}

test('fitted mobile pages reserve horizontal swipes and navigate in both directions', () => {
  const h = harness(), view = h.render(), p = view.swipeHandlers;
  assert.equal(view.swipeStyle.touchAction, 'pan-y');
  assert.equal(view.swipeStyle['--focused-page-touch-action'], 'pan-y');
  for (const endX of [80, 320]) {
    p.onPointerDown(h.event()); p.onPointerMove(h.event(endX, 302));
    const end = h.event(endX, 302); p.onPointerUp(end);
    assert.equal(end.prevented, true); assert.equal(end.stopped, true);
    p.onPointerUp(end); // A release can move only once.
  }
  assert.deepEqual(h.moves, [1, -1]);
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
  assert.equal(view.swipeStyle.touchAction, 'pan-x pan-y');
  view.swipeHandlers.onPointerDown(h.event());
  const end = h.event(80); view.swipeHandlers.onPointerUp(end);
  assert.deepEqual(h.moves, [1]); assert.equal(end.prevented, undefined);
});
