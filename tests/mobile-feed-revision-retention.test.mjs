import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const page = (start, count, nextCursor = null, homeMode = 'balanced') => ({
  featured: null,
  projects: Array.from({ length: count }, (_, index) => ({ project: { id: `${start + index}` } })),
  creators: [], sphere: null, homeMode, nextCursor,
});
const cursor = id => ({ id, publishedAt: '2026-10-01' });

function setup({ preserve = true, locationId, omitOptions = false } = {}) {
  const requests = [], modeRequests = [];
  const makeDiscovery = () => ({
    getHomeDiscovery(nextCursor) {
      const request = { ...deferred(), kind: 'home', cursor: nextCursor };
      requests.push(request); return request.promise;
    },
    listLocationProjects(id) {
      const request = { ...deferred(), kind: 'location', locationId: id };
      requests.push(request); return request.promise;
    },
    setHomeFeedMode(mode) {
      const request = { ...deferred(), mode }; modeRequests.push(request); return request.promise;
    },
  });
  const services = { discovery: makeDiscovery() }, auth = { user: { id: 'account-a' } };
  const profile = { revision: 0, scope: {}, invalidateProfiles() { profile.revision += 1; } };
  const options = () => omitOptions ? [locationId] : [locationId, { preserveSnapshotAcrossRevision: preserve }];
  const h = hookHarness(new URL('../src/features/discovery/useFeed.ts', import.meta.url), 'useFeed', services, auth, options(), profile);
  return { h, requests, modeRequests, services, auth, profile, makeDiscovery,
    revision() { profile.invalidateProfiles(); h.rerender(); },
    location(id) { locationId = id; h.options(options()); },
    preserve(value) { preserve = value; h.options(options()); },
  };
}

async function loadedHome(f) {
  await f.h.flush();
  f.requests[0].resolve(page(0, 12, cursor('older'))); await f.h.flush();
  f.h.value.loadMore(); await f.h.flush();
  f.requests[1].resolve(page(12, 7)); await f.h.flush();
  assert.equal(f.h.value.projects.length, 19);
}

test('an existing ready PDF status revision preserves all nineteen Home cards until every loaded page revalidates', async () => {
  const f = setup(); await loadedHome(f);
  const cards = f.h.value.projects;
  const media = {
    getProcessingCapability: async () => ({ isAvailable: true, canRetry: true }),
    getProcessingStatus: async () => [{ objectId: 'pdf', state: 'ready', updatedAt: 'same-ready-version' }],
  };
  const processing = hookHarness(new URL('../src/features/media/useAssetProcessing.ts', import.meta.url), 'useAssetProcessing',
    { media }, {}, [[{ id: 'pdf', storagePath: 'stored', kind: 'document', mimeType: 'application/pdf', fileName: 'work.pdf', status: 'ready' }]], f.profile);
  await processing.flush(); assert.equal(f.profile.revision, 1);
  f.h.rerender();
  assert.equal(f.h.value.projects, cards, 'Revision must not clear the retained screen even on its first render');
  await f.h.flush();
  assert.equal(f.h.value.projects, cards); assert.equal(f.h.value.isRefreshing, true);
  f.requests[2].resolve(page(100, 12, cursor('fresh-older'))); await f.h.flush();
  assert.equal(f.requests.length, 4, 'Revalidation includes the previously loaded second page');
  assert.equal(f.h.value.projects, cards, 'The replacement is atomic across pages');
  f.requests[3].resolve(page(112, 7)); await f.h.flush();
  assert.equal(f.h.value.projects.length, 19); assert.equal(f.h.value.projects[0].project.id, '100');
  assert.equal(f.h.value.isRefreshing, false); assert.equal(f.h.value.nextCursor, null);
  processing.dispose(); f.h.dispose();
});

