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
const view = load('../src/features/studio/studioView.ts', { '../../app/routes': routes });
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
test('Published rows display made-on dates without changing publication ordering; bookmarks retain made-on dates',()=>{
 const profile={...creator,projects:[{...oldProject,madeOn:'2020-04-05'},{...newProject,madeOn:'2019-01-02'}]};
 const rows=model.publishedStudioRows(profile);assert.deepEqual(Array.from(rows,row=>row.project.id),['new','old']);assert.deepEqual(Array.from(rows,row=>row.date),['2019-01-02','2020-04-05']);assert.equal(model.savedProjectStudioRows([{project:profile.projects[0],creator:profile}])[0].date,'2020-04-05');
});

test('Studio retains separate collections and each saved kind without an aggregate collection', () => {
  const rows = [...model.publishedStudioRows(creator), ...model.savedProjectStudioRows([{ project: oldProject, creator }]),
    ...model.savedPageStudioRows([pageEntry]), ...model.savedCreatorStudioRows([{ id: creator.id, profile: creator }]), ...model.activityStudioRows([notification])];
  assert.deepEqual(Array.from(model.STUDIO_CATEGORIES), ['drafts', 'published', 'bookmarks', 'activity']);
  assert.deepEqual(Array.from(view.STUDIO_CATEGORIES), Array.from(model.STUDIO_CATEGORIES));
  const drafts = model.studioSections(rows, 'drafts', 'projects');
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].rows.length, 0);
  assert.match(drafts[0].description, /Drafts cannot be listed here yet/);
  assert.match(drafts[0].description, /New project to resume a draft saved on this device/);
  assert.match(drafts[0].description, /Your first project on your profile/);
  assert.deepEqual(Array.from(model.studioSections(rows, 'published', 'projects')[0].rows, row => row.kind), ['published', 'published']);
  assert.deepEqual(Array.from(model.studioSections(rows, 'activity', 'projects')[0].rows, row => row.kind), ['activity']);
  for (const [tab, kind] of [['projects', 'saved-project'], ['pages', 'saved-page'], ['creators', 'saved-creator']]) {
    const sections = model.studioSections(rows, 'bookmarks', tab);
    assert.deepEqual(Array.from(sections, section => section.id), ['bookmarks']);
    assert.deepEqual(Array.from(sections[0].rows, row => row.kind), [kind]);
  }
  assert.equal(model.studioBookmarkTab('unknown'), 'projects');
  assert.equal(model.filterStudioRows(rows, 'red buildings').length, 3);
});

test('legacy All locations and invalid categories fall back to Bookmarks while retaining saved tabs', () => {
  for (const category of [null, 'unknown', 'all']) assert.equal(model.studioCategory(category), 'bookmarks');
  for (const search of ['', 'category=all', 'collection=all', 'collection=all&category=published', 'collection=unknown']) {
    const location = view.readStudioLocation(new URLSearchParams(search));
    assert.equal(location.category, 'bookmarks');
    assert.equal(location.tab, 'projects');
  }
  const pages = view.readStudioLocation(new URLSearchParams('collection=all&tab=pages'));
  assert.equal(pages.category, 'bookmarks');
  assert.equal(pages.tab, 'pages');
  assert.equal(view.readStudioLocation(new URLSearchParams('collection=activity&category=all')).category, 'activity');
  assert.equal(view.readStudioLocation(new URLSearchParams('collection=published'), true).category, 'bookmarks');
  for (const category of model.STUDIO_CATEGORIES) assert.equal(model.studioCategory(category), category);
});

