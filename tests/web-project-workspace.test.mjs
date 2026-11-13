import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('  const confirmedWebReader ='), source.indexOf('  // Pointer, touch, or keyboard intent'));
const readiness = source.slice(source.indexOf('  const isOwnerProfileRefreshing ='), source.indexOf('  // An account can exist without a profile'));
assert.ok(block && readiness);
const file = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let pendingCondition;
function visit(node) {
  if (ts.isConditionalExpression(node)
    && node.condition.getText(file).includes('viewedProfileQuery.status')
    && node.whenTrue.getText(file).includes('label="Opening profile…"')) pendingCondition = node.condition.getText(file);
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(pendingCondition, 'The route owns its existing initial profile-loading surface');
const { canAccessProfile } = sourceModule('src/domain/contentPlacement.ts');
const compiled = ts.transpileModule(`function render(input) {
  const { presentation, auth, follows, route, routeProfileId, routeCategoryId, activeProjectId, viewedProfileQuery, isSharedRoute } = input;
  ${block}
  ${readiness}
  return { viewedProfile, isWebReaderLoading, isProfileRouteReady, activeCategoryId, wholeWorkspaceLoading: Boolean(${pendingCondition}) };
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture() {
  let reference;
  const profile = { id: 'creator', isPrivate: false, categories: [{ id: 'portal' }], projects: [
    { id: 'alpha', categoryId: 'portal' }, { id: 'beta', categoryId: 'portal' }, { id: 'elsewhere', categoryId: 'another' },
  ] };
  const state = { presentation: 'web', auth: { isAuthenticated: true, isInitializing: false, phase: 'authenticated', user: { id: 'account' }, viewerProfileId: 'creator' },
    follows: { isResolving: false, isFollowing: false }, route: { kind: 'project' }, routeProfileId: 'creator', routeCategoryId: 'portal', activeProjectId: 'alpha',
    viewedProfileQuery: { status: 'ready', profile }, isSharedRoute: false };
  const render = vm.runInNewContext(`${compiled}; render`, { canAccessProfile, useRef(initial) { return reference ??= { current: initial }; } });
  return { profile, state, render(changes = {}) { Object.assign(state, changes); return render(state); },
    pending(changes = {}) { return this.render({ activeProjectId: 'beta', viewedProfileQuery: { status: 'loading', profile: null }, ...changes }); } };
}

test('WEB same-portal uncached selection retains only its confirmed workspace until media resolves', () => {
  const h = fixture();
  h.render();
  let result = h.pending();
  assert.equal(result.viewedProfile, h.profile);
  assert.equal(result.isWebReaderLoading, true);
  assert.equal(result.isProfileRouteReady, true);
  assert.equal(result.activeCategoryId, 'portal');
  assert.equal(result.wholeWorkspaceLoading, false);
  const resolved = { ...h.profile, projects: [...h.profile.projects, { id: 'new', categoryId: 'portal' }] };
  result = h.render({ viewedProfileQuery: { status: 'ready', profile: resolved } });
  assert.equal(result.viewedProfile, resolved);
  assert.equal(result.isWebReaderLoading, false);
  assert.equal(result.isProfileRouteReady, true);
});

test('first entry and unknown or differently placed projects keep truthful route loading', () => {
  const first = fixture(), firstResult = first.pending();
  assert.equal(firstResult.viewedProfile, null);
  assert.equal(firstResult.isWebReaderLoading, false);
  assert.equal(firstResult.wholeWorkspaceLoading, true);
  for (const activeProjectId of ['unknown', 'elsewhere']) {
    const h = fixture(); h.render();
    const result = h.pending({ activeProjectId });
    assert.equal(result.viewedProfile, null);
    assert.equal(result.isWebReaderLoading, false);
    assert.equal(result.wholeWorkspaceLoading, true);
  }
});

test('WEB retention is immediately masked across account, creator, portal, route and presentation boundaries', () => {
  for (const change of [
    { presentation: 'mobile' }, { routeProfileId: 'other' }, { routeCategoryId: 'another' }, { route: { kind: 'profile' } },
    { isSharedRoute: true }, { auth: { user: { id: 'another' }, viewerProfileId: 'creator', isAuthenticated: true, phase: 'authenticated' } },
    { auth: { user: { id: 'account' }, viewerProfileId: 'other', isAuthenticated: true, phase: 'authenticated' } },
    { auth: { user: { id: 'account' }, viewerProfileId: 'creator', isAuthenticated: true, phase: 'authenticating' } },
    { auth: { user: { id: 'account' }, viewerProfileId: 'creator', isAuthenticated: true, phase: 'signing-out' } },
    { auth: { user: { id: 'account' }, viewerProfileId: 'creator', isAuthenticated: true, phase: 'authenticated', isInitializing: true } },
    { auth: { user: null, viewerProfileId: null, isAuthenticated: false, phase: 'unauthenticated' } },
  ]) {
    const h = fixture(); h.render();
    const original = { ...h.state };
    const result = h.pending(change);
    assert.equal(result.viewedProfile, null, JSON.stringify(change));
    assert.equal(result.isWebReaderLoading, false);
    const returned = h.render({ ...original, activeProjectId: 'beta', viewedProfileQuery: { status: 'loading', profile: null } });
    assert.equal(returned.isWebReaderLoading, false, 'Leaving a scope discards its retained record');
  }
});

test('query errors, not-found and idle clear retention instead of reviving stale content on retry', () => {
  for (const status of ['error', 'not-found', 'idle']) {
    const h = fixture(); h.render(); h.pending();
    const result = h.render({ viewedProfileQuery: { status, profile: null } });
    assert.equal(result.viewedProfile, null);
    assert.equal(result.isWebReaderLoading, false);
    assert.equal(h.pending().isWebReaderLoading, false);
  }
});

test('private access is rechecked and shared hidden work is never retained', () => {
  const owner = fixture(); owner.profile.isPrivate = true; owner.render();
  assert.equal(owner.pending().isWebReaderLoading, true, 'An authenticated owner retains their confirmed index');
  for (const follows of [{ isFollowing: false, isResolving: false }, { isFollowing: true, isResolving: true }]) {
    const h = fixture(); h.profile.isPrivate = true;
    h.state.auth.viewerProfileId = 'follower'; h.state.follows = { isFollowing: true, isResolving: false }; h.render();
    assert.equal(h.pending().isWebReaderLoading, true);
    assert.equal(h.render({ follows }).isWebReaderLoading, false);
    assert.equal(h.render({ follows: { isFollowing: true, isResolving: false } }).isWebReaderLoading, false, 'Lost or unresolved access discards the old record');
  }
  const shared = fixture(); shared.state.isSharedRoute = true; shared.state.route.kind = 'sharedProject';
  shared.profile.projects[1].isPubliclyVisible = false; shared.render();
  assert.equal(shared.pending().isWebReaderLoading, false);
  const privateShared = fixture(); privateShared.state.isSharedRoute = true; privateShared.state.route.kind = 'sharedProject';
  privateShared.profile.isPrivate = true; privateShared.render();
  assert.equal(privateShared.pending().isWebReaderLoading, false);
});

test('a successful query for another identity, portal or selected project cannot seed a confirmed reader', () => {
  for (const changed of [
    profile => ({ ...profile, id: 'other' }), profile => ({ ...profile, categories: [] }), profile => ({ ...profile, projects: [] }),
  ]) {
    const h = fixture(); h.render({ viewedProfileQuery: { status: 'ready', profile: changed(h.profile) } });
    assert.equal(h.pending().isWebReaderLoading, false);
  }
});
