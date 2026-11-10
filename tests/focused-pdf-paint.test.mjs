import {sourceModule} from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/media/PdfImageDocument.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(`${source}\nexport { PdfImagePage };`, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;

function harness(retainCanvasWhileLoading = true, focused = true, throwRender = false, presentedPages = new Set(), { observeOverviewPage, desktopQueue } = {}) {
  const slots = [], effects = [], tasks = [];
  const {createPageRenderQueue} = sourceModule('src/components/media/pageRenderQueue.ts');
  const queuePageRender = createPageRenderQueue();
  let cursor = 0, dirty = false, tree, props, intersection;
  let recovery, recoveryCancels = 0;
  const memoryWrites = [];
  class Canvas {
    width = 300; height = 150; painted = null;
    ownerDocument = { createElement: () => new Canvas() };
    getContext() { return { drawImage: image => { this.painted = image.painted; } }; }
  }
  const canvas = new Canvas();
  const host = { clientWidth: 390, clientHeight: 600, scrollTop: 0, scrollLeft: 0, getBoundingClientRect: () => ({ width: 390, height: 600 }) };
  const effect = (fn, deps) => {
    const index = cursor++, previous = slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
      slots[index] = { deps, cleanup: previous?.cleanup };
      effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = fn(); });
    }
  };
  const hooks = { ...React,
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value;
      return [slots[index], next => { const result = typeof next === 'function' ? next(slots[index]) : next;
        if (result !== slots[index]) { slots[index] = result; dirty = true; } }];
    }, useEffect: effect, useLayoutEffect: effect,
  };
  const exports = {};
  vm.runInNewContext(code, { exports, window: { devicePixelRatio: 1, setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, removeEventListener() {} },
    IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} disconnect() {} },
    require(name) {
      if (name === 'react') return hooks;
      if (name === './pageRenderQueue') return {queuePageRender, createPageRenderQueue: () => desktopQueue ?? createPageRenderQueue()};
      if (name === './viewerMemory') return { readViewerMemory: () => ({ scrollTop: 140, scrollLeft: 70 }), updateViewerMemory: (...args) => memoryWrites.push(args) };
      if (name === './useMobileMediaRecovery') return { useMobileMediaRecovery: options => { recovery = options; return () => { recoveryCancels++; }; } };
      if (name === '../../features/performance/rum') return { rumViewToken: () => null, markRumPdf() {} };
      return { InterfaceIcon: () => null, RotateCcwIcon: () => null };
    },
  });
  props = { projectId: 'project', attachmentId: 'pdf', label: 'Work', pageNumber: 1, observeOverviewPage,
    isFocused: focused, zoom: 1, retainCanvasWhileLoading, showMediaInteractions: false, onSettled() {},
    presentedPages,
    document: { getPage: async pageNumber => ({ pageNumber, cleanup() {},
      getTextContent: async () => ({ items: [] }),
      getViewport: ({ scale }) => ({ width: 600 * scale, height: (pageNumber === 1 ? 900 : 800) * scale }),
      render({ canvas: target }) {
        if (throwRender) throw new Error('Canvas allocation failed');
        let finish, fail;
        const promise = new Promise((resolve, reject) => { finish = () => { target.painted = pageNumber; resolve(); }; fail = () => reject(new Error('Render failed')); });
        const task = { promise, finish, fail, target, cancelled: false, cancel() { this.cancelled = true; } };
        tasks.push(task); return task;
      },
    }) },
  };
  function bind(node) {
    if (!node || typeof node !== 'object') return;
    if (node.ref) node.ref.current = node.type === 'canvas' ? canvas : host;
    React.Children.forEach(node.props?.children, bind);
  }
  async function flush() {
    for (let i = 0; i < 8; i++) {
      if (dirty || !tree) {
        cursor = 0; dirty = false; tree = exports.PdfImagePage(props); bind(tree);
        while (effects.length) effects.shift()();
      }
      await Promise.resolve();
    }
  }
  return { canvas, host, tasks, flush, memoryWrites, get tree() { return tree; }, get recovery() { return recovery; }, get recoveryCancels() { return recoveryCancels; },
    async retry() { recovery.onRetry(); await flush(); },
    async setProps(patch) { props = { ...props, ...patch }; dirty = true; await flush(); },
    async intersect(visible) { intersection([{ isIntersecting: visible }]); await flush(); },
    async move(pageNumber) { props = { ...props, pageNumber }; dirty = true; await flush(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('mobile keeps the painted PDF and dimensions until a complete replacement is ready', async () => {
  const h = harness(); await h.flush();
  assert.notEqual(h.tasks[0].target, h.canvas);
  h.tasks[0].finish(); await h.flush();
  assert.equal(h.canvas.painted, 1);
  const oldSize = [h.canvas.width, h.canvas.height];
  await h.move(2);
  assert.equal(h.canvas.painted, 1);
  assert.deepEqual([h.canvas.width, h.canvas.height], oldSize);
  assert.equal(h.tree.props['data-focused-page-loading'], '');
  h.tasks.at(-1).finish(); await h.flush();
  assert.equal(h.canvas.painted, 2);
  assert.equal(h.tree.props['data-focused-page-loading'], undefined);
  h.unmount();
});

test('rapid page changes discard stale renders, including completion after unmount', async () => {
  const h = harness(); await h.flush(); h.tasks[0].finish(); await h.flush();
  await h.move(2); const second = h.tasks.at(-1);
  await h.move(3); const third = h.tasks.at(-1);
  assert.equal(second.cancelled, true);
  second.finish(); await h.flush(); assert.equal(h.canvas.painted, 1);
  third.finish(); await h.flush(); assert.equal(h.canvas.painted, 3);
  await h.move(4); const fourth = h.tasks.at(-1); h.unmount(); fourth.finish();
  await Promise.resolve(); assert.equal(h.canvas.painted, 3);
});

test('WEB retains direct canvas rendering', async () => {
  const h = harness(false); await h.flush();
  assert.equal(h.tasks[0].target, h.canvas);
  h.tasks[0].finish(); await h.flush(); assert.equal(h.canvas.painted, 1); h.unmount();
});

function canvasElement(tree) {
  if (!React.isValidElement(tree)) return null;
  if (tree.type === 'canvas') return tree;
  return React.Children.toArray(tree.props.children).map(canvasElement).find(Boolean) ?? null;
}

test('MOBILE reveals a newly painted PDF page once, while retry and revisiting keep paint immediate', async () => {
  const presentedPages = new Set();
  const h = harness(true, true, false, presentedPages); await h.flush();
  assert.equal(canvasElement(h.tree).props['data-mobile-media-reveal'], undefined);
  h.tasks[0].finish(); await h.flush();
  assert.equal(canvasElement(h.tree).props['data-mobile-media-reveal'], '');
  assert.doesNotMatch(canvasElement(h.tree).props.className, /premium-media-ready|transition-opacity/);
  assert.deepEqual([...presentedPages], [1]);
  const renderCount = h.tasks.length;
  await h.setProps({ zoom: 2.5 });
  assert.equal(h.tasks.length, renderCount, 'Zoom must not repaint or restart a page reveal');
  assert.equal(canvasElement(h.tree).props.style.width, '975px');
  await h.retry();
  assert.equal(h.canvas.painted, 1);
  h.tasks.at(-1).finish(); await h.flush();
  assert.equal(canvasElement(h.tree).props['data-mobile-media-reveal'], undefined);
  await h.move(2); h.tasks.at(-1).finish(); await h.flush();
  assert.equal(canvasElement(h.tree).props['data-mobile-media-reveal'], '');
  await h.move(1); h.tasks.at(-1).finish(); await h.flush();
  assert.equal(canvasElement(h.tree).props['data-mobile-media-reveal'], undefined);
  h.unmount();
  const remounted = harness(true, true, false, presentedPages); await remounted.flush();
  remounted.tasks[0].finish(); await remounted.flush();
  assert.equal(canvasElement(remounted.tree).props['data-mobile-media-reveal'], undefined,
    'Overview/focused remounts share presentation history within the same document');
  remounted.unmount();
});

test('MOBILE off-screen canvas recycling does not replay the page reveal; WEB keeps its existing classes', async () => {
  const mobile = harness(true, false); await mobile.flush(); await mobile.intersect(true);
  mobile.tasks[0].finish(); await mobile.flush();
  assert.equal(canvasElement(mobile.tree).props['data-mobile-media-reveal'], '');
  await mobile.intersect(false); assert.equal(mobile.canvas.width, 0);
  await mobile.intersect(true); mobile.tasks.at(-1).finish(); await mobile.flush();
  assert.equal(canvasElement(mobile.tree).props['data-mobile-media-reveal'], undefined);
  mobile.unmount();
  const web = harness(false); await web.flush();
  assert.equal(canvasElement(web.tree).props.className, 'block premium-focused-media m-auto max-w-none bg-white transition-opacity duration-[var(--m-base)] opacity-0');
  web.tasks[0].finish(); await web.flush();
  assert.equal(canvasElement(web.tree).props.className, 'block premium-focused-media m-auto max-w-none bg-white transition-opacity duration-[var(--m-base)] premium-media-ready opacity-100');
  assert.equal(canvasElement(web.tree).props['data-mobile-media-reveal'], undefined);
  web.unmount();
});

test('mobile failed-page recovery retries in place while preserving paint, zoom and saved pan', async () => {
  const h = harness(); await h.flush(); h.tasks[0].finish(); await h.flush();
  await h.setProps({ focusMemoryKey: 'reader:page:2', zoom: 2.5 });
  await h.move(2); h.tasks.at(-1).fail(); await h.flush();
  const identity = h.recovery.identity, oldCanvas = h.canvas;
  assert.equal(h.recovery.failed, true); assert.equal(h.recovery.enabled, true);
  h.tree.props.onScroll({ currentTarget: { scrollTop: 0, scrollLeft: 0 } });
  assert.equal(h.memoryWrites.length, 0, 'failed content must not overwrite saved pan with clamped offsets');
  await h.retry();
  assert.equal(h.canvas, oldCanvas); assert.equal(h.canvas.painted, 1);
  assert.equal(h.recovery.identity, identity);
  assert.equal(h.recovery.loading, true);
  h.tasks.at(-1).finish(); await h.flush();
  assert.equal(h.canvas.painted, 2); assert.equal(h.recovery.failed, false);
  assert.equal(h.recovery.loading, false, 'replacement must be ready before accepting scroll writes');
  assert.equal(h.host.scrollTop, 140); assert.equal(h.host.scrollLeft, 70);
  const canvases = [];
  function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === 'canvas') canvases.push(node); React.Children.forEach(node.props?.children, visit); }
  visit(h.tree);
  assert.equal(canvases[0].props.style.width, '975px');
  h.tree.props.onScroll({ currentTarget: { scrollTop: 170, scrollLeft: 90 } });
  assert.equal(h.memoryWrites[0][0], 'reader:page:2');
  assert.deepEqual({ ...h.memoryWrites[0][1] }, { scrollTop: 170, scrollLeft: 90 });
  h.unmount();
});

test('WEB page recovery remains disabled and manual retry cancels any queued mobile intent', async () => {
  const web = harness(false); await web.flush(); web.tasks[0].fail(); await web.flush();
  assert.equal(web.recovery.enabled, false);
  const buttons = [];
  function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === 'button') buttons.push(node); React.Children.forEach(node.props?.children, visit); }
  visit(web.tree);
  buttons.find(node => node.props['aria-label'] === 'Retry Work, page 1').props.onClick();
  await web.flush();
  assert.equal(web.recoveryCancels, 1); assert.equal(web.tasks.length, 2);
  web.unmount();
});

