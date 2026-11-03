import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function compile(path, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require: imports, ...globals });
  return exports;
}
const employer = compile('../src/features/employer/employer.ts', name => { assert.fail(`Unexpected employer import: ${name}`); });
const journeyHelpers = compile('../src/features/journey/journey.ts', () => ({}));
const gridDensity = compile('../src/utils/projectGridDensity.ts', () => ({}));
const socialTypes = compile('../src/types/social.ts', () => ({}));
const engagementTypes = compile('../src/types/engagement.ts', () => ({}));
const routes = compile('../src/app/routes.ts', () => ({ navigationDestinations: [] }));
const linkHelpers = compile('../src/features/profile/profileLinks.ts', () => ({profileLinkIconNames:['globe','instagram','soundcloud']}));
const placeholder = new Proxy({}, { get: (_, key) => key });
const contextActions = compile('../src/presentation/mobile/contextActions.ts', () => placeholder);
function nodes(tree, includeHidden = false) {
  if (!tree || typeof tree !== 'object' || (!includeHidden && (tree.props?.hidden || tree.props?.style?.display === 'none'))) return [];
  return [tree, ...(['ProfileIdentityAndLinks','ProfileStats'].includes(tree.type?.name) ? nodes(tree.type(tree.props), includeHidden) : []), ...React.Children.toArray(tree.props?.children).flatMap(child => nodes(child, includeHidden))];
}

const profileContent = tree => nodes(tree).find(node => node.props?.id === 'profile-content');
// Raw child slots retain false/null entries and original element identity. Using
// Children.toArray here would collapse those slots and rewrite element keys.
const workspaceViewer = tree => {
  const content = profileContent(tree)?.props.children;
  return content?.type === React.Fragment ? content.props.children[2] : content;
};

function serviceHarness(owner = 'owner', failure = null, mutual = false) {
  const calls = [];
  const client = {
    async rpc(name, args) {
      if (name === 'can_view_profile_connections') return { data: mutual, error: null };
      assert.equal(name, 'profile_identities');
      assert.deepEqual(Array.from(args.p_profile_ids), ['person']);
      calls.push({ rpc: name, args });
      return { data: [{ id: 'person', name: 'Person Name', handle: 'person', avatar_url: 'avatar.jpg' }], error: null };
    },
    auth: { getSession: async () => ({ data: { session: { user: { id: 'account' } } }, error: null }) },
    from(table) {
      const operations = [];
      const query = {};
      for (const method of ['select', 'eq', 'order', 'range', 'in']) query[method] = (...args) => { operations.push([method, ...args]); return query; };
      query.maybeSingle = async () => ({ data: { id: owner }, error: null });
      query.then = (done) => {
        calls.push({ table, operations });
        if (table === 'profiles') throw new Error('Identity hydration must use profile_identities');
        const column = operations.find(([method]) => method === 'select')[1];
        return Promise.resolve({ data: [{ [column]: 'person' }], count: 56, error: failure }).then(done);
      };
      return query;
    },
  };
  const { supabaseSocialService } = compile('../src/services/supabase/communityServices.ts', (name) => {
    if (name === './client') return { requireSupabase: () => client };
    if (name.endsWith('/social')) return socialTypes;
    return {};
  });
  return { service: supabaseSocialService, calls };
}

test('owner lists use confirmed edges, stable pagination and canonical person data in both directions', async () => {
  for (const kind of ['followers', 'following']) {
    const h = serviceHarness();
    const page = await h.service.listProfileConnections('owner', kind, 54);
    assert.equal(page.total, 56);
    assert.equal(page.nextOffset, 55);
    assert.equal(page.items[0].name, 'Person Name');
    const query = h.calls.find((call) => call.table === 'profile_follows').operations;
    assert.ok(query.some(([op, key, value]) => op === 'eq' && key === 'status' && value === 'following'));
    assert.ok(query.some(([op, key, value]) => op === 'eq' && key === (kind === 'followers' ? 'target_profile_id' : 'follower_profile_id') && value === 'owner'));
    assert.ok(query.some(([op, from, to]) => op === 'range' && from === 54 && to === 107));
    assert.equal(query.filter(([op]) => op === 'order').length, 2);
  }
});

test('non-owner reads are refused before querying relationships and network failures are not empty lists', async () => {
  const denied = serviceHarness('another-owner');
  await assert.rejects(denied.service.listProfileConnections('owner', 'followers'), (error) => error.code === 'permission_denied');
  assert.equal(denied.calls.length, 0);
  await assert.rejects(serviceHarness('owner', { message: 'offline' }).service.listProfileConnections('owner', 'following'), (error) => error.code === 'network');
});

function hookHarness(withCounts = false) {
  let cursor = 0;
  const slots = [];
  const effects = [];
  const pending = [];
  let accountId = 'account-a';
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, index) => value !== b[index]);
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useCallback(callback, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) slots[i] = { callback, deps }; return slots[i].callback; },
    useEffect(effect, deps) { const i = cursor++; if (changed(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; }); },
  };
  const countRequests = [];
  const social = { listProfileConnections: (...args) => new Promise((resolve, reject) => pending.push({ args, resolve, reject })), ...(withCounts ? {getProfileConnectionCounts: (...args) => new Promise((resolve, reject) => countRequests.push({args, resolve, reject}))} : {}) };
  const { useProfileConnections } = compile('../src/features/follows/useProfileConnections.ts', (name) => {
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({ onTriggerKeyDown() {} }) };
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name === 'react') return react;
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user: { id: accountId } }) };
    if (name.endsWith('/ServicesContext')) return { useServices: () => ({ social }) };
    return socialTypes;
  });
  return { pending, countRequests, switchAccount(id) { accountId = id; }, render(kind, refresh = 0) { cursor = 0; const result = useProfileConnections('owner', kind, refresh); effects.splice(0).forEach((effect) => effect()); return result; } };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const page = (id, nextOffset = null) => ({ items: [{ profileId: id, name: id, avatar: '' }], total: 2, nextOffset });

test('rapid view/account changes cannot display stale people or counts', async () => {
  const h = hookHarness();
  h.render('followers');
  h.render('following');
  h.pending[0].resolve(page('old-person'));
  h.pending[1].resolve(page('current-person'));
  await flush();
  assert.equal(h.render('following').items[0].profileId, 'current-person');
  h.switchAccount('account-b');
  assert.equal(h.render('following').items.length, 0);
  assert.equal(h.render('following').counts.following, undefined);
  h.pending[2].reject(new socialTypes.SocialServiceError('permission_denied', 'Private list'));
  await flush();
  assert.equal(h.render('following').canRetry, false);
});

test('pagination blocks duplicate requests, preserves loaded people on failure, and retries the same offset', async () => {
  const h = hookHarness();
  h.render('followers');
  h.pending[0].resolve(page('first', 54));
  await flush();
  let view = h.render('followers');
  view.loadMore(); view.loadMore();
  assert.equal(h.pending.length, 2);
  assert.equal(h.pending[1].args[2], 54);
  h.pending[1].reject(new Error('offline'));
  await flush();
  view = h.render('followers');
  assert.equal(view.items[0].profileId, 'first');
  view.retry();
  assert.equal(h.pending[2].args[2], 54);
  h.pending[2].resolve(page('second'));
  await flush();
  assert.deepEqual(Array.from(h.render('followers').items, (person) => person.profileId), ['first', 'second']);
  h.render('followers', 1);
  assert.equal(h.pending[3].args[2], 0, 'A follow-request decision refreshes the collection.');
});

test('collection tiles navigate to real portals/profiles and keep labels outside the squircle', () => {
  const { ProfileCollectionGrid } = compile('../src/components/profile/ProfileCollectionGrid.tsx', (name) => {
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({ onTriggerKeyDown() {} }) };
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name === 'react') return React;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => 'mobile' };
    if (name.endsWith('/routes')) return routes;
    if (name.endsWith('/categoryIcons')) return { getCategoryIcon: () => 'camera-icon' };
    return placeholder;
  });
  for (const kind of ['portals', 'followers', 'following']) {
    const tree = ProfileCollectionGrid({ profileId: 'owner', kind, portals: [{ id: 'photos', label: 'Photography', iconName: 'camera' }], people: [{ profileId: 'person', name: 'Person Name', avatar: '' }], loading: false, error: null, hasMore: false });
    const link = nodes(tree).find((node) => node.type === 'Link');
    assert.equal(link.props.to, kind === 'portals' ? '/p/owner/c/photos' : `/p/person?fromConnections=owner&connectionList=${kind}`);
    const children = React.Children.toArray(link.props.children);
    assert.match(children[0].props.className, /squircle/);
    assert.equal(children[1].props.className, 'profile-collection-name');
    if (kind !== 'portals') {
      const name = nodes(tree).find(node => node.type === 'PreviewCreatorName');
      assert.equal(name.props.name, 'Person Name');
      assert.equal(name.props.active, true);
    }
    assert.equal(nodes(tree).some((node) => node.props?.role === 'dialog'), false);
  }
});

