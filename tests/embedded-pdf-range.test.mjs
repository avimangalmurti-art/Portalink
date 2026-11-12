import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import * as mediaCore from '../public/portalink-media-core.js';
import { sourceModule } from './helpers/source-module.mjs';

const { PART_BYTES, byteRange, mediaResponse, multipartSpec, partPath } = mediaCore;
const manifest = 'profile/project/document.portalink-multipart.json';
const spec = multipartSpec(PART_BYTES * 3 + 101);
const partPaths = Array.from({ length: spec.partCount }, (_, index) => partPath(manifest, index));
const signedUrl = index => `https://storage.invalid/${index}`;
const sample = (start, length) => Uint8Array.from({ length }, (_, offset) => (start + offset) % 251);

function readerFixture({ unavailablePart, fetchPart } = {}) {
  const signed = [];
  const requests = [];
  const fetch = async (url, options) => {
    const index = Number(new URL(url).pathname.slice(1));
    const size = Math.min(spec.partBytes, spec.sizeBytes - index * spec.partBytes);
    const rangeHeader = new Headers(options.headers).get('range');
    assert.ok(rangeHeader, 'Storage must receive a bounded Range request');
    const range = byteRange(rangeHeader, size);
    assert.ok(range?.partial);
    const length = range.end - range.start + 1;
    assert.ok(length <= 1024 * 1024, 'This fixture should never download a full Storage part');
    requests.push({ index, range: rangeHeader });
    if (fetchPart) return fetchPart({ index, size, range, length, signal: options.signal });
    return new Response(sample(index * spec.partBytes + range.start, length), {
      status: 206,
      headers: { 'content-range': `bytes ${range.start}-${range.end}/${size}` },
    });
  };
  const { multipartPdfRangeReader } = sourceModule('src/services/supabase/multipartMedia.ts', {
    './client': { requireSupabase() { assert.fail('The range reader uses the existing signed URL service'); } },
    './mediaUrlCache': { async signedMediaUrls(bucket, paths) {
      signed.push({ bucket, paths: Array.from(paths) });
      return new Map(paths.flatMap((path, index) => index === unavailablePart ? [] : [[path, signedUrl(index)]]));
    } },
    '../../../public/portalink-media-core.js': {
      ...mediaCore, mediaResponse: (request, file) => mediaResponse(request, file, fetch),
    },
  }, { fetch, Request, AbortController, DOMException, location: new URL('https://portalink.invalid/'), window: {}, navigator: {} });
  return { open: multipartPdfRangeReader(manifest, spec, 'Long project.pdf'), signed, requests };
}

test('opens a large PDF without a service worker and reads exact bytes across two signed parts', async () => {
  const fixture = readerFixture();
  assert.deepEqual(fixture.signed, [], 'Preparing catalogue metadata does not sign the full file');
  const source = await fixture.open();
  assert.equal(source.length, spec.sizeBytes);
  assert.deepEqual(fixture.signed, [{ bucket: 'project-media', paths: partPaths }]);
  assert.deepEqual(fixture.requests, [], 'Opening the source does not download the full file');

  const start = PART_BYTES - 12;
  const end = PART_BYTES + 7;
  const bytes = await source.read(start, end, new AbortController().signal);
  assert.deepEqual(Array.from(bytes), Array.from(sample(start, end - start)));
  assert.deepEqual(fixture.requests, [
    { index: 0, range: `bytes=${start}-${PART_BYTES - 1}` },
    { index: 1, range: 'bytes=0-6' },
  ]);
});

test('rejects a missing signed part before downloading any data', async () => {
  const fixture = readerFixture({ unavailablePart: 2 });
  await assert.rejects(fixture.open());
  assert.deepEqual(fixture.requests, []);
});

test('rejects a missing stored part instead of delivering a partial PDF range', async () => {
  const fixture = readerFixture({ fetchPart: ({ index, size, range, length }) => index === 1
    ? new Response(null, { status: 404 })
    : new Response(sample(range.start, length), {
      status: 206,
      headers: { 'content-range': `bytes ${range.start}-${range.end}/${size}` },
    }) });
  const source = await fixture.open();
  await assert.rejects(source.read(PART_BYTES - 12, PART_BYTES + 7, new AbortController().signal));
  assert.deepEqual(fixture.requests.map(({ index }) => index), [0, 1]);
});

