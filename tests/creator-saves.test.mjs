import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
function load(path, imports) {
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (id) => {
    if (!(id in imports) && id.endsWith('/cataloguePageNavigation')) return { withCataloguePageTarget: href => href };
    if (!(id in imports) && id.endsWith('/MobileContextActions')) return {useMobileScreenActions(){}};
    if (id.endsWith('/textFormatting')) return sourceModule('src/components/text/textFormatting.ts');
    if (!(id in imports)) throw new Error(`Missing test import ${id}`);
    return imports[id];
  } });
  return exports;
}
const routes = load('../src/app/routes.ts', { '../components/navigation': { navigationDestinations: [] } });

test('personal destinations have canonical URLs and require authentication', () => {
  let location = { pathname: '/saved', search: '' };
  const routing = load('../src/app/useAppRoute.ts', {
    react: { useEffect() {}, useMemo: (f) => f() },
    'react-router-dom': { useLocation: () => location, useNavigate: () => () => {}, matchPath: (pattern, path) => pattern === path ? { params: {} } : null },
    './routes': routes, '../types/engagement': {}, '../utils/projectContinuity': {},
  });
  for (const [kind, path] of [['saved', '/saved'], ['notifications', '/notifications'], ['insights', '/insights']]) {
    location = { pathname: path, search: '' };
    assert.equal(routes.buildPath(kind), path);
    assert.equal(routing.useAppRoute().kind, kind);
    assert.ok(routing.PROTECTED_ROUTE_KINDS.has(kind));
  }
  assert.ok(!routing.PROTECTED_ROUTE_KINDS.has('sharedProfile'));
});

function saveService({ signedIn = true, data = true, error = null } = {}) {
  const calls = [];
  const chain = {
    select(value) { calls.push(['select', value]); return chain; },
    eq(key, value) { calls.push(['eq', key, value]); return chain; },
    maybeSingle: async () => ({ data, error }),
    order: async () => ({ data, error }),
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: signedIn ? { user: { id: 'verified-account' } } : null }, error: null }) },
    from(table) { calls.push(['table', table]); return chain; },
    rpc: async (name, params) => { calls.push([name, params]); return { data, error }; },
  };
  const module = load('../src/services/supabase/creatorSaveService.ts', { './client': { requireSupabase: () => client } });
  return { service: module.supabaseCreatorSaveService, calls, unavailable: module.unavailableCreatorSaveService };
}

test('mutations send desired state, never an account supplied by the UI', async () => {
  const { service, calls } = saveService();
  assert.equal(await service.setCreatorSave('creator', true), true);
  assert.equal(calls[0][0], 'set_creator_save');
  assert.equal(JSON.stringify(calls[0][1]), JSON.stringify({ p_profile_id: 'creator', p_saved: true }));
  await service.getCreatorSave('creator');
  assert.ok(calls.some((call) => call[0] === 'eq' && call[1] === 'account_id' && call[2] === 'verified-account'));
});

test('guests, connection errors and unconfirmed saves fail instead of fabricating success', async () => {
  await assert.rejects(saveService({ signedIn: false }).service.setCreatorSave('creator', true), /Sign in/);
  await assert.rejects(saveService({ error: {} }).service.setCreatorSave('creator', true), /Unable/);
  await assert.rejects(saveService({ data: null }).service.setCreatorSave('creator', true), /confirmed/);
  await assert.rejects(saveService().unavailable.getSaveInsights(), /connected account/);
});

test('insights accept real zeros but reject unavailable or invalid totals', async () => {
  const zero = { creatorSaves: 0, projectSaves: 0, followers: 0 };
  assert.equal(await saveService({ data: zero }).service.getSaveInsights(), zero);
  for (const data of [null, {}, { ...zero, creatorSaves: -1 }, { ...zero, followers: '3' }]) {
    await assert.rejects(saveService({ data }).service.getSaveInsights(), /confirmed/);
  }
});

test('creator save button is absent on own profile and shows selected state for another creator', () => {
  let auth = { user: { id: 'a' }, isAuthenticated: true, viewerProfileId: 'mine' };
  const { CreatorSaveButton } = load('../src/features/library/CreatorSaveButton.tsx', {
    '../../presentation/mobile/MobileContextActions': { useMobileScreenActions() {} },
    '../../presentation/mobile/contextActions': { contextActions: () => null },
    react: React, 'lucide-react': icons,
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../contexts/ServicesContext': { useServices: () => ({ creatorSaves: {} }) },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: () => React.createElement('svg') },
    './useAccountQuery': { useAccountQuery: () => ({ data: true, loading: false }) },
  });
  assert.equal(renderToStaticMarkup(React.createElement(CreatorSaveButton, { profileId: 'mine', name: 'Me' })), '');
  const html = renderToStaticMarkup(React.createElement(CreatorSaveButton, { profileId: 'other', name: 'Another creator' }));
  assert.match(html, /aria-label="Unsave Another creator"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /private/);
});