function profileHarness(search = '', options = {}) {
  let params = new URLSearchParams(search);
  const navigation = [];
  const surfaceOwner = React.createContext({});
  let cursor = 0;
  const slots = [];
  const pendingEffects = [];
  const projects = options.projects ?? [];
  const density = {
    columns: options.columns ?? 5, previews: [], commits: [], saveError: null,
    previewColumns(value) { density.previews.push(value); density.columns = value; },
    setColumns(value) { density.commits.push(value); density.columns = value; },
  };
  const projectOrder = { order: projects.map(project => project.id), reset() {}, dismissError() {}, isSaving: false, commit: async () => true, ...options.projectOrder };
  let outside;
  let mobileActions, mobilePressModel;
  const journey = { view: options.journeyView ?? 'portfolio', select(view) { journey.view = view; } };
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect(effect, deps) {
      if (!options.document) return;
      const i = cursor++;
      if (!slots[i] || deps.some((value, index) => value !== slots[i].deps[index])) {
        pendingEffects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
      }
    }, useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; }, useMemo: (fn) => fn() };
  const { UserProfilePage } = compile('../src/components/UserProfilePage.tsx', (name) => {
    if (name.endsWith('/MobileBackNavigation')) return { ScreenBack: 'ScreenBack', useMobileScreenActive: () => options.screenActive ?? true };
    if (name.endsWith('/projectContinuity')) return { focusMobileProjectOrigin: root => options.onProjectOriginFocus?.(root) };
    if (name.endsWith('/mobileCatalogueScroll')) return { repairMobileCatalogueScroll() {}, observeMobileCatalogueScroll: () => () => {} };
    if (name.endsWith('/publicOrigin')) return { PUBLIC_ORIGIN: 'https://portalinknetworks.com' };
    if (name.endsWith('/copyPublicLink')) return { copyPublicLink: async value => options.onCopy?.(value) };
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({ onTriggerKeyDown() {} }) };
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name === 'react') return react;
    if (name.endsWith('/lazyWithMobileRecovery')) return { lazyWithMobileRecovery: loader => react.lazy(loader) };
    if (name.endsWith('/DeferredSurfaceOwner')) return { DeferredSurfaceOwnerContext: surfaceOwner };
    if (name === 'react-dom') return { flushSync: callback => callback() };
    if (name === 'react-router-dom') return { useLocation: () => ({ state: null }), useNavigate: () => (target, options) => navigation.push({ target, options }), useSearchParams: () => [params, (update, options) => { params = update(params); navigation.push(options); }] };
    if (name.endsWith('/routes')) return routes;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => options.presentation ?? 'web' };
    if (name.endsWith('/useMobileHeaderMaterial')) return { useMobileHeaderMaterial() {} };
    if (name.endsWith('/useProfileSwipeReturn')) return { useProfileSwipeReturn() {} };
    if (name.endsWith('/useMobilePortalPopupSize')) return { useMobilePortalPopupSize: () => ({ current: null }) };
    if (name.endsWith('/useReorderOutsideTap')) return { useReorderOutsideTap: (enabled, root, finish) => { outside = { enabled, finish }; } };
    if (name.endsWith('/projectPresentation')) return { getProjectAspectRatio: () => 1 };
    if (name.endsWith('/viewer')) return { canAuthor: (role) => role === 'owner', needsAccount: (role) => role === 'guest' };
    if (name.endsWith('/ServicesContext')) return {useServices:()=>({profiles:{}})};
    if (name.endsWith('/firstProject')) return {readLivePortfolio:()=>null,livePortfolioDismissed:()=>false};
    if (name.endsWith('/AuthContext')) return {useAuth:()=>({viewerProfileId:'viewer',isAuthenticated:options.isAuthenticated ?? options.viewerRole !== 'guest'})};
    if (name.endsWith('/useJourneySelection')) return { useJourneySelection: () => journey };
    if (name.endsWith('/employer')) return employer;
    if (name.endsWith('/journey')) return journeyHelpers;
    if (name.endsWith('/useProfileVisibility')) return { useProfileVisibility: () => ({ isPrivate: false }) };
    if (name.endsWith('/useFollowRequests')) return { useFollowRequests: () => ({ count: 0, requests: [] }) };
    if (name.endsWith('/useProfileConnections')) return { useProfileConnections: () => ({ items: [{ profileId: 'person', name: 'Person Name', avatar: '' }], counts: {}, loading: false, error: null, nextOffset: null }) };
    if (name.endsWith('/MobileContextActions')) return { MobileContextButton: 'MobileContextButton', useMobileScreenActions(model) { mobileActions = model; }, useMobileContextPress: model => { mobilePressModel = model; return {}; } };
    if (name.endsWith('/contextActions')) return contextActions;
    if (name.endsWith('/useProjectManagement')) return { useProjectManagement: () => ({ editor: { projectId: options.editorProjectId ?? null } }) };
    if (name.endsWith('/useProfileProjectOrder')) return { useProfileProjectOrder: () => projectOrder };
    if (name.endsWith('/useProjectGridDensity')) return { useProjectGridDensity: () => density };
    if (name.endsWith('/projectGridDensity')) return gridDensity;
    if (name.endsWith('/profileLinks')) return { ...linkHelpers, resolveProfileLinks: () => linkHelpers.resolveProfileLinks(options.links ?? [], {}) };
    if (name.endsWith('/types/engagement')) return engagementTypes;
    return placeholder;
  }, { URL, URLSearchParams, Error, requestAnimationFrame: fn => { fn(); return 1; }, cancelAnimationFrame() {}, window: options.window ? Object.assign(options.window, { location: { origin: 'https://portalink.test' } }) : { location: { origin: 'https://portalink.test' }, scrollTo() {}, addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null } }, document: options.document, Element: options.Element });
  const profile = { id: 'owner', name: 'Owner', projects, categories: [{ id: 'photos', label: 'Photography', iconName: 'camera' }], stats: [], showJourney: options.showJourney, isPrivate: options.isPrivate ?? false };
  return { navigation, projectOrder, density, surfaceOwner, profile, isMobile: options.presentation === 'mobile', isOwner: (options.viewerRole ?? 'owner') === 'owner' && !options.isSharedView, get mobileActions() { return mobileActions; }, get mobilePressModel() { return mobilePressModel; }, action: id => [...(mobileActions?.primary ?? []), ...(mobileActions?.groups.flat() ?? [])].find(action => action.id === id), flushEffects: () => { while (pendingEffects.length) pendingEffects.shift()(); }, outside: () => outside, search: () => params.toString(), render: (updates = {}) => {
    cursor = 0;
    return UserProfilePage({ profile, viewerRole: options.viewerRole ?? 'owner', isSharedView: options.isSharedView, onBack() {}, onOpenProject() {}, ...options.props, ...updates });
  } };
}

test('mobile header keeps its Journey choice while hiding counts and links until Portfolio returns', () => {
  const h = profileHarness('', { presentation: 'mobile' });
  const toggle = tree => nodes(tree).find(node => node.type === 'JourneyToggle');
  let tree = h.render();
  assert.equal(toggle(tree).props.view, 'portfolio');
  assert.equal(nodes(tree).some(node => node.type?.name === 'ProfileStats'), true);
  const identity = nodes(tree).find(node => node.type?.name === 'ProfileIdentityAndLinks');
  assert.equal(identity.props.profileView.type, 'JourneyToggle');
  assert.equal(identity.props.profileView.props, toggle(tree).props);
  assert.equal(nodes(tree).filter(node => node.type === 'JourneyToggle').length, 1);
  toggle(tree).props.onChange('journey');
  tree = h.render();
  assert.equal(toggle(tree).props.view, 'journey');
  assert.equal(nodes(tree).some(node => node.type?.name === 'ProfileStats'), false);
  assert.equal(nodes(tree).some(node => node.props?.['data-mobile-profile-links'] !== undefined), false);
  assert.equal(nodes(tree).find(node => node.props?.id === 'profile-content').props.children.type, React.Suspense);
  openProfileOptions(h);
  tree = h.render();
  assert.equal(toggle(tree).props.view, 'journey');
  assert.equal(nodes(tree).filter(node => node.type === 'JourneyToggle').length, 1);
  const all = nodes(tree);
  assert.equal(all.some(node => node.type?.name === 'ProfileStats'), false);
  assert.equal(all.some(node => node.props?.['data-mobile-profile-links'] !== undefined), false);
  const tools = all.find(node => node.props?.id === 'profile-navigation-tools');
  assert.equal(nodes(tools).some(node => node.type === 'JourneyToggle'), false);
  assert.equal(nodes(tree).find(node => node.props?.id === 'profile-content').props.children.type, React.Suspense);
  toggle(tree).props.onChange('portfolio');
  tree = h.render();
  assert.equal(toggle(tree).props.view, 'portfolio');
  assert.equal(nodes(tree).find(node => node.props?.className === 'profile-compact-header').props['data-expanded'], true);
  const restored = nodes(tree);
  const stats = restored.find(node => node.type?.name === 'ProfileStats');
  assert.equal(nodes(stats.type(stats.props)).filter(node => node.props?.className === 'profile-count-control').length, 4);
  assert.equal(restored.some(node => node.props?.['data-mobile-profile-links'] !== undefined), true);
  assert.ok(restored.indexOf(stats) < restored.indexOf(restored.find(node => node.props?.id === 'profile-navigation-tools')));
  openProfileOptions(h);
  assert.equal(toggle(h.render()).props.view, 'portfolio');
});

test('profile Journey controls retain owner/public permissions, editor guard and WEB header placement', () => {
  for (const [viewerRole, showJourney, allowed] of [['owner', false, true], ['member', true, true], ['member', false, false], ['guest', false, false]]) {
    const h = profileHarness('', { presentation: 'mobile', viewerRole, showJourney });
    assert.equal(nodes(h.render()).some(node => node.type === 'JourneyToggle'), allowed);
    openProfileOptions(h);
    assert.equal(nodes(h.render()).some(node => node.type === 'JourneyToggle'), allowed);
  }
  const privateShare = profileHarness('', { presentation: 'mobile', viewerRole: 'owner', isSharedView: true, showJourney: false });
  assert.equal(nodes(privateShare.render()).some(node => node.type === 'JourneyToggle'), false);
  const editing = profileHarness('', { presentation: 'mobile', editorProjectId: 'work' });
  assert.equal(nodes(editing.render()).find(node => node.type === 'JourneyToggle').props.disabled, true);
  const web = profileHarness('', { presentation: 'web' });
  for (const expanded of [false, true]) {
    if (expanded) openProfileOptions(web);
    const tree = web.render();
    const toggle = nodes(tree).find(node => node.type === 'JourneyToggle');
    assert.equal(nodes(tree).filter(node => node.type === 'JourneyToggle').length, 1);
    const identity = nodes(tree).find(node => node.type?.name === 'ProfileIdentityAndLinks');
    assert.equal(identity.props.profileView.props, toggle.props);
    assert.ok(nodes(tree).find(node => node.type === 'EmployerOverview'));
    const tools = nodes(tree).find(node => node.props?.id === 'profile-navigation-tools');
    assert.equal(nodes(tools).some(node => node.type === 'JourneyToggle'), false);
  }
});

test('WEB header exposes all four count destinations before opening Profile options', () => {
  const h = profileHarness('keep=value', { presentation: 'web', projects: reorderProjects });
  let tree = h.render();
  assert.equal(nodes(tree).find(node => node.props?.['aria-label'] === 'Profile options').props['aria-expanded'], false);
  assert.ok(nodes(tree).find(node => node.type === 'PlatformGrid'), 'Owner Bio and social links remain available before opening the action sheet');
  assert.equal(nodes(tree).some(node => node.props?.['data-profile-owner-actions'] !== undefined), false);
  for (const view of ['portals', 'followers', 'following', 'projects']) {
    const stats = nodes(tree).find(node => node.type?.name === 'ProfileStats');
    assert.equal(stats.props.expanded, true);
    const controls = nodes(stats.type(stats.props)).filter(node => node.props?.className === 'profile-count-control');
    assert.equal(controls.length, 4);
    assert.deepEqual(controls.map(node => node.type), ['button', 'button', 'button', 'button']);
    controls[['projects', 'portals', 'followers', 'following'].indexOf(view)].props.onClick();
    tree = h.render();
    assert.equal(new URLSearchParams(h.search()).get('keep'), 'value');
    assert.equal(new URLSearchParams(h.search()).get('view'), view === 'projects' ? null : view);
    assert.equal(h.navigation.at(-1).replace, true);
    assert.equal(nodes(tree).find(node => node.type?.name === 'ProfileStats').props.activeView, view);
    if (view !== 'projects') assert.equal(profileContent(tree).props.children.props.kind, view);
    else assert.ok(wall(tree));
  }
  for (const viewerRole of ['visitor', 'guest']) {
    const stats = nodes(profileHarness('', { presentation: 'web', viewerRole }).render()).find(node => node.type?.name === 'ProfileStats');
    const controls = nodes(stats.type(stats.props)).filter(node => node.props?.className === 'profile-count-control');
    assert.deepEqual(controls.map(node => node.type), ['button', 'button', 'span', 'span']);
  }
});

test('WEB header Timeline selection and Projects count return use the same catalogue state', () => {
  const h = profileHarness('keep=value', { presentation: 'web', projects: reorderProjects });
  const toggle = () => nodes(h.render()).find(node => node.type === 'JourneyToggle');
  toggle().props.onChange('journey');
  let tree = h.render();
  assert.equal(toggle().props.view, 'journey');
  assert.equal(nodes(tree).filter(node => node.type === 'JourneyToggle').length, 1);
  assert.equal(nodes(tree).some(node => node.type?.name === 'ProfileStats'), false);
  assert.equal(profileContent(tree).props.children.type, React.Suspense);
  toggle().props.onChange('portfolio');
  tree = h.render();
  assert.equal(toggle().props.view, 'portfolio');
  assert.ok(wall(tree));
  assert.equal(new URLSearchParams(h.search()).get('keep'), 'value');

  const fromPortals = profileHarness('keep=value&view=portals', { presentation: 'web', journeyView: 'journey', projects: reorderProjects });
  const stats = nodes(fromPortals.render()).find(node => node.type?.name === 'ProfileStats');
  nodes(stats.type(stats.props)).find(node => node.type === 'button').props.onClick();
  const catalogue = fromPortals.render();
  assert.ok(wall(catalogue), 'Projects must exit the remembered Timeline as it clears the collection URL');
  assert.equal(nodes(catalogue).find(node => node.type === 'JourneyToggle').props.view, 'portfolio');
  assert.equal(new URLSearchParams(fromPortals.search()).has('view'), false);
  assert.equal(new URLSearchParams(fromPortals.search()).get('keep'), 'value');
  assert.equal(fromPortals.navigation.at(-1).replace, true);
});

