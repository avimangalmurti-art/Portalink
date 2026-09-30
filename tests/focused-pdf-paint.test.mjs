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

function harness(retainCanvasWhileLoading = true) {
  const slots = [], effects = [], tasks = [];
  let cursor = 0, dirty = false, tree, props;
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
    require(name) {
      if (name === 'react') return hooks;
      if (name === './viewerMemory') return { readViewerMemory: () => ({}), updateViewerMemory() {} };
      if (name === '../../features/performance/rum') return { rumViewToken: () => null, markRumPdf() {} };
      return { InterfaceIcon: () => null, RotateCcwIcon: () => null };
    },
  });
  props = { projectId: 'project', attachmentId: 'pdf', label: 'Work', pageNumber: 1, enabled: true,
    isFocused: true, zoom: 1, retainCanvasWhileLoading, showMediaInteractions: false, onSettled() {},
    document: { getPage: async pageNumber => ({ pageNumber, cleanup() {},
      getViewport: ({ scale }) => ({ width: 600 * scale, height: (pageNumber === 1 ? 900 : 800) * scale }),
      render({ canvas: target }) {
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
