import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from './helpers/source-module.mjs';

const journey = sourceModule('src/features/journey/journey.ts');
const { journeyTimeline } = sourceModule('src/features/citations/journeyCitations.ts', { '../journey/journey': journey });
const plain = value => JSON.parse(JSON.stringify(value));
const project = (id, madeOn, patch = {}) => ({ id, madeOn, ...patch });
const event = (id, date) => ({ id, date, label: id, href: `/cite/${id}` });
const ids = group => group.entries.map(entry => entry.kind === 'project' ? entry.project.id : entry.event.id);

test('Timeline defaults to newest years and interleaves work and real citation events by their dates', () => {
  const projects = [project('old', '2018-01-01', { publishedAt: '2026-01-01' }), project('new', '2025-08-01')];
  const events = [event('outgoing', '2025-08-02T10:00:00Z'), event('incoming', '2025-07-01T10:00:00Z')];
  const rows = journeyTimeline(projects, events, false);
  assert.deepEqual(plain(rows.map(group => group.year)), [2025, 2018]);
  assert.deepEqual(plain(ids(rows[0])), ['outgoing', 'new', 'incoming']);
  assert.deepEqual(plain(rows.map(group => group.projectCount)), [1, 1]);
});

test('newest and oldest order every populated year and its entries while keeping unknown dates last', () => {
  const projects = [project('b', '2025-08-01'), project('unknown', 'invalid'), project('old', '1960-03-01'),
    project('a', '2025-08-01'), project('published', undefined, { publishedAt: '2024-12-31T10:00:00Z', creationDetails: { madeIn: '1990-01' } })];
  const events = [event('after', '2025-08-02'), event('before', '2025-07-01'), event('unknown-event', '')];
  const snapshot = plain({ projects, events });
  const newest = journeyTimeline(projects, events, false, 'newest');
  const oldest = journeyTimeline(projects, events, false, 'oldest');
  assert.deepEqual(plain(newest.map(group => [group.year, ids(group)])), [
    [2025, ['after', 'a', 'b', 'before']], [2024, ['published']], [1960, ['old']], [null, ['unknown-event', 'unknown']],
  ]);
  assert.deepEqual(plain(oldest.map(group => [group.year, ids(group)])), [
    [1960, ['old']], [2024, ['published']], [2025, ['before', 'a', 'b', 'after']], [null, ['unknown-event', 'unknown']],
  ]);
  assert.equal(newest.some(group => group.gap), false);
  assert.equal(oldest.some(group => group.gap), false);
  assert.deepEqual(plain({ projects, events }), snapshot, 'Changing order cannot mutate cached profile or citation arrays.');
});

test('same-date ties stay deterministic when incoming arrays or sort direction change', () => {
  const projects = [project('z-work', '2025-01-01'), project('a-work', '2025-01-01')];
  const events = [event('m-citation', '2025-01-01')];
  const baseline = plain(ids(journeyTimeline(projects, events, false, 'newest')[0]));
  for (const order of ['newest', 'oldest']) {
    const first = plain(ids(journeyTimeline(projects, events, false, order)[0]));
    assert.deepEqual(first, baseline, 'Changing chronological direction cannot reshuffle equal-date records.');
    assert.deepEqual(first.filter(id => id.endsWith('-work')), ['a-work', 'z-work']);
    assert.deepEqual(plain(ids(journeyTimeline([...projects].reverse(), [...events].reverse(), false, order)[0])), first);
  }
});

test('year counts include authorized projects, exclude session previews and never count citation rows as projects', () => {
  const projects = [project('public', '2025-01-01'), project('private', '2025-01-02', { isPubliclyVisible: false }),
    project('preview', '2025-01-03', { sessionOnly: true }), project('only-private-year', '2026-01-01', { isPubliclyVisible: false })];
  const events = [event('incoming', '2025-01-04'), event('citation-only-year', '2020-01-01')];
  for (const order of ['newest', 'oldest']) {
    const visitor = journeyTimeline(projects, events, false, order), owner = journeyTimeline(projects, events, true, order);
    assert.deepEqual(plain(visitor.map(group => [group.year, group.projectCount]).sort(([a], [b]) => a - b)), [[2020, 0], [2025, 1]]);
    assert.deepEqual(plain(owner.map(group => [group.year, group.projectCount]).sort(([a], [b]) => a - b)), [[2020, 0], [2025, 2], [2026, 1]]);
    assert.equal(visitor.flatMap(ids).includes('private'), false);
    assert.equal(owner.flatMap(ids).includes('private'), true);
    assert.equal(owner.flatMap(ids).includes('preview'), false);
  }
});

test('empty or entirely inaccessible work does not fabricate years, project counts or citation events', () => {
  for (const order of ['newest', 'oldest']) {
    assert.deepEqual(plain(journeyTimeline([], [], false, order)), []);
    assert.deepEqual(plain(journeyTimeline([project('private', '2026-01-01', { isPubliclyVisible: false })], [], false, order)), []);
  }
});
