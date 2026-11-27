import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';
import { hookHarness, deferred } from './helpers/hook-harness.mjs';
const journey = sourceModule('src/features/journey/journey.ts');
const profile = id => ({ id, showJourney: true, projects: ['a','b','c','hidden'].map(id => ({ id, isPubliclyVisible: id !== 'hidden' })), thenNow: { then: 'a', now: 'b' } });

test('multiple pairs retain legacy, remove duplicate/hidden pairs, and reject late profile responses', async () => {
  const first = deferred(), second = deferred();
  const a = profile('one'), b = profile('two');
  const h = hookHarness(new URL('../src/features/journey/useTimelinePairs.ts', import.meta.url), 'useTimelinePairs',
    { profiles: { listTimelinePairs: id => id === 'one' ? first.promise : second.promise } }, {}, [a, true], {}, { './journey': journey });
  await h.flush();
  assert.equal(h.value.pairs.length, 1);
  h.options([b, true]); await h.flush();
  first.resolve([{ id: 'stale', then: 'a', now: 'c' }]); await h.flush();
  assert.equal(h.value.pairs.length, 1);
  second.resolve([{ id: 'new', then: 'a', now: 'c' }, { id: 'duplicate', then: 'a', now: 'b' }, { id: 'hidden', then: 'a', now: 'hidden' }]);
  await h.flush();
  assert.deepEqual(Array.from(h.value.pairs, pair => pair.id), ['legacy', 'new']);
  h.options([{ ...b, showJourney: false }, false]); await h.flush();
  assert.equal(h.value.pairs.length, 0);
});

test('load failure preserves the legacy pair and exposes an error instead of fabricated data', async () => {
  const h = hookHarness(new URL('../src/features/journey/useTimelinePairs.ts', import.meta.url), 'useTimelinePairs',
    { profiles: { listTimelinePairs: async () => { throw Error('offline'); } } }, {}, [profile('one'), true], {}, { './journey': journey });
  await h.flush(); assert.equal(h.value.pairs.length, 1); assert.ok(h.value.error); assert.equal(h.value.loading, false);
});

test('owner refresh keeps pair cards mounted until the updated list arrives', async () => {
  const initial = profile('one'), refreshed = { ...initial };
  const next = deferred();
  const old = { id: 'pair', then: 'b', now: 'c' };
  const changed = { id: 'pair', then: 'c', now: 'b' };
  let reads = 0;
  const h = hookHarness(new URL('../src/features/journey/useTimelinePairs.ts', import.meta.url), 'useTimelinePairs',
    { profiles: { listTimelinePairs: () => ++reads === 1 ? Promise.resolve([old]) : next.promise } },
    {}, [initial, true], {}, { './journey': journey });
  await h.flush();
  h.options([refreshed, true]); await h.flush();
  assert.equal(h.value.loading, true);
  assert.equal(h.value.pairs[1], old);
  next.resolve([changed]); await h.flush();
  assert.equal(h.value.loading, false);
  assert.equal(h.value.pairs[1], changed);
});

test('owners can save an order that includes the legacy pair and visitors read the same order', async () => {
  const account = profile('one');
  let saved = ['stale', 'pair-two', 'legacy'];
  let rejectWrite = true;
  const services = { profiles: {
    listTimelinePairs: async () => [
      { id: 'pair-one', then: 'b', now: 'c' },
      { id: 'pair-two', then: 'c', now: 'a' },
      { id: 'hidden', then: 'a', now: 'hidden' },
    ],
    listTimelinePairOrder: async id => {
      assert.equal(id, account.id);
      return saved;
    },
    reorderTimelinePairs: async (id, ids) => {
      assert.equal(id, account.id);
      if (rejectWrite) throw new Error('offline');
      saved = [...ids];
    },
  } };
  const h = hookHarness(new URL('../src/features/journey/useTimelinePairs.ts', import.meta.url), 'useTimelinePairs',
    services, {}, [account, true], {}, { './journey': journey });
  const visibleIds = () => Array.from(h.value.pairs, pair => pair.id);
  await h.flush();
  assert.deepEqual(visibleIds(), ['pair-two', 'legacy', 'pair-one']);
  const nextOrder = ['pair-one', 'legacy', 'pair-two'];
  await assert.rejects(h.value.saveOrder(nextOrder), /offline/);
  assert.deepEqual(visibleIds(), ['pair-two', 'legacy', 'pair-one']);
  rejectWrite = false;
  await h.value.saveOrder(nextOrder);
  await h.flush();
  assert.deepEqual(visibleIds(), nextOrder);
  h.remount([account, false]);
  await h.flush();
  assert.equal(h.value.saveOrder, undefined);
  assert.deepEqual(visibleIds(), nextOrder);
});

