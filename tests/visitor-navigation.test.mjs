import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const compiled = new Map();
function load(path, require, globals = {}) {
  if (!compiled.has(path)) compiled.set(path, ts.transpileModule(source(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText);
  const exports = {};
  vm.runInNewContext(compiled.get(path), { exports, require, URL, ...globals });
  return exports;
}
const routes = load('app/routes.ts', () => ({ navigationDestinations: [] }));
const registration = load('features/auth/registration.ts', () => ({}));
const intents = load('features/auth/interactionIntent.ts', () => registration);
const panels = load('utils/projectPanelLayout.ts');
const profileId = '11111111-1111-4111-8111-111111111111';
const profile = { id: profileId, name: 'Creator', links: [], socialLinks: {}, categories: [{ id: 'portal', label: 'Photography' }],
  projects: [{ id: 'work', categoryId: 'portal', title: 'A project', attachments: [] }, { id: 'next', categoryId: 'portal', title: 'Next project', isPinned: true }] };
const appearance = { theme: 'light', mode: 'system', accentColor: '#336699', systemGray: 'gray', highContrast: false, reduceTranslucency: false,
  chooseMode() {}, chooseAppearance() {} };
const named = name => ({ [name]: name });
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const one = (tree, type) => nodes(tree).find(node => node.type === type);
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] === label || node.props.children === label));
const json = value => JSON.parse(JSON.stringify(value));

// Executes the actual components with a deterministic hook lifecycle. Descendant
// components remain boundaries: no browser, Auth, network or Storage writes.
function hooks() {
  const states = [], refs = [], memos = [], effects = [];
  let stateIndex, refIndex, memoIndex, effectIndex, dirty, pending;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = { ...React,
    lazy: loader => `lazy:${loader.toString().match(/require\(['"]([^'"]+)/)?.[1]}`,
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => {
        const next = typeof value === 'function' ? value(states[index]) : value;
        if (!Object.is(states[index], next)) { states[index] = next; dirty = true; }
      }];
    },
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useMemo(fn, deps) {
      const index = memoIndex++;
      if (!equal(memos[index]?.deps, deps)) memos[index] = { deps, value: fn() };
      return memos[index].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const index = effectIndex++;
      if (!equal(effects[index]?.deps, deps)) {
        pending.push(() => { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: fn() }; });
      }
    },
  };
  function render(fn) {
    let tree;
    for (let pass = 0; pass < 12; pass++) {
      stateIndex = refIndex = memoIndex = effectIndex = 0; pending = []; dirty = false;
      tree = fn(); pending.forEach(effect => effect());
      if (!dirty) return tree;
    }
    throw new Error('Component did not settle');
  }
  return { react, render };
}
function appHarness() {
  const h = hooks(), assigned = [], replaced = [], navigations = [], queryCalls = [], requests = [];
  let pendingIntent = null;
  const state = { route: { kind: 'sharedProfile', profileId }, location: { pathname: `/share/${profileId}`, search: '', hash: '', state: null }, presentation: 'mobile',
    query: { status: 'ready', profile, error: null, retry() {} },
    auth: { phase: 'unauthenticated', isAuthenticated: false, isInitializing: false, viewerProfileId: null, user: null, session: null, needsProfileSetup: false, pendingView: null,
      peekPendingIntent: () => pendingIntent,
      consumePendingIntent: () => { const value = pendingIntent; pendingIntent = null; return value; },
      requestAuthenticatedDestination: intent => { requests.push(intent); pendingIntent = intent; },
      closeAuth: () => { state.auth = { ...state.auth, pendingView: null }; },
    } };
  const window = { history: { state: { idx: 1 } }, location: { assign: path => assigned.push(path), replace: path => replaced.push(path) } };
  const document = { documentElement: { dataset: {}, style: {} }, body: { classList: { toggle() {} } }, querySelector: () => null };
  const { VisitorApp } = load('visitor/VisitorApp.tsx', name => {
    if (name === 'react') return h.react;
    if (name.endsWith('.css')) return {};
    if (name === 'react-router-dom') return { useLocation: () => state.location, useNavigate: () => (path, options) => navigations.push([path, options]) };
    if (name === '../app/useAppRoute') return { useAppRoute: () => state.route };
    if (name === '../app/routes') return routes;
    if (name === '../contexts/AuthContext') return { useAuth: () => state.auth };
    if (name === '../features/profile/useSharedProfileQuery') return { useSharedProfileQuery: (...args) => { queryCalls.push(args); return args[0] ? state.query : { status: 'idle', profile: null }; } };
    if (name === '../hooks/useDeviceAppearance') return { useDeviceAppearance: () => appearance };
    if (name === '../presentation/usePresentation') return { usePresentation: () => state.presentation };
    if (name === '../features/auth/registration') return registration;
    if (name === '../features/auth/interactionIntent') return intents;
    if (name === '../utils/accentTokens') return { resolveAccentTokens: () => ({}) };
    if (name === '../utils/macTokens') return { resolveMacTokens: () => ({}) };
    if (name === '../data/navButtonTokens') return { resolveNavButtonTokens: () => ({}) };
    if (name === '../components/ui/DeferredDialog') return { DeferredDialog: 'DeferredDialog', DeferredSurface: 'DeferredSurface', DeferredSurfaceBoundary: 'DeferredSurfaceBoundary' };
    const component = name.split('/').at(-1);
    if (['AppPresentation', 'MobileBackNavigation', 'SharedProfileSidebar', 'SharedSignInBar', 'VisitorProfileGrid'].includes(component)) return named(component === 'MobileBackNavigation' ? 'MobileBackProvider' : component);
    throw new Error(name);
  }, { window, document, requestAnimationFrame: fn => { fn(); return 1; } });
  return { state, assigned, replaced, navigations, queryCalls, requests, window,
    render: () => h.render(VisitorApp), pending: intent => { pendingIntent = intent; },
    signedIn(overrides = {}) { state.auth = { ...state.auth, phase: 'authenticated', isAuthenticated: true, viewerProfileId: 'viewer', user: { id: 'account', profileId: 'viewer' }, session: { user: { id: 'account', profileId: 'viewer', isEmailVerified: true } }, ...overrides }; },
  };
}

