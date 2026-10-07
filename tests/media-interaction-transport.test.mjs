import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

function transport(fetcher) {
  let expire;
  let cleared = false;
  const { mediaInteractionRequest } = sourceModule('src/features/media-interactions/mediaInteractionRequest.ts', {
    '../../services/supabase/client': { requireSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic', user: { id: 'actor' } } } }) } }) },
  }, { Headers, Response, AbortController, fetch: fetcher,
    setTimeout(fn, ms) { assert.equal(ms, 25000); expire = fn; return 1; }, clearTimeout() { cleared = true; } });
  return { request: mediaInteractionRequest, expire: () => expire(), cleared: () => cleared };
}

test('page activity deadline aborts stalled fetch and clears its timer', async () => {
  const t = transport((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
  const pending = t.request('/api/media-interactions', undefined, true, 'actor');
  await new Promise(setImmediate);
  t.expire();
  await assert.rejects(pending, /took too long/);
  assert.equal(t.cleared(), true);
});

test('deadline covers a stalled response body and caller cancellation remains cancellation', async () => {
  const t = transport(async (_url, { signal }) => ({ ok: true, json: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) }));
  const pending = t.request('/api/media-interactions');
  await new Promise(setImmediate);
  t.expire(); await assert.rejects(pending, /took too long/);
  const caller = new AbortController();
  const cancelled = transport((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
  const request = cancelled.request('/api/media-interactions', { signal: caller.signal });
  await new Promise(setImmediate);
  caller.abort(new Error('User cancelled'));
  await assert.rejects(request, /User cancelled/);
  assert.equal(cancelled.cleared(), true);
});

test('successful reads retain session headers, account isolation and clean up timers', async () => {
  let calls = 0;
  const t = transport(async (_url, init) => { calls++; assert.equal(init.headers.get('authorization'), 'Bearer synthetic'); return Response.json({ saved: true }); });
  assert.equal((await t.request('/api/media-interactions', undefined, true, 'actor')).saved, true);
  assert.equal(t.cleared(), true);
  await assert.rejects(t.request('/api/media-interactions', undefined, true, 'other'), /account changed/);
  assert.equal(calls, 1);
});