test('Studio actions never promise unsupported draft/unread or unavailable bookmark navigation', () => {
  assert.deepEqual(Array.from(model.studioRowActions(model.savedPageStudioRows([pageEntry])[0])), ['unsave']);
  assert.deepEqual(Array.from(model.studioRowActions(model.savedCreatorStudioRows([{ id: 'gone', profile: null }])[0])), ['unsave']);
  const activity = model.activityStudioRows([notification])[0];
  assert.deepEqual(Array.from(model.studioRowActions(activity)), ['open', 'mark-read', 'delete']);
  assert.deepEqual(Array.from(model.studioRowActions({ ...activity, notification: { ...notification, isUnread: false } })), ['open', 'delete']);
  assert.deepEqual(Array.from(model.studioRowActions({ ...activity, href: undefined, notification: { ...notification, isUnread: false } })), ['delete']);
  assert.deepEqual(Array.from(view.studioBulkTargets([activity, { ...activity, id: 'activity:read', notification: { ...notification, id: 'read', isUnread: false } }]).deleteActivity, row => row.id), ['activity:note', 'activity:read']);
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

function studioHarness({ category = 'bookmarks', tab = 'projects', mobileActivity, prioritizeActiveCollection, activityOverrides = {}, more = async () => ({ items: [], nextCursor: null }), remove = async () => {}, unsave = async () => ({}) } = {}) {
  const auth = { user: { id: 'one' }, viewerProfileId: creator.id, isAuthenticated: true };
  const queries = [{ data: creator, loading: false, fetchedAt: 100, retry() {} },
    { data: [{ id: creator.id, profile: creator }], loading: false, fetchedAt: 150, retry() {} },
    { data: { items: [pageEntry], nextCursor: 'cursor-one' }, loading: false, fetchedAt: 200, retry() {} }];
  let queryIndex = 0;
  const refreshed = [], queryRetries = [], notificationOptions = [];
  const queryCallbacks = [], reads = [];
  let savedProjectsEnabled;
  queries.forEach((query, index) => { query.retry = () => queryRetries.push(index); });
  const activity = { status: 'success', notifications: [notification], updatedAt: 175, pendingIds: new Set(), markRead: async () => true, retry() { queryRetries.push('activity-retry'); }, refresh: async () => true, isRefreshing: false, ...activityOverrides };
  const services = { profiles: { getProfile: async () => { reads.push('published'); return creator; } }, projects: {}, creatorSaves: { setCreatorSave: async () => true }, engagement: { setEngagement: unsave } };
  const hook = hookHarness(new URL('../src/features/studio/useStudioData.ts', import.meta.url), 'useStudioData', services, auth, [category, tab, { mobileActivity, prioritizeActiveCollection }], { revision: 0 }, {
    '../../contexts/EngagementContext': { useEngagementStore: () => ({ refresh: id => refreshed.push(id) }) },
    '../engagement/useActivityCollection': { useActivityCollection: (_kind, enabled) => { savedProjectsEnabled = enabled; return { phase: 'ready', items: [{ project: oldProject, creator }], updatedAt: 125, retry() { queryRetries.push('saved-projects'); } }; } },
    '../library/useAccountQuery': { useAccountQuery: callback => { const index = queryIndex++ % 3; queryCallbacks[index] = callback; return queries[index]; } },
    '../library/collectionQueries': { async loadSavedCreators() { reads.push('creators'); return []; }, loadSavedPageBatch: (_projects, cursor) => { reads.push('pages'); return more(cursor); } },
    '../library/savedPages': { savedPageKey, removeSavedPage: remove },
    '../messages/useNotifications': { useNotifications: options => { notificationOptions.push(options); return activity; } },
    './studioModel': model,
  });
  return { hook, auth, queries, refreshed, queryRetries, notificationOptions, activity, queryCallbacks, reads, isSavedProjectsEnabled: () => savedProjectsEnabled };
}

test('desktop Studio starts collection reads on first visit and retains already opened collections for this account', async () => {
  const { hook, auth, queryCallbacks, reads, isSavedProjectsEnabled } = studioHarness({ category: 'published', prioritizeActiveCollection: true });
  const options = { prioritizeActiveCollection: true };
  await hook.flush();
  await Promise.all(queryCallbacks.map(read => read()));
  assert.deepEqual(reads, ['published']);
  assert.equal(isSavedProjectsEnabled(), false);
  const published = queryCallbacks[0];

  hook.options(['bookmarks', 'pages', options]); await hook.flush();
  assert.equal(queryCallbacks[0], published, 'The previously visited collection keeps its query and result');
  await Promise.all(queryCallbacks.slice(1).map(read => read()));
  assert.deepEqual(reads, ['published', 'pages']);
  hook.options(['bookmarks', 'projects', options]); await hook.flush();
  assert.equal(isSavedProjectsEnabled(), true);

  auth.user = { id: 'two' }; hook.options(['activity', 'projects', options]); await hook.flush();
  await Promise.all(queryCallbacks.map(read => read()));
  assert.deepEqual(reads, ['published', 'pages']);
  assert.equal(isSavedProjectsEnabled(), false);
  hook.dispose();
});

test('mobile Studio retains its previous collection reads', async () => {
  const { hook, queryCallbacks, reads, isSavedProjectsEnabled } = studioHarness({ category: 'activity', mobileActivity: true });
  await hook.flush();
  await Promise.all(queryCallbacks.map(read => read()));
  assert.deepEqual(reads, ['published', 'creators', 'pages']);
  assert.equal(isSavedProjectsEnabled(), true);
  hook.dispose();
});

test('Studio data defaults to bookmarked projects and reports only the selected collection state', async () => {
  const { hook, queries } = studioHarness();
  hook.options([]);
  queries[0].error = 'Published could not load';
  queries[1].error = 'Creators could not load';
  queries[2].error = 'Pages could not load';
  await hook.flush();
  assert.deepEqual(Array.from(hook.value.rows, row => row.kind), ['saved-project']);
  assert.equal(hook.value.status, 'ready');
  assert.equal(hook.value.error, null);
  assert.equal(hook.value.updatedAt, 125);
  assert.equal(hook.value.hasMore, false);
  hook.options(['bookmarks', 'pages']); await hook.flush();
  assert.equal(hook.value.status, 'error');
  assert.equal(hook.value.error, 'Pages could not load');
  assert.equal(hook.value.updatedAt, null);
  hook.dispose();
});

test('MOBILE Studio retains one continuity opt-in across collections and Activity refreshes only notifications', async () => {
  const flight = deferred(); let refreshes = 0;
  const { hook, notificationOptions, queryRetries, activity } = studioHarness({ category: 'activity', mobileActivity: true, activityOverrides: { refresh: () => { refreshes++; return flight.promise; } } });
  await hook.flush();
  assert.equal(notificationOptions.at(-1).mobileContinuity, true);
  const result = hook.value.refresh(); assert.equal(refreshes, 1); assert.deepEqual(queryRetries, []);
  activity.isRefreshing = true; hook.rerender(); await hook.flush(); assert.equal(hook.value.activityRefreshing, true);
  assert.equal(hook.value.rows[0].notification.id, 'note');
  flight.resolve(false); assert.equal(await result, false);
  hook.options(['bookmarks', 'projects', { mobileActivity: true }]); await hook.flush();
  assert.equal(notificationOptions.at(-1).mobileContinuity, true, 'Changing collection cannot reset the notifications hook mode');
  assert.equal(hook.value.activityRefreshing, false, 'Activity refresh state must not disable another collection');
  hook.dispose();
});

test('WEB Studio and non-Activity refresh retain the existing five-source refresh path', async () => {
  for (const [category, mobileActivity] of [['activity', false], ['bookmarks', true], ['published', true]]) {
    let activityRefreshes = 0;
    const { hook, queryRetries, notificationOptions } = studioHarness({ category, mobileActivity, activityOverrides: { refresh: async () => { activityRefreshes++; return true; } } });
    await hook.flush(); hook.value.refresh(); await hook.flush();
    assert.equal(activityRefreshes, 0, `${category}/${mobileActivity}`);
    assert.deepEqual(queryRetries, [0, 1, 2, 'saved-projects', 'activity-retry']);
    assert.equal(notificationOptions.at(-1).mobileContinuity, mobileActivity);
    hook.dispose();
  }
});

test('MOBILE Activity reports confirmed refresh results and rejects stale account callbacks', async () => {
  let refreshes = 0;
  const { hook, auth } = studioHarness({ category: 'activity', mobileActivity: true, activityOverrides: { refresh: async () => { refreshes++; return true; } } });
  await hook.flush(); assert.equal(await hook.value.refresh(), true); assert.equal(refreshes, 1);
  const oldRefresh = hook.value.refresh; auth.user = { id: 'another-account' }; hook.rerender(); await hook.flush();
  assert.equal(await oldRefresh(), undefined); assert.equal(refreshes, 1); hook.dispose();
});

test('Studio saved-page pagination retains prior rows, deduplicates targets, and preserves a failed cursor for retry', async () => {
  let fail = true;
  const nextEntry = { target: { ...target, pageIndex: 1 }, presentation: null };
  const cursors = [];
  const { hook } = studioHarness({ tab: 'pages', more: async cursor => { cursors.push(cursor); if (fail) throw Error('offline'); return { items: [pageEntry, nextEntry], nextCursor: null }; } });
  await hook.flush(); assert.equal(hook.value.updatedAt, 200); assert.equal(hook.value.hasMore, true);
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
  hook.options(['bookmarks', 'pages']); await hook.flush();
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

test('Studio deletion submits only current Activity identities once and returns only confirmed Studio IDs', async () => {
  const calls = [];
  const { hook } = studioHarness({ category: 'activity', activityOverrides: { deleteNotifications: async ids => { calls.push(Array.from(ids)); return ['note', 'injected']; } } });
  await hook.flush();
  const row = hook.value.rows[0], unrelated = model.savedProjectStudioRows([{ project: oldProject, creator }])[0];
  const confirmed = await hook.value.deleteActivity([row, row, unrelated, { ...row, id: 'activity:missing', notification: { ...notification, id: 'missing' } }]);
  assert.deepEqual(calls, [['note']]);
  assert.deepEqual(Array.from(confirmed), ['activity:note']);
  assert.deepEqual(Array.from(await hook.value.deleteActivity([unrelated])), []);
  assert.equal(calls.length, 1);
  hook.dispose();
});

test('Studio deletion rejects stale account entry and late completion before returning confirmed IDs', async () => {
  const flight = deferred(); let calls = 0;
  const { hook, auth } = studioHarness({ category: 'activity', activityOverrides: { deleteNotifications: () => { calls += 1; return flight.promise; } } });
  await hook.flush();
  const row = hook.value.rows[0], remove = hook.value.deleteActivity;
  const pending = remove([row]);
  auth.user = { id: 'another-account' }; hook.rerender(); await hook.flush();
  assert.deepEqual(Array.from(await remove([row])), []); assert.equal(calls, 1);
  flight.resolve(['note']);
  assert.deepEqual(Array.from(await pending), []);
  hook.dispose();
});

test('Studio deletion rejects a stale open menu revision rather than deleting a newer notification', async () => {
  const calls = [];
  const { hook, activity } = studioHarness({ category: 'activity', activityOverrides: { deleteNotifications: async ids => { calls.push(Array.from(ids)); return Array.from(ids); } } });
  await hook.flush();
  const staleRow = hook.value.rows[0], retainedDelete = hook.value.deleteActivity;
  activity.notifications = [{ ...notification, timestamp: '2026-02-03T00:00:00Z' }];
  hook.rerender(); await hook.flush();
  assert.deepEqual(Array.from(await retainedDelete([staleRow])), []);
  assert.deepEqual(Array.from(await hook.value.deleteActivity([staleRow])), []);
  const currentRow = hook.value.rows[0];
  assert.deepEqual(Array.from(await hook.value.deleteActivity([{ ...currentRow, notification: { ...currentRow.notification, id: 'different-id' } }])), []);
  assert.deepEqual(calls, [], 'Neither a stale timestamp nor a mismatched notification identity can invoke deletion.');
  assert.deepEqual(Array.from(await hook.value.deleteActivity([currentRow])), ['activity:note']);
  assert.deepEqual(calls, [['note']]);
  hook.dispose();
});
