import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Error, require(name) {
    if (!(name in imports)) throw new Error(`Missing import: ${name}`);
    return imports[name];
  } });
  return exports;
}
const routes = load('../src/app/routes.ts', { '../components/navigation': { navigationDestinations: [] } });
const savedPageKey = target => JSON.stringify([target.projectId, target.attachmentId, target.pageIndex]);
const model = load('../src/features/studio/studioModel.ts', {
  '../../app/routes': routes, '../library/savedPages': { savedPageKey },
});
const oldProject = { id: 'old', categoryId: 'cat', title: 'Old work', summary: 'Red buildings', publishedAt: '2026-01-01T00:00:00Z' };
const newProject = { ...oldProject, id: 'new', title: 'New work', publishedAt: '2026-02-01T00:00:00Z' };
const creator = { id: 'creator', name: 'Ava', handle: '@ava', headline: 'Designer', projects: [oldProject, newProject], categories: [{ id: 'cat', label: 'Architecture' }] };
const notification = { id: 'note', body: 'A reply to Red buildings', timestamp: '2026-02-02T00:00:00Z', targetPath: '/messages?conversation=one', isUnread: true, kind: 'reply' };
const target = { projectId: 'old', attachmentId: 'cover', pageIndex: 0, savedAt: '2026-03-01T00:00:00Z' };
const pageEntry = { target, presentation: null };

test('Studio sorts own published work by publication time and keeps collection identities distinct', () => {
  const own = model.publishedStudioRows(creator);
  assert.deepEqual(Array.from(own, row => row.project.id), ['new', 'old']);
  const saved = model.savedProjectStudioRows([{ project: oldProject, creator }])[0];
  assert.equal(saved.id, 'saved-project:old');
  assert.notEqual(saved.id, own[1].id);
  assert.equal(saved.date, oldProject.publishedAt);
  assert.equal(model.savedCreatorStudioRows([{ id: creator.id, profile: creator }])[0].date, undefined);
  assert.equal(model.savedPageStudioRows([pageEntry])[0].date, undefined);
  assert.equal(model.publishedStudioRows({...creator,projects:[{...oldProject,madeOn:'2025-10-06'}]})[0].date,'2025-10-06');
});

test('Studio All retains every saved kind and an explicit unavailable Drafts explanation', () => {
  const rows = [...model.publishedStudioRows(creator), ...model.savedProjectStudioRows([{ project: oldProject, creator }]),
    ...model.savedPageStudioRows([pageEntry]), ...model.savedCreatorStudioRows([{ id: creator.id, profile: creator }]), ...model.activityStudioRows([notification])];
  const all = model.studioSections(rows, 'all', 'projects');
  assert.deepEqual(Array.from(all, section => section.id), ['drafts', 'published', 'bookmarks', 'activity']);
  assert.equal(all[0].rows.length, 0);
  assert.match(all[0].description, /Drafts cannot be listed here yet/);
  assert.match(all[0].description, /New project to resume a draft saved on this device/);
  assert.match(all[0].description, /Your first project on your profile/);
  assert.equal(all[2].rows.length, 3);
  assert.equal(model.studioSections(rows, 'bookmarks', 'pages')[0].rows[0].kind, 'saved-page');
  assert.equal(model.studioCategory('unknown'), 'all');
  assert.equal(model.studioBookmarkTab('unknown'), 'projects');
  assert.equal(model.filterStudioRows(rows, 'red buildings').length, 3);
});

test('Studio actions never promise unsupported draft/unread or unavailable bookmark navigation', () => {
  assert.deepEqual(Array.from(model.studioRowActions(model.savedPageStudioRows([pageEntry])[0])), ['unsave']);
  assert.deepEqual(Array.from(model.studioRowActions(model.savedCreatorStudioRows([{ id: 'gone', profile: null }])[0])), ['unsave']);
  const activity = model.activityStudioRows([notification])[0];
  assert.deepEqual(Array.from(model.studioRowActions(activity)), ['open', 'mark-read']);
  assert.deepEqual(Array.from(model.studioRowActions({ ...activity, notification: { ...notification, isUnread: false } })), ['open']);
  assert.ok(model.studioRowActions(model.publishedStudioRows(creator)[0]).includes('edit'));
});

