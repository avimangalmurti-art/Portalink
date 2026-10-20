import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';
import { hookHarness } from './helpers/hook-harness.mjs';

const corePath = 'src/presentation/mobile/mobileResumeState.ts';
const core = sourceModule(corePath);
const now = 1800000000000;
const account = 'account-a';
const project = '/p/creator/c/portal/project';
const plain = value => JSON.parse(JSON.stringify(value));
function storage() {
  const values = new Map();
  return { values, reads: 0, writes: 0, removals: 0,
    getItem(key) { this.reads += 1; return values.get(key) ?? null; },
    setItem(key, value) { this.writes += 1; values.set(key, value); },
    removeItem(key) { this.removals += 1; values.delete(key); },
  };
}
const input = patch => ({ mobile: true, accountId: account, authReady: false, pathname: '/', search: '', hash: '', locationKey: 'opening', ...patch });
const record = path => ({ version: 1, accountId: account, savedAt: now, path });

test('one account record retains one feed and reader context without content, files or navigation history', () => {
  const store = storage(), options = { storage: store, now };
  assert.equal(core.saveMobileResumeFeed(account, '/', { scrollTop: 636, loadedCount: 24, anchorId: 'card-7', anchorOffset: -3.5 }, options), true);
  assert.equal(core.saveMobileResumeRoute(account, project, options), true);
  assert.equal(core.saveMobileResumeReader(account, project, { page: 7, zoom: 2.2, scrollTop: 80, scrollLeft: 42 }, options), true);
  assert.deepEqual(plain(core.readMobileResume(account, options)), {
    ...record(project), feed: { path: '/', scrollTop: 636, loadedCount: 24, anchorId: 'card-7', anchorOffset: -3.5 },
    reader: { path: project, page: 7, zoom: 2.2, scrollTop: 80, scrollLeft: 42 },
  });
  assert.equal(store.values.size, 1);
  core.saveMobileResumeFeed(account, '/portalink/5391959', { scrollTop: 50, loadedCount: 12 }, options);
  const saved = core.readMobileResume(account, options);
  assert.equal(saved.path, project); assert.equal(saved.feed.path, '/portalink/5391959');
  assert.equal(store.values.size, 1);
  assert.equal([...store.values.values()][0].length < core.MOBILE_RESUME_MAX_BYTES, true);
});

test('record access is account scoped, and clearing one account leaves another untouched', () => {
  const store = storage(), options = { storage: store, now };
  core.saveMobileResumeRoute(account, project, options);
  assert.equal(core.readMobileResume('account-b', options), null);
  core.saveMobileResumeRoute('account-b', '/saved', options);
  core.clearMobileResume(account, options);
  assert.equal(core.readMobileResume(account, options), null);
  assert.equal(core.readMobileResume('account-b', options).path, '/saved');
});

test('only safe canonical read destinations and verified query fields round-trip', () => {
  const safe = ['/', '/portalink', '/portalink/5391959', '/studio', '/saved', '/p/a', '/p/a?view=portals', '/p/a?view=followers', '/p/a/c/b', project, `${project}?media=attachment-1&page=7&view=page`];
  for (const path of safe) assert.equal(core.safeMobileResumePath(path), path, path);
  const unsafe = [
    'https://portalinknetworks.com/p/a', '//evil.example/p/a', '/p/a#code=secret', '/?welcome=1', '/?code=secret', '/?entry=oauth',
    '/?auth=signIn', '/settings', '/appearance', '/profile/edit', '/messages', '/messages?conversation=private', '/search?q=private', '/share/a',
    '/p/a?share=portfolio', '/p/a?startHere=b', '/p/a?journeyPair=b', '/studio?collection=drafts', '/p/a?view=projects&view=portals',
    `${project}?page=0`, `${project}?page=10001`, `${project}?page=1.5`, `${project}?view=page`, `${project}?media=https://signed.example/token`,
    '/p/%61', '/p/a\\b', '/p/a b', '/p/../a', '/p/a/', '/p/a?view=portals?', '/p/a?', '/p/a?view=portals#',
  ];
  for (const path of unsafe) assert.equal(core.safeMobileResumePath(path), null, path);
});

