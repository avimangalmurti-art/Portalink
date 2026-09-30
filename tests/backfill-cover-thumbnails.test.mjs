import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, planProject, runBackfill, createFixtureAdapter, createNodeRuntime } from '../scripts/backfill-cover-thumbnails.mjs';
import { thumbnailSourceKey, thumbnailContentHash } from '../src/features/media/coverThumbnailManifest.mjs';
import { renderCoverVariants } from '../src/features/media/coverThumbnailCore.mjs';

const fixturePath = fileURLToPath(new URL('./fixtures/cover-thumbnails/fixture.json', import.meta.url));
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const row = () => structuredClone(fixture.projects[0]);
const variant = (size, value = 'pixels') => ({ size, width: size, height: size, blob: new Blob([value]) });

function mockPipeline({ rows = [row()], bucket = 'project-media', failUpload = 0, changeAfterUpload = false, preflightError = false } = {}) {
  const records = structuredClone(rows), objects = new Map(), uploads = [], manifests = [], events = [], renders = [], removals = [];
  let uploadAttempts = 0;
  const runtime = {
    async loadImage(source) { renders.push(source); return { source: {}, width: 900, height: 600 }; },
    async renderPdfPage(source, pageNumber) { renders.push([source, pageNumber]); return { source: {}, width: 400, height: 600 }; },
    async loadVideoFrame(source) { renders.push(source); return { source: {}, width: 900, height: 600 }; },
    createCanvas(width, height) { return { width, height, getContext: () => ({ drawImage() {}, fillRect() {} }) }; },
    async encodeWebp(canvas) { return new Blob([`webp:${canvas.width}:${canvas.height}`], { type: 'image/webp' }); },
  };
  const adapter = {
    async preflight() { if (preflightError) throw new Error('Schema unavailable'); },
    async targetBucket() { return bucket; },
    async *projects() { for (const record of records) yield structuredClone(record); },
    async currentProject(id) { return structuredClone(records.find(record => record.id === id) ?? null); },
    async objectExists(target, objectPath) { return objects.has(`${target}/${objectPath}`); },
    async upload(target, objectPath, bytes) {
      uploadAttempts++;
      if (uploadAttempts === failUpload) throw new Error('Simulated upload failure');
      objects.set(`${target}/${objectPath}`, bytes); uploads.push(objectPath);
      if (changeAfterUpload) records[0].profiles.is_private = true;
    },
    async persist(id, revision, manifest) {
      const record = records.find(record => record.id === id);
      assert.equal(revision, record.revision);
      manifests.push(manifest); record.cover_thumbnail = manifest;
    },
    async remove(target, objectPaths) {
      removals.push(...objectPaths);
      for (const objectPath of objectPaths) objects.delete(`${target}/${objectPath}`);
    },
  };
  return { adapter, runtime, records, objects, uploads, manifests, events, renders, removals,
    run(options = {}) { return runBackfill(adapter, runtime, { log: event => events.push(event), ...options }); } };
}

test('CLI defaults to dry-run and fixture apply is rejected before any adapter can be created', () => {
  assert.equal(parseArgs([]).apply, false);
  assert.equal(parseArgs(['--dry-run', '--fixture']).fixture, fixturePath);
  assert.equal(parseArgs(['--apply']).apply, true);
  for (const args of [['--apply', '--fixture'], ['--fixture', 'not-a-file.json', '--apply'], ['--apply', '--dry-run'], ['--limit', '0'], ['--log']]) {
    assert.throws(() => parseArgs(args));
  }
});

test('planning rejects private or hidden content, completed manifests and unsupported covers', async () => {
  const plans = await Promise.all(fixture.projects.map(planProject));
  assert.deepEqual(plans.map(plan => plan.skip ?? 'eligible'), [
    'eligible', 'eligible', 'eligible', 'not-public-visible', 'not-public-visible', 'not-public-visible', 'already-has-thumbnail', 'no-supported-cover',
  ]);
  const malformed = row(); delete malformed.profiles.is_private;
  assert.equal((await planProject(malformed)).skip, 'not-public-visible');
  malformed.profiles.is_private = false; malformed.project_attachments[0].storage_path = `${malformed.profile_id}/../secret.png`;
  assert.equal((await planProject(malformed)).skip, 'invalid-source-path');
});

