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
  vm.runInNewContext(compiled.get(path), { exports, require, URL, URLSearchParams, ...globals });
  return exports;
}
const routes = load('app/routes.ts', () => ({ navigationDestinations: [] }));
const shareModel = load('features/sharing/shareModel.ts', () => ({}));
const registration = load('features/auth/registration.ts', () => shareModel);
const intents = load('features/auth/interactionIntent.ts', () => registration);
const panels = load('utils/projectPanelLayout.ts');
const employer = load('features/employer/employer.ts');
const profileId = '11111111-1111-4111-8111-111111111111';
const profile = { id: profileId, name: 'Creator', links: [], socialLinks: {}, categories: [{ id: 'portal', label: 'Photography' }],
  projects: [{ id: 'work', categoryId: 'portal', title: 'A project', attachments: [] }, { id: 'next', categoryId: 'portal', title: 'Next project', isPinned: true }] };
const appearance = { theme: 'light', systemTheme: 'light', mode: 'auto', accentColor: '#336699', systemGray: 'gray', highContrast: false, reduceTranslucency: false,
  chooseMode() {}, chooseAppearance() {} };

test('failed handle lookup cannot trap Back navigation to a UUID project', async () => {
  const h = hooks();
  let location = { pathname: '/creator', search: '' };
  const profiles = { resolvePublicHandle: async () => { throw new Error('offline'); } };
  const navigate = () => {};
  const { useHandleRoute } = load('visitor/useHandleRoute.ts', name => {
    if (name === 'react') return h.react;
    if (name === 'react-router-dom') return { useLocation: () => location, useNavigate: () => navigate };
    if (name === '../contexts/ServicesContext') return { useServices: () => ({ profiles }) };
    if (name === '../features/sharing/shareModel') return shareModel;
    if (name === '../features/profile/visitorPreview') return load('features/profile/visitorPreview.ts', () => routes);
    if (name === '../features/profile/VisitorPreviewBar') return named('VisitorPreviewBar');
    throw new Error(name);
  }, { window: {} });
  h.render(() => useHandleRoute({ kind: 'unknown' }));
  await Promise.resolve(); await Promise.resolve();
  assert.match(h.render(() => useHandleRoute({ kind: 'unknown' })).error, /try again/);
  location = { pathname: `/share/${profileId}/c/portal/work`, search: '' };
  const project = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' };
  const restored = h.render(() => useHandleRoute(project));
  assert.equal(restored.error, ''); assert.equal(restored.pending, false); assert.equal(restored.route, project);
});
const named = name => ({ [name]: name });
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const one = (tree, type) => nodes(tree).find(node => node.type === type);
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] === label || node.props.children === label));
const json = value => JSON.parse(JSON.stringify(value));

function portalPopupFixture(presentation = 'mobile') {
  const focusCalls = [];
  const { PortalProjectPopup } = load('components/profile/PortalProjectPopup.tsx', name => {
    if (name === 'react') return { ...React, useRef: () => ({ current: null }) };
    if (name.endsWith('.css')) return {};
    if (name.endsWith('/useModalFocus')) return { useModalFocus: (...args) => focusCalls.push(args) };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/typefaces')) return { getTypefaceStack: id => `stack:${id}` };
    const component = name.split('/').pop();
    if (component === 'MobileBackNavigation') return named('ScreenBack');
    return named(component);
  });
  return { PortalProjectPopup, focusCalls };
}

