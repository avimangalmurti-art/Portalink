import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';

function harness(file, component, props) {
  const source = readFileSync(new URL(`../src/components/publishing/${file}.tsx`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  let cursor = 0;
  let dismiss;
  const state = [];
  const document = { activeElement: null };
  const exports = {};
  vm.runInNewContext(compiled, { exports, document, require: (name) => {
    if (name === 'react') return { ...React,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
      },
      useRef: () => ({ current: null }), useEffect() {}, useLayoutEffect() {},
    };
    if (name === 'react/jsx-runtime') return jsxRuntime;
    if (name.endsWith('/useModalFocus')) return { useModalFocus: (_open, _ref, onDismiss) => { dismiss = onDismiss; } };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => 'web' };
    if (name.endsWith('/assetTypes')) return { supportedFormatGroups: [] };
    return new Proxy({}, { get: (_, key) => key });
  } });
  return {
    render: (changes = {}) => { cursor = 0; return exports[component]({ ...props, ...changes }); },
    dismiss: () => dismiss(), document,
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}
const find = (tree, predicate) => nodes(tree).find(predicate);
const label = (tree, value) => find(tree, (node) => node.props?.children === value);
const menuProps = { hasFiles: true, locked: false, showsRequirements: false,
  triggerRef: { current: null }, onRequirements() {}, onRemoveAll() {},
};
function open(h) {
  find(h.render(), (node) => node.props?.['aria-haspopup'] === 'menu').props.onClick();
  return h.render();
}

test('file options dismiss before revealing requirements or remove confirmation', () => {
  for (const [text, callback] of [['File requirements', 'onRequirements'], ['Remove all files…', 'onRemoveAll']]) {
    let calls = 0;
    const h = harness('ProjectFilesMenu', 'ProjectFilesMenu', { ...menuProps, [callback]: () => calls++ });
    label(open(h), text).props.onClick();
    assert.equal(calls, 1);
    assert.equal(find(h.render(), (node) => node.props?.role === 'menu'), undefined);
  }
});

test('empty drafts omit remove-all; locked drafts cannot trigger it', () => {
  const empty = harness('ProjectFilesMenu', 'ProjectFilesMenu', { ...menuProps, hasFiles: false });
  assert.equal(label(open(empty), 'Remove all files…'), undefined);
  let calls = 0;
  const locked = harness('ProjectFilesMenu', 'ProjectFilesMenu', { ...menuProps, locked: true, onRemoveAll: () => calls++ });
  const action = label(open(locked), 'Remove all files…');
  assert.equal(action.props.disabled, true);
  action.props.onClick();
  assert.equal(calls, 0);
});

test('file menu supports keyboard entry, wrapping, and modal dismissal', () => {
  const h = harness('ProjectFilesMenu', 'ProjectFilesMenu', menuProps);
  const menu = find(open(h), (node) => node.props?.role === 'menu');
  const items = [0, 1].map(() => ({ focus() { h.document.activeElement = this; } }));
  const press = (key) => menu.props.onKeyDown({ key, preventDefault() {}, currentTarget: { querySelectorAll: () => items } });
  press('ArrowUp');
  assert.equal(h.document.activeElement, items[1]);
  press('ArrowDown');
  assert.equal(h.document.activeElement, items[0]);
  press('End');
  assert.equal(h.document.activeElement, items[1]);
  press('Home');
  assert.equal(h.document.activeElement, items[0]);
  h.dismiss();
  assert.equal(find(h.render(), (node) => node.props?.role === 'menu'), undefined);
});

test('remove-all requires confirmation and Keep files preserves the draft', () => {
  let cleared = 0;
  const h = harness('MediaPicker', 'MediaPicker', { media: {
    items: [{ id: 'image' }], clear: () => cleared++, state: 'ready',
  } });
  const requestRemoval = () => find(h.render(), (node) => node.type === 'ProjectFilesMenu').props.onRemoveAll();
  requestRemoval();
  assert.equal(cleared, 0);
  label(h.render(), 'Keep files').props.onClick();
  assert.equal(cleared, 0);
  assert.equal(label(h.render(), 'Remove all'), undefined);
  requestRemoval();
  label(h.render(), 'Remove all').props.onClick();
  assert.equal(cleared, 1);
  assert.equal(label(h.render(), 'Remove all'), undefined);
});
