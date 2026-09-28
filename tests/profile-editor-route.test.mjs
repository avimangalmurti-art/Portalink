import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { matchPath } from 'react-router-dom';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, imports, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URLSearchParams, ...globals, require: name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`);
    return imports[name];
  } });
  return exports;
}
const routes = load('src/app/routes.ts', { '../components/navigation': { navigationDestinations: [] } });
const plain = value => JSON.parse(JSON.stringify(value));
function harness(path = '/p/owner', initialState = null, index = 0) {
  const calls = [];
  const history = { state: { idx: index } };
  const parseLocation = (address, state) => {
    const url = new URL(address, 'https://portalink.example.test');
    return { pathname: url.pathname, search: url.search, hash: url.hash, state };
  };
  let location = parseLocation(path, initialState);
  let locationRef;
  const navigate = (target, options) => {
    calls.push([target, options]);
    if (typeof target === 'number') { history.state.idx += target; return; }
    location = parseLocation(target, options?.state ?? null);
    if (!options?.replace) history.state.idx++;
  };
  const routing = load('src/app/useAppRoute.ts', {
    react: { useEffect() {}, useMemo: fn => fn(), useRef: value => locationRef ??= { current: value } },
    'react-router-dom': { matchPath, useLocation: () => location, useNavigate: () => navigate },
    './routes': routes,
    '../types/engagement': { activityKindFromSlug: value => ({ likes: 'like', saved: 'save', reposts: 'repost' })[value] },
    '../utils/projectContinuity': { beginProjectContinuity: () => false },
  }, { window: { history } });
  return { routing, calls, history, nav: () => routing.useRouteNavigator(), location: () => location };
}

test('the editor has one account-protected URL with no target-profile parameter', () => {
  const h = harness('/profile/edit?profileId=another-account');
  assert.equal(routes.buildPath('profileEditor'), '/profile/edit');
  assert.deepEqual(plain(h.routing.useAppRoute()), { kind: 'profileEditor' });
  assert.ok(h.routing.PROTECTED_ROUTE_KINDS.has('profileEditor'));
  assert.equal(h.routing.describeRoute(h.routing.useAppRoute()), 'edit your profile');
  assert.equal(harness('/p/another-account/edit').routing.useAppRoute().kind, 'unknown');
  assert.deepEqual(plain(harness('/p/creator').routing.useAppRoute()), { kind: 'profile', profileId: 'creator' });
  assert.deepEqual(plain(harness('/share/creator').routing.useAppRoute()), { kind: 'sharedProfile', profileId: 'creator' });
});

test('Edit pushes one route and Back returns through browser history, including after refresh', () => {
  const h = harness('/p/owner?view=wall#work', null, 4);
  h.nav().profileEditor();
  assert.deepEqual(plain(h.calls), [['/profile/edit', { state: { profileEditorReturn: '/p/owner?view=wall#work' } }]]);
  assert.equal(h.history.state.idx, 5);
  h.nav().profileEditor();
  assert.equal(h.calls.length, 1, 'Already editing must not push another editor entry.');
  const refreshed = harness('/profile/edit', plain(h.location().state), h.history.state.idx);
  refreshed.nav().closeProfileEditor('owner');
  assert.deepEqual(refreshed.calls[0], [-1, undefined]);
  h.nav().closeProfileEditor('owner');
  assert.deepEqual(h.calls.at(-1), [-1, undefined]);
});

test('direct editor entry returns to the current owner profile without navigating outside the app', () => {
  for (const index of [0, 7]) {
    const h = harness('/profile/edit', null, index);
    h.nav().closeProfileEditor('current-owner');
    assert.deepEqual(plain(h.calls), [['/p/current-owner', { replace: true }]]);
  }
  const noProfile = harness('/profile/edit');
  noProfile.nav().closeProfileEditor(null);
  assert.deepEqual(plain(noProfile.calls), [['/', { replace: true }]]);
});

test('invalid or copied return state cannot create a Back loop or external fallback', () => {
  for (const state of [null, {}, { profileEditorReturn: 1 }, { profileEditorReturn: 'https://elsewhere.test/' },
    { profileEditorReturn: '//elsewhere.test/' }, { profileEditorReturn: '/profile/edit?again=true' }]) {
    const h = harness('/profile/edit', state, 4);
    h.nav().closeProfileEditor('owner');
    assert.deepEqual(plain(h.calls), [['/p/owner', { replace: true }]]);
  }
  const copied = harness('/profile/edit', { profileEditorReturn: '/p/owner' }, 0);
  copied.nav().closeProfileEditor('owner');
  assert.deepEqual(plain(copied.calls), [['/p/owner', { replace: true }]]);
});

test('the added helpers leave ordinary profile, public profile and browser Back navigation unchanged', () => {
  const h = harness();
  const nav = h.nav();
  nav.profile('creator'); nav.sharedProfile('public-creator'); nav.back();
  assert.deepEqual(h.calls, [['/p/creator', undefined], ['/share/public-creator', undefined], [-1, undefined]]);
});

const app = read('src/App.tsx');
const parsed = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNode(predicate) {
  let found;
  const visit = node => { if (found) return; if (predicate(node)) { found = node; return; } ts.forEachChild(node, visit); };
  visit(parsed);
  assert.ok(found, 'Expected application expression');
  return found;
}
function evaluate(expression, values) {
  const code = ts.transpileModule(`result = (${expression});`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { React, ...values, result: null };
  vm.runInNewContext(code, context);
  return context.result;
}
const initializer = name => findNode(node => ts.isVariableDeclaration(node) && node.name.getText(parsed) === name).initializer.getText(parsed);

test('the editor record comes only from authenticated ownership, never URL or viewed profile state', () => {
  for (const owner of ['account-owned-profile', null]) {
    const target = evaluate(initializer('routeProfileId'), {
      isProfileEditorRoute: true, auth: { viewerProfileId: owner }, route: { kind: 'profileEditor', profileId: 'other-profile' },
    });
    assert.equal(target, owner);
  }
});

test('loading, signed-out and missing-profile entries cannot render the editor form', () => {
  const EmptyState = () => null, LoadingState = () => null;
  const base = { EmptyState, LoadingState, isProfileEditorRoute: true, route: { kind: 'profileEditor' },
    describeRoute: () => 'edit your profile', closeProfileEditor() {}, buildPath: routes.buildPath,
    deferredIntentRef: { current: null }, setIsOnboardingOpen() {},
  };
  const loading = evaluate(initializer('routeStateView'), { ...base, auth: { isInitializing: true } });
  assert.equal(loading.type, LoadingState);
  const signedOut = evaluate(initializer('routeStateView'), { ...base, isRouteBlocked: true, auth: { phase: 'unauthenticated', requestAuth() {} } });
  assert.equal(signedOut.props.title, 'Sign in required');
  let opened = false;
  const missing = evaluate(initializer('routeStateView'), { ...base, isRouteBlocked: false,
    auth: { phase: 'authenticated', viewerProfileId: null, user: { isEmailVerified: true } },
    setIsOnboardingOpen: value => { opened = value; },
  });
  assert.equal(missing.props.title, 'Create your profile first');
  missing.props.action.onClick();
  assert.equal(opened, true);
  assert.equal(base.deferredIntentRef.current.path, '/profile/edit');
});

test('the editor is mounted in the routed screen, with one shared Back/Save callback and no sidebar', () => {
  const ProfileEditorPage = () => null;
  const close = () => {};
  const screen = evaluate(initializer('screenContent'), {
    isProfileEditorRoute: true, routeStateView: null,
    auth: { isAuthenticated: true, viewerProfileId: 'owned-profile' },
    ProfileEditorPage, closeProfileEditor: close, LoadingState: () => null,
  });
  const page = screen.props.children.props.children;
  assert.equal(page.type, ProfileEditorPage);
  assert.equal(page.props.profileId, 'owned-profile');
  assert.equal(page.props.onClose, close);
  assert.equal(page.props.onSaved, close);
  assert.equal(page.props.isOpen, undefined);
  assert.equal(screen.props['data-screen-scroll'], 'nested');
  const sidebar = findNode(node => ts.isJsxExpression(node) && node.expression?.getText(parsed).startsWith('!isProfileEditorRoute && (isSharedRoute')).expression.getText(parsed);
  assert.equal(evaluate(sidebar, { isProfileEditorRoute: true }), false);
  assert.match(app, /snapshot=\{\{[^}]*content: screenContent/);
  assert.doesNotMatch(app, /isProfileEditorOpen|setIsProfileEditorOpen|<ProfileEditorDialog\b/);
});


test('Settings is a public page with an appearance compatibility URL and safe Back behavior', () => {
  for (const path of ['/settings', '/settings/', '/appearance', '/appearance/']) {
    const h = harness(path);
    assert.equal(h.routing.useAppRoute().kind, 'controlCenter');
    assert.equal(h.routing.PROTECTED_ROUTE_KINDS.has('controlCenter'), false);
    h.nav().closeSettings();
    assert.deepEqual(plain(h.calls), [['/', { replace: true }]]);
  }
  const h = harness('/share/creator/c/portal/project?page=2#page', null, 3);
  h.nav().controlCenter();
  assert.deepEqual(plain(h.calls), [['/settings', { state: { settingsReturn: '/share/creator/c/portal/project?page=2#page' } }]]);
  h.nav().controlCenter();
  assert.equal(h.calls.length, 1);
  const refreshed = harness('/settings', plain(h.location().state), h.history.state.idx);
  refreshed.nav().closeSettings();
  assert.deepEqual(refreshed.calls, [[-1, undefined]]);
  for (const value of ['//outside.test', 'https://outside.test', '/settings', '/appearance']) {
    const invalid = harness('/settings', {settingsReturn:value}, 2);
    invalid.nav().closeSettings();
    assert.deepEqual(plain(invalid.calls), [['/', {replace:true}]]);
  }
});
