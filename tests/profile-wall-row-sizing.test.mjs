import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import vm from 'node:vm';
import ts from 'typescript';
import { TouchSensor } from '@dnd-kit/core';

const source = readFileSync(new URL('../src/components/profile/JustifiedImageWall.tsx', import.meta.url), 'utf8');

test('the incomplete profile row inherits the preceding row height when it fits', () => {
  assert.match(source, /const precedingRowHeight = rows\[rows\.length - 1\]\?\.height \?\? trailingRowHeight;/);
  assert.match(source, /const height = Math\.min\(precedingRowHeight, maximumFittingHeight\);/);
});

test('an inherited final-row height is capped before it can overflow', () => {
  assert.match(source, /const available = width - GAP \* \(current\.length - 1\);/);
  assert.match(source, /const maximumFittingHeight = available \/ ratioSum;/);
  assert.match(source, /width: height \* entry\.ratio/);
});

const compiled = new Map();
function wallHarness(presentation, reorderMode, { width = 390, columns = 3, selectedColumns, items = [{ key: 'a', ratio: 1, content: 'A' }, { key: 'b', ratio: 1, content: 'B' }], onColumnsChange } = {}) {
  let starts = 0, zoomEnabled;
  const imports = [], modules = new Map();
  const placeholder = new Proxy({}, { get: (_, key) => key });
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(new URL(`../src/components/profile/${file}.tsx`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText);
    const exports = {}; modules.set(file, exports);
    vm.runInNewContext(compiled.get(file), { exports, require(name) {
      imports.push(name);
      if (name === 'react') return { ...React, useMemo: fn => fn(), lazy: () => function LazyReorder(props) { return load('ReorderableImageWall').ReorderableImageWall(props); } };
      if (name === '@dnd-kit/core') return { DndContext: 'DndContext', PointerSensor: 'Pointer', TouchSensor: 'Touch', MouseSensor: 'Mouse', KeyboardSensor: 'Keyboard', useSensor: (sensor, options) => ({ sensor, options }), useSensors: (...sensors) => sensors };
      if (name === '@dnd-kit/sortable') return { SortableContext: 'SortableContext', useSortable: () => ({ listeners: { onTouchStart: () => starts++, onMouseDown: () => starts++ } }) };
      if (name === '@dnd-kit/utilities') return { CSS: { Transform: { toString() {} } } };
      if (name === 'framer-motion') return { useReducedMotion: () => false };
      if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
      if (name.endsWith('/SingleTouchSensor')) return { SingleTouchSensor: 'Touch' };
      if (name.endsWith('/useElementSize')) return { useElementSize: () => ({ width, ref: 'measured-list' }) };
      if (name.endsWith('/useContentZoom')) return { useContentZoom: (base, enabled, resetKey, callback) => { zoomEnabled = enabled; assert.equal(callback, onColumnsChange); return { columns: selectedColumns ?? Math.max(2, Math.min(13, base)), ref: 'pinch-root' }; } };
      if (name === './ImageWallLayout') return load('ImageWallLayout');
      return placeholder;
    } });
    return exports;
  }
  const rawTree = load('JustifiedImageWall').JustifiedImageWall({ columns, onColumnsChange, label: 'Projects', items, reorderMode });
  function renderLayouts(node) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(renderLayouts);
    if (['ImageWallRows', 'LazyReorder'].includes(node.type?.name)) return renderLayouts(node.type(node.props));
    if (node.type === React.Fragment) return React.Children.toArray(node.props.children).flatMap(child => renderLayouts(child));
    if (!node.props?.children) return node;
    return React.cloneElement(node, undefined, ...React.Children.toArray(node.props.children).flatMap(renderLayouts));
  }
  const tree = renderLayouts(rawTree);
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
  return { context: nodes(tree).find(node => node.type === 'DndContext'), card: nodes(tree).find(node => /^(Sortable|Static)WallCard$/.test(node.type?.name)), list: nodes(tree).find(node => node.props['data-profile-wall-columns']), nodes, starts: () => starts, zoomEnabled, imports, rawTree, renderLayouts };
}

