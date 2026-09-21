import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

function compile(path, require, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require, ...globals });
  return exports;
}

function harness() {
  const slots = [], listeners = new Map(), timers = new Map();
  let cursor = 0, effects = [], timerId = 0;
  const react = {
    useCallback: fn => fn,
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useEffect(effect, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((dep, j) => dep !== previous.deps[j])) {
        effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
      }
    },
  };
  const pinch = compile('../src/utils/pinchGesture.ts', () => ({}));
  const { useContentZoom } = compile('../src/hooks/useContentZoom.ts', name => name.endsWith('/pinchGesture') ? pinch : react, {
    window: { setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) },
  });
  const element = {
    addEventListener(type, fn) { assert.equal(listeners.has(type), false); listeners.set(type, fn); },
    removeEventListener(type, fn) { assert.equal(listeners.get(type), fn); listeners.delete(type); },
  };
  const render = (base = 4, enabled = true, resetKey) => {
    cursor = 0; effects = [];
    const result = useContentZoom(base, enabled, resetKey);
    result.ref.current = element;
    effects.forEach(fn => fn());
    return result;
  };
  return { render, listeners, timers,
    wheel(deltaY) { listeners.get('wheel')({ ctrlKey: true, deltaY, preventDefault() {} }); },
    cleanup() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('every starting density can reach both endpoints, including multiple events before rendering', () => {
  for (let base = 2; base <= 13; base++) {
    const h = harness(); h.render(base);
    for (let step = 0; step < 20; step++) h.wheel(1);
    assert.equal(h.render(base).columns, 13);
    for (let step = 0; step < 20; step++) h.wheel(-1);
    assert.equal(h.render(base).columns, 2);
    h.wheel(0); assert.equal(h.render(base).columns, 2);
    h.cleanup(); assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
  }
});

test('responsive resize retains viewer density; creator density change resets it and the readout', () => {
  const h = harness(); h.render(4, true, 4);
  h.wheel(1); assert.equal(h.render(4, true, 4).columns, 5);
  assert.equal(h.render(2, true, 4).columns, 5);
  assert.equal(h.render(2, true, 4).isAdjusting, true);
  assert.equal(h.render(2, true, 7).columns, 2);
  assert.equal(h.render(2, true, 7).isAdjusting, false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.render(4, true, 4).columns, 4, 'Old saved setting cannot revive a stale selection');
  h.cleanup();
});

test('reordering temporarily uses readable baseline and reset returns to current responsive size', () => {
  const h = harness(); h.render(4, true, 4);
  for (let i = 0; i < 10; i++) h.wheel(1);
  assert.equal(h.render(4, true, 4).columns, 13);
  assert.equal(h.render(2, false, 4).columns, 2);
  assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
  assert.equal(h.render(2, false, 4).isAdjusting, false);
  const resumed = h.render(2, true, 4);
  assert.equal(resumed.columns, 13);
  resumed.reset(); assert.equal(h.render(2, true, 4).columns, 2);
  assert.equal(h.render(2, true, 4).isZoomed, false);
  h.cleanup();
});

test('a cancelled pinch stops changing density and a new pinch starts at the current selection', () => {
  const h = harness(); h.render(4);
  const touches = distance => [{ clientX: 0, clientY: 0 }, { clientX: distance, clientY: 0 }];
  const move = distance => h.listeners.get('touchmove')({ touches: touches(distance), cancelable: true, preventDefault() {} });
  h.listeners.get('touchstart')({ touches: touches(100) });
  move(64); assert.equal(h.render(4).columns, 6);
  h.listeners.get('touchcancel')(); move(20); assert.equal(h.render(4).columns, 6);
  h.listeners.get('touchstart')({ touches: touches(100) });
  move(125); assert.equal(h.render(4).columns, 5);
  h.cleanup();
});

test('Home uses one project per track at every density, preserving project order and content', () => {
  const items = Array.from({ length: 26 }, (_, i) => ({ key: `project-${i}`, content: `Cover ${i}` }));
  for (let columns = 2; columns <= 13; columns++) {
    const { BentoFeedGrid } = compile('../src/components/home/BentoFeedGrid.tsx', name => {
      if (name === 'react') return { ...React, useState: value => [value, () => {}], useCallback: fn => fn };
      if (name.endsWith('/useContentZoom')) return { useContentZoom: () => ({ columns }) };
      if (name.endsWith('/useElementSize')) return { useElementSize: () => ({ width: 1000 }) };
      if (name.endsWith('/ZoomReadout')) return { ZoomReadout: 'ZoomReadout' };
      return {};
    });
    const outer = BentoFeedGrid({ items });
    const grid = React.Children.toArray(outer.props.children).find(node => node.props['data-project-grid-columns']);
    assert.equal(grid.props['data-project-grid-columns'], columns);
    assert.equal(grid.props.style.gridTemplateColumns, `repeat(${columns}, minmax(0, 1fr))`);
    const cells = React.Children.toArray(grid.props.children);
    assert.deepEqual(cells.map(cell => cell.props.cellKey), items.map(item => item.key));
    cells.forEach((cell, i) => { assert.equal(cell.props.span, 1); assert.equal(cell.props.children, items[i].content); });
  }
});
