import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs, planProject, runBackfill, createFixtureAdapter, createNodeRuntime, readMultipartSource, createSupabaseAdapter } from '../scripts/backfill-cover-thumbnails.mjs';
import { MANIFEST_SUFFIX, PART_BYTES, multipartSpec, partPath } from '../public/portalink-media-core.js';
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
  assert.equal(parseArgs([]).failFast, false);
  assert.equal(parseArgs(['--dry-run', '--fixture']).fixture, fixturePath);
  assert.equal(parseArgs(['--apply']).apply, true);
  assert.equal(parseArgs(['--apply', '--fail-fast']).failFast, true);
  assert.equal(parseArgs(['--dry-run', '--fixture', '--fail-fast']).failFast, true);
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

test('selected project originals accept the uploader draft directory and retain project-directory compatibility', async () => {
  const source = row(), attachment = source.project_attachments[0];
  assert.equal((await planProject(source)).input.sourceUrl, attachment.storage_path);
  const draftId = '55555555-5555-4555-8555-555555555555';
  assert.notEqual(draftId, source.id);
  attachment.storage_path = `${source.profile_id}/${draftId}/66666666-6666-4666-8666-666666666666-My-project_2.pdf`;
  const plan = await planProject(source);
  assert.equal(plan.sourceAttachmentId, attachment.id);
  assert.equal(plan.input.sourceUrl, attachment.storage_path);
  const h = mockPipeline({ rows: [source] });
  assert.equal((await h.run()).generated, 1);
  assert.deepEqual(h.renders, [attachment.storage_path]);
  assert.equal(h.uploads.length, 0);
});

test('draft originals reject wrong owners, foreign attachments and noncanonical paths', async () => {
  const source = row(), attachment = source.project_attachments[0];
  const draftId = '55555555-5555-4555-8555-555555555555';
  const file = '66666666-6666-4666-8666-666666666666-artwork.png';
  const prefix = `${source.profile_id}/${draftId}`;
  for (const invalid of [
    `77777777-7777-4777-8777-777777777777/${draftId}/${file}`,
    `${source.profile_id}/not-a-uuid/${file}`,
    `${prefix}/artwork.png`, `${prefix}/${file}/extra`, `${prefix}/../${file}`,
    `${prefix}/%2e%2e`, `${prefix}/${file}%20`, `${prefix}/${file}\\other`,
    `https://example.invalid/${prefix}/${file}`, `${prefix}/${file}?download=1`,
    `${prefix}/${file}#fragment`, `${prefix}/${file}\n`, `${prefix}/${file} `,
    `${prefix}/66666666-6666-4666-8666-666666666666-`,
    `${prefix}/66666666-6666-4666-8666-666666666666--name.png`,
  ]) {
    attachment.storage_path = invalid;
    assert.equal((await planProject(source)).skip, 'invalid-source-path', invalid);
  }
  attachment.storage_path = `${prefix}/${file}`;
  attachment.project_id = draftId;
  assert.equal((await planProject(source)).skip, 'no-supported-cover');
});