test('failed replacements preserve the last paint and expose a retry instead of a white page', async () => {
  const h = harness(); await h.flush(); h.tasks[0].finish(); await h.flush();
  await h.move(2); h.tasks.at(-1).fail(); await h.flush();
  assert.equal(h.canvas.painted, 1);
  const labels = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    labels.push(node.props?.['aria-label']); React.Children.forEach(node.props?.children, visit);
  }
  visit(h.tree); assert.ok(labels.includes('Retry Work, page 2')); h.unmount();
});

test('mobile overview loads only nearby pages and frees canvases when they leave the viewport', async () => {
  const h = harness(true, false); await h.flush();
  assert.equal(h.tasks.length, 0);
  assert.equal(h.canvas.width, 0);
  await h.intersect(true);
  assert.equal(h.tasks.length, 1);
  h.tasks[0].finish(); await h.flush();
  assert.ok(h.canvas.width > 0);
  assert.equal(h.tasks[0].target.width, 0);
  await h.intersect(false);
  assert.equal(h.canvas.width, 0);
  assert.equal(h.canvas.height, 0);
  await h.intersect(true);
  assert.equal(h.tasks.length, 2);
  h.unmount();
});

test('WEB overview waits for its reader viewport, releases departed paint and cancels stale work', async () => {
  let visible, unsubscribed = 0;
  const h = harness(false, false, false, new Set(), { observeOverviewPage(host, callback) {
    assert.equal(host, h.host); visible = callback;
    return () => { unsubscribed++; };
  } });
  await h.flush();
  assert.equal(h.tasks.length, 0);
  assert.equal(h.canvas.width, 0);
  assert.equal(nodesWithClass(h.tree, 'premium-media-loading-mark').length, 0, 'Distant pages do not animate loading marks');
  visible(true); await h.flush();
  assert.equal(h.tasks.length, 1);
  assert.equal(h.tasks[0].target, h.canvas, 'Desktop keeps its direct visible canvas');
  h.tasks[0].finish(); await h.flush();
  const ratio = h.tree.props.style.aspectRatio;
  assert.equal(h.tree.props['data-project-page-ready'], true);
  visible(false); await h.flush();
  assert.equal(h.canvas.width, 0); assert.equal(h.canvas.height, 0);
  assert.equal(h.tree.props.style.aspectRatio, ratio, 'Recycling preserves the learned page geometry');
  assert.equal(canvasElement(h.tree).props.style, undefined, 'Offscreen pages can follow density changes without stale canvas dimensions');
  visible(true); await h.flush();
  const stale = h.tasks.at(-1);
  visible(false); await h.flush(); assert.equal(stale.cancelled, true);
  stale.finish(); await h.flush();
  assert.equal(h.tree.props['data-project-page-ready'], false, 'A late cancelled render never marks an offscreen page ready');
  visible(true); await h.flush(); h.tasks.at(-1).finish(); await h.flush();
  assert.equal(h.tree.props['data-project-page-ready'], true);
  h.unmount(); assert.equal(unsubscribed, 1);
});