test('count controls replace the project area, report real Portal count, and restore from the profile URL', () => {
  const h = profileHarness('keep=value');
  openProfileOptions(h);
  for (const view of ['portals', 'followers', 'following']) {
    const stats = nodes(h.render()).find((node) => node.type?.name === 'ProfileStats');
    assert.equal(stats.props.portalCount, 1);
    const buttons = nodes(stats.type(stats.props)).filter((node) => node.type === 'button');
    buttons[['projects', 'portals', 'followers', 'following'].indexOf(view)].props.onClick();
    const tree = h.render();
    const content = nodes(tree).find((node) => node.props?.id === 'profile-content');
    assert.equal(content.props.children.type, 'ProfileCollectionGrid');
    assert.equal(content.props.children.props.kind, view);
    assert.equal(nodes(tree).some((node) => node.props?.role === 'dialog'), false);
    assert.equal(new URLSearchParams(h.search()).get('keep'), 'value');
    assert.equal(h.navigation.at(-1).replace, true);
    const returned = profileHarness(h.search()).render();
    assert.equal(nodes(returned).find((node) => node.props?.id === 'profile-content').props.children.props.kind, view);
  }
  const stats = nodes(h.render()).find((node) => node.type?.name === 'ProfileStats');
  nodes(stats.type(stats.props)).find((node) => node.type === 'button').props.onClick();
  assert.equal(new URLSearchParams(h.search()).has('view'), false);
  assert.equal(nodes(h.render()).find((node) => node.props?.id === 'profile-content').props.children.type, 'EmptyState');
});

const reorderProjects = [{ id: 'a', cover: 'a.png' }, { id: 'b', cover: 'b.png' }];
const wall = tree => nodes(tree).find(node => node.type === 'JustifiedImageWall');

test('mobile portal chooser consumes outside taps across the screen and preserves inner interactions', () => {
  class Target {
    constructor(kind) { this.kind = kind; }
    closest() { return ['menu', 'dialog'].includes(this.kind) ? this : null; }
  }
  function setup(presentation = 'mobile') {
    const listeners = new Map();
    const document = {
      addEventListener(type, listener) { listeners.set(type, listener); },
      removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    };
    const h = profileHarness('view=portals', { presentation, document, Element: Target,
      props: { mobilePortalsView: React.createElement('section', { className: 'mobile-portals-page' }) } });
    const tree = h.render();
    const overlay = nodes(tree).find(node => node.props?.className === 'mobile-profile-portal-overlay');
    if (overlay) overlay.ref.current = { querySelector: () => ({ contains: target => target.kind === 'panel' }), closest: () => null };
    h.flushEffects();
    const dispatch = (type, kind, extra = {}) => {
      const event = { target: new Target(kind), detail: 1, button: 0, isPrimary: true, clientX: 0, clientY: 0,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
      listeners.get(type)?.(event);
      return event;
    };
    return { h, listeners, dispatch };
  }
  for (const target of ['header', 'dock', 'portals-count', 'backdrop']) {
    const { h, listeners, dispatch } = setup();
    dispatch('pointerdown', target);
    const click = dispatch('click', target);
    assert.equal(h.search(), '', `${target} closes the chooser`);
    assert.equal(click.prevented, true, 'Dismissal must not also activate the underlying control');
    assert.equal(click.stopped, true);
    h.render(); h.flushEffects();
    assert.equal(listeners.size, 0, 'Listeners are removed when the panel closes');
  }
  for (const target of ['panel', 'menu', 'dialog']) {
    const { h, dispatch } = setup();
    dispatch('pointerdown', target);
    assert.equal(dispatch('click', target).prevented, undefined);
    assert.equal(h.search(), 'view=portals');
  }
  for (const gesture of ['scroll', 'drag-out', 'cancel']) {
    const { h, dispatch } = setup();
    dispatch('pointerdown', gesture === 'drag-out' ? 'panel' : 'header');
    if (gesture === 'scroll') dispatch('pointermove', 'header', { clientY: 20 });
    if (gesture === 'cancel') dispatch('pointercancel', 'header');
    dispatch('click', 'header');
    assert.equal(h.search(), 'view=portals', `${gesture} is not an outside tap`);
  }
  assert.equal(setup('web').listeners.size, 0, 'WEB collections have no popup dismissal listener');
});

test('disclosed mobile portal count floats the supplied chooser above the wall and preserves profile history', () => {
  const mobilePortalsView = React.createElement('section', { 'aria-label': 'Portal list' });
  for (const viewerRole of ['owner', 'visitor', 'guest']) {
    for (const reopen of [false, true]) {
      const h = profileHarness('keep=value', { presentation: 'mobile', viewerRole, projects: reorderProjects, props: { mobilePortalsView } });
      let tree = h.render();
      assert.equal(nodes(tree).some(node => node.type?.name === 'ProfileStats'), true);
      openProfileOptions(h);
      if (reopen) {
        openProfileOptions(h);
        openProfileOptions(h);
      }
      tree = h.render();
      const stats = nodes(tree).find(node => node.type?.name === 'ProfileStats');
      nodes(stats.type(stats.props)).filter(node => node.type === 'button')[1].props.onClick();
      const portalTree = h.render();
      const portalSurface = nodes(portalTree).find(node => node.type === 'DeferredSurface');
      assert.equal(portalSurface?.props.children, mobilePortalsView, 'The lazy chooser has its own loading/error boundary');
      assert.equal(portalSurface.props.active, true);
      assert.equal(portalSurface.props.resetKey, 'owner');
      assert.ok(nodes(portalTree).some(node => node.props === mobilePortalsView.props));
      assert.ok(wall(portalTree), 'Opening Portals must leave the artwork mounted underneath');
      const underlay = nodes(portalTree).find(node => node.props?.className === 'mobile-profile-wall scrollbar-overlay');
      assert.equal(underlay.props['aria-hidden'], true);
      const element = {};
      underlay.ref(element);
      assert.equal(element.inert, true, 'Underlying cards must not receive taps or focus');
      assert.ok(nodes(portalTree).some(node => node.props?.className === 'profile-compact-header'));
      assert.equal(new URLSearchParams(h.search()).get('view'), 'portals');
      assert.equal(new URLSearchParams(h.search()).get('keep'), 'value');
      assert.equal(h.navigation.at(-1).replace, false);
      const restored = profileHarness(h.search(), { presentation: 'mobile', viewerRole, props: { mobilePortalsView } }).render();
      assert.ok(nodes(restored).some(node => node.props === mobilePortalsView.props));
      portalSurface.props.onClose();
      const closed = h.render();
      assert.equal(nodes(closed).some(node => node.props === mobilePortalsView.props), false);
      const restoredWall = nodes(closed).find(node => node.props?.className === underlay.props.className);
      assert.equal(restoredWall.type, underlay.type);
      restoredWall.ref(element);
      assert.equal(element.inert, false);
      assert.equal(restoredWall.props['aria-hidden'], undefined);
      assert.ok(wall(closed));
    }
  }
  const web = profileHarness('view=portals', { presentation: 'web', props: { mobilePortalsView } }).render();
  assert.equal(nodes(web).find(node => node.props?.id === 'profile-content').props.children.type, 'ProfileCollectionGrid');
  assert.equal(nodes(web).includes(mobilePortalsView), false);
});

test('the account Portals destination uses the same overlay while WEB keeps its page', () => {
  const mobileContent = React.createElement('section', { 'aria-label': 'Account portals' });
  const selected = [];
  const props = { mobileContent, mobileContentView: 'portals', onMobileViewChange: view => selected.push(view) };
  const mobile = profileHarness('', { presentation: 'mobile', projects: reorderProjects, props }).render();
  assert.ok(wall(mobile));
  assert.ok(nodes(mobile).some(node => node.props === mobileContent.props));
  nodes(mobile).find(node => node.props?.['aria-label'] === 'Close portals').props.onClick();
  assert.deepEqual(selected, ['projects']);
  const web = profileHarness('', { presentation: 'web', projects: reorderProjects, props }).render();
  assert.equal(wall(web), undefined);
  assert.equal(workspaceViewer(web), mobileContent);
});

test('mobile wall restores and records document scroll through a project and on remount', () => {
  let savedTop = 0;
  const listeners = new Map();
  const window = { scrollY: 0, localStorage: { getItem: () => null },
    scrollTo({top}) { this.scrollY = top; },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const props = { mobileWallScrollMemory: { read: () => savedTop, save: top => { savedTop = top; } } };
  const options = { presentation: 'mobile', projects: reorderProjects, props, window, document: {} };
  const h = profileHarness('', options);
  const show = (fixture, updates) => {
    const tree = fixture.render(updates);
    tree.ref.current = { closest: () => null };
    fixture.flushEffects();
  };
  show(h);
  window.scrollY = 408; listeners.get('scroll')();
  assert.equal(savedTop, 408);
  show(h, { mobileContent: React.createElement('project') });
  assert.equal(listeners.has('scroll'), false);
  window.scrollY = 0;
  show(h);
  assert.equal(window.scrollY, 408);
  window.scrollY = 0;
  const remounted = profileHarness('', options); show(remounted);
  assert.equal(window.scrollY, 408);
});

test('mobile project lists retain profile identity and tools, and count controls navigate between collections', () => {
  for (const viewerRole of ['owner', 'visitor', 'guest']) {
    const selectedViews = [];
    const mobileContent = React.createElement('section', { 'aria-label': 'Project viewer' });
    const h = profileHarness('', { presentation: 'mobile', viewerRole, projects: reorderProjects,
      props: { mobileContent, onMobileViewChange: view => selectedViews.push(view), onEditProfile() {} } });
    let tree = h.render();
    assert.equal(tree.props['data-profile-nested'], '');
    assert.equal(workspaceViewer(tree), mobileContent);
    assert.equal(wall(tree), undefined);
    const identity = nodes(tree).find(node => node.type?.name === 'ProfileIdentityAndLinks');
    assert.equal(identity.props.profile.id, 'owner');
    identity.props.summaryCounts.onSelect('portals');
    assert.deepEqual(selectedViews, ['portals']);
    assert.equal(h.navigation.length, 0, 'Nested count must not edit the project URL query');
    openProfileOptions(h);
    tree = h.render();
    const stats = nodes(tree).find(node => node.type?.name === 'ProfileStats');
    for (const view of ['projects', 'followers', 'following']) stats.props.onSelect(view);
    assert.deepEqual(selectedViews, ['portals', 'projects', 'followers', 'following']);
    assert.equal(nodes(tree).some(node => node.props?.['aria-label'] === 'Edit profile'), false);
    assert.equal(Boolean(h.action('editProfile')), viewerRole === 'owner');
    if (viewerRole === 'owner') {
      assert.equal(nodes(tree).some(node => node.props?.['aria-label'] === 'Manage profile'), false);
      assert.equal(nodes(tree).some(node => node.props?.['aria-label'] === 'Cards per row'), false);
      assert.equal(h.action('reorder'), undefined);
    }
  }
});

test('selected mobile projects hide the profile header and restore it on return without moving the viewer', () => {
  for (const viewerRole of ['owner', 'visitor', 'guest']) {
    for (const isSharedView of [false, true]) {
      const child = React.createElement('section', { 'aria-label': 'Project viewer' });
      const h = profileHarness('', { presentation: 'mobile', viewerRole, props: { isSharedView } });
      for (const mobileProjectSelected of [false, true, false]) {
        const tree = h.render({ mobileContent: child, mobileProjectSelected });
        const children = React.Children.toArray(tree.props.children).filter(node => node.type !== 'ScreenBack');
        assert.equal(children[0].props.className, mobileProjectSelected ? 'hidden' : 'profile-header-region contents');
        assert.equal(children[1].props.id, 'profile-content');
        assert.equal(workspaceViewer(tree), child);
        assert.equal(children[1].props['data-mobile-project-selected'], mobileProjectSelected ? '' : undefined);
      }
      const overview = h.render();
      assert.equal(React.Children.toArray(overview.props.children).filter(node => node.type !== 'ScreenBack')[0].props.className, 'profile-header-region contents');
      assert.equal(nodes(overview).find(node => node.props?.id === 'profile-content').props['data-mobile-project-selected'], undefined);
    }
  }
});

test('opening mobile project navigation restores the same profile identity without relocating content', () => {
  const child = React.createElement('section', { 'aria-label': 'Project viewer' });
  for (const presentation of ['mobile', 'web']) {
    const h = profileHarness('', { presentation });
    for (const mobileProjectIndexOpen of [false, true, false]) {
      const tree = h.render({ mobileContent: child, mobileProjectSelected: true, mobileProjectIndexOpen });
      const header = nodes(tree).find(node => node.props?.['data-profile-header'] !== undefined);
      const visible = presentation === 'mobile' && mobileProjectIndexOpen;
      assert.equal(header.props.className, visible ? 'profile-header-region contents' : 'hidden');
      assert.equal(header.props['data-mobile-project-header-preview'], visible ? '' : undefined);
      assert.equal(workspaceViewer(tree), child);
    }
  }
});

test('mobile view switches keep the same expanded profile tools and use one navigation callback', () => {
  const selected = [];
  const h = profileHarness('', { presentation: 'mobile', props: { onMobileViewChange: view => selected.push(view) } });
  let tree = h.render();
  openProfileOptions(h);
  for (const mobileContent of [undefined, React.createElement('portals'), React.createElement('project'), undefined]) {
    tree = h.render({ mobileContent });
    assert.equal(nodes(tree).find(node => node.props?.className === 'profile-compact-header').props['data-expanded'], true);
    const stats = nodes(tree).find(node => node.type?.name === 'ProfileStats');
    stats.props.onSelect('portals');
    stats.props.onSelect('projects');
  }
  assert.deepEqual(selected, ['portals', 'projects', 'portals', 'projects', 'portals', 'projects', 'portals', 'projects']);
  assert.equal(h.navigation.length, 0);
});

test('mobile profile count navigation always targets the viewed profile', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const body = source.match(/onMobileViewChange=\{\(view\) => \{([\s\S]*?)\}\} viewerRole/)[1];
  for (const isSharedRoute of [false, true]) {
    const destinations = [];
    const navigate = vm.runInNewContext(`view => {${body}}`, {
      isSharedRoute, viewedProfile: { id: 'viewed-creator' }, buildPath: routes.buildPath, pathname: '/start', search: '', URLSearchParams, screenLocation: { hash: '' },
      nav: { to: path => destinations.push(path) },
    });
    for (const view of ['portals', 'projects', 'followers', 'following']) navigate(view);
    const base = `${isSharedRoute ? '/share' : '/p'}/viewed-creator`;
    assert.deepEqual(destinations, [`${base}?view=portals`, base, `${base}?view=followers`, `${base}?view=following`]);
    const noChange = vm.runInNewContext(`view => {${body}}`, {
      isSharedRoute, viewedProfile: { id: 'viewed-creator' }, buildPath: routes.buildPath, pathname: base, search: '?view=portals', URLSearchParams, screenLocation: { hash: '' },
      nav: { to: () => assert.fail('An active count must not add duplicate history entries') },
    });
    noChange('portals');
  }
});

test('MOBILE count navigation retains the profile URL and closes Portals through its paired history return', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const body = source.match(/onMobileViewChange=\{\(view\) => \{([\s\S]*?)\}\} viewerRole/)[1];
  for (const isSharedRoute of [false, true]) {
    const path = `${isSharedRoute ? '/share' : '/p'}/viewed-creator`;
    const calls = [];
    const context = {
      isSharedRoute, viewedProfile: { id: 'viewed-creator' }, buildPath: routes.buildPath, URLSearchParams,
      pathname: path, search: '?fromSearch=%2Fsearch%3Fq%3Ddesign&keep=value', screenLocation: { hash: '#catalogue' },
      nav: { to: (...args) => calls.push(['to', ...args]) }, returnFromPortalCollection: () => calls.push(['close']),
    };
    const select = vm.runInNewContext(`view => {${body}}`, context);
    select('portals');
    assert.deepEqual(calls.splice(0), [['to', `${path}?fromSearch=%2Fsearch%3Fq%3Ddesign&keep=value&view=portals#catalogue`]]);
    context.search += '&view=portals';
    select('projects');
    assert.deepEqual(calls.splice(0), [['close']], 'Outside tap and Close must not push another profile entry');
    select('portals');
    assert.deepEqual(calls, [], 'The selected count leaves native history unchanged');
  }
});

