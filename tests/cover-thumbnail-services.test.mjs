import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const PROFILE = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const CATEGORY = '33333333-3333-4333-8333-333333333333';
const HASH = 'a'.repeat(64), SOURCE_HASH = 'b'.repeat(64);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function execute(source, require = () => ({}), globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require, ...globals });
  return exports;
}
const manifest = (bucket = 'project-covers', projectId = PROJECT) => ({ version: 1, bucket, sourceAttachmentId: 'attachment', sourceKey: SOURCE_HASH, frameBaked: true,
  variants: [200, 400, 800].map(size => ({ size, path: `${PROFILE}/${projectId}/${HASH}/${size}.webp`, width: size / 2, height: size })) });

function harness(options = {}) {
  const uploads = [], calls = [], signing = [], generated = [];
  const rows = {
    projects: { id: PROJECT, profile_id: PROFILE, category_id: CATEGORY, revision: 'revision-1', is_hidden: false, cover_thumbnail: null, ...options.projectRow },
    profiles: { id: PROFILE, is_private: false, ...options.profileRow },
    portfolio_categories: { id: CATEGORY, profile_id: PROFILE, is_hidden: false, ...options.categoryRow },
  };
  if (options.missingColumn) delete rows.projects.cover_thumbnail;
  const client = {
    auth: { onAuthStateChange() {}, getSession: async () => ({ data: { session: null }, error: null }) },
    from(table) {
      calls.push(['read', table]);
      const builder = { select: () => builder, eq: () => builder, single: async () => ({ data: rows[table], error: null }) };
      return builder;
    },
    rpc: async (name, args) => { calls.push(['rpc', name, plain(args)]); return { data: 'revision-2', error: options.rpcError ?? null }; },
    storage: { from(bucket) { return {
      upload: async (path, blob, metadata) => {
        uploads.push({ bucket, path, blob, metadata });
        return { error: options.uploadError?.(bucket, path) ?? null };
      },
      getPublicUrl: path => ({ data: { publicUrl: `https://storage.test/public/${bucket}/${path}` } }),
      createSignedUrls: async paths => { signing.push({ bucket, paths: [...paths] }); return { data: paths.map(path => ({ path, signedUrl: `https://storage.test/signed/${path}` })), error: null }; },
      list: async (path, input) => { calls.push(['list', bucket, path, input]); return options.storageList?.(bucket, path, input) ?? { data: [], error: null }; },
      remove: async paths => { calls.push(['remove', bucket, [...paths]]); return { error: options.storageRemoveError ?? null }; },
    }; } },
  };
  const media = execute(read('src/services/supabase/mediaUrlCache.ts'), () => ({ requireSupabase: () => client }));
  const reads = execute(read('src/services/supabase/coverThumbnailReads.ts'), () => ({ requireSupabase: () => client }));
  const service = execute(read('src/services/supabase/coverThumbnails.ts'), name => {
    if (name === './coverThumbnailReads') return reads;
    if (name === './client') return { requireSupabase: () => client };
    if (name === './mediaUrlCache') return media;
    if (name.endsWith('/coverThumbnailManifest.mjs')) return {
      thumbnailSourceKey: async input => { calls.push(['source', plain(input)]); return SOURCE_HASH; },
      thumbnailContentHash: async () => HASH,
    };
    if (name.endsWith('/coverThumbnailRenderer')) return { generateCoverThumbnails: async input => {
      generated.push(plain(input));
      return [200, 400, 800].map(size => ({ size, width: size / 2, height: size, blob: new Blob([String(size)], { type: 'image/webp' }) }));
    } };
    throw new Error(`Unexpected module ${name}`);
  });
  const project = { id: PROJECT, coverAspectRatio: .5, attachments: [
    { id: 'first', kind: 'image', order: 0, sourceUrl: 'first.jpg', storagePath: 'first.jpg' },
    { id: 'chosen', kind: 'document', order: 1, isCover: true, sourceUrl: 'selected.pdf', storagePath: 'selected.pdf', metadata: { coverPageNumber: 4, coverFrame: { x: .25, y: .75, zoom: 2 } } },
  ], ...options.project };
  const loadProject = async () => { calls.push(['loadProject']); return project; };
  return { service, media, client, calls, uploads, signing, generated, loadProject, project };
}