test('draft original compatibility never broadens rendered-page or video-poster namespaces', async () => {
  const draftId = '55555555-5555-4555-8555-555555555555';
  const file = '66666666-6666-4666-8666-666666666666-preview.webp';
  const document = structuredClone(fixture.projects[1]), attachment = document.project_attachments[0];
  attachment.storage_path = `${document.profile_id}/${draftId}/66666666-6666-4666-8666-666666666666-report.pdf`;
  attachment.metadata.renderedPages = [{ attachmentId: attachment.id, withinDocumentIndex: 2,
    storagePath: `${document.profile_id}/${draftId}/${file}` }];
  assert.equal((await planProject(document)).input.sourceUrl, attachment.storage_path);
  attachment.metadata.multipart = { version: 1 };
  assert.equal((await planProject(document)).skip, 'invalid-multipart-source');
  const video = structuredClone(fixture.projects[2]), videoAttachment = video.project_attachments[0];
  videoAttachment.metadata.posterStoragePath = `${video.profile_id}/${draftId}/${file}`;
  assert.equal((await planProject(video)).input.posterUrl, undefined);
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
  assert.equal((await planProject(document)).skip, 'invalid-multipart-source');
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

for (const failure of ['render', 'upload', 'persist']) {
  test(`fail-fast stops at a ${failure} failure, preserves counts/uploads and never requests the next project`, async () => {
    const rows = [fixture.projects[3], fixture.projects[0], fixture.projects[1], fixture.projects[2]];
    const h = mockPipeline({ rows, bucket: 'project-covers', failUpload: failure === 'upload' ? 5 : 0 });
    const requested = [], encodedBytes = [];
    h.adapter.projects = async function* () {
      for (const record of h.records) {
        requested.push(record.id);
        yield structuredClone(record);
      }
    };
    const encode = h.runtime.encodeWebp;
    h.runtime.encodeWebp = async canvas => {
      const blob = await encode(canvas);
      encodedBytes.push(blob.size);
      return blob;
    };
    if (failure === 'render') {
      const render = h.runtime.renderPdfPage;
      h.runtime.renderPdfPage = async (...args) => { await render(...args); throw new Error('Simulated render failure'); };
    }
    if (failure === 'persist') {
      const persist = h.adapter.persist;
      h.adapter.persist = async (id, ...args) => {
        if (id === rows[2].id) throw new Error('Simulated persistence failure');
        return persist(id, ...args);
      };
    }
    const result = await h.run({ apply: true, failFast: true });
    assert.deepEqual(requested, rows.slice(0, 3).map(project => project.id));
    assert.equal(result.failFast, true); assert.equal(result.stoppedOnFailure, true);
    assert.equal(result.considered, 3); assert.equal(result.skipped, 1); assert.equal(result.eligible, 2);
    assert.equal(result.generated, failure === 'render' ? 1 : 2);
    assert.equal(result.applied, 1); assert.equal(result.failed, 1);
    assert.equal(result.bytes, encodedBytes.reduce((total, bytes) => total + bytes, 0));
    assert.equal(h.manifests.length, 1);
    assert.equal(h.records[2].cover_thumbnail, null);
    assert.deepEqual(h.records[3], rows[3], 'The later project is unchanged');
    const retainedCount = failure === 'render' ? 0 : failure === 'upload' ? 1 : 3;
    assert.equal(h.objects.size, 3 + retainedCount); assert.equal(h.removals.length, 0);
    assert.equal(h.events.find(event => event.status === 'retained-public-uploads')?.paths.length ?? 0, retainedCount);
    assert.deepEqual(h.events.filter(event => event.status === 'failed').map(event => event.projectId), [rows[2].id]);
    assert.ok(h.events.every(event => event.projectId !== rows[3].id));
  });
}

test('without fail-fast a failed project still allows the next eligible project to complete', async () => {
  const h = mockPipeline({ rows: fixture.projects.slice(0, 2), failUpload: 2 });
  const result = await h.run({ apply: true });
  assert.equal(result.failFast, false); assert.equal(result.stoppedOnFailure, false);
  assert.equal(result.considered, 2); assert.equal(result.generated, 2);
  assert.equal(result.failed, 1); assert.equal(result.applied, 1);
  assert.equal(h.records[0].cover_thumbnail, null);
  assert.ok(h.records[1].cover_thumbnail);
});

test('fixture-only CLI fail-fast logs the failure and summary and exits nonzero before a later source', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'portalink-fail-fast-test-'));
  const fixtureFile = path.join(directory, 'fixture.json'), imageFile = path.join(directory, 'bad.webp'), logFile = path.join(directory, 'run.jsonl');
  try {
    const projects = structuredClone(fixture.projects.slice(0, 2));
    await writeFile(imageFile, 'not an image');
    await writeFile(fixtureFile, JSON.stringify({ projects, files: {
      [projects[0].project_attachments[0].storage_path]: 'bad.webp',
      [projects[1].project_attachments[0].storage_path]: 'never-opened.pdf',
    } }));
    const script = fileURLToPath(new URL('../scripts/backfill-cover-thumbnails.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, '--dry-run', '--fail-fast', '--fixture', fixtureFile, '--log', logFile], {
      encoding: 'utf8', windowsHide: true, timeout: 30_000,
    });
    assert.ifError(result.error); assert.equal(result.status, 1, result.stderr);
    const events = result.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
    const summary = events.at(-1);
    assert.equal(summary.status, 'summary'); assert.equal(summary.fixture, true);
    assert.equal(summary.failFast, true); assert.equal(summary.stoppedOnFailure, true);
    assert.equal(summary.considered, 1); assert.equal(summary.eligible, 1); assert.equal(summary.failed, 1);
    assert.equal(summary.generated, 0); assert.equal(summary.applied, 0); assert.equal(summary.bytes, 0);
    assert.deepEqual(events.filter(event => event.status === 'failed').map(event => event.projectId), [projects[0].id]);
    assert.ok(events.every(event => event.projectId !== projects[1].id));
    const saved = (await readFile(logFile, 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
    assert.deepEqual(saved.map(({ at, ...event }) => event), events);
  } finally {
    for (const file of [fixtureFile, imageFile, logFile]) await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(directory);
  }
});

test('social capability upgrades older manifests once and writes the landscape asset', async () => {
  const h = mockPipeline({ bucket: 'project-covers' });
  await h.run({ apply: true });
  assert.equal(h.uploads.length, 3);
  h.adapter.supportsSocial = async () => true;
  assert.equal((await h.run({ apply: true })).applied, 1);
  assert.equal(h.uploads.length, 7);
  const manifest = h.manifests.at(-1);
  assert.equal(manifest.variants.length, 3);
  assert.equal(manifest.social.width, 1200);
  assert.equal(manifest.social.height, 630);
  assert.match(manifest.social.path, /\/social\.webp$/);
  assert.equal((await h.run({ apply: true })).skipped, 1);
  assert.equal(h.uploads.length, 7);
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

function multipartDocument(sizeBytes = PART_BYTES + 7) {
  const document = structuredClone(fixture.projects[1]);
  const attachment = document.project_attachments[0];
  attachment.storage_path += MANIFEST_SUFFIX;
  attachment.size_bytes = sizeBytes;
  attachment.metadata.multipart = multipartSpec(sizeBytes);
  return document;
}

test('multipart PDF planning validates stored size, format and limit while retaining rendered-cover preference', async () => {
  const document = multipartDocument(), attachment = document.project_attachments[0];
  assert.deepEqual((await planProject(document)).multipart, multipartSpec(PART_BYTES + 7));
  for (const mutate of [
    a => { a.size_bytes++; }, a => { a.metadata.multipart.version = 2; },
    a => { a.metadata.multipart.partBytes = 10; }, a => { a.metadata.multipart.partCount++; },
    a => { delete a.metadata.multipart; }, a => { a.storage_path = a.storage_path.replace(MANIFEST_SUFFIX, ''); },
    a => { a.kind = 'image'; },
  ]) {
    const invalid = structuredClone(document); mutate(invalid.project_attachments[0]);
    assert.equal((await planProject(invalid)).skip, 'invalid-multipart-source');
  }
  assert.equal((await planProject(multipartDocument(256 * 1024 * 1024 + 1))).skip, 'source-over-256-mib');
  attachment.metadata.renderedPages = [{ attachmentId: attachment.id, withinDocumentIndex: 2,
    storagePath: `${document.profile_id}/${document.id}/selected.webp` }];
  const rendered = await planProject(document);
  assert.equal(rendered.multipart, undefined);
  assert.match(rendered.input.sourceUrl, /selected.webp$/);
});

test('multipart reconstruction uses exact computed parts and ignores manifest-supplied URLs', async () => {
  const document = multipartDocument(), attachment = document.project_attachments[0], spec = attachment.metadata.multipart;
  const first = new Uint8Array(PART_BYTES).fill(17), last = new Uint8Array(7).fill(29), requested = [];
  const assembled = await readMultipartSource(async source => {
    requested.push(source);
    if (source === attachment.storage_path) return new TextEncoder().encode(JSON.stringify({ ...spec, urls: ['https://example.invalid/private'], paths: ['../other'] }));
    if (source === partPath(attachment.storage_path, 0)) return first;
    if (source === partPath(attachment.storage_path, 1)) return last;
    assert.fail('Unexpected source');
  }, attachment.storage_path, spec);
  assert.deepEqual(requested, [attachment.storage_path, partPath(attachment.storage_path, 0), partPath(attachment.storage_path, 1)]);
  assert.equal(assembled.byteLength, spec.sizeBytes);
  assert.deepEqual(assembled.subarray(0, PART_BYTES), first);
  assert.deepEqual(assembled.subarray(PART_BYTES), last);
});

test('multipart size and path validation reject before reading any source', async () => {
  const document = multipartDocument(), attachment = document.project_attachments[0];
  let reads = 0; const reader = async () => { reads++; throw new Error('Must not read'); };
  for (const [source, spec] of [
    [attachment.storage_path, multipartSpec(256 * 1024 * 1024 + 1)],
    [attachment.storage_path, { version: 1 }], ['https://example.invalid/file' + MANIFEST_SUFFIX, multipartSpec(2)],
    ['owner/../file' + MANIFEST_SUFFIX, multipartSpec(2)], ['owner/%2e%2e/file' + MANIFEST_SUFFIX, multipartSpec(2)],
    ['owner/file.pdf', multipartSpec(2)],
  ]) await assert.rejects(readMultipartSource(reader, source, spec), error => error.code === 'invalid-multipart-source');
  assert.equal(reads, 0);
});

test('multipart malformed, oversized and mismatched manifests stop before any part read', async () => {
  const document = multipartDocument(), attachment = document.project_attachments[0], spec = attachment.metadata.multipart;
  for (const manifest of ['{', ' '.repeat(16385), JSON.stringify({ ...spec, sizeBytes: spec.sizeBytes + 1 }), JSON.stringify({ ...spec, version: 2 })]) {
    const reads = [];
    await assert.rejects(readMultipartSource(async source => { reads.push(source); return new TextEncoder().encode(manifest); }, attachment.storage_path, spec));
    assert.deepEqual(reads, [attachment.storage_path]);
  }
});

test('multipart missing, short and oversized parts stop before requesting later parts', async () => {
  const document = multipartDocument(), attachment = document.project_attachments[0], spec = attachment.metadata.multipart;
  for (const length of [-1, PART_BYTES - 1, PART_BYTES + 1]) {
    const reads = [];
    await assert.rejects(readMultipartSource(async source => {
      reads.push(source);
      if (source === attachment.storage_path) return new TextEncoder().encode(JSON.stringify(spec));
      if (length === -1) throw new Error('Anonymous source unavailable');
      return new Uint8Array(length);
    }, attachment.storage_path, spec));
    assert.deepEqual(reads, [attachment.storage_path, partPath(attachment.storage_path, 0)]);
  }
  const small = multipartSpec(7);
  for (const length of [6, 8]) await assert.rejects(readMultipartSource(async source => source === attachment.storage_path
    ? new TextEncoder().encode(JSON.stringify(small)) : new Uint8Array(length), attachment.storage_path, small), error => error.code === 'multipart-part-size');
});

test('multipart fixture PDF produces real selected-page WebPs without network or writes', async () => {
  const pdf = await readFile(path.join(path.dirname(fixturePath), 'report.pdf'));
  const document = multipartDocument(pdf.byteLength), attachment = document.project_attachments[0];
  const spec = attachment.metadata.multipart, reads = [];
  const runtime = await createNodeRuntime(async source => {
    reads.push(source);
    if (source === attachment.storage_path) return new TextEncoder().encode(JSON.stringify(spec));
    if (source === partPath(attachment.storage_path, 0)) return pdf;
    throw new Error('Unexpected source');
  });
  const h = mockPipeline({ rows: [document] });
  const result = await runBackfill(h.adapter, runtime, { failFast: true });
  assert.equal(result.generated, 1); assert.equal(result.failed, 0); assert.equal(result.applied, 0);
  assert.equal(h.uploads.length, 0); assert.equal(h.manifests.length, 0);
  assert.deepEqual(reads, [attachment.storage_path, partPath(attachment.storage_path, 0)]);
  const decoded = await runtime.renderPdfPage(attachment.storage_path, 2, 800, spec);
  const pixel = decoded.source.getContext('2d').getImageData(10, 10, 1, 1).data;
  assert.ok(pixel[2] > pixel[0] * 2, 'The selected PDF page stays blue');
  await decoded.dispose();
});

test('multipart read failures honor fail-fast and metadata changes prevent uploads', async () => {
  const document = multipartDocument();
  const h = mockPipeline({ rows: [document, row()] });
  h.runtime.renderPdfPage = async (source, page, edge, spec) => {
    assert.deepEqual(spec, document.project_attachments[0].metadata.multipart);
    throw new Error('Missing part');
  };
  const failed = await h.run({ apply: true, failFast: true });
  assert.equal(failed.stoppedOnFailure, true); assert.equal(failed.considered, 1);
  assert.equal(failed.failed, 1); assert.equal(h.uploads.length, 0);
  const changed = mockPipeline({ rows: [document] });
  changed.adapter.currentProject = async () => multipartDocument(PART_BYTES + 8);
  const stopped = await changed.run({ apply: true, failFast: true });
  assert.equal(stopped.failed, 1); assert.equal(changed.uploads.length, 0);
});

const testEnvironment = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'fixture-anonymous-key', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key' };
const storageJson = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('installed Storage SDK lists the exact thumbnail directory and matches exact object names', async () => {
  const calls = [], pages = [[], [{ id: 'one', name: '1200.webp' }], [{ id: null, name: '200.webp' }], [{ id: 'one', name: '200.webp' }]];
  const adapter = await createSupabaseAdapter(testEnvironment, { fetch: async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: JSON.parse(options.body) });
    return storageJson(pages.shift());
  } });
  for (const expected of [false, false, false, true]) assert.equal(await adapter.objectExists('project-covers', 'profile/project/hash/200.webp'), expected);
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.method, 'POST'); assert.equal(call.url, 'https://fixture.supabase.co/storage/v1/object/list/project-covers');
    assert.equal(call.body.prefix, 'profile/project/hash'); assert.equal(call.body.search, '200.webp');
    assert.equal(call.body.limit, 100); assert.equal(call.body.offset, 0);
  }
});

