import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { Upload as TusUpload } from 'tus-js-client';
import * as core from '../public/portalink-media-core.js';
import { sourceModule } from './helpers/source-module.mjs';

const endpoint = 'https://test.storage.supabase.co/storage/v1/upload/resumable';
const tick = async () => { for (let i = 0; i < 16; i++) await new Promise(setImmediate); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function database() {
  const rows = new Map(); let created = false;
  return { rows, open() {
    const request = {};
    setImmediate(() => {
      request.result = { createObjectStore() { created = true; }, close() {}, transaction() {
        let pending = 0, ended = false;
        const tx = { abort() { ended = true; tx.onabort?.(); }, objectStore() {
          const run = action => { pending++; const req = {}; setImmediate(() => {
            if (ended) return;
            req.result = action();
            try { req.onsuccess?.(); } catch { tx.abort(); }
            pending--; if (!pending) setImmediate(() => { if (!pending && !ended) { ended = true; tx.oncomplete?.(); } });
          }); return req; };
          return { getAll: () => run(() => [...rows.values()]), put: row => run(() => rows.set(row.key, structuredClone(row))), delete: key => run(() => rows.delete(key)) };
        } }; return tx;
      } };
      request.transaction = { abort() { request.onerror?.(); } };
      if (!created) request.onupgradeneeded?.(); request.onsuccess?.();
    }); return request;
  } };
}
const recoveryModule = (db = database(), globals = {}) => sourceModule('src/services/supabase/mobileUploadRecovery.ts', {}, { indexedDB: db, TextEncoder, Uint8Array, ...globals });
const item = (body = 'artwork', id = 'asset-one') => ({ id, file: new File([body], 'work.pdf', { type: 'application/pdf', lastModified: 123 }), fileName: 'work.pdf', sizeBytes: body.length, mimeType: 'application/pdf', processingState: 'ready', order: 0, family: 'document', typeLabel: 'PDF', capability: 'native', isCover: true });
const prior = (url = `${endpoint}/opaque-upload-id`, size = 7) => ({ uploadUrl: url, size, metadata: { authorization: 'must-not-persist' }, creationTime: 'ignored', parallelUploadUrls: null });

test('full file hashing is stable across relaunch and separates same-metadata byte changes, accounts and drafts', async () => {
  const h = recoveryModule(), original = item('x'.repeat(6 * 1024 * 1024 + 12));
  const id = await h.mobileUploadObjectId('account', 'profile', 'draft', original, () => false);
  const reopened = { ...original, file: new File([original.file], original.fileName, { type: original.mimeType, lastModified: 123 }) };
  assert.equal(await h.mobileUploadObjectId('account', 'profile', 'draft', reopened, () => false), id);
  const changed = item('x'.repeat(100) + 'y' + 'x'.repeat(original.sizeBytes - 101));
  assert.notEqual(await h.mobileUploadObjectId('account', 'profile', 'draft', changed, () => false), id);
  assert.notEqual(await h.mobileUploadObjectId('other', 'profile', 'draft', original, () => false), id);
  assert.notEqual(await h.mobileUploadObjectId('account', 'profile', 'other-draft', original, () => false), id);
  let checks = 0;
  assert.equal(await h.mobileUploadObjectId('account', 'profile', 'draft', original, () => ++checks > 1), null);
  await assert.rejects(h.mobileUploadObjectId('../bad', 'profile', 'draft', original, () => false));
});

test('TUS handles round-trip in dedicated storage with account/file/size/fingerprint checks and no auth or viewing URL', async () => {
  const db = database(), h = recoveryModule(db);
  const storage = h.mobileUploadUrlStorage('account', 'profile/draft/object.pdf', endpoint, 7, { objectName: 'profile/draft/object.pdf' });
  await storage.addUpload('fingerprint', prior());
  const stored = [...db.rows.values()][0];
  assert.deepEqual(Object.keys(stored).sort(), ['accountId', 'createdAt', 'fingerprint', 'key', 'objectPath', 'size', 'uploadUrl'].sort());
  assert.doesNotMatch(JSON.stringify(stored), /authorization|must-not-persist|signedUrl|access_token/);
  const reopened = recoveryModule(db).mobileUploadUrlStorage('account', 'profile/draft/object.pdf', endpoint, 7, {});
  assert.equal((await reopened.findUploadsByFingerprint('fingerprint'))[0].uploadUrl, `${endpoint}/opaque-upload-id`);
  assert.equal((await reopened.findUploadsByFingerprint('other')).length, 0);
  assert.equal((await h.mobileUploadUrlStorage('other', 'profile/draft/object.pdf', endpoint, 7, {}).findAllUploads()).length, 0);
  assert.equal((await h.mobileUploadUrlStorage('account', 'profile/draft/object.pdf', endpoint, 8, {}).findAllUploads()).length, 0);
  await reopened.removeUpload('another-account:key'); assert.equal(db.rows.size, 1);
  await reopened.removeUpload(stored.key); assert.equal(db.rows.size, 0);
});

test('unsafe, expired, corrupt and oversized recovery entries cannot select a TUS destination', async () => {
  const db = database(), h = recoveryModule(db), storage = h.mobileUploadUrlStorage('account', 'object', endpoint, 7, {});
  for (const url of ['https://evil.test/storage/v1/upload/resumable/id', `${endpoint}?token=secret`, `${endpoint}/id?token=secret`, `${endpoint}/id#secret`, 'https://user:password@test.storage.supabase.co/storage/v1/upload/resumable/id', `${endpoint}/../../object/id`, endpoint, endpoint.replace('https:', 'http:') + '/id']) {
    await assert.rejects(storage.addUpload('fingerprint', prior(url)));
  }
  for (let i = 0; i < 260; i++) await h.mobileUploadUrlStorage('account', `object-${i}`, endpoint, 7, {}).addUpload('fingerprint', prior());
  assert.equal(db.rows.size, 256);
  const row = [...db.rows.values()][0]; row.createdAt = Date.now() - 24 * 60 * 60 * 1000;
  db.rows.set('corrupt', { key: 'corrupt', uploadUrl: 'https://evil.test' });
  const fresh = recoveryModule(db).mobileUploadUrlStorage('account', row.objectPath, endpoint, 7, {});
  assert.equal((await fresh.findAllUploads()).length, 0);
});

test('installed tus4.3.1 uses a saved URL to HEAD the server offset and sends only the remainder after relaunch', async () => {
  const db = database(), body = Buffer.from('abcdef'); let offset = 0, failPatch = true;
  const requests = [];
  const stack = { getName: () => 'test', createRequest(method, url) {
    const headers = {};
    return { getMethod: () => method, getURL: () => url, setHeader: (key, value) => { headers[key] = value; }, getHeader: key => headers[key], setProgressHandler() {}, abort: async () => {}, getUnderlyingObject: () => null,
      async send(bytes) {
        requests.push([method, bytes?.length ?? 0]);
        if (method === 'PATCH' && failPatch) { failPatch = false; throw new Error('Connection interrupted'); }
        if (method === 'POST' || method === 'PATCH') offset += bytes?.length ?? 0;
        return { getStatus: () => method === 'POST' ? 201 : method === 'HEAD' ? 200 : 204, getHeader: key => ({ Location: `${endpoint}/session-id`, 'Upload-Offset': String(offset), 'Upload-Length': '6' })[key], getBody: () => '', getUnderlyingObject: () => null };
      },
    };
  } };
  const create = h => {
    let upload;
    const completion = new Promise(resolve => { upload = new TusUpload(body, { endpoint, chunkSize: 3, retryDelays: null, uploadDataDuringCreation: true, removeFingerprintOnSuccess: true,
      fingerprint: async () => 'same-file', urlStorage: h.mobileUploadUrlStorage('account', 'object', endpoint, 6, {}), httpStack: stack,
      fileReader: { openFile: async file => ({ size: file.length, slice: async (start, end) => ({ value: Object.assign(file.slice(start, end), { size: end - start }), done: end >= file.length }), close() {} }) },
      onSuccess: () => resolve('success'), onError: error => resolve(error),
    }); });
    return { upload, completion };
  };
  const first = create(recoveryModule(db)); first.upload.start(); assert.match((await first.completion).message, /Connection interrupted/); assert.equal(offset, 3);
  const second = create(recoveryModule(db)), matches = await second.upload.findPreviousUploads();
  assert.equal(matches.length, 1); second.upload.resumeFromPreviousUpload(matches[0]); second.upload.start();
  assert.equal(await second.completion, 'success'); assert.equal(offset, 6);
  assert.deepEqual(requests, [['POST', 3], ['PATCH', 3], ['HEAD', 0], ['PATCH', 3]]);
  await tick(); assert.equal(db.rows.size, 0);
});

function serviceHarness({ hashGate, checkpointGate, hash = async (_a, _p, _d, media) => media.id, signedFailure = false } = {}) {
  const uploads = [], objects = new Set(), checkpoints = [], manifests = [];
  const db = database(), helper = recoveryModule(db); let account = 'account', accessToken = 'in-memory-only', sequence = 0;
  class Upload {
    constructor(body, options) { this.body = body; this.options = options; this.aborts = []; uploads.push(this); }
    findPreviousUploads() { return this.options.urlStorage.findUploadsByFingerprint(`portalink:${this.options.metadata.objectName}`); }
    resumeFromPreviousUpload(previous) { this.previous = previous; }
    async start() {
      await this.options.onBeforeRequest?.({ getMethod: () => this.previous ? 'HEAD' : 'POST', setHeader() {} });
      this.url = this.previous?.uploadUrl ?? `${endpoint}/session-${++sequence}`;
      this.key = await this.options.urlStorage?.addUpload(`portalink:${this.options.metadata.objectName}`, prior(this.url, this.body.size));
      this.started = true;
    }
    async succeed() { objects.add(this.options.metadata.objectName); await this.options.urlStorage.removeUpload(this.key); this.options.onSuccess(); }
    fail() { this.options.onError(new Error('Network failed')); }
    async abort(terminate) { this.aborts.push(terminate); if (terminate && this.key) await this.options.urlStorage.removeUpload(this.key); }
  }
  const bucket = {
    exists: async path => ({ data: objects.has(path), error: null }),
    upload: async (path, body) => { manifests.push(path); objects.add(path); return { error: null }; },
    createSignedUrl: async path => signedFailure ? { error: new Error('Signing unavailable') } : { data: { signedUrl: `view/${path}` }, error: null },
  };
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: account }, access_token: accessToken } }, error: null }) }, storage: { from: () => bucket } };
  class UploadServiceError extends Error { constructor(value) { super(value.message); Object.assign(this, value); } }
  const source = ts.transpileModule(readFileSync(new URL('../src/services/supabase/mediaService.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, URL, Blob, Error, crypto, require(name) {
    if (name === '../../types/publishing') return { UploadServiceError, ProcessingServiceError: Error };
    if (name === './client') return { requireSupabase: () => client, requireSupabaseProjectUrl: () => 'https://test.supabase.co' };
    if (name === './contentServices') return { PROJECT_MEDIA_BUCKET: 'project-media' };
    if (name === './mediaProcessingReads') return { supabaseMediaProcessingReadService: {} };
    if (name === '../../../public/portalink-media-core.js') return core;
    if (name === './mobileUploadRecovery') return { ...helper, mobileUploadObjectId: async (...args) => { if (hashGate) await hashGate.promise; return args.at(-1)() ? null : hash(...args); } };
    if (name === './multipartMedia') return { ...core, ensureMultipartReader: async () => {}, multipartSource: async path => `view/${path}`, removeStoredMedia: async paths => { paths.forEach(path => objects.delete(path)); } };
    if (name === 'tus-js-client') return { Upload };
    throw new Error(name);
  } });
  return { uploads, objects, checkpoints, manifests, db, service: exports.supabaseMediaService,
    setAccount(value) { account = value; }, setAccessToken(value) { accessToken = value; }, setSigningFailure(value) { signedFailure = value; },
    start: media => exports.supabaseMediaService.startUpload({ profileId: 'profile', draftId: 'draft', deviceRecovery: { accountId: 'account' }, media,
      onCheckpoint: async refs => { checkpoints.push(refs); if (checkpointGate) await checkpointGate.promise; },
    }),
  };
}