test('cover manifests accept only scoped hashed variants and discard any persisted URLs', () => {
  const h = harness();
  const good = manifest(); good.variants[0].sourceUrl = 'https://untrusted.test/private';
  const parsed = h.service.readCoverThumbnail(good, PROFILE, PROJECT);
  assert.ok(parsed);
  assert.equal(parsed.variants[0].sourceUrl, undefined);
  assert.equal(h.service.readCoverThumbnail(good, PROFILE, 'other'), undefined);
  const wrong = manifest(); wrong.variants[0].path = `${PROFILE}/${PROJECT}/../secret.webp`;
  assert.equal(h.service.readCoverThumbnail(wrong, PROFILE, PROJECT), undefined);
  const malformed = manifest(); malformed.variants[1].height = 9999;
  assert.equal(h.service.readCoverThumbnail(malformed, PROFILE, PROJECT), undefined);
});

test('publishing uses the chosen cover/page/frame and writes three immutable hashed variants before recording the manifest', async () => {
  const h = harness();
  assert.equal(await h.service.refreshProjectCoverThumbnail(PROJECT, h.loadProject), undefined);
  assert.equal(h.generated.length, 1);
  assert.equal(h.generated[0].sourceUrl, 'selected.pdf');
  assert.equal(h.generated[0].pageNumber, 4);
  assert.deepEqual(h.generated[0].frame, { x: .25, y: .75, zoom: 2 });
  assert.equal(h.uploads.length, 3);
  assert.ok(h.uploads.every(item => item.bucket === 'project-covers' && item.path.includes(HASH)
    && item.metadata.cacheControl === '31536000' && item.metadata.upsert === false && item.metadata.contentType === 'image/webp'));
  assert.ok(h.uploads.every(item => typeof item.blob.byteLength === 'number' && item.metadata.headers['cache-control'] === 'public, max-age=31536000, immutable'),
    'Raw bytes preserve the exact cache header instead of the SDK multipart cacheControl field');
  const saved = h.calls.find(call => call[0] === 'rpc');
  assert.equal(saved[1], 'set_project_cover_thumbnail');
  assert.equal(saved[2].p_expected_revision, 'revision-1');
  assert.equal(saved[2].p_manifest.sourceAttachmentId, 'chosen');
  assert.ok(saved[2].p_manifest.variants.every(item => !('sourceUrl' in item)));
});

test('thumbnail generation skips private profiles, hidden projects/categories and invalid category ownership before loading any source', async () => {
  for (const options of [{ profileRow: { is_private: true } }, { projectRow: { is_hidden: true } },
    { categoryRow: { is_hidden: true } }, { categoryRow: { profile_id: 'another-owner' } }]) {
    const h = harness(options);
    await h.service.refreshProjectCoverThumbnail(PROJECT, h.loadProject);
    assert.equal(h.generated.length, 0);
    assert.equal(h.uploads.length, 0);
    assert.ok(h.calls.every(call => call[0] !== 'loadProject' && call[0] !== 'rpc'));
  }
});

test('a verified playback copy can generate a video cover when its original URL is unavailable', async () => {
  const h = harness({ project: { attachments: [{ id: 'video', kind: 'video', isCover: true, order: 0,
    sourceUrl: null, storagePath: 'original.mov', metadata: { playbackVideo: { sourceUrl: 'playback.mp4', storagePath: 'playback.mp4' } } }] } });
  await h.service.refreshProjectCoverThumbnail(PROJECT, h.loadProject);
  assert.equal(h.generated.length, 1);
  assert.equal(h.generated[0].sourceUrl, 'playback.mp4');
  assert.equal(h.generated[0].kind, 'video');
});

