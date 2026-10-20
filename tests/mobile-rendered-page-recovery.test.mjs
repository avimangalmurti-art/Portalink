import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const read = name => readFileSync(new URL(`../src/components/media/${name}`, import.meta.url), 'utf8');
const nodes = tree => React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const pending = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

/** Executes the real components and their event handlers; lifecycle qualification is tested separately. */
function componentHarness(file, name, initialProps, dependencies = {}, globals = {}, bind = () => {}) {
  const slots = [], effects = [];
  let cursor = 0, dirty = true, tree, props = initialProps, recovery;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const effect = (run, deps) => {
    const index = cursor++, prior = slots[index];
    if (!same(prior?.deps, deps)) {
      slots[index] = { deps };
      effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = run(); });
    }
  };
  const react = { ...React,
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useMemo(factory, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect: effect, useLayoutEffect: effect,
  };
  const exports = {};
  const source = `${read(file)}\n${name === 'RecoverableDocumentImage' ? 'export { RecoverableDocumentImage };' : ''}`;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, console, URL, URLSearchParams, AbortController, ...globals,
    require(path) {
      if (path === 'react') return react;
      if (path === './useMobileMediaRecovery') return { useMobileMediaRecovery: options => { recovery = options; return () => {}; } };
      if (Object.hasOwn(dependencies, path)) return dependencies[path];
      return new Proxy({}, { get: (_, property) => property === '__esModule' ? false : `stub-${String(property)}` });
    },
  });
  const flush = async () => {
    for (let index = 0; index < 30; index++) {
      if (dirty) { cursor = 0; dirty = false; tree = exports[name](props); bind(tree); while (effects.length) effects.shift()(); }
      await Promise.resolve();
    }
  };
  return { flush, get tree() { return tree; }, get recovery() { return recovery; },
    async render(next) { props = { ...props, ...next }; dirty = true; await flush(); },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('rendered PDF image retries the same source in place and preserves its geometry', async () => {
  const requests = [], state = [], loaded = [];
  const image = { set src(value) { requests.push(value); } };
  const h = componentHarness('DocumentAttachment.tsx', 'RecoverableDocumentImage', {
    source: 'page-4.png', width: 600, height: 900, style: { width: '200%', height: 'auto' },
    onReadStateChange: (source, waiting) => state.push([source, waiting]), onLoad: () => loaded.push(true),
  }, {}, {}, tree => { tree.ref.current = image; });
  await h.flush();
  const ref = h.tree.ref;
  h.tree.props.onError({ currentTarget: image }); await h.flush();
  assert.equal(h.recovery.failed, true);
  h.recovery.onRetry(); await h.flush();
  assert.deepEqual(requests, ['page-4.png']);
  assert.equal(h.tree.ref, ref);
  assert.equal(h.tree.props.src, 'page-4.png');
  assert.deepEqual([h.tree.props.width, h.tree.props.height], [600, 900]);
  assert.equal(h.tree.props.style.width, '200%');
  assert.equal(h.recovery.loading, true);
  h.tree.props.onLoad({ currentTarget: image }); await h.flush();
  assert.equal(h.recovery.failed, false); assert.equal(h.recovery.loading, false);
  assert.deepEqual(state.at(-1), ['page-4.png', false]); assert.equal(loaded.length, 1);
  h.dispose();
});

test('stale rendered image callbacks and queued retries cannot affect a replacement page', async () => {
  const requests = [], loaded = [];
  const image = { set src(value) { requests.push(value); } };
  const h = componentHarness('DocumentAttachment.tsx', 'RecoverableDocumentImage', {
    source: 'old.png', onReadStateChange() {}, onLoad: () => loaded.push(true),
  }, {}, {}, tree => { tree.ref.current = image; });
  await h.flush(); h.tree.props.onError({ currentTarget: image }); await h.flush();
  const oldRetry = h.recovery.onRetry, oldLoad = h.tree.props.onLoad, oldError = h.tree.props.onError;
  await h.render({ source: 'new.png' });
  oldRetry(); oldLoad({ currentTarget: image }); oldError({ currentTarget: image }); await h.flush();
  assert.deepEqual(requests, []); assert.deepEqual(loaded, []); assert.equal(h.recovery.failed, false);
  assert.equal(h.recovery.identity, 'new.png'); h.dispose();
});

function documentHarness(mobile = true, rendered = true) {
  const writes = [], memory = { focusedPageNumber: 1, scrollTop: 321, scrollLeft: 89 };
  const focusedHost = { scrollTop: 0, scrollLeft: 0 };
  const host = { focus() {}, querySelector: () => focusedHost, scrollTop: 0, scrollLeft: 0 };
  const attachment = { id: 'pdf', displayName: 'Report', sourceUrl: 'report.pdf', metadata: { renderedPages: rendered ? [1, 2, 3].map(index => ({ sourceUrl: `page-${index}.png`, storagePath: `page-${index}`, withinDocumentIndex: index, width: 600, height: 900 })) : [] } };
  const h = componentHarness('DocumentAttachment.tsx', 'DocumentAttachment', { attachment, projectId: 'project', memoryScope: 'shared' }, {
    './useSinglePageZoom': { useSinglePageZoom: () => 2 },
    './useFocusedPageSwipe': { useFocusedPageSwipe: () => ({ isMobile: mobile, swipeStyle: {}, swipeHandlers: {} }) },
    './viewerMemory': { readViewerMemory: () => memory, updateViewerMemory: (key, patch) => writes.push({ key, patch }) },
    './useDocumentReadingScroll': { useDocumentReadingScroll() {} },
    '../../features/performance/rum': { rumViewToken: () => null, markRumPdf() {} },
    '../../features/projects/pageLayout': { normalizePagesPerRow: value => value, MAX_PAGES_PER_ROW: 7 },
    './GenericFileCard': { GenericFileCard: 'file-card' }, './PdfImageDocument': { PdfImageDocument: 'live-pdf' },
  }, { window: { location: { search: '' } } }, tree => { for (const node of nodes(tree)) if (node.ref) node.ref.current = host; });
  return { ...h, get tree() { return h.tree; }, get recovery() { return h.recovery; }, writes, focusedHost, attachment };
}

test('MOBILE focused rendered PDF ignores transient scroll clamping until the image is ready; WEB preserves normal writes', async () => {
  for (const mobile of [true, false]) {
    const h = documentHarness(mobile); await h.flush();
    const image = nodes(h.tree).find(node => typeof node.type === 'function' && node.props.source === 'page-2.png');
    const reader = nodes(h.tree).find(node => node.props.onScroll && node.props.tabIndex === 0);
    const page = nodes(h.tree).find(node => node.type === 'li');
    image.props.onReadStateChange('page-2.png', true);
    const event = { currentTarget: { scrollTop: 0, scrollLeft: 0 } };
    reader.props.onScroll(event); page.props.onScroll?.(event);
    assert.equal(h.writes.length, mobile ? 0 : 1);
    image.props.onReadStateChange('page-2.png', false);
    reader.props.onScroll({ currentTarget: { scrollTop: 321, scrollLeft: 89 } });
    assert.equal(h.writes.at(-1).patch.scrollTop, 321);
    assert.equal(image.props.style.width, '200%'); h.dispose();
  }
});

test('initial PDF read failure recovers through the MOBILE parent without replaying preview processing', async () => {
  const h = documentHarness(); await h.flush();
  const sourceRecovery = h.recovery;
  assert.equal(sourceRecovery.enabled, false, 'Already rendered PDFs do not restart the document download'); h.dispose();
  for (const mobile of [true, false]) {
    const f = documentHarness(mobile, false); await f.flush();
    const pdf = nodes(f.tree).find(node => node.type === 'live-pdf');
    const ref = f.tree.ref;
    pdf.props.onError(); await f.flush();
    assert.equal(f.recovery.failed, true);
    assert.equal(f.recovery.identity, 'report.pdf');
    if (mobile) {
      assert.equal(f.tree.ref, ref); assert.equal(f.tree.props['data-document-attachment'], '');
      f.recovery.onRetry(); await f.flush();
      assert.equal(f.tree.ref, ref);
      assert.ok(nodes(f.tree).some(node => node.type === 'live-pdf'));
      assert.deepEqual(f.writes, []);
    } else assert.equal(f.tree.type, 'file-card', 'Desktop retains its original fallback markup');
    f.dispose();
  }
});

function gridHarness({ fail = false, hold = false, failRead = false, failDecode = false, source = 'page.png', presentedPages, pageNumber } = {}) {
  let intersection, resized, failDraw = fail, holding = hold, calls = 0, finished = 0, readFailure = failRead, decodeFailure = failDecode;
  const timers = new Map(), reads = [], bitmaps = [], stages = [];
  let nextTimer = 0;
  class Canvas {
    width = 0; height = 0; pixels = null;
    getContext() { if (this !== target && failDraw) return null; return { drawImage: image => { this.pixels = image.pixels; } }; }
  }
  const target = new Canvas();
  class PreviewURL extends URL { static createObjectURL() { return 'blob:preview'; } static revokeObjectURL() {} }
  const host = { clientWidth: 160, closest: () => ({ setAttribute() {} }) };
  const h = componentHarness('DocumentGridPreview.tsx', 'DocumentGridPreview', { source, width: 600, height: 900, label: 'Report, page 1', onReady: () => { finished++; }, presentedPages, pageNumber }, {
    './pageRenderQueue': { queuePageRender: sourceModule('src/components/media/pageRenderQueue.ts').createPageRenderQueue() },
  }, {
    window: { devicePixelRatio: 1 }, URL: PreviewURL, document: { createElement: () => { const stage = new Canvas(); stages.push(stage); return stage; } },
    setTimeout: (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; }, clearTimeout: id => timers.delete(id),
    IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} disconnect() {} },
    ResizeObserver: class { constructor(callback) { resized = callback; } observe() {} disconnect() {} },
    fetch: async () => { calls++; if (holding) { const item = pending(); reads.push(item); await item.promise; } if (readFailure) throw new Error('Network unavailable'); return { ok: true, blob: async () => ({}) }; },
    createImageBitmap: async () => { if (decodeFailure) throw new Error('Decode failed'); const bitmap = { pixels: calls, close() { this.closed = true; } }; bitmaps.push(bitmap); return bitmap; },
    Image: class { complete = false; naturalWidth = 0; set src(value) { if (value) queueMicrotask(() => this.onerror?.()); } },
  }, tree => { for (const node of nodes(tree)) if (node.ref) node.ref.current = node.type === 'canvas' ? target : host; });
  return { ...h, get tree() { return h.tree; }, get recovery() { return h.recovery; }, target, reads, bitmaps, get calls() { return calls; }, get finished() { return finished; },
    async intersect(near) { intersection([{ isIntersecting: near }]); await h.flush(); },
    fail(value) { failDraw = value; }, hold(value) { holding = value; },
    repairRead() { readFailure = false; decodeFailure = false; },
    async resize() { resized(); for (const [id, timer] of [...timers]) if (timer.delay === 120) { timers.delete(id); timer.callback(); } await h.flush(); },
  };
}

