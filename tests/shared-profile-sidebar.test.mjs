import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function compile(path, require) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText, { exports, require });
  return exports;
}
const routes = compile('../src/app/routes.ts', () => ({ navigationDestinations: [] }));

// Render the real component and exercise its handlers without creating users,
// changing live data, or requiring a browser. Only hooks and external UI are stubbed.
function harness() {
  const state = [];
  let cursor = 0;
  let width = 360;
  const calls = [];
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef: () => ({ current: null }), useEffect() {},
  };
  const { SharedProfileSidebar } = compile('../src/components/profile/SharedProfileSidebar.tsx', (name) => {
    if (name === 'react') return react;
    if (name === '../../app/routes') return routes;
    if (name === './categoryIcons') return { getCategoryIcon: (name) => `portal-icon-${name}` };
    if (name === '../ui/ResizablePanelHandle') return {
      ResizablePanelHandle: 'resize-handle',
      useResizablePanelWidth: () => ({ width, updateWidth(value) { width = value; }, commitWidth() {}, resetWidth() { width = 360; } }),
    };
    return new Proxy({}, { get: (_, key) => key });
  });
  const props = {
    profile: { id: 'creator', name: 'Creator Name', categories: [
      { id: 'photos', label: 'Photography', iconName: 'camera' },
      { id: 'type', label: 'Typography', iconName: 'type' },
    ] },
    activeCategoryId: null, theme: 'light', onThemeChange: (theme) => calls.push(theme),
    onOpenCategory: (id) => calls.push(id), onSignIn: () => calls.push('sign-in'), onCreateAccount: () => calls.push('sign-up'),
  };
  return { calls, render(changes = {}) { cursor = 0; return SharedProfileSidebar({ ...props, ...changes }); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}
const toggle = (tree) => nodes(tree).find((node) => node.props?.['data-sidebar-toggle'] !== undefined);
const portals = (tree) => nodes(tree).filter((node) => node.props?.['data-category-row'] !== undefined);
const home = (tree) => nodes(tree).find((node) => node.props?.['data-shared-profile-home'] !== undefined);

test('public navigation starts expanded at maximum width with the creator name and collapse control', () => {
  const tree = harness().render();
  assert.equal(tree.props.style.width, '360px');
  assert.equal(toggle(tree).props['aria-expanded'], true);
  assert.equal(toggle(tree).props['aria-label'], 'Collapse navigation');
  assert.equal(home(tree).props.to, '/share/creator');
  assert.ok(nodes(home(tree)).some((node) => node.props?.children === 'Creator Name'));
  assert.equal(portals(tree).length, 2);
});

test('collapse keeps all creator portal icons named, clickable and selected without visible labels', () => {
  const h = harness();
  toggle(h.render()).props.onClick();
  let tree = h.render({ activeCategoryId: 'photos' });
  assert.equal(tree.props['data-collapsed'], 'true');
  assert.equal(tree.props.style, undefined);
  assert.match(tree.props.className, /w-\[48px\] sm:w-\[52px\]/);
  assert.equal(toggle(tree).props['aria-expanded'], false);
  const rows = portals(tree);
  for (const [index, label, icon] of [[0, 'Photography', 'camera'], [1, 'Typography', 'type']]) {
    assert.equal(rows[index].props['aria-label'], label);
    assert.equal(rows[index].props.title, label);
    assert.ok(nodes(rows[index]).some((node) => node.props?.icon === `portal-icon-${icon}`));
    assert.ok(!nodes(rows[index]).some((node) => node.props?.children === label));
    rows[index].props.onClick();
  }
  assert.deepEqual(h.calls, ['photos', 'type']);
  assert.equal(rows[0].props['aria-current'], 'page');
  tree = h.render({ activeCategoryId: 'type' });
  assert.equal(tree.props['data-collapsed'], 'true');
  assert.equal(portals(tree)[1].props['aria-current'], 'page');
  assert.equal(home(tree).props.to, '/share/creator');
  assert.ok(nodes(tree).some((node) => node.type === 'nav' && /overflow-y-auto/.test(node.props.className)));
});

test('expanding restores the chosen width and the resize handle without changing routes', () => {
  const h = harness();
  let tree = h.render();
  nodes(tree).find((node) => node.type === 'resize-handle').props.onResize(280);
  toggle(tree).props.onClick();
  tree = h.render();
  assert.ok(!nodes(tree).some((node) => node.type === 'resize-handle'));
  toggle(tree).props.onClick();
  tree = h.render();
  assert.equal(tree.props.style.width, '280px');
  assert.ok(nodes(tree).some((node) => node.type === 'resize-handle'));
  assert.deepEqual(h.calls, []);
});

test('settings and theme remain usable in the collapsed rail for both themes', () => {
  for (const theme of ['light', 'dark']) {
    const h = harness();
    toggle(h.render({ theme })).props.onClick();
    let tree = h.render({ theme });
    nodes(tree).find((node) => node.props?.['data-system-color'] !== undefined).props.onClick();
    assert.deepEqual(h.calls, [theme === 'dark' ? 'light' : 'dark']);
    nodes(tree).find((node) => node.props?.['aria-label'] === 'Open settings').props.onClick();
    tree = h.render({ theme });
    const menu = nodes(tree).find((node) => node.props?.role === 'menu');
    assert.match(menu.props.className, /w-56 max-w-/);
    nodes(menu).filter((node) => node.props?.role === 'menuitem')[1].props.onClick();
    assert.equal(h.calls.at(-1), 'sign-in');
    assert.ok(!nodes(h.render({ theme })).some((node) => node.props?.role === 'menu'));
  }
});

test('empty public portfolios still offer expansion and return-to-profile', () => {
  const h = harness();
  const profile = { id: 'empty', name: 'Empty Creator', categories: [] };
  toggle(h.render({ profile })).props.onClick();
  const tree = h.render({ profile });
  assert.equal(portals(tree).length, 0);
  assert.equal(toggle(tree).props['aria-label'], 'Expand navigation');
  assert.equal(home(tree).props.to, '/share/empty');
});