/** The installed browser stack calls this native-XHR boundary, where repeated
 * setRequestHeader values append instead of overwriting the TUS header map. */
function browserTransport({ failFirstPatch = false, holdPatch = false } = {}) {
  const requests = []; let offset = 0;
  class AppendXHR {
    constructor() { this.headers = new Map(); this.writes = []; this.upload = {}; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) {
      const key = name.toLowerCase(); this.writes.push([key, value]);
      this.headers.set(key, this.headers.has(key) ? `${this.headers.get(key)}, ${value}` : value);
    }
    getResponseHeader(name) { return this.responseHeaders?.get(name.toLowerCase()) ?? null; }
    abort() { this.aborted = true; }
    send(body) {
      requests.push({ method: this.method, authorization: this.headers.get('authorization'), authorizationWrites: this.writes.filter(([name]) => name === 'authorization').length });
      if (this.method === 'PATCH' && holdPatch) return;
      setImmediate(() => {
        if (this.aborted) return;
        if (this.method === 'PATCH' && failFirstPatch) {
          failFirstPatch = false; this.onerror?.(new Error('Connection interrupted')); return;
        }
        if (this.method === 'POST' || this.method === 'PATCH') offset += body?.size ?? 0;
        this.status = this.method === 'POST' ? 201 : this.method === 'HEAD' ? 200 : 204;
        this.responseText = '';
        this.responseHeaders = new Map([['location', `${endpoint}/native-session`], ['upload-offset', String(offset)], ['upload-length', '7']]);
        this.onload?.();
      });
    }
  }
  const { default: XHRHttpStack } = sourceModule('node_modules/tus-js-client/lib/browser/httpStack.js', {}, { XMLHttpRequest: AppendXHR });
  return { requests, stack: new XHRHttpStack() };
}
function browserUpload(delegate, transport) {
  let upload;
  const completion = new Promise((resolve, reject) => {
    upload = new TusUpload(delegate.body, { ...delegate.options, chunkSize: 3, retryDelays: null, httpStack: transport.stack,
      fileReader: { openFile: async file => ({ size: file.size, slice: async (start, end) => ({ value: file.slice(start, end), done: end >= file.size }), close() {} }) },
      onSuccess: resolve, onError: reject,
    });
  });
  return { upload, completion };
}

