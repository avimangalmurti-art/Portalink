import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const placeholder = new Proxy({}, { get: (_, key) => key });
function load(path, imports) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require: imports });
  return exports;
}
function nodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}
const routes = load('src/app/routes.ts', () => ({ navigationDestinations: [] }));
function harness(presentation = 'mobile', queryState = { data: [], loading: false }) {
  const visits = [];
  const city = { name: 'Oakland' };
  const react = { ...React, useCallback: fn => fn, useState: value => [value, () => {}] };
  const imports = name => {
    if (name === 'react') return react;
    if (name === 'react-router-dom') return { Link: 'a', useNavigate: () => path => visits.push(path), useSearchParams: () => [new URLSearchParams('tab=creators'), () => {}] };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/cities')) return { cities: [city] };
    if (name.endsWith('/location')) return { toLocationId: name => name.toLowerCase() };
    if (name.endsWith('/routes')) return routes;
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user: { id: 'account' }, isAuthenticated: true }) };
    if (name.endsWith('/ServicesContext')) return { useServices: () => ({}) };
    if (name.endsWith('/useAccountQuery')) return { useAccountQuery: () => queryState };
    if (name.endsWith('/useActivityCollection')) return { useActivityCollection: () => queryState };
    if (name.endsWith('/engagement')) return { describeActivityCollection: () => ({ title: 'Saved', emptyTitle: 'No saved projects', emptyDescription: 'Save work to see it here.' }) };
    return placeholder;
  };
  return { visits, city, load: path => load(path, imports),
    browseProps: { onOpenAtlas: () => visits.push('/search'), onOpenWorld: () => visits.push('/portalink'), onReturnHome: () => visits.push('/'), onOpenLocation: id => visits.push(`/portalink/${id}`), onOpenProject() {}, onOpenCreator() {}, live: {}, query: '', onQueryChange() {} },
  };
}

test('mobile World and city Back lead to Home and World while WEB preserves its handlers', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = harness(presentation);
    const { SearchBrowsePage } = h.load('src/components/SearchBrowsePage.tsx');
    const world = SearchBrowsePage({ ...h.browseProps, view: 'world', locationId: null });
    world.props.onSelectCity(h.city);
    const city = SearchBrowsePage({ ...h.browseProps, view: 'location', locationId: 'oakland' });
    city.props.onBack();
    world.props.onBack();
    assert.deepEqual(h.visits, ['/portalink/oakland', presentation === 'mobile' ? '/portalink' : '/search', presentation === 'mobile' ? '/' : '/search']);
  }
});

test('World back control names its actual platform destination and retains its action', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = harness(presentation);
    const { WorldViewToggle } = h.load('src/components/portalink/WorldViewToggle.tsx');
    const button = WorldViewToggle({ onToggle: presentation === 'mobile' ? h.browseProps.onReturnHome : h.browseProps.onOpenAtlas });
    assert.equal(button.props['aria-label'], presentation === 'mobile' ? 'Back to Home' : 'Back to Search');
    assert.equal(button.props.title, presentation === 'mobile' ? 'Back to Home' : 'Back');
    button.props.onClick();
    assert.deepEqual(h.visits, [presentation === 'mobile' ? '/' : '/search']);
  }
});

test('missing and empty mobile cities offer a working route to another city without changing WEB', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = harness(presentation);
    const { SearchBrowsePage } = h.load('src/components/SearchBrowsePage.tsx');
    const missing = nodes(SearchBrowsePage({ ...h.browseProps, view: 'location', locationId: 'missing' })).find(node => node.type === 'EmptyState');
    const { CityContentPage } = h.load('src/components/CityContentPage.tsx');
    const feed = nodes(CityContentPage({ city: h.city, onBack: h.browseProps.onOpenWorld })).find(node => node.type === 'HomeFeed');
    for (const action of [missing.props.action, feed.props.emptyAction]) {
      if (presentation === 'web') assert.equal(action, undefined);
      else { assert.equal(action.label, 'Browse another city'); action.onClick(); }
    }
    assert.deepEqual(h.visits, presentation === 'mobile' ? ['/portalink', '/portalink'] : []);
  }
});

test('empty saved creators and pages offer mobile discovery, never during loading or failure', () => {
  for (const presentation of ['mobile', 'web']) {
    for (const state of [{ loading: false }, { loading: true }, { loading: false, error: 'Offline' }]) {
      for (const kind of ['creators', 'pages']) {
        const h = harness(presentation, { ...state, data: kind === 'creators' ? [] : { items: [], nextCursor: null } });
        let tree;
        if (kind === 'creators') {
          const { SavedPage } = h.load('src/features/library/PersonalPages.tsx');
          const child = nodes(SavedPage({ onBack() {}, onOpenProject() {} })).find(node => node.type?.name === 'SavedCreators');
          tree = child.type(child.props);
        } else tree = h.load('src/features/library/SavedPagesCollection.tsx').SavedPagesCollection();
        const empty = nodes(tree).find(node => node.type === 'EmptyState');
        if (state.loading || state.error) assert.equal(empty, undefined);
        else if (presentation === 'web') assert.equal(empty.props.action, undefined);
        else { assert.equal(empty.props.action.label, 'Explore the world'); empty.props.action.onClick(); assert.deepEqual(h.visits, ['/portalink']); }
      }
    }
  }
});

test('a depleted saved page batch retains pagination rather than claiming the library is empty', () => {
  const h = harness('mobile', { loading: false, data: { items: [], nextCursor: 'more' } });
  const tree = h.load('src/features/library/SavedPagesCollection.tsx').SavedPagesCollection();
  const empty = nodes(tree).find(node => node.type === 'EmptyState');
  assert.equal(empty.props.title, 'No remaining saves on this page');
  assert.equal(empty.props.action, undefined);
  assert.ok(nodes(tree).some(node => node.props.children === 'More saved pages'));
});

test('only an empty own mobile Saved projects collection gets discovery', () => {
  for (const presentation of ['mobile', 'web']) for (const own of [true, false]) for (const kind of ['save', 'like']) {
    const h = harness(presentation, { phase: 'success', isEmpty: true, items: [] });
    const { ActivityCollectionPage } = h.load('src/components/profile/ActivityCollectionPage.tsx');
    const content = ActivityCollectionPage({ kind, isViewerOwnCollection: own, profileName: 'Your library' });
    const tree = content.type(content.props);
    const action = nodes(tree).find(node => node.type === 'a');
    assert.equal(Boolean(action), presentation === 'mobile' && own && kind === 'save');
    if (action) assert.equal(action.props.to, '/portalink');
  }
});
