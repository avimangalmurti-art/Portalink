import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

function harness({ pages: customPages, onEnter } = {}) {
  const events = new Map(), entries = [], motions = [], removals = [];
  class Element {
    constructor(control = false) { this.control = control; }
    closest() { return this.control ? this : null; }
  }
  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const page = (number, left, top, width = 180, height = 250) => ({
    dataset: { projectPageNumber: String(number) },
    getBoundingClientRect: () => box(left, top, width, height),
  });
  const pages = customPages ?? [page(1, 0, -300), page(2, 0, 20), page(3, 200, 20), page(4, 0, 290), page(5, 200, 290)];
  const surface = {
    querySelectorAll: () => pages,
    getBoundingClientRect: () => box(0, 0, 400, 540),
    addEventListener(name, fn, options) { assert.equal(events.has(name), false); events.set(name, { fn, options }); },
    removeEventListener(name, fn) { if (events.get(name)?.fn === fn) events.delete(name); removals.push(name); },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/pageZoomEntry.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Element, WheelEvent: { DOM_DELTA_PIXEL: 0, DOM_DELTA_LINE: 1, DOM_DELTA_PAGE: 2 },
    require(name) {
      if (name.endsWith('/pinchGesture')) return {
        pinchDistance: touches => touches.length === 2 ? Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY) : null,
      };
      assert.ok(name.endsWith('/contentPinchMotion'), `Unexpected import ${name}`);
      return {
        touchMidpoint: touches => ({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 }),
        beginContentPinch(target, point) {
          assert.equal(target, surface);
          const motion = { point, updates: [], cancellations: 0, settlements: [],
            update(scale, center) { this.updates.push({ scale, center }); },
            cancel() { this.cancellations++; },
            settle(preserve) { this.settlements.push(preserve); },
          };
          motions.push(motion);
          return motion;
        },
      };
    },
  });
  const cleanup = exports.installPageZoomEntry(surface, (pageNumber, zoom) => {
    entries.push({ pageNumber, zoom });
    onEnter?.(pageNumber, zoom);
  });
  const event = (type, detail = {}) => ({ type, target: new Element(), cancelable: true, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...detail });
  const dispatch = input => { events.get(input.type)?.fn(input); return input; };
  const touches = (distance, count = 2, x = 290, y = 130) => Array.from({ length: count }, (_, index) => ({
    identifier: index, clientX: x + (index === 0 ? -distance / 2 : distance / 2), clientY: y,
  }));
  return { entries, motions, events, removals, cleanup, Element, page,
    pointerUp(detail = {}) { return dispatch(event('pointerup', { pointerType: 'touch', ...detail })); },
    wheel(detail = {}) { return dispatch(event('wheel', { deltaY: -40, deltaMode: 0, ctrlKey: true, metaKey: false, clientX: 290, clientY: 130, ...detail })); },
    touch(type, distance = 100, count = 2, detail = {}) { return dispatch(event(type, { touches: touches(distance, count), ...detail })); },
    touches,
  };
}

test('modified zoom-in selects the page under the pointer and immediately starts above fitted size', () => {
  for (const modifier of [{ ctrlKey: true }, { ctrlKey: false, metaKey: true }]) {
    const h = harness(), event = h.wheel(modifier);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
    assert.equal(h.entries.length, 1);
    assert.equal(h.entries[0].pageNumber, 3);
    assert.ok(h.entries[0].zoom > 1 && h.entries[0].zoom <= 4);
    h.cleanup();
  }
});

test('ordinary scrolling, horizontal-only input and zoom-out remain available to their existing handlers', () => {
  const h = harness();
  for (const detail of [{ ctrlKey: false }, { deltaY: 0 }, { deltaY: 40 }]) {
    const event = h.wheel(detail);
    assert.equal(event.defaultPrevented, false);
    assert.notEqual(event.stopped, true);
  }
  assert.deepEqual(h.entries, []);
  h.cleanup();
});

test('wheel delta modes honor their scale and repeated input before layout enters only once', () => {
  const pixel = harness(), line = harness(), page = harness();
  pixel.wheel({ deltaY: -1 }); line.wheel({ deltaY: -1, deltaMode: 1 }); page.wheel({ deltaY: -1, deltaMode: 2 });
  assert.ok(pixel.entries[0].zoom < line.entries[0].zoom);
  assert.ok(line.entries[0].zoom < page.entries[0].zoom);
  line.wheel(); line.wheel();
  assert.equal(line.entries.length, 1);
  for (const h of [pixel, line, page]) h.cleanup();
});

test('a gutter zoom chooses the nearest visible page rather than an offscreen page or the first page', () => {
  const h = harness();
  h.wheel({ clientX: 192, clientY: 410 });
  assert.equal(h.entries[0].pageNumber, 5);
  h.cleanup();
});

