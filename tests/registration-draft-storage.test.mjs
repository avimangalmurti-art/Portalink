const shareModel = sourceModule('src/features/sharing/shareModel.ts');
import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import vm from 'node:vm';
import ts from 'typescript';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = path => ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const validation = {};
vm.runInNewContext(compile('src/features/profile/validation.ts'), { exports: validation, require(name) { assert.equal(name,'../sharing/shareModel'); return shareModel; } });
const tick = () => new Promise(resolve => setImmediate(resolve));
const lifetime = 7 * 24 * 60 * 60 * 1000;
const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const profile = (id = firstId, extra = {}) => ({ version: 1, id, name: '  Creator  ', location: '  London  ', isPrivate: true,
  accentColor: '#0A84FF', systemGray: 'gray3', hasAvatar: true, returnPath: '/share/creator?view=portals&access_token=omit', ...extra });
const prepared = (text = 'image bytes') => ({ file: new File([text], 'cropped.webp', { type: 'image/webp' }), previewUrl: 'blob:temporary-preview',
  originalSource: new File(['original image'], 'original.jpg', { type: 'image/jpeg' }), fileName: 'cropped.webp', sizeBytes: text.length, isPersisted: false,
  crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.7, zoom: 1.25 } });

// A request/transaction mock, not a browser emulator: queued requests share an
// isolated snapshot, publish only on commit, and roll back together on failure.
function fakeIndexedDB({ version = 0, initial = {} } = {}) {
  const clone = value => {
    if (value instanceof File) return new File([value], value.name, { type: value.type, lastModified: value.lastModified });
    if (value instanceof Blob) return new Blob([value], { type: value.type });
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
  };
  const state = { version, stores: new Map(Object.entries(initial).map(([name, records]) => [name, new Map(records.map(record => [record.id, clone(record)]))])),
    opened: 0, closed: 0, upgrades: 0, failPut: null, failCommit: false, openFailure: false, blocked: false, releaseBlocked: null };
  const transactions = [];
  let running = false;
  function nextTransaction() {
    if (running || !transactions.length) return;
    running = true;
    const start = transactions.shift();
    start(() => { running = false; nextTransaction(); });
  }
  function transaction(names, mode) {
    const included = Array.isArray(names) ? names : [names];
    const operations = [];
    let local, ended = false, finish, scheduled = false;
    const tx = { error: null, abort: () => fail(new Error('Aborted')), objectStore(name) {
      assert.ok(included.includes(name), `Store ${name} must be in the transaction`);
      const request = action => {
        const result = {};
        operations.push(() => { result.result = action(local.get(name)); result.onsuccess?.(); });
        schedule(); return result;
      };
      return {
        get: key => request(store => clone(store.get(key))),
        getAll: () => request(store => [...store.values()].map(clone)),
        put: value => request(store => {
          assert.equal(mode, 'readwrite');
          if (state.failPut === name) { state.failPut = null; throw new Error(`Failed ${name} write`); }
          store.set(value.id, clone(value)); return value.id;
        }),
        delete: key => request(store => { assert.equal(mode, 'readwrite'); store.delete(key); }),
        openCursor() {
          const cursorRequest = {}; let keys, position = 0;
          const advance = () => {
            operations.push(() => {
              keys ??= [...local.get(name).keys()].sort();
              const key = keys[position++];
              cursorRequest.result = key === undefined ? null : {
                value: clone(local.get(name).get(key)),
                continue: advance,
                delete: () => request(store => store.delete(key)),
              };
              cursorRequest.onsuccess?.();
            });
            schedule();
          };
          advance(); return cursorRequest;
        },
      };
    } };
    function fail(error) {
      if (ended) return;
      ended = true; tx.error = error;
      queueMicrotask(() => { tx.onerror?.(); tx.onabort?.(); finish?.(); });
    }
    function schedule() {
      if (!local || scheduled || ended) return;
      scheduled = true;
      setImmediate(() => {
        scheduled = false;
        if (ended) return;
        try {
          if (operations.length) { operations.shift()(); schedule(); return; }
          if (state.failCommit) { state.failCommit = false; throw new Error('Commit failed'); }
          for (const [name, records] of local) state.stores.set(name, records);
          ended = true; tx.oncomplete?.(); finish();
        } catch (error) { fail(error); }
      });
    }
    transactions.push(done => {
      finish = done;
      local = new Map(included.map(name => [name, new Map([...state.stores.get(name)].map(([key, value]) => [key, clone(value)]))]));
      schedule();
    });
    nextTransaction();
    return tx;
  }
  const indexedDB = { open(name, requestedVersion) {
    assert.equal(name, 'portalink-registration');
    const request = {};
    setImmediate(() => {
      if (state.openFailure) { request.error = new Error('Storage unavailable'); request.onerror?.(); return; }
      const complete = () => {
        let closed = false;
        const database = {
          objectStoreNames: { contains: name => state.stores.has(name) },
          createObjectStore(name, options) { assert.equal(options.keyPath, 'id'); assert.equal(state.stores.has(name), false); state.stores.set(name, new Map()); },
          transaction,
          close() { if (!closed) { state.closed++; closed = true; } },
        };
        state.opened++; request.result = database;
        if (requestedVersion > state.version) { state.upgrades++; state.version = requestedVersion; request.onupgradeneeded?.(); }
        request.onsuccess?.();
      };
      if (state.blocked) { state.releaseBlocked = complete; request.onblocked?.(); }
      else complete();
    });
    return request;
  } };
  return { indexedDB, state };
}