test('shared portal popup gives its published rows the mobile list sizing and keeps selection and dismissal', () => {
  let closed = 0;
  const selected = [];
  const { PortalProjectPopup } = portalPopupFixture();
  const { SharedPortalPopup } = load('visitor/mobile/SharedPortalPopup.tsx', name => {
    if (name === 'react') return React;
    if (name.endsWith('/PortalProjectPopup')) return { PortalProjectPopup };
    throw new Error(name);
  });
  const profile = { id: 'owner', categories: [{ id: 'design', label: 'Product Design' }], projects: [{ id: 'paper', categoryId: 'design' }, { id: 'other', categoryId: 'other' }] };
  const entry = SharedPortalPopup({ profile, categoryId: 'design', onClose: () => closed++, onSelect: (...args) => selected.push(args) });
  const tree = entry.type(entry.props);
  const nav = one(tree, 'nav');
  assert.equal(nav.props['data-project-index-list'], '');
  assert.equal(nav.props['aria-label'], 'Product Design projects');
  const list = one(tree, 'ProjectIndexList');
  assert.deepEqual(list.props.projects.map(project => project.id), ['paper']);
  assert.equal(list.props.isOwner, false);
  list.props.onSelect('paper');
  assert.equal(closed, 1);
  assert.deepEqual(selected, [['design', 'paper']]);
  one(tree, 'MobilePortalProjectToolbar').props.onBack();
  assert.equal(closed, 2);
});

for (const presentation of ['mobile', 'web']) test(`${presentation} portal popup filters its own portal, preserves canonical row metadata, and shares every dismissal path`, () => {
  const f = portalPopupFixture(presentation), calls = [];
  const creator = { id: 'creator', categories: [{ id: 'design', label: 'Product Design' }], projects: [
    { id: 'paper', categoryId: 'design', design: { typefaceId: 'serif' }, isPinned: true },
    { id: 'other', categoryId: 'other' }, { id: 'next', categoryId: 'design' },
  ] };
  const onClose = () => calls.push(['close']), onSelect = (...args) => calls.push(['select', ...args]);
  const tree = f.PortalProjectPopup({ profile: creator, categoryId: 'design', onClose, onSelect, backLabel: 'Back to Timeline' });
  const dialog = nodes(tree).find(node => node.props.role === 'dialog');
  assert.equal(dialog.props['aria-label'], 'Product Design');
  assert.equal(dialog.props['aria-modal'], 'true');
  assert.equal(dialog.props.tabIndex, -1);
  const layer = nodes(tree).find(node => node.props['data-presentation']);
  assert.equal(layer.props['data-presentation'], presentation);
  const list = one(tree, 'ProjectIndexList');
  assert.deepEqual(list.props.projects.map(project => project.id), ['paper', 'next']);
  assert.equal(list.props.projects[0], creator.projects[0], 'Rows retain the canonical project rather than a synthetic timeline record.');
  assert.equal(list.props.profileId, creator.id);
  assert.deepEqual(Array.from(list.props.pinnedIds), ['paper']);
  assert.deepEqual(json(list.props.typefaceStacks), { paper: 'stack:serif', next: 'stack:default' });
  assert.equal(list.props.isOwner, false); assert.equal(list.props.sharedReadOnly, true);
  assert.equal(one(tree, 'MobilePortalProjectToolbar').props.backLabel, 'Back to Timeline');
  list.props.onSelect('other'); list.props.onSelect('missing');
  assert.deepEqual(calls, [], 'Another portal or an injected nonexistent row cannot navigate or dismiss.');
  list.props.onSelect('paper');
  assert.deepEqual(calls, [['close'], ['select', 'design', 'paper']], 'The popup closes before canonical project navigation.');
  const backdrop = {};
  layer.props.onClick({ target: {}, currentTarget: backdrop });
  assert.equal(calls.length, 2, 'Inside clicks do not dismiss.');
  layer.props.onClick({ target: backdrop, currentTarget: backdrop });
  one(tree, 'ScreenBack').props.action();
  one(tree, 'MobilePortalProjectToolbar').props.onBack();
  assert.equal(f.focusCalls[0][0], true); assert.equal(f.focusCalls[0][2], onClose); assert.equal(f.focusCalls[0][3], true);
  f.focusCalls[0][2]();
  assert.deepEqual(calls.slice(2), [['close'], ['close'], ['close'], ['close']], 'Backdrop, system Back, toolbar Back, and shared Escape all close the same local surface.');
  assert.equal(f.PortalProjectPopup({ profile: creator, categoryId: 'missing', onClose, onSelect }), null);
});

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
function appHarness({ firstVisit = false } = {}) {
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
  const window = { scrollY: 0, scrollTo() {}, addEventListener() {}, removeEventListener() {}, history: { state: { idx: 1 } }, location: { assign: path => assigned.push(path), replace: path => replaced.push(path) } };
  const document = { documentElement: { dataset: {}, style: {} }, body: { classList: { toggle() {} } }, querySelector: () => null };
  const { VisitorApp } = load('visitor/VisitorApp.tsx', name => {
    if (name === '../app/screenModules') return { loadVisitorProjectPage: () => Promise.resolve({ default: 'VisitorProjectPage' }) };
    if(name.endsWith('/StateViews'))return {LoadingSkeleton:'loading'};
    if(name.endsWith('/projectContinuity'))return {beginProjectContinuity(){}};
    if (name === '../components/ui/RouteError') return {RouteError: 'RouteError', routeErrorKind: () => 'network'};
    if (name === './mobile/PublicActionSheet') return { PublicActionSheet: 'PublicActionSheet' };
    if (name === './mobile/publicWelcome') return { ...load('visitor/mobile/publicWelcome.ts'), publicWelcomeCompleted: () => !firstVisit, completePublicWelcome() {} };
    if (name === '../features/sharing/shareModel') return shareModel;
    if (name === '../features/profile/visitorPreview') return load('features/profile/visitorPreview.ts', () => routes);
    if (name === '../features/profile/VisitorPreviewBar') return named('VisitorPreviewBar');
    if (name === './useHandleRoute') return {useHandleRoute:route=>({route,pending:false,error:'',retry(){}})};
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
    if (['AppPresentation', 'MobileBackNavigation', 'SharedProfileSidebar', 'SharedContextActions', 'SharedSignInBar', 'VisitorProfileGrid', 'SharedPortalPopup'].includes(component)) return named(component === 'MobileBackNavigation' ? 'MobileBackProvider' : component);
    throw new Error(name);
  }, { window, document, requestAnimationFrame: fn => { fn(); return 1; } });
  return { state, assigned, replaced, navigations, queryCalls, requests, window,
    render: () => h.render(VisitorApp), pending: intent => { pendingIntent = intent; },
    signedIn(overrides = {}) { state.auth = { ...state.auth, phase: 'authenticated', isAuthenticated: true, viewerProfileId: 'viewer', user: { id: 'account', profileId: 'viewer' }, session: { user: { id: 'account', profileId: 'viewer', isEmailVerified: true } }, ...overrides }; },
  };
}