test('cover identity, page selection and creator crop determine the source fingerprint', async () => {
  const source = row(), original = await planProject(source);
  assert.equal(original.sourceAttachmentId, source.project_attachments[0].id, 'Attachment identities are exact TEXT values, not assumed UUIDs');
  source.project_attachments[0].metadata.coverFrame.zoom = 2;
  assert.notEqual((await planProject(source)).sourceKey, original.sourceKey);
  const document = structuredClone(fixture.projects[1]);
  const page = `posts/${document.id}/pages/55555555-5555-4555-8555-555555555555/66666666-6666-4666-8666-666666666666/page_2.webp`;
  document.project_attachments[0].metadata.renderedPages = [
    { withinDocumentIndex: 1, storagePath: 'wrong' },
    { attachmentId: 'foreign', withinDocumentIndex: 2, storagePath: page },
    { attachmentId: document.project_attachments[0].id, withinDocumentIndex: 2, storagePath: page },
  ];
  document.project_attachments[0].metadata.multipart = { version: 1 };
  const plan = await planProject(document);
  assert.equal(plan.input.sourceUrl, page); assert.equal(plan.input.pageNumber, 2);
  delete document.project_attachments[0].metadata.renderedPages;
  assert.equal((await planProject(document)).skip, 'multipart-source-needs-rendered-cover');
});

test('hashes are canonical across field/variant order and respond to encoded content changes', async () => {
  const a = await thumbnailSourceKey({ id: 'a', storagePath: 'path', frame: { x: 0.2, y: 0.8, zoom: 2, aspectRatio: 1 } });
  const b = await thumbnailSourceKey({ storagePath: 'path', id: 'a', pageNumber: 1, frame: { aspectRatio: 1, zoom: 2, y: 0.8, x: 0.2 } });
  assert.equal(a, b); assert.match(a, /^[a-f0-9]{64}$/);
  const variants = [variant(200), variant(400), variant(800)];
  const hash = await thumbnailContentHash(variants);
  assert.equal(hash, await thumbnailContentHash([...variants].reverse()));
  assert.notEqual(hash, await thumbnailContentHash([variant(200, 'changed'), variant(400), variant(800)]));
});

test('dry-run renders and logs all three sizes without inspecting or mutating write state', async () => {
  const h = mockPipeline();
  for (const name of ['currentProject', 'objectExists', 'upload', 'persist']) h.adapter[name] = () => assert.fail(`${name} must not run in dry-run`);
  const result = await h.run();
  assert.equal(result.generated, 1); assert.equal(result.applied, 0); assert.equal(result.failed, 0);
  const event = h.events.find(entry => entry.status === 'would-write');
  assert.deepEqual(event.variants.map(item => item.size), [200, 400, 800]);
  assert.ok(event.bytes > 0);
});

test('apply writes immutable paths then persists and a repeat run skips completed projects', async () => {
  const h = mockPipeline({ bucket: 'project-covers' });
  const first = await h.run({ apply: true });
  assert.equal(first.applied, 1); assert.equal(h.uploads.length, 3);
  assert.equal(h.manifests[0].bucket, 'project-covers');
  assert.equal(h.manifests[0].frameBaked, true);
  const prefix = `${h.records[0].profile_id}/${h.records[0].id}/`;
  assert.ok(h.uploads.every(objectPath => objectPath.startsWith(prefix) && /\/[a-f0-9]{64}\/(200|400|800)\.webp$/.test(objectPath)));
  const second = await h.run({ apply: true });
  assert.equal(second.skipped, 1); assert.equal(second.generated, 0); assert.equal(h.uploads.length, 3); assert.equal(h.manifests.length, 1);
});

test('a partial upload failure resumes existing deterministic objects before one final manifest write', async () => {
  const h = mockPipeline({ failUpload: 2 });
  const first = await h.run({ apply: true });
  assert.equal(first.failed, 1); assert.equal(h.uploads.length, 1); assert.equal(h.manifests.length, 0);
  const second = await h.run({ apply: true });
  assert.equal(second.applied, 1); assert.equal(h.uploads.length, 3); assert.equal(h.manifests.length, 1);
  assert.ok(h.events.some(event => event.status === 'reused-object' && event.size === 200));
});