function harness(options) {
  const db = fakeIndexedDB(options);
  const clock = { now: 1800000000000 };
  function load() {
    const exports = {};
    vm.runInNewContext(compile('src/features/auth/registration.ts'), {
      exports, File, Blob, URL, indexedDB: db.indexedDB,
      Date: class extends Date { static now() { return clock.now; } },
      require(name) { if(name==='../sharing/shareModel')return shareModel; assert.equal(name, '../profile/validation'); return validation; },
    });
    return exports;
  }
  return { ...db, clock, load, api: load() };
}

test('signup draft survives a new module/tab with allowlisted profile, normalized email and File bytes', async () => {
  const h = harness(), avatar = prepared();
  avatar.crop.password = 'omit';
  await h.api.saveRegistrationDraft({ ...profile(), password: 'omit', access_token: 'omit', accountId: 'omit' }, '  Creator@Example.TEST ', avatar);
  const draft = await h.load().readRegistrationDraft('creator@example.test', firstId);
  assert.equal(draft.email, 'creator@example.test');
  assert.equal(draft.registration.name, 'Creator');
  assert.equal(draft.registration.location, 'London');
  assert.equal(draft.registration.isPrivate, true);
  assert.equal(draft.registration.systemGray, 'gray3');
  assert.equal(draft.registration.returnPath, '/share/creator?view=portals');
  assert.equal(draft.requiresEmailVerification, false);
  assert.equal(draft.expiresAt, h.clock.now + lifetime);
  assert.ok(draft.avatar.file instanceof File);
  assert.equal(draft.avatar.file.name, 'cropped.webp');
  assert.equal(await draft.avatar.file.text(), 'image bytes');
  assert.equal(await draft.avatar.originalSource.text(), 'original image');
  assert.equal(draft.avatar.crop.zoom, 1.25);
  const stored = JSON.stringify([...h.state.stores.values()].flatMap(store => [...store.values()]));
  for (const forbidden of ['password', 'access_token', 'accountId', 'previewUrl', 'temporary-preview']) assert.equal(stored.includes(forbidden), false);
  assert.equal(h.state.closed, h.state.opened);
});

