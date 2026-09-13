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
const socialTypes = compile('../src/types/social.ts', () => ({}));
const engagementTypes = compile('../src/types/engagement.ts', () => ({}));
const routes = compile('../src/app/routes.ts', () => ({ navigationDestinations: [] }));
const placeholder = new Proxy({}, { get: (_, key) => key });
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}

function serviceHarness(owner = 'owner', failure = null) {
  const calls = [];
  const client = {
    async rpc(name, args) {
      assert.equal(name, 'profile_identities');
      assert.deepEqual(Array.from(args.p_profile_ids), ['person']);
      calls.push({ rpc: name, args });
      return { data: [{ id: 'person', name: 'Person Name', handle: 'person', avatar_url: 'avatar.jpg' }], error: null };
    },
    auth: { getUser: async () => ({ data: { user: { id: 'account' } }, error: null }) },
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

function hookHarness() {
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
  const social = { listProfileConnections: (...args) => new Promise((resolve, reject) => pending.push({ args, resolve, reject })) };
  const { useProfileConnections } = compile('../src/features/follows/useProfileConnections.ts', (name) => {
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({ onTriggerKeyDown() {} }) };
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name === 'react') return react;
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user: { id: accountId } }) };
    if (name.endsWith('/ServicesContext')) return { useServices: () => ({ social }) };
    return socialTypes;
  });
  return { pending, switchAccount(id) { accountId = id; }, render(kind, refresh = 0) { cursor = 0; const result = useProfileConnections('owner', kind, refresh); effects.splice(0).forEach((effect) => effect()); return result; } };
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
    if (name.endsWith('/routes')) return routes;
    if (name.endsWith('/categoryIcons')) return { getCategoryIcon: () => 'camera-icon' };
    return placeholder;
  });
  for (const kind of ['portals', 'followers', 'following']) {
    const tree = ProfileCollectionGrid({ profileId: 'owner', kind, portals: [{ id: 'photos', label: 'Photography', iconName: 'camera' }], people: [{ profileId: 'person', name: 'Person Name', avatar: '' }], loading: false, error: null, hasMore: false });
    const link = nodes(tree).find((node) => node.type === 'Link');
    assert.equal(link.props.to, kind === 'portals' ? '/p/owner/c/photos' : '/p/person');
    const children = React.Children.toArray(link.props.children);
    assert.match(children[0].props.className, /squircle/);
    assert.equal(children[1].props.className, 'profile-collection-name');
    assert.equal(nodes(tree).some((node) => node.props?.role === 'dialog'), false);
  }
});

function profileHarness(search = '', options = {}) {
  let params = new URLSearchParams(search);
  const navigation = [];
  let cursor = 0;
  const slots = [];
  const pendingEffects = [];
  const projects = options.projects ?? [];
  const projectOrder = { order: projects.map(project => project.id), reset() {}, dismissError() {}, isSaving: false, commit: async () => true, ...options.projectOrder };
  let outside;
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
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({ onTriggerKeyDown() {} }) };
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name === 'react') return react;
    if (name === 'react-router-dom') return { useSearchParams: () => [params, (update, options) => { params = update(params); navigation.push(options); }] };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => options.presentation ?? 'web' };
    if (name.endsWith('/useReorderOutsideTap')) return { useReorderOutsideTap: (enabled, root, finish) => { outside = { enabled, finish }; } };
    if (name.endsWith('/projectPresentation')) return { getProjectAspectRatio: () => 1 };
    if (name.endsWith('/viewer')) return { canAuthor: (role) => role === 'owner', needsAccount: (role) => role === 'guest' };
    if (name.endsWith('/useProfileVisibility')) return { useProfileVisibility: () => ({ isPrivate: false }) };
    if (name.endsWith('/useFollowRequests')) return { useFollowRequests: () => ({ count: 0, requests: [] }) };
    if (name.endsWith('/useProfileConnections')) return { useProfileConnections: () => ({ items: [], counts: {}, loading: false, error: null, nextOffset: null }) };
    if (name.endsWith('/useProjectManagement')) return { useProjectManagement: () => ({ editor: { projectId: options.editorProjectId ?? null } }) };
    if (name.endsWith('/useProfileProjectOrder')) return { useProfileProjectOrder: () => projectOrder };
    if (name.endsWith('/profileLinks')) return { mergeProfileLinks: () => options.links ?? [] };
    if (name.endsWith('/types/engagement')) return engagementTypes;
    return placeholder;
  }, { URLSearchParams, window: { localStorage: { getItem: () => null } }, document: options.document, Element: options.Element });
  const profile = { id: 'owner', name: 'Owner', projects, categories: [{ id: 'photos', label: 'Photography', iconName: 'camera' }], stats: [] };
  return { navigation, projectOrder, flushEffects: () => { while (pendingEffects.length) pendingEffects.shift()(); }, outside: () => outside, search: () => params.toString(), render: (updates = {}) => {
    cursor = 0;
    return UserProfilePage({ profile, viewerRole: options.viewerRole ?? 'owner', isSharedView: options.isSharedView, onBack() {}, onOpenProject() {}, ...options.props, ...updates });
  } };
}

