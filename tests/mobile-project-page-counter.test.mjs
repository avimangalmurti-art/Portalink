import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const rect = (top, bottom, left = 0, right = 390) => ({ top, bottom, left, right });
const page = (number, total, bounds) => ({ dataset: { projectPageNumber: `${number}`, projectPageTotal: `${total}` },
  bounds, getBoundingClientRect() { return this.bounds; } });

function mount(pages = [], { delayedRef = false } = {}) {
  let state = null, effect, frame, onMutation, onResize, cleanedMutations = false, cleanedResize = false;
  const events = new Map(), windowEvents = new Map(), observed = new Set();
  const surface = { pages, bounds: rect(0, 800), querySelectorAll() { return this.pages; },
    getBoundingClientRect() { return this.bounds; }, addEventListener(name, fn, opts) { events.set(name, { fn, opts }); },
    removeEventListener(name) { events.delete(name); } };
  const surfaceRef = { current: delayedRef ? null : surface };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobileProjectPageCounter.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, {
    exports, require(name) {
      if (name === 'react') return { ...React, useState: () => [state, fn => { state = fn(state); }], useLayoutEffect: fn => { effect = fn; } };
      if (name === 'lucide-react') return { Grid2X2Icon: () => null };
      if (name === '../ui/InterfaceIcon') return { InterfaceIcon: () => null };
      throw new Error(name);
    },
    MutationObserver: class { constructor(fn) { onMutation = fn; } observe() {} disconnect() { cleanedMutations = true; } },
    ResizeObserver: class { constructor(fn) { onResize = fn; } observe(node) { observed.add(node); } unobserve(node) { observed.delete(node); } disconnect() { cleanedResize = true; } },
    requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame: () => { frame = null; },
    window: { innerWidth: 390, innerHeight: 800, addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: name => windowEvents.delete(name) },
  });
  const render = (scope = 'project:images') => exports.MobileProjectPageCounter({ surfaceRef, scope });
  assert.equal(render(), null);
  const cleanup = effect();
  const flush = () => { const callback = frame; frame = null; callback?.(); };
  return { surface, surfaceRef, render, flush, events, observed, cleanup,
    mutate() { onMutation(); flush(); }, resize() { onResize(); flush(); }, scroll() { events.get('scroll')?.fn(); flush(); },
    get clean() { return cleanedMutations && cleanedResize && !frame && !events.size && !windowEvents.size; } };
}

test('shows the actual most-visible page while a nested renderer scrolls', () => {
  const one = page(1, 3, rect(0, 600)), two = page(2, 3, rect(602, 1202)), three = page(3, 3, rect(1204, 1804));
  const h = mount([one, two, three]); h.flush();
  assert.equal(h.render().props['aria-label'], 'Page 1 of 3');
  assert.equal(h.render().props.onClick, undefined, 'a counter must not pretend to offer an action');
  assert.equal(h.events.get('scroll').opts.capture, true);
  one.bounds = rect(-600, 0); two.bounds = rect(2, 602); three.bounds = rect(604, 1204); h.scroll();
  assert.equal(h.render().props['aria-label'], 'Page 2 of 3');
  h.cleanup(); assert.equal(h.clean, true);
});

test('waits for real page metadata and handles a delayed parent ref and asynchronous PDF catalog', () => {
  const h = mount([], { delayedRef: true });
  h.surfaceRef.current = h.surface; h.flush();
  assert.equal(h.render(), null, 'no guessed total while the document is loading');
  h.surface.pages = [page(1, 12, rect(0, 600)), page(2, 12, rect(602, 1202))]; h.mutate();
  assert.equal(h.render().props['aria-label'], 'Page 1 of 12');
  assert.equal(h.render('another-project:document'), null, 'old count cannot leak across project/media changes');
  h.surface.pages = []; h.mutate();
  assert.equal(h.render(), null);
  assert.equal(h.observed.size, 1, 'removed page wrappers are no longer observed');
  h.cleanup(); assert.equal(h.clean, true);
});

test('clips to the viewer and viewport and breaks multi-column ties by page number', () => {
  const h = mount([page(3, 6, rect(0, 400, 195, 390)), page(1, 6, rect(0, 400, 0, 195)), page(2, 6, rect(-900, 0))]);
  h.surface.bounds = rect(100, 700); h.flush();
  assert.equal(h.render().props['aria-label'], 'Page 1 of 6');
  h.surface.pages[0].bounds = rect(100, 650, 195, 390); h.resize();
  assert.equal(h.render().props['aria-label'], 'Page 3 of 6');
  h.cleanup();
});

test('ignores invalid metadata and hidden pages without a fake 1 of 1 fallback', () => {
  const h = mount([page(0, 4, rect(0, 600)), page(5, 4, rect(0, 600)), page(1.5, 4, rect(0, 600)), page(1, 4, rect(0, 0))]);
  h.flush(); assert.equal(h.render(), null); h.cleanup(); assert.equal(h.clean, true);
});

test('image, rendered-document and live-PDF renderers expose their actual page sequence without changing focus handlers', () => {
  const image = readFileSync(new URL('../src/components/media/ImageAttachment.tsx', import.meta.url), 'utf8');
  const document = readFileSync(new URL('../src/components/media/DocumentAttachment.tsx', import.meta.url), 'utf8');
  const pdf = readFileSync(new URL('../src/components/media/PdfImageDocument.tsx', import.meta.url), 'utf8');
  assert.match(image, /data-project-page-number=\{pageNumber\} data-project-page-total=\{pageCount\}/);
  assert.match(document, /data-project-page-number=\{index \+ 1\} data-project-page-total=\{renderedPages.length\}/);
  assert.match(pdf, /data-project-page-number=\{pageNumber\}\s+data-project-page-total=\{document.numPages\}/);
  for (const source of [image, document, pdf]) assert.match(source, /onDoubleClick=/);
});
