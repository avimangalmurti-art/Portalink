import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const home = id => ({ featured: null, projects: [{ project: { id } }], sphere: null, homeMode: 'balanced' });
function setup() {
  const requests = [];
  const discovery = { getHomeDiscovery() { const request = deferred(); requests.push(request); return request.promise; } };
  const h = hookHarness(new URL('../src/features/discovery/useFeed.ts', import.meta.url), 'useFeed', { discovery }, { user: null }, [], { revision: 0 });
  return { h, requests };
}

test('reload fetches fresh content while retaining cards, and a failed refresh remains recoverable', async () => {
  const { h, requests } = setup(); await h.flush();
  assert.equal(h.value.isRefreshing, true);
  requests[0].resolve(home('original')); await h.flush();
  assert.equal(h.value.isRefreshing, false);
  h.value.retry(); await h.flush();
  assert.equal(requests.length, 2); assert.equal(h.value.isRefreshing, true);
  assert.equal(h.value.projects[0].project.id, 'original'); assert.equal(h.value.status, 'success');
  requests[1].resolve(home('updated')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'updated'); assert.equal(h.value.isRefreshing, false);
  h.value.retry(); await h.flush(); requests[2].reject(new Error('Offline')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'updated'); assert.equal(h.value.status, 'success');
  assert.equal(h.value.isRefreshing, false); assert.ok(h.value.refreshError);
  h.value.retry(); await h.flush(); assert.equal(h.value.refreshError, null);
  requests[3].resolve(home('recovered')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'recovered'); h.dispose();
});

test('late responses cannot replace the latest cached feed on the next refresh', async () => {
  const { h, requests } = setup(); await h.flush();
  h.value.retry(); await h.flush();
  requests[1].resolve(home('newer')); await h.flush();
  requests[0].resolve(home('older')); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'newer');
  h.value.retry(); await h.flush();
  assert.equal(h.value.projects[0].project.id, 'newer');
  requests[2].resolve(home('latest')); await h.flush(); h.dispose();
});

test('a first-load failure ends the busy state and can be retried', async () => {
  const { h, requests } = setup(); await h.flush();
  requests[0].reject(new Error('Offline')); await h.flush();
  assert.equal(h.value.status, 'error'); assert.equal(h.value.isRefreshing, false);
  h.value.retry(); await h.flush(); requests[1].resolve(home('loaded')); await h.flush();
  assert.equal(h.value.status, 'success'); assert.equal(h.value.isRefreshing, false); h.dispose();
});