test('cold public mobile visit shows the portfolio immediately and keeps the exact shared URL', () => {
  const h = appHarness({ firstVisit: true });
  h.state.location.search = '?via=friend'; h.state.location.hash = '#work';
  let tree = h.render();
  assert.ok(one(tree, 'VisitorProfileGrid'));
  // WEB's sidebar styles depend on these being shell siblings, not wrapped.
  const shellChildren = React.Children.toArray(one(tree, 'MobileBackProvider').props.children);
  assert.ok(shellChildren.some(node => node.type === 'SharedProfileSidebar'));
  assert.ok(shellChildren.some(node => node.props.className?.includes('codex-workspace')));
  assert.ok(h.queryCalls.length > 0);
  tree = h.render();
  assert.equal(one(tree, 'lazy:./mobile/PublicPortfolioWelcome'), undefined);
  assert.equal(h.state.location.search + h.state.location.hash, '?via=friend#work');
  assert.equal(h.navigations.length + h.assigned.length + h.replaced.length, 0);
});

test('shared visitors immediately see work with no appearance modal on either presentation', () => {
 for (const presentation of ['mobile','web']) {
  const h=appHarness();h.state.presentation=presentation;
  assert.equal(one(h.render(),'lazy:./mobile/PublicPortfolioWelcome'),undefined);
  assert.ok(one(h.render(),'VisitorProfileGrid'));
 }
});

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
  one(h.render(), 'SharedProfileSidebar', 'SharedContextActions').props.onSettingsOpen();
  assert.deepEqual(json(h.navigations.at(-1)), ['/settings', { state: { settingsReturn: `/share/${profileId}` } }]);
  h.state.route = { kind: 'controlCenter' }; h.state.location = { pathname: '/settings', search: '', hash: '', state: { settingsReturn: `/share/${profileId}` } };
  const settings = one(h.render(), 'lazy:../components/ControlCenterPage');
  assert.equal(h.replaced.length, 0);
  assert.equal(typeof settings.props.onAppearanceModeChange, 'function');
  settings.props.onAppearanceModeChange('dark');
  assert.equal(one(h.render(),'lazy:../components/ControlCenterPage').props.theme,'dark');
  assert.equal(h.queryCalls.at(-1)[0], profileId);
  settings.props.onBack(); assert.equal(h.navigations.at(-1)[0], -1);
});