test('workspace keeps one child position and only MOBILE displays the profile frame', () => {
  let indexOpen = false;
  const { MobileProfileWorkspace } = compile('../src/presentation/mobile/MobileProfileWorkspace.tsx', name => {
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({ onTriggerKeyDown() {} }) };
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => 'mobile' };
    if (name === 'react') return { ...React, useState: () => [indexOpen, value => { indexOpen = value; }] };
    return {};
  });
  const overview = React.createElement('profile', { profile: { id: 'viewed-creator' } });
  const child = React.createElement('project');
  const result = MobileProfileWorkspace({ overview, children: child, projectSelected: true });
  assert.equal(result.props.profile.id, 'viewed-creator');
  assert.equal(result.props.mobileContent.type, child.type);
  assert.equal(result.props.mobileContent.key, child.key);
  assert.equal(result.props.mobileProjectIndexOpen, false);
  result.props.mobileContent.props.onMobileIndexOpenChange(true);
  const opened = MobileProfileWorkspace({ overview, children: child, projectSelected: true });
  assert.equal(opened.props.mobileProjectIndexOpen, true);
  assert.equal(opened.props.mobileContent.type, child.type);
  opened.props.mobileContent.props.onMobileIndexOpenChange(false);
  assert.equal(MobileProfileWorkspace({ overview, children: child, projectSelected: true }).props.mobileProjectIndexOpen, false);
  assert.equal(result.props.mobileContentView, 'projects');
  assert.equal(result.props.mobileProjectSelected, true);
  const portals = MobileProfileWorkspace({ overview, children: React.createElement('portals'), view: 'portals' });
  assert.equal(portals.props.mobileContentView, 'portals');
  assert.equal(portals.props.mobileProjectSelected, false);
  const overviewResult = MobileProfileWorkspace({ overview });
  assert.equal(overviewResult.type, result.type);
  assert.equal(overviewResult.key, result.key);
  assert.equal(overviewResult.props.mobileContent, undefined);
  assert.equal(overviewResult.props.mobileProjectSelected, false);
  const web = profileHarness('', { presentation: 'web', props: { mobileContent: child, mobileProjectSelected: true } }).render();
  const mobile = profileHarness('', { presentation: 'mobile', props: { mobileContent: child } }).render();
  assert.equal(web.props.className, 'contents');
  assert.equal(web.props['data-profile-page'], undefined);
  assert.equal(nodes(web).find(node => node.props?.id === 'profile-content').props['data-mobile-project-selected'], undefined);
  assert.equal(nodes(web).find(node => node.props?.['data-profile-header'] !== undefined).props.className, 'hidden');
  for (const tree of [web, mobile]) {
    assert.equal(workspaceViewer(tree), child);
    assert.equal(React.Children.toArray(tree.props.children).filter(React.isValidElement).findIndex(node => node.props.id === 'profile-content'), 1);
  }
  assert.equal(nodes(web).find(node => node.props?.id === 'profile-content').props.className, 'contents');
});

test('retained workspace keeps the same viewer React slot across MOBILE/WEB and project-index changes', () => {
  const child = React.createElement('section', { key: 'reader-memory', 'aria-label': 'Retained project viewer' });
  const options = { presentation: 'mobile', projects: reorderProjects };
  const h = profileHarness('', options);
  let parentType;
  for (const [presentation, mobileProjectIndexOpen] of [['mobile', false], ['mobile', true], ['web', true], ['web', false], ['mobile', false]]) {
    options.presentation = presentation;
    const tree = h.render({ mobileContent: child, mobileProjectSelected: true, mobileProjectIndexOpen });
    const content = profileContent(tree), composition = content.props.children;
    assert.equal(composition.type, React.Fragment, 'The transparent parent is stable across presentation changes.');
    parentType ??= composition.type;
    assert.equal(composition.type, parentType);
    assert.equal(composition.props.children.length, 3);
    const viewer = composition.props.children[2];
    assert.equal(viewer, child, 'The real viewer stays in raw slot2 rather than being relocated by hidden-wall changes.');
    assert.equal(viewer.type, child.type); assert.equal(viewer.key, child.key);
    const visibleChildren = nodes(content).filter(node => node !== content && node.type !== React.Fragment);
    assert.equal(visibleChildren.length, 1); assert.equal(visibleChildren[0].props, child.props, 'Only the supplied viewer emits visible content.');
    const retainedWall = nodes(content, true).find(node => node.props?.className === 'mobile-profile-wall scrollbar-overlay');
    if (presentation === 'mobile') {
      assert.ok(retainedWall); assert.equal(retainedWall.props.hidden, true); assert.equal(retainedWall.props.style.display, 'none');
      const element = {}; retainedWall.ref(element); assert.equal(element.inert, true);
      assert.equal(nodes(retainedWall, true).filter(node => node.type === 'JustifiedImageWall').length, 1, 'Artwork stays mounted in one hidden wall.');
    } else {
      assert.equal(retainedWall, undefined, 'The stable Fragment adds no extra WEB DOM.');
      assert.equal(composition.props.children[0], false);
    }
    assert.equal(wall(tree), undefined, 'The visible-wall helper must exclude retained hidden artwork.');
  }
});

test('retained MOBILE profile cards release their popup owner while the project or another screen is active', () => {
  const options = { presentation: 'mobile', screenActive: true, projects: reorderProjects };
  const h = profileHarness('', options);
  const assertCards = (tree, active) => {
    const retainedWall = nodes(tree, true).find(node => node.type === 'JustifiedImageWall');
    assert.ok(retainedWall);
    const tiles = retainedWall.props.items.flatMap(item => nodes(item.content, true)).filter(node => node.type?.name === 'ProfileProjectTile');
    assert.equal(tiles.length, reorderProjects.length);
    for (const tile of tiles) {
      assert.equal(tile.props.active, active);
      const preview = tile.type(tile.props);
      assert.equal(preview.type, 'ProjectPreviewCard'); assert.equal(preview.props.active, active, 'The retained tile forwards active ownership to its popup-capable card.');
    }
  };
  assertCards(h.render(), true);
  assertCards(h.render({ mobileContent: React.createElement('project'), mobileProjectSelected: true }), false);
  options.screenActive = false; assertCards(h.render(), false);
  options.screenActive = true; assertCards(h.render(), true);
  options.presentation = 'web'; options.screenActive = false; assertCards(h.render(), true);
});