function nodesWithClass(tree, name) {
  if (!React.isValidElement(tree)) return [];
  return [...(tree.props.className?.split(' ').includes(name) ? [tree] : []), ...React.Children.toArray(tree.props.children).flatMap(child => nodesWithClass(child, name))];
}

test('WEB overview caps active paints and queued cancellation never paints a departed page', async () => {
  const desktopQueue = sourceModule('src/components/media/pageRenderQueue.ts').createPageRenderQueue(2);
  const visibility = [], pages = [];
  for (let index = 0; index < 6; index++) {
    const h = harness(false, false, false, new Set(), { desktopQueue, observeOverviewPage(_host, callback) {
      visibility[index] = callback; return () => undefined;
    } });
    pages.push(h); await h.flush(); visibility[index](true); await h.flush();
  }
  assert.deepEqual(pages.map(h => h.tasks.length), [1, 1, 0, 0, 0, 0]);
  assert.equal(pages[2].canvas.width, 0, 'Queued desktop paints allocate pixels only when their render slot opens');
  visibility[2](false); await pages[2].flush();
  pages[0].tasks[0].finish(); await pages[0].flush();
  assert.equal(pages[2].tasks.length, 0); assert.equal(pages[3].tasks.length, 1);
  const focused = harness(false); await focused.flush();
  assert.equal(focused.tasks.length, 1, 'Focused desktop pages bypass overview work');
  focused.tasks[0].finish(); await focused.flush(); focused.unmount();
  for (const h of pages) { h.unmount(); for (const task of h.tasks) task.finish(); }
  await Promise.resolve();
});

test('synchronous PDF render failure becomes a retryable page rather than crashing the viewer', async () => {
  const h = harness(true, true, true); await h.flush();
  assert.equal(h.tasks.length, 0);
  const labels = [];
  function visit(node) { if (!node || typeof node !== 'object') return; labels.push(node.props?.['aria-label']); React.Children.forEach(node.props?.children, visit); }
  visit(h.tree); assert.ok(labels.includes('Retry Work, page 1')); h.unmount();
});
test('failed PDF replacement releases its temporary bitmap while keeping the visible paint', async () => {
  const h = harness(); await h.flush(); h.tasks[0].finish(); await h.flush();
  await h.move(2); const failed = h.tasks.at(-1); failed.fail(); await h.flush();
  assert.equal(h.canvas.painted, 1); assert.equal(failed.target.width, 0); assert.equal(failed.target.height, 0); h.unmount();
});