test('invalid shared URLs render not-found without reads, retries or an HTML reload loop; platform routes hand off', () => {
  const h = appHarness();
  for (const [route, pathname] of [[{ kind: 'unknown' }, `/share/${profileId}/invalid/suffix`], [{ kind: 'sharedProfile', profileId: 'malformed' }, '/share/malformed']]) {
    h.state.route = route; h.state.location = { pathname, search: '', hash: '', state: null };
    const tree = h.render();
    assert.equal(h.queryCalls.at(-1)[0], null);
    assert.equal(one(tree, 'RouteError').props.kind, 'not-found');
    assert.equal(one(tree, 'AppPresentation').props.showFloatingActions, false);
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
  one(tree, 'ProjectMediaViewer').props.mobileNavigation.onOpenIndex(); tree = h.render();
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
  assert.equal(viewer.props.readOnlyShare, true); assert.equal(typeof viewer.props.onPagesPerRowChange, 'function'); assert.equal(viewer.props.onPagesPerRowCommit, undefined);
  viewer.props.onPagesPerRowChange(5); assert.equal(one(h.render(), 'ProjectMediaViewer').props.pagesPerRow, 5);
  viewer.props.onDocumentPageCountResolved('two', 5);
  assert.equal(one(h.render(), 'ProjectMediaViewer').props.pageCount, 8);
  h.state.project = { ...h.state.project, pageCount: 12 };
  assert.equal(one(h.render(), 'ProjectMediaViewer').props.pageCount, 12);
});

test('shared links start on Portfolio and keep Journey one tap away', () => {
  const saved = new Map([['viewer:creator', 'portfolio']]);
  const create = () => {
    const h = hooks();
    const { useJourneySelection } = load('features/journey/useJourneySelection.ts', name => {
      if (name === 'react') return h.react;
      return { journeyPreferenceKey: (viewer, profile) => `${viewer}:${profile}`,
        readJourneyPreference: key => saved.get(key) || 'portfolio',
        rememberJourneyPreference: (key, view) => saved.set(key, view) };
    });
    return (profile = 'creator', remember = false) => h.render(() => useJourneySelection(profile, 'viewer', remember));
  };
  const render = create();
  assert.equal(render().view, 'portfolio');
  render().select('journey'); assert.equal(render().view, 'journey');
  render().select('portfolio'); assert.equal(render().view, 'portfolio');
  assert.equal(saved.get('viewer:creator'), 'portfolio');
  assert.equal(create()().view, 'portfolio');
  assert.equal(render('another').view, 'portfolio');
  assert.equal(create()('creator', true).view, 'portfolio');
});

function visitorProfileHarness({ presentation = 'web', showJourney = false } = {}) {
  const h = hooks(), followed = [], state = { own: true, signedIn: true, resolveError: null, search: new URLSearchParams(), categoryId: null, view: 'portfolio' };
  const bioProfile = { ...profile, headline: 'Jolly Good\nWorking across media.', portfolioHeadline: 'Independent designer', location: 'London', showJourney };
  const { VisitorProfileGrid } = load('visitor/VisitorProfileGrid.tsx', name => {
    if (name.endsWith('/useMobileHeaderMaterial')) return { useMobileHeaderMaterial() {} };
    if(name.endsWith('/StateViews'))return {LoadingSkeleton:'loading'};
    if (name === 'react') return h.react;
    if (name.endsWith('.css')) return {};
    if (name === 'lucide-react') return { MoreHorizontalIcon: 'MoreHorizontalIcon' };
    if (name === 'react-router-dom') return { useSearchParams: () => [state.search, update => { state.search = update(state.search); }] };
    if (name === '../app/routes') return routes;
    if (name === '../contexts/AuthContext') return { useAuth: () => ({ isAuthenticated: state.signedIn, viewerProfileId: state.signedIn ? (state.own ? profileId : 'other') : null }) };
    if (name === '../presentation/usePresentation') return { usePresentation: () => presentation };
    if (name === '../features/follows/useFollows') return { useFollows: id => { followed.push(id); return { resolveError: state.resolveError, retryResolve: () => { state.resolveError = null; } }; } };
    if (name === '../features/auth/interactionIntent') return intents;
    if (name === '../features/journey/useJourneySelection') return { useJourneySelection: (_profile, _viewer, remember) => { assert.equal(remember, false); return { view: state.view, select(view) { state.view = view; } }; } };
    if (name === '../features/employer/employer') return employer;
    if (name === '../features/profile/useProjectGridDensity') return { useProjectGridDensity: () => ({ columns: 3 }) };
    if (name === '../features/profile/profileLinks') return { resolveProfileLinks: (links, socialLinks) => { assert.equal(links, profile.links); assert.equal(socialLinks, profile.socialLinks); return links; } };
    if (name === '../utils/projectPresentation') return { getProjectAspectRatio: () => 1 };
    return named(name.split('/').at(-1));
  });
  const render = () => h.render(() => VisitorProfileGrid({ profile: bioProfile, categoryId: state.categoryId, onOpen() {}, onMessage() {}, onCollaboration() {}, onBack() { state.categoryId = null; } }));
  return { render, state, followed, bioProfile };
}

test('public profile is always expanded without an action button and preserves Bio and portal views', () => {
  const { render, state, followed, bioProfile } = visitorProfileHarness();
  assert.equal(nodes(render()).find(node => node.props?.className?.includes('profile-compact-header')).props['data-expanded'], true);
  const identity = nodes(render()).find(node => node.props?.className?.includes('profile-identity-copy'));
  assert.deepEqual(React.Children.toArray(identity.props.children).map(node => node.props.children), ['Creator', 'London']);
  assert.equal(one(render(), 'lazy:../features/profile/ProfileBioSheet'), undefined);
  assert.equal(button(render(), 'Profile options'), undefined);
  assert.equal(one(render(), 'PlatformGrid').props.isSharedView, true);
  one(render(), 'PlatformGrid').props.onOpenBio();
  const bio = one(render(), 'lazy:../features/profile/ProfileBioSheet');
  assert.equal(bio.props.bio, bioProfile.headline); assert.equal(bio.props.canEdit, false);
  bio.props.onClose();
  assert.equal(one(render(), 'lazy:../features/profile/ProfileBioSheet'), undefined);
  assert.equal(button(render(), 'Follow'), undefined); assert.equal(followed.length, 0);
  state.own = false; state.resolveError = 'Unavailable';
  assert.equal(one(render(), 'PlatformGrid').props.isSharedView, true);
  assert.equal(button(render(), 'Follow'), undefined); assert.equal(button(render(), 'Try again'), undefined);
  state.search.set('view', 'portals');
  const collection = one(render(), 'lazy:../components/profile/ProfileCollectionGrid');
  assert.equal(collection.props.shared, true); assert.equal(collection.props.kind, 'portals');
  state.categoryId = 'portal';
  assert.ok(button(render(), 'Back to profile')); assert.equal(one(render(), 'h2').props.children, 'Photography');
  assert.equal(one(render(), 'lazy:../components/profile/ProfileCollectionGrid'), undefined);
});

test('shared mobile Journey switch stays in every profile header and exits portal views', () => {
  const {render,state}=visitorProfileHarness({presentation:'mobile',showJourney:true});
  assert.ok(one(render(),'JourneyToggle'));
  assert.equal(button(render(), 'Profile options'), undefined);
  const tools=nodes(render()).find(node=>node.props?.id==='profile-navigation-tools');
  assert.equal(one(tools,'JourneyToggle'),undefined);
  one(render(),'JourneyToggle').props.onChange('journey');
  assert.ok(one(render(),'lazy:../features/journey/JourneyView'));
  assert.equal(button(render(), 'Profile options'), undefined);
  assert.equal(one(render(),'JourneyToggle').props.view,'journey');
  for (const view of ['category','portals']) {
    if (view==='category') state.categoryId='portal'; else state.search.set('view','portals');
    assert.equal(one(render(),'JourneyToggle').props.view,'portfolio');
    one(render(),'JourneyToggle').props.onChange('journey');
    assert.ok(one(render(),'lazy:../features/journey/JourneyView'));
  }
});

test('shared Journey permission and WEB switch placement are unchanged', () => {
  for (const presentation of ['mobile', 'web']) {
    const denied = visitorProfileHarness({ presentation, showJourney: false });
    denied.state.view = 'journey';
    for (const own of [true, false]) {
      denied.state.own = own;
      assert.equal(one(denied.render(), 'JourneyToggle'), undefined);
      assert.equal(one(denied.render(), 'lazy:../features/journey/JourneyView'), undefined);
    }
  }
  const web = visitorProfileHarness({ presentation: 'web', showJourney: true });
  for (const expanded of [true]) {
    assert.equal(expanded, true);
    const tree = web.render(), direct = React.Children.toArray(tree.props.children);
    assert.equal(nodes(tree).filter(node => node.type === 'JourneyToggle').length, 1);
    const tools = nodes(tree).find(node => node.props?.id === 'profile-navigation-tools');
    assert.equal(one(tools, 'JourneyToggle'), undefined);
    assert.ok(direct.findIndex(node => node.type === 'JourneyToggle') > direct.findIndex(node => node.type === 'EmployerOverview'));
  }
});


test('public portfolio has no follow action or follow lookup for guests, members or the owner on either presentation', () => {
  for (const presentation of ['mobile', 'web']) {
    for (const [signedIn, own] of [[false, false], [true, false], [true, true]]) {
      const h = visitorProfileHarness({ presentation });
      Object.assign(h.state, { signedIn, own, resolveError: 'Follow unavailable' });
      for (const expanded of [true]) {
        assert.equal(expanded, true);
        const tree = h.render();
        for (const label of ['Follow', 'Following', 'Requested', 'Sign in to follow', 'Try again']) assert.equal(button(tree, label), undefined);
        assert.equal(nodes(tree).some(node => node.props?.role === 'alert'), false);
      }
      assert.deepEqual(h.followed, []);
    }
  }
});

test('MOBILE public portal links open the chooser while explicit project links still open the reader', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = appHarness();
    h.state.presentation = presentation;
    h.state.route = {kind:'sharedProject',profileId,categoryId:'portal',projectId:'work'};
    h.state.location.pathname = `/share/${profileId}/c/portal/work`;
    const tree = h.render();
    const project = nodes(tree).find(node => node.props?.project?.id === 'work' && node.props?.onBack);
    assert.ok(project);
    assert.equal(one(tree, 'SharedPortalPopup'), undefined);
    assert.equal(h.navigations.length, 0, 'Explicit project links are not replaced by a chooser');
    project.props.onBack();
    assert.equal(h.navigations.at(-1)[0], presentation === 'mobile' ? `/share/${profileId}` : `/share/${profileId}/c/portal`);
    h.state.route = {kind:'sharedCategory',profileId,categoryId:'portal'};
    h.state.location.pathname = `/share/${profileId}/c/portal`;
    h.navigations.length = 0;
    const categoryTree = h.render();
    if (presentation === 'mobile') {
      assert.deepEqual(json(h.navigations.at(-1)), [`/share/${profileId}`, {replace:true}]);
      assert.equal(nodes(categoryTree).find(node=>node.props?.onOpen && node.props?.profile)?.props.categoryId, null);
      assert.equal(one(categoryTree, 'SharedPortalPopup').props.categoryId, 'portal');
      assert.equal(nodes(categoryTree).some(node=>node.props?.project?.id && node.props?.onBack), false);
      h.state.route = {kind:'sharedProfile',profileId};
      h.state.location.pathname = `/share/${profileId}`;
      h.navigations.length = 0;
      const popup = one(h.render(), 'SharedPortalPopup');
      assert.equal(popup.props.categoryId, 'portal', 'The requested portal survives profile-route normalization');
      assert.equal(h.navigations.length, 0, 'No project opens until a row is selected');
      popup.props.onSelect('portal', 'next');
      assert.equal(h.navigations.at(-1)[0], `/share/${profileId}/c/portal/next`);
    } else assert.equal(h.navigations.length, 0);
  }
});


