import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const compile = (text, globals = {}) => { const exports = {}; vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { exports, ...globals }); return exports; };
const ast = path => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
const find = (tree, name) => { let found; const visit = node => { if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(tree) === name) found = node; ts.forEachChild(node, visit); }; visit(tree); assert.ok(found, name); return found; };
const serviceTree = () => ast('src/services/supabase/contentServices.ts');
const serviceMethod = (tree, name) => {
  const method = find(tree, 'supabaseDiscoveryService').initializer.properties.find(node => node.name?.getText(tree) === name);
  assert.ok(method, name);
  return method.getText(tree);
};

test('ordinary app routes including Home require an account while explicit public shares stay available', () => {
  const tree = ast('src/app/useAppRoute.ts'), declaration = find(tree, 'PROTECTED_ROUTE_KINDS');
  const { protectedKinds } = compile('exports.protectedKinds = ' + declaration.initializer.getText(tree));
  for (const kind of ['home', 'search', 'portalink', 'profile', 'category', 'project', 'activity', 'collaboration', 'item', 'studio', 'portals', 'messages', 'saved', 'notifications', 'insights', 'profileEditor']) assert.equal(protectedKinds.has(kind), true, kind);
  for (const kind of ['sharedProfile', 'sharedCategory', 'sharedProject', 'sharedCollaboration', 'controlCenter']) assert.equal(protectedKinds.has(kind), false, kind);
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

test('account search rejects signed-out, anonymous and failed user checks before reading profiles', async () => {
  const tree = serviceTree();
  for (const identity of [{ user: null }, { user: { id: 'anon', is_anonymous: true } }, { user: { id: 'old' }, error: { message: 'expired' } }]) {
    let checks = 0, queries = 0;
    const client = { auth: { getUser: async () => { checks++; return { data: { user: identity.user }, error: identity.error ?? null }; } }, from: () => { queries++; assert.fail('An account is required before a profile query'); } };
    const { requireDirectoryAccount } = sourceModule('src/services/supabase/requireDirectoryAccount.ts', { './client': { requireSupabase: () => client } });
    const { run } = compile('exports.run=({' + serviceMethod(tree, 'searchAccounts') + '}).searchAccounts;', { requireDirectoryAccount, requireSupabase: () => client });
    for (const query of ['creator', '']) await assert.rejects(run(query), /Create an account or sign in/);
    assert.equal(checks, 2); assert.equal(queries, 0);
  }
});

test('signed-in account search retains public-only fields, escaped filters and thirty-account pagination', async () => {
  const tree = serviceTree(), calls = [];
  const query = { select: fields => { calls.push(['fields', fields]); return query; }, eq: (...args) => { calls.push(['filter', ...args]); return query; }, or: value => { calls.push(['or', value]); return query; }, order: field => { calls.push(['order', field]); return query; }, range: async (...args) => { calls.push(['range', ...args]); return { data: [{ id: 'creator', name: 'Name', handle: 'name', avatar_url: null, location: 'Place' }], error: null }; } };
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'account' } }, error: null }) }, from: table => { calls.push(['table', table]); return query; } };
  const { requireDirectoryAccount } = sourceModule('src/services/supabase/requireDirectoryAccount.ts', { './client': { requireSupabase: () => client } });
  const { run } = compile('exports.run=({' + serviceMethod(tree, 'searchAccounts') + '}).searchAccounts;', { requireDirectoryAccount, requireSupabase: () => client });
  const result = await run('@name%_', 30);
  assert.deepEqual(calls, [['table', 'profiles'], ['fields', 'id,name,handle,headline,avatar_url,location'], ['filter', 'is_private', false], ['or', String.raw`name.ilike."%name\\%\\_%",handle.ilike."%name\\%\\_%"`], ['order', 'name'], ['order', 'id'], ['range', 30, 59]]);
  assert.equal(result[0].kind, '@name'); assert.equal(result[0].isPrivate, false);
});

