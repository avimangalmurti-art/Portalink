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