test('rejects incomplete or incorrectly sized Storage ranges', async () => {
  for (const advertiseWrongLength of [true, false]) {
    const fixture = readerFixture({ fetchPart: ({ length }) => new Response(new Uint8Array(length - 1), {
      status: 206,
      headers: advertiseWrongLength ? { 'content-length': String(length - 1) } : {},
    }) });
    const source = await fixture.open();
    await assert.rejects(source.read(0, 32, new AbortController().signal));
    assert.deepEqual(fixture.requests, [{ index: 0, range: 'bytes=0-31' }]);
  }
});

test('aborting a pending read cancels Storage and never fetches the next part', { timeout: 2000 }, async () => {
  const started = Promise.withResolvers();
  const fixture = readerFixture({ fetchPart: ({ signal }) => {
    started.resolve(signal);
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const source = await fixture.open();
  const controller = new AbortController();
  const result = source.read(PART_BYTES - 1, PART_BYTES + 1, controller.signal);
  const storageSignal = await started.promise;
  controller.abort();
  await assert.rejects(result);
  assert.equal(storageSignal.aborted, true);
  assert.deepEqual(fixture.requests, [{ index: 0, range: `bytes=${PART_BYTES - 1}-${PART_BYTES - 1}` }]);
});

const transportPath = 'src/components/media/pdfRangeTransport.ts';

function transportFixture(read) {
  const failures = [];
  const chunks = [];
  class PDFDataRangeTransport {
    constructor(length, initialData, progressiveDone) {
      this.length = length;
      this.initialData = initialData;
      this.progressiveDone = progressiveDone;
    }
    onDataRange(begin, bytes) { chunks.push({ begin, bytes }); }
  }
  const { pdfRangeOptions } = sourceModule(transportPath, {}, { AbortController, DOMException });
  const options = pdfRangeOptions({ PDFDataRangeTransport }, { length: spec.sizeBytes, read }, error => failures.push(error));
  return { options, failures, chunks };
}

test('PDF.js uses on-demand chunks and receives data at the requested offset', async () => {
  const received = [];
  const bytes = sample(17, 30);
  const { options, failures, chunks } = transportFixture(async (begin, end) => {
    received.push({ begin, end });
    return bytes;
  });
  assert.equal(options.range.length, spec.sizeBytes);
  assert.equal(options.range.initialData, null);
  assert.equal(options.range.progressiveDone, true);
  assert.equal(options.disableAutoFetch, true);
  assert.equal(options.disableStream, true);
  assert.equal(options.rangeChunkSize, 1024 * 1024);
  assert.deepEqual(received, []);
  options.range.requestDataRange(17, 47);
  await flush();
  assert.deepEqual(received, [{ begin: 17, end: 47 }]);
  assert.deepEqual(chunks, [{ begin: 17, bytes }]);
  assert.deepEqual(failures, []);
});

test('PDF.js range transport reports a Storage failure and ignores completion after abort', { timeout: 2000 }, async () => {
  const aborted = Promise.withResolvers();
  const pending = Promise.withResolvers();
  const signals = [];
  const failure = new Error('Storage failed');
  const { options, failures, chunks } = transportFixture(async (begin, _end, signal) => {
    signals.push(signal);
    if (begin === 0) throw failure;
    signal.addEventListener('abort', aborted.resolve, { once: true });
    return pending.promise;
  });
  options.range.requestDataRange(0, 17);
  options.range.requestDataRange(17, 47);
  await flush();
  assert.deepEqual(failures, [failure]);
  await aborted.promise;
  assert.equal(signals.length, 2);
  assert.ok(signals.every(signal => signal.aborted), 'The first failed range cancels outstanding Storage requests');
  pending.resolve(sample(17, 30));
  await flush();
  assert.deepEqual(chunks, []);
  assert.deepEqual(failures, [failure]);
});