test('optional system grey is normalized without discarding a valid registration', () => {
  const h = harness();
  for (const systemGray of ['gray', 'gray2', 'gray3', 'gray4', 'gray5', 'gray6']) assert.equal(h.api.readRegistrationProfile(profile(firstId, { systemGray })).systemGray, systemGray);
  for (const systemGray of ['gray1', 'gray7', 'url(unsafe)', null, 3, undefined]) {
    const value = h.api.readRegistrationProfile(profile(firstId, { systemGray }));
    assert.equal(value.name, 'Creator'); assert.equal(value.systemGray, undefined);
  }
});

test('invalid profile, email or promised image rejects before storage opens', async () => {
  const h = harness();
  for (const [registration, email, avatar] of [
    [profile(firstId, { name: '' }), 'creator@example.test', prepared()],
    [profile(), 'not-email', prepared()],
    [profile(), 'creator@example.test', null],
    [profile(), 'creator@example.test', { ...prepared(), file: new File(['text'], 'text.txt', { type: 'text/plain' }) }],
    [profile(), 'creator@example.test', { ...prepared(), file: new File([], 'empty.webp', { type: 'image/webp' }) }],
    [profile(), 'creator@example.test', { ...prepared(), file: new File([new Uint8Array(4194305)], 'large.webp', { type: 'image/webp' }) }],
    [profile(firstId, { hasAvatar: false }), 'creator@example.test', prepared()],
  ]) await assert.rejects(h.api.saveRegistrationDraft(registration, email, avatar));
  assert.equal(h.state.opened, 0);
});

test('newest matching draft is deterministic across same-millisecond tab writes; filters cannot cross accounts', async () => {
  const h = harness();
  await h.api.saveRegistrationDraft(profile(), 'first@example.test', prepared());
  await h.load().saveRegistrationDraft(profile(secondId, { hasAvatar: false }), 'second@example.test', null);
  assert.equal((await h.api.readRegistrationDraft()).registration.id, secondId);
  assert.equal((await h.api.readRegistrationDraft(' FIRST@EXAMPLE.TEST ')).registration.id, firstId);
  assert.equal((await h.api.readRegistrationDraft(undefined, firstId)).email, 'first@example.test');
  assert.equal(await h.api.readRegistrationDraft('second@example.test', firstId), null);
  assert.equal(await h.api.readRegistrationDraft('bad-email'), null);
  assert.equal((await h.api.readRegistrationDraft(undefined, secondId)).avatar, null);
});

test('verification marker is idempotent, record-specific and preserves bytes, expiry and saved ordering', async () => {
  const h = harness();
  await h.api.saveRegistrationDraft(profile(), 'first@example.test', prepared());
  const first = h.state.stores.get('drafts').get(firstId);
  h.clock.now += 1000;
  await h.api.saveRegistrationDraft(profile(secondId, { hasAvatar: false }), 'second@example.test', null);
  await h.api.markRegistrationVerification(firstId);
  await h.api.markRegistrationVerification(firstId);
  const marked = h.state.stores.get('drafts').get(firstId);
  assert.deepEqual(marked, { ...first, requiresEmailVerification: true });
  assert.equal((await h.api.readRegistrationDraft()).registration.id, secondId);
  assert.equal((await h.api.readRegistrationDraft(undefined, secondId)).requiresEmailVerification, false);
  assert.equal(await (await h.api.readRegistrationDraft(undefined, firstId)).avatar.file.text(), 'image bytes');
  await h.api.markRegistrationVerification('missing');
  assert.equal(h.state.stores.get('drafts').size, 2);
});