test('expiry, future clocks, wrong account and unknown schema fields fail closed and remove only the bad record', () => {
  const variants = [
    { savedAt: now - core.MOBILE_RESUME_TTL_MS - 1 }, { savedAt: now + 1 }, { savedAt: Infinity },
    { version: 2 }, { accountId: 'other-account' }, { path: '/settings' }, { token: 'private' },
    { feed: { path: '/', scrollTop: 20, loadedCount: 12, cards: [{ title: 'private' }] } },
    { reader: { path: project, page: 1, signedUrl: 'https://media.example/token' } },
  ];
  for (const patch of variants) {
    const store = storage(), options = { storage: store, now };
    core.saveMobileResumeRoute(account, project, options);
    const key = [...store.values.keys()][0];
    store.values.set(key, JSON.stringify({ ...record(project), ...patch }));
    assert.equal(core.readMobileResume(account, options), null, JSON.stringify(patch));
    assert.equal(store.values.has(key), false);
  }
  const store = storage(), options = { storage: store, now };
  core.saveMobileResumeRoute(account, project, { ...options, now: now - core.MOBILE_RESUME_TTL_MS });
  assert.equal(core.readMobileResume(account, options).path, project, 'Exactly24hours is still valid');
});

test('malformed or oversized storage cannot throw or restore a destination', () => {
  for (const raw of ['{', 'null', '[]', JSON.stringify('oops'), 'x'.repeat(core.MOBILE_RESUME_MAX_BYTES + 1)]) {
    const store = storage(), options = { storage: store, now };
    core.saveMobileResumeRoute(account, project, options);
    store.values.set([...store.values.keys()][0], raw);
    assert.equal(core.readMobileResume(account, options), null);
  }
});

test('unavailable storage is optional for reads, writes and clearing', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  for (const store of [null, denied]) {
    const options = { storage: store, now };
    assert.equal(core.readMobileResume(account, options), null);
    assert.equal(core.saveMobileResumeRoute(account, project, options), false);
    assert.equal(core.saveMobileResumeFeed(account, '/', { scrollTop: 1, loadedCount: 12 }, options), false);
    assert.equal(core.saveMobileResumeReader(account, project, { page: 1 }, options), false);
    assert.doesNotThrow(() => core.clearMobileResume(account, options));
  }
});

test('state writes reject private fields, unsupported paths, invalid values and excessive recovery requests', () => {
  const store = storage(), options = { storage: store, now };
  const invalidFeeds = [
    { scrollTop: -1, loadedCount: 12 }, { scrollTop: Infinity, loadedCount: 12 }, { scrollTop: 1, loadedCount: 121 },
    { scrollTop: 1, loadedCount: 12.5 }, { scrollTop: 1, loadedCount: 12, anchorId: 'https://signed.example' },
    { scrollTop: 1, loadedCount: 12, anchorOffset: 3 }, { scrollTop: 1, loadedCount: 12, cards: [] },
  ];
  for (const state of invalidFeeds) assert.equal(core.saveMobileResumeFeed(account, '/', state, options), false);
  assert.equal(core.saveMobileResumeFeed(account, project, { scrollTop: 1, loadedCount: 12 }, options), false);
  for (const state of [{}, { page: 0 }, { page: 10001 }, { page: 1.2 }, { zoom: .5 }, { zoom: 8.1 }, { scrollTop: NaN }, { scrollLeft: 1000001 }, { page: 1, sourceUrl: 'private' }]) {
    assert.equal(core.saveMobileResumeReader(account, project, state, options), false, JSON.stringify(state));
  }
  assert.equal(core.saveMobileResumeReader(account, '/', { page: 1 }, options), false);
  assert.equal(core.saveMobileResumeRoute('../account', project, options), false);
  assert.equal(store.values.size, 0);
});

test('initial plain mobile root waits for auth, selects once, and then yields to navigation', () => {
  const initial = input(), session = new core.MobileResumeSession(initial); let reads = 0;
  const read = id => { reads += 1; assert.equal(id, account); return record(project); };
  assert.equal(session.update(initial, read), null); assert.equal(reads, 0);
  const ready = input({ authReady: true });
  assert.equal(session.update(ready, read), project); assert.equal(session.canCheckpoint(ready), false);
  const launchRecord = session.launchRecord;
  assert.equal(launchRecord.path, project);
  assert.equal(session.update(ready, read), project); assert.equal(reads, 1);
  const destination = input({ authReady: true, pathname: project, locationKey: 'resumed' });
  assert.equal(session.update(destination, read), null); assert.equal(session.canCheckpoint(destination), true);
  assert.equal(session.launchRecord, launchRecord, 'Eligiblecoldlaunchcontext survives ordinary navigation');
  assert.equal(session.update(input({ authReady: true, locationKey: 'home-navigation' }), read), null);
  assert.equal(reads, 1, 'NormalHome entry never replays the destination');
});

