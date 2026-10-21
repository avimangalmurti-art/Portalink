import {motionFixture} from './helpers/motion-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(reduced = false) {
  let reads = 0, id = 0;
  const frames = new Map(), animations = [];
  const scroll = { isConnected: true, scrollTop: 500, scrollLeft: 0, overflow: 'auto' };
  const page = (number, x, y) => ({ dataset: { projectPageNumber: String(number) }, parentElement: scroll,
    style: { transform: '', transformOrigin: '', transition: '', willChange: '' }, rect: { left: x, top: y, width: 100, height: 200 },
    getBoundingClientRect() { reads++; return this.rect; },
    animate(keyframes, options) { const animation = { keyframes, options, cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } }; animations.push(animation); return animation; }
  });
  const pages = [page(1, 0, -200), page(2, 0, 10), page(3, 102, 10)];
  const surface = { getBoundingClientRect: () => ({ top: 0, bottom: 400, height: 400 }), querySelectorAll: () => pages };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/contentPinchMotion.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, require:name=>{assert.equal(name,'../../presentation/motion/motion');return motionFixture;}, getComputedStyle: el => ({ overflowY: el.overflow }), window: { matchMedia: () => ({ matches: reduced }) },
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; }, cancelAnimationFrame(i) { frames.delete(i); } });
  return { pages, scroll, frames, animations, get reads() { return reads; }, begin: () => exports.beginContentPinch(surface, { x: 101, y: 110 }),
    flush() { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn()); } };
}

test('pinch coalesces continuous transform writes without reading layout each frame, and restores on cancel', () => {
  const h = harness(), motion = h.begin(), reads = h.reads;
  motion.update(1.13, { x: 101, y: 110 }); motion.update(1.27, { x: 105, y: 115 });
  assert.equal(h.frames.size, 1); h.flush(); assert.equal(h.reads, reads);
  assert.match(h.pages[1].style.transform, /scale\(1.27, 1.27\)/);
  motion.update(1.3, { x: 100, y: 100 }); motion.cancel(); assert.equal(h.frames.size, 0);
  assert.equal(h.pages[1].style.transform, ''); assert.equal(h.pages[1].style.willChange, '');
});

test('a gutter pinch anchors the nearest page rather than the offscreen overscan page', () => {
  const h = harness(), motion = h.begin(); motion.update(2, { x: 101, y: 110 });
  h.pages[0].rect.top = -1000; h.pages[1].rect = { left: 0, top: 10, width: 200, height: 400 };
  motion.settle();
  assert.equal(h.scroll.scrollTop, 600, 'Page 2 midpoint remains under the fingers');
  assert.equal(h.scroll.scrollLeft, 99, 'Gutter anchor fraction is bounded to the page edge');
  assert.equal(h.animations[0].options.duration, 180);
  assert.ok(h.animations.every(a => a.keyframes.every(k => !('opacity' in k))));
  const next = h.begin(); assert.ok(h.animations.every(a => a.cancelled)); next.cancel();
});

test('reduced motion keeps direct finger tracking but skips settling animation', () => {
  const h = harness(true), motion = h.begin(); motion.update(1.2, { x: 101, y: 110 }); h.flush();
  motion.settle(false); assert.equal(h.animations.length, 0); assert.equal(h.pages[1].style.transform, '');
});