test('the shared profile sidebar does not expose personal account destinations or creator saving', () => {
  assert.doesNotMatch(read('../src/components/profile/SharedProfileSidebar.tsx'), /PersonalFooterLinks|PersonalNavigationTile|CreatorSaveButton/);
});

test('saved library has distinct Projects and Creators collections with a private explanation', () => {
  const pages = load('../src/features/library/PersonalPages.tsx', {
    '../../presentation/mobile/MobileProfileContext': { MobileProfileContext: ({ children }) => children },
    '../../presentation/usePresentation': { usePresentation: () => 'web' },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: ({ children }) => React.createElement(React.Fragment, null, children) },
    react: React, 'lucide-react': icons, 'react-router-dom': { Link: () => null, useSearchParams: () => [new URLSearchParams(), () => {}] },
    '../../app/routes': routes, '../../contexts/AuthContext': { useAuth: () => ({ isAuthenticated: true, user: { id: 'a' } }) },
    '../../contexts/ServicesContext': { useServices: () => ({}) },
    '../../components/profile/ActivityCollectionPage': { ActivityCollectionPage: ({ kind, embedded }) => React.createElement('div', { 'data-collection': kind, 'data-embedded': embedded }) },
    '../../components/profile/CreatorAvatar': {}, '../../components/ui/InterfaceIcon': { InterfaceIcon: () => null },
    '../../components/ui/StateViews': {}, '../../components/messages/InboxPanel': {}, '../../types/profile': {}, './useAccountQuery': {}, './SavedPagesCollection': {}, './collectionQueries': {},
  });
  const html = renderToStaticMarkup(React.createElement(pages.SavedPage, { onBack() {}, onOpenProject() {} }));
  assert.match(html, /Projects/); assert.match(html, /Pages/); assert.match(html, /Creators/);
  assert.match(html, /private library/); assert.match(html, /does not follow/);
  assert.match(html, /data-collection="save" data-embedded="true"/);
});

test('shared profile stays minimal and owner header no longer duplicates Saved', () => {
  const profile = read('../src/components/UserProfilePage.tsx');
  assert.match(profile, /!isJourney && !showsOwnerTools && !isSharedView && <CreatorSaveButton/);
  assert.doesNotMatch(profile, /ENGAGEMENT_KINDS/);
  const accountQuery = read('../src/features/library/useAccountQuery.ts');
  assert.match(accountQuery, /result\?\.account === account && result\?\.query === query/);
  assert.match(accountQuery, /current = false/);
});

test('a creator-save failure from the context sheet propagates to its visible notice', async () => {
  let model;
  const { CreatorSaveButton } = load('../src/features/library/CreatorSaveButton.tsx', {
    react: React, 'lucide-react': icons,
    '../../presentation/mobile/MobileContextActions': { useMobileScreenActions(value) { model = value; } },
    '../../presentation/mobile/contextActions': { contextActions: (_kind, _viewer, target) => target },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'a' }, isAuthenticated: true, viewerProfileId: 'mine' }) },
    '../../contexts/ServicesContext': { useServices: () => ({ creatorSaves: { setCreatorSave: async () => { throw Error('Offline'); } } }) },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: () => null },
    './useAccountQuery': { useAccountQuery: () => ({ data: false, loading: false }) },
  });
  renderToStaticMarkup(React.createElement(CreatorSaveButton, { profileId: 'other', name: 'Creator' }));
  await assert.rejects(model.handlers.saveCreator(), /Offline/);
});