test('an unapplied thumbnail column keeps original-cover compatibility without rendering or Storage access', async () => {
  const h = harness({ missingColumn: true });
  assert.equal(await h.service.refreshProjectCoverThumbnail(PROJECT, h.loadProject), undefined);
  assert.equal(h.generated.length, 0); assert.equal(h.uploads.length, 0);
  assert.deepEqual(h.calls, [['read', 'projects']]);
});

test('only a missing public bucket switches uploads to private project-media', async () => {
  const missing = harness({ uploadError: bucket => bucket === 'project-covers' ? { message: 'Bucket not found', statusCode: '404' } : null });
  await missing.service.refreshProjectCoverThumbnail(PROJECT, missing.loadProject);
  assert.deepEqual(missing.uploads.map(item => item.bucket), ['project-covers', 'project-media', 'project-media', 'project-media']);
  assert.ok(missing.uploads.slice(1).every(item => item.metadata.headers['cache-control'] === 'private, max-age=3600'));
  assert.equal(missing.calls.find(call => call[0] === 'rpc')[2].p_manifest.bucket, 'project-media');
  for (const error of [{ message: 'new row violates row-level security policy', statusCode: '403' }, { message: 'Network timeout' }, { message: 'Object not found', statusCode: '404' }]) {
    const refused = harness({ uploadError: () => error });
    await assert.rejects(refused.service.refreshProjectCoverThumbnail(PROJECT, refused.loadProject), new RegExp(error.message));
    assert.deepEqual(refused.uploads.map(item => item.bucket), ['project-covers']);
    assert.ok(refused.calls.every(call => call[0] !== 'rpc'));
  }
});

test('one createSignedUrls call signs every private cover variant across projects and cached reads do not resign', async () => {
  const h = harness();
  const paths = Array.from({ length: 153 }, (_, i) => `${PROFILE}/${PROJECT}/${i}/200.webp`);
  const result = await h.media.signedMediaUrls('project-media', [...paths, paths[0]], 0, true);
  assert.equal(h.signing.length, 1);
  assert.equal(h.signing[0].paths.length, 153);
  assert.equal(result.size, 153);
  await h.media.signedMediaUrls('project-media', paths, 0, true);
  assert.equal(h.signing.length, 1);
});

test('public covers resolve directly without any signing; private covers use only returned signed candidates', () => {
  const h = harness();
  const publicResult = h.service.coverThumbnailWithUrls(manifest(), new Map());
  assert.ok(publicResult.variants.every(item => item.sourceUrl.startsWith('https://storage.test/public/project-covers/')));
  const privateManifest = manifest('project-media');
  const signed = new Map([[privateManifest.variants[0].path, 'https://storage.test/signed/known']]);
  const privateResult = h.service.coverThumbnailWithUrls(privateManifest, signed);
  assert.equal(privateResult.variants[0].sourceUrl, 'https://storage.test/signed/known');
  assert.equal(privateResult.variants[1].sourceUrl, null);
  assert.equal(h.signing.length, 0);
});

test('private deletion enumerates every hashed version without removing neighboring edited originals', async () => {
  const prefix = `${PROFILE}/${PROJECT}`;
  const folders = [{ name: 'original.pdf' }, ...Array.from({ length: 101 }, (_, index) => ({ name: index.toString(16).padStart(64, '0') }))];
  const h = harness({ storageList: (bucket, path, input) => ({ data: path === prefix
    ? folders.slice(input.offset ?? 0, (input.offset ?? 0) + input.limit)
    : [200, 400, 800].map(size => ({ name: `${size}.webp` })), error: null }) });
  await h.service.removePrivateCoverThumbnails(PROFILE, PROJECT);
  const removed = h.calls.filter(call => call[0] === 'remove');
  assert.equal(removed.length, 101);
  assert.ok(removed.every(call => call[1] === 'project-media' && call[2].length === 3 && call[2].every(path => path.endsWith('.webp'))));
  assert.equal(h.calls.filter(call => call[0] === 'list' && call[2] === prefix).length, 2, 'Pagination cannot skip a retired or interrupted generation');
  assert.ok(removed.every(call => call[2].every(path => !path.includes('original.pdf'))));
});