test('nearby rendered-page canvas retries failed drawing without remounting or fetching distant pages', async () => {
  const h = gridHarness({ fail: true }); await h.flush();
  assert.equal(h.calls, 0);
  await h.intersect(true); assert.equal(h.calls, 1); assert.equal(h.recovery.failed, true);
  const ref = h.tree.ref; h.fail(false); h.recovery.onRetry(); await h.flush();
  assert.equal(h.calls, 2); assert.equal(h.tree.ref, ref); assert.equal(h.recovery.failed, false);
  assert.equal(h.target.pixels, 2); assert.equal(h.finished, 1);
  assert.ok(h.bitmaps.every(bitmap => bitmap.closed));
  await h.intersect(false); assert.equal(h.target.width, 0); assert.equal(h.recovery.enabled, false); h.dispose();
});

for (const failure of ['fetch', 'decode']) test(`nearby rendered-page canvas exposes ${failure} failure to recovery and reads successfully after retry`, async () => {
  const h = gridHarness(failure === 'fetch' ? { failRead: true } : { failDecode: true });
  await h.flush(); await h.intersect(true);
  assert.equal(h.recovery.failed, true); assert.equal(h.calls, 1);
  h.repairRead(); h.recovery.onRetry(); await h.flush();
  assert.equal(h.recovery.failed, false); assert.equal(h.finished, 1); assert.equal(h.calls, 2); h.dispose();
});

