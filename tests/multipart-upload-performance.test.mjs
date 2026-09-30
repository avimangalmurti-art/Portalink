import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from '../public/portalink-media-core.js';

const source = ts.transpileModule(readFileSync(new URL('../src/services/supabase/mediaService.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const prepared = (sizeBytes, id = 'file') => ({ id, fileName: `${id}.pdf`, mimeType: 'application/pdf', sizeBytes, processingState: 'ready', metadata: {},
  file: { size: sizeBytes, slice: (start, end) => ({ size: end - start, start, end }) },
});

function harness({ sessionError = null, importFailure = false } = {}) {
  const uploads = [], active = new Set(), manifests = [], signed = [], virtual = [], removed = [], progress = [];
  let sessionReads = 0, imports = 0, maximumActive = 0, sequence = 0;
  class Upload {
    constructor(body, options) { this.body = body; this.options = options; this.abortGate = deferred(); this.abortCalls = 0; uploads.push(this); }
    start() { active.add(this); maximumActive = Math.max(maximumActive, active.size); }
    bytes(bytes) { this.options.onProgress(bytes); }
    succeed() { active.delete(this); this.options.onSuccess(); }
    fail() { active.delete(this); this.options.onError(new Error('Part transfer failed')); }
    abort(terminate) {
      assert.equal(terminate, true); this.abortCalls++;
      return this.abortGate.promise.finally(() => { active.delete(this); });
    }
  }
  const bucket = {
    async upload(path, body, options) { manifests.push({ path, manifest: JSON.parse(await body.text()), options }); return { error: null }; },
    async createSignedUrl(path) { signed.push(path); return { data: { signedUrl: `signed/${path}` }, error: null }; },
  };
  const client = { auth: { async getSession() { sessionReads++; return { data: { session: sessionError ? null : { access_token: `test-file-token-${sessionReads}` } }, error: sessionError }; } }, storage: { from: () => bucket } };
  class UploadServiceError extends Error { constructor(value) { super(value.message); Object.assign(this, value); } }
  const exports = {};
  vm.runInNewContext(source, { exports, URL, Blob, Error, crypto: { randomUUID: () => `id-${++sequence}` }, require(name) {
    if (name === '../../types/publishing') return { UploadServiceError, ProcessingServiceError: Error };
    if (name === './client') return { requireSupabase: () => client, requireSupabaseProjectUrl: () => 'https://test.supabase.co' };
    if (name === './contentServices') return { PROJECT_MEDIA_BUCKET: 'project-media' };
    if (name === './mediaProcessingReads') return { supabaseMediaProcessingReadService: {} };
    if (name === '../../../public/portalink-media-core.js') return core;
    if (name === './multipartMedia') return { ...core, ensureMultipartReader: async () => {},
      multipartSource: async (...args) => { virtual.push(args); return `virtual/${args[0]}`; },
      removeStoredMedia: async paths => { assert.equal(active.size, 0, 'Cleanup must never race an active or aborting part'); removed.push(...paths); },
    };
    if (name === 'tus-js-client') { imports++; if (importFailure) throw new Error('Upload client unavailable'); return { Upload }; }
    throw new Error(`Unexpected module ${name}`);
  } });
  const service = exports.supabaseMediaService;
  return { service, uploads, active, manifests, signed, virtual, removed, progress,
    start: media => service.startUpload({ profileId: 'owner', draftId: 'draft', media, onProgress: state => progress.push(state) }),
    get sessionReads() { return sessionReads; }, get imports() { return imports; }, get maximumActive() { return maximumActive; },
  };
}

test('three concurrent parts share one file token, preserve byte order and write the manifest only after all parts', async () => {
  const h = harness(), size = core.PART_BYTES * 4 + 123;
  assert.equal(h.imports, 0);
  const operation = await h.start([prepared(size)]); await tick();
  assert.equal(h.uploads.length, 3); assert.equal(h.active.size, 3); assert.equal(h.sessionReads, 1);
  h.uploads[2].bytes(core.PART_BYTES / 2); h.uploads[0].bytes(500); h.uploads[0].bytes(20);
  h.uploads[1].bytes(core.PART_BYTES * 3); // A noisy retry callback cannot exceed this part's size.
  h.uploads[1].succeed(); await tick();
  assert.equal(h.uploads.length, 4); assert.equal(h.manifests.length, 0);
  h.uploads[0].succeed(); await tick();
  assert.equal(h.uploads.length, 5); assert.equal(h.manifests.length, 0);
  h.uploads[4].succeed(); h.uploads[2].succeed(); await tick();
  assert.equal(h.manifests.length, 0, 'The unfinished fourth part still blocks the manifest.');
  h.uploads[3].succeed();
  const result = await operation.completion;
  assert.equal(result.status, 'uploaded'); assert.equal(h.maximumActive, 3); assert.equal(h.active.size, 0);
  assert.equal(h.sessionReads, 1); assert.equal(h.manifests.length, 1); assert.equal(h.virtual.length, 1);
  const manifest = h.manifests[0];
  assert.equal(manifest.manifest.partCount, 5); assert.equal(manifest.manifest.sizeBytes, size);
  assert.equal(manifest.options.cacheControl, '31536000'); assert.equal(manifest.options.upsert, false);
  h.uploads.forEach((upload, index) => {
    assert.equal(upload.options.metadata.objectName, core.partPath(manifest.path, index));
    assert.equal(upload.body.start, index * core.PART_BYTES);
    assert.equal(upload.body.end, Math.min(size, (index + 1) * core.PART_BYTES));
    assert.equal(upload.options.headers.authorization, 'Bearer test-file-token-1');
    assert.equal(upload.options.metadata.cacheControl, '31536000');
    assert.equal(upload.options.chunkSize, 6 * 1024 * 1024);
  });
  assert.ok(h.progress.every((entry, i) => entry.bytesSent <= size && entry.fraction <= 1 && (!i || entry.bytesSent >= h.progress[i - 1].bytesSent)));
  assert.equal(h.progress.at(-1).bytesSent, size); assert.equal(h.progress.at(-1).items.file.state, 'uploaded');
});

test('cancel aborts and drains every active part before returning cleanup paths and schedules no new part', async () => {
  const h = harness(); const operation = await h.start([prepared(core.PART_BYTES * 6)]); await tick();
  let completed = false; operation.completion.then(() => { completed = true; });
  const cancellation = h.service.cancelUpload(operation.uploadId);
  const cleanup = cancellation.then(async outcome => { await h.service.deleteMedia(outcome.persisted[0].objectId); return outcome; });
  await tick();
  assert.deepEqual(h.uploads.map(upload => upload.abortCalls), [1, 1, 1]); assert.equal(completed, false);
  h.uploads[0].abortGate.resolve(); await tick();
  assert.equal(completed, false); assert.deepEqual(h.removed, []); assert.equal(h.uploads.length, 3);
  h.uploads[1].abortGate.resolve(); h.uploads[2].abortGate.reject(new Error('Termination response lost'));
  const result = await cleanup;
  assert.equal(result.status, 'cancelled'); assert.equal(result.cleanupRequired, true); assert.equal(result.persisted.length, 1);
  assert.equal(h.active.size, 0); assert.equal(h.manifests.length, 0); assert.equal(h.virtual.length, 0); assert.equal(h.removed.length, 1);
  assert.equal(h.uploads.length, 3); assert.equal(h.sessionReads, 1);
});

test('one failed part stops the queue and drains siblings before surfacing the original failure', async () => {
  const h = harness(); const operation = await h.start([prepared(core.PART_BYTES * 6)]); await tick();
  let settled = false;
  const outcome = operation.completion.then(value => { settled = true; return value; }, error => { settled = true; return error; });
  h.uploads[1].fail(); await tick();
  assert.equal(settled, false); assert.equal(h.uploads[0].abortCalls, 1); assert.equal(h.uploads[2].abortCalls, 1);
  h.uploads[0].abortGate.resolve(); await tick(); assert.equal(settled, false);
  h.uploads[2].abortGate.resolve();
  const error = await outcome;
  assert.match(error.message, /Part transfer failed/); assert.equal(error.code, 'network'); assert.equal(error.cleanupRequired, true);
  assert.equal(error.persisted.length, 1); assert.equal(h.active.size, 0); assert.equal(h.uploads.length, 3); assert.equal(h.manifests.length, 0);
  await h.service.deleteMedia(error.persisted[0].objectId); assert.equal(h.removed.length, 1);
});

test('files remain sequential and ordinary originals use one token and immutable cache metadata each', async () => {
  const h = harness(); const operation = await h.start([prepared(500, 'one'), prepared(700, 'two')]); await tick();
  assert.equal(h.uploads.length, 1); assert.equal(h.sessionReads, 1);
  h.uploads[0].bytes(300); h.uploads[0].succeed(); await tick();
  assert.equal(h.uploads.length, 2); assert.equal(h.sessionReads, 2); assert.equal(h.signed.length, 1);
  h.uploads[1].bytes(100); h.uploads[1].succeed();
  const result = await operation.completion;
  assert.equal(result.status, 'uploaded'); assert.equal(h.maximumActive, 1); assert.equal(h.signed.length, 2); assert.equal(h.manifests.length, 0);
  assert.equal(h.uploads[0].options.headers.authorization, 'Bearer test-file-token-1');
  assert.equal(h.uploads[1].options.headers.authorization, 'Bearer test-file-token-2');
  assert.ok(h.uploads.every(upload => upload.options.metadata.cacheControl === '31536000'));
  assert.ok(h.progress.every((entry, i) => !i || entry.bytesSent >= h.progress[i - 1].bytesSent));
  assert.equal(h.progress.at(-1).bytesSent, 1200);
});

test('missing authentication and upload-client failure never start parts or write a manifest', async () => {
  for (const options of [{ sessionError: { message: 'Sign in required' } }, { importFailure: true }]) {
    const h = harness(options), operation = await h.start([prepared(core.PART_BYTES * 4)]);
    await assert.rejects(operation.completion, /Sign in required|Upload client unavailable/);
    assert.equal(h.uploads.length, 0); assert.equal(h.manifests.length, 0); assert.equal(h.sessionReads, 1);
    if (options.sessionError) assert.equal(h.imports, 0, 'Unauthenticated uploads do not fetch the upload client.');
  }
});

test('a slicing failure prevents parts still loading the upload client from starting', async () => {
  const h = harness(), item = prepared(core.PART_BYTES * 6);
  const slice = item.file.slice;
  item.file.slice = (start, end) => {
    if (start === core.PART_BYTES * 2) throw new Error('File no longer available');
    return slice(start, end);
  };
  const operation = await h.start([item]);
  await assert.rejects(operation.completion, /File no longer available/);
  assert.equal(h.uploads.length, 0); assert.equal(h.active.size, 0); assert.equal(h.manifests.length, 0);
});

test('cancelling while a failed part is draining still resolves as cancelled after all aborts', async () => {
  const h = harness(), operation = await h.start([prepared(core.PART_BYTES * 6)]); await tick();
  h.uploads[1].fail(); await tick();
  const cancellation = h.service.cancelUpload(operation.uploadId);
  assert.equal(h.uploads[0].abortCalls, 1); assert.equal(h.uploads[2].abortCalls, 1, 'Repeated cancellation shares the same abort promise.');
  h.uploads[0].abortGate.resolve(); h.uploads[2].abortGate.resolve();
  const result = await cancellation;
  assert.equal(result.status, 'cancelled'); assert.equal(result.cleanupRequired, true);
  assert.equal(h.active.size, 0); assert.equal(h.uploads.length, 3); assert.equal(h.manifests.length, 0);
});