test('shared messaging uses the canonical recipient key, gates guests without sending, and avoids a self-recipient', () => {
  const h = appHarness();
  one(h.render(), 'VisitorProfileGrid').props.onMessage();
  assert.equal(h.assigned.length, 0);
  assert.deepEqual(json(h.requests[0]), { kind: 'route', path: `/share/${profileId}`, label: 'message this creator' });
  h.signedIn(); h.render();
  assert.deepEqual(json(h.navigations.at(-1)), [`/share/${profileId}`, { replace: true }]);
  one(h.render(), 'VisitorProfileGrid').props.onMessage();
  assert.equal(h.assigned.at(-1), `/messages?recipient=${profileId}`);
  h.signedIn({ viewerProfileId: profileId });
  one(h.render(), 'VisitorProfileGrid').props.onMessage();
  assert.equal(h.assigned.at(-1), '/messages');
});

test('immediate signup finishes canonical onboarding once and returns to the same shared document', () => {
  const h = appHarness(), path = `/share/${profileId}/c/portal/work?page=2&media=pdf`;
  h.state.auth = { ...h.state.auth, phase: 'authenticating' }; h.render();
  const user = { id: 'account', isEmailVerified: true, profileId: null, registration: { id: 'registration', returnPath: path } };
  h.signedIn({ viewerProfileId: null, needsProfileSetup: true, user, session: { user }, pendingView: 'signUp' });
  const tree = h.render(), onboarding = one(tree, 'lazy:../features/profile/ProfileOnboardingDialog');
  assert.ok(onboarding);
  assert.equal(one(tree, 'DeferredDialog').props.active, false);
  assert.equal(h.assigned.length, 0);
  h.signedIn({ user: { ...user, profileId: 'viewer' }, session: { user: { ...user, profileId: 'viewer' } } });
  onboarding.props.onComplete('viewer'); h.render();
  assert.deepEqual(json(h.navigations), [[path, { replace: true }]]);
  assert.equal(one(h.render(), 'lazy:../features/profile/ProfileOnboardingDialog'), undefined);
});

