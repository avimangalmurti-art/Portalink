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