test('count controls replace the project area, report real Portal count, and restore from the profile URL', () => {
  const h = profileHarness('keep=value');
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

test('both mobile portal counts float the supplied chooser above the wall and preserve a profile history entry', () => {
  const mobilePortalsView = React.createElement('section', { 'aria-label': 'Portal list' });
  for (const viewerRole of ['owner', 'visitor', 'guest']) {
    for (const expanded of [false, true]) {
      const h = profileHarness('keep=value', { presentation: 'mobile', viewerRole, projects: reorderProjects, props: { mobilePortalsView } });
      let tree = h.render();
      if (expanded) {
        nodes(tree).find(node => node.props?.['aria-label'] === 'Profile options').props.onClick();
        tree = h.render();
        const stats = nodes(tree).find(node => node.type?.name === 'ProfileStats');
        nodes(stats.type(stats.props)).filter(node => node.type === 'button')[1].props.onClick();
      } else {
        const identity = nodes(tree).find(node => node.type?.name === 'ProfileIdentityAndLinks');
        const summary = nodes(identity.type(identity.props)).find(node => node.props?.['aria-label'] === 'Profile summary');
        nodes(summary).filter(node => node.type === 'button')[1].props.onClick();
      }
      const portalTree = h.render();
      assert.ok(nodes(portalTree).some(node => node.props === mobilePortalsView.props));
      assert.ok(wall(portalTree), 'Opening Portals must leave the artwork mounted underneath');
      const underlay = nodes(portalTree).find(node => node.props?.className === 'mobile-profile-wall scrollbar-overlay');
      assert.equal(underlay.props['aria-hidden'], true);
      const element = {};
      underlay.ref(element);
      assert.equal(element.inert, true, 'Underlying cards must not receive taps or focus');
      assert.ok(nodes(portalTree).some(node => node.props?.className === 'mobile-profile-header'));
      assert.equal(new URLSearchParams(h.search()).get('view'), 'portals');
      assert.equal(new URLSearchParams(h.search()).get('keep'), 'value');
      assert.equal(h.navigation.at(-1).replace, false);
      const restored = profileHarness(h.search(), { presentation: 'mobile', viewerRole, props: { mobilePortalsView } }).render();
      assert.ok(nodes(restored).some(node => node.props === mobilePortalsView.props));
      nodes(portalTree).find(node => node.props?.['aria-label'] === 'Close portals').props.onClick();
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
  assert.equal(nodes(web).find(node => node.props?.id === 'profile-content').props.children, mobileContent);
});

test('mobile wall remembers its scroll through a project and after returning from another screen', () => {
  let savedTop = 0;
  const props = { mobileWallScrollMemory: { read: () => savedTop, save: top => { savedTop = top; } } };
  const options = { presentation: 'mobile', projects: reorderProjects, props };
  const h = profileHarness('', options);
  const scrollWall = tree => nodes(tree).find(node => node.props?.className === 'mobile-profile-wall scrollbar-overlay');
  scrollWall(h.render()).props.onScroll({ currentTarget: { scrollTop: 408 } });
  h.render({ mobileContent: React.createElement('project') });
  for (const tree of [h.render(), profileHarness('', options).render()]) {
    const element = { scrollTop: 0 };
    scrollWall(tree).ref(element);
    assert.equal(element.scrollTop, 408);
  }
});
test('nested mobile work retains profile identity and tools, and count controls navigate out of the project', () => {
  for (const viewerRole of ['owner', 'visitor', 'guest']) {
    const selectedViews = [];
    const mobileContent = React.createElement('section', { 'aria-label': 'Project viewer' });
    const h = profileHarness('', { presentation: 'mobile', viewerRole, projects: reorderProjects,
      props: { mobileContent, onMobileViewChange: view => selectedViews.push(view), onEditProfile() {} } });
    let tree = h.render();
    assert.equal(tree.props['data-profile-nested'], '');
    assert.equal(nodes(tree).find(node => node.props?.id === 'profile-content').props.children, mobileContent);
    assert.equal(wall(tree), undefined);
    const identity = nodes(tree).find(node => node.type?.name === 'ProfileIdentityAndLinks');
    assert.equal(identity.props.profile.id, 'owner');
    identity.props.summaryCounts.onSelect('portals');
    assert.deepEqual(selectedViews, ['portals']);
    assert.equal(h.navigation.length, 0, 'Nested count must not edit the project URL query');
    nodes(tree).find(node => node.props?.['aria-label'] === 'Profile options').props.onClick();
    tree = h.render();
    const stats = nodes(tree).find(node => node.type?.name === 'ProfileStats');
    for (const view of ['projects', 'followers', 'following']) stats.props.onSelect(view);
    assert.deepEqual(selectedViews, ['portals', 'projects', 'followers', 'following']);
    assert.equal(nodes(tree).some(node => node.props?.['aria-label'] === 'Edit profile'), viewerRole === 'owner');
    if (viewerRole === 'owner') {
      nodes(tree).find(node => node.props?.['aria-label'] === 'Manage profile').props.onClick();
      tree = h.render();
      assert.equal(nodes(tree).some(node => node.props?.['aria-label'] === 'Cards per row'), false);
      assert.equal(nodes(tree).some(node => node.type === 'button' && React.Children.toArray(node.props.children).includes('Reorder projects')), false);
    }
  }
});

test('mobile view switches keep the same expanded profile tools and use one navigation callback', () => {
  const selected = [];
  const h = profileHarness('', { presentation: 'mobile', props: { onMobileViewChange: view => selected.push(view) } });
  let tree = h.render();
  nodes(tree).find(node => node.props?.['aria-label'] === 'Profile options').props.onClick();
  for (const mobileContent of [undefined, React.createElement('portals'), React.createElement('project'), undefined]) {
    tree = h.render({ mobileContent });
    assert.equal(nodes(tree).find(node => node.props?.['aria-label'] === 'Profile options').props['aria-expanded'], true);
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
      isSharedRoute, viewedProfile: { id: 'viewed-creator' }, buildPath: routes.buildPath, pathname: '/start', search: '',
      nav: { to: path => destinations.push(path) },
    });
    for (const view of ['portals', 'projects', 'followers', 'following']) navigate(view);
    const base = `${isSharedRoute ? '/share' : '/p'}/viewed-creator`;
    assert.deepEqual(destinations, [`${base}?view=portals`, base, `${base}?view=followers`, `${base}?view=following`]);
    const noChange = vm.runInNewContext(`view => {${body}}`, {
      isSharedRoute, viewedProfile: { id: 'viewed-creator' }, buildPath: routes.buildPath, pathname: base, search: '?view=portals',
      nav: { to: () => assert.fail('An active count must not add duplicate history entries') },
    });
    noChange('portals');
  }
});

test('workspace keeps one child position and only MOBILE displays the profile frame', () => {
  const { MobileProfileWorkspace } = compile('../src/presentation/mobile/MobileProfileWorkspace.tsx', name => {
    if (name.endsWith('/useMenuFocus')) return { useMenuFocus: () => ({ onTriggerKeyDown() {} }) };
    if (name.endsWith('/useModalFocus')) return { useModalFocus() {} };
    if (name === 'react') return React;
    return {};
  });
  const overview = React.createElement('profile', { profile: { id: 'viewed-creator' } });
  const child = React.createElement('project');
  const result = MobileProfileWorkspace({ overview, children: child, view: 'portals' });
  assert.equal(result.props.profile.id, 'viewed-creator');
  assert.equal(result.props.mobileContent, child);
  assert.equal(result.props.mobileContentView, 'portals');
  const overviewResult = MobileProfileWorkspace({ overview });
  assert.equal(overviewResult.type, result.type);
  assert.equal(overviewResult.key, result.key);
  assert.equal(overviewResult.props.mobileContent, undefined);
  const web = profileHarness('', { presentation: 'web', props: { mobileContent: child } }).render();
  const mobile = profileHarness('', { presentation: 'mobile', props: { mobileContent: child } }).render();
  assert.equal(web.props.className, 'contents');
  assert.equal(web.props['data-profile-page'], undefined);
  assert.equal(React.Children.toArray(web.props.children)[0].props.className, 'hidden');
  for (const tree of [web, mobile]) {
    const main = nodes(tree).find(node => node.props?.id === 'profile-content');
    assert.equal(main.props.children, child);
    assert.equal(React.Children.toArray(tree.props.children).findIndex(node => node.props.id === 'profile-content'), 1);
  }
  assert.equal(nodes(web).find(node => node.props?.id === 'profile-content').props.className, 'contents');
});

test('mobile profile links appear below the action row only while Profile options is open', () => {
  const links = [{ label: 'Website', href: 'https://example.com', iconName: 'globe' }];
  for (const viewerRole of ['owner', 'visitor']) {
    const h = profileHarness('', { presentation: 'mobile', viewerRole, links,
      props: { onOpenActivity() {}, onEditProfile() {}, shareUrl: 'https://example.com/share/owner' } });
    let tree = h.render();
    const identity = nodes(tree).find(node => node.type?.name === 'ProfileIdentityAndLinks');
    assert.equal(nodes(identity.type(identity.props)).some(node => node.type === 'PlatformGrid'), false);
    assert.equal(nodes(tree).some(node => node.type === 'PlatformGrid'), false);
    const toggle = () => nodes(tree).find(node => node.props?.['aria-label'] === 'Profile options');
    assert.equal(toggle().props['aria-expanded'], false);
    toggle().props.onClick();
    tree = h.render();
    assert.equal(toggle().props['aria-expanded'], true);
    const tools = nodes(tree).find(node => node.props?.id === 'profile-navigation-tools');
    const children = React.Children.toArray(tools.props.children.props.children);
    const linkRow = children.find(node => node.props?.['data-mobile-profile-links'] !== undefined);
    assert.equal(children.at(-1), linkRow);
    assert.equal(linkRow.props.children.type, 'PlatformGrid');
    assert.equal(linkRow.props.children.props.links, links);
    if (viewerRole === 'owner') {
      const actions = children.find(node => node.props?.['data-profile-owner-actions'] !== undefined);
      assert.ok(children.indexOf(actions) < children.indexOf(linkRow));
    }
    toggle().props.onClick();
    tree = h.render();
    assert.equal(nodes(tree).some(node => node.type === 'PlatformGrid'), false);
    assert.equal(nodes(tree).some(node => node.props?.id === 'profile-navigation-tools'), false);
  }
});

test('WEB and shared public profiles retain their existing visible identity links', () => {
  const links = [{ label: 'Website', href: 'https://example.com' }];
  for (const options of [{ presentation: 'web' }, { presentation: 'mobile', isSharedView: true }]) {
    const tree = profileHarness('', { ...options, links }).render();
    const identity = nodes(tree).find(node => node.type?.name === 'ProfileIdentityAndLinks');
    const grid = nodes(identity.type(identity.props)).find(node => node.type === 'PlatformGrid');
    assert.equal(grid.props.links, links);
    assert.equal(nodes(tree).some(node => node.props?.['data-mobile-profile-links'] !== undefined), false);
  }
});

const reorderControl = tree => nodes(tree).find(node => node.props?.['data-profile-reorder-start'] !== undefined);
function openProfileOptions(h) {
  nodes(h.render()).find(node => node.props?.['aria-label'] === 'Profile options').props.onClick();
  return h.render();
}

test('mobile owner reorder is available through the three dots with no passive hold activation', () => {
  const owner = profileHarness('', { presentation: 'mobile', projects: reorderProjects });
  assert.equal(wall(owner.render()).props.reorderMode, undefined);
  assert.equal(reorderControl(owner.render()), undefined);
  const control = reorderControl(openProfileOptions(owner));
  assert.equal(control.props.disabled, false);
  assert.equal(wall(owner.render()).props.reorderMode, undefined, 'Opening options alone must not start a drag');
  control.props.onClick();
  const editing = owner.render();
  assert.equal(wall(editing).props.reorderMode.enabled, true);
  assert.equal(wall(editing).props.reorderMode.onStart, undefined);
  assert.equal(nodes(editing).some(node => node.props?.id === 'profile-navigation-tools'), false);
  assert.ok(nodes(editing).some(node => node.type === 'button' && node.props.children === 'Done'));
  const cancel = nodes(editing).find(node => node.type === 'button' && node.props.children === 'Cancel');
  cancel.props.onClick();
  assert.equal(wall(owner.render()).props.reorderMode, undefined);
  for (const options of [{ viewerRole: 'visitor' }, { viewerRole: 'guest' }, { props: { mobileContent: React.createElement('project') } }]) {
    const h = profileHarness('', { presentation: 'mobile', projects: reorderProjects, ...options });
    assert.equal(reorderControl(openProfileOptions(h)), undefined);
    assert.equal(wall(h.render())?.props.reorderMode, undefined);
    assert.equal(h.outside().enabled, false);
  }
  for (const view of ['portals', 'followers', 'following']) {
    const h = profileHarness(`view=${view}`, { presentation: 'mobile', projects: reorderProjects });
    assert.equal(reorderControl(openProfileOptions(h)), undefined);
    assert.equal(wall(h.render())?.props.reorderMode, undefined);
  }
  const shared = profileHarness('', { presentation: 'mobile', projects: reorderProjects, isSharedView: true }).render();
  assert.equal(reorderControl(shared), undefined);
  assert.equal(wall(shared).props.reorderMode, undefined);
  for (const options of [{ editorProjectId: 'a' }, { projects: reorderProjects.slice(0, 1) }, { projectOrder: { isSaving: true } }]) {
    const h = profileHarness('', { presentation: 'mobile', projects: reorderProjects, ...options });
    const disabled = reorderControl(openProfileOptions(h));
    assert.equal(disabled.props.disabled, true);
    disabled.props.onClick();
    assert.equal(wall(h.render()).props.reorderMode, undefined);
  }
  const web = profileHarness('', { presentation: 'web', projects: reorderProjects });
  assert.equal(reorderControl(web.render()), undefined);
  nodes(web.render()).find(node => node.props?.['aria-label'] === 'Manage profile').props.onClick();
  nodes(web.render()).find(node => node.type === 'button' && React.Children.toArray(node.props.children).includes('Reorder projects')).props.onClick();
  assert.equal(wall(web.render()).props.reorderMode.enabled, true);
});

test('three-dot reorder entry keeps duplicate outside saves and retry recovery intact', async () => {
  let resolveSave;
  let saves = 0;
  let retries = 0;
  const h = profileHarness('', { presentation: 'mobile', projects: reorderProjects,
    projectOrder: { commit() { saves++; return new Promise(resolve => { resolveSave = resolve; }); }, retry: async () => { retries++; return true; } } });
  reorderControl(openProfileOptions(h)).props.onClick();
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
