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
    throw new Error(name);
  }, window: { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } } });
  return props => { cursor = 0; return exports[file](props); };
}
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];

test('project gesture hint stays dismissed on later projects without storing account data', () => {
  const storage = new Map(), render = harness('MobileProjectGestureHint', storage);
  nodes(render()).find(node => node.type === 'button').props.onClick();
  assert.equal(render(), null);
  assert.equal(harness('MobileProjectGestureHint', storage)(), null);
  assert.deepEqual([...storage.values()], ['dismissed']);
});
