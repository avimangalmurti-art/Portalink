import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const compile = (text, globals = {}) => { const exports = {}; vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports, ...globals }); return exports; };
const ast = path => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
const find = (tree, name) => { let found; const visit = node => { if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(tree) === name) found = node; ts.forEachChild(node, visit); }; visit(tree); assert.ok(found, name); return found; };
const elements = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(elements)] : [];
const preview = sourceModule('src/features/discovery/guestPreview.ts');

test('ordinary app routes require an account while Home and explicit public shares stay available', () => {
  const tree = ast('src/app/useAppRoute.ts'), declaration = find(tree, 'PROTECTED_ROUTE_KINDS');
  const { protectedKinds } = compile('exports.protectedKinds = ' + declaration.initializer.getText(tree));
  for (const kind of ['search', 'portalink', 'profile', 'category', 'project', 'activity', 'collaboration', 'item', 'studio', 'portals', 'messages', 'saved']) assert.equal(protectedKinds.has(kind), true, kind);
  for (const kind of ['home', 'sharedProfile', 'sharedCategory', 'sharedProject', 'sharedCollaboration', 'controlCenter']) assert.equal(protectedKinds.has(kind), false, kind);
});

test('guest ordinary profile reads are disabled before the profile query can request records', () => {
  const tree = ast('src/App.tsx'), declaration = find(tree, 'ordinaryProfileQuery');
  for (const signedIn of [false, true]) {
    let requested;
    compile('const result = ' + declaration.initializer.getText(tree), { isSharedRoute: false, auth: { isAuthenticated: signedIn }, viewedProfileId: 'creator', route: { kind: 'profile' }, routeCategoryId: null, useProfileProjectQuery: id => { requested = id; } });
    assert.equal(requested, signedIn ? 'creator' : null);
  }
});

test('a guest project selection opens signup and preserves the intended project without navigation or resolution', () => {
  const tree = ast('src/App.tsx'), fn = find(tree, 'openProjectById'), intents = [];
  const { run } = compile(fn.getText(tree) + '\nexports.run=openProjectById;', {
    auth: { isAuthenticated: false, requestAuthenticatedDestination: (...args) => intents.push(args) }, isSharedRoute: false,
    buildPath: (_kind, ids) => '/p/' + ids.profileId + '/c/' + ids.categoryId + '/' + ids.projectId,
    nav: { project: () => assert.fail('Guest must not navigate') }, projectNavigation: { resolveProject: () => assert.fail('Guest must not resolve content') },
  });
  run('project', { profileId: 'creator', categoryId: 'portal' });
  assert.equal(intents[0][0].path, '/p/creator/c/portal/project'); assert.equal(intents[0][1], 'signUp');
});

test('directory service requests reject signed-out, anonymous and failed identities before profile reads', async () => {
  const tree = ast('src/services/supabase/contentServices.ts');
  const service = find(tree, 'supabaseDiscoveryService').initializer;
  const search = service.properties.find(node => node.name?.getText(tree) === 'searchAccounts');
  for (const identity of [{ user: null }, { user: { id: 'anon', is_anonymous: true } }, { user: { id: 'old' }, error: { message: 'expired' } }, { user: { id: 'account' } }]) {
    let queries = 0;
    const client = { auth: { getUser: async () => ({ data: { user: identity.user }, error: identity.error ?? null }) }, from() {
      queries++; const q = { select: () => q, eq: () => q, or: () => q, order: () => q, range: async () => ({ data: [], error: null }) }; return q;
    } };
    const { requireDirectoryAccount } = sourceModule('src/services/supabase/requireDirectoryAccount.ts', { './client': { requireSupabase: () => client } });
    const { run } = compile('exports.run=({' + search.getText(tree) + '}).searchAccounts;', { requireDirectoryAccount, requireSupabase: () => client });
    if (!identity.user || identity.user.is_anonymous || identity.error) { await assert.rejects(run('creator'), /Create an account/); assert.equal(queries, 0); }
    else { await run('creator'); assert.equal(queries, 1); }
  }
});

