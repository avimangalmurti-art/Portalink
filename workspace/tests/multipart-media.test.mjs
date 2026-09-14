import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { PART_BYTES, byteRange, mediaResponse, multipartSpec, partPath, readMultipartSpec } from '../public/portalink-media-core.js';

function fixture(sizeBytes, { ignoreRange = false, truncate = false } = {}) {
  const file = { ...multipartSpec(sizeBytes), urls: [], fileName: 'Original document.pdf', mimeType: 'application/pdf' };
  file.urls = Array.from({ length: file.partCount }, (_, index) => `https://test.invalid/${index}`);
  const calls = [];
  let cancelled = 0;
  async function fetchPart(url, options) {
    const part = Number(new URL(url).pathname.slice(1));
    const partSize = Math.min(PART_BYTES, sizeBytes - part * PART_BYTES);
    const range = byteRange(ignoreRange ? null : options.headers.Range, partSize);
    calls.push({ part, range: options.headers.Range });
    let position = range.start;
    const end = truncate ? range.end - 1 : range.end;
    return new Response(new ReadableStream({
      pull(controller) {
        if (position > end) { controller.close(); return; }
        const bytes = Buffer.alloc(Math.min(64 * 1024, end - position + 1));
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = (part * PART_BYTES + position + i) % 251;
        position += bytes.length;
        controller.enqueue(bytes);
      },
      cancel() { cancelled += 1; },
    }), { status: ignoreRange ? 200 : 206, headers: ignoreRange ? {} : { 'content-range': `bytes ${range.start}-${range.end}/${partSize}` } });
  }
  return { file, fetchPart, calls, cancelled: () => cancelled };
}
function request(range, method = 'GET') {
  return new Request('https://site.invalid/__portalink_media/id/file.pdf', { method, headers: range ? { Range: range } : {} });
}
async function assertBytes(response, start, size) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes.length, size);
  for (let i = 0; i < bytes.length; i += 1) assert.equal(bytes[i], (start + i) % 251);
}

test('parts stay below 50 MB and one 150 MiB original is four parts', () => {
  assert.ok(PART_BYTES < 50_000_000);
  assert.equal(multipartSpec(150 * 1024 * 1024).partCount, 4);
  assert.equal(partPath('profile/draft/file.portalink-multipart.json', 2), 'profile/draft/file.portalink-multipart.json.parts/000002');
  assert.equal(readMultipartSpec({ ...multipartSpec(100), partCount: 2 }), undefined);
});

test('full 150 MiB download reconstructs exact bytes in order without a full-file buffer', async () => {
  const size = 150 * 1024 * 1024;
  const f = fixture(size);
  const response = await mediaResponse(request(), f.file, f.fetchPart);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), String(size));
  const actual = createHash('sha256');
  const expected = createHash('sha256');
  let position = 0;
  for await (const value of response.body) {
    actual.update(value);
    const sample = Buffer.alloc(value.length);
    for (let i = 0; i < sample.length; i += 1) sample[i] = (position + i) % 251;
    expected.update(sample);
    position += value.length;
  }
  assert.equal(position, size);
  assert.equal(actual.digest('hex'), expected.digest('hex'));
  assert.deepEqual(f.calls.map((c) => c.part), [0, 1, 2, 3]);
});

test('PDF/video seeking reads only relevant parts, including across a boundary', async () => {
  const f = fixture(PART_BYTES * 3 + 117);
  const start = PART_BYTES - 23;
  const response = await mediaResponse(request(`bytes=${start}-${start + 149}`), f.file, f.fetchPart);
  assert.equal(response.status, 206);
  await assertBytes(response, start, 150);
  assert.deepEqual(f.calls.map((c) => c.part), [0, 1]);
  const suffix = await mediaResponse(request('bytes=-17'), f.file, f.fetchPart);
  await assertBytes(suffix, f.file.sizeBytes - 17, 17);
  assert.equal(f.calls.at(-1).part, 3);
});

test('Range-ignoring upstream is sliced while streaming', async () => {
  const f = fixture(PART_BYTES + 20, { ignoreRange: true });
  await assertBytes(await mediaResponse(request(`bytes=${PART_BYTES - 8}-${PART_BYTES + 9}`), f.file, f.fetchPart), PART_BYTES - 8, 18);
});

test('HEAD and invalid ranges do not download bytes', async () => {
  const f = fixture(PART_BYTES + 1);
  assert.equal((await mediaResponse(request(null, 'HEAD'), f.file, f.fetchPart)).status, 200);
  for (const value of ['bytes=-0', 'bytes=8-2', 'bytes=999999999-','bytes=0-1,4-8', 'nonsense']) {
    assert.equal((await mediaResponse(request(value), f.file, f.fetchPart)).status, 416);
  }
  assert.equal(f.calls.length, 0);
});

test('cancel stops before fetching later parts', async () => {
  const f = fixture(PART_BYTES * 4);
  const response = await mediaResponse(request(), f.file, f.fetchPart);
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(f.calls.length, 1);
  assert.equal(f.cancelled(), 1);
});

test('missing and truncated parts fail instead of returning corrupt success', async () => {
  const f = fixture(100, { truncate: true });
  const response = await mediaResponse(request(), f.file, f.fetchPart);
  await assert.rejects(response.arrayBuffer(), /incomplete/);
  const missing = await mediaResponse(request(), f.file, async () => new Response(null, { status: 404 }));
  assert.equal(missing.status, 502);
});

test('malformed upstream range is rejected and filenames are safely encoded', async () => {
  const f = fixture(100);
  const bad = await mediaResponse(request('bytes=0-5'), f.file, async () => new Response('abcdef', {
    status: 206, headers: { 'content-range': 'bytes 1-6/100' },
  }));
  assert.equal(bad.status, 502);
  f.file.fileName = 'résumé\r\nBad: name.pdf';
  const response = await mediaResponse(request(null, 'HEAD'), f.file, f.fetchPart);
  assert.ok(!response.headers.get('content-disposition').includes('\r'));
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('Supabase CORS responses need not expose Content-Range', async () => {
  const f = fixture(100);
  const response = await mediaResponse(request('bytes=0-5'), f.file, async () => new Response(
    new Uint8Array([0, 1, 2, 3, 4, 5]), { status: 206, headers: { 'content-length': '6' } },
  ));
  assert.equal(response.status, 206);
  await assertBytes(response, 0, 6);
});
