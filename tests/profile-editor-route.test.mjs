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
    if (!(name in imports) && name.endsWith('/cataloguePageNavigation')) return { withCataloguePageTarget: href => href };
    assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`);
    return imports[name];
  } });
  return exports;
}
const navigation = load('src/components/navigation.ts', {});
const routes = load('src/app/routes.ts', { '../components/navigation': navigation });
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

test('retired editorial feed URLs remain not-found without changing Home or current content routes', () => {
  for (const path of ['/feed', '/feed/today', '/feed/apps', '/feed/following', '/feed/graphic-design?source=old-link', '/feed/unknown']) {
    assert.deepEqual(plain(harness(path).routing.useAppRoute()), { kind: 'unknown' }, path);
  }
  assert.deepEqual(plain(harness('/').routing.useAppRoute()), { kind: 'home' });
  assert.deepEqual(plain(harness('/portalink/gn-5391959').routing.useAppRoute()), { kind: 'portalink', locationId: 'gn-5391959' });
});

test('existing mp_screen links still translate their stored presets without reviving retired feeds', () => {
  const manifest = load('src/canvas.manifest.js', {});
  const routing = harness().routing;
  for (const [screen, expectedPath, expectedKind] of [
    ['scr_aedyru', '/', 'home'],
    ['scr_kt0q8b', '/search', 'search'],
    ['scr_us7bd2', '/studio', 'studio'],
    ['scr_cbdbey', '/p/avi/c/graphic-design', 'category'],
    ['scr_rs9ks3', '/p/avi/c/graphic-design/cool-calm-and-collected', 'project'],
  ]) {
    const { useScreenInit } = load('src/useScreenInit.js', {
      react: { useMemo: create => create() }, './canvas.manifest.js': manifest,
    }, { window: { location: { search: `?mp_screen=${screen}` } } });
    const path = routing.screenPresetPath(useScreenInit());
    assert.equal(path, expectedPath, screen);
    assert.equal(harness(path).routing.useAppRoute().kind, expectedKind);
  }
  const retired = routing.screenPresetPath({ activeDestination: 'Games' });
  assert.equal(retired, '/feed/games');
  assert.equal(harness(retired).routing.useAppRoute().kind, 'unknown');
  assert.equal(routing.screenPresetPath({ activeDestination: 'not-a-destination' }), null);
  const { useScreenInit } = load('src/useScreenInit.js', {
    react: { useMemo: create => create() }, './canvas.manifest.js': manifest,
  }, { window: { location: { search: '?mp_screen=not-a-screen' } } });
  assert.equal(routing.screenPresetPath(useScreenInit()), null);
});

test('collaboration has dedicated creator URLs and stays readable without an account', () => {
  for (const [shared, kind, prefix] of [[false, 'collaboration', '/p'], [true, 'sharedCollaboration', '/share']]) {
    const path = `${prefix}/creator/collaboration`;
    const h = harness(path);
    assert.equal(routes.buildPath(kind, { profileId: 'creator' }), path);
    assert.deepEqual(plain(h.routing.useAppRoute()), { kind, profileId: 'creator' });
    assert.equal(h.routing.PROTECTED_ROUTE_KINDS.has(kind), false);
    h.nav().closeCollaboration('creator', shared);
    assert.deepEqual(plain(h.calls), [[`${prefix}/creator`, { replace: true }]]);
  }
});

test('collaboration Back retains the exact profile tab through history and survives refresh', () => {
  for (const shared of [false, true]) {
    const prefix = shared ? '/share' : '/p';
    const from = `${prefix}/creator?view=portals#work`;
    const h = harness(from, null, 2);
    h.nav().collaboration('creator', shared);
    assert.deepEqual(plain(h.calls), [[`${prefix}/creator/collaboration`, { state: { collaborationReturn: from } }]]);
    const refreshed = harness(`${prefix}/creator/collaboration`, plain(h.location().state), h.history.state.idx);
    refreshed.nav().closeCollaboration('creator', shared);
    assert.deepEqual(refreshed.calls, [[-1, undefined]]);
  }
});