test('mobile profile keeps links and visitor controls visible without duplicate owner actions', () => {
  const links = [{ label: 'Website', href: 'https://example.com', iconName: 'globe' }];
  for (const viewerRole of ['owner', 'visitor', 'guest']) {
    const h = profileHarness('', {presentation:'mobile',viewerRole,links});
    const tree = openProfileOptions(h);
    const grid = nodes(tree).find(node => node.type === 'PlatformGrid');
    assert.equal(nodes(tree).some(node => node.type === 'MobileContextButton'), false);
    assert.deepEqual(Array.from(grid.props.links.filter(link => link.action), link => link.action), viewerRole === 'owner' ? ['bio','collaboration'] : ['bio','collaboration','message']);
    assert.deepEqual(JSON.parse(JSON.stringify(grid.props.links.filter(link => !link.action))), links);
    assert.equal(nodes(tree).some(node => node.props?.['data-profile-owner-actions'] !== undefined), false);
    assert.equal(nodes(tree).some(node => node.props?.['data-profile-visitor-actions'] !== undefined), viewerRole !== 'owner');
  }
});

test('mobile other-creator profiles omit options and hold actions while preserving direct follow, bookmark, Bio and contact controls', () => {
  for (const viewerRole of ['visitor', 'guest']) {
    const calls = [];
    const follow = { isFollowing: false, isRequested: false, isResolving: false, isPending: false, resolveError: null, mutationError: null, onToggle: () => calls.push('follow') };
    const h = profileHarness('', { presentation: 'mobile', viewerRole, props: {
      follow, onBack: () => calls.push('back'), onSignInRequest: () => calls.push('sign-in'), onCollaboration: () => calls.push('collaboration'), onMessage: () => calls.push('message'),
    } });
    let tree = h.render();
    assert.equal(h.mobileActions, null); assert.equal(h.mobilePressModel, null);
    assert.equal(nodes(tree).some(node => node.type === 'MobileContextButton' || node.props?.['aria-label'] === 'Profile options'), false);
    const followControl = nodes(tree).find(node => viewerRole === 'visitor' ? node.props?.['data-profile-follow'] !== undefined : node.props?.children === 'Sign in to follow');
    assert.ok(followControl); followControl.props.onClick();
    const bookmark = nodes(tree).find(node => node.type === 'CreatorSaveButton');
    assert.ok(bookmark); assert.equal(bookmark.props.profileId, 'owner');
    assert.equal(bookmark.props.registerScreenActions, false, 'Direct bookmark access cannot register a replacement mobile sheet');
    const grid = nodes(tree).find(node => node.type === 'PlatformGrid');
    grid.props.onCollaboration(); grid.props.onMessage(); grid.props.onOpenBio();
    tree = h.render();
    const bio = nodes(tree).find(node => node.type === 'ProfileBioSheet');
    assert.ok(bio); assert.equal(bio.props.canEdit, false); bio.props.onClose();
    assert.equal(nodes(h.render()).some(node => node.type === 'ProfileBioSheet'), false);
    const back = nodes(tree).find(node => node.props?.['aria-label'] === 'Back to previous screen');
    assert.ok(back); assert.ok(nodes(tree).some(node => node.type === 'ScreenBack' && node.props.action === back.props.onClick)); back.props.onClick();
    assert.deepEqual(calls, [viewerRole === 'visitor' ? 'follow' : 'sign-in', 'collaboration', 'message', 'back']);
  }
  const web = profileHarness('', { presentation: 'web', viewerRole: 'visitor' });
  const button = nodes(web.render()).find(node => node.props?.['aria-label'] === 'Profile options');
  assert.ok(button); assert.equal(button.props['aria-expanded'], false); button.props.onClick();
  const webTree = web.render();
  assert.equal(nodes(webTree).find(node => node.props?.['aria-label'] === 'Profile options').props['aria-expanded'], true);
  assert.ok(web.mobileActions); assert.equal(web.mobilePressModel, web.mobileActions);
  assert.notEqual(nodes(webTree).find(node => node.type === 'CreatorSaveButton').props.registerScreenActions, false);
});

test('WEB visitor/shared profiles retain disclosure while MOBILE shared links are immediately available with correct privacy context', () => {
  const links = [{ label:'Website',href:'https://example.com',iconName:'globe' }];
  for (const options of [{presentation:'web',viewerRole:'visitor'}, {presentation:'mobile',isSharedView:true}, {presentation:'web',isSharedView:true}]) {
    const h = profileHarness('', {...options,links});
    assert.equal(nodes(h.render()).some(node => node.type === 'PlatformGrid'), options.presentation === 'mobile');
    const tree = openProfileOptions(h), grid = nodes(tree).find(node => node.type === 'PlatformGrid');
    assert.equal(grid.props.isSharedView, options.isSharedView ?? false);
    assert.deepEqual(Array.from(grid.props.links.slice(0,3),link=>link.action), ['bio','collaboration','message']);
    assert.equal(grid.props.links[3].href,links[0].href);
    if (options.isSharedView) assert.equal(nodes(tree).some(node=>node.props?.['data-profile-owner-actions']!==undefined),false);
  }
});

const reorderControl = tree => nodes(tree).find(node => node.props?.['data-profile-reorder-start'] !== undefined);
const profileActionSheet = tree => nodes(tree).find(node => node.type === 'MobileActionSheet');
const modelAction = (model, id) => [...model.primary, ...model.groups.flat()].find(action => action.id === id);
function chooseWebProfileAction(h, id) {
  const sheet = profileActionSheet(openProfileOptions(h));
  assert.ok(sheet, 'WEB owner options use the shared action sheet');
  const action = modelAction(sheet.props.model, id);
  assert.ok(action, `The existing profile model offers ${id}`);
  sheet.props.onAction(action);
  return h.render();
}
function openProfileOptions(h) {
  const tree = h.render();
  const toggle = nodes(tree).find(node => node.props?.['aria-label'] === 'Profile options');
  if (toggle) toggle.props.onClick();
  else {
    assert.equal(h.isMobile, true, 'WEB retains its existing Profile options disclosure');
    if (h.isOwner) assert.ok(h.action('settings'), 'MOBILE owner delegates to the standard floating Actions button');
    else assert.equal(h.mobileActions, null, 'MOBILE other-creator profiles use their direct controls without a context sheet');
  }
  return h.render();
}

test('mobile owner reorder is available through the action popup with no passive hold activation', () => {
  const owner = profileHarness('', { presentation: 'mobile', projects: reorderProjects });
  assert.equal(wall(owner.render()).props.reorderMode, undefined);
  assert.equal(reorderControl(owner.render()), undefined);
  assert.equal(reorderControl(openProfileOptions(owner)), undefined);
  const control = owner.action('reorder');
  assert.ok(control);
  assert.equal(wall(owner.render()).props.reorderMode, undefined, 'Opening options alone must not start a drag');
  control.run();
  const editing = owner.render();
  assert.equal(wall(editing).props.reorderMode.enabled, true);
  assert.equal(wall(editing).props.reorderMode.onStart, undefined);
  assert.equal(nodes(editing).some(node => node.props?.id === 'profile-navigation-tools'), true);
  assert.ok(nodes(editing).some(node => node.type === 'button' && node.props.children === 'Done'));
  const cancel = nodes(editing).find(node => node.type === 'button' && node.props.children === 'Cancel');
  cancel.props.onClick();
  assert.equal(wall(owner.render()).props.reorderMode, undefined);
  for (const options of [{ viewerRole: 'visitor' }, { viewerRole: 'guest' }, { props: { mobileContent: React.createElement('project') } }]) {
    const h = profileHarness('', { presentation: 'mobile', projects: reorderProjects, ...options });
    assert.equal(reorderControl(openProfileOptions(h)), undefined);
    assert.equal(h.action('reorder'), undefined);
    assert.equal(wall(h.render())?.props.reorderMode, undefined);
    assert.equal(h.outside().enabled, false);
  }
  for (const view of ['portals', 'followers', 'following']) {
    const h = profileHarness(`view=${view}`, { presentation: 'mobile', projects: reorderProjects });
    assert.equal(reorderControl(openProfileOptions(h)), undefined);
    assert.equal(h.action('reorder'), undefined);
    assert.equal(wall(h.render())?.props.reorderMode, undefined);
  }
  const shared = profileHarness('', { presentation: 'mobile', projects: reorderProjects, isSharedView: true }).render();
  assert.equal(reorderControl(shared), undefined);
  assert.equal(wall(shared).props.reorderMode, undefined);
  for (const options of [{ editorProjectId: 'a' }, { projects: reorderProjects.slice(0, 1) }, { projectOrder: { isSaving: true } }]) {
    const h = profileHarness('', { presentation: 'mobile', projects: reorderProjects, ...options });
    assert.equal(reorderControl(openProfileOptions(h)), undefined);
    assert.equal(h.action('reorder'), undefined);
    assert.equal(wall(h.render()).props.reorderMode, undefined);
  }
  const web = profileHarness('', { presentation: 'web', projects: reorderProjects });
  assert.equal(reorderControl(web.render()), undefined);
  chooseWebProfileAction(web, 'reorder');
  assert.equal(wall(web.render()).props.reorderMode.enabled, true);
});

test('profile copy normalizes a supplied preview-host URL without losing public path or state', async () => {
  for (const presentation of ['mobile', 'web']) {
    const copies = [];
    const h = profileHarness('', { presentation, onCopy: value => copies.push(value), props: {
      shareUrl: 'https://old-preview.test/share/owner?view=portals&via=friend#portfolio',
    } });
    h.render();
    await h.action('copy').run();
    assert.deepEqual(copies, ['https://portalinknetworks.com/share/owner?view=portals&via=friend#portfolio']);
  }
});

test('mobile owner header keeps Bio and links while Edit and Share work through the action popup', () => {
  const calls = [];
  const h = profileHarness('', { presentation: 'mobile', projects: reorderProjects, props: {
    onEditProfile: () => calls.push('edit'), onCollaboration: () => calls.push('collaboration'),
    onOpenActivity: () => calls.push('activity'), onAddCategory: () => calls.push('add'),
    shareUrl: 'https://example.com/share/owner', onBeforeShare: async () => calls.push('prepare-share'),
  } });
  let tree = openProfileOptions(h);
  const row = nodes(tree).find(node => node.props?.['data-profile-owner-actions'] !== undefined);
  assert.equal(row, undefined);
  assert.equal(nodes(tree).some(node => node.type === 'ProfileShareMenu'), false);
  assert.equal(h.action('share').label, 'Share link');

  assert.equal(nodes(tree).some(node => node.props?.['aria-label'] === 'Profile engagement collections'), false);
  assert.equal(nodes(tree).some(node => node.props?.['aria-label'] === 'Manage profile'), false);
  nodes(tree).find(node=>node.type==='PlatformGrid').props.onCollaboration(); h.action('editProfile').run();
  assert.deepEqual(calls, ['collaboration', 'edit']);
  nodes(tree).find(node => node.type === 'PlatformGrid').props.onOpenBio();
  tree = h.render();
  const bio = nodes(tree).find(node => node.type === 'ProfileBioSheet');
  assert.equal(bio.props.canEdit, true);
  assert.equal(bio.props.profileId, 'owner');
  assert.equal(bio.props.onEditContent, undefined, 'Bio never navigates to Edit profile');
  assert.deepEqual(calls, ['collaboration', 'edit']);
  bio.props.onClose();
  assert.equal(nodes(h.render()).some(node => node.type === 'ProfileBioSheet'), false);
  h.action('share').run();
  assert.equal(new URLSearchParams(h.search()).get('share'), 'portfolio');
  assert.equal(nodes(h.render()).some(node => node.type === 'PlatformGrid'), false, 'Sharing owns its own mobile screen');
});