test('changed visibility or revision stops writes and a pending schema stops before rendering', async () => {
  const stale = mockPipeline();
  stale.adapter.currentProject = async () => ({ ...stale.records[0], revision: '44444444-4444-4444-8444-444444444444' });
  assert.equal((await stale.run({ apply: true })).failed, 1);
  assert.equal(stale.uploads.length, 0); assert.equal(stale.manifests.length, 0);
  const privateMidway = mockPipeline({ changeAfterUpload: true });
  assert.equal((await privateMidway.run({ apply: true })).failed, 1);
  assert.equal(privateMidway.uploads.length, 1); assert.equal(privateMidway.manifests.length, 0);
  const pending = mockPipeline({ preflightError: true });
  await assert.rejects(pending.run({ apply: true }));
  assert.equal(pending.renders.length, 0); assert.equal(pending.uploads.length, 0);
});

test('private fixtures never reach image decoders and logs omit source URLs and secrets', async () => {
  const h = mockPipeline({ rows: fixture.projects });
  const result = await h.run();
  assert.equal(result.eligible, 3); assert.equal(result.skipped, 5); assert.equal(h.renders.length, 3);
  assert.ok(h.renders.every(value => !JSON.stringify(value).includes('000000000004')));
  assert.equal(JSON.stringify(h.events).includes('sourceUrl'), false);
});

test('a failed public attempt retains immutable objects that a concurrent winner may reference', async () => {
  const h = mockPipeline({ bucket: 'project-covers', failUpload: 2 });
  assert.equal((await h.run({ apply: true })).failed, 1);
  assert.equal(h.removals.length, 0); assert.equal(h.objects.size, 1);
  assert.ok(h.events.some(event => event.status === 'retained-public-uploads' && event.paths.length === 1));
  const resume = await h.run({ apply: true });
  assert.equal(resume.applied, 1);
  assert.equal(h.uploads.length, 3);
  const concurrent = mockPipeline({ bucket: 'project-covers' });
  concurrent.adapter.persist = async (id, revision, manifest) => {
    concurrent.records[0].cover_thumbnail = manifest; // Another publication won.
    throw new Error('Revision conflict');
  };
  await concurrent.run({ apply: true });
  assert.equal(concurrent.objects.size, 3); assert.equal(concurrent.removals.length, 0);
  assert.ok(concurrent.events.some(event => event.status === 'retained-public-uploads'));
});

test('local fixture produces real WebP thumbnails from image, selected PDF page and video poster without network', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('The offline fixture attempted a network request'); };
  try {
    const adapter = await createFixtureAdapter(fixturePath), runtime = await createNodeRuntime(adapter.readSource);
    const events = [];
    const result = await runBackfill(adapter, runtime, { log: event => events.push(event) });
    assert.equal(result.generated, 3); assert.equal(result.failed, 0); assert.equal(result.applied, 0);
    const plan = await planProject(fixture.projects[1]);
    const variants = await renderCoverVariants(plan.input, runtime);
    const { loadImage, createCanvas } = await import('@napi-rs/canvas');
    for (const item of variants) {
      const bytes = Buffer.from(await item.blob.arrayBuffer());
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      const image = await loadImage(bytes);
      assert.equal(image.width, item.width); assert.equal(image.height, item.height); assert.equal(Math.max(image.width, image.height), item.size);
      const canvas = createCanvas(image.width, image.height), context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixel = context.getImageData(10, 10, 1, 1).data;
      assert.ok(pixel[2] > pixel[0] * 2, 'The selected second PDF page is blue, not the red first page');
    }
    assert.throws(() => adapter.upload(), /cannot write/);
  } finally { globalThis.fetch = originalFetch; }
});

test('fixture source mappings cannot escape their local directory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'portalink-fixture-test-'));
  const fixtureFile = path.join(directory, 'fixture.json');
  try {
    await writeFile(fixtureFile, JSON.stringify({ files: { remote: 'https://example.invalid/image.png', absolute: fixturePath } }));
    const adapter = await createFixtureAdapter(fixtureFile);
    await assert.rejects(adapter.readSource('absolute'), /relative files/);
    await assert.rejects(adapter.readSource('missing'), /relative files/);
    await assert.rejects(adapter.readSource('remote'));
  } finally { await unlink(fixtureFile); await rmdir(directory); }
});

test('posterless video reports a missing ffmpeg prerequisite without installing or submitting work', async () => {
  const runtime = await createNodeRuntime(async () => new Uint8Array([0, 1, 2]), { ffmpeg: path.join(tmpdir(), 'portalink-deliberately-missing-ffmpeg') });
  await assert.rejects(runtime.loadVideoFrame('local-video'), error => error.code === 'ffmpeg-unavailable');
});