test('same-source canvas retry retains painted artwork and size through failure and replacement', async () => {
  const h = gridHarness(); await h.flush(); await h.intersect(true);
  const size = [h.target.width, h.target.height], pixels = h.target.pixels;
  h.fail(true); await h.resize();
  assert.equal(h.recovery.failed, true); assert.equal(h.target.pixels, pixels);
  assert.deepEqual([h.target.width, h.target.height], size);
  h.fail(false); h.hold(true); h.recovery.onRetry(); await h.flush();
  assert.equal(h.recovery.loading, true); assert.equal(h.target.pixels, pixels);
  assert.deepEqual([h.target.width, h.target.height], size);
  h.hold(false); h.reads.at(-1).resolve(); await h.flush();
  assert.notEqual(h.target.pixels, pixels); assert.equal(h.recovery.loading, false); h.dispose();
});

test('rendered-page canvas reveals its first successful source once, preserving immediate resize, retry and off-screen return', async () => {
  const h = gridHarness(); await h.flush();
  const canvas = () => nodes(h.tree).find(node => node.type === 'canvas');
  await h.intersect(true);
  assert.equal(canvas().props['data-mobile-media-reveal'], '');
  assert.doesNotMatch(canvas().props.className, /transition-opacity/);
  await h.resize();
  assert.equal(canvas().props['data-mobile-media-reveal'], undefined);
  h.fail(true); await h.resize();
  assert.equal(h.recovery.failed, true);
  h.fail(false); h.recovery.onRetry(); await h.flush();
  assert.equal(canvas().props['data-mobile-media-reveal'], undefined);
  await h.intersect(false); assert.equal(h.target.width, 0);
  await h.intersect(true);
  assert.equal(canvas().props['data-mobile-media-reveal'], undefined);
  await h.render({ source: 'new-page.png' });
  assert.equal(canvas().props['data-mobile-media-reveal'], '');
  h.dispose();
});