test('restored verification resumes setup, but recovery never opens onboarding', () => {
  const h = appHarness(), user = { id: 'account', isEmailVerified: true, registration: { id: 'registration' } };
  h.signedIn({ viewerProfileId: null, needsProfileSetup: true, user, session: { user, isPasswordRecovery: true }, pendingView: 'resetPassword' });
  assert.equal(one(h.render(), 'lazy:../features/profile/ProfileOnboardingDialog'), undefined);
  assert.equal(one(h.render(), 'DeferredDialog').props.active, true);
  h.signedIn({ viewerProfileId: null, needsProfileSetup: true, user, session: { user }, pendingView: null });
  assert.ok(one(h.render(), 'lazy:../features/profile/ProfileOnboardingDialog'));
});

test('an authenticated reader without a profile returns to their intended recipient after setup', () => {
  const h = appHarness(); h.signedIn({ viewerProfileId: null, needsProfileSetup: true });
  one(h.render(), 'VisitorProfileGrid').props.onMessage();
  const onboarding = one(h.render(), 'lazy:../features/profile/ProfileOnboardingDialog');
  assert.equal(onboarding.props.completionActionLabel, 'Continue to messages');
  onboarding.props.onComplete('new-profile');
  assert.equal(h.assigned.at(-1), `/messages?recipient=${profileId}`);
});

test('shared Settings retains its portfolio query, appearance handlers and Back destination', () => {
  const h = appHarness();
  one(h.render(), 'SharedProfileSidebar').props.onSettingsOpen();
  assert.deepEqual(json(h.navigations.at(-1)), ['/settings', { state: { settingsReturn: `/share/${profileId}` } }]);
  h.state.route = { kind: 'controlCenter' }; h.state.location = { pathname: '/settings', search: '', hash: '', state: { settingsReturn: `/share/${profileId}` } };
  const settings = one(h.render(), 'lazy:../components/ControlCenterPage');
  assert.equal(h.replaced.length, 0);
  assert.equal(settings.props.onAppearanceModeChange, appearance.chooseMode);
  assert.equal(h.queryCalls.at(-1)[0], profileId);
  settings.props.onBack(); assert.equal(h.navigations.at(-1)[0], -1);
});

test('invalid shared URLs render not-found without reads, retries or an HTML reload loop; platform routes hand off', () => {
  const h = appHarness();
  for (const [route, pathname] of [[{ kind: 'unknown' }, `/share/${profileId}/invalid/suffix`], [{ kind: 'sharedProfile', profileId: 'malformed' }, '/share/malformed']]) {
    h.state.route = route; h.state.location = { pathname, search: '', hash: '', state: null };
    const tree = h.render();
    assert.equal(h.queryCalls.at(-1)[0], null);
    assert.equal(nodes(tree).find(node => node.props?.role === 'alert').props.children, 'This shared page could not be found.');
    assert.equal(button(tree, 'Try again'), undefined);
  }
  assert.deepEqual(h.replaced, []);
  h.state.route = { kind: 'messages' }; h.state.location = { pathname: '/messages', search: '?recipient=creator', hash: '', state: null }; h.render();
  assert.deepEqual(h.replaced, ['/messages?recipient=creator']);
});

