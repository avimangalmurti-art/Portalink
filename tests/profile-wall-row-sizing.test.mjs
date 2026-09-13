import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import vm from 'node:vm';
import ts from 'typescript';

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

function wallHarness(presentation, reorderMode, { width = 390, columnCapacityWidth, scaleColumns = columns => columns } = {}) {
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
      if (name.endsWith('/useContentZoom')) return { useContentZoom: enabled => { zoomEnabled = enabled; return { scaleColumns }; } };
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
    if (sensors[0].sensor === 'Touch' && !reorderMode.enabled) {
      assert.deepEqual({ ...sensors[0].options.activationConstraint }, { delay: 450, tolerance: 8 });
    } else assert.deepEqual({ ...sensors[0].options.activationConstraint }, { distance: 6 });
  }
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

test('physical narrow screens and intentional zoom still adapt; WEB ignores the mobile capacity basis', () => {
  const columns = (mode, options) => wallHarness(mode, undefined, options).list.props['data-profile-wall-columns'];
  assert.equal(columns('mobile', { width: 224, columnCapacityWidth: 280 }), 1);
  assert.equal(columns('mobile', { width: 295, columnCapacityWidth: 351, scaleColumns: () => 1 }), 1);
  assert.equal(columns('mobile', { width: 295 }), 1, 'Profile and City keep their existing sizing');
  assert.equal(columns('web', { width: 351, columnCapacityWidth: 100 }), 3);
});
