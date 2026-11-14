import assert from 'node:assert/strict';
import test from 'node:test';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';
import { sourceModule } from './helpers/source-module.mjs';

const file = new URL('../src/features/profile/useSharedProfileQuery.ts', import.meta.url);
const compactProject = (id = 'report') => ({ id, categoryId: 'documents', title: id, attachments: [], coverThumbnail: { version: 1 } });
const projectPortals = sourceModule('src/features/projects/projectPortals.ts');
const bundle = (name = 'Creator', extra = {}) => ({ id: 'creator', name, isPrivate: false, categories: [{ id: 'documents' }], projects: [compactProject(), compactProject('second')], ...extra });
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
  return { h: hookHarness(file, 'useSharedProfileQuery', { profiles, projects }, auth, initial, profileData, { '../projects/projectPortals': projectPortals }), calls, auth, profileData };
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
  assert.equal(f.h.value.status, 'ready', 'Returning to the confirmed grid is synchronous');
  await f.h.flush();
  assert.equal(f.h.value.profile, compact);
  assert.deepEqual(f.calls.bundle, ['creator']);
  assert.deepEqual(f.calls.viewer, ['report']);
  assert.equal(f.calls.ordinary, 0);
  f.h.options(['creator', 'report', 'documents']);
  assert.equal(f.h.value.status, 'ready', 'Reopening confirmed media in this account scope needs no loading flash');
  await f.h.flush();
  assert.deepEqual(f.calls.viewer, ['report']);
  f.h.dispose();
});

test('confirmed private bundles and absent public project membership refuse new original-file reads', async () => {
  const privateProfile = fixture({ shared: async () => bundle('Private', { isPrivate: true }) });
  await privateProfile.h.flush();
  assert.equal(privateProfile.h.value.status, 'not-found');
  assert.equal(privateProfile.h.value.profile, null);
  assert.deepEqual(privateProfile.calls.viewer, []);
  privateProfile.h.dispose();
  for (const route of [['creator', 'hidden-report', 'documents'], ['creator', 'report', 'hidden-category']]) {
    const f = fixture();
    await f.h.flush();
    f.h.options(route);
    await f.h.flush();
    assert.deepEqual(f.calls.viewer, []);
    assert.ok(!f.h.value.profile.projects.some(project => project.id === route[1] && project.categoryId === route[2]),
      'The existing route receives no matching project and renders its project-not-found state');
    f.h.dispose();
  }
});

test('a public featured Portal opens the canonical project while hidden placement IDs stay out of the public bundle', async () => {
  const f = fixture({
    shared: async () => bundle('Creator', { categories: [{ id: 'documents' }, { id: 'featured' }],
      projects: [{ ...compactProject(), additionalPortalIds: ['featured'] }] }),
    view: async () => ({ ...fullView(), project: { ...fullView().project, additionalPortalIds: ['featured', 'hidden'] } }),
  });
  await f.h.flush();
  f.h.options(['creator', 'report', 'featured']);
  await f.h.flush();
  const project = f.h.value.profile.projects[0];
  assert.equal(project.categoryId, 'documents');
  assert.deepEqual(project.additionalPortalIds, ['featured']);
  assert.equal(project.attachments[0].sourceUrl, 'report-original.pdf');
  f.h.options(['creator', 'report', 'hidden']);
  await f.h.flush();
  assert.deepEqual(f.calls.viewer, ['report']);
  assert.equal(f.h.value.profile.projects[0].attachments.length, 0);
  f.h.dispose();
});

