import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const domain = sourceModule('src/types/engagement.ts');

test('active engagement kinds and activity slugs exclude retired reposts', () => {
  assert.deepEqual(Array.from(domain.ENGAGEMENT_KINDS), ['like', 'save']);
  for (const value of ['repost', 'reposts', '', null, 'constructor']) assert.equal(domain.isEngagementKind(value), false);
  assert.equal(domain.activityKindFromSlug('reposts'), null);
  assert.equal(domain.activityKindFromSlug('constructor'), null);
  assert.equal(domain.activityKindFromSlug('likes'), 'like');
  assert.equal(domain.activityKindFromSlug('saved'), 'save');
  assert.equal(domain.activitySlugForKind('repost'), undefined);
  assert.equal(domain.activitySlugForKind('constructor'), undefined);
});

test('project hook refuses stale repost input without interpreting legacy summary fields as an active action', async () => {
  const toggles = [], entry = { record: { isLiked: true, isSaved: false, isReposted: true, likeCount: 4, saveCount: 2, repostCount: 30 },
    pending: { repost: true }, failure: { kind: 'repost', message: 'Old failure', retry() { assert.fail('A retired retry must not be exposed.'); } } };
  const store = { ensure() {}, read: () => entry, toggle: (...args) => toggles.push(args), canEngage: true };
  const h = hookHarness(new URL('../src/features/engagement/useProjectEngagement.ts', import.meta.url), 'useProjectEngagement', {}, {}, ['project'], undefined, {
    './capabilities': { likesCapability: true },
    '../../types/engagement': domain, '../../contexts/EngagementContext': { useEngagementStore: () => store },
  });
  try {
    await h.flush();
    assert.equal(h.value.isEngaged('repost'), false); assert.equal(h.value.isPending('repost'), false); assert.equal(h.value.count('repost'), null);
    assert.equal(h.value.failure, null); h.value.toggle('repost'); assert.equal(toggles.length, 0);
    assert.equal(h.value.isEngaged('like'), true); assert.equal(h.value.count('save'), 2);
    h.value.toggle('save'); assert.deepEqual(toggles, [['project', 'save']]);
  } finally { h.dispose(); }
});

test('retired activity collections make no membership read and fence an earlier supported read', async () => {
  const calls = [], pending = deferred();
  const services = { engagement: { listEngagedProjectIds(kind) { calls.push(kind); return pending.promise; } },
    projects: { getProjectView() { assert.fail('A retired collection cannot resolve project cards.'); } } };
  const store = { knownFor(kind) { assert.notEqual(kind, 'repost'); return { engaged: [], withdrawn: [] }; } };
  const h = hookHarness(new URL('../src/features/engagement/useActivityCollection.ts', import.meta.url), 'useActivityCollection', services, {}, ['repost', true], undefined, {
    '../../types/engagement': domain, '../../contexts/EngagementContext': { useEngagementStore: () => store },
  });
  try {
    await h.flush(); assert.equal(calls.length, 0); assert.equal(h.value.phase, 'ready'); assert.equal(h.value.items.length, 0);
    h.options(['save', true]); await h.flush(); assert.deepEqual(calls, ['save']);
    h.options(['repost', true]); await h.flush();
    pending.resolve(['old-save']); await h.flush();
    assert.equal(h.value.items.length, 0); assert.equal(h.value.phase, 'ready');
  } finally { h.dispose(); }
});

test('legacy repost rows cannot contribute discovery interest while likes and saves still do', () => {
  const ranking = sourceModule('src/domain/discovery/ranking.ts', {
    '../../data/cities': { cities: [] }, '../../data/countryCodes': { getCountryCode: () => undefined }, '../contentPlacement': { decideProjectPlacement: () => ({ eligible: true }) },
  });
  const view = { creator: { id: 'creator' }, project: { id: 'project', relevance: { topicKeys: ['photography'], geographicScope: 'location_independent', contentGeography: null } } };
  const input = { viewerProfile: null, availableProjects: [view], followedCreatorIds: [], explicitSignals: [], now: new Date('2026-11-03') };
  const retired = ranking.buildUserContentSphere({ ...input, engagement: [{ projectId: 'project', kind: 'repost', createdAt: '2026-11-03' }] });
  assert.deepEqual(Object.keys(retired.topicWeights), []); assert.deepEqual(Array.from(retired.sources), []);
  for (const [kind, weight] of [['like', 0.25], ['save', 1]]) {
    const active = ranking.buildUserContentSphere({ ...input, engagement: [{ projectId: 'project', kind, createdAt: '2026-11-03' }] });
    assert.equal(active.topicWeights.photography, weight);
  }
});

test('prototype service refuses retired kinds before account reads and preserves supported account-specific saves', async () => {
  const source = readFileSync(new URL('../src/services/mocks/index.ts', import.meta.url), 'utf8');
  const start = source.indexOf('const engagementByAccount ='), end = source.indexOf('export const mockNotificationService', start);
  assert.ok(start >= 0 && end > start);
  let account = null, authReads = 0;
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, EngagementServiceError: domain.EngagementServiceError, profiles: [{ projects: [{ id: 'project' }] }],
    readPrototypeSession() { authReads++; return account ? { user: { id: account } } : null; }, resolve: value => Promise.resolve(value),
  });
  const service = exports.mockEngagementService;
  for (const viewer of [null, 'alice']) {
    account = viewer;
    for (const engaged of [true, false]) await assert.rejects(service.setEngagement({ projectId: 'project', kind: 'repost', engaged }), error => error.code === 'permission_denied');
    await assert.rejects(service.listEngagedProjectIds('repost'), error => error.code === 'permission_denied');
  }
  assert.equal(authReads, 0);
  account = 'alice'; await service.setEngagement({ projectId: 'project', kind: 'save', engaged: true });
  assert.deepEqual(Array.from(await service.listEngagedProjectIds('save')), ['project']);
  account = 'bob'; assert.deepEqual(Array.from(await service.listEngagedProjectIds('save')), []);
  account = 'alice'; await service.setEngagement({ projectId: 'project', kind: 'save', engaged: false });
  assert.deepEqual(Array.from(await service.listEngagedProjectIds('save')), []);
});
