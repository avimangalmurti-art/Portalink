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
const sharedSettings = load('features/sharing/sharedSettings.ts', name => name === '../auth/registration' ? registration : shareModel);
const panels = load('utils/projectPanelLayout.ts');
const portalBrowsing = load('components/profile/portalProjectBrowsing.ts');
const employer = load('features/employer/employer.ts');
const navButtonTokens = load('data/navButtonTokens.ts');
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
  const focusCalls = [], h = hooks();
  const { PortalProjectPopup } = load('components/profile/PortalProjectPopup.tsx', name => {
    if (name === 'react') return h.react;
    if (name.endsWith('.css')) return {};
    if (name.endsWith('/useModalFocus')) return { useModalFocus: (...args) => focusCalls.push(args) };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/typefaces')) return { getTypefaceStack: id => `stack:${id}` };
    if (name.endsWith('/portalProjectBrowsing')) return portalBrowsing;
    if (name.endsWith('/StateViews')) return { EmptyState: 'EmptyState' };
    const component = name.split('/').pop();
    if (component === 'MobileBackNavigation') return named('ScreenBack');
    return named(component);
  });
  return { PortalProjectPopup: props => h.render(() => PortalProjectPopup(props)), focusCalls };
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
  const browsing = { layout: 'grid', sort: 'recent', onLayout() {}, onSort() {} };
  const entry = SharedPortalPopup({ profile, categoryId: 'design', onClose: () => closed++, onSelect: (...args) => selected.push(args), browsing });
  assert.equal(entry.props.browsing, browsing);
  const tree = entry.type(entry.props);
  const nav = one(tree, 'nav');
  assert.equal(nav.props['data-project-index-list'], '');
  assert.equal(nav.props['aria-label'], 'Product Design projects');
  const list = one(tree, 'ProjectIndexList');
  assert.deepEqual(Array.from(list.props.projects, project => project.id), ['paper']);
  assert.equal(list.props.mobileLayout, 'grid');
  assert.equal(list.props.isOwner, false);
  list.props.onSelect('paper');
  assert.equal(closed, 1);
  assert.deepEqual(selected, [['design', 'paper']]);
  one(tree, 'MobilePortalProjectToolbar').props.onBack();
  assert.equal(closed, 2);
});