test('sensor dependencies stay stable across WEB, mobile browsing, holding, dragging and saving', () => {
  for (const presentation of ['web', 'mobile']) for (const reorderMode of [undefined, { enabled: false, onStart() {} }, { enabled: true }, { enabled: true, disabled: true }]) {
    const h = wallHarness(presentation, reorderMode);
    assert.equal(h.zoomEnabled, !reorderMode?.enabled, 'Reordering must not also resize the grid');
    if (!reorderMode) { assert.equal(h.context, undefined); continue; }
    const sensors = h.context.props.sensors;
    assert.equal(sensors.length, 3);
    assert.equal(sensors[0].sensor, presentation === 'mobile' && reorderMode ? 'Touch' : 'Pointer');
    if (sensors[0].sensor === 'Touch') {
      assert.deepEqual({ ...sensors[0].options.activationConstraint }, { delay: reorderMode.enabled ? 250 : 450, tolerance: 8 });
    } else assert.deepEqual({ ...sensors[0].options.activationConstraint }, { distance: 6 });
  }
});

test('mobile reorder cards allow vertical scrolling while WEB retains its drag surface', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = wallHarness(presentation, { enabled: true });
    const card = h.card.type(h.card.props);
    const activator = h.nodes(card).find(node => node.props.onTouchStart);
    assert.ok(activator.props.className.includes(presentation === 'mobile' ? 'touch-pan-y' : 'touch-none'));
    assert.equal(h.context.props.autoScroll, undefined, 'Keep dnd-kit edge scrolling enabled by default');
  }
});

test('a swipe during reorder stays native; a stationary hold picks up the project', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  class Surface {
    listeners = new Map();
    addEventListener(name, listener) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]); }
    removeEventListener(name, listener) { this.listeners.set(name, (this.listeners.get(name) ?? []).filter(fn => fn !== listener)); }
  }
  class Document extends Surface { getSelection() { return null; } }
  class Element extends Surface { nodeType = 1; }
  class TouchEvent {
    cancelable = true; prevented = false;
    constructor(target, y = 0) { this.target = target; this.touches = [{ clientX: 0, clientY: y }]; }
    preventDefault() { this.prevented = true; }
  }
  const win = Object.assign(new Surface(), { Document, HTMLElement: Element, SVGElement: Element, TouchEvent, EventTarget: Surface });
  const doc = Object.assign(new Document(), { defaultView: win });
  const target = Object.assign(new Element(), { ownerDocument: doc });
  const options = wallHarness('mobile', { enabled: true }).context.props.sensors[0].options;
  let starts = 0, ends = 0, cancels = 0;
  const create = () => new TouchSensor({ active: 'a', event: new TouchEvent(target), options,
    onPending() {}, onAbort() {}, onMove() {}, onStart() { starts++; }, onCancel() { cancels++; }, onEnd() { ends++; },
  });
  const swipe = create();
  const move = new TouchEvent(target, 24);
  swipe.handleMove(move);
  t.mock.timers.tick(300);
  assert.equal(starts, 0);
  assert.equal(cancels, 1);
  assert.equal(move.prevented, false, 'Scrolling remains a browser gesture');
  const hold = create();
  t.mock.timers.tick(249); assert.equal(starts, 0);
  t.mock.timers.tick(1); assert.equal(starts, 1);
  const drag = new TouchEvent(target, 80);
  hold.handleMove(drag);
  assert.equal(drag.prevented, true, 'After pickup, movement belongs to the drag');
  hold.handleEnd();
  assert.equal(ends, 1);
});

test('holding starts only on artwork, then a completed drop moves the selected project', () => {
  const calls = [];
  const mode = { enabled: false, onStart: () => calls.push('start'), onMove: (from, to) => calls.push([from, to]) };
  const h = wallHarness('mobile', mode);
  const card = h.card.type(h.card.props);
  const activator = h.nodes(card).find(node => node.props.onTouchStart);
  activator.props.onTouchStart({ target: { closest: () => null } });
  assert.equal(h.starts(), 0, 'Metrics, menus and editors do not start a hold');
  activator.props.onTouchStart({ target: { closest: () => ({}) } });
  assert.equal(h.starts(), 1);
  h.context.props.onDragStart();
  assert.deepEqual(calls, ['start']);
  mode.enabled = true;
  const active = wallHarness('mobile', mode);
  active.context.props.onDragEnd({ active: { id: 'a' }, over: { id: 'b' } });
  assert.deepEqual(calls, ['start', ['a', 'b']]);
  mode.disabled = true;
  wallHarness('mobile', mode).context.props.onDragEnd({ active: { id: 'b' }, over: { id: 'a' } });
  assert.equal(calls.length, 2);
});