test('shared page loader deduplicates canonical reads, preserves unavailable entries, and propagates real failures', async () => {
  const absent = { ...target, projectId: 'gone' };
  const queries = load('../src/features/library/collectionQueries.ts', {
    '../../types/profile': {},
    './savedPages': {
      listSavedPages: async () => ({ items: [target, { ...target, pageIndex: 1 }, absent], nextCursor: 'next' }),
      savedPagePresentation: (_target, view) => view ?? null,
    },
  });
  const requested = [];
  const batch = await queries.loadSavedPageBatch({ getProjectView: async id => {
    requested.push(id);
    if (id === 'gone') throw { code: 'not_found' };
    return { project: oldProject, creator };
  } }, null);
  assert.deepEqual(requested, ['old', 'gone']); assert.equal(batch.nextCursor, 'next');
  assert.equal(batch.items.length, 3); assert.equal(batch.items[2].presentation, null);
  await assert.rejects(queries.loadSavedPageBatch({ getProjectView: async () => { throw Error('offline'); } }, null), /offline/);
});

test('shared creator loader only treats canonical not-found as unavailable', async () => {
  class ProfileServiceError extends Error { constructor(code) { super(code); this.code = code; } }
  const queries = load('../src/features/library/collectionQueries.ts', { '../../types/profile': { ProfileServiceError }, './savedPages': {} });
  const list = await queries.loadSavedCreators({ listSavedCreatorIds: async () => ['creator', 'gone'] }, {
    getProfile: async id => { if (id === 'gone') throw new ProfileServiceError('not_found'); return creator; },
  });
  assert.equal(list[0].profile, creator); assert.equal(list[1].profile, null);
  await assert.rejects(queries.loadSavedCreators({ listSavedCreatorIds: async () => ['creator'] }, {
    getProfile: async () => { throw new ProfileServiceError('network'); },
  }), /network/);
});

test('account query timestamps successful responses and hides a prior account while the new read waits', async () => {
  const first = deferred(), second = deferred();
  const auth = { user: { id: 'one' } };
  const query = () => auth.user.id === 'one' ? first.promise : second.promise;
  const hook = hookHarness(new URL('../src/features/library/useAccountQuery.ts', import.meta.url), 'useAccountQuery', {}, auth, [query]);
  await hook.flush(); assert.equal(hook.value.fetchedAt, null);
  first.resolve('private one'); await hook.flush();
  assert.equal(hook.value.data, 'private one'); assert.ok(Number.isFinite(hook.value.fetchedAt));
  auth.user = { id: 'two' }; hook.rerender();
  assert.equal(hook.value.data, undefined); assert.equal(hook.value.fetchedAt, null);
  second.reject(Error('offline')); await hook.flush();
  assert.equal(hook.value.error, 'offline'); assert.equal(hook.value.fetchedAt, null);
  hook.dispose();
});

test('notification completion reports failure and stale account work cannot mark a new account read', async () => {
  const write = deferred();
  const auth = { user: { id: 'one' } };
  const service = { listNotifications: async () => [notification], subscribeToNotifications: () => () => {}, markRead: () => write.promise };
  const hook = hookHarness(new URL('../src/features/messages/useNotifications.ts', import.meta.url), 'useNotifications', { notifications: service }, auth);
  await hook.flush(); assert.ok(Number.isFinite(hook.value.updatedAt));
  const action = hook.value.markRead('note');
  auth.user = { id: 'two' }; hook.rerender(); assert.equal(hook.value.notifications.length, 0);
  await hook.flush(); write.resolve(); assert.equal(await action, false);
  assert.equal(hook.value.notifications[0].isUnread, true);
  service.markRead = async () => { throw Error('write failed'); };
  assert.equal(await hook.value.markRead('note'), false); await hook.flush();
  assert.match(hook.value.mutationError, /could not be marked/);
  hook.dispose();
});