test('thumbnail inspection paginates successful listings before declaring absence', async () => {
  const offsets = [], full = Array.from({ length: 100 }, (_, index) => ({ id: String(index), name: `copy-${index}-200.webp` }));
  const adapter = await createSupabaseAdapter(testEnvironment, { fetch: async (url, options) => {
    const { offset } = JSON.parse(options.body); offsets.push(offset);
    return storageJson(offset === 0 ? full : [{ id: 'exact', name: '200.webp' }]);
  } });
  assert.equal(await adapter.objectExists('project-covers', 'profile/project/hash/200.webp'), true);
  assert.deepEqual(offsets, [0, 100]);
});

test('thumbnail inspection rejects Storage failures and malformed success through the installed SDK', async () => {
  for (const response of [
    () => new Response(null, { status: 400 }),
    () => storageJson({ statusCode: '400', error: 'Bad Request', message: 'Bad Request' }, 400),
    () => storageJson({ statusCode: '403', message: 'Forbidden' }, 403),
    () => storageJson({ statusCode: '404', message: 'Bucket not found' }, 404),
    () => storageJson({ statusCode: '500', message: 'Server failure' }, 500),
    () => storageJson(null), () => storageJson({}), () => storageJson([{ name: '200.webp' }]),
    () => storageJson([{ id: '', name: '200.webp' }]),
    () => { throw new Error('Network failed'); },
  ]) {
    const adapter = await createSupabaseAdapter(testEnvironment, { fetch: async () => response() });
    await assert.rejects(adapter.objectExists('project-covers', 'profile/project/hash/200.webp'), error => error.code === 'object-inspection-failed');
  }
});