test('shared popup Back is distinct from dismissal and selection, while other popup callers keep close behavior', () => {
  const f = portalPopupFixture(), calls = [];
  const { SharedPortalPopup } = load('visitor/mobile/SharedPortalPopup.tsx', name => {
    if (name === 'react') return React;
    if (name.endsWith('/PortalProjectPopup')) return { PortalProjectPopup: f.PortalProjectPopup };
    throw new Error(name);
  });
  const entry = SharedPortalPopup({ profile, categoryId: 'portal', onBack: () => calls.push('portals'),
    onClose: () => calls.push('close'), onSelect: (...args) => calls.push(['select', ...args]) });
  const tree = entry.type(entry.props), toolbar = one(tree, 'MobilePortalProjectToolbar');
  assert.equal(toolbar.props.backLabel, 'Back to portals');
  toolbar.props.onBack(); one(tree, 'ScreenBack').props.action();
  assert.deepEqual(calls, ['portals', 'portals']);
  const layer = nodes(tree).find(node => node.props['data-presentation']), backdrop = {};
  layer.props.onClick({ target: backdrop, currentTarget: backdrop });
  f.focusCalls[0][2]();
  one(tree, 'ProjectIndexList').props.onSelect('work');
  assert.deepEqual(calls, ['portals', 'portals', 'close', 'close', 'close', ['select', 'portal', 'work']],
    'Outside dismissal, Escape and project selection must not issue a return-to-Portals request.');
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
  assert.deepEqual(Array.from(list.props.projects, project => project.id), ['paper', 'next']);
  assert.equal(list.props.projects[0], creator.projects[0], 'Rows retain the canonical project rather than a synthetic timeline record.');
  assert.equal(list.props.profileId, creator.id);
  assert.deepEqual(Array.from(list.props.pinnedIds), ['paper']);
  assert.deepEqual(json(list.props.typefaceStacks), { paper: 'stack:serif', next: 'stack:default' });
  assert.equal(list.props.isOwner, false); assert.equal(list.props.sharedReadOnly, true);
  assert.equal(one(tree, 'MobilePortalProjectToolbar').props.backLabel, 'Back to Timeline');
  assert.equal(one(tree, 'MobilePortalProjectToolbar').props.browsingControls, presentation === 'mobile');
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

test('public MOBILE popup changes local list/grid and Recent/Name/Saved order without authoring access', () => {
  const f = portalPopupFixture(), calls = [];
  const projects = [
    { id: 'zebra', categoryId: 'work', title: 'Zebra', publishedAt: '2026-01-02T00:00:00Z' },
    { id: 'apple', categoryId: 'work', title: 'Apple', publishedAt: '2026-01-04T00:00:00Z', isPinned: true },
    { id: 'beta', categoryId: 'work', title: 'Beta', publishedAt: 'invalid' },
    { id: 'other', categoryId: 'elsewhere', title: 'Another portal' },
  ];
  const props = { profile: { id: 'creator', categories: [{ id: 'work', label: 'Work' }], projects }, categoryId: 'work',
    onClose: () => calls.push('close'), onSelect: (...args) => calls.push(args) };
  const render = () => f.PortalProjectPopup(props);
  let tree = render();
  const ids = tree => Array.from(one(tree, 'ProjectIndexList').props.projects, project => project.id);
  assert.deepEqual(ids(tree), ['apple', 'zebra', 'beta']);
  assert.equal(one(tree, 'ProjectIndexList').props.mobileLayout, 'list');
  assert.equal(one(tree, 'MobilePortalProjectToolbar').props.browsingControls, true);
  one(tree, 'MobilePortalProjectToolbar').props.onLayout('grid');
  one(tree, 'MobilePortalProjectToolbar').props.onSort('title');
  tree = render();
  assert.equal(one(tree, 'ProjectIndexList').props.mobileLayout, 'grid');
  assert.deepEqual(ids(tree), ['apple', 'beta', 'zebra']);
  one(tree, 'MobilePortalProjectToolbar').props.onSort('saved');
  tree = render();
  assert.deepEqual(ids(tree), ['zebra', 'apple', 'beta']);
  assert.deepEqual(Array.from(one(tree, 'ProjectIndexList').props.pinnedIds), ['apple']);
  assert.deepEqual(projects.map(project => project.id), ['zebra', 'apple', 'beta', 'other']);
  const list = one(tree, 'ProjectIndexList');
  assert.equal(list.props.isOwner, false);
  assert.equal(list.props.sharedReadOnly, true);
  assert.deepEqual(Array.from(list.props.hiddenIds), []);
  for (const callback of ['onEdit', 'onDelete', 'onChangeCover', 'onTypefaceChange']) assert.equal(list.props[callback], undefined);
  assert.equal(one(tree, 'MobilePortalProjectToolbar').props.onCreate, undefined);
  assert.deepEqual(calls, [], 'Local browsing never navigates or performs an author action.');
  list.props.onSelect('beta');
  assert.deepEqual(calls, ['close', ['work', 'beta']]);
});

test('WEB Portal Search opts into working local sort and layout without changing ordinary desktop popup behavior', () => {
  const f = portalPopupFixture('web');
  const projects = [{ id: 'z', categoryId: 'work', title: 'Zebra', publishedAt: '2026-01-01' }, { id: 'a', categoryId: 'work', title: 'Apple', publishedAt: '2026-01-02' }];
  const props = { profile: { id: 'creator', categories: [{ id: 'work', label: 'Work' }], projects }, categoryId: 'work', onClose() {}, onSelect() {} };
  let tree = f.PortalProjectPopup(props);
  assert.equal(one(tree, 'MobilePortalProjectToolbar').props.browsingControls, false);
  assert.equal(one(tree, 'ProjectIndexList').props.readOnlyBrowsing, false);
  assert.deepEqual(Array.from(one(tree, 'ProjectIndexList').props.projects, item => item.id), ['z', 'a']);
  props.desktopBrowsing = true; tree = f.PortalProjectPopup(props);
  assert.equal(one(tree, 'MobilePortalProjectToolbar').props.browsingControls, true);
  assert.equal(one(tree, 'ProjectIndexList').props.readOnlyBrowsing, true);
  assert.deepEqual(Array.from(one(tree, 'ProjectIndexList').props.projects, item => item.id), ['a', 'z']);
  one(tree, 'MobilePortalProjectToolbar').props.onLayout('grid');
  one(tree, 'MobilePortalProjectToolbar').props.onSort('saved'); tree = f.PortalProjectPopup(props);
  assert.equal(one(tree, 'ProjectIndexList').props.mobileLayout, 'grid');
  assert.deepEqual(Array.from(one(tree, 'ProjectIndexList').props.projects, item => item.id), ['z', 'a']);
  assert.equal(one(tree, 'ProjectIndexList').props.isOwner, false);
  assert.equal(one(tree, 'ProjectIndexList').props.sharedReadOnly, true);
});

test('an empty public portal explains that no projects have been published without fabricating rows', () => {
  for (const presentation of ['mobile', 'web']) {
    const f = portalPopupFixture(presentation);
    const tree = f.PortalProjectPopup({ profile: { id: 'creator', categories: [{ id: 'empty', label: 'Empty portal' }], projects: [] },
      categoryId: 'empty', onClose() {}, onSelect() { assert.fail('An empty portal has no selected project.'); } });
    const empty = one(tree, 'EmptyState');
    if (presentation === 'mobile') {
      assert.equal(empty.props.title, 'No projects in Empty portal');
      assert.equal(empty.props.description, 'No work has been published in this portal.');
    } else assert.equal(empty, undefined, 'WEB retains its existing empty-popup presentation.');
    assert.deepEqual(Array.from(one(tree, 'ProjectIndexList').props.projects), []);
    assert.equal(one(tree, 'MobilePortalProjectToolbar').props.onCreate, undefined);
  }
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
  react.useLayoutEffect = react.useEffect;
  function render(fn) {
    let tree;
    for (let pass = 0; pass < 12; pass++) {
      stateIndex = refIndex = memoIndex = effectIndex = 0; pending = []; dirty = false;
      tree = fn(); pending.forEach(effect => effect());
      if (!dirty) return tree;
    }
    throw new Error('Component did not settle');
  }
  return { react, render, dispose: () => effects.forEach(effect => effect?.cleanup?.()) };
}
function appHarness({ firstVisit = false, catalogueOrigin = null, deviceAppearance = appearance, appearanceStorage, systemDark = false } = {}) {
  const h = hooks(), assigned = [], replaced = [], navigations = [], queryCalls = [], requests = [];
  const navigate = (path, options) => navigations.push([path, options]);
  let pendingIntent = null;
  const state = { route: { kind: 'sharedProfile', profileId }, location: { pathname: `/share/${profileId}`, search: '', hash: '', state: null }, presentation: 'mobile', handlePending: false, handleError: '',
    query: { status: 'ready', profile, error: null, retry() {} },
    auth: { phase: 'unauthenticated', isAuthenticated: false, isInitializing: false, viewerProfileId: null, user: null, session: null, needsProfileSetup: false, pendingView: null,
      peekPendingIntent: () => pendingIntent,
      consumePendingIntent: () => { const value = pendingIntent; pendingIntent = null; return value; },
      requestAuthenticatedDestination: intent => { requests.push(intent); pendingIntent = intent; },
      closeAuth: () => { state.auth = { ...state.auth, pendingView: null }; },
    } };
  const window = { scrollX: 0, scrollY: 0, innerWidth: 420, innerHeight: 912, scrollTo() {}, addEventListener() {}, removeEventListener() {}, history: { state: { idx: 1 } }, location: { assign: path => assigned.push(path), replace: path => replaced.push(path) } };
  const document = { documentElement: { dataset: {}, style: {} }, body: { classList: { toggle() {} } }, querySelector: () => null, addEventListener() {}, removeEventListener() {} };
  class ElementStub { matches() { return false; } }
  const browser = { window, document, Element: ElementStub, HTMLElement: ElementStub,
    requestAnimationFrame: fn => { fn(); return 1; }, cancelAnimationFrame() {} };
  let appearanceHook = () => deviceAppearance;
  if (appearanceStorage) {
    window.localStorage = { getItem: key => appearanceStorage.get(key) ?? null, setItem: (key, value) => appearanceStorage.set(key, value) };
    window.matchMedia = () => ({ matches: systemDark });
    const preferences = load('utils/appearancePreferences.ts', undefined, browser);
    appearanceHook = load('hooks/useDeviceAppearance.ts', name => name === 'react' ? h.react : preferences, browser).useDeviceAppearance;
  }
  const projectReturn = load('visitor/useMobileProjectReturn.ts', name => {
    if (name === 'react') return h.react;
    if (name.endsWith('/projectContinuity')) return { beginProjectContinuity() {} };
    // These route/privacy cases do not model a fitting catalogue's geometry.
    if (name.endsWith('/mobileCatalogueScroll')) return { repairMobileCatalogueScroll: () => false };
    throw new Error(name);
  }, browser);
  const { VisitorApp } = load('visitor/VisitorApp.tsx', name => {
    if (name.endsWith('/cataloguePageNavigation')) return { withCataloguePageTarget: href => href, captureCatalogueReaderOrigin: () => catalogueOrigin, restoreCatalogueReaderOrigin: () => () => {} };
    if (name === './useMobileProjectReturn') return projectReturn;
    if (name === '../app/screenModules') return { loadVisitorProjectPage: () => Promise.resolve({ default: 'VisitorProjectPage' }) };
    if(name.endsWith('/StateViews'))return {LoadingSkeleton:'loading',ProjectOpeningLoader:'project-opening-loader'};
    if(name.endsWith('/projectContinuity'))return {beginProjectContinuity(){}};
    if (name === '../components/ui/RouteError') return {RouteError: 'RouteError', routeErrorKind: () => 'network'};
    if (name === './mobile/PublicActionSheet') return { PublicActionSheet: 'PublicActionSheet' };
    if (name === './mobile/publicWelcome') return { ...load('visitor/mobile/publicWelcome.ts'), publicWelcomeCompleted: () => !firstVisit, completePublicWelcome() {} };
    if (name === '../features/sharing/shareModel') return shareModel;
    if (name === './useHandleRoute') return {useHandleRoute:route=>({route,pending:state.handlePending,error:state.handleError,retry(){}})};
    if (name === 'react') return h.react;
    if (name.endsWith('.css')) return {};
    if (name === 'react-router-dom') return { useLocation: () => state.location, useNavigate: () => navigate };
    if (name === '../app/useAppRoute') return { useAppRoute: () => state.route };
    if (name === '../app/routes') return routes;
    if (name === '../contexts/AuthContext') return { useAuth: () => state.auth };
    if (name === '../components/profile/usePrepareProfileAudio') return { usePrepareProfileAudio() {} };
    if (name === '../features/profile/profileAudioPlayback') return { clearProfileAudioForProfile() {} };
    if (name === '../features/profile/useSharedProfileQuery') return { useSharedProfileQuery: (...args) => { queryCalls.push(args); return args[0] ? state.query : { status: 'idle', profile: null }; } };
    if (name === '../hooks/useDeviceAppearance') return { useDeviceAppearance: appearanceHook };
    if (name === '../presentation/usePresentation') return { usePresentation: () => state.presentation };
    if (name === '../features/auth/registration') return registration;
    if (name === '../features/sharing/sharedSettings') return sharedSettings;
    if (name === '../features/auth/interactionIntent') return intents;
    if (name === '../utils/accentTokens') return { resolveAccentTokens: () => ({}) };
    if (name === '../utils/macTokens') return { resolveMacTokens: () => ({}) };
    if (name === '../data/navButtonTokens') return navButtonTokens;
    if (name === '../components/ui/DeferredDialog') return { DeferredDialog: 'DeferredDialog', DeferredSurface: 'DeferredSurface', DeferredSurfaceBoundary: 'DeferredSurfaceBoundary' };
    const component = name.split('/').at(-1);
    if (['AppPresentation', 'MobileBackNavigation', 'SharedProfileSidebar', 'SharedContextActions', 'SharedSignInBar', 'VisitorProfileGrid', 'SharedPortalPopup'].includes(component)) return named(component === 'MobileBackNavigation' ? 'MobileBackProvider' : component);
    throw new Error(name);
  }, browser);
  return { state, assigned, replaced, navigations, queryCalls, requests, window, dispose: h.dispose,
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

test('a slow mobile Catalogue uses the loading indicator until its content arrives', () => {
  const h = appHarness();
  h.state.query = { ...h.state.query, status: 'loading', profile: null };
  const indicator = tree => nodes(tree).find(node => node.props['aria-label'] === 'Opening shared catalogue');
  const waiting = h.render();
  assert.equal(indicator(waiting)?.props.role, 'status');
  assert.equal(one(waiting, 'loading'), undefined);

  h.state.presentation = 'web';
  const desktop = h.render();
  assert.equal(indicator(desktop), undefined);
  assert.equal(one(desktop, 'loading')?.props.kind, 'profile');

  h.state.presentation = 'mobile';
  h.state.route = { kind: 'unknown' };
  h.state.location.pathname = '/portalite';
  h.state.handlePending = true;
  assert.ok(indicator(h.render()));
  h.state.handlePending = false;
  h.state.route = { kind: 'sharedProfile', profileId };
  h.state.query = { ...h.state.query, status: 'ready', profile };
  const ready = h.render();
  assert.equal(indicator(ready), undefined);
  assert.ok(one(ready, 'VisitorProfileGrid'));
  h.dispose();
});

test('opening a shared project on mobile uses the same indicator before and after its public handle resolves', () => {
  const h = appHarness();
  h.state.location.pathname = '/portalite/c/portal/work';
  h.state.route = { kind: 'unknown' };
  h.state.handlePending = true;
  h.state.query = { ...h.state.query, status: 'loading', profile: null };

  let tree = h.render();
  assert.ok(one(tree, 'project-opening-loader'));
  assert.equal(one(tree, 'loading'), undefined);
  assert.equal(nodes(tree).some(node => node.props['aria-label'] === 'Opening shared catalogue'), false);

  h.state.handlePending = false;
  h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' };
  tree = h.render();
  assert.ok(one(tree, 'project-opening-loader'));
  assert.equal(one(tree, 'loading'), undefined);

  h.state.query = { ...h.state.query, status: 'ready', profile };
  tree = h.render();
  assert.equal(one(tree, 'project-opening-loader'), undefined);
  assert.ok(nodes(tree).some(node => node.props.project?.id === 'work'));
  h.dispose();
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
  const h = appHarness({ appearanceStorage: new Map() });
  one(h.render(), 'SharedProfileSidebar', 'SharedContextActions').props.onSettingsOpen();
  assert.deepEqual(json(h.navigations.at(-1)), [`/share/${profileId}?settings=1`, null]);
  h.state.route = { kind: 'controlCenter' }; h.state.location = { pathname: '/settings', search: '', hash: '', state: { settingsReturn: `/share/${profileId}` } };
  const settings = one(h.render(), 'lazy:../components/ControlCenterPage');
  assert.equal(settings.props.sharedReadOnly, true);
  assert.deepEqual(json(h.navigations.at(-1)), [`/share/${profileId}?settings=1`, { replace: true }]);
  assert.equal(h.replaced.length, 0);
  assert.equal(typeof settings.props.onAppearanceModeChange, 'function');
  settings.props.onAppearanceModeChange('dark');
  assert.equal(one(h.render(),'lazy:../components/ControlCenterPage').props.theme,'dark');
  assert.equal(h.queryCalls.at(-1)[0], profileId);
  settings.props.onBack(); assert.equal(h.navigations.at(-1)[0], -1);
  h.dispose();
});

test('cold public Settings remains read-only for owners, other accounts and signed-out viewers on both presentations', () => {
  for (const presentation of ['web', 'mobile']) for (const account of ['guest', 'owner', 'other']) {
    for (const [kind, suffix] of [['sharedProfile', ''], ['sharedCategory', '/c/portal'], ['sharedProject', '/c/portal/work']]) {
      const h = appHarness(); h.state.presentation = presentation;
      if (account !== 'guest') h.signedIn({ viewerProfileId: account === 'owner' ? profileId : 'other' });
      h.state.route = { kind, profileId, ...(kind !== 'sharedProfile' ? { categoryId: 'portal' } : {}), ...(kind === 'sharedProject' ? { projectId: 'work' } : {}) };
      h.state.location = { pathname: `/share/${profileId}${suffix}`, search: '?settings=1&section=account&security=1', hash: '', state: null };
      h.window.history.state.idx = 0;
      const tree = h.render(), page = one(tree, 'lazy:../components/ControlCenterPage');
      assert.ok(page, `${presentation}/${account}/${kind}`);
      assert.equal(page.props.sharedReadOnly, true);
      assert.ok(one(tree, 'SharedProfileSidebar'));
      assert.equal(one(tree, 'VisitorProjectPage'), undefined);
      assert.equal(one(tree, 'SharedPortalPopup'), undefined, 'MOBILE category entry cannot replace public Settings with its chooser.');
      assert.equal(one(tree, 'AppPresentation').props.showFloatingActions, false);
      assert.equal(h.assigned.length + h.replaced.length + h.navigations.length + h.requests.length, 0, 'Rendering public Settings does not open a private destination or authenticate.');
      page.props.onBack();
      assert.deepEqual(json(h.navigations.at(-1)), [`/share/${profileId}${suffix}`, { replace: true }]);
    }
  }
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
    if (name === 'lucide-react') return { ChevronLeftIcon: 'ChevronLeftIcon', ListIcon: 'ListIcon', PanelLeftCloseIcon: 'PanelLeftCloseIcon',
      PanelLeftOpenIcon: 'PanelLeftOpenIcon', SearchIcon: 'SearchIcon', XIcon: 'XIcon' };
    if (name === '../presentation/usePresentation') return { usePresentation: () => state.presentation };
    if (name === '../components/ui/ResizablePanelHandle') return { useResizablePanelWidth: () => ({ width: 280, preferredWidth: 280 }) };
    if (name === '../features/media/useAssetProcessing') return { useAssetProcessing: () => ({ statuses }) };
    if (name === '../data/typefaces') return { getTypefaceStack: () => 'sans-serif' };
    if (name === '../utils/panelLayoutDefaults') return { panelLayoutDefaults: { sharedDetails: 280 } };
    if (name === '../hooks/useElementSize') return { useElementSize: () => ({ width: state.width, ref: null }) };
    if (name === '../utils/projectPanelLayout') return panels;
    if (name === '../components/media/ProjectMediaViewer') return named('ProjectMediaViewer');
    if (name === '../components/media/ProjectPagesPerRowControl') return named('ProjectPagesPerRowControl');
    if (name === '../components/ui/InterfaceIcon') return named('InterfaceIcon');
    if (name === '../components/profile/ProjectIndexList') return named('ProjectIndexList');
    if (name === '../components/profile/MobilePortalProjectToolbar') return named('MobilePortalProjectToolbar');
    if (name === '../components/profile/portalProjectBrowsing') return portalBrowsing;
    if (name === '../features/projects/pageLayout') return load('features/projects/pageLayout.ts');
    if (name === '../components/profile/web-reader-spacing.css') return {};
    if (name === '../components/ui/StateViews') return { LoadingSkeleton: 'LoadingSkeleton' };
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
  assert.deepEqual(Array.from(list.props.projects, item => item.id), ['work', 'next']);
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

function visitorProfileHarness({ presentation = 'web', showJourney = false, appearanceControls } = {}) {
  const h = hooks(), followed = [], layoutRepair = [], state = { own: true, signedIn: true, resolveError: null, search: new URLSearchParams(), categoryId: null, view: 'portfolio', active: true };
  const profileDom = { inert: false };
  const bioProfile = { ...profile, headline: 'Jolly Good\nWorking across media.', portfolioHeadline: 'Independent designer', location: 'London', showJourney };
  const { VisitorProfileGrid } = load('visitor/VisitorProfileGrid.tsx', name => {
    if (name.endsWith('/useMobileHeaderMaterial')) return { useMobileHeaderMaterial() {} };
    if (name.endsWith('/mobileCatalogueScroll')) return {
      repairMobileCatalogueScroll: root => { layoutRepair.push(['repair', root]); return false; },
      observeMobileCatalogueScroll: root => { layoutRepair.push(['observe', root]); return () => layoutRepair.push(['disconnect', root]); },
    };
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
  const render = () => h.render(() => {
    const tree = VisitorProfileGrid({ profile: bioProfile, categoryId: state.categoryId, active: state.active, appearanceControls, onOpen() {}, onMessage() {}, onCollaboration() {}, onBack() { state.categoryId = null; } });
    tree.ref.current = profileDom; // React attaches the host before layout effects run.
    return tree;
  });
  return { render, state, followed, bioProfile, profileDom, layoutRepair, dispose: h.dispose };
}

test('the public header shows only High Contrast on MOBILE and also offers Translucency on WEB', () => {
  for (const presentation of ['mobile', 'web']) {
    const controls = { highContrast: false, reduceTranslucency: false,
      onHighContrastChange(value) { controls.highContrast = value; },
      onReduceTranslucencyChange(value) { controls.reduceTranslucency = value; } };
    const h = visitorProfileHarness({ presentation, appearanceControls: controls });
    const switches = () => nodes(h.render()).filter(node => node.type === 'AppearanceSwitch');
    const isMobile = presentation === 'mobile';
    assert.deepEqual(switches().map(node => node.props.label), isMobile ? ['High Contrast'] : ['High Contrast', 'Translucency']);
    assert.deepEqual(switches().map(node => node.props.isOn), isMobile ? [false] : [false, true]);
    switches()[0].props.onToggle();
    assert.equal(switches()[0].props.isOn, true);
    assert.equal(controls.reduceTranslucency, false);
    switches()[0].props.onToggle();
    assert.equal(switches()[0].props.isOn, false);
    if (!isMobile) {
      switches()[1].props.onToggle();
      assert.equal(switches()[1].props.isOn, false);
      switches()[1].props.onToggle();
      assert.equal(switches()[1].props.isOn, true);
    }
    assert.equal(nodes(visitorProfileHarness({ presentation }).render()).some(node => node.type === 'AppearanceSwitch'), false);
    h.dispose();
  }
});

test('the public audio shortcut is read-only on mobile and desktop, even for the signed-in creator', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = visitorProfileHarness({ presentation });
    h.state.signedIn = true;
    h.state.own = true;
    const grid = nodes(h.render()).find(node => node.type === 'PlatformGrid');
    assert.equal(grid.props.isSharedView, true);
    assert.equal(grid.props.profileAudio.profileId, h.bioProfile.id);
    assert.equal(grid.props.profileAudio.editable, false);
    assert.equal(grid.props.profileAudio.active, true);
    h.dispose();
  }
});

test('public catalogue shortcuts update the same appearance state as settings without changing routes', () => {
  for (const presentation of ['mobile', 'web']) {
  const changes = [];
  const deviceAppearance = { ...appearance, chooseAppearance(patch) { changes.push(patch); Object.assign(deviceAppearance, patch); } };
  const h = appHarness({ deviceAppearance }); h.state.presentation = presentation;
  const controls = () => one(h.render(), 'VisitorProfileGrid').props.appearanceControls;
  controls().onHighContrastChange(true);
  controls().onReduceTranslucencyChange(true);
  assert.deepEqual(json(changes), [{ highContrast: true }, { reduceTranslucency: true }]);
  assert.ok(h.render().props.className.includes('high-contrast'));
  assert.ok(h.render().props.className.includes('reduce-translucency'));
  assert.equal(h.navigations.length, 0);
  h.state.location.search = '?settings=1';
  const settings = one(h.render(), 'lazy:../components/ControlCenterPage');
  assert.equal(settings.props.highContrast, true);
  assert.equal(settings.props.reduceTranslucency, true);
  h.state.location.search = '';
  assert.equal(controls().highContrast, true);
  assert.equal(controls().reduceTranslucency, true);
  }
});

test('public image catalogue repair owns only the active MOBILE grid and releases Timeline, portal, hidden and unmounted views', () => {
  const h = visitorProfileHarness({ presentation: 'mobile', showJourney: true });
  const actions = () => h.layoutRepair.map(([action]) => action);
  assert.equal(h.render().props['data-public-image-catalogue'], '');
  assert.deepEqual(actions(), ['repair', 'observe']);
  assert.ok(h.layoutRepair.every(([, root]) => root === h.profileDom), 'The committed public host reaches the repair helper.');
  h.render(); assert.deepEqual(actions(), ['repair', 'observe'], 'An ordinary render cannot replay correction.');

  h.state.view = 'journey';
  assert.equal(h.render().props['data-public-image-catalogue'], undefined);
  assert.deepEqual(actions(), ['repair', 'observe', 'disconnect']);
  assert.ok(one(h.render(), 'lazy:../features/journey/JourneyView'));

  h.state.view = 'portfolio'; h.render();
  assert.deepEqual(actions().slice(-2), ['repair', 'observe']);
  h.state.active = false;
  assert.equal(h.render().props['data-public-image-catalogue'], undefined);
  assert.equal(actions().at(-1), 'disconnect');
  const hiddenCount = h.layoutRepair.length;
  h.render(); assert.equal(h.layoutRepair.length, hiddenCount);
  h.state.active = true; h.render();
  assert.deepEqual(actions().slice(-2), ['repair', 'observe']);

  h.state.search.set('view', 'portals');
  assert.equal(h.render().props['data-public-image-catalogue'], undefined);
  assert.equal(actions().at(-1), 'disconnect');
  h.state.categoryId = 'portal';
  assert.equal(h.render().props['data-public-image-catalogue'], '');
  assert.deepEqual(actions().slice(-2), ['repair', 'observe'], 'A category containing project images remains an ordinary image catalogue.');
  h.dispose(); assert.equal(actions().at(-1), 'disconnect');

  const web = visitorProfileHarness({ presentation: 'web', showJourney: true });
  assert.equal(web.render().props['data-public-image-catalogue'], undefined);
  assert.deepEqual(web.layoutRepair, []); web.dispose();
});

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
  assert.equal(render().props['data-web-profile-header'],undefined);
  const identity=nodes(render()).find(node=>node.props?.className?.includes('profile-identity-copy'));
  assert.ok(one(identity,'JourneyToggle'),'The existing MOBILE tabs remain in the identity');
  assert.equal(nodes(render()).filter(node=>node.type==='JourneyToggle').length,1);
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

test('a retained inactive catalogue hides from interaction and propagates inactivity to card and Timeline popup owners', () => {
  const h = visitorProfileHarness({ presentation: 'mobile', showJourney: true });
  const cards = tree => one(tree, 'JustifiedImageWall').props.items.map(item => item.content);
  assert.ok(cards(h.render()).every(card => card.props.active));
  assert.equal(h.profileDom.inert, false);
  one(h.render(), 'PlatformGrid').props.onOpenBio();
  assert.ok(one(h.render(), 'lazy:../features/profile/ProfileBioSheet'));
  h.state.active = false;
  let tree = h.render();
  assert.equal(tree.props.hidden, true); assert.equal(h.profileDom.inert, true); assert.equal(tree.props['aria-hidden'], true);
  assert.equal(Object.hasOwn(tree.props, 'inert'), false, 'React 18 must not receive an unsupported boolean JSX inert attribute.');
  assert.equal(tree.props.style.display, 'none'); assert.equal(tree.props.onClickCapture, undefined);
  assert.ok(cards(tree).every(card => card.props.active === false));
  h.state.view = 'journey'; tree = h.render();
  assert.equal(one(tree, 'lazy:../features/journey/JourneyView').props.active, false);
  h.state.active = true; tree = h.render();
  assert.equal(h.profileDom.inert, false, 'The same retained host is interactive again before paint.');
  assert.equal(one(tree, 'lazy:../features/journey/JourneyView').props.active, true);
  assert.equal(one(tree, 'lazy:../features/profile/ProfileBioSheet'), undefined, 'Reactivation cannot resurrect the earlier Biography popup.');
  assert.equal(one(tree, 'JourneyToggle').props.view, 'journey', 'Reader return retains the selected catalogue composition.');
});

test('retained project cards discard body popup state while inactive and ordinary cards remain active by default', () => {
  const h = hooks(), state = { active: undefined }, project = profile.projects[0];
  const { ProjectPreviewCard } = load('components/profile/ProjectPreviewCard.tsx', name => {
    if (name.endsWith('/ProjectPageBrowsingContext')) return { useInlineProjectPages: () => false };
    if (name.endsWith('/cataloguePagePosition')) return { getCataloguePagePosition: () => undefined, rememberCataloguePagePosition() {} };
    if (name.endsWith('/cataloguePageNavigation')) return { withCataloguePageTarget: href => href };
    if (name.endsWith('/useInlineProjectContent')) return { useInlineProjectContent: ({ project }) => ({ project, metadataComplete: false, loading: false, error: null, retry() {} }) };
    if (name.endsWith('/inlineProjectPageModel')) return { normalizeInlineProjectPosition: (_project, position) => position, inlinePositionMatches: () => true };
    if (name === 'react') return h.react;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => 'mobile' };
    if (name.endsWith('/useMobileProjectContext')) return { useMobileProjectContext: () => ({}) };
    if (name.endsWith('/useContentPreview')) return { useContentPreview: () => ({ expanded: false, ref: null, events: {}, open: (_event, action) => action() }) };
    if (name.endsWith('/projectPresentation')) return { getProjectAspectRatio: () => 1, getProjectCoverPreview: () => null };
    if (name.endsWith('/projectContinuity')) return { projectContinuityStyle: () => ({}), getProjectContinuityArtwork: () => undefined, beginProjectContinuity() {} };
    if (name.endsWith('/warmDocumentRenderer')) return { warmProjectDocumentRenderer() {} };
    if (name === 'react-router-dom') return { Link: 'Link' };
    if (name === 'lucide-react') return { MoreHorizontalIcon: 'MoreHorizontalIcon' };
    return named(name.split('/').at(-1));
  });
  const render = () => h.render(() => ProjectPreviewCard({ project, creator: profile, onOpen() {}, active: state.active }));
  button(render(), 'Show details for A project').props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.ok(one(render(), 'MobileProjectPopup'), 'Existing callers that omit active still open details.');
  state.active = false; assert.equal(one(render(), 'MobileProjectPopup'), undefined);
  state.active = true; assert.equal(one(render(), 'MobileProjectPopup'), undefined, 'Returning cannot resurrect an old body popup.');
});

test('retained Timeline clears body popup state while preserving the selected sort', () => {
  const h = hooks(), state = { active: undefined }, project = profile.projects[0];
  const { JourneyView } = load('features/journey/JourneyView.tsx', name => {
    if (name === 'react') return h.react;
    if (name === 'react-dom') return { createPortal: children => children };
    if (name.endsWith('.css')) return {};
    if (name.endsWith('/useServices')) return { useServices: () => ({}) };
    if (name.endsWith('/ServicesContext')) return { useServices: () => ({}) };
    if (name.endsWith('/useJourneyCitations')) return { useJourneyCitations: () => [] };
    if (name.endsWith('/journeyCitations')) return { journeyTimeline: () => [{ year: '2026', projectCount: 1, entries: [{ kind: 'project', project }] }] };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => 'mobile' };
    if (name === './journey') return { journeyProjects: projects => projects, projectMonth: () => null };
    if (name === './calendar') return { calendarDay: () => null };
    if (name === './useTimelinePairs') return { useTimelinePairs: () => ({ pairs: [], error: null, loading: false }) };
    if (name === './useTimelineSection') return { useTimelineSection: () => ({ atPairs: false, reset() {} }) };
    if (name === 'lucide-react') return { MoreHorizontalIcon: 'MoreHorizontalIcon' };
    return named(name.split('/').at(-1));
  });
  const render = () => h.render(() => { const wrapper = JourneyView({ profile, owner: false, active: state.active, onOpen() {} }); return wrapper.type(wrapper.props); });
  button(render(), 'Oldest').props.onClick();
  button(render(), 'Show details for A project').props.onClick(); assert.ok(one(render(), 'MobileProjectPopup'));
  state.active = false; assert.equal(one(render(), 'MobileProjectPopup'), undefined);
  state.active = true; assert.equal(one(render(), 'MobileProjectPopup'), undefined);
  assert.equal(button(render(), 'Oldest').props['aria-pressed'], true);
  const portalButton = nodes(render()).find(node => node.props?.className === 'journey-portal');
  portalButton.props.onClick(); assert.ok(one(render(), 'DeferredDialog'));
  state.active = false; assert.equal(one(render(), 'DeferredDialog'), undefined);
  state.active = true; assert.equal(one(render(), 'DeferredDialog'), undefined);
  assert.equal(button(render(), 'Oldest').props['aria-pressed'], true);
});

test('public MOBILE Timeline portals its real toolbar into the profile header and always remains read-only',()=>{
 const h=visitorProfileHarness({presentation:'mobile',showJourney:true});h.state.view='journey';
 let tree=h.render();
 const header=nodes(tree).find(node=>node.props?.className==='profile-header-region contents');
 const host=nodes(header).find(node=>node.props?.className==='timeline-header-controls');
 assert.ok(host);assert.equal(typeof host.ref,'function');
 const attached={nodeType:1,id:'synthetic-timeline-toolbar-host'};host.ref(attached);
 for(const [signedIn,own] of [[false,false],[true,false],[true,true]]){
  Object.assign(h.state,{signedIn,own});tree=h.render();
  const timeline=one(tree,'lazy:../features/journey/JourneyView');
  assert.equal(timeline.props.toolbarHost,attached);assert.equal(timeline.props.owner,false);assert.equal(timeline.props.showPopular,false);
  assert.equal(timeline.props.profile,h.bioProfile);
 }
 host.ref(null);assert.equal(one(h.render(),'lazy:../features/journey/JourneyView').props.toolbarHost,null);
});

test('public catalogue, portal views and denied Timeline never mount a mobile toolbar host; WEB keeps its in-flow toolbar',()=>{
 const host=tree=>nodes(tree).find(node=>node.props?.className==='timeline-header-controls');
 const mobile=visitorProfileHarness({presentation:'mobile',showJourney:true});
 assert.equal(host(mobile.render()),undefined);
 mobile.state.view='journey';mobile.state.categoryId='portal';assert.equal(host(mobile.render()),undefined);
 mobile.state.categoryId=null;mobile.state.search.set('view','portals');assert.equal(host(mobile.render()),undefined);
 const denied=visitorProfileHarness({presentation:'mobile',showJourney:false});denied.state.view='journey';
 assert.equal(host(denied.render()),undefined);assert.equal(one(denied.render(),'lazy:../features/journey/JourneyView'),undefined);
 const web=visitorProfileHarness({presentation:'web',showJourney:true});web.state.view='journey';
 const tree=web.render(),timeline=one(tree,'lazy:../features/journey/JourneyView');
 assert.equal(host(tree),undefined);assert.equal(timeline.props.toolbarHost??null,null);assert.equal(timeline.props.owner,false);assert.equal(timeline.props.showPopular,false);
});

test('shared Journey permission still excludes disabled Timeline on both presentations', () => {
  for (const presentation of ['mobile', 'web']) {
    const denied = visitorProfileHarness({ presentation, showJourney: false });
    denied.state.view = 'journey';
    for (const own of [true, false]) {
      denied.state.own = own;
      assert.equal(one(denied.render(), 'JourneyToggle'), undefined);
      assert.equal(one(denied.render(), 'lazy:../features/journey/JourneyView'), undefined);
    }
  }
});

test('WEB public Catalogue and Timeline share one compact identity toggle without a standalone pill', () => {
  const web = visitorProfileHarness({ presentation: 'web', showJourney: true });
  for (const view of ['portfolio', 'journey', 'portfolio']) {
    const previous = one(web.render(), 'JourneyToggle');
    previous.props.onChange(view);
    const tree = web.render(), direct = React.Children.toArray(tree.props.children);
    assert.equal(tree.props['data-web-profile-header'], '', 'WEB opts into the existing compact identity styling');
    assert.equal(tree.props['data-public-image-catalogue'], undefined, 'The MOBILE catalogue boundary stays separate');
    assert.equal(nodes(tree).filter(node => node.type === 'JourneyToggle').length, 1);
    assert.equal(direct.some(node => node.type === 'JourneyToggle'), false, 'No toggle remains below the links or employer overview');
    const header = nodes(tree).find(node => node.props?.className?.includes('profile-header-region'));
    assert.equal(React.Children.toArray(header.props.children).some(node => node.type === 'JourneyToggle'), false, 'Timeline has no second standalone header toggle');
    const identity = nodes(header).find(node => node.props?.className?.includes('profile-identity-copy'));
    const viewRow = nodes(identity).find(node => node.props?.className === 'profile-identity-view');
    const toggle = one(viewRow, 'JourneyToggle');
    assert.ok(toggle, 'The single switch is inside the name/location identity column');
    assert.equal(toggle.props.view, view);
    assert.equal(web.state.view, view);
    assert.equal(one(nodes(tree).find(node => node.props?.id === 'profile-navigation-tools'), 'JourneyToggle'), undefined);
    if (view === 'journey') {
      const journey = one(tree, 'lazy:../features/journey/JourneyView');
      assert.ok(journey); assert.equal(journey.props.owner, false); assert.equal(journey.props.toolbarHost, null);
      assert.equal(one(tree, 'JustifiedImageWall'), undefined);
    } else {
      assert.ok(one(tree, 'JustifiedImageWall'));
      assert.equal(one(tree, 'lazy:../features/journey/JourneyView'), undefined);
    }
  }
  web.dispose();
});

test('WEB category and Portals views retain their existing content without gaining identity tabs', () => {
  const web = visitorProfileHarness({ presentation: 'web', showJourney: true });
  for (const view of ['portfolio', 'journey']) {
    web.state.view = view;
    web.state.categoryId = 'portal';
    let tree = web.render();
    assert.equal(tree.props['data-web-profile-header'], '');
    assert.equal(one(tree, 'JourneyToggle'), undefined);
    assert.equal(one(tree, 'lazy:../features/journey/JourneyView'), undefined);
    assert.equal(one(tree, 'h2').props.children, 'Photography');
    assert.ok(button(tree, 'Back to profile'));
    assert.ok(one(tree, 'JustifiedImageWall'));
    web.state.categoryId = null;
    web.state.search.set('view', 'portals');
    tree = web.render();
    assert.equal(one(tree, 'JourneyToggle'), undefined);
    assert.equal(one(tree, 'lazy:../features/journey/JourneyView'), undefined);
    const collection = one(tree, 'lazy:../components/profile/ProfileCollectionGrid');
    assert.equal(collection.props.shared, true); assert.equal(collection.props.kind, 'portals');
    web.state.search.delete('view');
  }
  web.dispose();
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

test('WEB portal entry replaces its first displayed public project and preserves the addressed query and hash', () => {
  for (const root of [`/share/${profileId}`, '/creator']) {
    const h = appHarness(); h.state.presentation = 'web';
    h.state.route = { kind: 'sharedCategory', profileId, categoryId: 'portal' };
    h.state.location = { ...h.state.location, pathname: `${root}/c/portal`, search: '?via=friend&media=paper&page=3', hash: '#chapter' };
    h.state.query = { ...h.state.query, profile: { ...profile, projects: [
      { id: 'private', categoryId: 'portal', isPinned: true, isPubliclyVisible: false },
      { id: 'other', categoryId: 'different', isPinned: true }, ...profile.projects,
    ] } };
    let tree = h.render();
    assert.deepEqual(json(h.navigations), [[`${root}/c/portal/next?via=friend&media=paper&page=3#chapter`, { replace: true }]]);
    assert.equal(one(tree, 'VisitorProfileGrid'), undefined, 'Portal entry does not flash a second project grid before the reader.');
    assert.equal(one(tree, 'loading').props.kind, 'reader');
    assert.ok(one(tree, 'main').props.className.includes('overflow-hidden'));
    const scroll = nodes(tree).find(node => node.props?.['data-screen-scroll']);
    assert.equal(scroll.props['data-screen-scroll'], 'nested'); assert.ok(scroll.props.className.includes('h-full'));
    h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'next' };
    h.state.location.pathname = `${root}/c/portal/next`;
    tree = h.render();
    const reader = nodes(tree).find(node => node.props?.project?.id === 'next' && node.props?.onBack);
    assert.ok(reader); assert.equal(reader.key, `${profileId}/portal`);
    h.render(); assert.equal(h.navigations.length, 1, 'An explicitly selected project is never redirected to the portal default.');
    h.state.route = { ...h.state.route, projectId: 'work' }; h.state.location.pathname = `${root}/c/portal/work`;
    const nextReader = nodes(h.render()).find(node => node.props?.project?.id === 'work' && node.props?.onBack);
    assert.equal(nextReader.key, reader.key, 'Selecting within one WEB portal retains the mounted index.');
    reader.props.onBack();
    assert.deepEqual(json(h.navigations.at(-1)), [root, { replace: true }]);
  }
});

test('WEB portal entry uses first public bundle order when unpinned, and empty portals keep the reader frame', () => {
  const h = appHarness(); h.state.presentation = 'web';
  h.state.route = { kind: 'sharedCategory', profileId, categoryId: 'portal' };
  h.state.location.pathname = `/share/${profileId}/c/portal`;
  h.state.query = { ...h.state.query, profile: { ...profile, projects: [
    { id: 'excluded', categoryId: 'portal', isPubliclyVisible: false },
    { id: 'first', categoryId: 'portal' }, { id: 'second', categoryId: 'portal' },
  ] } };
  h.render(); assert.deepEqual(json(h.navigations), [[`/share/${profileId}/c/portal/first`, { replace: true }]]);
  const empty = appHarness(); empty.state.presentation = 'web';
  empty.state.route = { kind: 'sharedCategory', profileId, categoryId: 'portal' };
  empty.state.location.pathname = `/share/${profileId}/c/portal`;
  empty.state.query = { ...empty.state.query, profile: { ...profile, projects: [{ id: 'other', categoryId: 'different' }] } };
  const tree = empty.render();
  const reader = nodes(tree).find(node => node.props?.project === null && node.props?.categoryId === 'portal');
  assert.ok(reader); assert.equal(reader.key, `${profileId}/portal`);
  assert.equal(one(tree, 'VisitorProfileGrid'), undefined); assert.equal(one(tree, 'loading'), undefined);
  assert.equal(nodes(tree).find(node => node.props?.['data-screen-scroll']).props['data-screen-scroll'], 'nested');
  assert.equal(empty.navigations.length, 0);
  reader.props.onBack(); assert.deepEqual(json(empty.navigations.at(-1)), [`/share/${profileId}`, { replace: true }]);
});

test('WEB portal automatic selection waits for the current public creator and resolved ready route', () => {
  const cases = [
    ['loading', h => { h.state.query = { ...h.state.query, status: 'loading', profile: null }; }],
    ['failed', h => { h.state.query = { ...h.state.query, status: 'error', profile: null, error: 'offline' }; }],
    ['missing', h => { h.state.query = { ...h.state.query, status: 'not-found', profile: null }; }],
    ['pending handle', h => { h.state.handlePending = true; }],
    ['failed handle', h => { h.state.handleError = 'offline'; }],
    ['stale creator', h => { h.state.query = { ...h.state.query, profile: { ...profile, id: '22222222-2222-4222-8222-222222222222' } }; }],
    ['private creator', h => { h.state.query = { ...h.state.query, profile: { ...profile, isPrivate: true } }; }],
    ['missing portal', h => { h.state.route = { ...h.state.route, categoryId: 'missing' }; }],
    ['invalid creator id', h => { h.state.route = { ...h.state.route, profileId: 'not-a-profile' }; }],
  ];
  for (const [label, configure] of cases) {
    const h = appHarness(); h.state.presentation = 'web';
    h.state.route = { kind: 'sharedCategory', profileId, categoryId: 'portal' };
    h.state.location.pathname = `/share/${profileId}/c/portal`;
    configure(h); h.render();
    assert.equal(h.navigations.length, 0, label);
  }
  const h = appHarness(); h.state.presentation = 'web'; h.render();
  h.state.route = { kind: 'controlCenter' };
  h.state.location = { ...h.state.location, pathname: '/control-center', state: { settingsReturn: `/share/${profileId}/c/portal` } };
  assert.ok(one(h.render(), 'lazy:../components/ControlCenterPage'));
  assert.deepEqual(json(h.navigations), [[`/share/${profileId}/c/portal?settings=1`, { replace: true }]], 'Legacy Settings canonicalizes to public Settings without selecting a portal project.');
});

test('uncached WEB selection keeps its confirmed portal reader mounted without showing previous media while loading', async () => {
  const h = appHarness(); h.state.presentation = 'web';
  h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' };
  h.state.location.pathname = `/share/${profileId}/c/portal/work`;
  const selectedReader = tree => nodes(tree).find(node => node.props?.onSelect && node.props?.onBack && Object.hasOwn(node.props, 'project'));
  const initial = selectedReader(h.render());
  assert.equal(initial.props.project.id, 'work'); assert.equal(initial.props.loading, false);
  initial.props.onSelect('next');
  assert.equal(h.navigations.at(-1)[0], `/share/${profileId}/c/portal/next`);
  let finishRead;
  const read = new Promise(resolve => { finishRead = resolve; });
  h.state.route = { ...h.state.route, projectId: 'next' };
  h.state.location.pathname = `/share/${profileId}/c/portal/next`;
  h.state.query = { ...h.state.query, status: 'loading', profile: null };
  let tree = h.render(), pendingReader = selectedReader(tree);
  assert.ok(pendingReader, 'The actual shared query null/loading state does not replace the category reader with a global skeleton.');
  assert.equal(pendingReader.type, initial.type); assert.equal(pendingReader.key, initial.key);
  assert.equal(pendingReader.props.profile, initial.props.profile);
  assert.equal(one(tree, 'SharedProfileSidebar').props.profile, initial.props.profile);
  assert.equal(pendingReader.props.project, null); assert.equal(pendingReader.props.categoryId, 'portal');
  assert.equal(pendingReader.props.loading, true); assert.equal(one(tree, 'loading'), undefined);
  assert.equal(nodes(tree).some(node => node.props?.project?.id === 'work'), false, 'Old selected originals are never passed to a loading reader.');
  assert.equal(selectedReader(h.render()).key, initial.key);
  assert.equal(h.navigations.length, 1, 'Loading cannot trigger another automatic selection.');
  finishRead({ ...profile, projects: profile.projects.map(item => item.id === 'next' ? { ...item, attachments: [{ id: 'next-public-file', kind: 'document' }] } : item) });
  h.state.query = { ...h.state.query, status: 'ready', profile: await read };
  const completed = selectedReader(h.render());
  assert.equal(completed.type, initial.type); assert.equal(completed.key, initial.key);
  assert.equal(completed.props.project.id, 'next'); assert.equal(completed.props.loading, false);
  assert.equal(completed.props.project.attachments[0].id, 'next-public-file');
});

test('WEB retained reader loading never crosses an account, creator, portal, handle, error or Settings boundary', () => {
  const cases = [
    ['account', h => { h.state.auth = { ...h.state.auth, user: { id: 'another-account' } }; }],
    ['creator', h => { h.state.route = { ...h.state.route, profileId: '22222222-2222-4222-8222-222222222222' }; }],
    ['portal', h => { h.state.route = { ...h.state.route, categoryId: 'another-portal' }; }],
    ['handle pending', h => { h.state.handlePending = true; }],
    ['handle error', h => { h.state.handleError = 'offline'; }],
    ['invalid creator', h => { h.state.route = { ...h.state.route, profileId: 'invalid' }; }],
    ['Settings', h => { h.state.route = { kind: 'controlCenter' }; h.state.location.state = { settingsReturn: `/share/${profileId}/c/portal/work` }; }],
    ['MOBILE', h => { h.state.presentation = 'mobile'; }],
    ['read error', h => { h.state.query.status = 'error'; h.state.query.error = 'offline'; }],
    ['not found', h => { h.state.query.status = 'not-found'; }],
  ];
  for (const [label, changeScope] of cases) {
    const h = appHarness(); h.state.presentation = 'web';
    h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' };
    h.state.location.pathname = `/share/${profileId}/c/portal/work`;
    h.render();
    h.state.route = { ...h.state.route, projectId: 'next' };
    h.state.query = { ...h.state.query, status: 'loading', profile: null };
    changeScope(h);
    const tree = h.render();
    assert.equal(nodes(tree).some(node => Object.hasOwn(node.props ?? {}, 'project') && node.props?.onSelect), false, label);
    assert.equal(one(tree, 'SharedProfileSidebar'), undefined, label);
  }
  const direct = appHarness(); direct.state.presentation = 'web';
  direct.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' };
  direct.state.query = { ...direct.state.query, status: 'loading', profile: null };
  assert.equal(one(direct.render(), 'loading').props.kind, 'reader', 'A direct reader has no fabricated prior public index.');
  const failed = appHarness(); failed.state.presentation = 'web';
  failed.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' }; failed.render();
  failed.state.query = { ...failed.state.query, status: 'error', profile: null, error: 'offline' };
  assert.ok(one(failed.render(), 'RouteError'));
  failed.state.query = { ...failed.state.query, status: 'loading', error: null };
  assert.ok(one(failed.render(), 'loading'), 'An error clears the confirmed index before retry.');
});

test('explicit WEB project addresses retain selection and missing-project errors without portal fallback', () => {
  for (const projectId of ['work', 'missing']) {
    const h = appHarness(); h.state.presentation = 'web';
    h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId };
    h.state.location.pathname = `/share/${profileId}/c/portal/${projectId}`;
    const tree = h.render();
    assert.equal(h.navigations.length, 0);
    if (projectId === 'work') assert.ok(nodes(tree).find(node => node.props?.project?.id === 'work'));
    else assert.equal(one(tree, 'RouteError').props.kind, 'not-found');
  }
});

test('WEB portal navigation clears prior catalogue origin while ordinary card Back preserves its exact origin', () => {
  const origin = { profileId, path: '/creator?sort=oldest#last-row', projectId: 'work', top: 300, left: 0, anchorTop: 40 };
  const h = appHarness({ catalogueOrigin: origin }); h.state.presentation = 'web';
  h.state.location = { ...h.state.location, pathname: '/creator', search: '?sort=oldest', hash: '#last-row' };
  one(h.render(), 'VisitorProfileGrid').props.onOpen('portal', 'work');
  h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' };
  h.state.location = { ...h.state.location, pathname: '/creator/c/portal/work', search: '', hash: '' };
  let tree = h.render();
  nodes(tree).find(node => node.props?.project?.id === 'work').props.onBack();
  assert.deepEqual(json(h.navigations.at(-1)), [origin.path, null]);
  one(tree, 'SharedProfileSidebar').props.onOpenCategory('portal');
  assert.deepEqual(json(h.navigations.at(-1)), ['/creator/c/portal', null]);
  h.state.route = { kind: 'sharedCategory', profileId, categoryId: 'portal' };
  h.state.location.pathname = '/creator/c/portal'; h.render();
  assert.deepEqual(json(h.navigations.at(-1)), ['/creator/c/portal/next', { replace: true }]);
  h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'next' };
  h.state.location.pathname = '/creator/c/portal/next'; tree = h.render();
  nodes(tree).find(node => node.props?.project?.id === 'next').props.onBack();
  assert.deepEqual(json(h.navigations.at(-1)), ['/creator', { replace: true }], 'A new sidebar portal must not restore an unrelated old catalogue location.');
});

test('WEB legacy preview URLs use ordinary portal navigation and never recreate preview state', () => {
  const h = appHarness(); h.state.presentation = 'web'; h.signedIn({ viewerProfileId: profileId });
  h.state.location = { ...h.state.location, pathname: '/creator', search: '?visitorPreview=1' };
  one(h.render(), 'SharedProfileSidebar').props.onOpenCategory('portal');
  assert.deepEqual(json(h.navigations.at(-1)), ['/creator/c/portal', null]);
  h.state.route = { kind: 'sharedCategory', profileId, categoryId: 'portal' };
  h.state.location = { ...h.state.location, pathname: '/creator/c/portal', search: '?visitorPreview=1&via=friend', hash: '#entry' };
  h.render(); assert.deepEqual(json(h.navigations.at(-1)), ['/creator/c/portal/next?visitorPreview=1&via=friend#entry', { replace: true }]);
  h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'next' };
  h.state.location.pathname = '/creator/c/portal/next';
  const reader = nodes(h.render()).find(node => node.props?.project?.id === 'next');
  reader.props.onBack(); assert.deepEqual(json(h.navigations.at(-1)), ['/creator', { replace: true }]);
  h.state.route = { kind: 'sharedCategory', profileId, categoryId: 'portal' };
  h.state.location = { ...h.state.location, pathname: '/creator/c/portal', search: '?via=friend', hash: '#entry' };
  h.render(); assert.deepEqual(json(h.navigations.at(-1)), ['/creator/c/portal/next?via=friend#entry', { replace: true }], 'Ordinary public query/hash state stays intact without reviving the retired mode.');
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
    assert.equal(project.key, presentation === 'mobile' ? 'work' : `${profileId}/portal`);
    assert.equal(one(tree, 'SharedPortalPopup'), undefined);
    assert.equal(h.navigations.length, 0, 'Explicit project links are not replaced by a chooser');
    project.props.onBack();
    assert.deepEqual(json(h.navigations.at(-1)), [`/share/${profileId}`, { replace: true }]);
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
    } else {
      assert.deepEqual(json(h.navigations), [[`/share/${profileId}/c/portal/next`, { replace: true }]]);
      assert.equal(one(categoryTree, 'SharedPortalPopup'), undefined);
      assert.equal(one(categoryTree, 'VisitorProfileGrid'), undefined);
    }
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

test('MOBILE shared popup Back requests its Portals chooser without navigating or reopening on ordinary dismissal and selection', () => {
  const h = appHarness();
  one(h.render(), 'SharedProfileSidebar').props.onOpenCategory('portal');
  let tree = h.render();
  assert.equal(one(tree, 'SharedProfileSidebar').props.mobileNavigationEnabled, false);
  assert.equal(one(tree, 'SharedProfileSidebar').props.mobileNavigationRequest, undefined);
  one(tree, 'SharedPortalPopup').props.onBack();
  tree = h.render();
  assert.equal(one(tree, 'SharedPortalPopup'), undefined);
  const request = one(tree, 'SharedProfileSidebar').props.mobileNavigationRequest;
  assert.ok(request);
  assert.equal(one(tree, 'SharedProfileSidebar').props.mobileNavigationEnabled, true);
  assert.equal(one(h.render(), 'SharedProfileSidebar').props.mobileNavigationRequest, request, 'Rerendering does not create repeated requests.');
  assert.equal(h.navigations.length + h.assigned.length + h.replaced.length, 0, 'Popup Back stays inside the catalogue and never traverses browser history.');

  one(tree, 'SharedProfileSidebar').props.onOpenCategory('portal');
  one(h.render(), 'SharedPortalPopup').props.onClose();
  tree = h.render();
  assert.notEqual(one(tree, 'SharedProfileSidebar').props.mobileNavigationRequest, request,
    'Opening another portal clears the consumed request rather than replaying it on dismissal.');
  assert.equal(one(tree, 'SharedProfileSidebar').props.mobileNavigationRequest, undefined);
  one(tree, 'SharedProfileSidebar').props.onOpenCategory('portal');
  one(h.render(), 'SharedPortalPopup').props.onSelect('portal', 'work');
  tree = h.render();
  assert.equal(one(tree, 'SharedProfileSidebar').props.mobileNavigationRequest, undefined);
  assert.deepEqual(json(h.navigations), [[`/share/${profileId}/c/portal/work`, { replace: false }]]);
});

test('MOBILE chooser return requests expire with route, creator, account or presentation changes', () => {
  for (const change of ['pathname', 'search', 'hash', 'creator', 'account', 'presentation']) {
    const h = appHarness();
    one(h.render(), 'SharedProfileSidebar').props.onOpenCategory('portal');
    one(h.render(), 'SharedPortalPopup').props.onBack();
    assert.ok(one(h.render(), 'SharedProfileSidebar').props.mobileNavigationRequest);
    if (change === 'pathname') h.state.location = { ...h.state.location, pathname: '/creator' };
    if (change === 'search') h.state.location = { ...h.state.location, search: '?via=friend' };
    if (change === 'hash') h.state.location = { ...h.state.location, hash: '#another-project' };
    if (change === 'creator') {
      const other = '22222222-2222-4222-8222-222222222222';
      h.state.route = { kind: 'sharedProfile', profileId: other };
      h.state.location = { ...h.state.location, pathname: `/share/${other}` };
      h.state.query = { ...h.state.query, profile: { ...profile, id: other } };
    }
    if (change === 'account') h.signedIn();
    if (change === 'presentation') h.state.presentation = 'web';
    assert.equal(one(h.render(), 'SharedProfileSidebar').props.mobileNavigationRequest, undefined, `${change} invalidates old return intent.`);
    assert.equal(one(h.render(), 'SharedPortalPopup'), undefined);
    if (change === 'presentation') {
      h.state.presentation = 'mobile';
      assert.equal(one(h.render(), 'SharedProfileSidebar').props.mobileNavigationRequest, undefined, 'Returning to MOBILE cannot replay an old request.');
    }
  }
});

test('MOBILE public browse preferences survive chooser-to-reader and project remounts within their portal', () => {
  const h = appHarness();
  const readerNode = tree => nodes(tree).find(node => node.props?.project?.id && node.props?.onBack);
  h.state.query.profile = { ...h.state.query.profile, categories: [...h.state.query.profile.categories, { id: 'other', label: 'Other portal' }] };
  one(h.render(), 'SharedProfileSidebar').props.onOpenCategory('portal');
  let popup = one(h.render(), 'SharedPortalPopup');
  assert.equal(popup.props.browsing.layout, 'list');
  assert.equal(popup.props.browsing.sort, 'recent');
  popup.props.browsing.onLayout('grid');
  popup.props.browsing.onSort('title');
  popup = one(h.render(), 'SharedPortalPopup');
  assert.equal(popup.props.browsing.layout, 'grid');
  assert.equal(popup.props.browsing.sort, 'title');
  popup.props.onSelect('portal', 'work');
  h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' };
  h.state.location = { ...h.state.location, key: 'reader-work', pathname: `/share/${profileId}/c/portal/work` };
  let tree = h.render(), reader = readerNode(tree);
  assert.equal(one(tree, 'SharedPortalPopup'), undefined);
  assert.equal(reader.props.browsing.layout, 'grid');
  assert.equal(reader.props.browsing.sort, 'title');
  reader.props.onSelect('next');
  h.state.route = { ...h.state.route, projectId: 'next' };
  h.state.location = { ...h.state.location, key: 'reader-next', pathname: `/share/${profileId}/c/portal/next` };
  reader = readerNode(h.render());
  assert.equal(reader.props.browsing.layout, 'grid');
  assert.equal(reader.props.browsing.sort, 'title');
  reader.props.browsing.onSort('saved');
  assert.equal(readerNode(h.render()).props.browsing.sort, 'saved');

  h.state.route = { kind: 'sharedProfile', profileId };
  h.state.location = { ...h.state.location, key: 'catalogue-return', pathname: `/share/${profileId}` };
  one(h.render(), 'SharedProfileSidebar').props.onOpenCategory('other');
  popup = one(h.render(), 'SharedPortalPopup');
  assert.equal(popup.props.browsing.layout, 'list');
  assert.equal(popup.props.browsing.sort, 'recent');
  popup.props.onClose();
  one(h.render(), 'SharedProfileSidebar').props.onOpenCategory('portal');
  popup = one(h.render(), 'SharedPortalPopup');
  assert.equal(popup.props.browsing.layout, 'grid');
  assert.equal(popup.props.browsing.sort, 'saved');
  popup.props.onClose();
  h.state.presentation = 'web';
  h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' };
  h.state.location = { ...h.state.location, pathname: `/share/${profileId}/c/portal/work` };
  assert.equal(readerNode(h.render()).props.browsing, undefined, 'WEB keeps its established reader controls.');
  assert.deepEqual(h.requests, [], 'View preferences never request authentication or writes.');
});

test('public MOBILE project opens retain the catalogue composition and Close uses the trusted reader history entry', () => {
  const h = appHarness(); h.state.location.key = 'catalogue';
  const grid = one(h.render(), 'VisitorProfileGrid'); assert.equal(grid.props.active, true);
  grid.props.onOpen('portal', 'work');
  assert.deepEqual(json(h.navigations.at(-1)), [`/share/${profileId}/c/portal/work`, { replace: false }]);
  h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' };
  h.state.location = { ...h.state.location, key: 'reader', pathname: `/share/${profileId}/c/portal/work` };
  h.window.history.state.idx = 2;
  let tree = h.render();
  assert.equal(one(tree, 'VisitorProfileGrid').props.active, false, 'The same catalogue stays mounted but inactive beneath the reader.');
  const reader = nodes(tree).find(node => node.props?.project?.id === 'work' && node.props?.onBack);
  const catalogueBoundary = nodes(tree).find(node => node.type === 'DeferredSurfaceBoundary' && one(node, 'VisitorProfileGrid'));
  const readerBoundary = nodes(tree).find(node => node.type === 'DeferredSurfaceBoundary' && nodes(node).includes(reader));
  assert.ok(catalogueBoundary); assert.ok(readerBoundary); assert.notEqual(catalogueBoundary, readerBoundary);
  assert.equal(catalogueBoundary.props.active, false);
  assert.equal(nodes(readerBoundary).includes(one(tree, 'VisitorProfileGrid')), false, 'A failed reader chunk cannot replace its retained catalogue boundary.');
  reader.props.onBack(); reader.props.onBack();
  assert.deepEqual(json(h.navigations), [[`/share/${profileId}/c/portal/work`, { replace: false }], [-1, null]]);
  h.state.route = { kind: 'sharedProfile', profileId };
  h.state.location = { ...h.state.location, key: 'catalogue', pathname: `/share/${profileId}` };
  h.window.history.state.idx = 1; tree = h.render();
  assert.equal(one(tree, 'VisitorProfileGrid').props.active, true);
});

test('direct reader Close replaces the creator catalogue on MOBILE and WEB without reopening its portal', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = appHarness(); h.state.presentation = presentation;
    h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' };
    h.state.location = { ...h.state.location, key: 'direct-reader', pathname: `/share/${profileId}/c/portal/work` };
    const tree = h.render();
    const reader = nodes(tree).find(node => node.props?.project?.id === 'work' && node.props?.onBack);
    reader.props.onBack();
    assert.deepEqual(json(h.navigations.at(-1)), [`/share/${profileId}`, { replace: true }]);
    assert.equal(one(tree, 'VisitorProfileGrid'), undefined, 'A direct reader cannot fabricate a prior retained catalogue.');
  }
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

test('shared catalogues use and persist the platform mode while preserving creator colors and visitor accessibility choices', () => {
  const platformKey = presentation => `portalinknetworks.interfaceAppearance.${presentation}`;
  const publicMobileKey = 'portalinknetworks.publicAppearance.mobile';
  for (const presentation of ['web', 'mobile']) {
    const initialMode = presentation === 'mobile' ? 'dark' : 'light';
    const oppositeMode = initialMode === 'dark' ? 'light' : 'dark';
    const publicMobile = { mode: oppositeMode, highContrast: true, reduceTranslucency: true, accentColor: '#af52de', systemGray: 'gray4' };
    const viewerSettings = { mode: initialMode, highContrast: presentation === 'web', reduceTranslucency: presentation === 'web', accentColor: '#ff375f', systemGray: 'gray2' };
    const appearanceStorage = new Map([
      [platformKey(presentation), JSON.stringify(viewerSettings)],
      [publicMobileKey, JSON.stringify(publicMobile)],
    ]);
    const publicAppearance = { mode: oppositeMode, accentColor: '#34c759', systemGray: 'gray3' };
    const open = (systemDark = oppositeMode === 'dark') => {
      const h = appHarness({ appearanceStorage, systemDark });
      h.state.presentation = presentation;
      h.state.query.profile = { ...profile, publicAppearance };
      return h;
    };
    const assertTheme = (tree, theme) => {
      assert.ok(tree.props.className.includes(`theme-${theme}`));
      assert.ok(tree.props.className.includes('high-contrast'));
      assert.ok(tree.props.className.includes('reduce-translucency'));
      assert.equal(tree.props.style['--accent-color'], publicAppearance.accentColor);
      assert.equal(one(tree, 'SharedProfileSidebar').props.theme, theme);
    };

    const first = open();
    assertTheme(first.render(), initialMode);
    first.state.location.search = '?settings=1';
    const settings = one(first.render(), 'lazy:../components/ControlCenterPage');
    assert.equal(settings.props.appearanceMode, initialMode);
    settings.props.onAppearanceModeChange(oppositeMode);
    assertTheme(first.render(), oppositeMode);
    assert.deepEqual(JSON.parse(appearanceStorage.get(platformKey(presentation))), { ...viewerSettings, mode: oppositeMode });
    assert.deepEqual(JSON.parse(appearanceStorage.get(publicMobileKey)), publicMobile);
    first.dispose();

    const reloaded = open(initialMode === 'dark');
    assertTheme(reloaded.render(), oppositeMode);
    one(reloaded.render(), 'SharedProfileSidebar').props.onThemeChange('auto');
    assertTheme(reloaded.render(), initialMode);
    assert.equal(JSON.parse(appearanceStorage.get(platformKey(presentation))).mode, 'auto');
    reloaded.dispose();
  }
});

test('a shared catalogue applies the viewer’s chosen accent and restores it on reload', () => {
  const appearanceStorage = new Map();
  const publicAppearance = Object.freeze({ mode: 'light', accentColor: '#34c759', systemGray: 'gray3' });
  const creator = { ...profile, publicAppearance };
  const settings = tree => one(tree, 'lazy:../components/ControlCenterPage').props;
  for (const [presentation, chosenAccent, nextAccent] of [['mobile', '#007aff', '#ff9500'], ['web', '#af52de', '#ff375f']]) {
    const platformKey = `portalinknetworks.interfaceAppearance.${presentation}`;
    const viewerKey = presentation === 'mobile' ? 'portalinknetworks.publicAppearance.mobile' : platformKey;
    const platformAccent = '#ffcc00';
    appearanceStorage.set(platformKey, JSON.stringify({ accentColor: platformAccent }));
    if (presentation === 'mobile') appearanceStorage.set(viewerKey, JSON.stringify({ accentColor: '#5ac8fa', publicAccentColor: 'url(invalid)' }));

    const open = () => {
      const h = appHarness({ appearanceStorage });
      h.state.presentation = presentation;
      h.state.query.profile = creator;
      h.state.location.search = '?settings=1';
      return h;
    };
    const first = open();
    let tree = first.render();
    assert.equal(tree.props.style['--accent-color'], publicAppearance.accentColor);
    assert.equal(settings(tree).accentColor, publicAppearance.accentColor);
    settings(tree).onAccentColorChange(chosenAccent);
    tree = first.render();
    assert.equal(settings(tree).accentColor, chosenAccent);
    assert.equal(tree.props.style['--accent-color'], chosenAccent);

    const auth = one(tree, 'lazy:../features/auth/AuthDialog').props;
    auth.onAccentColorChange(nextAccent);
    first.state.location.search = '';
    assert.equal(first.render().props.style['--accent-color'], nextAccent);
    first.dispose();

    const reloaded = open();
    tree = reloaded.render();
    assert.equal(settings(tree).accentColor, nextAccent);
    assert.equal(tree.props.style['--accent-color'], nextAccent);
    assert.equal(JSON.parse(appearanceStorage.get(viewerKey)).publicAccentColor, nextAccent);
    assert.equal(JSON.parse(appearanceStorage.get(platformKey)).accentColor, platformAccent);
    assert.equal(creator.publicAppearance.accentColor, '#34c759');
    reloaded.dispose();
  }
  assert.equal(JSON.parse(appearanceStorage.get('portalinknetworks.publicAppearance.mobile')).publicAccentColor, '#ff9500');
});

test('WEB shared sidebar uses the viewer gray and theme while the shell retains creator colors', () => {
  const deviceAppearance = { ...appearance, systemGray: 'gray2', highContrast: true, reduceTranslucency: true };
  const publicAppearance = { mode: 'dark', accentColor: '#34c759', systemGray: 'gray5' };
  const h = appHarness({ deviceAppearance });
  h.state.query.profile = { ...profile, publicAppearance };
  h.state.presentation = 'web';
  let tree = h.render();
  const creatorPalette = navButtonTokens.resolveNavButtonTokens('light', publicAppearance.accentColor, true, true, 'gray5');
  const viewerPalette = navButtonTokens.resolveNavButtonTokens('light', publicAppearance.accentColor, true, true, 'gray2');
  assert.notEqual(viewerPalette['--navigation-surface'], creatorPalette['--navigation-surface']);
  assert.equal(tree.props.style['--accent-color'], publicAppearance.accentColor);
  assert.equal(tree.props.style['--navigation-surface'], creatorPalette['--navigation-surface']);
  assert.deepEqual(json(one(tree, 'SharedProfileSidebar').props.desktopNavigationStyle), json(viewerPalette));

  h.state.location.search = '?settings=1';
  assert.equal(one(h.render(), 'lazy:../components/ControlCenterPage').props.systemGray, 'gray2');

  h.state.location.search = '';
  h.state.location.pathname = `/share/${profileId}/c/portal/work`;
  h.state.route = { kind: 'sharedProject', profileId, categoryId: 'portal', projectId: 'work' };
  const currentReader = () => nodes(h.render()).find(node => node.props?.project?.id === 'work' && node.props?.onBack);
  assert.deepEqual(json(currentReader().props.desktopNavigationStyle), json(viewerPalette));
  h.state.presentation = 'mobile';
  assert.equal(currentReader().props.desktopNavigationStyle, undefined);

  h.state.route = { kind: 'sharedProfile', profileId };
  h.state.location.pathname = `/share/${profileId}`;
  h.state.location.search = '?settings=1';
  tree = h.render();
  assert.equal(tree.props.style['--navigation-surface'], creatorPalette['--navigation-surface']);
  assert.equal(one(tree, 'SharedProfileSidebar').props.desktopNavigationStyle, undefined);
  assert.equal(one(tree, 'lazy:../components/ControlCenterPage').props.systemGray, 'gray5');

  h.state.location.search = '';
  h.state.presentation = 'web';
  h.state.query.profile = { ...profile, publicAppearance: { ...publicAppearance, systemGray: 'gray2' } };
  tree = h.render();
  assert.equal(tree.props.style['--navigation-surface'], viewerPalette['--navigation-surface']);
  assert.equal(one(tree, 'SharedProfileSidebar').props.desktopNavigationStyle, undefined);
});

test('legacy preview URLs remain ordinary public catalogues with public appearance and public queries', () => {
 for (const presentation of ['mobile', 'web']) for (const viewer of ['guest', 'owner', 'other']) {
  const h = appHarness(); h.state.presentation = presentation;
  if (viewer !== 'guest') h.signedIn({ viewerProfileId: viewer === 'owner' ? profileId : 'other-profile' });
  h.state.location.search = '?visitorPreview=1&via=friend';
  h.state.query.profile = { ...profile, publicAppearance: { mode: 'light', accentColor: '#34c759', systemGray: 'gray' } };
  const tree = h.render();
  assert.match(tree.props.className, /theme-light/); assert.equal(tree.props.style['--accent-color'], '#34c759');
  assert.equal(tree.props['data-public-portfolio'], ''); assert.ok(one(tree, 'VisitorProfileGrid'));
  assert.equal(h.queryCalls.at(-1)[0], profileId);
  assert.equal(one(tree, 'VisitorPreviewBar'), undefined);
  assert.equal(button(tree, 'Done'), undefined);
  assert.equal(h.navigations.length + h.assigned.length + h.replaced.length, 0, `${presentation}/${viewer} keeps the public catalogue open`);
  h.state.location.search = '';
  assert.equal(one(h.render(), 'VisitorPreviewBar'), undefined);
 }
});
