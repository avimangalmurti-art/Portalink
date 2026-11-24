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
    if (name === 'react') return { ...React, useLayoutEffect: () => {}, useRef: initial => identity ??= { current: initial }, useSyncExternalStore: () => 0 };
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
  return { calls, resize: value => { presentation = value; }, render: (screenKey, mobileProfileKey, skipLayerTransition = false, webPortalScope) => exports.AppScreenLayers({
    screenKey, mobileProfileKey, webPortalScope, snapshot: { content: React.createElement('profile'), mainClassName: 'screen', ariaLabel: 'Profile' },
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

test('desktop portal switches skip the page animation within the same catalogue', () => {
  const h = harness('web');
  const open = (screenKey, scope) => {
    h.render(screenKey, undefined, false, scope);
    return h.calls.at(-1);
  };
  open('profile-owner');
  const first = open('category-owner-a', 'account:owner');
  assert.equal(first.skip, false, 'Entering the catalogue still uses the normal transition');
  const second = open('category-owner-b', 'account:owner');
  assert.equal(second.skip, true);
  assert.notEqual(first.key, second.key, 'Each portal gets its own local controls and editor state');
  assert.equal(open('category-owner-b', 'account:owner').key, second.key, 'Selecting a project keeps the current portal mounted');
  assert.equal(open('category-owner-a', 'account:owner').skip, true, 'Returning to the previous portal is also immediate');
  assert.equal(open('category-other-a', 'account:other').skip, false);
  assert.equal(open('category-other-b', 'new-account:other').skip, false);
  assert.equal(open('messages').skip, false);
  assert.equal(open('category-other-a', 'new-account:other').skip, false);
});

test('desktop portal motion does not override mobile navigation after resizing', () => {
  const h = harness('web');
  h.render('category-owner-a', 'mobile-owner', false, 'account:owner');
  h.render('category-owner-b', 'mobile-owner', false, 'account:owner');
  const desktopKey = h.calls.at(-1).key;
  h.resize('mobile');
  h.render('category-owner-b', 'mobile-owner', false, 'account:owner');
  assert.equal(h.calls.at(-1).key, desktopKey, 'Resizing preserves the mounted project');
  h.render('category-owner-c', 'mobile-owner', false, 'account:owner');
  assert.equal(h.calls.at(-1).key, desktopKey, 'Mobile continues in its existing profile workspace');
  assert.equal(h.calls.at(-1).skip, false);
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
const appBoundaries = ['isCollaborationOpen', 'isOwnerProfileRefreshing', 'isProfileRouteReady', 'routeStateView', 'screenTransitionKey', 'isTimelineReader', 'mobileProfileKey', 'webPortalScope'];
const appExpressions = Object.fromEntries(appBoundaries.map(name => [name, appInitializer(name)]));
function profileRender(overrides = {}) {
  const profile = { id: 'owner', name: 'Owner', projectGridColumns: 2, categories: [{ id: 'portal' }] };
  const context = vm.createContext({
    React, LoadingSkeleton: 'loading', openingProjectId:null, LoadingState: 'loading', EmptyState: 'empty', ErrorState: 'error', RouteError: 'route-error', routeErrorKind: () => 'network',
    presentation: 'mobile', route: { kind: 'profile' }, pathname: '/p/owner', routeProfileId: 'owner', viewedProfileId: 'owner', routeCategoryId: null,
    auth: { user: { id: 'account' }, viewerProfileId: 'owner', isAuthenticated: true, phase: 'authenticated' },
    viewedProfile: profile, viewedProfileQuery: { profile, status: 'ready', error: null, retry() {} },
    isProfileEditorRoute: false, isRouteBlocked: false, routeItemId: null, isSharedRoute: false,
    isPrivateProfileAccessResolving: false, isProfileAccessDenied: false, isCategoryRouteMissing: false,
    personalScreen: null, isControlCenterOpen: false, iconPickerCategoryId: null, inDesignFeature: null,
    isMessagesOpen: false, isSearchOpen: false, routeActivityKind: null, activeCategoryId: null,
    categoryPage: null, isPortalsOpen: false, canShowOwnPortalsWorkspace: false, nav: { home() {} },
    isWebReaderLoading: false, navigationState: null,
    ...overrides,
  });
  for (const name of appBoundaries) {
    vm.runInContext(appExpressions[name], context);
    context[name] = context.result;
  }
  return context;
}

test('portal motion scope follows the visible catalogue, viewer and access mode', () => {
  const category = { presentation: 'web', route: { kind: 'category' }, categoryPage: React.createElement('portal-index'), activeCategoryId: 'a' };
  const scope = profileRender(category).webPortalScope;
  assert.ok(scope);
  assert.equal(profileRender({ ...category, route: { kind: 'project' }, activeCategoryId: 'b' }).webPortalScope, scope);
  for (const change of [
    { viewedProfileId: 'another-creator' },
    { auth: { user: { id: 'another-account' } } },
    { isSharedRoute: true, route: { kind: 'sharedCategory' } },
  ]) assert.notEqual(profileRender({ ...category, ...change }).webPortalScope, scope);
  assert.equal(profileRender().webPortalScope, undefined);
  assert.equal(profileRender({ ...category, iconPickerCategoryId: 'a' }).webPortalScope, undefined);
  assert.equal(profileRender({ ...category, isProfileAccessDenied: true }).webPortalScope, undefined);
});

for (const presentation of ['mobile', 'web']) test(`saving density keeps the existing ${presentation} owner profile layer through its background refresh`, () => {
  const layers = harness(presentation);
  const ready = profileRender({ presentation });
  const refreshing = profileRender({ presentation, viewedProfileQuery: { status: 'loading' } });
  const confirmed = profileRender({ presentation, viewedProfile: { id: 'owner', name: 'Owner', projectGridColumns: 4 } });
  for (const state of [ready, refreshing, confirmed]) {
    assert.equal(state.isProfileRouteReady, true);
    assert.equal(state.routeStateView, null);
    layers.render(state.screenTransitionKey, state.mobileProfileKey);
  }
  assert.equal(refreshing.isOwnerProfileRefreshing, true);
  assert.equal(new Set(layers.calls.map(call => call.key)).size, 1, 'Open Layout controls must retain their mounted state until Done');
});

test('saving project order keeps the same mobile owner Portal open through its background refresh', () => {
  const layers = harness();
  const portal = { route: { kind: 'category' }, pathname: '/p/owner/c/portal', routeCategoryId: 'portal',
    activeCategoryId: 'portal', categoryPage: React.createElement('portal-index') };
  for (const status of ['ready', 'loading', 'ready']) {
    const state = profileRender({ ...portal, viewedProfileQuery: { status } });
    assert.equal(state.isOwnerProfileRefreshing, status === 'loading');
    assert.equal(state.isProfileRouteReady, true);
    assert.equal(state.routeStateView, null);
    layers.render(state.screenTransitionKey, state.mobileProfileKey);
  }
  assert.equal(new Set(layers.calls.map(call => call.key)).size, 1);
});

test('profile refresh preservation never applies to visitors, shares, other routes or account transitions', () => {
  const cases = [
    { viewedProfile: { id: 'another', name: 'Another creator' }, viewedProfileId: 'another', routeProfileId: 'another' },
    { route: { kind: 'sharedProfile' }, isSharedRoute: true },
    { route: { kind: 'sharedCategory' }, routeCategoryId: 'portal', isSharedRoute: true },
    { route: { kind: 'category' }, routeCategoryId: 'unknown' },
    { route: { kind: 'category' }, routeCategoryId: 'portal', presentation: 'web' },
    { route: { kind: 'category' }, routeCategoryId: 'portal', routeProfileId: 'another' },
    { route: { kind: 'category' }, routeCategoryId: 'portal', viewedProfile: null },
    { route: { kind: 'project' } },
    { viewedProfile: null },
    { auth: { user: null, viewerProfileId: null, isAuthenticated: false, phase: 'unauthenticated' } },
    { auth: { user: { id: 'account' }, viewerProfileId: 'owner', isAuthenticated: true, phase: 'signing-out' } },
    { auth: { user: { id: 'new-account' }, viewerProfileId: 'new-owner', isAuthenticated: true, phase: 'authenticated' } },
  ];
  for (const overrides of cases) {
    const state = profileRender({ viewedProfileQuery: { status: 'loading' }, ...overrides });
    assert.equal(state.isOwnerProfileRefreshing, false);
    assert.equal(state.isProfileRouteReady, false);
    assert.equal(state.routeStateView.type, 'loading');
    assert.equal(state.mobileProfileKey, undefined);
  }
});

test('failed or missing owner refresh replaces the gallery with the shared route error', () => {
  for (const [status, expected] of [['error', 'network'], ['not-found', 'not-found']]) {
    const state = profileRender({ viewedProfile: null, viewedProfileQuery: { status, error: 'Unavailable', retry() {} } });
    assert.equal(state.isProfileRouteReady, false);
    assert.equal(state.routeStateView.type, 'route-error');
    assert.equal(state.routeStateView.props.kind, expected);
    assert.equal(state.mobileProfileKey, undefined);
  }
});

test('a Timeline reader retains a separate mobile workspace from first load to ready', () => {
  const layers = harness();
  const origin = profileRender();
  const reader = { navigationState: { fromTimeline: true }, route: { kind: 'project' }, activeCategoryId: 'portal', pathname: '/p/owner/c/portal/project', categoryPage: React.createElement('reader') };
  const loading = profileRender({ ...reader, categoryPage: null, viewedProfile: null, viewedProfileQuery: { status: 'loading' } });
  const ready = profileRender(reader);
  for (const state of [origin, loading, ready, origin]) layers.render(state.screenTransitionKey, state.mobileProfileKey);
  const [before, pending, opened, after] = layers.calls.map(call => call.key);
  assert.notEqual(before, pending);
  assert.equal(pending, opened);
  assert.equal(after, before);
  assert.equal(profileRender({ ...reader, navigationState: null }).mobileProfileKey, origin.mobileProfileKey);
  assert.equal(profileRender({ ...reader, presentation: 'web' }).mobileProfileKey, origin.mobileProfileKey);
});
