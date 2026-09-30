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
const layoutDefaults = compile('../src/utils/panelLayoutDefaults.ts', () => ({}));

// Render the real component and exercise its handlers without creating users,
// changing live data, or requiring a browser. Only hooks and external UI are stubbed.
function harness(initialPresentation = 'web') {
  const state = [];
  let cursor = 0, presentation = initialPresentation;
  let width;
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
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({ onTriggerKeyDown() {} }) };
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/MobileContextActions')) return { MobileContextButton: 'context-button' };
    if (name === 'react') return react;
    if (name === '../../app/routes') return routes;
    if (name === '../../utils/panelLayoutDefaults') return layoutDefaults;
    if (name.endsWith('/useCompactNavigation')) return { useCompactNavigation: (collapsed, change) => ({ collapsed, toggle: () => change(!collapsed), closeCompact() {} }) };
    if (name === './categoryIcons') return { getCategoryIcon: (name) => `portal-icon-${name}` };
    if (name === '../ui/ResizablePanelHandle') return {
      ResizablePanelHandle: 'resize-handle',
      useResizablePanelWidth: ({ defaultWidth }) => {
        width ??= defaultWidth;
        return { width, updateWidth(value) { width = value; }, commitWidth() {}, resetWidth() { width = defaultWidth; } };
      },
    };
    return new Proxy({}, { get: (_, key) => key });
  });
  const props = {
    profile: { id: 'creator', name: 'Creator Name', categories: [
      { id: 'photos', label: 'Photography', iconName: 'camera' },
      { id: 'type', label: 'Typography', iconName: 'type' },
    ] },
    activeCategoryId: null, theme: 'light', onThemeChange: (theme) => calls.push(theme),
    onOpenCategory: (id) => calls.push(id), onSettingsOpen: () => calls.push('settings'),
  };
  return { calls, setPresentation(value) { presentation = value; }, render(changes = {}) { cursor = 0; return SharedProfileSidebar({ ...props, ...changes }); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}
const toggle = (tree) => nodes(tree).find((node) => node.props?.['data-sidebar-toggle'] !== undefined);
const portals = (tree) => nodes(tree).filter((node) => node.props?.['data-category-row'] !== undefined);
const home = (tree) => nodes(tree).find((node) => node.props?.['data-shared-profile-home'] !== undefined);

test('public navigation starts expanded at the compact standard width with the creator name and collapse control', () => {
  const tree = harness().render();
  assert.equal(tree.props.style.width, '280px');
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
  assert.equal(home(tree), undefined, 'Expand navigation to use the creator name; no redundant home icon');
  assert.ok(nodes(tree).some((node) => node.type === 'nav' && /overflow-y-auto/.test(node.props.className)));
});

test('public navigation can collapse and expand without offering layout resize handles', () => {
  const h = harness();
  let tree = h.render();
  assert.ok(!nodes(tree).some((node) => node.type === 'resize-handle'));
  toggle(tree).props.onClick();
  tree = h.render();
  assert.ok(!nodes(tree).some((node) => node.type === 'resize-handle'));
  toggle(tree).props.onClick();
  tree = h.render();
  assert.equal(tree.props.style.width, '280px');
  assert.ok(!nodes(tree).some((node) => node.type === 'resize-handle'));
  assert.deepEqual(h.calls, []);
});

test('shared navigation keeps the creator name as its only home link and keeps bio out of the sidebar', () => {
  for (const presentation of ['web']) {
    const h = harness(presentation);
    const profile = { id: 'creator', name: 'Creator', headline: 'Jolly Good\nWorking across cities.', categories: [] };
    const wrapper = h.render({ profile });
    const tree = wrapper;
    assert.equal(nodes(tree).some(node => node.props['data-shared-profile-headline'] !== undefined), false);
    assert.equal(nodes(tree).some(node => node.props.children === 'Jolly Good'), false);
    assert.ok(nodes(tree).some(node => node.type === 'nav' && node.props['aria-label'] === 'Creator portals'));
    assert.equal(nodes(tree).find(node => node.props['data-shared-portals-heading'] !== undefined).props.children.trim(), 'Portals');
    assert.equal(nodes(tree).filter(node => node.type === 'Link').length, 1);
    assert.equal(home(tree).props.to, '/share/creator');
    assert.ok(nodes(home(tree)).some(node => node.props.children === 'Creator'));
    assert.equal(nodes(tree).some(node => node.props.icon === 'HomeIcon' || node.props.children === 'Profile'), false);
  }
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
    assert.equal(h.calls.at(-1), 'settings');
    assert.ok(!nodes(h.render({ theme })).some((node) => node.props?.role === 'menu'));
  }
});

test('empty public portfolios still offer expansion and return-to-profile', () => {
  const h = harness();
  const profile = { id: 'empty', name: 'Empty Creator', categories: [] };
  toggle(h.render({ profile })).props.onClick();
  let tree = h.render({ profile });
  assert.equal(portals(tree).length, 0);
  assert.equal(toggle(tree).props['aria-label'], 'Expand navigation');
  assert.equal(home(tree), undefined);
  toggle(tree).props.onClick();
  tree = h.render({ profile });
  assert.equal(home(tree).props.to, '/share/empty');
});

test('MOBILE shows one floating context button and preserves WEB collapse preference', () => {
  const h = harness(); toggle(h.render()).props.onClick();
  assert.equal(h.render().props['data-collapsed'], 'true');
  h.setPresentation('mobile');
  const tree = h.render({ activeCategoryId: 'photos' });
  assert.equal(tree.type, 'context-button'); assert.equal(tree.props.floating, true);
  assert.equal(nodes(tree).some(node => node.type === 'aside' || node.type === 'nav'), false);
  h.setPresentation('web'); const web = h.render();
  assert.equal(web.type, 'aside'); assert.equal(web.props['data-collapsed'], 'true');
});
