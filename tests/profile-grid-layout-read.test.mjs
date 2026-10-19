import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

function setup(lightweight = true) {
  const reads = [], fullReads = [], profileData = { revision: 0, scope: {} };
  const profiles = { getProfile(id) { fullReads.push(id); return Promise.resolve({ id, projectGridColumns: 8, projects: ['large portfolio'] }); } };
  if (lightweight) profiles.getProjectGridLayout = id => { const request = { ...deferred(), id }; reads.push(request); return request.promise; };
  const services = { profiles };
  const h = hookHarness(new URL('../src/features/profile/useProfileGridLayout.ts', import.meta.url), 'useProfileGridLayout', services, {}, ['owner'], profileData);
  return { h, reads, fullReads, profileData, services };
}

test('Home reads only saved layout and an invalidation retains the grid until new columns arrive', async () => {
  const { h, reads, fullReads, profileData } = setup(); await h.flush();
  assert.equal(h.value.status, 'loading'); assert.equal(fullReads.length, 0);
  reads[0].resolve({ id: 'owner', projectGridColumns: 5 }); await h.flush();
  assert.equal(h.value.layout.projectGridColumns, 5);
  profileData.revision++; h.rerender(); await h.flush();
  assert.equal(h.value.layout.projectGridColumns, 5); assert.equal(h.value.status, 'loading');
  reads[1].resolve({ id: 'owner', projectGridColumns: 13 }); await h.flush();
  assert.equal(h.value.layout.projectGridColumns, 13); assert.equal(fullReads.length, 0); h.dispose();
});

test('late layout reads cannot cross profile changes, and failure allows an explicit retry', async () => {
  const { h, reads } = setup(); await h.flush();
  h.options(['another']); await h.flush();
  reads[0].resolve({ id: 'owner', projectGridColumns: 5 }); await h.flush();
  assert.equal(h.value.layout, null);
  reads[1].reject(Error('offline')); await h.flush();
  assert.equal(h.value.status, 'error'); assert.match(h.value.error, /offline/);
  h.value.retry(); await h.flush();
  reads[2].resolve({ id: 'another', projectGridColumns: 7 }); await h.flush();
  assert.equal(h.value.layout.projectGridColumns, 7); h.dispose();
});

test('prototype services without the optional lightweight API remain compatible', async () => {
  const { h, fullReads } = setup(false); await h.flush();
  assert.deepEqual(fullReads, ['owner']); assert.equal(h.value.layout.projectGridColumns, 8);
  assert.equal(h.value.layout.projects, undefined);
  h.options([null]); await h.flush(); assert.equal(h.value.layout, null); h.dispose();
});

test('returning Home immediately restores its complete layout without fetching again', async () => {
  const { h, reads } = setup(); await h.flush();
  reads[0].resolve({ id: 'owner', projectGridColumns: 5 }); await h.flush();
  h.remount();
  assert.equal(h.value.status, 'ready');
  assert.equal(h.value.layout.projectGridColumns, 5);
  await h.flush();
  assert.equal(reads.length, 1, 'Navigation alone cannot re-read or replace the saved density.');
  h.dispose();
});

test('a return during the first layout read joins that request and caches its answer', async () => {
  const { h, reads } = setup(); await h.flush();
  h.remount(); await h.flush();
  assert.equal(reads.length, 1);
  assert.equal(h.value.status, 'loading');
  reads[0].resolve({ id: 'owner', projectGridColumns: 9 }); await h.flush();
  assert.equal(h.value.status, 'ready');
  assert.equal(h.value.layout.projectGridColumns, 9);
  h.remount(); await h.flush();
  assert.equal(reads.length, 1); h.dispose();
});

