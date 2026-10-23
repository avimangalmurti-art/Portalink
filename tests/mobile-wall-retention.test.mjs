import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const items = () => [
  { key: 'first', ratio: 0.75, content: React.createElement('img', { src: '/first.webp' }) },
  { key: 'second', ratio: 1.5, content: React.createElement('img', { src: '/second.webp' }) },
  { key: 'third', ratio: 1, content: React.createElement('img', { src: '/third.webp' }) },
  { key: 'fourth', ratio: 0.8, content: React.createElement('img', { src: '/fourth.webp' }) },
];

// Render the real packing component repeatedly with retained hook slots. Only
// measurement/presentation inputs and downstream rendering are substituted.
function harness(initial = {}) {
  const slots = [], measureRef = { current: null }, pinchRef = { current: null };
  let cursor = 0, state = { presentation: 'mobile', width: 420, columns: 2, items: items(), ...initial };
  function ImageWallRows() { return null; }
  const same = (left, right) => left?.length === right?.length && left.every((value, index) => Object.is(value, right[index]));
  const react = { ...React,
    useRef(value) { const index = cursor++; slots[index] ??= { current: value }; return slots[index]; },
    useMemo(factory, dependencies) { const index = cursor++; if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, value: factory() }; return slots[index].value; },
  };
  const { JustifiedImageWall } = sourceModule('src/components/profile/JustifiedImageWall.tsx', {
    react,
    '../../hooks/useElementSize': { useElementSize: () => ({ ref: measureRef, width: state.width }) },
    '../../hooks/useContentZoom': { useContentZoom: columns => ({ columns, ref: pinchRef }) },
    '../ui/ZoomReadout': { ZoomReadout: () => null },
    '../../presentation/usePresentation': { usePresentation: () => state.presentation },
    '../../presentation/web/WebGalleryControls': { WebGalleryControls: () => null },
    './ImageWallLayout': { ImageWallRows, WALL_GAP: 4 },
    './ProjectPageBrowsingContext': { ProjectPageBrowsingProvider: 'page-browsing' },
  });
  function rowsNode(tree) {
    if (!tree || typeof tree !== 'object') return null;
    if (tree.type === ImageWallRows) return tree;
    for (const child of React.Children.toArray(tree.props?.children)) { const match = rowsNode(child); if (match) return match; }
    return null;
  }
  return {
    render(change = {}) {
      state = { ...state, ...change }; cursor = 0;
      const tree = JustifiedImageWall({ items: state.items, columns: state.columns, label: 'Projects', allowLayoutControls: false });
      const node = rowsNode(tree); assert.ok(node, 'The actual component must render its ImageWallRows contract.');
      return { tree, ...node.props };
    },
  };
}

const cards = view => view.rows.flatMap(row => row.items);
const geometry = view => view.rows.map(row => ({ height: row.height, justified: row.justified, cards: row.items.map(item => ({ key: item.key, ratio: item.ratio, width: item.width })) }));
function fillsFullRows(view, width, columns = 2) {
  for (const row of view.rows.filter(row => row.items.length === columns)) assert.ok(Math.abs(row.items.reduce((sum, item) => sum + item.width, 4 * (columns - 1)) - width) < 0.0001);
  for (const row of view.rows) {
    assert.ok(row.height > 0 && Number.isFinite(row.height));
    for (const item of row.items) assert.ok(Math.abs(item.width / row.height - item.ratio) < 0.0001, 'Retaining width must preserve each artwork ratio.');
  }
}

test('MOBILE a temporarily hidden measured wall keeps the same row dimensions and artwork identity', () => {
  const h = harness(), before = h.render(), hidden = h.render({ width: 0 });
  assert.deepEqual(geometry(hidden), geometry(before)); assert.equal(hidden.rows, before.rows, 'Unchanged effective width/items reuse the existing memoized rows.');
  assert.deepEqual(cards(hidden).map(item => item.key), cards(before).map(item => item.key));
  cards(hidden).forEach((item, index) => assert.equal(item.content, cards(before)[index].content));
  assert.equal(hidden.tree.ref, before.tree.ref, 'The pinch host remains stable.'); fillsFullRows(hidden, 420);
});

test('MOBILE a real positive resize updates the retained width used by the next hidden state', () => {
  const h = harness(), before = h.render(), resized = h.render({ width: 390 }), hidden = h.render({ width: 0 });
  assert.notDeepEqual(geometry(resized), geometry(before)); fillsFullRows(resized, 390);
  assert.deepEqual(geometry(hidden), geometry(resized)); assert.equal(hidden.rows, resized.rows); fillsFullRows(hidden, 390);
});

test('MOBILE an initially unmeasured wall has no rows until an actual positive width is known', () => {
  const h = harness({ width: 0 }), initial = h.render(), stillUnknown = h.render();
  assert.equal(initial.rows.length, 0); assert.equal(stillUnknown.rows.length, 0);
  const measured = h.render({ width: 420 }); assert.ok(measured.rows.length > 0); fillsFullRows(measured, 420);
});

test('WEB retains its existing positive-to-zero measurement behavior and drops the rows', () => {
  const h = harness({ presentation: 'web' }), measured = h.render(), hidden = h.render({ width: 0 });
  assert.ok(measured.rows.length > 0); fillsFullRows(measured, 420); assert.equal(hidden.rows.length, 0);
  const resized = h.render({ width: 1280 }); fillsFullRows(resized, 1280);
});

test('a MOBILE-to-WEB switch never reuses phone width and clears its authority before returning unmeasured', () => {
  const h = harness(); assert.ok(h.render().rows.length > 0);
  assert.equal(h.render({ presentation: 'web', width: 0 }).rows.length, 0);
  assert.equal(h.render({ presentation: 'mobile', width: 0 }).rows.length, 0);
  assert.ok(h.render({ width: 390 }).rows.length > 0); fillsFullRows(h.render({ width: 0 }), 390);
});

test('a WEB measurement does not become a retained MOBILE measurement before a phone width exists', () => {
  const h = harness({ presentation: 'web', width: 1280 }); fillsFullRows(h.render(), 1280);
  assert.equal(h.render({ presentation: 'mobile', width: 0 }).rows.length, 0);
});

test('MOBILE hidden walls recompute changed items instead of retaining stale artwork or order', () => {
  const h = harness(), initial = h.render(), replacement = [
    { key: 'new', ratio: 1.4, content: React.createElement('img', { src: '/new.webp' }) },
    initial.items[2], initial.items[0],
  ];
  const hidden = h.render({ width: 0, items: replacement });
  assert.deepEqual(Array.from(cards(hidden), item => item.key), ['new', 'third', 'first']);
  assert.equal(cards(hidden).some(item => item.key === 'second' || item.key === 'fourth'), false);
  cards(hidden).forEach((item, index) => assert.equal(item.content, replacement[index].content)); fillsFullRows(hidden, 420);
  const cleared = h.render({ items: [] }); assert.equal(cleared.rows.length, 0, 'Deleting all items while hidden must not preserve the old content.');
});

test('retained MOBILE width belongs to one mounted wall rather than another catalogue instance', () => {
  const measured = harness(); measured.render(); assert.ok(measured.render({ width: 0 }).rows.length > 0);
  const fresh = harness({ width: 0 }); assert.equal(fresh.render().rows.length, 0);
});