test('public cleanup rejects unknown files and refuses deletion when Storage reports an error', async () => {
  const prefix = `${PROFILE}/${PROJECT}`;
  const unknown = harness({ storageList: (bucket, path) => ({ data: path === prefix ? [{ name: HASH }] : [{ name: 'original.pdf' }], error: null }) });
  await assert.rejects(unknown.service.removePublicProjectCovers(PROFILE, PROJECT), /Unrecognized cover variant/);
  assert.ok(unknown.calls.every(call => call[0] !== 'remove'));
  const refused = harness({ storageList: (bucket, path) => ({ data: path === prefix ? [{ name: HASH }] : [{ name: '200.webp' }], error: null }), storageRemoveError: { message: 'Storage deletion denied' } });
  await assert.rejects(refused.service.removePublicProjectCovers(PROFILE, PROJECT), /Storage deletion denied/);
});

function hydrationHarness() {
  const h = harness();
  const source = ts.createSourceFile('content.ts', read('src/services/supabase/contentReaders.ts'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'hydrateProjects');
  const resolved = [], multipart = [];
  const { hydrate } = execute(`${fn.getText(source)}\nexports.hydrate = hydrateProjects;`, undefined, {
    readCoverThumbnail: h.service.readCoverThumbnail,
    coverThumbnailWithUrls: h.service.coverThumbnailWithUrls,
    signedUrls: async (paths, singleBatch) => { resolved.push({ paths: [...paths], singleBatch }); return new Map(paths.map(path => [path, `signed:${path}`])); },
    readVideoPlayback: () => undefined,
    renderedPagePaths: metadata => metadata?.renderedPages?.map(page => page.storagePath) ?? [],
    asMetadata: value => value,
    multipartSource: async (...args) => { multipart.push(args); return 'multipart:original'; },
    resolveStoredMediaKind: kind => kind,
    deriveProjectRelevance: () => ({}),
    asDesign: value => value,
  });
  return { hydrate, resolved, multipart };
}

test('cover-only hydration strips originals/PDF page paths before signing and never initializes multipart readers for thumbnailed projects', async () => {
  const h = hydrationHarness();
  const projects = [{ id: PROJECT, profile_id: PROFILE, category_id: CATEGORY, title: 'Document', summary: 'Report', cover_thumbnail: manifest('project-media') }];
  const attachments = [{ id: 'attachment', project_id: PROJECT, storage_path: 'original.pdf', kind: 'document', is_cover: true, metadata: {
    multipart: { version: 1 }, pageCount: 12, coverPageNumber: 2, renderedPages: [{ attachmentId: 'attachment', withinDocumentIndex: 1, storagePath: 'page1.png' }],
  } }];
  const result = await h.hydrate(projects, [{ id: CATEGORY, label: 'Documents' }], attachments, 'cover');
  assert.equal(h.resolved.length, 1);
  assert.equal(h.resolved[0].singleBatch, true);
  assert.deepEqual(h.resolved[0].paths, manifest('project-media').variants.map(item => item.path));
  assert.equal(h.multipart.length, 0);
  assert.equal(result.get(PROJECT).attachments.length, 0);
  assert.equal(result.get(PROJECT).coverThumbnail.variants.length, 3);
  assert.equal(result.get(PROJECT).coverKind, 'document');
  assert.equal(result.get(PROJECT).coverPageNumber, 2);
  assert.equal(result.get(PROJECT).pageCount, 12);
});

test('opening the same document uses full hydration and retains its original viewer attachment', async () => {
  const h = hydrationHarness();
  const result = await h.hydrate([{ id: PROJECT, profile_id: PROFILE, category_id: CATEGORY, title: 'Document', summary: 'Report', cover_thumbnail: manifest() }], [],
    [{ id: 'attachment', project_id: PROJECT, storage_path: 'original.pdf', kind: 'document', is_cover: true, position: 0 }], 'full');
  assert.ok(h.resolved[0].paths.includes('original.pdf'));
  assert.equal(result.get(PROJECT).attachments[0].sourceUrl, 'signed:original.pdf');
  assert.equal(result.get(PROJECT).attachments[0].kind, 'document');
});