test('opting out of creator-save screen actions preserves direct confirmed saving, duplicate guards and guest authentication', async () => {
  for (const registerScreenActions of [undefined, false]) {
    const slots = [], calls = [], requests = []; let cursor = 0, model, complete;
    const auth = { user: { id: 'account' }, isAuthenticated: true, viewerProfileId: 'viewer', requestAuth: kind => requests.push(kind) };
    const react = { ...React,
      useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
      useRef(initial) { return slots[cursor++] ??= { current: initial }; }, useEffect() {}, useCallback: callback => callback,
    };
    const { CreatorSaveButton } = load('../src/features/library/CreatorSaveButton.tsx', {
      react, 'lucide-react': icons,
      '../../contexts/AuthContext': { useAuth: () => auth },
      '../../contexts/ServicesContext': { useServices: () => ({ creatorSaves: { setCreatorSave(...args) { calls.push(args); return new Promise(resolve => { complete = resolve; }); } } }) },
      '../../components/ui/InterfaceIcon': { InterfaceIcon: 'InterfaceIcon' },
      '../../presentation/mobile/MobileContextActions': { useMobileScreenActions(value) { model = value; } },
      '../../presentation/mobile/contextActions': { contextActions: (_kind, _viewer, target) => target },
      './useAccountQuery': { useAccountQuery: () => ({ data: false, loading: false }) },
    });
    const render = () => {
      cursor = 0; model = undefined;
      const control = CreatorSaveButton({ profileId: 'creator', name: 'Creator', registerScreenActions });
      return control.type(control.props);
    };
    const button = tree => profileNodes(tree).find(node => node.type === 'button');
    let tree = render();
    if (registerScreenActions === false) assert.equal(model, null);
    else assert.ok(model.handlers.saveCreator, 'Existing callers keep their context action by default');
    assert.equal(button(tree).props['aria-label'], 'Save Creator'); assert.equal(button(tree).props['aria-pressed'], false);
    button(tree).props.onClick(); button(tree).props.onClick();
    assert.deepEqual(calls, [['creator', true]], 'Two direct presses cannot create duplicate writes');
    tree = render(); assert.equal(button(tree).props.disabled, true); assert.equal(button(tree).props['aria-pressed'], false);
    complete(true); for (let i = 0; i < 5; i++) await Promise.resolve(); tree = render();
    assert.equal(button(tree).props.disabled, false); assert.equal(button(tree).props['aria-label'], 'Unsave Creator'); assert.equal(button(tree).props['aria-pressed'], true);
    if (registerScreenActions === false) assert.equal(model, null);
    else assert.equal(model.labels.saveCreator, 'Unsave creator');
    auth.isAuthenticated = false; auth.user = null; tree = render(); button(tree).props.onClick();
    assert.deepEqual(requests, ['signIn']); assert.equal(calls.length, 1, 'The opt-out cannot bypass authentication');
  }
});

const profileNodes = tree => !React.isValidElement(tree) ? [] : [tree,
  ...(tree.type?.name === 'ProfileIdentityAndLinks' ? profileNodes(tree.type(tree.props)) : []),
  ...React.Children.toArray(tree.props.children).flatMap(profileNodes)];