test('production recovery options send one Authorization through installed browser XHR for POST, resumed HEAD and PATCH; WEB keeps its snapshot', async () => {
  const h = serviceHarness(), operation = await h.start([item()]); await tick();
  const delegate = h.uploads[0], transport = browserTransport({ failFirstPatch: true });
  h.db.rows.clear(); // Remove the capture harness's placeholder; exercise actual TUS storage below.
  const first = browserUpload(delegate, transport); first.upload.start();
  await assert.rejects(first.completion, /Connection interrupted/);
  h.setAccessToken('refreshed-in-memory-only');
  const resumed = browserUpload(delegate, transport), previous = await resumed.upload.findPreviousUploads();
  assert.equal(previous.length, 1); resumed.upload.resumeFromPreviousUpload(previous[0]); resumed.upload.start();
  await resumed.completion;
  assert.deepEqual(transport.requests, [
    { method: 'POST', authorization: 'Bearer in-memory-only', authorizationWrites: 1 },
    { method: 'PATCH', authorization: 'Bearer in-memory-only', authorizationWrites: 1 },
    { method: 'HEAD', authorization: 'Bearer refreshed-in-memory-only', authorizationWrites: 1 },
    { method: 'PATCH', authorization: 'Bearer refreshed-in-memory-only', authorizationWrites: 1 },
    { method: 'PATCH', authorization: 'Bearer refreshed-in-memory-only', authorizationWrites: 1 },
  ]);
  await operation.suspend();

  const web = serviceHarness(), webOperation = await web.service.startUpload({ profileId: 'profile', draftId: 'draft', media: [item()] }); await tick();
  const webDelegate = web.uploads[0], webTransport = browserTransport();
  assert.equal(webDelegate.options.onBeforeRequest, undefined);
  web.setAccessToken('a-later-token');
  const ordinary = browserUpload(webDelegate, webTransport); ordinary.upload.start(); await ordinary.completion;
  assert.deepEqual(webTransport.requests.map(request => [request.method, request.authorization, request.authorizationWrites]), [
    ['POST', 'Bearer in-memory-only', 1], ['PATCH', 'Bearer in-memory-only', 1], ['PATCH', 'Bearer in-memory-only', 1],
  ]);
  await web.service.cancelUpload(webOperation.uploadId);
});