test('viewer responses must still match the public creator/category and cannot introduce a private creator', async () => {
  for (const change of [view => ({ ...view, creator: { id: 'other', isPrivate: false } }),
    view => ({ ...view, creator: { id: 'creator', isPrivate: true } }),
    view => ({ ...view, project: { ...view.project, categoryId: 'other-category' } }),
    view => ({ ...view, project: { ...view.project, id: 'other-project' } }),
    view => ({ ...view, project: { ...view.project, isPubliclyVisible: false } })]) {
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

test('a late bundle from the prior account cannot initiate an additional original-file request after parallel reads start', async () => {
  const oldAccount = deferred(), currentAccount = deferred(); let request = 0;
  const f = fixture({ initial: ['creator', 'report', 'documents'], auth: { user: { id: 'former-account' } },
    shared: () => (++request === 1 ? oldAccount.promise : currentAccount.promise) });
  await f.h.flush();
  assert.deepEqual(f.calls.viewer, ['report']);
  f.auth.user = null; f.h.rerender(); await f.h.flush();
  assert.deepEqual(f.calls.viewer, ['report', 'report']);
  currentAccount.resolve(bundle('Signed out')); await f.h.flush();
  assert.deepEqual(f.calls.viewer, ['report', 'report']);
  oldAccount.resolve(bundle('Former account')); await f.h.flush();
  assert.deepEqual(f.calls.viewer, ['report', 'report']);
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

test('leaving a document route before its bundle resolves never presents selected media or starts another original-file read', async () => {
  const pending = deferred();
  const f = fixture({ initial: ['creator', 'report', 'documents'], shared: () => pending.promise });
  await f.h.flush();
  assert.deepEqual(f.calls.viewer, ['report']);
  f.h.options(['creator', null, null]); await f.h.flush();
  pending.resolve(bundle()); await f.h.flush();
  assert.equal(f.h.value.status, 'ready');
  assert.equal(f.h.value.profile.projects[0].attachments.length, 0);
  assert.deepEqual(f.calls.viewer, ['report']);
  assert.equal(f.calls.bundle.length, 1);
  f.h.dispose();
});

test('first direct public project visit reads bundle and selected media concurrently and waits for both confirmations', async () => {
  for (const mediaFirst of [true, false]) {
    const pendingBundle = deferred(), pendingView = deferred();
    const f = fixture({ initial: ['creator', 'report', 'documents'], shared: () => pendingBundle.promise, view: () => pendingView.promise });
    await f.h.flush();
    assert.deepEqual(f.calls.bundle, ['creator']);
    assert.deepEqual(f.calls.viewer, ['report']);
    if (mediaFirst) pendingView.resolve(fullView());
    else pendingBundle.resolve(bundle());
    await f.h.flush();
    assert.equal(f.h.value.status, 'loading');
    assert.equal(f.h.value.profile, null);
    if (mediaFirst) pendingBundle.resolve(bundle());
    else pendingView.resolve(fullView());
    await f.h.flush();
    assert.equal(f.h.value.status, 'ready');
    assert.equal(f.h.value.profile.projects[0].attachments[0].sourceUrl, 'report-original.pdf');
    assert.equal(f.h.value.profile.projects[1].attachments.length, 0);
    assert.deepEqual(f.calls.viewer, ['report']);
    f.h.dispose();
  }
});

test('an early selected read rejection is handled while the public bundle is pending and retry refreshes both', async () => {
  const pending = deferred();
  let attempts = 0;
  const f = fixture({ initial: ['creator', 'report', 'documents'], shared: () => attempts === 0 ? pending.promise : Promise.resolve(bundle()),
    view: async () => { if (attempts++ === 0) throw new Error('Selected document offline'); return fullView(); } });
  await f.h.flush();
  assert.equal(f.h.value.status, 'loading');
  pending.resolve(bundle());
  await f.h.flush();
  assert.equal(f.h.value.status, 'error');
  assert.equal(f.h.value.profile, null);
  assert.match(f.h.value.error, /Selected document offline/);
  f.h.value.retry();
  await f.h.flush();
  assert.equal(f.h.value.status, 'ready');
  assert.deepEqual(f.calls.bundle, ['creator', 'creator']);
  assert.deepEqual(f.calls.viewer, ['report', 'report']);
  f.h.dispose();
});

test('first-link selected reads never bypass wrong, private, failed, or missing public bundle membership', async () => {
  for (const compact of [bundle('Wrong', { id: 'other' }), bundle('Private', { isPrivate: true })]) {
    const f = fixture({ initial: ['creator', 'report', 'documents'], shared: async () => compact });
    await f.h.flush();
    assert.equal(f.h.value.status, 'not-found');
    assert.equal(f.h.value.profile, null);
    f.h.options(['creator', null, null]);
    await f.h.flush();
    assert.equal(f.h.value.profile, null, 'An invalid bundle cannot enter the reusable grid cache.');
    f.h.dispose();
  }
  const failed = fixture({ initial: ['creator', 'report', 'documents'], shared: async () => { throw new Error('Bundle offline'); }, view: async () => { throw new Error('Selected offline'); } });
  await failed.h.flush();
  assert.equal(failed.h.value.status, 'error');
  assert.equal(failed.h.value.profile, null);
  assert.match(failed.h.value.error, /Bundle offline/);
  failed.h.dispose();
  for (const route of [['creator', 'hidden-report', 'documents'], ['creator', 'report', 'hidden-category']]) {
    const f = fixture({ initial: route });
    await f.h.flush();
    assert.deepEqual(f.calls.viewer, [route[1]]);
    assert.equal(f.h.value.status, 'ready');
    assert.ok(!f.h.value.profile.projects.some(project => project.id === route[1] && project.categoryId === route[2]));
    assert.equal(f.h.value.profile.projects.every(project => project.attachments.length === 0), true);
    f.h.dispose();
  }
});

test('an absent profile route is idle and makes no content requests', async () => {
  const f = fixture({ initial: [null, null, null] });
  await f.h.flush();
  assert.equal(f.h.value.status, 'idle');
  assert.equal(f.h.value.profile, null);
  assert.deepEqual(f.calls.bundle, []); assert.deepEqual(f.calls.viewer, []);
  f.h.dispose();
});