test('avatar write or final commit failure rolls the complete update back', async () => {
  const h = harness();
  await h.api.saveRegistrationDraft(profile(), 'first@example.test', prepared('original'));
  for (const mode of ['write', 'commit']) {
    if (mode === 'write') h.state.failPut = 'avatars';
    else h.state.failCommit = true;
    await assert.rejects(h.api.saveRegistrationDraft(profile(firstId, { name: 'Changed' }), 'changed@example.test', prepared('replacement')));
    const draft = await h.api.readRegistrationDraft(undefined, firstId);
    assert.equal(draft.registration.name, 'Creator');
    assert.equal(draft.email, 'first@example.test');
    assert.equal(await draft.avatar.file.text(), 'original');
  }
  h.state.failCommit = true;
  await assert.rejects(h.api.readRegistrationDraft(), /Commit failed/);
  assert.equal(h.state.closed, h.state.opened);
});

test('seven-day expiry is enforced and pruned from both stores without deleting a newer draft', async () => {
  const h = harness();
  await h.api.saveRegistrationDraft(profile(), 'first@example.test', prepared());
  h.clock.now += lifetime - 1;
  assert.ok(await h.api.readRegistrationDraft(undefined, firstId));
  await h.api.saveRegistrationDraft(profile(secondId), 'second@example.test', prepared());
  h.clock.now++;
  assert.equal(await h.api.readRegistrationDraft(undefined, firstId), null);
  assert.equal(h.state.stores.get('drafts').has(firstId), false);
  assert.equal(h.state.stores.get('avatars').has(firstId), false);
  assert.equal((await h.api.readRegistrationDraft()).registration.id, secondId);
});

test('v1 upgrade retains image-only drafts and old avatar APIs remain compatible', async () => {
  const oldImage = { id: firstId, expiresAt: 1800000000000 + lifetime, file: prepared().file, originalSource: prepared().originalSource, crop: prepared().crop };
  const h = harness({ version: 1, initial: { avatars: [oldImage] } });
  assert.equal(await (await h.api.readRegistrationAvatar(firstId)).file.text(), 'image bytes');
  assert.equal(h.state.version, 2); assert.equal(h.state.upgrades, 1);
  assert.ok(h.state.stores.has('drafts'));
  assert.equal(await h.api.readRegistrationDraft(), null);
  await h.api.saveRegistrationAvatar(secondId, prepared('second'));
  assert.equal(await (await h.api.readRegistrationAvatar(secondId)).file.text(), 'second');
  await h.api.removeRegistrationAvatar(firstId);
  assert.equal(await h.api.readRegistrationAvatar(firstId), null);
  assert.ok(await h.api.readRegistrationAvatar(secondId));
});

test('missing image retains saved fields; completed-record cleanup removes only that draft and image', async () => {
  const h = harness();
  await h.api.saveRegistrationDraft(profile(), 'first@example.test', prepared());
  await h.api.saveRegistrationDraft(profile(secondId), 'second@example.test', prepared());
  await h.api.removeRegistrationAvatar(firstId);
  const missing = await h.api.readRegistrationDraft(undefined, firstId);
  assert.equal(missing.registration.name, 'Creator'); assert.equal(missing.registration.hasAvatar, true); assert.equal(missing.avatar, null);
  h.state.failCommit = true;
  await h.api.removeRegistrationDraft(secondId);
  assert.ok(await h.api.readRegistrationDraft(undefined, secondId), 'Failed cleanup must preserve the atomic record.');
  await h.api.removeRegistrationDraft(secondId);
  assert.equal(await h.api.readRegistrationDraft(undefined, secondId), null);
  assert.equal(await h.api.readRegistrationAvatar(secondId), null);
  assert.ok(await h.api.readRegistrationDraft(undefined, firstId));
  h.state.openFailure = true;
  await h.api.removeRegistrationDraft(firstId);
  await h.api.removeRegistrationAvatar(firstId);
});

test('blocked upgrade rejects and closes a connection that opens after rejection', async () => {
  const h = harness(); h.state.blocked = true;
  await assert.rejects(h.api.readRegistrationDraft(), /Close other setup tabs/);
  h.state.releaseBlocked(); await tick();
  assert.equal(h.state.opened, 1); assert.equal(h.state.closed, 1);
});