test('MOBILE sidebar portal opens its project popup without navigating to the profile route', () => {
  const h=appHarness();
  one(h.render(),'SharedProfileSidebar').props.onOpenCategory('portal');
  const popup=one(h.render(),'SharedPortalPopup');
  assert.equal(popup.props.categoryId,'portal');
  assert.equal(h.navigations.length,0);
  popup.props.onClose();
  assert.equal(nodes(h.render()).some(n=>n.type==='SharedPortalPopup'),false);
  h.state.presentation='web';
  one(h.render(),'SharedProfileSidebar').props.onOpenCategory('portal');
  assert.ok(h.navigations.length>0);
});

test('MOBILE stale portal links and a different creator never leave navigation blocked by an invisible popup', () => {
  const h = appHarness();
  h.state.route = {kind:'sharedCategory',profileId,categoryId:'deleted-portal'};
  h.state.location.pathname = `/share/${profileId}/c/deleted-portal`;
  let tree = h.render();
  assert.equal(one(tree, 'SharedPortalPopup'), undefined);
  assert.equal(one(tree, 'SharedProfileSidebar').props.mobileNavigationEnabled, true);
  h.state.route = {kind:'sharedProfile',profileId};
  h.state.location.pathname = `/share/${profileId}`;
  one(h.render(), 'SharedProfileSidebar').props.onOpenCategory('portal');
  assert.equal(one(h.render(), 'SharedPortalPopup').props.categoryId, 'portal');
  const nextProfileId = '22222222-2222-4222-8222-222222222222';
  h.state.route = {kind:'sharedProfile',profileId:nextProfileId};
  h.state.location.pathname = `/share/${nextProfileId}`;
  h.state.query = {...h.state.query, profile:{...profile,id:nextProfileId}};
  tree = h.render();
  assert.equal(one(tree, 'SharedPortalPopup'), undefined, 'A matching category ID in another creator does not inherit the popup');
  assert.equal(one(tree, 'SharedProfileSidebar').props.mobileNavigationEnabled, true);
});