test('rendered PDF overview returns from focused mode without replaying already presented page reveals', async () => {
  const reader = documentHarness(); await reader.flush(); await reader.render({ columns: 2 });
  const exitFocus = () => nodes(reader.tree).find(node => node.props.onExit).props.onExit();
  exitFocus(); await reader.flush();
  assert.ok(nodes(reader.tree).some(node => String(node.key).endsWith('document-grid')));
  const firstPreview = nodes(reader.tree).find(node => node.props.pageNumber === 1 && node.props.presentedPages);
  const history = firstPreview.props.presentedPages;
  const first = gridHarness(firstPreview.props); await first.flush(); await first.intersect(true);
  const firstCanvas = () => nodes(first.tree).find(node => node.type === 'canvas');
  assert.equal(firstCanvas().props['data-mobile-media-reveal'], '');
  assert.equal(history.get(1), 'page-1.png');
  first.dispose();
  const page = nodes(reader.tree).find(node => node.type === 'li');
  page.props.onKeyDown({ key: 'Enter', preventDefault() {} }); await reader.flush();
  assert.ok(nodes(reader.tree).some(node => String(node.key).endsWith('document-focused')));
  exitFocus(); await reader.flush();
  const returnedPreview = nodes(reader.tree).find(node => node.props.pageNumber === 1 && node.props.presentedPages);
  assert.equal(returnedPreview.props.presentedPages, history);
  const returned = gridHarness(returnedPreview.props); await returned.flush(); await returned.intersect(true);
  const returnedCanvas = () => nodes(returned.tree).find(node => node.type === 'canvas');
  assert.equal(returnedCanvas().props['data-mobile-media-reveal'], undefined,
    'Newly mounted overview canvases use the reader history only after their actual paint completes');
  await returned.render({ source: 'replacement-page-1.png' });
  assert.equal(returnedCanvas().props['data-mobile-media-reveal'], '');
  assert.equal(history.get(1), 'replacement-page-1.png');
  assert.equal(history.size, 1, 'A page keeps one last presented source rather than accumulating past URLs');
  returned.dispose();
  history.set(3, 'removed-page.png');
  await reader.render({ attachment: { ...reader.attachment, metadata: { ...reader.attachment.metadata,
    renderedPages: reader.attachment.metadata.renderedPages.slice(0, 1) } } });
  assert.equal(history.size, 1, 'Removed document pages release their presentation history');
  await reader.render({ attachment: { ...reader.attachment, sourceUrl: 'another-document.pdf' } });
  nodes(reader.tree).find(node => node.props.onExit)?.props.onExit(); await reader.flush();
  const nextPreview = nodes(reader.tree).find(node => node.props.pageNumber === 1 && node.props.presentedPages);
  assert.notEqual(nextPreview.props.presentedPages, history);
  assert.equal(nextPreview.props.presentedPages.size, 0);
  reader.dispose();
});

test('stale rendered-page fetches cannot paint a replacement source or paint after cleanup', async () => {
  const h = gridHarness({ hold: true }); await h.flush(); await h.intersect(true);
  const first = h.reads[0]; await h.render({ source: 'new.png' });
  first.resolve(); await h.flush(); assert.equal(h.finished, 0); assert.equal(h.target.width, 0);
  h.reads.at(-1).resolve(); await h.flush(); assert.equal(h.finished, 1);
  h.hold(true); await h.resize(); const last = h.reads.at(-1); h.dispose(); last.resolve(); await h.flush();
  assert.equal(h.finished, 1); assert.equal(h.target.width, 0);
});