function guestFeed({ cursor, scope = 'home', missing = false, sessionError = null } = {}) {
  const tree = ast('src/services/supabase/contentServices.ts'), fn = find(tree, 'discoveryContext'), calls = [];
  const { run } = compile(fn.getText(tree) + '\nexports.run=discoveryContext;', {
    GUEST_HOME_PROJECT_LIMIT: 12,
    requireSupabase: () => ({ auth: { getSession: async () => ({ data: { session: null }, error: sessionError }) }, from: () => assert.fail('Guest preview must not enumerate profiles') }),
    readFeedPage: async (...args) => { calls.push(args); return missing ? null : { rows: Array.from({ length: 30 }, (_, id) => ({ project: { id: String(id) } })), nextCursor: { id: 'more' } }; },
    feedViews: async (rows, covers) => { assert.equal(covers, true); return rows; }, buildUserContentSphere: input => input,
  });
  return { calls, result: run(scope, cursor) };
}

test('guest Home returns only twelve real public covers and no next page', async () => {
  const h = guestFeed(), result = await h.result;
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][0], 'global'); assert.equal(h.calls[0][2], 12);
  assert.equal(result.availableProjects.length, 12); assert.equal(result.feedRows.length, 12); assert.equal(result.nextCursor, null);
  const next = guestFeed({ cursor: { id: 'more' } }); assert.equal((await next.result).availableProjects.length, 0); assert.equal(next.calls.length, 0);
});

test('guest discovery, missing RPC and session failures never expand into a directory fallback', async () => {
  const global = guestFeed({ scope: 'global' }); await assert.rejects(global.result, /Create an account/); assert.equal(global.calls.length, 0);
  await assert.rejects(guestFeed({ missing: true }).result, /temporarily unavailable/);
  const failed = guestFeed({ sessionError: { message: 'offline' } }); await assert.rejects(failed.result, /session could not be checked/); assert.equal(failed.calls.length, 0);
});

test('preview uses twelve unique static cover controls and retains account actions for empty/error states', () => {
  const { GuestHomePreview } = sourceModule('src/components/home/GuestHomePreview.tsx', {
    react: React, '../media/ProjectCover': { ProjectCover: 'project-cover' }, '../../utils/projectPresentation': { getProjectCoverPreview: () => undefined },
    '../../features/discovery/guestPreview': preview, '../ui/StateViews': { EmptyState: 'empty', ErrorState: 'error', LoadingState: 'loading' }, './guest-home-preview.css': {},
  });
  const calls = [], projects = Array.from({ length: 30 }, (_, id) => ({ project: { id: String(id), title: 'Project ' + id, cover: 'cover-' + id, coverKind: 'image' }, creator: { id: 'creator' } }));
  const props = { projects: [...projects, projects[0]], loading: false, onRetry() {}, onCreate: () => calls.push('create'), onSignIn: () => calls.push('signin'), onOpenProject: view => calls.push(view.project.id), scrollRef: { current: null }, onScroll() {} };
  const nodes = elements(GuestHomePreview(props));
  assert.equal(nodes.filter(node => node.props.role === 'listitem').length, 12);
  const covers = nodes.filter(node => node.type === 'project-cover'); assert.equal(covers.length, 12);
  assert.ok(covers.every(node => node.props.allowPdfFallback === false && node.props.allowVideoFallback === false));
  nodes.find(node => node.props.className === 'guest-home-project').props.onClick(); assert.equal(calls.at(-1), '0');
  for (const extra of [{ projects: [], loading: true }, { projects: [], error: 'offline' }, { projects: [] }]) {
    const view = elements(GuestHomePreview({ ...props, ...extra }));
    view.find(node => node.props.className === 'guest-home-create').props.onClick(); assert.equal(calls.at(-1), 'create');
    assert.equal(view.some(node => node.props.className === 'guest-home-project'), false);
  }
});
