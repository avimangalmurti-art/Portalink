import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const profile = { id: 'profile', projects: [{ id: 'published', publishedAt: '2026-10-14T00:00:00Z' }], categories: [{ id: 'portal', label: 'Work' }] };
const draft = { id: 'draft', profileId: 'profile', categoryId: 'portal', createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z', metadata: { title: 'Remote title' } };
function fixture({ overview = true, remoteDrafts = async () => [draft], deviceDrafts = async () => [], readProfile = async () => profile, account = 'account', profileId = 'profile', missingDrafts = false } = {}) {
  const calls = [];
  const shouldNotStart = name => () => { calls.push(name); return new Promise(() => {}); };
  const services = {
    profiles: {
      getProfile: async id => { calls.push(['full-profile', id]); return readProfile(); },
      ...(overview ? { getProfileOverview: async id => { calls.push(['overview', id]); return readProfile(); } } : {}),
    },
    projects: {
      ...(!missingDrafts ? { listDrafts: async id => { calls.push(['drafts', id]); return remoteDrafts(); } } : {}),
      listProjectViews: shouldNotStart('saved-project-views'),
    },
    reads: { list: shouldNotStart('reads') },
    engagement: { listSavedProjectEntries: shouldNotStart('saved-projects') },
  };
  const { useWorkbench } = sourceModule('src/features/studio/useWorkbench.ts', {
    react: { useCallback: fn => fn },
    '../../contexts/AuthContext': { useAuth: () => ({ user: account ? { id: account } : null, viewerProfileId: profileId }) },
    '../../contexts/ServicesContext': { useServices: () => services },
    '../../contexts/ProfileDataContext': { useProfileData: () => ({ revision: 0 }) },
    '../library/useAccountQuery': { useAccountQuery: query => query() },
    '../publishing/firstProjectDraft': { listDeviceDrafts: async (accountId, viewedId) => { calls.push(['device-drafts', accountId, viewedId]); return deviceDrafts(); } },
  }, { Error });
  return { calls, load: enabled => useWorkbench(enabled) };
}

test('a first Studio visit completes from overview and draft reads without dispatching unrelated blocked media/insights requests', async () => {
  const h = fixture();
  const data = await h.load();
  assert.equal(data.profile, profile);
  assert.equal(data.drafts[0].id, draft.id);
  assert.equal(data.drafts[0].stage, 'files');
  assert.equal(data.partial, false);
  assert.equal(data.draftsUnavailable, false);
  assert.deepEqual(h.calls, [['overview', 'profile'], ['drafts', 'profile'], ['device-drafts', 'account', 'profile']]);
});

test('draft recovery preserves the newest local metadata, timestamp and exact publishing step', async () => {
  const h = fixture({ deviceDrafts: async () => [
    { draft, metadata: { title: 'Older device edit' }, updatedAt: '2026-10-12T00:00:00Z', stage: 'details' },
    { draft, metadata: { title: 'Newest device edit' }, updatedAt: '2026-10-13T00:00:00Z', stage: 'review' },
    { draft: { ...draft, id: 'other' }, metadata: { title: 'Other work' }, updatedAt: '2026-10-14T00:00:00Z', stage: 'files' },
  ] });
  const data = await h.load();
  assert.equal(data.drafts.length, 1);
  assert.equal(data.drafts[0].metadata.title, 'Newest device edit');
  assert.equal(data.drafts[0].updatedAt, '2026-10-13T00:00:00Z');
  assert.equal(data.drafts[0].stage, 'review');
  assert.equal(data.drafts[0].categoryId, 'portal');
});

test('failed remote drafts stay unavailable rather than looking empty; failed device recovery keeps confirmed remote drafts', async () => {
  const unavailable = await fixture({ remoteDrafts: async () => { throw Error('Drafts unavailable'); } }).load();
  assert.equal(unavailable.profile, profile);
  assert.equal(unavailable.partial, true);
  assert.equal(unavailable.draftsUnavailable, true);
  assert.equal(unavailable.drafts.length, 0);
  const noDevice = await fixture({ deviceDrafts: async () => { throw Error('Device storage unavailable'); } }).load();
  assert.equal(noDevice.partial, true);
  assert.equal(noDevice.draftsUnavailable, false);
  assert.equal(noDevice.drafts[0].metadata.title, 'Remote title');
  assert.equal(noDevice.drafts[0].stage, 'files');
});

test('services without an overview reader retain their confirmed full-profile fallback and errors remain retryable failures', async () => {
  const h = fixture({ overview: false });
  assert.equal((await h.load()).profile, profile);
  assert.equal(h.calls[0][0], 'full-profile');
  await assert.rejects(fixture({ readProfile: async () => { throw Error('Network unavailable'); } }).load(), /Your workspace could not load/);
  await assert.rejects(fixture({ missingDrafts: true }).load(), /Drafts are not available/);
  await assert.rejects(fixture({ account: null }).load(), /Sign in to open Studio/);
});

test('independently owned collections disable all workbench reads even when services are unavailable', async () => {
  const h = fixture({ account: null, missingDrafts: true });
  assert.equal(await h.load(false), null);
  assert.deepEqual(h.calls, []);
});