test('collaboration direct entry and invalid return state fall back to the matching creator', () => {
  for (const shared of [false, true]) for (const index of [0, 5]) {
    const prefix = shared ? '/share' : '/p';
    for (const value of [undefined, 1, '//elsewhere.test', '/messages', '/p/other', `${prefix}/creator/collaboration`]) {
      const h = harness(`${prefix}/creator/collaboration`, { collaborationReturn: value }, index);
      h.nav().closeCollaboration('creator', shared);
      assert.deepEqual(plain(h.calls), [[`${prefix}/creator`, { replace: true }]]);
    }
  }
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

test('mobile Collaboration has its own destination while Message and WEB keep their existing action', () => {
  const callback = name => findNode(node => ts.isJsxAttribute(node) && node.name.getText(parsed) === name).initializer.expression.getText(parsed);
  for (const presentation of ['mobile', 'web']) for (const isSharedRoute of [false, true]) {
    const calls = [];
    const values = { presentation, isSharedRoute, viewedProfile: { id: 'creator' }, auth: { viewerProfileId: 'viewer' },
      nav: { collaboration: (...args) => calls.push(['collaboration', ...args]) }, openMessages: id => calls.push(['messages', id]) };
    evaluate(callback('onCollaboration'), values)();
    assert.deepEqual(calls, presentation === 'mobile' ? [['collaboration', 'creator', isSharedRoute]] : [['messages', 'creator']]);
    calls.length = 0;
    evaluate(callback('onMessage'), values)();
    assert.deepEqual(calls, [['messages', 'creator']]);
  }
});

test('collaboration resolves the routed creator through the existing profile access boundary', () => {
  for (const kind of ['collaboration', 'sharedCollaboration']) {
    const route = { kind, profileId: 'creator' };
    assert.equal(evaluate(initializer('routeProfileId'), { route, isProfileEditorRoute: false, auth: {} }), 'creator');
    assert.equal(evaluate(initializer('isSharedRoute'), { route }), kind === 'sharedCollaboration');
    assert.equal(evaluate(initializer('isCollaborationOpen'), { route }), true);
  }
});

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
  const profileEditorOrigin = { opener: {}, main: {} };
  const screen = evaluate(initializer('screenContent'), {
    isProfileEditorRoute: true, routeStateView: null,
    auth: { isAuthenticated: true, viewerProfileId: 'owned-profile' },
    ProfileEditorPage, profileEditorOrigin, closeProfileEditor: close, LoadingSkeleton: () => null, openingProjectId:null, isMobileStudioOpen:false,
    DeferredSurfaceBoundary: 'DeferredSurfaceBoundary', screenTransitionKey: 'profile-editor-owned-profile',
  });
  assert.equal(screen.props.children.type, 'DeferredSurfaceBoundary');
  const page = screen.props.children.props.children.props.children;
  assert.equal(page.type, ProfileEditorPage);
  assert.equal(page.props.profileId, 'owned-profile');
  assert.equal(page.props.onClose, close);
  assert.equal(page.props.onSaved, close);
  assert.equal(page.props.returnFocusTarget, profileEditorOrigin);
  assert.equal(page.props.isOpen, undefined);
  assert.equal(screen.props['data-screen-scroll'], 'nested');
  const sidebar = findNode(node => ts.isJsxExpression(node) && node.expression?.getText(parsed).startsWith('!isProfileEditorRoute &&') && node.expression?.getText(parsed).includes('<Sidebar')).expression.getText(parsed);
  assert.equal(evaluate(sidebar, { isProfileEditorRoute: true }), false);
  const RouteError = () => null;
  assert.equal(evaluate(sidebar, { isProfileEditorRoute: false, routeStateView: {type: RouteError}, RouteError, auth: {isAuthenticated: false} }), false, 'Signed-out error screens have no dock');
  const snapshot=findNode(node=>ts.isJsxAttribute(node)&&node.name.getText(parsed)==='snapshot').initializer.expression.getText(parsed);
  const values={screenMainClassName:'main',screenAriaLabel:'editor',isSharedRoute:false,projectNavigation:{resolution:{state:'ready'}},routeItemId:null,screenContent:screen};
  assert.equal(evaluate(snapshot,values).content,screen,'The routed editor remains the active screen content');
  const LoadingSkeleton=()=>null;
  const pending=evaluate(snapshot,{...values,projectNavigation:{resolution:{state:'loading',projectId:'work'}},LoadingSkeleton});
  assert.equal(pending.content.type,LoadingSkeleton);assert.equal(pending.content.props.projectId,'work');
  assert.equal(evaluate(snapshot,{...values,isSharedRoute:true,projectNavigation:{resolution:{state:'loading'}}}).content,screen,'Visitor routes keep their existing read boundary');
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