test('explicit deep links and root query/hash arrivals win without reading stored state', () => {
  for (const patch of [{ pathname: project }, { search: '?welcome=1' }, { search: '?code=secret' }, { hash: '#access_token=secret' }, { pathname: `${project}?page=2` }]) {
    const initial = input(patch), session = new core.MobileResumeSession(initial);
    assert.equal(session.update({ ...initial, authReady: true }, () => { throw new Error('Must not read'); }), null);
    assert.equal(session.launchRecord, null);
  }
});

test('Web opening, user navigation before auth, blocked entry and guest completion permanently cancel auto-resume', () => {
  const noRead = () => { throw new Error('Unexpected restore'); };
  const web = new core.MobileResumeSession(input({ mobile: false }));
  assert.equal(web.update(input({ authReady: true }), noRead), null, 'Resize to mobile is not a new launch');
  const navigated = new core.MobileResumeSession(input());
  navigated.update(input({ pathname: '/saved', locationKey: 'user-entry' }), noRead);
  assert.equal(navigated.update(input({ authReady: true }), noRead), null);
  const blocked = new core.MobileResumeSession(input());
  blocked.update(input({ blocked: true }), noRead);
  assert.equal(blocked.update(input({ authReady: true }), noRead), null);
  const guest = new core.MobileResumeSession(input());
  guest.update(input({ authReady: true, accountId: null }), noRead);
  assert.equal(guest.update(input({ authReady: true }), noRead), null, 'Signing in later is not cold reopen');
});

test('signout or account switch cancels a selected redirect and cannot checkpoint the inherited route', () => {
  for (const next of [null, 'account-b']) {
    const session = new core.MobileResumeSession(input());
    assert.equal(session.update(input({ authReady: true }), () => record(project)), project);
    const changed = input({ authReady: true, accountId: next });
    assert.equal(session.update(changed, () => { throw new Error('Must not restore another account'); }), null);
    assert.equal(session.launchRecord, null);
    assert.equal(session.canCheckpoint(changed), false);
    const newNavigation = { ...changed, pathname: '/saved', locationKey: 'new-account-entry' };
    session.update(newNavigation);
    assert.equal(session.canCheckpoint(newNavigation), Boolean(next));
  }
});

test('identity loss invalidates a launch immediately even while the replacement auth state is initializing', () => {
  const session = new core.MobileResumeSession(input());
  session.update(input({ authReady: true }), () => record(project));
  assert.equal(session.launchRecord.path, project);
  assert.equal(session.update(input({ authReady: false, accountId: null })), null);
  assert.equal(session.launchRecord, null);
  assert.equal(session.update(input({ authReady: true }), () => { throw new Error('Do not resume twice'); }), null);
});

function eventHub(extra = {}) {
  const handlers = new Map();
  return { ...extra, handlers,
    addEventListener(type, callback) { const bucket = handlers.get(type) ?? new Set(); bucket.add(callback); handlers.set(type, bucket); },
    removeEventListener(type, callback) { handlers.get(type)?.delete(callback); },
    fire(type) { for (const callback of [...handlers.get(type) ?? []]) callback({ type }); },
  };
}
function hookFixture(initial = input({ authReady: true })) {
  const store = storage(), timers = new Map(); let timer = 0;
  const window = eventHub({ localStorage: store, setTimeout(callback) { timers.set(++timer, callback); return timer; }, clearTimeout(id) { timers.delete(id); } });
  const document = eventHub({ visibilityState: 'visible' });
  const actual = sourceModule(corePath, {}, { window });
  const h = hookHarness(new URL('../src/presentation/mobile/useMobileResumeSession.ts', import.meta.url), 'useMobileResumeSession', {}, {}, initial, {}, { './mobileResumeState': actual }, { window, document });
  return { h, store, window, document, timers, actual,
    flushTimers() { const pending = [...timers.values()]; timers.clear(); for (const callback of pending) callback(); },
  };
}