function readerHarness(presentation = 'mobile', width = 390) {
  const h = hooks(), selected = [], statuses = {};
  const state = { project: { ...profile.projects[0], attachments: [] }, width, presentation };
  const { VisitorProjectPage } = load('visitor/VisitorProjectPage.tsx', name => {
    if (name === 'react') return h.react;
    if (name === 'lucide-react') return { ChevronLeftIcon: 'ChevronLeftIcon', ListIcon: 'ListIcon', XIcon: 'XIcon' };
    if (name === '../presentation/usePresentation') return { usePresentation: () => state.presentation };
    if (name === '../components/ui/ResizablePanelHandle') return { useResizablePanelWidth: () => ({ width: 280, preferredWidth: 280 }) };
    if (name === '../features/media/useAssetProcessing') return { useAssetProcessing: () => ({ statuses }) };
    if (name === '../data/typefaces') return { getTypefaceStack: () => 'sans-serif' };
    if (name === '../utils/panelLayoutDefaults') return { panelLayoutDefaults: { sharedDetails: 280 } };
    if (name === '../hooks/useElementSize') return { useElementSize: () => ({ width: state.width, ref: null }) };
    if (name === '../utils/projectPanelLayout') return panels;
    if (name === '../components/media/ProjectMediaViewer') return named('ProjectMediaViewer');
    if (name === '../components/ui/InterfaceIcon') return named('InterfaceIcon');
    if (name === '../components/profile/ProjectIndexList') return named('ProjectIndexList');
    if (name === '../components/profile/MobilePortalProjectToolbar') return named('MobilePortalProjectToolbar');
    throw new Error(name);
  }, { requestAnimationFrame: fn => fn() });
  return { state, statuses, selected, render: () => h.render(() => VisitorProjectPage({ profile, project: state.project, onBack: () => selected.push('back'), onBackToProfile: () => selected.push('profile'), onSelect: id => selected.push(id) })) };
}

test('mobile reader exposes Back and a framed, dismissible, scrollable project list', () => {
  const h = readerHarness(); let tree = h.render();
  button(tree, 'Go back').props.onClick(); assert.deepEqual(h.selected, ['back']);
  button(tree, 'Project list').props.onClick(); tree = h.render();
  assert.equal(button(tree, 'Go back'), undefined);
  const navigation = one(tree, 'ProjectMediaViewer').props.mobileNavigation;
  assert.equal(navigation.isIndexOpen, true);
  assert.equal(navigation.index.props['data-project-index-panel'], '');
  assert.ok(one(navigation.index, 'nav').props.className.includes('overflow-y-auto'));
  const list = one(navigation.index, 'ProjectIndexList');
  assert.equal(list.props.isOwner, false); assert.equal(list.props.sharedReadOnly, true);
  assert.deepEqual(list.props.projects.map(item => item.id), ['work', 'next']);
  assert.deepEqual(json(list.props.pinnedIds), ['next']);
  assert.equal(one(navigation.index, 'MobilePortalProjectToolbar').props.category.label, 'Photography');
  one(navigation.index, 'MobilePortalProjectToolbar').props.onBack();
  list.props.onSelect('next');
  assert.deepEqual(h.selected, ['back', 'profile', 'next']);
  assert.equal(one(h.render(), 'ProjectMediaViewer').props.mobileNavigation.isIndexOpen, false);
  one(h.render(), 'ProjectMediaViewer').props.onPageFocusModeChange(true);
  assert.equal(button(h.render(), 'Go back'), undefined);
});

test('desktop collapsed details use a 52px rail and narrow layouts allocate one readable panel', () => {
  const h = readerHarness('web', 900); let tree = h.render(), viewer = one(tree, 'ProjectMediaViewer');
  assert.equal(viewer.props.responseRailWidth.width, 52);
  assert.equal(viewer.props.mobileNavigation, undefined);
  viewer.props.onRailOpenChange(true); tree = h.render();
  assert.equal(one(tree, 'ProjectMediaViewer').props.responseRailWidth.width, 280);
  h.state.width = 500; tree = h.render(); viewer = one(tree, 'ProjectMediaViewer');
  assert.equal(viewer.props.singlePanel, 'response'); assert.equal(viewer.props.responseRailWidth.width, 500);
  viewer.props.onRailOpenChange(false); tree = h.render();
  button(tree, 'Project list').props.onClick(); tree = h.render();
  assert.equal(one(tree, 'ProjectMediaViewer').props.singlePanel, 'index');
  assert.equal(one(tree, 'section').props.style.display, 'none');
  one(tree, 'input').props.onChange({ target: { value: 'NEXT' } }); tree = h.render();
  assert.deepEqual(one(tree, 'ProjectIndexList').props.projects.map(item => item.id), ['next']);
});