test('pair framing is read per side, and a missing framing schema preserves existing pairs', async () => {
  const source = { x: 0.25, y: 0.75, zoom: 2 };
  const row = { id: 'pair', then_project_id: 'a', now_project_id: 'b',
    then_cover: { projectId: 'a', ...source }, now_cover: { projectId: 'old', ...source } };
  const calls = [];
  let hasColumns = true;
  const { supabaseTimelinePairService: service } = sourceModule('src/services/supabase/timelinePairsService.ts', {
    '../../features/journey/journey': journey,
    './client': { requireSupabase: () => ({
      from(table) {
        assert.equal(table, 'profile_timeline_pairs');
        const query = { select(columns) {
          calls.push(columns);
          return { ...query, returns: async () => {
            if (hasColumns) return { data: [row] };
            return columns.includes('then_cover')
              ? { error: { code: '42703', message: 'column then_cover does not exist' } }
              : { data: [{ id: 'pair', then_project_id: 'a', now_project_id: 'b' }] };
          } };
        }, eq() { return this; }, order() { return this; } };
        return query;
      },
    }) },
  });
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(await service.listTimelinePairs('creator')), [{ id: 'pair', then: 'a', now: 'b', thenCover: source }]);
  assert.deepEqual(plain(journey.readThenNow({ then: 'a', now: 'b', thenCover: source })), { then: 'a', now: 'b', thenCover: source });
  hasColumns = false;
  assert.deepEqual(plain(await service.listTimelinePairs('creator')), [{ id: 'pair', then: 'a', now: 'b' }]);
  assert.deepEqual(calls, ['id,then_project_id,now_project_id,then_cover,now_cover',
    'id,then_project_id,now_project_id,then_cover,now_cover', 'id,then_project_id,now_project_id']);
});

test('framing writes compare current values, distinguish reset from omission, and never retry without framing', async () => {
  const source = { x: 0.25, y: 0.75, zoom: 2 };
  const calls = [];
  let result = { data: [{ id: 'pair' }] };
  const query = {
    update(write) { calls.push(['update', write]); return this; },
    eq(...args) { calls.push(['eq', ...args]); return this; },
    filter(...args) { calls.push(['filter', ...args]); return this; },
    is(...args) { calls.push(['is', ...args]); return this; },
    select() { return Promise.resolve(result); },
  };
  const { supabaseTimelinePairService: service } = sourceModule('src/services/supabase/timelinePairsService.ts', {
    '../../features/journey/journey': journey,
    './client': { requireSupabase: () => ({ from: () => query }) },
  });
  const expected = { then: 'a', now: 'b', thenCover: source };
  await service.updateTimelinePair('creator', 'pair', 'a', 'c', expected, { thenCover: null, nowCover: source });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['update', { then_project_id: 'a', now_project_id: 'c', then_cover: null, now_cover: { projectId: 'c', ...source } }],
    ['eq', 'profile_id', 'creator'], ['eq', 'id', 'pair'], ['eq', 'then_project_id', 'a'], ['eq', 'now_project_id', 'b'],
    ['filter', 'then_cover', 'eq', JSON.stringify({ projectId: 'a', ...source })], ['is', 'now_cover', null],
  ]);
  calls.length = 0;
  await service.updateTimelinePair('creator', 'pair', 'a', 'c', expected);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['update', { then_project_id: 'a', now_project_id: 'c' }]);
  calls.length = 0;
  result = { error: { code: 'PGRST204', message: 'Could not find the then_cover column' } };
  await assert.rejects(service.updateTimelinePair('creator', 'pair', 'a', 'b', expected, { thenCover: null }), /not available yet/);
  assert.equal(calls.filter(call => call[0] === 'update').length, 1);
  result = { data: [] };
  await assert.rejects(service.updateTimelinePair('creator', 'pair', 'a', 'b', expected, { thenCover: source }), /has changed/);
});