test('a failed revision refresh keeps the completed feed and can be retried without blanking it', async () => {
  const f = setup(); await loadedHome(f); const cards = f.h.value.projects;
  f.revision(); await f.h.flush(); f.requests[2].reject(new Error('offline')); await f.h.flush();
  assert.equal(f.h.value.projects, cards); assert.equal(f.h.value.status, 'success');
  assert.ok(f.h.value.refreshError); assert.equal(f.h.value.isRefreshing, false);
  f.h.value.retry(); await f.h.flush(); assert.equal(f.h.value.projects, cards);
  f.requests[3].resolve(page(30, 12, cursor('retry-older'))); await f.h.flush();
  f.requests[4].resolve(page(42, 7)); await f.h.flush();
  assert.equal(f.h.value.projects.length, 19); assert.equal(f.h.value.refreshError, null); f.h.dispose();
});

test('Load more after a failed revision refresh revalidates canonically before using the fresh pagination cursor', async () => {
  const f = setup(); await f.h.flush();
  f.requests[0].resolve(page(0, 12, cursor('stale-older'))); await f.h.flush();
  const cards = f.h.value.projects;
  f.revision(); await f.h.flush(); f.requests[1].reject(new Error('offline')); await f.h.flush();
  assert.equal(f.h.value.projects, cards); assert.deepEqual(f.h.value.nextCursor, cursor('stale-older'));
  f.h.value.loadMore(); f.h.value.loadMore(); await f.h.flush();
  assert.equal(f.requests.length, 3, 'The exposed control starts one recovery request');
  assert.equal(f.requests[2].cursor, undefined, 'Do not append a stale ranking cursor into a new revision');
  assert.equal(f.h.value.projects, cards); assert.equal(f.h.value.isRefreshing, true);
  assert.equal(f.h.value.refreshError, null);
  f.requests[2].resolve(page(50, 12, cursor('fresh-older'))); await f.h.flush();
  assert.equal(f.h.value.projects[0].project.id, '50'); assert.equal(f.h.value.projects.length, 12);
  f.h.value.loadMore(); await f.h.flush(); assert.equal(f.requests.length, 4);
  assert.deepEqual(f.requests[3].cursor, cursor('fresh-older'));
  f.requests[3].resolve(page(62, 7)); await f.h.flush();
  assert.equal(f.h.value.projects.length, 19); assert.equal(f.h.value.projects[0].project.id, '50'); f.h.dispose();
});

test('a later revision wins while earlier refresh results cannot replace its retained or fresh cards', async () => {
  const f = setup(); await loadedHome(f); const cards = f.h.value.projects;
  f.revision(); await f.h.flush();
  f.revision(); assert.equal(f.h.value.projects, cards); await f.h.flush();
  f.requests[2].resolve(page(20, 19)); await f.h.flush();
  assert.equal(f.h.value.projects, cards);
  f.requests[3].resolve(page(50, 19)); await f.h.flush();
  assert.equal(f.h.value.projects[0].project.id, '50'); assert.equal(f.h.value.isRefreshing, false); f.h.dispose();
});

test('a stale pagination response and stale callbacks cannot append across a revision', async () => {
  const f = setup(); await f.h.flush();
  f.requests[0].resolve(page(0, 12, cursor('older'))); await f.h.flush();
  const previous = f.h.value; previous.loadMore(); await f.h.flush();
  f.revision(); await f.h.flush();
  previous.loadMore(); previous.setHomeMode('following'); await f.h.flush();
  assert.equal(f.requests.length, 3); assert.equal(f.modeRequests.length, 0);
  f.requests[1].resolve(page(12, 7)); await f.h.flush(); assert.equal(f.h.value.projects.length, 12);
  f.requests[2].resolve(page(80, 12, cursor('new-older'))); await f.h.flush();
  assert.equal(f.h.value.projects[0].project.id, '80'); assert.equal(f.h.value.projects.length, 12);
  f.h.value.loadMore(); await f.h.flush(); assert.deepEqual(f.requests[3].cursor, cursor('new-older'));
  f.requests[3].resolve(page(92, 7)); await f.h.flush(); assert.equal(f.h.value.projects.length, 19); f.h.dispose();
});