test('foreground activity refresh disables row and bulk reads until the current fetch settles', async () => {
  const response = deferred(); let reads = 0; let rowWrites = 0; let allWrites = 0;
  const service = {
    listNotifications: () => ++reads === 1 ? Promise.resolve([notification]) : response.promise,
    subscribeToNotifications: () => () => {},
    markRead: async () => { rowWrites++; }, markAllRead: async () => { allWrites++; },
  };
  const hook = hookHarness(new URL('../src/features/messages/useNotifications.ts', import.meta.url), 'useNotifications', { notifications: service }, { user: { id: 'one' } });
  await hook.flush();
  const retainedRead = hook.value.markRead;
  hook.value.retry();
  // This retained callback has not re-rendered with the loading state yet.
  assert.equal(await retainedRead('note'), false);
  await hook.flush();
  assert.equal(hook.value.status, 'loading'); assert.ok(hook.value.pendingIds.has('note')); assert.equal(hook.value.isMarkingAll, true);
  assert.equal(await hook.value.markRead('note'), false); await hook.value.markAllRead();
  assert.equal(rowWrites, 0); assert.equal(allWrites, 0);
  response.resolve([notification]); await hook.flush();
  assert.equal(hook.value.status, 'success'); assert.equal(hook.value.pendingIds.size, 0); assert.equal(hook.value.isMarkingAll, false);
  assert.equal(await hook.value.markRead('note'), true); await hook.flush();
  assert.equal(rowWrites, 1); assert.equal(hook.value.notifications[0].isUnread, false); hook.dispose();
});

test('a pending notification acknowledgement cannot start a foreground refresh that it would invalidate', async () => {
  const write = deferred(); const refreshed = deferred(); let reads = 0;
  const service = {
    listNotifications: () => ++reads === 1 ? Promise.resolve([notification]) : refreshed.promise,
    subscribeToNotifications: () => () => {}, markRead: () => write.promise,
  };
  const hook = hookHarness(new URL('../src/features/messages/useNotifications.ts', import.meta.url), 'useNotifications', { notifications: service }, { user: { id: 'one' } });
  await hook.flush(); const retry = hook.value.retry;
  const marking = hook.value.markRead('note'); retry(); await hook.flush();
  assert.equal(reads, 1); assert.equal(hook.value.status, 'success'); assert.ok(hook.value.pendingIds.has('note'));
  write.resolve(); assert.equal(await marking, true); await hook.flush();
  hook.value.retry(); await hook.flush(); assert.equal(reads, 2); assert.equal(hook.value.status, 'loading');
  refreshed.resolve([{ ...notification, isUnread: false }]); await hook.flush();
  assert.equal(hook.value.status, 'success'); hook.dispose();
});

function studioHarness({ more = async () => ({ items: [], nextCursor: null }), remove = async () => {}, unsave = async () => ({}) } = {}) {
  const auth = { user: { id: 'one' }, viewerProfileId: creator.id, isAuthenticated: true };
  const queries = [{ data: creator, loading: false, fetchedAt: 100, retry() {} },
    { data: [{ id: creator.id, profile: creator }], loading: false, fetchedAt: 150, retry() {} },
    { data: { items: [pageEntry], nextCursor: 'cursor-one' }, loading: false, fetchedAt: 200, retry() {} }];
  let queryIndex = 0;
  const refreshed = [];
  const services = { profiles: {}, projects: {}, creatorSaves: { setCreatorSave: async () => true }, engagement: { setEngagement: unsave } };
  const hook = hookHarness(new URL('../src/features/studio/useStudioData.ts', import.meta.url), 'useStudioData', services, auth, ['all', 'projects'], { revision: 0 }, {
    '../../contexts/EngagementContext': { useEngagementStore: () => ({ refresh: id => refreshed.push(id) }) },
    '../engagement/useActivityCollection': { useActivityCollection: () => ({ phase: 'ready', items: [{ project: oldProject, creator }], updatedAt: 125, retry() {} }) },
    '../library/useAccountQuery': { useAccountQuery: () => queries[queryIndex++ % 3] },
    '../library/collectionQueries': { loadSavedCreators() {}, loadSavedPageBatch: (_projects, cursor) => more(cursor) },
    '../library/savedPages': { savedPageKey, removeSavedPage: remove },
    '../messages/useNotifications': { useNotifications: () => ({ status: 'success', notifications: [notification], updatedAt: 175, pendingIds: new Set(), markRead: async () => true, retry() {} }) },
    './studioModel': model,
  });
  return { hook, auth, queries, refreshed };
}