test('WEB owner options use the shared action sheet while Bio and social links stay visible', () => {
  const calls = [];
  const links = [{ label: 'Website', href: 'https://example.com', iconName: 'globe' }];
  const options = { presentation: 'web', projects: reorderProjects, links, props: { onEditProfile: () => calls.push('old edit') } };
  const h = profileHarness('', options);
  let tree = h.render();
  const toggle = () => nodes(h.render()).find(node => node.props?.['aria-label'] === 'Profile options');
  const assertLinks = current => {
    const grid = nodes(current).find(node => node.type === 'PlatformGrid');
    assert.ok(grid);
    assert.deepEqual(JSON.parse(JSON.stringify(grid.props.links.filter(link => !link.action))), links);
    assert.equal(nodes(current).some(node => node.props?.['data-profile-owner-actions'] !== undefined), false);
    assert.equal(nodes(current).some(node => node.type === 'ProfileShareMenu' || node.props?.['aria-label'] === 'Edit profile'), false);
    assert.equal(reorderControl(current), undefined);
  };
  assertLinks(tree);
  assert.equal(profileActionSheet(tree), undefined);
  assert.equal(toggle().props['aria-haspopup'], 'dialog');
  assert.equal(toggle().props['aria-expanded'], false);
  assert.equal(toggle().props['aria-controls'], undefined);
  tree = openProfileOptions(h);
  let sheet = profileActionSheet(tree);
  assert.ok(sheet); assert.equal(sheet.props.model, h.mobileActions);
  assert.equal(sheet.props.model.kind, 'profile'); assert.equal(sheet.props.model.viewer.owner, true);
  assert.equal(toggle().props['aria-expanded'], true);
  assertLinks(tree);
  const selected = modelAction(sheet.props.model, 'editProfile');
  assert.ok(selected); assert.equal(modelAction(sheet.props.model, 'share').label, 'Share link');
  assert.ok(modelAction(sheet.props.model, 'reorder'));
  options.props.onEditProfile = () => calls.push(['latest edit', Boolean(profileActionSheet(h.render()))]);
  sheet = profileActionSheet(h.render());
  sheet.props.onAction(selected);
  assert.deepEqual(calls, [['latest edit', false]], 'The current model handler runs only after the sheet has closed');
  assert.equal(toggle().props['aria-expanded'], false);
  assertLinks(h.render());
  nodes(h.render()).find(node => node.type === 'PlatformGrid').props.onOpenBio();
  const bio = nodes(h.render()).find(node => node.type === 'ProfileBioSheet');
  assert.ok(bio); assert.equal(bio.props.canEdit, true); bio.props.onClose();
  sheet = profileActionSheet(openProfileOptions(h));
  sheet.props.onClose();
  assert.equal(profileActionSheet(h.render()), undefined);
  assert.equal(toggle().props['aria-expanded'], false);
  assertLinks(h.render());
});

test('WEB owner Share keeps its existing dialog and private profiles cannot dispatch a removed share action', () => {
  const options = { presentation: 'web', projects: reorderProjects, props: { shareUrl: 'https://portalinknetworks.com/share/owner' } };
  const h = profileHarness('keep=value', options);
  let tree = chooseWebProfileAction(h, 'share');
  assert.equal(profileActionSheet(tree), undefined);
  const shareOwner = nodes(tree).find(node => node.type === h.surfaceOwner.Provider);
  assert.ok(shareOwner);
  const dialog = shareOwner.props.children.props.children;
  assert.equal(dialog.props.profile.id, 'owner'); assert.equal(dialog.props.owner, true);
  assert.equal(shareOwner.props.value.onClose, dialog.props.onClose);
  assert.equal(h.search(), 'keep=value', 'WEB sharing keeps its established dialog instead of adding a mobile share route');
  dialog.props.onClose();
  assert.equal(nodes(h.render()).some(node => node.type === h.surfaceOwner.Provider), false);
  let sheet = profileActionSheet(openProfileOptions(h));
  const previouslyOffered = modelAction(sheet.props.model, 'share');
  options.props.profile = { ...h.profile, isPrivate: true };
  sheet = profileActionSheet(h.render());
  assert.equal(modelAction(sheet.props.model, 'share'), undefined);
  assert.equal(modelAction(sheet.props.model, 'copy'), undefined);
  sheet.props.onAction({ ...previouslyOffered, run() { assert.fail('A previously offered share cannot bypass the current private-profile guard'); } });
  tree = h.render();
  assert.equal(profileActionSheet(tree), undefined);
  assert.equal(nodes(tree).some(node => node.type === h.surfaceOwner.Provider), false);
  const privateOwner = profileHarness('', { presentation: 'web', isPrivate: true, projects: reorderProjects });
  const privateModel = profileActionSheet(openProfileOptions(privateOwner)).props.model;
  assert.equal(modelAction(privateModel, 'share'), undefined); assert.equal(modelAction(privateModel, 'copy'), undefined);
  assert.ok(modelAction(privateModel, 'reorder'), 'Privacy does not remove the owner’s existing arrangement capability');
});

test('WEB owner sheet enters existing project reorder and retains Done, Cancel and density behavior', async () => {
  for (const finish of ['Done', 'Cancel']) {
    let saved = 0;
    const h = profileHarness('', { presentation: 'web', projects: reorderProjects, columns: 5,
      projectOrder: { reset() { h.projectOrder.order = ['a', 'b']; }, move() { h.projectOrder.order = ['b', 'a']; }, async commit() { saved++; return true; } },
    });
    let tree = chooseWebProfileAction(h, 'reorder');
    assert.equal(profileActionSheet(tree), undefined);
    assert.equal(wall(tree).props.reorderMode.enabled, true);
    assert.equal(wall(tree).props.columns, 5);
    wall(tree).props.reorderMode.onMove('b', 'a');
    tree = h.render();
    const controls = nodes(tree).find(node => node.props?.['aria-label'] === 'Reorder projects');
    assert.ok(controls);
    const button = nodes(controls).find(node => node.type === 'button' && React.Children.toArray(node.props.children).includes(finish));
    assert.ok(button); await button.props.onClick();
    tree = h.render();
    assert.equal(wall(tree).props.reorderMode, undefined);
    assert.equal(wall(tree).props.columns, 5);
    assert.equal(saved, finish === 'Done' ? 1 : 0);
    assert.deepEqual(h.projectOrder.order, finish === 'Done' ? ['b', 'a'] : ['a', 'b']);
  }
  for (const options of [{ editorProjectId: 'a' }, { projects: reorderProjects.slice(0, 1) }, { projectOrder: { isSaving: true } }]) {
    const h = profileHarness('', { presentation: 'web', projects: reorderProjects, ...options });
    const sheet = profileActionSheet(openProfileOptions(h));
    assert.equal(modelAction(sheet.props.model, 'reorder'), undefined);
    assert.equal(wall(h.render()).props.reorderMode, undefined);
  }
});

test('WEB visitor/shared disclosure and MOBILE action ownership never mount the new local owner sheet', () => {
  for (const options of [
    { presentation: 'web', viewerRole: 'visitor' }, { presentation: 'web', viewerRole: 'guest' },
    { presentation: 'web', viewerRole: 'owner', isSharedView: true },
    { presentation: 'mobile', viewerRole: 'owner' }, { presentation: 'mobile', viewerRole: 'visitor' },
  ]) {
    const h = profileHarness('', { projects: reorderProjects, ...options });
    assert.equal(profileActionSheet(h.render()), undefined);
    const tree = openProfileOptions(h);
    assert.equal(profileActionSheet(tree), undefined);
    assert.equal(nodes(tree).some(node => node.props?.['data-profile-owner-actions'] !== undefined), false);
    if (options.presentation === 'web') {
      const toggle = nodes(tree).find(node => node.props?.['aria-label'] === 'Profile options');
      assert.equal(toggle.props['aria-haspopup'], undefined);
      assert.equal(toggle.props['aria-controls'], 'profile-navigation-tools');
      assert.equal(toggle.props['aria-expanded'], true);
      assert.ok(nodes(tree).find(node => node.type === 'PlatformGrid'));
    } else if (options.viewerRole === 'owner') {
      assert.equal(h.mobileActions.kind, 'profile'); assert.equal(h.mobileActions.viewer.owner, true);
      assert.ok(h.action('reorder'), 'MOBILE retains the existing global profile action model');
    }
  }
});

test('WEB owner action failures remain dismissible and cannot leave the options sheet open', async () => {
  for (const asynchronous of [false, true]) {
    const h = profileHarness('', { presentation: 'web', props: { onEditProfile: () => {
      if (asynchronous) return Promise.reject(new Error('Unable to open editor'));
      throw new Error('Unable to open editor');
    } } });
    chooseWebProfileAction(h, 'editProfile');
    await flush();
    let tree = h.render();
    assert.equal(profileActionSheet(tree), undefined);
    const error = nodes(tree).find(node => node.props?.role === 'alert');
    assert.ok(error); assert.equal(error.props.children, 'Unable to open editor');
    tree = openProfileOptions(h);
    assert.ok(profileActionSheet(tree));
    assert.equal(nodes(tree).some(node => node.props?.role === 'alert'), false, 'Reopening clears the previous action failure');
  }
});

async function failedOptionalModuleClose(owner) {
  const status = () => null;
  const recovery = compile('../src/components/ui/moduleLoadRecovery.ts', () => assert.fail('The transport helper has no imports'));
  const { lazyWithMobileRecovery } = compile('../src/components/ui/lazyWithMobileRecovery.tsx', name => {
    if (name === 'react') return { ...React, useContext: () => owner };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ phase: 'authenticated', user: { id: 'account' }, loginSession: {}, pendingView: null, session: null }) };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => 'mobile' };
    if (name.endsWith('/MobileBackNavigation')) return { useMobileScreenActive: () => true };
    if (name === './DeferredDialog') return { DeferredSurfaceStatus: status };
    if (name === './DeferredSurfaceOwner') return { DeferredSurfaceOwnerContext: {} };
    if (name === './moduleLoadRecovery') return recovery;
    assert.fail(`Unexpected recovery import ${name}`);
  }, { window: { location: { search: '', hash: '' } } });
  const Component = lazyWithMobileRecovery(() => Promise.reject(new TypeError('Importing a module script failed.')));
  const element = Component({});
  const boundary = new element.type(element.props);
  const lazy = boundary.render().type;
  let suspended;
  try { lazy._init(lazy._payload); } catch (pending) { suspended = pending; }
  assert.equal(typeof suspended?.then, 'function');
  await suspended.catch(() => {});
  let failure;
  try { lazy._init(lazy._payload); } catch (error) { failure = error; }
  boundary.state = { ...boundary.state, ...element.type.getDerivedStateFromError(failure) };
  const fallback = boundary.render();
  assert.equal(fallback.type, status);
  fallback.props.onClose();
}

test('failed optional profile modules close their own share, Start Here and Then/Now surfaces instead of the profile route', async () => {
  for (const presentation of ['mobile', 'web']) for (const kind of ['share', 'startHere', 'journeyPair']) {
    let routeBacks = 0;
    const query = kind === 'share' ? (presentation === 'mobile' ? 'share=portfolio' : '') : `${kind}=a`;
    const h = profileHarness(query, { presentation, projects: reorderProjects, props: { onBack: () => { routeBacks++; } } });
    h.render();
    if (kind === 'share' && presentation === 'web') h.action('share').run();
    const owner = nodes(h.render()).find(node => node.type === h.surfaceOwner.Provider);
    assert.ok(owner, `${presentation} ${kind} owns its module-loading fallback`);
    assert.equal(owner.props.value.active, true);
    assert.equal(owner.props.value.onClose, owner.props.children.props.children.props.onClose);
    await failedOptionalModuleClose(owner.props.value);
    assert.equal(routeBacks, 0);
    assert.equal(new URLSearchParams(h.search()).has(kind), false);
    assert.equal(nodes(h.render()).some(node => node.type === h.surfaceOwner.Provider), false, `${presentation} ${kind} is dismissed`);
  }
});