test('spreading previews under the fingers then opens that single page once on release', () => {
  const h = harness();
  h.touch('touchstart');
  assert.equal(h.motions.length, 0, 'Starting two touches must not steal density ownership before intent is known');
  const pending = h.touch('touchmove', 102);
  assert.equal(pending.defaultPrevented, true);
  assert.equal(pending.stopped, true);
  assert.deepEqual(h.entries, []);
  const spreading = h.touch('touchmove', 150);
  assert.equal(spreading.defaultPrevented, true);
  assert.equal(spreading.stopped, true);
  assert.equal(h.motions.length, 1);
  assert.ok(h.motions[0].updates.at(-1).scale >= 1.5);
  assert.deepEqual(h.entries, [], 'Keep the existing touch targets until release');
  const release = h.touch('touchend', 150, 1);
  assert.equal(release.stopped, true);
  assert.deepEqual(h.entries, [{ pageNumber: 3, zoom: 1.5 }]);
  h.touch('touchend', 0, 0);
  assert.equal(h.entries.length, 1);
  h.cleanup();
});

test('an inward pinch retains density ownership even after it reverses direction', () => {
  const h = harness();
  h.touch('touchstart');
  for (const distance of [90, 80, 160]) {
    const move = h.touch('touchmove', distance);
    assert.equal(move.defaultPrevented, false);
    assert.notEqual(move.stopped, true);
  }
  h.touch('touchend', 0, 0);
  assert.deepEqual(h.entries, []);
  assert.equal(h.motions.length, 0);
  h.cleanup();
});

test('a translated outward pinch keeps the starting content point and suppresses a false double-tap', () => {
  const h = harness();
  h.touch('touchstart');
  h.touch('touchmove', 150, 2, { touches: h.touches(150, 2, 310, 150) });
  assert.equal(h.motions[0].point.x, 290);
  assert.equal(h.motions[0].point.y, 130);
  const last = h.motions[0].updates.at(-1);
  assert.equal(last.center.x, 310); assert.equal(last.center.y, 150);
  assert.equal(h.pointerUp().stopped, true);
  h.touch('touchend', 0, 0);
  assert.notEqual(h.pointerUp().stopped, true);
  assert.equal(h.entries[0].pageNumber, 3);
  h.cleanup();
});

test('a spreading pinch reversed back to fitted size cancels entry', () => {
  const h = harness();
  h.touch('touchstart'); h.touch('touchmove', 180); h.touch('touchmove', 100); h.touch('touchend', 0, 0);
  assert.deepEqual(h.entries, []);
  assert.ok(h.motions[0].cancellations > 0);
  h.cleanup();
});

test('cancelled, third-finger and unfinished pinches never focus or leave an active preview', () => {
  for (const cancel of ['touchcancel', 'third-finger', 'cleanup']) {
    const h = harness();
    h.touch('touchstart');
    h.touch('touchmove', 180);
    if (cancel === 'touchcancel') h.touch('touchcancel', 180, 2);
    else if (cancel === 'third-finger') h.touch('touchstart', 180, 3);
    else h.cleanup();
    h.touch('touchend', 0, 0);
    assert.deepEqual(h.entries, []);
    assert.ok(h.motions[0].cancellations > 0 || h.motions[0].settlements.length > 0);
    if (cancel !== 'cleanup') h.cleanup();
  }
  const h = harness();
  h.touch('touchstart'); h.touch('touchmove', 102); h.touch('touchend', 0, 0);
  assert.deepEqual(h.entries, []);
  h.cleanup();
});

test('controls do not enter page zoom and large gestures are bounded', () => {
  const h = harness(), control = new h.Element(true);
  const wheel = h.wheel({ target: control });
  assert.equal(wheel.defaultPrevented, false);
  h.touch('touchstart', 100, 2, { target: control });
  h.touch('touchmove', 180); h.touch('touchend', 0, 0);
  assert.deepEqual(h.entries, []);
  h.touch('touchstart'); h.touch('touchmove', 10000); h.touch('touchend', 0, 0);
  assert.equal(h.entries[0].zoom, 4);
  h.cleanup();
});

test('empty page surfaces are ignored and cleanup removes every registered listener', () => {
  const h = harness({ pages: [] });
  h.wheel(); h.touch('touchstart'); h.touch('touchmove', 150); h.touch('touchend', 0, 0);
  assert.deepEqual(h.entries, []);
  const listenerNames = [...h.events.keys()];
  assert.ok(listenerNames.includes('wheel') && listenerNames.includes('touchmove'));
  assert.equal(h.events.get('wheel').options.passive, false);
  assert.equal(h.events.get('touchmove').options.passive, false);
  h.cleanup();
  assert.equal(h.events.size, 0);
  assert.deepEqual(h.removals.sort(), listenerNames.sort());
});