test('the real hook offers a stored redirect before mounting Home and does not overwrite it while Navigate settles', async () => {
  const f = hookFixture();
  f.actual.saveMobileResumeRoute(account, project);
  await f.h.flush(); assert.equal(f.h.value.resumeTo, project); assert.equal(f.timers.size, 0);
  assert.equal(f.h.value.launchRecord.path, project);
  f.h.value.checkpoint(); f.window.fire('pagehide');
  assert.equal(f.actual.readMobileResume(account).path, project);
  f.h.options(input({ authReady: true, pathname: project, locationKey: 'resume-entry' })); await f.h.flush();
  assert.equal(f.h.value.resumeTo, null); assert.equal(f.timers.size, 1);
  assert.equal(f.h.value.launchRecord.path, project);
  f.flushTimers(); assert.equal(f.actual.readMobileResume(account).path, project); f.h.dispose();
});

test('real hook checkpoints current safe route on settle/hide and cancels stale route timers', async () => {
  const f = hookFixture(); await f.h.flush();
  f.h.options(input({ authReady: true, pathname: '/saved', locationKey: 'saved-entry' })); await f.h.flush();
  assert.equal(f.timers.size, 1); f.flushTimers(); assert.equal(f.actual.readMobileResume(account).path, '/saved');
  f.h.options(input({ authReady: true, pathname: project, locationKey: 'project-entry' })); await f.h.flush();
  f.document.visibilityState = 'hidden'; f.document.fire('visibilitychange');
  assert.equal(f.actual.readMobileResume(account).path, project);
  f.h.options(input({ authReady: true, pathname: '/profile/edit', locationKey: 'editor-entry', blocked: true })); await f.h.flush();
  assert.equal(f.timers.size, 0); f.window.fire('pagehide'); assert.equal(f.actual.readMobileResume(account).path, project);
  f.h.dispose(); assert.equal(f.window.handlers.get('pagehide')?.size ?? 0, 0); assert.equal(f.document.handlers.get('visibilitychange')?.size ?? 0, 0);
});

test('real hook clears old-account device hints on signout and never restores a second account mid-session', async () => {
  const f = hookFixture(); f.actual.saveMobileResumeRoute(account, '/saved'); await f.h.flush();
  f.h.options(input({ authReady: true, accountId: null })); await f.h.flush();
  assert.equal(f.h.value.resumeTo, null); assert.equal(f.actual.readMobileResume(account), null);
  assert.equal(f.h.value.launchRecord, null);
  f.actual.saveMobileResumeRoute('account-b', project);
  f.h.options(input({ authReady: true, accountId: 'account-b' })); await f.h.flush();
  assert.equal(f.h.value.resumeTo, null); f.flushTimers();
  assert.equal(f.actual.readMobileResume('account-b').path, project, 'Accountswitch does not inheritoldroute'); f.h.dispose();
});

test('real hook on Web never touches localStorage or registers resume lifecycle listeners', async () => {
  const f = hookFixture(input({ mobile: false, authReady: true })); await f.h.flush();
  f.h.value.checkpoint(); f.flushTimers(); f.window.fire('pagehide');
  assert.equal(f.store.reads, 0); assert.equal(f.store.writes, 0); assert.equal(f.store.removals, 0);
  assert.equal(f.h.value.launchRecord, null);
  assert.equal(f.window.handlers.size, 0); f.h.dispose();
});

test('Home-only reopen exposes the launch feed record without a redundant redirect', async () => {
  const f = hookFixture();
  f.actual.saveMobileResumeFeed(account, '/', { scrollTop: 604, loadedCount: 24, anchorId: 'card-7', anchorOffset: 16 });
  await f.h.flush();
  assert.equal(f.h.value.resumeTo, null); assert.equal(f.h.value.launchRecord.path, '/');
  assert.equal(f.h.value.launchRecord.feed.loadedCount, 24);
  f.h.options(input({ authReady: true, mobile: false })); await f.h.flush();
  assert.equal(f.h.value.launchRecord, null, 'Changing to Web invalidates launch-only restoration');
  f.h.options(input({ authReady: true, mobile: true })); await f.h.flush();
  assert.equal(f.h.value.launchRecord, null, 'Resizing back never reconstructs a launch');
  f.h.dispose();
});

