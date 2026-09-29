import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function harness(initialPresentation = 'mobile') {
  let presentation = initialPresentation;
  let identity;
  const calls = [];
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/presentation/AppScreenLayers.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(name) {
    if (name === 'react') return { ...React, useRef: initial => identity ??= { current: initial }, useSyncExternalStore: () => 0 };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    // No mark in flight, so these cases exercise ordinary unmarked navigation.
    if (name.endsWith('/backNavigationTransition')) return {
      subscribeMobileScreenNavigation: () => () => {},
      getMobileScreenNavigationMark: () => 0,
      getServerMobileScreenNavigationMark: () => 0,
      isMobileScreenNavigationFresh: mark => mark > 0,
    };
    if (name.endsWith('/useScreenTransition')) return { useScreenTransition: (key, snapshot, reduce, skip) => {
      calls.push({ key, reduce, skip });
      return [{ id: 0, screenKey: key, phase: 'screen-active', snapshot }];
    } };
    return { MobileBackScope: 'back-scope' };
  } });
  return { calls, resize: value => { presentation = value; }, render: (screenKey, mobileProfileKey, skipLayerTransition = false) => exports.AppScreenLayers({
    screenKey, mobileProfileKey, snapshot: { content: React.createElement('profile'), mainClassName: 'screen', ariaLabel: 'Profile' },
    reduceMotion: false, skipLayerTransition, mainContentRef: { current: null }, onScroll() {},
  }) };
}

test('mobile profile, portals, and every project workspace share one transition identity', () => {
  const h = harness();
  for (const destination of ['profile-creator', 'in-design-portals', 'category-creator-a', 'category-creator-b', 'profile-creator']) {
    h.render(destination, 'mobile-profile-viewer-creator-false', destination.includes('category'));
  }
  assert.equal(new Set(h.calls.map(call => call.key)).size, 1);
  assert.equal(h.calls[2].skip, true, 'Media continuity remains available without replacing the profile');
});

test('other creators, access states, account changes, and public shares never inherit the prior workspace', () => {
  const h = harness();
  h.render('profile-creator', 'mobile-profile-viewer-creator-false');
  h.render('profile-other', 'mobile-profile-viewer-other-false');
  h.render('route-state-/p/other', undefined);
  h.render('profile-other', 'mobile-profile-viewer-other-false');
  h.render('profile-other', 'mobile-profile-new-account-other-false');
  h.render('shared-profile-other', 'mobile-profile-new-account-other-true');
  assert.notEqual(h.calls[0].key, h.calls[1].key);
  assert.equal(h.calls[2].key, 'route-state-/p/other');
  assert.notEqual(h.calls[2].key, h.calls[3].key);
  assert.notEqual(h.calls[3].key, h.calls[4].key);
  assert.notEqual(h.calls[4].key, h.calls[5].key);
});

test('WEB preserves destination transitions and resizing alone does not remount work', () => {
  const h = harness('web');
  h.render('profile-creator', 'profile-scope');
  h.render('category-creator-a', 'profile-scope');
  assert.deepEqual(h.calls.map(call => call.key), ['profile-creator', 'category-creator-a']);
  h.resize('mobile');
  h.render('category-creator-a', 'profile-scope');
  h.render('profile-creator', 'profile-scope');
  assert.equal(h.calls[2].key, h.calls[1].key);
  assert.equal(h.calls[3].key, h.calls[1].key);
  h.resize('web');
  h.render('profile-creator', 'profile-scope');
  assert.equal(h.calls[4].key, h.calls[3].key);
  h.render('category-creator-a', 'profile-scope');
  assert.notEqual(h.calls[5].key, h.calls[4].key, 'Returning to an old WEB destination still transitions after resizing');
  h.render('category-creator-b', 'profile-scope');
  assert.equal(h.calls[6].key, 'category-creator-b');
});

