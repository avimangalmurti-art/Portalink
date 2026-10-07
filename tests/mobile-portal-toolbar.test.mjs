import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function compile(path, require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require });
  return exports;
}
const Camera = () => null, InterfaceIcon = () => null;
const { MobilePortalProjectToolbar } = compile('../src/components/profile/MobilePortalProjectToolbar.tsx', name => {
  if (name === 'react') return React;
  if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon };
  if (name.endsWith('/categoryIcons')) return { getCategoryIcon: icon => { assert.equal(icon, 'camera'); return Camera; } };
  return new Proxy({}, { get: () => () => null });
});
function nodes(node) { return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : []; }
const control = (tree, name) => nodes(tree).find(node => node.props['aria-label'] === name);
function harness() {
  const calls = [];
  const props = { category: { label: 'Photography', iconName: 'camera' }, layout: 'list', sort: 'recent', onBack: () => calls.push(['back']),
    onLayout: value => calls.push(['layout', value]),
    onSort: value => calls.push(['sort', value]) };
  return { props, calls, render: () => MobilePortalProjectToolbar(props) };
}

test('MOBILE portal header uses its real icon/name, one Back action, and an optional authorized Add action', () => {
  const h = harness();
  let tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === 'h2').props.children, 'Photography');
  assert.ok(nodes(tree).find(node => node.type === InterfaceIcon && node.props.icon === Camera));
  assert.equal(control(tree, 'Add a new project to Photography'), undefined);
  control(tree, 'Back to portals').props.onClick();
  assert.deepEqual(h.calls, [['back']]);
  h.props.onCreate = () => h.calls.push(['create']); tree = h.render();
  control(tree, 'Add a new project to Photography').props.onClick();
  assert.deepEqual(h.calls.at(-1), ['create']);
  assert.equal(nodes(tree).filter(node => node.props['aria-label'] === 'Back to portals').length, 1);
});

test('mobile omits search while list/grid and sorting retain their controlled actions', () => {
  const h = harness(); let tree = h.render();
  assert.equal(nodes(tree).find(node => node.props.type === 'search'), undefined);
  control(tree, 'Show project grid').props.onClick();
  const sort = control(tree, 'Sort projects');
  assert.deepEqual(nodes(sort).filter(node => node.type === 'option').map(node => node.props.value), ['recent', 'title', 'saved']);
  sort.props.onChange({ target: { value: 'saved' } });
  assert.deepEqual(h.calls, [['layout', 'grid'], ['sort', 'saved']]);
  Object.assign(h.props, { layout: 'grid', sort: 'saved' }); tree = h.render();
  assert.equal(control(tree, 'Sort projects').props.value, 'saved');
  assert.equal(control(tree, 'Show project list').props['aria-pressed'], true);
  control(tree, 'Show project list').props.onClick();
  assert.deepEqual(h.calls.at(-1), ['layout', 'list']);
});

test('portal popup keeps browsing controls without a duplicate page-density slider', () => {
  const h = harness();
  for (const owner of [false, true]) {
    h.props.onCreate = owner ? () => h.calls.push(['create']) : undefined;
    const tree = h.render();
    assert.equal(control(tree, 'Pages per row'), undefined);
    assert.equal(nodes(tree).some(node => node.props.type === 'range'), false);
    assert.ok(control(tree, 'Sort projects'));
    assert.ok(control(tree, 'Show project grid'));
  }
});

test('public project navigation keeps its title and Back path without layout or sorting controls', () => {
  const h = harness(); h.props.sharedReadOnly = true;
  const tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === 'h2').props.children, 'Photography');
  control(tree, 'Back to profile').props.onClick();
  assert.deepEqual(h.calls, [['back']]);
  for (const name of ['Back to portals', 'Pages per row', 'Show project grid', 'Sort projects']) assert.equal(control(tree, name), undefined);
  assert.equal(nodes(tree).some(node => node.props.className === 'mobile-portal-index-preferences'), false);
});