test('mobile Bio is available to owners, visitors and guests, with no links and on shared profiles', () => {
  for (const viewerRole of ['owner', 'visitor', 'guest']) {
    for (const isSharedView of [false, true]) {
      const h = profileHarness('', { presentation: 'mobile', viewerRole, isSharedView });
      const tree = openProfileOptions(h);
      const identity = nodes(tree).find(node => node.type?.name === 'ProfileIdentityAndLinks');
      const grid = nodes(tree).find(node => node.type === 'PlatformGrid');
      assert.equal(grid.props.isSharedView, isSharedView);
      assert.equal(grid.props.links.length, viewerRole === 'owner' && !isSharedView ? 2 : 3);
      grid.props.onOpenBio();
      const sheet = nodes(h.render()).find(node => node.type === 'ProfileBioSheet');
      assert.equal(sheet.props.canEdit, viewerRole === 'owner' && !isSharedView, 'Editing is owner-only, independent of Edit profile navigation');
      sheet.props.onClose();
      assert.equal(nodes(h.render()).some(node => node.type === 'ProfileBioSheet'), false);
    }
  }
  const h = profileHarness('', { presentation: 'web' });
  assert.equal(typeof nodes(openProfileOptions(h)).find(node => node.type === 'PlatformGrid').props.onOpenBio, 'function');
});

test('profile links place Bio before external links without changing their destinations', () => {
  let opened = 0;
  const { PlatformGrid } = compile('../src/components/profile/PlatformGrid.tsx', name => {
    if (name === 'react') return React;
    if (name.endsWith('/profileLinks')) return linkHelpers;
    if (name.endsWith('/categoryIcons')) return { getCategoryIcon: () => 'globe-icon' };
    return placeholder;
  });
  const props = { profileName: 'Creator', links: linkHelpers.resolveProfileLinks([{ label: 'Website', href: 'https://example.com' }], {}) };
  const grid = PlatformGrid({ ...props, onOpenBio: () => opened++ });
  const tiles = React.Children.toArray(grid.props.children);
  assert.equal(tiles[0].props.children.props['aria-label'], 'Bio');
  tiles[0].props.children.props.onClick();
  assert.equal(opened, 1);
  assert.equal(tiles[3].props.children.props.href, 'https://example.com');
  assert.equal(tiles[3].props.children.props.target, '_blank');
  assert.equal(nodes(PlatformGrid(props)).filter(node => node.type === 'button' && node.props.disabled).length, 3);
});

test('shared profile links hide platform actions even when handlers exist, retaining Bio and external links', () => {
  const { PlatformGrid } = compile('../src/components/profile/PlatformGrid.tsx', name => {
    if (name === 'react') return React;
    if (name.endsWith('/profileLinks')) return linkHelpers;
    if (name.endsWith('/categoryIcons')) return { getCategoryIcon: () => 'globe-icon' };
    return placeholder;
  });
  const calls = [];
  const links = linkHelpers.resolveProfileLinks([{ label: 'Website', href: 'https://example.com' }], {});
  const props = { profileName: 'Creator', links, onOpenBio: () => calls.push('bio'),
    onCollaboration: () => calls.push('collaboration'), onMessage: () => calls.push('message') };
  for (const handlers of [props, { ...props, onCollaboration: undefined, onMessage: undefined }]) {
    const tree = PlatformGrid({ ...handlers, isSharedView: true });
    const actions = nodes(tree).filter(node => node.type === 'button');
    assert.deepEqual(actions.map(node => node.props['aria-label']), ['Bio']);
    actions[0].props.onClick();
    assert.equal(nodes(tree).find(node => node.type === 'a').props.href, 'https://example.com');
  }
  const internal = nodes(PlatformGrid(props)).filter(node => node.type === 'button');
  assert.deepEqual(internal.map(node => node.props['aria-label']), ['Bio', 'Collaboration', 'Message']);
  internal[1].props.onClick(); internal[2].props.onClick();
  assert.deepEqual(calls, ['bio', 'bio', 'collaboration', 'message']);
  assert.deepEqual(Array.from(links.slice(0,3), link => link.action), ['bio','collaboration','message']);
});

test('action popup reorder entry keeps duplicate outside saves and retry recovery intact', async () => {
  let resolveSave;
  let saves = 0;
  let retries = 0;
  const h = profileHarness('', { presentation: 'mobile', projects: reorderProjects,
    projectOrder: { commit() { saves++; return new Promise(resolve => { resolveSave = resolve; }); }, retry: async () => { retries++; return true; } } });
  h.render(); h.action('reorder').run();
  assert.equal(wall(h.render()).props.reorderMode.enabled, true);
  assert.equal(h.outside().enabled, true);
  h.outside().finish(); h.outside().finish();
  assert.equal(saves, 1);
  resolveSave(false);
  await flush();
  h.projectOrder.saveError = 'Offline';
  assert.equal(wall(h.render()).props.reorderMode.enabled, true);
  h.outside().finish();
  await flush();
  assert.equal(retries, 1);
  assert.equal(saves, 1);
  assert.equal(wall(h.render()).props.reorderMode, undefined);
  assert.equal(h.outside().enabled, false);
});

test('profile reorder drop, Done, Cancel and outside save never change the active density', async () => {
  for (const count of [2, 5, 13]) for (const finish of ['Done', 'Cancel', 'outside']) {
    let saved = 0, reset = 0;
    const h = profileHarness('', { presentation: 'mobile', projects: reorderProjects, columns: count,
      projectOrder: { reset() { reset++; h.projectOrder.order = ['a', 'b']; },
        move() { h.projectOrder.order = ['b', 'a']; },
        async commit() { saved++; return true; } } });
    h.render(); h.action('reorder').run();
    assert.equal(wall(h.render()).props.columns, count);
    wall(h.render()).props.reorderMode.onMove('b', 'a');
    assert.equal(wall(h.render()).props.columns, count);
    if (finish === 'outside') h.outside().finish();
    else nodes(h.render()).find(node => node.type === 'button' && node.props.children === finish).props.onClick();
    await flush();
    assert.equal(wall(h.render()).props.columns, count);
    assert.equal(wall(h.render()).props.reorderMode, undefined);
    assert.deepEqual(h.projectOrder.order, finish === 'Cancel' ? ['a', 'b'] : ['b', 'a']);
    assert.equal(saved, finish === 'Cancel' ? 0 : 1);
    assert.equal(reset, finish === 'Cancel' ? 2 : 1);
  }
});

test('shared headers omit counts even when expanded, while regular visitors cannot open owner-only lists', () => {
  for (const presentation of ['mobile', 'web']) {
    for (const options of [{ viewerRole: 'guest', isSharedView: true }, { viewerRole: 'owner', isSharedView: true }, { viewerRole: 'visitor' }]) {
      const h = profileHarness('view=followers', { ...options, presentation });
      openProfileOptions(h);
      const stats = nodes(h.render()).find(node => node.type?.name === 'ProfileStats');
      if (options.isSharedView) { assert.equal(stats, undefined); continue; }
      assert.equal(stats.props.activeView, 'followers', 'A typed URL retains the selected view; service/RLS still deny the private list');
      const controls = nodes(stats.type(stats.props)).filter(node => node.props?.className === 'profile-count-control');
      assert.deepEqual(controls.map(node => node.type), ['button', 'button', 'span', 'span']);
      assert.equal(controls[2].props.onClick, undefined);
      assert.equal(controls[3].props.onClick, undefined);
    }
  }
});

test('empty owner portfolios can publish directly while visitor, shared and populated profiles retain their existing behavior', () => {
  for (const presentation of ['mobile', 'web']) {
    let publications = 0;
    const onPublishProject = () => { publications++; };
    const owner = profileHarness('', { presentation, props: { onPublishProject } });
    const empty = nodes(owner.render()).find(node => node.type === 'EmptyState' && node.props.title === 'No work published yet');
    if (presentation === 'mobile') {
      assert.equal(empty, undefined);
      const tiles = nodes(owner.render()).filter(node => node.type === 'button' && node.props.className === 'first-project-empty-tile');
      assert.equal(tiles.length, 1); tiles[0].props.onClick();
    } else { assert.equal(empty.props.action.label, 'Add a project'); empty.props.action.onClick(); }
    assert.equal(publications, 1);
    for (const access of [{ viewerRole: 'visitor' }, { viewerRole: 'guest' }, { viewerRole: 'owner', isSharedView: true }]) {
      const denied = profileHarness('', { ...access, presentation, props: { onPublishProject } });
      const state = nodes(denied.render()).find(node => node.type === 'EmptyState' && node.props.title === 'No work published yet');
      assert.equal(state.props.action, undefined);
      assert.match(state.props.description, /has not published/);
    }
    const populated = profileHarness('', { presentation, projects: reorderProjects, props: { onPublishProject } });
    const tree = populated.render();
    assert.equal(nodes(tree).some(node => node.type === 'EmptyState' && node.props.title === 'No work published yet'), false);
    assert.equal(wall(tree).props.items.length, 2);
    assert.equal(publications, 1);
  }
});

test('profile headers keep Bio behind its control and use Portals consistently on shared and regular profiles', () => {
  const profile = { id: 'owner', name: 'Owner', headline: 'Jolly Good\nWorking across media.', location: 'London', projects: reorderProjects, categories: [{ id: 'photos', label: 'Photography' }], stats: [] };
  for (const presentation of ['mobile', 'web']) for (const isSharedView of [false, true]) for (const viewerRole of ['owner', 'visitor', 'guest']) {
    const h = profileHarness('', { presentation, projects: reorderProjects, isSharedView, viewerRole });
    if (presentation === 'mobile') openProfileOptions(h);
    const tree = h.render({ profile });
    assert.equal(wall(tree).props.allowLayoutControls, !isSharedView);
    assert.equal(nodes(tree).some(node => node.props?.['data-shared-profile-headline'] !== undefined), false);
    const copy = nodes(tree).find(node => node.props?.className?.includes('profile-identity-copy'));
    const children = React.Children.toArray(copy.props.children);
    assert.equal(children[0].type, 'h1'); assert.equal(children[1].props.children, 'London');
    assert.equal(nodes(copy).some(node => node.props?.className === 'profile-short-headline'), false);
    assert.equal(nodes(copy).some(node => node.props?.children === 'Jolly Good'), false);
    assert.equal(nodes(copy).some(node => node.props?.children === profile.headline), false);
    const stats = nodes(tree).find(node => node.type?.name === 'ProfileStats');
    assert.equal(Boolean(stats), !isSharedView, 'Shared headers omit counts; ordinary profiles retain them');
    if (stats) {
      const controls = nodes(stats.type(stats.props)).filter(node => node.props?.className === 'profile-count-control');
      assert.equal(controls[1].props.children.at(-1), 'portal');
    }
  }
  const { ProfileCollectionGrid } = compile('../src/components/profile/ProfileCollectionGrid.tsx', name => name.endsWith('/usePresentation') ? {usePresentation:()=> 'web'} : name === 'react' ? React : name === '../../app/routes' ? routes : name.endsWith('/categoryIcons') ? { getCategoryIcon: () => 'category-icon' } : placeholder);
  const shared = ProfileCollectionGrid({ shared: true, profileId: 'owner', kind: 'portals', portals: profile.categories, people: [], loading: false, error: null, hasMore: false });
  assert.equal(shared.props['aria-label'], 'Portals');
  assert.equal(nodes(shared).find(node => node.type === 'Link').props.to, '/share/owner/c/photos');
  for (const isSharedView of [false, true]) {
    const empty = ProfileCollectionGrid({ shared: isSharedView, profileId: 'owner', kind: 'portals', portals: [], people: [], loading: false, error: null, hasMore: false });
    assert.equal(empty.props['aria-label'], 'Portals');
    assert.equal(nodes(empty).find(node => node.type === 'EmptyState').props.title, 'No portals yet');
  }
});

