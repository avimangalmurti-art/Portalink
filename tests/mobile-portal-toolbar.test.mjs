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
let presentation = 'mobile';
const { MobilePortalProjectToolbar } = compile('../src/components/profile/MobilePortalProjectToolbar.tsx', name => {
  if (name === 'react') return React;
  if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon };
  if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
  if (name.endsWith('/MobileBackNavigation')) return { useMobileScreenActive: () => true };
  if (name.endsWith('/PreviewCreatorName')) return { PreviewCreatorName: 'scrolling-title' };
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
  const heading = nodes(tree).find(node => node.type === 'h2');
  assert.equal(heading.props.title, 'Photography');
  assert.equal(heading.props.children.type, 'scrolling-title');
  assert.equal(heading.props.children.props.name, 'Photography');
  assert.equal(heading.props.children.props.centered, true);
  assert.equal(heading.props.children.props.active, true);
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

test('public project navigation opts into local browsing controls without owner actions', () => {
  const h = harness(); h.props.sharedReadOnly = true;
  let tree = h.render();
  assert.equal(control(tree, 'Sort projects'), undefined, 'Unrelated read-only callers retain their default.');
  h.props.browsingControls = true;
  tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === 'h2').props.children.props.name, 'Photography');
  control(tree, 'Back to profile').props.onClick();
  assert.deepEqual(h.calls, [['back']]);
  for (const name of ['Back to portals', 'Pages per row', 'Add a new project to Photography']) assert.equal(control(tree, name), undefined);
  control(tree, 'Show project grid').props.onClick();
  control(tree, 'Sort projects').props.onChange({ target: { value: 'title' } });
  assert.deepEqual(h.calls, [['back'], ['layout', 'grid'], ['sort', 'title']]);
  assert.equal(nodes(tree).some(node => node.props.className === 'mobile-portal-index-preferences'), true);
  h.props.browsingControls = false;
  presentation = 'web';
  try {
    const desktop = h.render();
    assert.equal(nodes(desktop).find(node => node.type === 'h2').props.children, 'Photography');
    assert.equal(control(desktop, 'Sort projects'), undefined);
  }
  finally { presentation = 'mobile'; }
});

test('a Timeline portal popup announces its own return destination while retaining the same Back action', () => {
  const h = harness();
  Object.assign(h.props, { sharedReadOnly: true, backLabel: 'Back to Timeline' });
  const tree = h.render();
  assert.equal(control(tree, 'Back to profile'), undefined);
  control(tree, 'Back to Timeline').props.onClick();
  assert.deepEqual(h.calls, [['back']]);
});