test('production recovery Cancel sends one freshly authorized DELETE through installed browser XHR after transfer stops', async () => {
  const h = serviceHarness(), operation = await h.start([item()]); await tick();
  const delegate = h.uploads[0], transport = browserTransport({ holdPatch: true }), actual = browserUpload(delegate, transport);
  delegate.abort = terminate => actual.upload.abort(terminate);
  actual.upload.start(); await tick();
  assert.deepEqual(transport.requests.map(request => request.method), ['POST', 'PATCH']);
  h.setAccessToken('refreshed-before-cancel');
  await h.service.cancelUpload(operation.uploadId);
  assert.equal((await operation.completion).status, 'cancelled');
  assert.deepEqual(transport.requests, [
    { method: 'POST', authorization: 'Bearer in-memory-only', authorizationWrites: 1 },
    { method: 'PATCH', authorization: 'Bearer in-memory-only', authorizationWrites: 1 },
    { method: 'DELETE', authorization: 'Bearer refreshed-before-cancel', authorizationWrites: 1 },
  ]);
});

test('durable cleanup checkpoint precedes bytes and a signing failure retries the completed object without uploading again', async () => {
  const gate = deferred(), h = serviceHarness({ checkpointGate: gate, signedFailure: true });
  const first = await h.start([item()]); const failed = first.completion.catch(error => error); await tick();
  assert.equal(h.checkpoints.length, 1); assert.equal(h.uploads.length, 0); assert.equal(h.checkpoints[0][0].sourceUrl, null);
  gate.resolve(); await tick(); assert.equal(h.uploads.length, 1); await h.uploads[0].succeed();
  const error = await failed; assert.equal(error.cleanupRequired, false); assert.equal(error.persisted.length, 1);
  h.setSigningFailure(false);
  const next = await h.start([item()]); assert.equal((await next.completion).status, 'uploaded'); assert.equal(h.uploads.length, 1);
  assert.equal(h.checkpoints[0][0].storagePath, h.checkpoints[1][0].storagePath);
});