test('manual retry refreshes a retained layout and failure preserves that complete layout', async () => {
  const { h, reads } = setup(); await h.flush();
  reads[0].resolve({ id: 'owner', projectGridColumns: 5 }); await h.flush();
  h.value.retry(); await h.flush();
  assert.equal(reads.length, 2);
  assert.equal(h.value.status, 'loading');
  assert.equal(h.value.layout.projectGridColumns, 5);
  reads[1].reject(Error('offline')); await h.flush();
  assert.equal(h.value.status, 'error');
  assert.equal(h.value.error, 'offline');
  assert.equal(h.value.layout.projectGridColumns, 5);
  h.remount(); await h.flush();
  assert.equal(h.value.status, 'ready');
  assert.equal(h.value.layout.projectGridColumns, 5);
  assert.equal(reads.length, 2);
  h.value.retry(); await h.flush();
  reads[2].resolve({ id: 'owner', projectGridColumns: 7 }); await h.flush();
  assert.equal(h.value.layout.projectGridColumns, 7); h.dispose();
});

test('a superseded layout read cannot overwrite the latest retained answer', async () => {
  const { h, reads } = setup(); await h.flush();
  h.value.retry(); await h.flush();
  reads[1].resolve({ id: 'owner', projectGridColumns: 11 }); await h.flush();
  reads[0].resolve({ id: 'owner', projectGridColumns: 5 }); await h.flush();
  assert.equal(h.value.layout.projectGridColumns, 11);
  h.remount(); await h.flush();
  assert.equal(h.value.layout.projectGridColumns, 11);
  assert.equal(reads.length, 2); h.dispose();
});

test('account scopes mask retained layouts immediately, including returning to an earlier account', async () => {
  const { h, reads, profileData } = setup(); await h.flush();
  reads[0].resolve({ id: 'owner', projectGridColumns: 5 }); await h.flush();
  profileData.scope = {}; h.rerender();
  assert.equal(h.value.layout, null, 'An unchanged profile ID cannot expose the previous account scope.');
  await h.flush();
  assert.equal(reads.length, 2);
  reads[1].resolve({ id: 'owner', projectGridColumns: 7 }); await h.flush();
  profileData.scope = {}; h.rerender();
  assert.equal(h.value.layout, null, 'A → B → A receives a new provider scope rather than reviving A’s old snapshot.');
  await h.flush(); assert.equal(reads.length, 3);
  reads[2].resolve({ id: 'owner', projectGridColumns: 9 }); await h.flush();
  assert.equal(h.value.layout.projectGridColumns, 9); h.dispose();
});

test('a service replacement cannot borrow the previous service layout or accept its late answer', async () => {
  const { h, reads, services } = setup(); await h.flush();
  const nextRead = deferred();
  services.profiles = { getProjectGridLayout: id => { assert.equal(id, 'owner'); return nextRead.promise; } };
  h.rerender(); assert.equal(h.value.layout, null);
  await h.flush();
  reads[0].resolve({ id: 'owner', projectGridColumns: 5 }); await h.flush();
  assert.equal(h.value.layout, null);
  nextRead.resolve({ id: 'owner', projectGridColumns: 13 }); await h.flush();
  assert.equal(h.value.layout.projectGridColumns, 13); h.dispose();
});

test('profile selection restores only its own retained layout; null selection stays idle', async () => {
  const { h, reads } = setup(); await h.flush();
  reads[0].resolve({ id: 'owner', projectGridColumns: 5 }); await h.flush();
  h.options(['another']); assert.equal(h.value.layout, null); await h.flush();
  reads[1].resolve({ id: 'another', projectGridColumns: 7 }); await h.flush();
  h.options(['owner']); assert.equal(h.value.layout.projectGridColumns, 5); await h.flush();
  assert.equal(reads.length, 2);
  h.options([null]); assert.equal(h.value.status, 'idle'); assert.equal(h.value.layout, null); await h.flush();
  h.value.retry(); await h.flush(); assert.equal(reads.length, 2); h.dispose();
});

test('a response for another profile is rejected and cannot become a retained layout', async () => {
  const { h, reads } = setup(); await h.flush();
  reads[0].resolve({ id: 'wrong-owner', projectGridColumns: 5 }); await h.flush();
  assert.equal(h.value.layout, null); assert.equal(h.value.status, 'error');
  h.value.retry(); await h.flush();
  reads[1].resolve({ id: 'owner', projectGridColumns: 7 }); await h.flush();
  assert.equal(h.value.layout.projectGridColumns, 7); h.dispose();
});