test('document catalog callbacks resolve truthful aggregate page counts without enabling owner density writes', () => {
  const h = readerHarness();
  h.state.project.attachments = [{ id: 'one', kind: 'document', metadata: { pageCount: 3 } }, { id: 'two', kind: 'document' }];
  let viewer = one(h.render(), 'ProjectMediaViewer');
  assert.equal(viewer.props.pageCount, null);
  assert.equal(viewer.props.readOnlyShare, true); assert.equal(viewer.props.onPagesPerRowChange, undefined);
  viewer.props.onDocumentPageCountResolved('two', 5);
  assert.equal(one(h.render(), 'ProjectMediaViewer').props.pageCount, 8);
  h.state.project = { ...h.state.project, pageCount: 12 };
  assert.equal(one(h.render(), 'ProjectMediaViewer').props.pageCount, 12);
});

test('profile options omit self-follow, recover failed state, and preserve the existing portals/category views', () => {
  const h = hooks(), followed = [], state = { own: true, resolveError: null, search: new URLSearchParams(), categoryId: null };
  const { VisitorProfileGrid } = load('visitor/VisitorProfileGrid.tsx', name => {
    if (name === 'react') return h.react;
    if (name.endsWith('.css')) return {};
    if (name === 'lucide-react') return { MoreHorizontalIcon: 'MoreHorizontalIcon' };
    if (name === 'react-router-dom') return { useSearchParams: () => [state.search] };
    if (name === '../app/routes') return routes;
    if (name === '../contexts/AuthContext') return { useAuth: () => ({ isAuthenticated: true, viewerProfileId: state.own ? profileId : 'other' }) };
    if (name === '../features/follows/useFollows') return { useFollows: id => { followed.push(id); return { resolveError: state.resolveError, retryResolve: () => { state.resolveError = null; } }; } };
    if (name === '../features/auth/interactionIntent') return intents;
    if (name === '../features/profile/useProjectGridDensity') return { useProjectGridDensity: () => ({ columns: 3 }) };
    if (name === '../features/profile/profileLinks') return { resolveProfileLinks: (links, socialLinks) => { assert.equal(links, profile.links); assert.equal(socialLinks, profile.socialLinks); return links; } };
    if (name === '../utils/projectPresentation') return { getProjectAspectRatio: () => 1 };
    return named(name.split('/').at(-1));
  });
  const render = () => h.render(() => VisitorProfileGrid({ profile, categoryId: state.categoryId, onOpen() {}, onMessage() {}, onCollaboration() {}, onBack() {} }));
  button(render(), 'Profile options').props.onClick();
  assert.equal(one(render(), 'PlatformGrid').props.isSharedView, true);
  assert.equal(button(render(), 'Follow'), undefined); assert.equal(followed.at(-1), null);
  state.own = false; state.resolveError = 'Unavailable';
  assert.equal(one(render(), 'PlatformGrid').props.isSharedView, true);
  assert.equal(button(render(), 'Follow'), undefined); button(render(), 'Try again').props.onClick();
  assert.ok(button(render(), 'Follow'));
  state.search.set('view', 'portals');
  const collection = one(render(), 'lazy:../components/profile/ProfileCollectionGrid');
  assert.equal(collection.props.shared, true); assert.equal(collection.props.kind, 'portals');
  state.categoryId = 'portal';
  assert.ok(button(render(), 'Back to profile')); assert.equal(one(render(), 'h2').props.children, 'Photography');
  assert.equal(one(render(), 'lazy:../components/profile/ProfileCollectionGrid'), undefined);
});
