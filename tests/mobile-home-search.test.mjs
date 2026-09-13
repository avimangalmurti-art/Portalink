import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function nodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}

function harness(presentation = 'mobile', props = {}) {
  const slots = []; let cursor = 0;
  const feedArguments = [];
  const react = { ...React, useCallback: fn => fn, useMemo: fn => fn(), useLayoutEffect() {},
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/home/HomeFeed.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, window: { sessionStorage: { getItem: () => null } }, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/useFeed')) return { useFeed(locationId) {
      feedArguments.push(locationId);
      return { status: 'ready', featured: null, projects: [{ project: { id: 'first' } }, { project: { id: 'second' } }], isEmpty: false };
    } };
    if (name.endsWith('/projectPresentation')) return { getProjectAspectRatio: () => 1, resolveFeedSpan: () => 1 };
    return new Proxy({}, { get: (_, key) => key });
  } });
  return { feedArguments, render() {
    cursor = 0;
    return exports.HomeFeed({ isSidebarCollapsed: true, showSearchPlaceholder: true, onOpenProject() {}, onOpenCreator() {}, ...props });
  } };
}

test('Home search is inside its existing scroller and only appears on the mobile Home entry', () => {
  const tree = harness().render();
  const scroller = nodes(tree).find(node => typeof node.props.onScroll === 'function');
  const header = nodes(scroller).find(node => node.type === 'header');
  assert.equal(header.props.className, 'mobile-home-search-header');
  const input = nodes(header).find(node => node.type === 'input');
  assert.equal(input.props.disabled, undefined);
  assert.equal(input.props.autoFocus, undefined);
  assert.equal(input.props.type, 'search');
  for (const h of [harness('web'), harness('mobile', { locationId: 'city' }), harness('mobile', { showSearchPlaceholder: false })]) {
    assert.equal(nodes(h.render()).some(node => node.props.role === 'search'), false);
  }
});

test('typing and submitting stay local and preserve the feed’s content and order', () => {
  const h = harness();
  let tree = h.render();
  nodes(tree).find(node => node.type === 'input').props.onChange({ target: { value: 'Typography' } });
  tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === 'input').props.value, 'Typography');
  let prevented = false;
  nodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  const wall = nodes(tree).find(node => node.type === 'JustifiedImageWall');
  assert.deepEqual(Array.from(wall.props.items, item => item.key), ['first', 'second']);
  assert.ok(h.feedArguments.every(argument => argument === undefined));
});

test('focus explains availability, clearing retains focus, and Escape clears and dismisses', () => {
  const h = harness();
  let tree = h.render();
  nodes(tree).find(node => node.type === 'form').props.onFocus();
  tree = h.render();
  assert.notEqual(nodes(tree).find(node => node.props.id === 'home-search-status').props.className, 'sr-only');
  let focused = false;
  const input = nodes(tree).find(node => node.type === 'input');
  input.ref.current = { focus() { focused = true; } };
  input.props.onChange({ target: { value: 'Test' } });
  tree = h.render();
  nodes(tree).find(node => node.props['aria-label'] === 'Clear search').props.onClick();
  assert.equal(focused, true);
  tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === 'input').props.value, '');
  assert.equal(nodes(tree).some(node => node.props['aria-label'] === 'Clear search'), false);
  let blurred = false;
  nodes(tree).find(node => node.type === 'input').props.onKeyDown({ key: 'Escape', currentTarget: { blur() { blurred = true; } } });
  assert.equal(blurred, true);
});