test('a completed page is retained when its state update batches with the next revision', async () => {
  const f = setup(); await f.h.flush();
  f.requests[0].resolve(page(0, 12, cursor('older'))); await f.h.flush();
  f.h.value.loadMore(); await f.h.flush();
  f.requests[1].resolve(page(12, 7)); await Promise.resolve();
  f.revision(); assert.equal(f.h.value.projects.length, 19, 'The completed response is recorded before another render is required');
  await f.h.flush(); f.requests[2].resolve(page(80, 19)); await f.h.flush();
  assert.equal(f.h.value.projects[0].project.id, '80'); f.h.dispose();
});

test('old Home-mode success or failure cannot cross a revision into the canonical replacement', async () => {
  for (const outcome of ['success', 'failure']) {
    const f = setup(); await loadedHome(f); f.h.value.setHomeMode('following'); await f.h.flush();
    f.revision(); await f.h.flush();
    if (outcome === 'success') f.modeRequests[0].resolve(page(70, 4, null, 'following'));
    else f.modeRequests[0].reject(new Error('old mode failure'));
    await f.h.flush(); assert.equal(f.h.value.projects.length, 19); assert.equal(f.h.value.homeMode, 'balanced');
    assert.equal(f.h.value.homeModeError, null); assert.equal(f.h.value.isSavingHomeMode, false);
    f.requests[2].resolve(page(90, 19)); await f.h.flush();
    assert.equal(f.h.value.projects[0].project.id, '90'); assert.equal(f.h.value.homeMode, 'balanced'); f.h.dispose();
  }
});

test('account, scope, service, or placement replacement clears old cards on the first render', async () => {
  for (const replacement of ['account', 'scope', 'service', 'location']) {
    const f = setup(); await loadedHome(f);
    if (replacement === 'account') f.auth.user = { id: 'account-b' };
    if (replacement === 'scope') f.profile.scope = {};
    if (replacement === 'service') f.services.discovery = f.makeDiscovery();
    if (replacement === 'location') f.location('other-city');
    f.h.rerender(); assert.equal(f.h.value.projects.length, 0, replacement);
    await f.h.flush();
    f.requests[2].resolve(replacement === 'location' ? page(90, 3).projects : page(90, 3)); await f.h.flush();
    assert.equal(f.h.value.projects.length, 3); assert.equal(f.h.value.projects[0].project.id, '90'); f.h.dispose();
  }
});

test('city revalidation retains only that city and a later city switch cannot recover old-city results', async () => {
  const f = setup({ locationId: 'city-a' }); await f.h.flush();
  f.requests[0].resolve(page(0, 8).projects); await f.h.flush(); const cards = f.h.value.projects;
  f.revision(); assert.equal(f.h.value.projects, cards); await f.h.flush();
  assert.equal(f.requests[1].locationId, 'city-a');
  f.location('city-b'); assert.equal(f.h.value.projects.length, 0); await f.h.flush();
  f.requests[1].resolve(page(20, 8).projects); await f.h.flush(); assert.equal(f.h.value.projects.length, 0);
  f.requests[2].resolve(page(50, 2).projects); await f.h.flush();
  assert.equal(f.h.value.projects[0].project.id, '50'); f.h.dispose();
});

test('default WEB behavior still clears on revision and does not revalidate old pagination', async () => {
  for (const omitOptions of [false, true]) {
    const f = setup({ preserve: false, omitOptions }); await loadedHome(f);
    f.revision(); assert.equal(f.h.value.projects.length, 0); await f.h.flush();
    f.requests[2].resolve(page(40, 12, cursor('older'))); await f.h.flush();
    assert.equal(f.requests.length, 3); assert.equal(f.h.value.projects.length, 12); f.h.dispose();
  }
});
