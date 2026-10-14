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
  const slots = [], listeners = new Map(), timers = new Map(), commits = [];
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
  const density = compile('../src/utils/projectGridDensity.ts', () => ({}));
  const { useContentZoom } = compile('../src/hooks/useContentZoom.ts', name => name.endsWith('/pinchGesture') ? pinch : name.endsWith('/projectGridDensity') ? density : react, {
    window: { setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout: id => timers.delete(id) },
  });
  const element = {
    addEventListener(type, fn) { assert.equal(listeners.has(type), false); listeners.set(type, fn); },
    removeEventListener(type, fn) { assert.equal(listeners.get(type), fn); listeners.delete(type); },
  };
  const render = (base = 4, enabled = true, resetKey, onColumnsChange = value => commits.push(value), projectColumns) => {
    cursor = 0; effects = [];
    const result = useContentZoom(base, enabled, resetKey, onColumnsChange, projectColumns);
    result.ref.current = element;
    effects.forEach(fn => fn());
    return result;
  };
  return { render, listeners, timers, commits,
    flush(delay) { for (const [id, timer] of timers) if (timer.delay === delay) { timers.delete(id); timer.fn(); } },
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

test('explicit gallery controls share density commits and supersede a pending gesture', () => {
  const h = harness(); h.render(4, true, 4);
  h.wheel(1);
  h.render(4, true, 4).chooseColumns(2);
  assert.equal(h.render(4, true, 4).columns, 2);
  assert.deepEqual(h.commits, [2]);
  h.flush(220);
  assert.deepEqual(h.commits, [2], 'old wheel timer cannot overwrite the visible choice');
  h.render(4, true, 4).chooseColumns(99);
  assert.equal(h.render(4, true, 4).columns, 13);
  h.render(4, false, 4).chooseColumns(2);
  assert.equal(h.render(4, false, 4).columns, 13, 'reorder keeps density controls disabled');
  h.cleanup();
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

test('reorder entry, dropping, saving and cancelling preserve the active five-column layout', () => {
  const h = harness(); h.render(4, true, 4);
  h.wheel(1);
  assert.equal(h.render(4, true, 4).columns, 5);
  assert.equal(h.render(4, false, 4).columns, 5, 'Entering reorder keeps the chosen layout');
  assert.equal(h.listeners.size, 0); assert.equal(h.timers.size, 0);
  assert.deepEqual(h.commits, [5], 'A pending wheel choice is saved before reorder starts');
  assert.equal(h.render(4, false, 4).columns, 5, 'A drop does not alter layout');
  assert.equal(h.render(4, false, 4).isAdjusting, false);
  assert.equal(h.render(4, true, 4).columns, 5, 'Done, Cancel and outside-save re-enable gestures without a reset');
  h.render(4, false, 4); assert.equal(h.render(4, true, 4).columns, 5);
  const resumed = h.render(5, true, 5);
  assert.equal(resumed.columns, 5, 'Persisted density agrees with the in-memory choice');
  resumed.reset(); assert.equal(h.render(5, true, 5).columns, 5);
  assert.equal(h.render(5, true, 5).isZoomed, false);
  h.cleanup();
});

test('saved densities are clamped and remain exact when gestures are disabled', () => {
  for (const [value, expected] of [[-4, 2], [2, 2], [5, 5], [13, 13], [30, 13], [NaN, 2]]) {
    const h = harness();
    assert.equal(h.render(value, false).columns, expected);
    assert.equal(h.commits.length, 0, 'Rendering an owner setting does not write it back');
    h.cleanup();
  }
});

test('a pinch commits only its final density, with spread enlarging and pinch shrinking cards', () => {
  const h = harness(); h.render(5, true, 5);
  const touches = distance => [{ clientX: 0, clientY: 0 }, { clientX: distance, clientY: 0 }];
  const move = distance => h.listeners.get('touchmove')({ touches: touches(distance), cancelable: true, preventDefault() {} });
  h.listeners.get('touchstart')({ touches: touches(100) });
  move(125); assert.equal(h.render(5, true, 5).columns, 4);
  move(64); assert.equal(h.render(5, true, 5).columns, 7);
  assert.deepEqual(h.commits, []);
  h.listeners.get('touchend')(); assert.deepEqual(h.commits, [7]);
  h.listeners.get('touchend')(); assert.deepEqual(h.commits, [7], 'The same gesture is not saved twice');
  h.cleanup();
});

test('modified wheel commits once after its burst, while a new owner setting rejects an old pending commit', () => {
  const h = harness(); h.render(3, true, 3);
  h.wheel(1); h.wheel(1); h.render(3, true, 3);
  assert.deepEqual(h.commits, []);
  h.flush(220); assert.deepEqual(h.commits, [5]);
  h.wheel(1); h.render(8, true, 8);
  assert.deepEqual(h.commits, [5], 'An old delayed callback must not overwrite a newer saved setting');
  assert.equal(h.render(8, true, 8).columns, 8);
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
      if (name.endsWith('/usePresentation')) return { usePresentation: () => 'web' };
      if (name.endsWith('/WebGalleryControls')) return { WebGalleryControls: 'WebGalleryControls' };
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

test('An optional fit bounds gestures without saving its fallback; ordinary galleries retain thirteen',()=>{
 const h=harness(),fit=value=>value<=2?value:2;const view=h.render(13,true,13,undefined,fit);
 assert.equal(view.columns,2);for(let n=0;n<5;n++)h.wheel(1);
 assert.equal(h.render(13,true,13,undefined,fit).columns,2);h.flush(220);h.cleanup();assert.deepEqual(h.commits,[]);
 const plain=harness();assert.equal(plain.render(13).columns,13);
});
