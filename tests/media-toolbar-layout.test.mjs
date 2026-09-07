import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, imports = {}, globals = {}) {
  const source = readFileSync(new URL(`../src/features/media-interactions/${file}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, ...globals, require: (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}
const layoutModule = load('mediaToolbarLayout.ts');
const { displayedPageWidth, mediaToolbarLayout } = layoutModule;
const emptyCounts = ['', '', '', ''];

test('focused portrait and landscape images use their artwork width, excluding letterboxing', () => {
  assert.equal(displayedPageWidth(900, 600, 600, 1200, true), 300);
  assert.equal(displayedPageWidth(900, 600, 1800, 600, true), 900);
  assert.equal(displayedPageWidth(450, 600), 450); // Canvas CSS size, regardless of pixel density.
  assert.equal(displayedPageWidth(900, 600, 0, 0, true), 900); // Not loaded yet.
});

test('normal pages target fifteen percent, with smaller thumbnails and a large-page cap', () => {
  assert.equal(mediaToolbarLayout(1000, 1000, 4, emptyCounts).width, 150);
  assert.equal(mediaToolbarLayout(1200, 1200, 4, emptyCounts).width, 180);
  assert.ok(mediaToolbarLayout(240, 240, 4, emptyCounts).width < 150);
  assert.equal(mediaToolbarLayout(4000, 1000, 8, emptyCounts).width, 220);
});

test('the compact minimum yields to narrow pages and narrow focused viewports', () => {
  assert.equal(mediaToolbarLayout(80, 80, 4, emptyCounts).width, 72);
  assert.equal(mediaToolbarLayout(1200, 100, 8, emptyCounts).width, 84);
  assert.equal(mediaToolbarLayout(0, 0, 4, emptyCounts).width, 0);
});

test('counts, padding, gaps and all five buttons stay inside every tested row', () => {
  for (const counts of [emptyCounts, ['1', '99', '1.2K', '999.9M']]) {
    for (const pageWidth of [64, 120, 240, 600, 1000, 2000]) {
      const { width, unit, slots } = mediaToolbarLayout(pageWidth, pageWidth, 4, counts);
      assert.ok(width <= pageWidth - 8);
      assert.equal(slots.length, 5);
      assert.ok(Math.abs((slots.reduce((sum, slot) => sum + slot, 0) + 28) * unit - width) < 0.0001);
      counts.forEach((count, index) => {
        const contentWidth = (16 + 8 + (count ? 4 + count.length * 7 : 0)) * unit;
        assert.ok(contentWidth <= slots[index] * unit);
      });
    }
  }
});

test('page measurement follows lazy images, zoom, replacement and cleanup without observing popup images', () => {
  let layoutEffect, cleanup, resize, mutation, surface = null;
  let state = { pageWidth: 0, hostWidth: 0 };
  const frames = new Map();
  const events = new Map();
  let nextFrame = 1;
  const host = {
    clientWidth: 900,
    querySelector(selector) { assert.equal(selector, '[data-media-page-surface]'); return surface; },
    addEventListener(name, handler, capture) { assert.equal(capture, true); events.set(name, handler); },
    removeEventListener(name, handler) { assert.equal(events.get(name), handler); events.delete(name); }
  };
  class ImageSurface {
    naturalWidth = 600; naturalHeight = 1200; width = 900; height = 600;
    getBoundingClientRect() { return { width: this.width, height: this.height }; }
  }
  const observed = new Set();
  const hooks = load('useMediaPageSize.ts', {
    react: {
      useRef: () => ({ current: { parentElement: host } }),
      useState: () => [state, (update) => { state = update(state); }],
      useLayoutEffect: (effect) => { layoutEffect = effect; }
    },
    './mediaToolbarLayout': layoutModule
  }, {
    HTMLImageElement: ImageSurface,
    getComputedStyle: () => ({ objectFit: 'contain' }),
    requestAnimationFrame: (callback) => { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe(target) { observed.add(target); }
      unobserve(target) { observed.delete(target); }
      disconnect() { observed.clear(); }
    },
    MutationObserver: class {
      constructor(callback) { mutation = callback; }
      observe() {}
      disconnect() { mutation = null; }
    }
  });
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback()); };
  hooks.useMediaPageSize(); cleanup = layoutEffect();
  assert.equal(state.pageWidth, 900);
  surface = new ImageSurface(); mutation(); flush();
  assert.equal(state.pageWidth, 300);
  surface.width = 1800; surface.height = 1200; resize(); flush();
  assert.equal(state.pageWidth, 600);
  assert.equal(state.hostWidth, 900);
  const previous = surface;
  surface = new ImageSurface(); mutation(); events.get('load')(); flush();
  assert.ok(!observed.has(previous)); assert.ok(observed.has(surface));
  assert.equal(state.pageWidth, 300);
  mutation(); assert.equal(frames.size, 0); // A comment/avatar change is not a page change.
  resize(); assert.equal(frames.size, 1);
  cleanup();
  assert.equal(frames.size, 0); assert.equal(observed.size, 0); assert.equal(events.size, 0); assert.equal(mutation, null);
});