test('a mobile-owned hint is cleared on signout even after rotation crosses the Web breakpoint', async () => {
  const f = hookFixture(); f.actual.saveMobileResumeRoute(account, '/saved'); await f.h.flush();
  f.h.options(input({ mobile: false, authReady: true })); await f.h.flush();
  assert.equal(f.h.value.launchRecord, null);
  f.h.options(input({ mobile: false, authReady: true, accountId: null })); await f.h.flush();
  assert.equal(f.actual.readMobileResume(account), null); f.h.dispose();
});

test('reader entries preserve exact existing rendered/live/image memory values without index conversion', () => {
  const store = storage(), options = { storage: store, now };
  const entries = [
    { key: 'workspace:project:project', state: { activeAttachmentId: 'attachment-1' } },
    { key: 'workspace:project:project:density:images', state: { pagesPerRow: 3 } },
    { key: 'workspace:images:project', state: { focusedPageId: 'image-2', lastFocusedPageId: 'image-2', scrollTop: 604 } },
    { key: 'workspace:images:project:image-2', state: { zoom: 2.2, scrollTop: 42, scrollLeft: 17 } },
    { key: 'workspace:document:project:attachment-1:rendered', state: { focusedPageNumber: 0, lastFocusedPageNumber: 0 } },
    { key: 'workspace:document:project:attachment-1:live:page:1', state: { zoom: 2, scrollTop: 8, scrollLeft: 9 } },
  ];
  assert.equal(core.saveMobileResumeReader(account, project, { entries }, options), true);
  assert.deepEqual(plain(core.readMobileResume(account, options).reader.entries), entries);
  assert.equal(core.saveMobileResumeReader(account, project, { entries: [{ key: 'workspace:images:project', state: { focusedPageId: null, lastFocusedPageId: null, activeAttachmentId: null, focusedPageNumber: null, lastFocusedPageNumber: null } }] }, options), true);
  assert.equal(core.readMobileResume(account, options).reader.entries[0].state.focusedPageId, null);
});

test('reader entries reject other projects, arbitrary namespaces, URLs, duplicates, excessive counts and unsafe state fields', () => {
  const invalid = [
    [{ key: 'workspace:project:other-project', state: { zoom: 2 } }],
    [{ key: 'workspace:project:project-extended', state: { zoom: 2 } }],
    [{ key: 'shared:project:project', state: { zoom: 2 } }],
    [{ key: 'arbitrary:cache:project', state: { zoom: 2 } }],
    [{ key: 'workspace:images:project:attachment/path', state: { zoom: 2 } }],
    [{ key: 'workspace:images:project?token=secret', state: { zoom: 2 } }],
    [{ key: 'workspace:images:project#page', state: { zoom: 2 } }],
    [{ key: 'workspace:document:project:attachment:live:page:10001', state: { zoom: 2 } }],
    [{ key: 'workspace:images:project', state: { sourceUrl: 'https://signed.example' } }],
    [{ key: 'workspace:images:project', state: { focusedPageId: 'https://signed.example' } }],
    [{ key: 'workspace:images:project', state: { lastFocusedPageId: '../private' } }],
    [{ key: 'workspace:images:project', state: { activeAttachmentId: '' } }],
    [{ key: 'workspace:images:project', state: { focusedPageNumber: -1 } }],
    [{ key: 'workspace:images:project', state: { lastFocusedPageNumber: 1.5 } }],
    [{ key: 'workspace:images:project', state: { pagesPerRow: 10 } }],
    [{ key: 'workspace:images:project', state: { zoom: NaN } }],
    [{ key: 'workspace:images:project', state: {} }],
    [{ key: 'workspace:images:project', state: { zoom: 2 }, token: 'private' }],
    [{ key: 'workspace:images:project', state: { zoom: 2 } }, { key: 'workspace:images:project', state: { zoom: 3 } }],
    Array.from({ length: 7 }, (_, i) => ({ key: `workspace:images:project:image-${i}`, state: { zoom: 2 } })),
    [],
  ];
  const store = storage(), options = { storage: store, now };
  for (const entries of invalid) assert.equal(core.saveMobileResumeReader(account, project, { entries }, options), false, JSON.stringify(entries));
  assert.equal(store.values.size, 0);
});
