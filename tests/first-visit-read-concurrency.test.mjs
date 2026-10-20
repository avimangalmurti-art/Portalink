import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async () => { for (let index = 0; index < 30; index++) await Promise.resolve(); };

function signingFixture() {
  let account = 'owner', onAuthChange, maximum = 0;
  const calls = [], active = new Set();
  const client = {
    auth: {
      getSession: async () => ({ data: { session: account ? { user: { id: account } } : null }, error: null }),
      onAuthStateChange(callback) { onAuthChange = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    },
    storage: { from: () => ({ createSignedUrls(paths) {
      const gate = deferred(), call = { paths: [...paths], gate };
      calls.push(call); active.add(call); maximum = Math.max(maximum, active.size);
      return gate.promise.finally(() => active.delete(call));
    } }) },
  };
  const media = sourceModule('src/services/supabase/mediaUrlCache.ts', { './client': { requireSupabase: () => client } });
  const finish = call => call.gate.resolve({ data: call.paths.map(path => ({ path, signedUrl: `signed/${path}` })), error: null });
  return { ...media, calls, active, finish, get maximum() { return maximum; },
    change(next) { account = next; onAuthChange('SIGNED_IN', next ? { user: { id: next } } : null); } };
}

test('first signing overlaps four bounded requests and shares that cap across simultaneous files', async () => {
  const h = signingFixture();
  const first = h.signedMediaUrls('media', Array.from({ length: 450 }, (_, index) => `first-${index}`));
  const second = h.signedMediaUrls('media', Array.from({ length: 210 }, (_, index) => `second-${index}`));
  await tick();
  assert.equal(h.calls.length, 4);
  assert.equal(h.active.size, 4);
  for (let pass = 0; pass < 5 && (h.calls.length < 8 || h.active.size); pass++) {
    for (const call of [...h.active]) h.finish(call);
    await tick();
  }
  assert.equal((await first).size, 450);
  assert.equal((await second).size, 210);
  assert.equal(h.maximum, 4);
  assert.equal(h.calls.length, 8);
  assert.ok(h.calls.every(call => call.paths.length <= 100));
  assert.equal((await h.signedMediaUrls('media', ['first-0'])).get('first-0'), 'signed/first-0');
  assert.equal(h.calls.length, 8);
});

test('account changes reject old queued signing before it starts and allow fresh scoped requests', async () => {
  const h = signingFixture();
  const pending = h.signedMediaUrls('media', Array.from({ length: 450 }, (_, index) => `old-${index}`));
  void pending.catch(() => undefined);
  await tick();
  h.change('new-owner');
  for (const call of [...h.active]) h.finish(call);
  await assert.rejects(pending, /session changed/);
  await tick();
  assert.equal(h.calls.length, 4, 'The fifth old batch must never reach Storage.');
  const fresh = h.signedMediaUrls('media', ['old-0']);
  await tick();
  assert.equal(h.calls.length, 5);
  h.finish(h.calls[4]);
  assert.equal((await fresh).get('old-0'), 'signed/old-0');
});

function multipartFixture() {
  const reader = deferred(), signing = deferred(), calls = [], registrations = [];
  const source = ts.createSourceFile('multipartMedia.ts', readFileSync(new URL('../src/services/supabase/multipartMedia.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'createMultipartSource');
  const exports = {};
  class Channel {
    constructor() { this.port1 = { onmessage: null, close() {} }; this.port2 = { peer: this.port1 }; }
  }
  vm.runInNewContext(ts.transpileModule(`${fn.getText(source)}\nexports.create=createMultipartSource;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, BUCKET: 'project-media', ensureMultipartReader: () => reader.promise,
    signedMediaUrls: (bucket, paths, minimumLifetime) => { calls.push({ bucket, paths, minimumLifetime }); return signing.promise; },
    partPath: (path, index) => `${path}.parts/${index}`,
    MessageChannel: Channel, setTimeout, clearTimeout,
    crypto: { randomUUID: () => 'virtual-id' }, location: { origin: 'https://portalink.test' },
    navigator: { serviceWorker: { controller: { postMessage(message, ports) {
      registrations.push(message); ports[0].peer.onmessage({ data: { ok: true } });
    } } } },
  });
  return { ...exports, reader, signing, calls, registrations };
}

test('multipart signing starts while worker readiness is pending, with ordered registration after both complete', async () => {
  const h = multipartFixture();
  const spec = { partCount: 205, sizeBytes: 205, partBytes: 1, version: 1 };
  const pending = h.create('original.multipart.json', spec, 'work.pdf', 'application/pdf');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].paths.length, 205);
  assert.equal(h.calls[0].minimumLifetime, 5 * 3600_000);
  h.signing.resolve(new Map(h.calls[0].paths.map(path => [path, `signed/${path}`])));
  await tick();
  assert.equal(h.registrations.length, 0);
  h.reader.resolve();
  assert.equal(await pending, 'https://portalink.test/__portalink_media/virtual-id/work.pdf');
  assert.equal(h.registrations.length, 1);
  assert.deepEqual(Array.from(h.registrations[0].file.urls), Array.from(h.calls[0].paths, path => `signed/${path}`));
  assert.equal(h.registrations[0].file.fileName, 'work.pdf');
  assert.equal(h.registrations[0].file.mimeType, 'application/pdf');
});

test('failed worker readiness or incomplete part signing cannot register a virtual source', async () => {
  const worker = multipartFixture();
  const failed = worker.create('file', { partCount: 1 }, 'work.pdf', 'application/pdf');
  worker.reader.reject(new Error('Worker unavailable')); worker.signing.resolve(new Map());
  await assert.rejects(failed, /Worker unavailable/);
  assert.equal(worker.registrations.length, 0);
  const missing = multipartFixture();
  const incomplete = missing.create('file', { partCount: 1 }, 'work.pdf', 'application/pdf');
  missing.reader.resolve(); missing.signing.resolve(new Map());
  await assert.rejects(incomplete, /Some parts/);
  assert.equal(missing.registrations.length, 0);
});