test('Home and discovery reject signed-out, anonymous and failed sessions before RPC or table reads', async () => {
  const tree = serviceTree(), fn = find(tree, 'discoveryContext');
  for (const identity of [{ user: null }, { user: { id: 'anon', is_anonymous: true } }, { user: { id: 'account' }, error: { message: 'offline' } }]) {
    let reads = 0;
    const forbidden = () => { reads++; assert.fail('Feed and directory reads require an account'); };
    const client = { auth: { getSession: async () => ({ data: { session: identity.user ? { user: identity.user } : null }, error: identity.error ?? null }) }, from: forbidden, rpc: forbidden };
    const { run } = compile(fn.getText(tree) + '\nexports.run=discoveryContext;', { requireSupabase: () => client, readFeedPage: forbidden, allPublicProjectIds: forbidden, latestProjectIds: forbidden });
    for (const scope of ['home', 'global']) for (const cursor of [undefined, { id: 'later', publishedAt: '2026-10-01' }]) await assert.rejects(run(scope, cursor), identity.error ? /session could not be checked/ : /Create an account or sign in/);
    assert.equal(reads, 0);
  }
});

test('feed preference writes reject signed-out, anonymous and failed sessions before mutation or reload', async () => {
  const tree = serviceTree();
  for (const identity of [{ user: null }, { user: { id: 'anon', is_anonymous: true } }, { user: { id: 'account' }, error: { message: 'offline' } }]) {
    let writes = 0, reloads = 0;
    const client = { auth: { getSession: async () => ({ data: { session: identity.user ? { user: identity.user } : null }, error: identity.error ?? null }) }, from: () => { writes++; assert.fail('Feed preferences require an account'); } };
    const { run } = compile('exports.run=({' + serviceMethod(tree, 'setHomeFeedMode') + '}).setHomeFeedMode;', { requireSupabase: () => client, discoveryContext: () => { reloads++; assert.fail('A rejected write cannot reload the feed'); } });
    await assert.rejects(run('latest'), identity.error ? /session could not be checked/ : /Create an account or sign in/);
    assert.equal(writes, 0); assert.equal(reloads, 0);
  }
});

test('signed-in feed preference writes preserve the existing optional-table fallback and surface other failures', async () => {
  const tree = serviceTree(), missingTable = find(tree, 'isMissingDiscoveryTable');
  for (const error of [null, { code: 'PGRST205', message: 'Missing discovery_preferences' }, { code: '42501', message: 'permission denied' }]) {
    const writes = [], reloads = [];
    const context = { availableProjects: ['project'], sphere: 'sphere', nextCursor: 'next' };
    const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'account' } } }, error: null }) }, from: table => ({ upsert: async (...args) => { writes.push([table, ...args]); return { error }; } }) };
    const { run, readMode } = compile(missingTable.getText(tree) + '\nlet fallbackHomeFeedMode="balanced"; exports.readMode=()=>fallbackHomeFeedMode; exports.run=({' + serviceMethod(tree, 'setHomeFeedMode') + '}).setHomeFeedMode;', { requireSupabase: () => client, discoveryContext: async scope => { reloads.push(scope); return context; }, rankHomeProjects: (projects, sphere, _now, mode) => { assert.equal(projects, context.availableProjects); assert.equal(sphere, 'sphere'); return { mode }; } });
    if (error?.code === '42501') { await assert.rejects(run('latest'), /permission denied/); assert.deepEqual(reloads, []); }
    else { const result = await run('latest'); assert.equal(result.mode, 'latest'); assert.equal(result.nextCursor, 'next'); assert.deepEqual(reloads, ['home']); }
    assert.deepEqual(JSON.parse(JSON.stringify(writes)), [['discovery_preferences', { account_id: 'account', home_mode: 'latest' }, { onConflict: 'account_id' }]]);
    assert.equal(readMode(), error?.code === 'PGRST205' ? 'latest' : 'balanced');
  }
});