/** Runs the real profile and view-selection hook; unrelated descendants stay boundaries. */
function timelineActionsHarness(presentation, viewerRole = 'visitor', followState = {}, profilePatch = {}) {
  const slots = [], requests = [], mutations = [];
  let cursor = 0, params = new URLSearchParams(), profileModel, bookmarkModel, pressModel;
  const react = { ...React,
    lazy: loader => loader.toString().includes('JourneyView') ? 'JourneyView' : 'dialog',
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo: factory => factory(), useEffect() {},
  };
  const auth = { user: viewerRole === 'guest' ? null : { id: 'account' }, isAuthenticated: viewerRole !== 'guest', viewerProfileId: viewerRole === 'owner' ? 'creator' : 'viewer', requestAuth: kind => requests.push(kind) };
  const journey = sourceModule('src/features/journey/journey.ts');
  const selection = sourceModule('src/features/journey/useJourneySelection.ts', { react, './journey': journey });
  const actions = sourceModule('src/presentation/mobile/contextActions.ts', { 'lucide-react': icons });
  const viewer = sourceModule('src/types/viewer.ts');
  const follow = { isFollowing: false, isRequested: false, isResolving: false, isPending: false, resolveError: null, mutationError: null,
    onToggle: () => mutations.push('follow'), onRetry: null, ...followState };
  const { CreatorSaveButton } = load('../src/features/library/CreatorSaveButton.tsx', {
    react: React, 'lucide-react': icons,
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../contexts/ServicesContext': { useServices: () => ({ creatorSaves: { setCreatorSave: () => { throw Error('Unexpected save mutation'); } } }) },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: () => null },
    '../../presentation/mobile/MobileContextActions': { useMobileScreenActions: model => { bookmarkModel = model; } },
    '../../presentation/mobile/contextActions': actions,
    './useAccountQuery': { useAccountQuery: () => ({ data: true, loading: false }) },
  });
  const code = ts.transpileModule(read('../src/components/UserProfilePage.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const exports = {}, placeholder = new Proxy({}, { get: (_object, key) => key });
  vm.runInNewContext(code, { exports, URL, URLSearchParams, window: { location: { origin: 'https://portalink.test' } }, require(name) {
    if (name.endsWith('/MobileBackNavigation')) return { ScreenBack: 'ScreenBack', useMobileScreenActive: () => true };
    if (name.endsWith('/publicOrigin')) return { PUBLIC_ORIGIN: 'https://portalinknetworks.com' };
    if (name === 'react') return react;
    if (name.endsWith('/lazyWithMobileRecovery')) return { lazyWithMobileRecovery: loader => react.lazy(loader) };
    if (name.endsWith('/DeferredSurfaceOwner')) return { DeferredSurfaceOwnerContext: React.createContext({}) };
    if (name === 'react-router-dom') return { useLocation: () => ({ state: null }), useNavigate: () => () => {}, useSearchParams: () => [params, update => { params = update(params); }] };
    if (name === 'lucide-react') return icons;
    if (name.endsWith('.css')) return {};
    if (name.endsWith('/routes')) return routes;
    if (name.endsWith('/viewer')) return viewer;
    if (name.endsWith('/AuthContext')) return { useAuth: () => auth };
    if (name.endsWith('/ServicesContext')) return { useServices: () => ({ profiles: {} }) };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/useJourneySelection')) return selection;
    if (name.endsWith('/journey')) return journey;
    if (name.endsWith('/CreatorSaveButton')) return { CreatorSaveButton };
    if (name.endsWith('/contextActions')) return actions;
    if (name.endsWith('/MobileContextActions')) return { MobileContextButton: 'mobile-actions', useMobileScreenActions: model => { profileModel = model; }, useMobileContextPress: model => { pressModel = model; return {}; } };
    if (name.endsWith('/useProfileVisibility')) return { useProfileVisibility: () => ({ isPrivate: profilePatch.isPrivate === true }) };
    if (name.endsWith('/useFollowRequests')) return { useFollowRequests: () => ({ count: 0, requests: [] }) };
    if (name.endsWith('/useProfileConnections')) return { useProfileConnections: () => ({ counts: {}, items: [] }) };
    if (name.endsWith('/useProjectManagement')) return { useProjectManagement: () => ({ editor: { projectId: null } }) };
    if (name.endsWith('/useProfileProjectOrder')) return { useProfileProjectOrder: () => ({ order: [], isSaving: false }) };
    if (name.endsWith('/useProjectGridDensity')) return { useProjectGridDensity: () => ({ columns: 3 }) };
    if (name.endsWith('/profileLinks')) return { resolveProfileLinks: () => [] };
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({}) };
    if (name.endsWith('/useMobileHeaderMaterial')) return { useMobileHeaderMaterial() {} };
    if (name.endsWith('/useProfileSwipeReturn')) return { useProfileSwipeReturn() {} };
    if (name.endsWith('/useMobilePortalPopupSize')) return { useMobilePortalPopupSize() {} };
    if (name.endsWith('/useReorderOutsideTap')) return { useReorderOutsideTap() {} };
    return placeholder;
  } });
  const profile = { id: 'creator', name: 'Creator', location: 'London', showJourney: true, projects: [], categories: [], links: [], socialLinks: {}, ...profilePatch };
  const editProfile = () => requests.push('edit'), publish = () => requests.push('publish');
  const props = { profile, viewerRole, follow, onBack() {}, onOpenProject() {}, onSignInRequest: () => requests.push('follow-sign-in'), onEditProfile: editProfile, onPublishProject: publish };
  let tree, bookmarkHtml = '';
  const h = {
    requests, mutations, follow, profile, editProfile, publish,
    get model() { return profileModel; }, get bookmarkModel() { return bookmarkModel; }, get bookmarkHtml() { return bookmarkHtml; }, get pressModel() { return pressModel; },
    render() { cursor = 0; bookmarkModel = undefined; tree = exports.UserProfilePage(props); const bookmark = profileNodes(tree).find(node => node.type === CreatorSaveButton); bookmarkHtml = bookmark ? renderToStaticMarkup(bookmark) : ''; return tree; },
    nodes() { return profileNodes(tree); },
    screenActions() { return actions.mergeContextActions([profileModel, bookmarkModel].filter(Boolean)); },
    button(label) { return h.nodes().find(node => node.type === 'button' && (node.props['aria-label'] === label || node.props.children === label)); },
    openTools() { const button = h.button('Profile options'); if (button && !button.props['aria-expanded']) button.props.onClick(); return h.render(); },
    select(view) { const toggle = h.nodes().find(node => node.type === 'JourneyToggle'); assert.ok(toggle); toggle.props.onChange(view); return h.render(); },
  };
  return h;
}

for (const presentation of ['mobile', 'web']) {
  test(`${presentation} another creator's Timeline omits follow and bookmark capabilities and Portfolio restores confirmed states`, () => {
    for (const state of [{}, { isFollowing: true }, { isRequested: true }]) {
      const h = timelineActionsHarness(presentation, 'visitor', state);
      h.render(); h.openTools();
      const initial = h.nodes().find(node => node.props['data-profile-follow'] !== undefined);
      assert.ok(initial); assert.equal(initial.props.onClick, h.follow.onToggle);
      const label = initial.props['aria-label'], selected = initial.props['aria-pressed'];
      if (presentation === 'mobile') { assert.equal(h.model, null); assert.equal(h.pressModel, null); }
      else assert.equal(h.model.target.handlers.follow, h.follow.onToggle);
      assert.match(h.bookmarkHtml, /aria-label="Unsave Creator"/);
      if (presentation === 'mobile') assert.equal(h.bookmarkModel, null);
      else assert.ok(h.bookmarkModel.target.handlers.saveCreator);
      h.select('journey');
      assert.ok(h.nodes().some(node => node.type === 'JourneyView'));
      assert.equal(h.nodes().some(node => node.props['data-profile-follow'] !== undefined), false);
      assert.equal(h.nodes().some(node => node.props.id === 'profile-navigation-tools'), false);
      if (presentation === 'mobile') assert.equal(h.model, null);
      else {
        assert.equal(h.model.target.handlers.follow, undefined);
        assert.equal([...h.model.primary, ...h.model.groups.flat()].some(action => ['follow', 'saveCreator'].includes(action.id)), false);
        assert.deepEqual([...h.model.primary, ...h.model.groups.flat()].map(action => action.id), ['share', 'copy'], 'WEB public Timeline keeps its allowed Share and Copy actions.');
      }
      assert.equal(h.pressModel, h.model);
      assert.equal(h.bookmarkHtml, ''); assert.equal(h.bookmarkModel, undefined, 'An absent CreatorSaveButton cannot register a save action.');
      if (presentation === 'web') assert.equal(h.button('Profile options'), undefined);
      h.select('portfolio'); h.openTools();
      const restored = h.nodes().find(node => node.props['data-profile-follow'] !== undefined);
      assert.equal(restored.props['aria-label'], label); assert.equal(restored.props['aria-pressed'], selected); assert.equal(restored.props.onClick, h.follow.onToggle);
      if (presentation === 'mobile') { assert.equal(h.model, null); assert.equal(h.bookmarkModel, null); }
      else { assert.equal(h.model.target.handlers.follow, h.follow.onToggle); assert.ok(h.bookmarkModel.target.handlers.saveCreator); }
      assert.match(h.bookmarkHtml, /aria-label="Unsave Creator"/);
      assert.deepEqual(h.mutations, [], 'Switching views changes no confirmed follow or bookmark state.');
    }
  });

  test(`${presentation} guest Timeline omits the follow sign-in control and bookmark entry until Portfolio returns`, () => {
    const h = timelineActionsHarness(presentation, 'guest');
    h.render(); h.openTools(); assert.ok(h.button('Sign in to follow'));
    assert.match(h.bookmarkHtml, /data-profile-bookmark/);
    h.select('journey');
    assert.equal(h.button('Sign in to follow'), undefined); assert.equal(h.bookmarkHtml, ''); assert.equal(h.bookmarkModel, undefined);
    if (presentation === 'mobile') assert.equal(h.model, null);
    else assert.equal(h.model.target.handlers.follow, undefined);
    assert.deepEqual(h.requests, []);
    h.select('portfolio'); h.openTools(); h.button('Sign in to follow').props.onClick();
    assert.deepEqual(h.requests, ['follow-sign-in']);
    assert.match(h.bookmarkHtml, /data-profile-bookmark/);
  });

  test(`${presentation} private Timeline with no allowed actions has no empty action button, registration, or hold model`, () => {
    for (const viewerRole of ['visitor', 'guest']) {
      const h = timelineActionsHarness(presentation, viewerRole, {}, { isPrivate: true });
      h.render(); h.openTools(); h.select('journey');
      assert.ok(h.nodes().some(node => node.type === 'JourneyView'));
      assert.equal(h.model, null); assert.equal(h.pressModel, null);
      assert.equal(h.bookmarkModel, undefined); assert.equal(h.bookmarkHtml, '');
      assert.equal(h.nodes().some(node => node.type === 'mobile-actions'), false);
      assert.equal(h.button('Profile options'), undefined);
      if (presentation === 'mobile') assert.equal(h.nodes().some(node => node.props['data-inline-screen-actions'] !== undefined), false, 'No empty options wrapper remains on another creator profile');
      h.select('portfolio'); h.openTools();
      assert.match(h.bookmarkHtml, /data-profile-bookmark/);
      if (viewerRole === 'visitor' && presentation === 'web') assert.equal(h.model.target.handlers.follow, h.follow.onToggle);
      else if (viewerRole === 'visitor') assert.equal(h.model, null);
      else assert.ok(h.button('Sign in to follow'));
      assert.deepEqual(h.mutations, []); assert.deepEqual(h.requests, []);
    }
  });

  test(`${presentation} private Portfolio keeps bookmark access while follow is resolving, pending, or unavailable`, () => {
    for (const followState of [{ isResolving: true }, { isPending: true }, { resolveError: 'Follow unavailable' }]) {
      const h = timelineActionsHarness(presentation, 'visitor', followState, { isPrivate: true });
      h.render(); h.openTools();
      assert.match(h.bookmarkHtml, /aria-label="Unsave Creator"/);
      if (presentation === 'mobile') {
        assert.equal(h.model, null); assert.equal(h.pressModel, null); assert.equal(h.bookmarkModel, null);
        assert.equal(h.nodes().some(node => node.type === 'mobile-actions'), false);
        assert.equal(h.button('Profile options'), undefined);
      } else {
        assert.ok(h.model, 'WEB Portfolio keeps the main registration even when Follow cannot currently be offered.');
        assert.equal(h.model.target.handlers.follow, undefined); assert.equal(h.pressModel, h.model);
        const model = h.screenActions(), available = [...model.primary, ...model.groups.flat()];
        assert.deepEqual(available.map(action => action.id), ['saveCreator']);
        assert.equal(available[0].label, 'Unsave creator');
        assert.equal(available[0].run, h.bookmarkModel.target.handlers.saveCreator, 'The existing independent WEB bookmark registration remains reachable.');
        assert.ok(h.button('Profile options'));
      }
      h.select('journey');
      assert.equal(h.model, null); assert.equal(h.pressModel, null); assert.equal(h.bookmarkModel, undefined);
      h.select('portfolio'); h.openTools();
      if (presentation === 'mobile') { assert.equal(h.model, null); assert.equal(h.bookmarkModel, null); assert.match(h.bookmarkHtml, /aria-label="Unsave Creator"/); }
      else assert.equal(h.screenActions().primary[0].id, 'saveCreator');
      assert.deepEqual(h.mutations, []); assert.deepEqual(h.requests, []);
    }
  });

  test(`${presentation} owner Timeline retains authoring capabilities and never gains creator follow or save controls`, () => {
    const h = timelineActionsHarness(presentation, 'owner');
    h.render(); h.openTools();
    assert.equal(h.model.target.handlers.editProfile, h.editProfile); assert.equal(h.model.target.handlers.newProject, h.publish);
    h.select('journey');
    assert.equal(h.model.target.handlers.editProfile, h.editProfile); assert.equal(h.model.target.handlers.newProject, h.publish);
    assert.ok(h.model.target.handlers.thenNow);
    assert.equal(h.model.target.handlers.follow, undefined); assert.equal(h.bookmarkHtml, '');
    if (presentation === 'web') assert.ok(h.button('Profile options'), 'Owner authoring tools remain reachable.');
    h.select('portfolio');
    assert.equal(h.model.target.handlers.editProfile, h.editProfile); assert.equal(h.model.target.handlers.newProject, h.publish);
    assert.equal(h.model.target.handlers.thenNow, undefined); assert.equal(h.bookmarkHtml, '');
  });
}
