import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const file = new URL('../src/features/profile/useSharedProfileQuery.ts', import.meta.url);
const compactProject = (id = 'report') => ({ id, categoryId: 'documents', title: id, attachments: [], coverThumbnail: { version: 1 } });
const bundle = (name = 'Creator', extra = {}) => ({ id: 'creator', name, isPrivate: false, projects: [compactProject(), compactProject('second')], ...extra });
const fullView = (title = 'Full document', id = 'report') => ({ creator: { id: 'creator', isPrivate: false },
  project: { ...compactProject(id), title, attachments: [{ id: `${id}-file`, kind: 'document', sourceUrl: `${id}-original.pdf` }] } });

function fixture({ initial = ['creator', null, null], shared, view, auth = { user: null }, profileData = { revision: 0 } } = {}) {
  const calls = { bundle: [], viewer: [], ordinary: 0 };
  const profiles = {
    getSharedProfile: id => { calls.bundle.push(id); return shared ? shared(id) : Promise.resolve(bundle()); },
    getProfile: () => { calls.ordinary++; throw new Error('The shared route must not read the owner profile service.'); },
  };
  const projects = { getProjectView: id => { calls.viewer.push(id); return view ? view(id) : Promise.resolve(fullView(undefined, id)); } };
  for (const name of ['getProfile', 'loadProfile', 'primeProfile', 'invalidateProfiles']) {
    Object.defineProperty(profileData, name, { get() { assert.fail(`Shared read touched owner cache ${name}`); } });
  }
  return { h: hookHarness(file, 'useSharedProfileQuery', { profiles, projects }, auth, initial, profileData), calls, auth, profileData };
}

test('shared grid → document → back reuses one compact bundle and resolves originals only for the selected document', async () => {
  const compact = bundle();
  const f = fixture({ shared: async () => compact });
  await f.h.flush();
  assert.equal(f.h.value.status, 'ready');
  assert.equal(f.h.value.profile, compact);
  assert.deepEqual(f.calls.viewer, []);
  f.h.options(['creator', 'report', 'documents']);
  assert.equal(f.h.value.profile, null, 'Previous route content cannot flash while the document resolves');
  await f.h.flush();
  assert.deepEqual(f.calls.viewer, ['report']);
  assert.equal(f.h.value.profile.projects[0].attachments[0].sourceUrl, 'report-original.pdf');
  assert.equal(f.h.value.profile.projects[1].attachments.length, 0);
  assert.equal(compact.projects[0].attachments.length, 0, 'Viewer hydration does not mutate the reusable grid bundle');
  f.h.options(['creator', null, null]);
  await f.h.flush();
  assert.equal(f.h.value.profile, compact);
  assert.deepEqual(f.calls.bundle, ['creator']);
  assert.deepEqual(f.calls.viewer, ['report']);
  assert.equal(f.calls.ordinary, 0);
  f.h.dispose();
});

test('private bundles and projects absent from the public category/project list never resolve originals', async () => {
  const privateProfile = fixture({ initial: ['creator', 'report', 'documents'], shared: async () => bundle('Private', { isPrivate: true }) });
  await privateProfile.h.flush();
  assert.equal(privateProfile.h.value.status, 'not-found');
  assert.equal(privateProfile.h.value.profile, null);
  assert.deepEqual(privateProfile.calls.viewer, []);
  privateProfile.h.dispose();
  for (const route of [['creator', 'hidden-report', 'documents'], ['creator', 'report', 'hidden-category']]) {
    const f = fixture({ initial: route });
    await f.h.flush();
    assert.deepEqual(f.calls.viewer, []);
    assert.ok(!f.h.value.profile.projects.some(project => project.id === route[1] && project.categoryId === route[2]),
      'The existing route receives no matching project and renders its project-not-found state');
    f.h.dispose();
  }
});

test('viewer responses must still match the public creator/category and cannot introduce a private creator', async () => {
  for (const change of [view => ({ ...view, creator: { id: 'other', isPrivate: false } }),
    view => ({ ...view, creator: { id: 'creator', isPrivate: true } }),
    view => ({ ...view, project: { ...view.project, categoryId: 'other-category' } })]) {
    const f = fixture({ initial: ['creator', 'report', 'documents'], view: async () => change(fullView()) });
    await f.h.flush();
    assert.deepEqual(f.calls.viewer, ['report']);
    assert.equal(f.h.value.status, 'not-found');
    assert.equal(f.h.value.profile, null);
    f.h.dispose();
  }
});

