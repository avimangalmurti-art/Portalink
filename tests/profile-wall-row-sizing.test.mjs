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

function wallHarness(presentation, reorderMode, { width = 390, columnCapacityWidth, selectedColumns } = {}) {
  let starts = 0, zoomEnabled;
  const placeholder = new Proxy({}, { get: (_, key) => key });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, require(name) {
      if (name === 'react') return { ...React, useMemo: fn => fn() };
      if (name === '@dnd-kit/core') return { DndContext: 'DndContext', PointerSensor: 'Pointer', TouchSensor: 'Touch', MouseSensor: 'Mouse', KeyboardSensor: 'Keyboard', useSensor: (sensor, options) => ({ sensor, options }), useSensors: (...sensors) => sensors };
      if (name === '@dnd-kit/sortable') return { SortableContext: 'SortableContext', useSortable: () => ({ listeners: { onTouchStart: () => starts++, onMouseDown: () => starts++ } }) };
      if (name === '@dnd-kit/utilities') return { CSS: { Transform: { toString() {} } } };
      if (name === 'framer-motion') return { useReducedMotion: () => false };
      if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
      if (name.endsWith('/SingleTouchSensor')) return { SingleTouchSensor: 'Touch' };
      if (name.endsWith('/useElementSize')) return { useElementSize: () => ({ width }) };
      if (name.endsWith('/useContentZoom')) return { useContentZoom: (base, enabled) => { zoomEnabled = enabled; return { columns: enabled && selectedColumns !== undefined ? selectedColumns : Math.max(2, Math.min(13, base)) }; } };
      return placeholder;
    },
  });
  const tree = exports.JustifiedImageWall({ columns: 3, columnCapacityWidth, label: 'Projects', items: [{ key: 'a', ratio: 1, content: 'A' }, { key: 'b', ratio: 1, content: 'B' }], reorderMode });
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
  return { context: nodes(tree).find(node => node.type === 'DndContext'), card: nodes(tree).find(node => node.type?.name === 'SortableWallCard'), list: nodes(tree).find(node => node.props['data-profile-wall-columns']), nodes, starts: () => starts, zoomEnabled };
}

test('sensor dependencies stay stable across WEB, mobile browsing, holding, dragging and saving', () => {
  for (const presentation of ['web', 'mobile']) for (const reorderMode of [undefined, { enabled: false, onStart() {} }, { enabled: true }, { enabled: true, disabled: true }]) {
    const h = wallHarness(presentation, reorderMode);
    const sensors = h.context.props.sensors;
    assert.equal(h.zoomEnabled, !reorderMode?.enabled, 'Reordering must not also resize the grid');
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
  for (const width of [351, 330, 304, 295]) {
    const h = wallHarness('mobile', undefined, { width, columnCapacityWidth: 351 });
    assert.equal(h.list.props['data-profile-wall-columns'], 2);
    const cards = h.nodes(h.list).filter(node => node.type?.name === 'SortableWallCard');
    assert.deepEqual(cards.map(card => card.props.item.key), ['a', 'b']);
    assert.equal(cards.reduce((sum, card) => sum + card.props.item.width, 4), width);
  }
});

test('Home and profile walls honor 2–13 viewer columns even on narrow screens; WEB ignores mobile capacity', () => {
  const columns = (mode, options) => wallHarness(mode, undefined, options).list.props['data-profile-wall-columns'];
  assert.equal(columns('mobile', { width: 224, columnCapacityWidth: 280 }), 2);
  for (const mode of ['mobile', 'web']) for (const selectedColumns of [2, 7, 13]) {
    assert.equal(columns(mode, { width: 295, columnCapacityWidth: 351, selectedColumns }), selectedColumns);
  }
  assert.equal(columns('mobile', { width: 295 }), 2);
  assert.equal(columns('web', { width: 351, columnCapacityWidth: 100 }), 3);
});