test('Studio saved-page pagination retains prior rows, deduplicates targets, and preserves a failed cursor for retry', async () => {
  let fail = true;
  const nextEntry = { target: { ...target, pageIndex: 1 }, presentation: null };
  const cursors = [];
  const { hook } = studioHarness({ more: async cursor => { cursors.push(cursor); if (fail) throw Error('offline'); return { items: [pageEntry, nextEntry], nextCursor: null }; } });
  await hook.flush(); assert.equal(hook.value.updatedAt, 100); assert.equal(hook.value.hasMore, true);
  await hook.value.loadMore(); await hook.flush();
  assert.equal(hook.value.loadMoreError, 'offline'); assert.equal(hook.value.rows.filter(row => row.kind === 'saved-page').length, 1);
  hook.options(['published', 'projects']); await hook.flush(); assert.equal(hook.value.loadMoreError, null); assert.equal(hook.value.hasMore, false);
  hook.options(['bookmarks', 'pages']); await hook.flush(); assert.equal(hook.value.loadMoreError, 'offline');
  fail = false; await hook.value.loadMore(); await hook.flush();
  assert.deepEqual(cursors, ['cursor-one', 'cursor-one']);
  assert.equal(hook.value.rows.filter(row => row.kind === 'saved-page').length, 2);
  assert.equal(hook.value.hasMore, false); hook.dispose();
});

test('Studio ignores obsolete pages after refresh and prevents stale unsave callbacks after an account change', async () => {
  const more = deferred(); let mutations = 0;
  const { hook, auth, queries } = studioHarness({ more: () => more.promise, unsave: async () => { mutations++; } });
  await hook.flush(); const oldUnsave = hook.value.unsave; const saved = hook.value.rows.find(row => row.kind === 'saved-project');
  const loadMore = hook.value.loadMore(); await hook.flush();
  queries[2].data = { items: [], nextCursor: null }; hook.rerender(); await hook.flush();
  more.resolve({ items: [pageEntry], nextCursor: null }); await loadMore; await hook.flush();
  assert.equal(hook.value.rows.filter(row => row.kind === 'saved-page').length, 0);
  auth.user = { id: 'two' }; hook.rerender(); await hook.flush();
  assert.equal(await oldUnsave(saved), false); assert.equal(mutations, 0); hook.dispose();
});

test('Studio project unsave refreshes canonical engagement and only removes a row after success', async () => {
  let fail = true;
  const { hook, refreshed } = studioHarness({ unsave: async () => { if (fail) throw Error('refused'); } });
  await hook.flush(); const row = hook.value.rows.find(item => item.kind === 'saved-project');
  assert.equal(await hook.value.unsave(row), false); await hook.flush();
  assert.ok(hook.value.rows.some(item => item.id === row.id)); assert.equal(hook.value.mutationError, 'refused');
  fail = false; assert.equal(await hook.value.unsave(row), true); await hook.flush();
  assert.equal(hook.value.rows.some(item => item.id === row.id), false); assert.deepEqual(refreshed, ['old']); hook.dispose();
});
