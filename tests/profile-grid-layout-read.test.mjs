import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

function setup(lightweight = true) {
  const reads = [], fullReads = [], profileData = { revision: 0 };
  const profiles = { getProfile(id) { fullReads.push(id); return Promise.resolve({ id, projectGridColumns: 8, projects: ['large portfolio'] }); } };
  if (lightweight) profiles.getProjectGridLayout = id => { const request = { ...deferred(), id }; reads.push(request); return request.promise; };
  const h = hookHarness(new URL('../src/features/profile/useProfileGridLayout.ts', import.meta.url), 'useProfileGridLayout', { profiles }, {}, ['owner'], profileData);
  return { h, reads, fullReads, profileData };
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
