import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function harness(file, storage = new Map()) {
  let cursor = 0;
  const slots = [];
  const react = { ...React, useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/presentation/mobile/${file}.tsx`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('/projectGridDensity')) return { DEFAULT_PROJECT_GRID_COLUMNS: 2, MIN_PROJECT_GRID_COLUMNS: 2, MAX_PROJECT_GRID_COLUMNS: 13 };
    throw new Error(name);
  }, window: { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } } });
  return props => { cursor = 0; return exports[file](props); };
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];

test('visible layout control exposes every density and useful presets, then dismisses', () => {
  const render = harness('MobileGalleryControls'), changes = [];
  const props = { columns: 7, onChange: value => changes.push(value) };
  let tree = render(props);
  assert.equal(nodes(tree).some(node => node.type === 'select'), false);
  nodes(tree).find(node => node.type === 'button').props.onClick();
  tree = render(props);
  assert.deepEqual(nodes(tree).filter(node => node.type === 'option').map(node => node.props.value), Array.from({ length: 12 }, (_, i) => i + 2));
  nodes(tree).find(node => node.type === 'select').props.onChange({ target: { value: '6' } });
  for (const label of ['Comfortable', 'Compact', 'Reset']) nodes(tree).find(node => node.type === 'button' && node.props.children === label).props.onClick();
  assert.deepEqual(changes, [6, 2, 4, 2]);
  nodes(tree).find(node => node.type === 'button' && node.props.children === 'Done').props.onClick();
  assert.equal(nodes(render(props)).some(node => node.type === 'select'), false);
});

test('project gesture hint stays dismissed on later projects without storing account data', () => {
  const storage = new Map(), render = harness('MobileProjectGestureHint', storage);
  nodes(render()).find(node => node.type === 'button').props.onClick();
  assert.equal(render(), null);
  assert.equal(harness('MobileProjectGestureHint', storage)(), null);
  assert.deepEqual([...storage.values()], ['dismissed']);
});
