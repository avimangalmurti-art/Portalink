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
const layout = compile('../src/features/projects/pageLayout.ts', () => ({}));
const Camera = () => null, InterfaceIcon = () => null;
const { MobilePortalProjectToolbar } = compile('../src/components/profile/MobilePortalProjectToolbar.tsx', name => {
  if (name === 'react') return React;
  if (name.endsWith('/pageLayout')) return layout;
  if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon };
  if (name.endsWith('/categoryIcons')) return { getCategoryIcon: icon => { assert.equal(icon, 'camera'); return Camera; } };
  return new Proxy({}, { get: () => () => null });
});
function nodes(node) { return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : []; }
const control = (tree, name) => nodes(tree).find(node => node.props['aria-label'] === name);
function harness() {
  const calls = [];
  const props = { category: { label: 'Photography', iconName: 'camera' }, layout: 'list', sort: 'recent', pagesPerRow: 1,
    canAdjustPages: true, savingPages: false, onBack: () => calls.push(['back']),
    onLayout: value => calls.push(['layout', value]),
    onSort: value => calls.push(['sort', value]), onPagesChange: value => calls.push(['pages', value]),
    onPagesCommit: value => calls.push(['commit', value]) };
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

test('page-density controls preserve draft/commit callbacks, limits, save blocking, and media applicability', () => {
  const h = harness(); let tree = h.render();
  const slider = control(tree, 'Pages per row');
  assert.equal(slider.props.min, layout.MIN_PAGES_PER_ROW);
  assert.equal(slider.props.max, layout.MAX_PAGES_PER_ROW);
  assert.equal(slider.props['aria-valuetext'], '1 page per row');
  slider.props.onChange({ currentTarget: { value: '3' } });
  for (const action of ['onPointerUp', 'onKeyUp', 'onBlur']) slider.props[action]({ currentTarget: { value: '3' } });
  assert.deepEqual(h.calls, [['pages', 3], ['commit', 3], ['commit', 3], ['commit', 3]]);
  h.props.savingPages = true; h.props.pagesPerRow = 3; tree = h.render();
  assert.equal(control(tree, 'Pages per row').props.disabled, true);
  assert.equal(control(tree, 'Pages per row').props['aria-valuetext'], '3 pages per row');
  h.props.canAdjustPages = false;
  assert.equal(control(h.render(), 'Pages per row'), undefined);
});
