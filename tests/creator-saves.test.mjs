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

test('footer utilities have real routes and selected states in both sidebar sizes', () => {
  const source = read('../src/components/Sidebar.tsx');
  const start = source.indexOf('function PersonalFooterLinks');
  const end = source.indexOf('function SettingsTrigger', start);
  const component = source.slice(start, end).replace('function PersonalFooterLinks', 'export function PersonalFooterLinks');
  const code = ts.transpileModule(component, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, React, BellIcon: icons.BellIcon, BarChart3Icon: icons.BarChart3Icon, buildPath: routes.buildPath,
    Link: ({ to, ...props }) => React.createElement('a', { ...props, href: to }), InterfaceIcon: () => React.createElement('svg') });
  for (const collapsed of [true, false]) {
    const html = renderToStaticMarkup(React.createElement(exports.PersonalFooterLinks, { collapsed, activityActive: false, insightsActive: true }));
    assert.match(html, /href="\/notifications"/);
    assert.match(html, /href="\/insights"/);
    assert.match(html, /aria-label="Open Activity"/);
    assert.match(html, /aria-label="Open Insights"/);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  }
  assert.equal((source.match(/isAuthenticated && <PersonalFooterLinks/g) ?? []).length, 2);
  assert.doesNotMatch(read('../src/components/profile/SharedProfileSidebar.tsx'), /PersonalFooterLinks|CreatorSaveButton/);
});

test('saved library has distinct Projects and Creators collections with a private explanation', () => {
  const pages = load('../src/features/library/PersonalPages.tsx', {
    '../../presentation/usePresentation': { usePresentation: () => 'web' },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: ({ children }) => React.createElement(React.Fragment, null, children) },
    react: React, 'lucide-react': icons, 'react-router-dom': { Link: () => null, useSearchParams: () => [new URLSearchParams(), () => {}] },
    '../../app/routes': routes, '../../contexts/AuthContext': { useAuth: () => ({ isAuthenticated: true, user: { id: 'a' } }) },
    '../../contexts/ServicesContext': { useServices: () => ({}) },
    '../../components/profile/ActivityCollectionPage': { ActivityCollectionPage: ({ kind, embedded }) => React.createElement('div', { 'data-collection': kind, 'data-embedded': embedded }) },
    '../../components/profile/CreatorAvatar': {}, '../../components/ui/InterfaceIcon': { InterfaceIcon: () => null },
    '../../components/ui/StateViews': {}, '../../components/messages/InboxPanel': {}, '../../types/profile': {}, './useAccountQuery': {}, './SavedPagesCollection': {},
  });
  const html = renderToStaticMarkup(React.createElement(pages.SavedPage, { onBack() {}, onOpenProject() {} }));
  assert.match(html, /Projects/); assert.match(html, /Pages/); assert.match(html, /Creators/);
  assert.match(html, /private library/); assert.match(html, /does not follow/);
  assert.match(html, /data-collection="save" data-embedded="true"/);
});

test('shared profile stays minimal and owner header no longer duplicates Saved', () => {
  const profile = read('../src/components/UserProfilePage.tsx');
  assert.match(profile, /!showsOwnerTools && !isSharedView && <CreatorSaveButton/);
  assert.doesNotMatch(profile, /ENGAGEMENT_KINDS/);
  const accountQuery = read('../src/features/library/useAccountQuery.ts');
  assert.match(accountQuery, /result\?\.account === account && result\?\.query === query/);
  assert.match(accountQuery, /current = false/);
});