test('an account change discards late bundle responses and immediately clears the old account state', async () => {
  const first = deferred(), second = deferred(); let request = 0;
  const f = fixture({ shared: () => (++request === 1 ? first.promise : second.promise) });
  await f.h.flush();
  f.auth.user = { id: 'signed-in-account' }; f.h.rerender();
  assert.equal(f.h.value.profile, null);
  assert.equal(f.h.value.status, 'loading');
  await f.h.flush();
  second.resolve(bundle('Current account result')); await f.h.flush();
  assert.equal(f.h.value.profile.name, 'Current account result');
  first.resolve(bundle('Late anonymous result')); await f.h.flush();
  assert.equal(f.h.value.profile.name, 'Current account result');
  assert.equal(f.calls.bundle.length, 2);
  assert.deepEqual(f.calls.viewer, []);
  f.h.dispose();
});

test('profile invalidation discards late document hydration without polluting the newer bundle', async () => {
  const first = deferred(), second = deferred(); let request = 0;
  const f = fixture({ initial: ['creator', 'report', 'documents'], view: () => (++request === 1 ? first.promise : second.promise) });
  await f.h.flush();
  f.profileData.revision++; f.h.rerender();
  assert.equal(f.h.value.profile, null);
  await f.h.flush();
  second.resolve(fullView('After edit')); await f.h.flush();
  assert.equal(f.h.value.profile.projects[0].title, 'After edit');
  first.resolve(fullView('Before edit')); await f.h.flush();
  assert.equal(f.h.value.profile.projects[0].title, 'After edit');
  assert.equal(f.calls.bundle.length, 2);
  assert.deepEqual(f.calls.viewer, ['report', 'report']);
  f.h.dispose();
});

test('a late bundle from the prior account cannot initiate an additional original-file request', async () => {
  const oldAccount = deferred(), currentAccount = deferred(); let request = 0;
  const f = fixture({ initial: ['creator', 'report', 'documents'], auth: { user: { id: 'former-account' } },
    shared: () => (++request === 1 ? oldAccount.promise : currentAccount.promise) });
  await f.h.flush();
  f.auth.user = null; f.h.rerender(); await f.h.flush();
  currentAccount.resolve(bundle('Signed out')); await f.h.flush();
  assert.deepEqual(f.calls.viewer, ['report']);
  oldAccount.resolve(bundle('Former account')); await f.h.flush();
  assert.deepEqual(f.calls.viewer, ['report']);
  assert.equal(f.h.value.profile.name, 'Signed out');
  f.h.dispose();
});

test('retry starts a new public read after an error and never falls back to the broader owner reader', async () => {
  let fail = true;
  const f = fixture({ shared: async () => { if (fail) throw new Error('Network temporarily unavailable'); return bundle('Retried'); } });
  await f.h.flush();
  assert.equal(f.h.value.status, 'error');
  assert.match(f.h.value.error, /Network temporarily unavailable/);
  fail = false; f.h.value.retry();
  await f.h.flush();
  assert.equal(f.h.value.status, 'ready');
  assert.equal(f.h.value.profile.name, 'Retried');
  assert.equal(f.calls.bundle.length, 2);
  assert.equal(f.calls.ordinary, 0);
  f.h.dispose();
});

test('leaving a document route before its bundle resolves never starts a stale original-file read', async () => {
  const pending = deferred();
  const f = fixture({ initial: ['creator', 'report', 'documents'], shared: () => pending.promise });
  await f.h.flush();
  f.h.options(['creator', null, null]); await f.h.flush();
  pending.resolve(bundle()); await f.h.flush();
  assert.equal(f.h.value.status, 'ready');
  assert.equal(f.h.value.profile.projects[0].attachments.length, 0);
  assert.deepEqual(f.calls.viewer, []);
  assert.equal(f.calls.bundle.length, 1);
  f.h.dispose();
});

test('an absent profile route is idle and makes no content requests', async () => {
  const f = fixture({ initial: [null, null, null] });
  await f.h.flush();
  assert.equal(f.h.value.status, 'idle');
  assert.equal(f.h.value.profile, null);
  assert.deepEqual(f.calls.bundle, []); assert.deepEqual(f.calls.viewer, []);
  f.h.dispose();
});