test('handle project navigation resolves the complete target and preserves it through alias redirects', async () => {
  for (const alias of [false, true]) {
    const h = hooks(), navigations = [];
    const location = { pathname: '/creator/c/portal/work', search: '?from=portfolio' };
    const profiles = { resolvePublicHandle: async () => ({profileId, handle: alias ? 'new.creator' : 'creator', alias}) };
    const navigate = (...args) => navigations.push(args);
    const { useHandleRoute } = load('visitor/useHandleRoute.ts', name => {
      if (name === 'react') return h.react;
      if (name === 'react-router-dom') return {useLocation: () => location, useNavigate: () => navigate};
      if (name === '../contexts/ServicesContext') return {useServices: () => ({profiles})};
      if (name === '../features/sharing/shareModel') return shareModel;
    if (name === '../features/profile/visitorPreview') return load('features/profile/visitorPreview.ts', () => routes);
    if (name === '../features/profile/VisitorPreviewBar') return named('VisitorPreviewBar');
      throw new Error(name);
    }, {window: {}});
    h.render(() => useHandleRoute({kind: 'unknown'}));
    await Promise.resolve(); await Promise.resolve();
    const result = h.render(() => useHandleRoute({kind: 'unknown'}));
    assert.equal(result.pending, false);
    assert.deepEqual(json(result.route), {kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work'});
    assert.deepEqual(json(navigations), alias ? [['/new.creator/c/portal/work?from=portfolio', {replace: true}]] : []);
  }
});


test('shared account sign-in opens the signed-in member profile in the full platform on MOBILE and WEB', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = appHarness(); h.state.presentation = presentation;
    h.state.auth.requestAuthenticatedDestination({ kind: 'my-profile' });
    h.render();
    h.signedIn({ viewerProfileId: 'member-profile' }); h.render();
    assert.equal(h.assigned.at(-1), '/p/member-profile');
    assert.equal(h.navigations.length, 0, 'Account entry must load the platform rather than keep the public visitor shell');
  }
});