const appSource = ts.createSourceFile('App.tsx', readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function appInitializer(name) {
  let result;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(appSource) === name) result = node.initializer.getText(appSource);
    ts.forEachChild(node, visit);
  }
  visit(appSource);
  assert.ok(result, `Expected App rendering boundary ${name}`);
  return ts.transpileModule(`result = (${result});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
}
const appBoundaries = ['isMobileOwnerProfileRefreshing', 'isProfileRouteReady', 'routeStateView', 'screenTransitionKey', 'mobileProfileKey'];
const appExpressions = Object.fromEntries(appBoundaries.map(name => [name, appInitializer(name)]));
function profileRender(overrides = {}) {
  const profile = { id: 'owner', name: 'Owner', projectGridColumns: 2 };
  const context = vm.createContext({
    React, LoadingState: 'loading', EmptyState: 'empty', ErrorState: 'error',
    presentation: 'mobile', route: { kind: 'profile' }, pathname: '/p/owner', routeProfileId: 'owner', viewedProfileId: 'owner',
    auth: { user: { id: 'account' }, viewerProfileId: 'owner', isAuthenticated: true, phase: 'authenticated' },
    viewedProfile: profile, viewedProfileQuery: { profile, status: 'ready', error: null, retry() {} },
    isProfileEditorRoute: false, isRouteBlocked: false, routeItemId: null, isSharedRoute: false,
    isPrivateProfileAccessResolving: false, isProfileAccessDenied: false, isCategoryRouteMissing: false,
    personalScreen: null, isControlCenterOpen: false, iconPickerCategoryId: null, inDesignFeature: null,
    isMessagesOpen: false, isSearchOpen: false, routeActivityKind: null, activeCategoryId: null,
    categoryPage: null, isPortalsOpen: false, canShowOwnPortalsWorkspace: false, nav: { home() {} },
    ...overrides,
  });
  for (const name of appBoundaries) {
    vm.runInContext(appExpressions[name], context);
    context[name] = context.result;
  }
  return context;
}

test('saving density keeps the existing mobile owner profile layer through its background refresh', () => {
  const layers = harness();
  const ready = profileRender();
  const refreshing = profileRender({ viewedProfileQuery: { status: 'loading' } });
  const confirmed = profileRender({ viewedProfile: { id: 'owner', name: 'Owner', projectGridColumns: 4 } });
  for (const state of [ready, refreshing, confirmed]) {
    assert.equal(state.isProfileRouteReady, true);
    assert.equal(state.routeStateView, null);
    layers.render(state.screenTransitionKey, state.mobileProfileKey);
  }
  assert.equal(refreshing.isMobileOwnerProfileRefreshing, true);
  assert.equal(new Set(layers.calls.map(call => call.key)).size, 1, 'Open Layout controls must retain their mounted state until Done');
});

test('profile refresh preservation never applies to WEB, visitors, shares, other routes or account transitions', () => {
  const cases = [
    { presentation: 'web' },
    { viewedProfile: { id: 'another', name: 'Another creator' }, viewedProfileId: 'another', routeProfileId: 'another' },
    { route: { kind: 'sharedProfile' }, isSharedRoute: true },
    { route: { kind: 'category' } },
    { route: { kind: 'project' } },
    { viewedProfile: null },
    { auth: { user: null, viewerProfileId: null, isAuthenticated: false, phase: 'unauthenticated' } },
    { auth: { user: { id: 'account' }, viewerProfileId: 'owner', isAuthenticated: true, phase: 'signing-out' } },
    { auth: { user: { id: 'new-account' }, viewerProfileId: 'new-owner', isAuthenticated: true, phase: 'authenticated' } },
  ];
  for (const overrides of cases) {
    const state = profileRender({ viewedProfileQuery: { status: 'loading' }, ...overrides });
    assert.equal(state.isMobileOwnerProfileRefreshing, false);
    assert.equal(state.isProfileRouteReady, false);
    assert.equal(state.routeStateView.type, 'loading');
    assert.equal(state.mobileProfileKey, undefined);
  }
});

test('failed or missing owner refresh still replaces the gallery with its existing recovery state', () => {
  for (const [status, expected] of [['error', 'error'], ['not-found', 'empty']]) {
    const state = profileRender({ viewedProfile: null, viewedProfileQuery: { status, error: 'Unavailable', retry() {} } });
    assert.equal(state.isProfileRouteReady, false);
    assert.equal(state.routeStateView.type, expected);
    assert.equal(state.mobileProfileKey, undefined);
  }
});