test('multipart retry skips completed parts and resumes the failed part at the same path without another manifest', async () => {
  const h = serviceHarness(), media = { ...item(), sizeBytes: core.PART_BYTES * 2 + 5, file: { size: core.PART_BYTES * 2 + 5, slice: (start, end) => ({ size: Math.min(end, core.PART_BYTES * 2 + 5) - start }) } };
  const first = await h.start([media]), failed = first.completion.catch(error => error); await tick();
  assert.equal(h.uploads.length, 3); await h.uploads[0].succeed(); await h.uploads[1].succeed(); h.uploads[2].fail();
  assert.equal((await failed).cleanupRequired, false); assert.equal(h.manifests.length, 0);
  const next = await h.start([media]); await tick(); assert.equal(h.uploads.length, 4);
  assert.equal(h.uploads[3].options.metadata.objectName, h.uploads[2].options.metadata.objectName); assert.ok(h.uploads[3].previous);
  await h.uploads[3].succeed(); assert.equal((await next.completion).status, 'uploaded'); assert.equal(h.manifests.length, 1);
  const completed = await h.start([media]); assert.equal((await completed.completion).status, 'uploaded'); assert.equal(h.uploads.length, 4); assert.equal(h.manifests.length, 1);
});

test('cancellation during hashing and an account change during async restore never start a transfer', async () => {
  const gate = deferred(), cancelled = serviceHarness({ hashGate: gate });
  const operation = await cancelled.start([item()]); await tick();
  const cancellation = cancelled.service.cancelUpload(operation.uploadId); gate.resolve();
  assert.equal((await cancellation).status, 'cancelled'); assert.equal(cancelled.uploads.length, 0); assert.equal(cancelled.checkpoints.length, 0);
  const otherGate = deferred(), switched = serviceHarness({ hashGate: otherGate });
  const stale = await switched.start([item()]), outcome = stale.completion.catch(error => error); await tick(); switched.setAccount('other'); otherGate.resolve();
  assert.match((await outcome).message, /Sign in to its account/); assert.equal(switched.uploads.length, 0); assert.equal(switched.checkpoints.length, 0);
});

