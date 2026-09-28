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
  let layoutEffects = [];
  const feedArguments = [];
  let reloads = 0;
  const density = { columns: 5, setColumns(value) { density.columns = value; }, saveError: null };
  const ownerProfile = { profile: { id: 'owner', projectGridColumns: 5 }, status: 'ready' };
  const feed = { status: 'success', featured: null, projects: [{ project: { id: 'first' } }, { project: { id: 'second' } }], isEmpty: false,
    isRefreshing: false, refreshError: null, retry() { reloads++; } };
  const react = { ...React, useCallback: fn => fn, useMemo: fn => fn(), useLayoutEffect(effect) { layoutEffects.push(effect); },
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
  }).outputText, { exports, window: { sessionStorage: { getItem: () => null }, addEventListener() {}, removeEventListener() {} }, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ viewerProfileId: 'owner' }) };
    if (name.endsWith('/ProfileDataContext')) return { useProfileQuery: () => ownerProfile };
    if (name.endsWith('/useProjectGridDensity')) return { useProjectGridDensity: () => density };
    if (name.endsWith('/useFeed')) return { useFeed(locationId) {
      feedArguments.push(locationId);
      return feed;
    } };
    if (name.endsWith('/projectPresentation')) return { getProjectAspectRatio: () => 1, resolveFeedSpan: () => 1 };
    return new Proxy({}, { get: (_, key) => key });
  } });
  const render = () => {
    cursor = 0; layoutEffects = [];
    return exports.HomeFeed({ isSidebarCollapsed: true, showSearchPlaceholder: true, onOpenProject() {}, onOpenCreator() {}, ...props });
  };
  return { feedArguments, feed, density, ownerProfile, get reloads() { return reloads; }, render,
    measureLocation(width) {
      const scroller = nodes(render()).find(node => typeof node.props.onScroll === 'function');
      scroller.ref.current = { querySelector: () => ({ clientWidth: width }) };
      layoutEffects[0]();
    },
  };
}

test('Home passes the saved owner density to both presentations and waits for the canonical layout', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = harness(presentation);
    const grid = () => nodes(h.render()).find(node => node.type === (presentation === 'mobile' ? 'JustifiedImageWall' : 'BentoFeedGrid'));
    assert.equal(grid().props.columns, 5);
    for (const count of [2, 13, 5]) {
      grid().props.onColumnsChange(count);
      assert.equal(grid().props.columns, count);
    }
    h.ownerProfile.status = 'loading';
    assert.equal(grid().props.columns, 5, 'A same-profile refresh must keep the current grid mounted');
    const originalProfile = h.ownerProfile.profile;
    h.ownerProfile.profile = null;
    assert.equal(grid(), undefined, 'Do not flash or overwrite a saved layout with the default while its profile loads');
    h.ownerProfile.profile = originalProfile;
    h.ownerProfile.status = 'ready';
    assert.equal(grid().props.columns, 5);
  }
});

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

test('city feeds preserve their responsive mobile baseline and local pinch without changing the owner layout', () => {
  const h = harness('mobile', { locationId: 'city' });
  const grid = () => nodes(h.render()).find(node => node.type === 'JustifiedImageWall');
  for (const [width, expected] of [[240, 2], [390, 2], [430, 2], [458, 3], [600, 3]]) {
    h.measureLocation(width);
    assert.equal(grid().props.columns, expected);
  }
  grid().props.onColumnsChange(13);
  h.measureLocation(390);
  assert.equal(grid().props.columns, 13, 'Resizing keeps a deliberate local city pinch');
  assert.equal(h.density.columns, 5, 'City choices must not change the saved Home/Profile layout');
  const home = harness('mobile');
  home.measureLocation(240);
  assert.equal(nodes(home.render()).find(node => node.type === 'JustifiedImageWall').props.columns, 5);
  const webCity = nodes(harness('web', { locationId: 'city' }).render()).find(node => node.type === 'BentoFeedGrid');
  assert.equal(webCity.props.columns, undefined);
  assert.equal(webCity.props.onColumnsChange, undefined);
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
  nodes(tree).find(node => node.type === 'input').props.onFocus();
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

test('rightmost Home search action reloads the feed, preserves its cards, and prevents duplicate requests', () => {
  const h = harness();
  let tree = h.render();
  let reload = nodes(tree).find(node => node.props['aria-label'] === 'Reload Home content');
  assert.equal(reload.props.type, 'button');
  assert.equal(reload.props.disabled, false);
  reload.props.onClick(); assert.equal(h.reloads, 1);
  h.feed.isRefreshing = true; tree = h.render();
  reload = nodes(tree).find(node => node.props['aria-label'] === 'Reload Home content');
  assert.equal(reload.props.disabled, true); assert.equal(reload.props['aria-busy'], true);
  reload.props.onClick(); assert.equal(h.reloads, 1);
  assert.deepEqual(Array.from(nodes(tree).find(node => node.type === 'JustifiedImageWall').props.items, item => item.key), ['first', 'second']);
  assert.equal(nodes(tree).find(node => node.props.id === 'home-search-status').props.className, 'sr-only');
  assert.equal(nodes(tree).find(node => node.props.role === 'status').props.children, 'Refreshing Home content.');
  h.feed.isRefreshing = false; h.feed.refreshError = 'Could not refresh Home. Please try again.';
  const status = nodes(h.render()).find(node => node.props.role === 'status');
  assert.equal(status.props.children, h.feed.refreshError); assert.notEqual(status.props.className, 'sr-only');
  for (const other of [harness('web'), harness('mobile', { locationId: 'city' })]) {
    assert.equal(nodes(other.render()).some(node => node.props['aria-label'] === 'Reload Home content'), false);
  }
});