test('mobile Home retains columns and source order while the sidebar scales each row to fit', () => {
  const items = Array.from({ length: 5 }, (_, index) => ({ key: `project-${index}`, ratio: 1, content: index }));
  for (const width of [351, 330, 304, 295]) {
    const h = wallHarness('mobile', undefined, { width, columns: 5, items });
    assert.equal(h.list.props['data-profile-wall-columns'], 5);
    const cards = h.nodes(h.list).filter(node => /^(Sortable|Static)WallCard$/.test(node.type?.name));
    assert.deepEqual(cards.map(card => card.props.item.key), items.map(item => item.key));
    assert.ok(Math.abs(cards.reduce((sum, card) => sum + card.props.item.width, 4 * (items.length - 1)) - width) < 0.0001);
  }
});

test('Home and profile render every saved density exactly during browsing and reorder at any width', () => {
  const items = Array.from({ length: 30 }, (_, index) => ({ key: `project-${index}`, ratio: 0.6 + index % 4 * 0.4, content: index }));
  for (const mode of ['mobile', 'web']) for (const width of [224, 390, 1280]) for (let columns = 2; columns <= 13; columns++) {
    for (const enabled of [false, true]) {
      const h = wallHarness(mode, { enabled }, { width, columns, items, onColumnsChange() {} });
      assert.equal(h.list.props['data-profile-wall-columns'], columns);
      const rows = h.nodes(h.list).filter(node => node.props.className === 'flex w-full');
      const completeRows = rows.slice(0, Math.floor(items.length / columns));
      for (const row of completeRows) {
        const cards = React.Children.toArray(row.props.children);
        assert.equal(cards.length, columns);
        assert.ok(Math.abs(cards.reduce((sum, card) => sum + card.props.item.width, 4 * (columns - 1)) - width) < 0.0001);
      }
      const cards = h.nodes(h.list).filter(node => /^(Sortable|Static)WallCard$/.test(node.type?.name));
      assert.deepEqual(cards.map(card => card.props.item.key), items.map(item => item.key));
    }
  }
});


test('ordinary Home/profile walls load no drag modules, while lazy fallback preserves measured rows and pinch selection', () => {
  const items = Array.from({ length: 8 }, (_, index) => ({ key: String(index), ratio: 0.8 + index / 10, content: index }));
  for (const presentation of ['mobile', 'web']) {
    const normal = wallHarness(presentation, undefined, { columns: 3, selectedColumns: 5, items });
    assert.equal(normal.imports.some(name => name.startsWith('@dnd-kit/') || name.endsWith('/SingleTouchSensor')), false);
    assert.equal(normal.context, undefined);
    assert.equal(normal.zoomEnabled, true);
    assert.equal(normal.list.props['data-profile-wall-columns'], 5);
    const ordering = wallHarness(presentation, { enabled: true }, { columns: 3, selectedColumns: 5, items });
    const suspense = ordering.nodes(ordering.rawTree).find(node => node.type === React.Suspense);
    assert.ok(suspense, 'The first ordering action alone renders the deferred module.');
    const fallback = ordering.renderLayouts(suspense.props.fallback);
    const fallbackCards = fallback.flatMap(ordering.nodes).filter(node => node.type?.name === 'StaticWallCard');
    const activeCards = ordering.nodes(ordering.list).filter(node => node.type?.name === 'SortableWallCard');
    assert.deepEqual(fallbackCards.map(card => ({ ...card.props.item })), activeCards.map(card => ({ ...card.props.item })));
    assert.equal(ordering.list.ref, normal.list.ref, 'Measurement stays on the list outside the loading boundary.');
    assert.equal(ordering.rawTree.ref, normal.rawTree.ref, 'The pinch root stays mounted.');
    assert.equal(ordering.zoomEnabled, false);
  }
});