test('visitor silently respects creator branding, system theme and an explicit visitor switch',()=>{
 const h=appHarness();h.state.query.profile={...h.state.query.profile,publicAppearance:{mode:'dark',accentColor:'#34c759',systemGray:'gray3'}};
 let tree=h.render();assert.ok(tree.props.className.includes('theme-dark'));assert.equal(tree.props.style['--accent-color'],'#34c759');
 one(tree,'SharedProfileSidebar').props.onThemeChange('light');assert.ok(h.render().props.className.includes('theme-light'));
 const other=appHarness();other.state.query.profile={...other.state.query.profile,publicAppearance:{mode:'auto',accentColor:'#34c759',systemGray:'gray3'}};
 assert.ok(other.render().props.className.includes('theme-light'));
});

test('View as visitor uses public appearance and public query, with Done returning to the owner app', () => {
 const h=appHarness();h.signedIn({viewerProfileId:profileId});h.state.location.search='?visitorPreview=1';
 h.state.query.profile={...profile,publicAppearance:{mode:'light',accentColor:'#34c759',systemGray:'gray'}};
 const tree=h.render(),bar=one(tree,'VisitorPreviewBar');assert.ok(bar);
 assert.match(tree.props.className,/theme-light/);assert.equal(tree.props['data-public-portfolio'],'');
 assert.equal(h.queryCalls.at(-1)[0],profileId);
 h.state.location.search='';assert.ok(one(h.render(),'VisitorPreviewBar'),'Preview survives internal creator links without copying its query');
 bar.props.onDone();assert.equal(h.assigned.at(-1),routes.buildPath('profile',{profileId}));
 const normal=appHarness();normal.signedIn({viewerProfileId:profileId});assert.equal(one(normal.render(),'VisitorPreviewBar'),undefined);
 const other=appHarness();other.signedIn();other.state.location.search='?visitorPreview=1';assert.equal(one(other.render(),'VisitorPreviewBar'),undefined);
});