test('shared gallery keeps published projects without chosen covers and opts their cards into artwork fallback', () => {
  const projects = [{ id: 'covered', title: 'Covered work', categoryId: 'photos', cover: 'cover.png' },
    { id: 'uncovered', title: 'Report', categoryId: 'photos', cover: '', attachments: [{ id: 'pdf', kind: 'document', sourceUrl: 'report.pdf' }] }];
  for (const presentation of ['mobile', 'web']) for (const isSharedView of [false, true]) {
    const opened = [];
    const h = profileHarness('', { presentation, isSharedView, viewerRole: 'guest', projects, props: { onOpenProject: (...args) => opened.push(args) } });
    const items = wall(h.render()).props.items;
    assert.deepEqual(Array.from(items, item => item.key), isSharedView ? ['covered', 'uncovered'] : ['covered']);
    for (const item of items) {
      const tile = nodes(item.content).find(node => node.type?.name === 'ProfileProjectTile');
      const card = tile.type(tile.props);
      assert.equal(card.props.sharedCoverFallback, isSharedView);
      assert.equal(card.props.project.id, item.key);
      card.props.onOpen(); assert.deepEqual(opened.at(-1), [item.key, 'photos']);
    }
  }
});


test('shared profile fallback omits following and retries while platform follow actions still work', () => {
  for (const presentation of ['mobile', 'web']) {
    let toggled = 0, signedIn = 0;
    const follow = { isFollowing: false, isRequested: false, isResolving: false, isPending: false, resolveError: null,
      mutationError: 'Follow unavailable', onToggle() { toggled++; }, onRetry() {} };
    const props = { follow, onSignInRequest() { signedIn++; } };
    for (const viewerRole of ['guest', 'visitor', 'owner']) {
      const shared = profileHarness('', { presentation, viewerRole, isSharedView: true, props });
      for (const expanded of [false, true]) {
        if (expanded) openProfileOptions(shared);
        const tree = shared.render();
        assert.equal(nodes(tree).some(node => node.type === 'button' && /follow/i.test(node.props['aria-label'] ?? node.props.children)), false);
        assert.equal(nodes(tree).some(node => node.props?.role === 'alert'), false);
        assert.equal(nodes(tree).some(node => node.props?.['data-profile-visitor-actions'] !== undefined), false);
      }
    }
    const member = profileHarness('', { presentation, viewerRole: 'visitor', props });
    openProfileOptions(member);
    const action = nodes(member.render()).find(node => node.props?.['aria-label'] === 'Follow Owner');
    assert.ok(action); action.props.onClick(); assert.equal(toggled, 1);
    const guest = profileHarness('', { presentation, viewerRole: 'guest', props });
    openProfileOptions(guest);
    const signIn = nodes(guest.render()).find(node => node.type === 'button' && node.props.children === 'Sign in to follow');
    assert.ok(signIn); signIn.props.onClick(); assert.equal(signedIn, 1);
  }
});


test('connection totals use a counts-only RPC and reject unavailable totals rather than inventing zero', async () => {
  for (const result of [{ data: { followers: 7, following: 3 }, error: null }, { data: null, error: null }, { data: null, error: { message: 'offline' } }]) {
    const client = { async rpc(name, args) { if (name === 'can_view_profile_connections') { assert.equal(args.p_profile_id, 'person'); return {data:false,error:null}; } assert.equal(name, 'profile_connection_counts'); assert.equal(args.p_profile_id, 'person'); return result; } };
    const { supabaseSocialService } = compile('../src/services/supabase/communityServices.ts', name => name === './client' ? { requireSupabase: () => client } : name.endsWith('/social') ? socialTypes : {});
    if (result.data) {
      const totals = await supabaseSocialService.getProfileConnectionCounts('person');
      assert.equal(totals.followers, 7); assert.equal(totals.following, 3);
    } else await assert.rejects(supabaseSocialService.getProfileConnectionCounts('person'), error => error.code === 'network');
  }
});


test('profile header loads current totals before opening any list and discards stale account responses', async () => {
  const h = hookHarness(true);
  h.render(null);
  assert.equal(h.pending.length, 0);
  assert.equal(h.countRequests.length, 1);
  h.countRequests[0].resolve({followers:7,following:3}); await flush();
  assert.equal(h.render(null).counts.followers, 7);
  assert.equal(h.render(null).counts.following, 3);
  h.render(null, 1);
  h.switchAccount('account-b'); h.render(null, 1);
  h.countRequests[1].resolve({followers:99,following:99}); await flush();
  assert.equal(h.render(null,1).counts.followers, undefined);
  h.countRequests[2].resolve({followers:0,following:2}); await flush();
  assert.equal(h.render(null,1).counts.followers, 0);
  assert.equal(h.render(null,1).counts.following, 2);
});


test('mobile visitor profile keeps Message in link icons without duplicating it in Actions; WEB is preserved', () => {
  for (const presentation of ['mobile', 'web']) {
    let messages = 0;
    const onMessage = () => messages++;
    const h = profileHarness('', {presentation, viewerRole:'visitor', isAuthenticated:true, props:{onMessage}});
    const tree = openProfileOptions(h);
    const grid = nodes(tree).find(node => node.type === 'PlatformGrid');
    assert.ok(grid.props.links.some(link => link.action === 'message'));
    grid.props.onMessage(); assert.equal(messages, 1);
    const introduction = nodes(tree).find(node => node.type === 'EmployerOverview');
    assert.ok(introduction);
    assert.equal(introduction.props.onMessage, presentation === 'mobile' ? undefined : onMessage);
    if (presentation === 'mobile') assert.equal(h.action('message'), undefined);
  }
});


test('mobile nested profile headers retain Portfolio/Journey and return to the selected profile view', () => {
  for (const viewerRole of ['owner', 'visitor']) {
    for (const mobileContentView of ['portals', 'projects']) {
      const selected=[];
      const h=profileHarness('',{presentation:'mobile',viewerRole,showJourney:true,props:{mobileContent:React.createElement('section',null,'Content'),mobileContentView,onMobileViewChange:view=>selected.push(view)}});
      const toggle=nodes(h.render()).find(node=>node.type==='JourneyToggle');
      assert.ok(toggle);
      toggle.props.onChange('journey');
      assert.deepEqual(selected,['projects']);
    }
  }
});

test('mobile connection profiles expose icon Back and return through history to the selected list; WEB stays unchanged', () => {
  for (const kind of ['followers', 'following']) {
    const h = profileHarness(`fromConnections=source&connectionList=${kind}`, {presentation:'mobile', window:{history:{state:{idx:2}}}});
    const back = nodes(h.render()).find(node => node.props['aria-label'] === 'Back to previous screen');
    assert.ok(back); back.props.onClick({detail:1});
    assert.equal(h.navigation.at(-1).target, -1);
    const direct = profileHarness(`fromConnections=source&connectionList=${kind}`, {presentation:'mobile', window:{history:{state:{idx:0}}}});
    nodes(direct.render()).find(node => node.props['aria-label'] === 'Back to previous screen').props.onClick({detail:1});
    assert.equal(direct.navigation.at(-1).target, `/p/source?view=${kind}`);
    assert.equal(direct.navigation.at(-1).options.replace, true);
    assert.equal(nodes(profileHarness(`fromConnections=source&connectionList=${kind}`, {presentation:'web'}).render()).some(node => node.props['data-connections-back'] !== undefined), false);
  }
  assert.equal(nodes(profileHarness('', {presentation:'mobile'}).render()).some(node => node.props['data-connections-back'] !== undefined), false);
});

test('confirmed mutuals can list both connection directions',async()=>{
 for(const kind of ['followers','following']){
 const h=serviceHarness('mutual',null,true); const page=await h.service.listProfileConnections('owner',kind);
 assert.equal(page.items[0].profileId,'person');
 }
});

test('mobile Profile separator changes the existing wall density and stays absent from shared portfolios',()=>{
 const h=profileHarness('',{presentation:'mobile',projects:reorderProjects});
 const slider=()=>nodes(h.render()).find(n=>n.props.label==='Profile content per row');assert.ok(slider());slider().props.onChange(8);
 assert.equal(slider().props.columns,8);assert.equal(wall(h.render()).props.columns,8);
 assert.equal(nodes(profileHarness('',{presentation:'mobile',isSharedView:true,projects:reorderProjects}).render()).some(n=>n.props.label==='Profile content per row'),false);
});

test('WEB header density previews and commits the existing wall value without duplicate gallery controls', () => {
  for (const viewerRole of ['owner', 'visitor']) {
    const h = profileHarness('', { presentation: 'web', viewerRole, projects: reorderProjects, columns: 5 });
    const sliders = () => nodes(h.render()).filter(node => node.props?.label === 'Profile content per row');
    assert.equal(sliders().length, 1);
    const slider = sliders()[0];
    assert.equal(slider.props.columns, 5);
    assert.equal(wall(h.render()).props.showDensityControl, false);
    assert.equal(wall(h.render()).props.allowLayoutControls, true, 'Local zoom/readout remains enabled');
    slider.props.onPreview(8);
    assert.deepEqual(h.density.previews, [8]);
    assert.deepEqual(h.density.commits, []);
    assert.equal(wall(h.render()).props.columns, 8);
    slider.props.onChange(13);
    assert.deepEqual(h.density.commits, [13]);
    assert.equal(sliders()[0].props.columns, 13);
    assert.equal(wall(h.render()).props.columns, 13);
    const { DensitySeparator } = compile('../src/components/ui/DensitySeparator.tsx', name => name === 'react'
      ? { ...React, useRef: current => ({ current }), useEffect() {}, useLayoutEffect() {} }
      : name.endsWith('/projectGridDensity') ? gridDensity : name.endsWith('/usePresentation') ? { usePresentation: () => 'web' } : {});
    const range = nodes(DensitySeparator(sliders()[0].props)).find(node => node.type === 'input');
    assert.equal(range.type, 'input');
    assert.equal(range.props.type, 'range');
    assert.equal(range.props.min, 1);
    assert.equal(range.props.max, 13);
  }
});

test('WEB header density stays out of shared, nested reader, collection, Timeline and reorder views', () => {
  const hasSlider = tree => nodes(tree).some(node => node.props?.label === 'Profile content per row');
  for (const options of [
    { isSharedView: true },
    { props: { mobileContent: React.createElement('project') } },
    { journeyView: 'journey' },
  ]) {
    const tree = profileHarness('', { presentation: 'web', projects: reorderProjects, ...options }).render();
    assert.equal(hasSlider(tree), false);
    if (options.isSharedView) assert.equal(nodes(tree).some(node => node.type?.name === 'ProfileStats'), false);
  }
  for (const view of ['portals', 'followers', 'following']) {
    assert.equal(hasSlider(profileHarness(`view=${view}`, { presentation: 'web', projects: reorderProjects }).render()), false);
  }
  const h = profileHarness('', { presentation: 'web', projects: reorderProjects });
  chooseWebProfileAction(h, 'reorder');
  const reordering = h.render();
  assert.equal(wall(reordering).props.reorderMode.enabled, true);
  assert.equal(hasSlider(reordering), false);
});