test('real SDK absence checks upload immutably before persistence and errors stop with zero writes', async () => {
  const requests = [];
  const real = await createSupabaseAdapter(testEnvironment, { fetch: async (url, options) => {
    const address = String(url); requests.push({ address, options });
    if (address.includes('/object/list/')) return storageJson([]);
    if (address.includes('/storage/v1/object/project-covers/')) return storageJson({ Key: 'stored' });
    if (address.endsWith('/rest/v1/rpc/set_project_cover_thumbnail')) return storageJson(null);
    throw new Error('Unexpected request');
  } });
  const h = mockPipeline({ bucket: 'project-covers' });
  Object.assign(h.adapter, { objectExists: real.objectExists, upload: real.upload, persist: real.persist });
  const applied = await h.run({ apply: true, failFast: true });
  assert.equal(applied.applied, 1); assert.equal(applied.failed, 0);
  const writes = requests.filter(r => r.address.includes('/object/project-covers/'));
  assert.equal(writes.length, 3);
  for (const { options } of writes) {
    const headers = new Headers(options.headers);
    assert.equal(headers.get('x-upsert'), 'false'); assert.equal(headers.get('content-type'), 'image/webp');
    assert.equal(headers.get('cache-control'), 'public, max-age=31536000, immutable');
  }
  assert.ok(requests.at(-1).address.endsWith('/rest/v1/rpc/set_project_cover_thumbnail'));
  const denied = await createSupabaseAdapter(testEnvironment, { fetch: async () => storageJson({ message: 'Denied' }, 403) });
  const stopped = mockPipeline({ rows: [row(), row()] }); stopped.adapter.objectExists = denied.objectExists;
  const result = await stopped.run({ apply: true, failFast: true });
  assert.equal(result.failed, 1); assert.equal(result.considered, 1); assert.equal(stopped.uploads.length, 0); assert.equal(stopped.manifests.length, 0);
});

test('posterless video reports a missing ffmpeg prerequisite without installing or submitting work', async () => {
  const runtime = await createNodeRuntime(async () => new Uint8Array([0, 1, 2]), { ffmpeg: path.join(tmpdir(), 'portalink-deliberately-missing-ffmpeg') });
  await assert.rejects(runtime.loadVideoFrame('local-video'), error => error.code === 'ffmpeg-unavailable');
});
