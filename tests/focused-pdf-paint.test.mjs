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

function harness(retainCanvasWhileLoading = true, focused = true, throwRender = false) {
  const slots = [], effects = [], tasks = [];
  const queuePageRender = sourceModule('src/components/media/pageRenderQueue.ts').createPageRenderQueue();
  let cursor = 0, dirty = false, tree, props, intersection;
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
      if (name === './pageRenderQueue') return {queuePageRender};
      if (name === './viewerMemory') return { readViewerMemory: () => ({}), updateViewerMemory() {} };
      if (name === '../../features/performance/rum') return { rumViewToken: () => null, markRumPdf() {} };
      return { InterfaceIcon: () => null, RotateCcwIcon: () => null };
    },
  });
  props = { projectId: 'project', attachmentId: 'pdf', label: 'Work', pageNumber: 1, enabled: true,
    isFocused: focused, zoom: 1, retainCanvasWhileLoading, showMediaInteractions: false, onSettled() {},
    document: { getPage: async pageNumber => ({ pageNumber, cleanup() {},
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
  return { canvas, tasks, flush, get tree() { return tree; },
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
