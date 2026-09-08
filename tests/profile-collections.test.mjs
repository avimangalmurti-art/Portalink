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
const routes = compile('../src/app/routes.ts', () => ({ navigationDestinations: [] }));
const placeholder = new Proxy({}, { get: (_, key) => key });
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}

function serviceHarness(owner = 'owner', failure = null) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'account' } }, error: null }) },
    from(table) {
      const operations = [];
      const query = {};
      for (const method of ['select', 'eq', 'order', 'range', 'in']) query[method] = (...args) => { operations.push([method, ...args]); return query; };
      query.maybeSingle = async () => ({ data: { id: owner }, error: null });
      query.then = (done) => {
        calls.push({ table, operations });
        if (table === 'profiles') return Promise.resolve({ data: [{ id: 'person', name: 'Person Name', avatar_url: 'avatar.jpg' }], error: null }).then(done);
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

function profileHarness(search = '') {
  let params = new URLSearchParams(search);
  const navigation = [];
  const react = { ...React, useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect() {}, useRef: () => ({ current: null }), useMemo: (fn) => fn() };
  const { UserProfilePage } = compile('../src/components/UserProfilePage.tsx', (name) => {
    if (name === 'react') return react;
    if (name === 'react-router-dom') return { useSearchParams: () => [params, (update, options) => { params = update(params); navigation.push(options); }] };
    if (name.endsWith('/viewer')) return { canAuthor: (role) => role === 'owner', needsAccount: (role) => role === 'guest' };
    if (name.endsWith('/useProfileVisibility')) return { useProfileVisibility: () => ({ isPrivate: false }) };
    if (name.endsWith('/useFollowRequests')) return { useFollowRequests: () => ({ count: 0, requests: [] }) };
    if (name.endsWith('/useProfileConnections')) return { useProfileConnections: () => ({ items: [], counts: {}, loading: false, error: null, nextOffset: null }) };
    if (name.endsWith('/useProjectManagement')) return { useProjectManagement: () => ({ editor: { projectId: null } }) };
    if (name.endsWith('/useProfileProjectOrder')) return { useProfileProjectOrder: () => ({ order: [] }) };
    if (name.endsWith('/profileLinks')) return { mergeProfileLinks: () => [] };
    return placeholder;
  }, { URLSearchParams, window: { localStorage: { getItem: () => null } } });
  const profile = { id: 'owner', name: 'Owner', projects: [], categories: [{ id: 'photos', label: 'Photography', iconName: 'camera' }], stats: [] };
  return { navigation, search: () => params.toString(), render: () => UserProfilePage({ profile, viewerRole: 'owner', onBack() {}, onOpenProject() {} }) };
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