function hookHarness(service = {}) {
  const slots = [], effects = []; let cursor = 0, accountId = 'account', enabled = true, unmounted = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const slot = initialize => { const index = cursor++; return slots[index] ??= initialize(); };
  const memo = (fn, deps) => { const state = slot(() => ({})); if (!same(state.deps, deps)) { state.value = fn(); state.deps = deps; } return state.value; };
  const react = {
    useRef: value => slot(() => ({ current: value })),
    useState: initial => { const state = slot(() => ({ value: initial })); return [state.value, next => { assert.equal(unmounted, false, 'An unmounted mobile operation cannot update UI'); state.value = typeof next === 'function' ? next(state.value) : next; }]; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => { const state = slot(() => ({})); if (!same(state.deps, deps)) effects.push(() => { state.cleanup?.(); state.cleanup = fn(); state.deps = deps; }); },
  };
  class UploadServiceError extends Error { constructor(value) { super(value.message); Object.assign(this, value); } }
  const { useMediaUpload } = sourceModule('src/features/publishing/useMediaUpload.ts', {
    react, '../../contexts/ServicesContext': { useServices: () => ({ media: service }) },
    '../media/persistedMediaAttachments': { attachmentsFromPersistedMedia: (_media, stored) => stored.filter(item => item.storagePath).map(item => ({ id: item.objectId, storagePath: item.storagePath })) },
    '../../types/publishing': { UploadServiceError },
  });
  const h = { service, UploadServiceError, render(change = {}) {
    if ('accountId' in change) accountId = change.accountId; if ('enabled' in change) enabled = change.enabled;
    cursor = 0; h.output = useMediaUpload({ isAvailable: true }, accountId ? { accountId, enabled } : undefined);
    effects.splice(0).forEach(run => run());
    return h.output;
  }, unmount() { slots.forEach(state => state.cleanup?.()); unmounted = true; } };
  h.render(); return h;
}
const storedFile = (id = 'file') => ({ preparedId: 'asset-one', objectId: id, storagePath: `profile/draft/${id}`, sourceUrl: null });

test('mobile cleanup and Cancel late completions cannot overwrite a new account or reset opening', async () => {
  const transfer = deferred(), cancel = deferred(), deletion = deferred(); let suspends = 0;
  const h = hookHarness({ startUpload: async input => { await input.onCheckpoint([storedFile()]); return { uploadId: 'upload', completion: transfer.promise, suspend: async () => { suspends++; } }; }, cancelUpload: () => cancel.promise, deleteMedia: () => deletion.promise });
  const uploading = h.output.upload({ profileId: 'profile', draftId: 'draft', media: [item()], onCheckpoint: async () => {} });
  await tick(); h.render(); const cancelling = h.output.cancel();
  h.render({ accountId: 'other' }); h.render();
  assert.equal(h.output.phase, 'idle'); assert.equal(h.output.persisted.length, 0); assert.equal(suspends, 1);
  const cancelled = { status: 'cancelled', persisted: [storedFile()], cleanupRequired: true };
  cancel.resolve(cancelled); transfer.resolve(cancelled); await cancelling; await uploading; h.render();
  assert.equal(h.output.phase, 'idle'); assert.equal(h.output.failure, null); assert.equal(h.output.persisted.length, 0);
  h.output.restore({ persisted: [storedFile('old')], attachments: [] }, [item()]); h.render();
  const cleaning = h.output.cleanupPersisted(); h.output.reset(); h.render(); deletion.reject(new Error('Late cleanup failure'));
  assert.equal(await cleaning, false); h.render();
  assert.equal(h.output.isCleaningUp, false); assert.equal(h.output.cleanupError, null); assert.equal(h.output.persisted.length, 0);
});

test('responsive presentation change preserves an in-flight mobile operation; unmount suspends without late UI writes', async () => {
  const transfer = deferred(); let suspends = 0;
  const h = hookHarness({ startUpload: async input => { await input.onCheckpoint([storedFile()]); return { uploadId: 'upload', completion: transfer.promise, suspend: async () => { suspends++; } }; } });
  const uploading = h.output.upload({ profileId: 'profile', draftId: 'draft', media: [item()], onCheckpoint: async () => {} });
  await tick(); h.render({ enabled: false });
  transfer.resolve({ status: 'uploaded', media: [storedFile()] }); assert.ok(await uploading); h.render();
  assert.equal(h.output.phase, 'uploaded'); assert.equal(h.output.isBusy, false); assert.equal(suspends, 0);
  const pending = deferred(), start = deferred();
  const other = hookHarness({ startUpload: () => start.promise });
  const late = other.output.upload({ profileId: 'profile', draftId: 'draft', media: [item()], onCheckpoint: async () => {} });
  other.unmount(); start.resolve({ uploadId: 'late', completion: pending.promise, suspend: async () => { suspends++; pending.resolve({ status: 'cancelled', persisted: [], cleanupRequired: false }); } });
  assert.equal(await late, null); assert.equal(suspends, 1);
});

test('all failure types retain the cleanup ledger, and a superseded path is removed only after successful cleanup', async () => {
  let calls = 0, cleanupFails = true;
  const h = hookHarness({
    startUpload: async input => {
      await input.onCheckpoint([storedFile('new')]);
      if (++calls === 1) throw new Error('Transport interrupted before typed outcome');
      return { uploadId: 'upload', completion: Promise.resolve({ status: 'uploaded', media: [storedFile('new')] }) };
    },
    deleteMedia: async id => { assert.equal(id, 'old'); if (cleanupFails) throw new Error('Cleanup offline'); },
  });
  h.output.restore({ persisted: [storedFile('old')], attachments: [] }, [item()]); h.render();
  const input = { profileId: 'profile', draftId: 'draft', media: [item()], onCheckpoint: async () => {} };
  assert.equal(await h.output.upload(input), null); h.render();
  assert.deepEqual(Array.from(h.output.getCheckpoint().persisted, item => item.objectId).sort(), ['new', 'old']);
  assert.equal(await h.output.retry({ profileId: 'profile', draftId: 'draft' }), null); h.render();
  assert.deepEqual(Array.from(h.output.getCheckpoint().persisted, item => item.objectId).sort(), ['new', 'old']);
  cleanupFails = false;
  assert.ok(await h.output.retry({ profileId: 'profile', draftId: 'draft' })); h.render();
  assert.equal(h.output.phase, 'uploaded'); assert.deepEqual(Array.from(h.output.getCheckpoint().persisted, item => item.objectId), ['new']);
});

test('a recovery request without a durable cleanup callback fails before any service or transfer work', async () => {
  const h = hookHarness({ startUpload: () => assert.fail('An uncheckpointed upload must not start') });
  assert.equal(await h.output.upload({ profileId: 'profile', draftId: 'draft', media: [item()] }), null); h.render();
  assert.match(h.output.failure.message, /Save this draft/);
  const service = serviceHarness();
  await assert.rejects(service.service.startUpload({ profileId: 'profile', draftId: 'draft', media: [item()], deviceRecovery: { accountId: 'account' } }), /Save this draft/);
  assert.equal(service.uploads.length, 0);
});

test('installed TUS explicit Cancel authenticates DELETE, while lifecycle suspension preserves its handle', async () => {
  for (const terminate of [false, true]) {
    const h = serviceHarness(), operation = await h.start([item()]); await tick();
    const delegate = h.uploads[0], requests = [], pending = deferred(); let offset = 0;
    const actual = new TusUpload(item().file, { ...delegate.options, chunkSize: 3, retryDelays: null,
      fileReader: { openFile: async file => ({ size: file.size, slice: async (start, end) => ({ value: file.slice(start, end), done: end >= file.size }), close() {} }) },
      httpStack: { getName: () => 'test', createRequest(method, url) {
        const headers = {};
        return { getMethod: () => method, getURL: () => url, getHeader: key => headers[key], setHeader: (key, value) => { headers[key] = value; }, setProgressHandler() {}, getUnderlyingObject: () => null,
          abort: async () => { if (method === 'PATCH') pending.reject(new Error('Request aborted')); },
          send: async body => {
            requests.push(method); assert.equal(headers.authorization, 'Bearer in-memory-only');
            if (method === 'PATCH') return pending.promise;
            if (method === 'POST') offset += body.size;
            return { getStatus: () => method === 'POST' ? 201 : 204, getHeader: key => ({ Location: `${endpoint}/cancel-session`, 'Upload-Offset': String(offset), 'Upload-Length': '7' })[key], getBody: () => '', getUnderlyingObject: () => null };
          },
        };
      } },
    });
    delegate.abort = value => actual.abort(value);
    actual.start(); await tick(); assert.deepEqual(requests, ['POST', 'PATCH']);
    if (terminate) await h.service.cancelUpload(operation.uploadId); else await operation.suspend();
    assert.equal((await operation.completion).status, 'cancelled');
    assert.deepEqual(requests, terminate ? ['POST', 'PATCH', 'DELETE'] : ['POST', 'PATCH']);
    await tick();
    assert.equal(h.db.rows.size, terminate ? 0 : 1);
  }
});

test('a paused operation cannot send a POST/PATCH after an asynchronous authorization gate completes', async () => {
  const h = serviceHarness(), operation = await h.start([item()]); await tick();
  const request = h.uploads[0].options.onBeforeRequest, gate = deferred();
  // The actual callback must recheck cancellation after its authorization await.
  const pending = request({ getMethod: () => 'PATCH', setHeader() { gate.resolve('sent'); } });
  const paused = operation.suspend();
  await assert.rejects(pending, /Upload stopped/); await paused;
  assert.equal(await Promise.race([gate.promise, Promise.resolve('not sent')]), 'not sent');
});

test('publishing recovery stays latched when a caller changes its opt-in during resize; fresh opt-outs remain ordinary', async () => {
  const slots = [], effects = [], saves = [], uploadOptions = []; let cursor = 0, presentation = 'mobile', open = true, creates = 0, reads = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const slot = initialize => { const index = cursor++; return slots[index] ??= initialize(); };
  const memo = (fn, deps) => { const state = slot(() => ({})); if (!same(state.deps, deps)) { state.value = fn(); state.deps = deps; } return state.value; };
  const react = { useRef: value => slot(() => ({ current: value })), useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useState: value => { const state = slot(() => ({ value: typeof value === 'function' ? value() : value })); return [state.value, next => { state.value = typeof next === 'function' ? next(state.value) : next; }]; },
    useEffect: (fn, deps) => { const state = slot(() => ({})); if (!same(state.deps, deps)) effects.push(() => { state.cleanup?.(); state.cleanup = fn(); state.deps = deps; }); },
  };
  const draft = { id: 'saved-draft', profileId: 'profile', categoryId: 'portal', metadata: { title: 'Saved title', summary: '' } };
  const saved = { version: 1, accountId: 'account', profileId: 'profile', draft, metadata: draft.metadata, location: '', stage: 'files', media: [item()], persisted: [], attachments: [] };
  const media = { items: [], isComplete: true, capability: { isAvailable: true }, clear() { this.items = []; }, restore: files => { media.items = files; } };
  const upload = { persisted: [], attachments: [], phase: 'idle', isBusy: false,
    reset: () => { upload.persisted = []; upload.attachments = []; },
    restore: value => { upload.persisted = value.persisted; upload.attachments = value.attachments; },
    getCheckpoint: () => ({ persisted: upload.persisted, attachments: upload.attachments }),
  };
  const services = { projects: { getDraft: async () => { reads++; return draft; }, createDraft: async () => { creates++; return { ...draft, id: 'fresh-web-draft' }; }, updateDraft: async () => draft }, profiles: {} };
  const { usePublishProject } = sourceModule('src/features/publishing/usePublishProject.ts', {
    react, './firstProject': { EMPTY_CREATION: {}, composeProjectDescription: () => '' },
    './firstProjectDraft': { readFirstProjectDraft: async () => saved, saveFirstProjectDraft: async value => { saves.push(value); }, clearFirstProjectDraft() {}, clearDraftWorkspace() {}, draftWorkspaceFingerprint: value => JSON.stringify([value.metadata, value.media.map(item => item.id), value.persisted.map(item => item.objectId)]) },
    './setupDraft': { readSetupDraft: () => null, clearSetupDraft() {} },
    '../../contexts/ServicesContext': { useServices: () => services }, '../../contexts/ProfileDataContext': { useProfileData: () => ({ invalidateProfiles() {}, cacheProfile() {} }) },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'account' }, viewerProfileId: 'profile' }) },
    '../../hooks/useAsyncAction': { useAsyncAction: run => ({ run, status: 'idle', isLoading: false }) },
    './useMediaPreparation': { useMediaPreparation: () => media }, './useMediaUpload': { useMediaUpload: (_cap, options) => { uploadOptions.push(options); return upload; } },
    './validation': { validateTitle: () => null }, '../../domain/discovery/ranking': { deriveProjectRelevance: () => ({}) },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
  }, { structuredClone, window: { addEventListener() {}, removeEventListener() {} }, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} } });
  const render = () => {
    cursor = 0;
    // Exercise a caller withdrawing its opt-in across the breakpoint. The shared
    // dialog now keeps persist:true; an existing opening must still stay latched.
    const output = usePublishProject('profile', 'portal', open, 'Work', presentation === 'mobile', false, '', { persist: presentation === 'mobile', resume: presentation === 'mobile' ? draft : undefined, awaitProfile: presentation === 'mobile' });
    effects.splice(0).forEach(run => run()); return output;
  };
  let output = render(); await tick(); output = render(); await tick(); output = render();
  assert.equal(output.draft.id, 'saved-draft'); assert.equal(reads, 1); assert.equal(creates, 0);
  presentation = 'web'; output = render(); await tick(); output = render();
  assert.equal(output.draft.id, 'saved-draft'); assert.equal(output.isOpeningCurrent(), true); assert.equal(creates, 0); assert.equal(reads, 1);
  assert.equal(uploadOptions.at(-1).enabled, true);
  output.setField('title', 'Edited after resize'); output = render(); await output.saveLocalDraft();
  assert.equal(saves.at(-1).draft.id, 'saved-draft'); assert.equal(saves.at(-1).metadata.title, 'Edited after resize');
  open = false; render(); open = true; render(); await tick(); output = render();
  assert.equal(uploadOptions.at(-1).enabled, false); assert.equal(creates, 1); assert.equal(output.draft.id, 'fresh-web-draft');
  slots.forEach(state => state.cleanup?.());
});
