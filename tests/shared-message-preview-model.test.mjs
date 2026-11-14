import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const PUBLIC_ORIGIN = 'https://portalinknetworks.com';
const legacy = 'https://portalinknetworksinc.avimangalmurti566055.chatgpt.site';
const local = 'http://localhost:5173';
const shareModel = sourceModule('src/features/sharing/shareModel.ts');
const { parseSharedContentLink: parse, resolveSharedContentPreview: resolve } = sourceModule('src/features/messages/sharedContentPreview.ts', {
  '../projects/projectPortals': sourceModule('src/features/projects/projectPortals.ts'),
  '../citations/publicOrigin': { PUBLIC_ORIGIN },
  '../sharing/shareModel': shareModel,
});
const plain = '/share/creator/c/portal/project';
const attachmentId = 'creator/operation/original-Trip to Rome.pdf.portalink-multipart.json';
const pageUrl = (page = 6, media = attachmentId, path = plain) => `${PUBLIC_ORIGIN}${path}?${new URLSearchParams({ media, page: String(page) })}`;
const readTarget = (url = pageUrl()) => {
  const target = parse(url, local); assert.ok(target, 'Expected a recognized shared-project link'); return target;
};
const raster = (page, overrides = {}) => ({ attachmentId, withinDocumentIndex: page, sourceUrl: `https://media.test/page-${page}.webp`, aspectRatio: .7, ...overrides });
const document = (overrides = {}) => ({ id: attachmentId, kind: 'document', sourceUrl: 'https://media.test/original.pdf', order: 0,
  metadata: { pageCount: 8, aspectRatio: .72, renderedPages: [raster(1), raster(6)] }, ...overrides });
function fixture(attachments = [document()], projectOverrides = {}) {
  const view = { creator: { id: 'creator', name: 'Creator' }, project: {
    id: 'project', categoryId: 'portal', title: 'Actual project', cover: 'never-use-this-cover.webp', attachments, ...projectOverrides,
  } };
  const calls = [];
  return { view, calls, services: {
    projects: { async getProjectView(id) { calls.push(['project', id]); return view; } },
    profiles: { async resolvePublicHandle(handle) { calls.push(['handle', handle]); return { profileId: 'creator', handle, alias: false }; } },
  } };
}

test('parser trusts only same-origin, production and the exact legacy host, retaining page query and hash', () => {
  for (const origin of [local, PUBLIC_ORIGIN, legacy]) {
    const to = `${plain}?${new URLSearchParams({ media: attachmentId, page: '6' })}#page-six`;
    const target = parse(origin + to, local);
    assert.equal(target.to, to); assert.equal(target.profileId, 'creator'); assert.equal(target.categoryId, 'portal');
    assert.equal(target.projectId, 'project'); assert.equal(target.attachmentId, attachmentId); assert.equal(target.pageNumber, 6);
  }
});

test('parser supports current p paths, valid public handles and plain project shares only', () => {
  const target = parse(`${PUBLIC_ORIGIN}/p/creator/c/portal/project/`, local);
  assert.equal(target.profileId, 'creator'); assert.equal(target.attachmentId, null); assert.equal(target.pageNumber, null);
  const handle = parse(`${PUBLIC_ORIGIN}/creator.work/c/portal/project?via=friend`, local);
  assert.equal(handle.profileId, null); assert.equal(handle.handle, 'creator.work');
  for (const path of ['/share/creator', '/share/creator/c/portal', '/p/creator', '/messages/c/portal/project',
    '/invalid_handle/c/portal/project', '/share/creator/c/portal/project/extra']) assert.equal(parse(PUBLIC_ORIGIN + path, local), null, path);
});

test('deceptive hosts, credentials, foreign URLs and encoded path separators cannot trigger content reads', () => {
  for (const url of [`https://portalinknetworks.com.evil.test${plain}`, `https://portalinknetworks.com@evil.test${plain}`,
    `https://user@portalinknetworks.com${plain}`, `https://user:password@portalinknetworks.com${plain}`,
    `https://portalinknetworks.com:444${plain}`, `http://portalinknetworks.com${plain}`,
    `https://other.test${plain}`, `https://portalinknetworksinc.avimangalmurti566055.chatgpt.site.evil.test${plain}`,
    `${PUBLIC_ORIGIN}/share/creat%2For/c/portal/project`, `${PUBLIC_ORIGIN}/share/creator/c/portal%5Cname/project`,
    `${PUBLIC_ORIGIN}\\share\\creator/c/portal/project`, `${PUBLIC_ORIGIN}${plain}\n`, `javascript:${plain}`, plain]) {
    assert.equal(parse(url, local), null, url);
  }
});

test('media is an opaque decoded storage key, not a UUID or URL to fetch', () => {
  const opaque = 'creator/dir/a b?#&+%雪.pdf';
  assert.equal(readTarget(pageUrl(6, opaque)).attachmentId, opaque);
  assert.ok(parse(pageUrl(1, 'a'.repeat(4096)), local));
  assert.equal(parse(pageUrl(1, 'a'.repeat(4097)), local), null);
  for (const media of ['', 'a\u0000b', 'a\nb']) assert.equal(parse(pageUrl(6, media), local), null);
  const withoutPage = parse(`${PUBLIC_ORIGIN}${plain}?${new URLSearchParams({ media: opaque })}`, local);
  assert.equal(withoutPage.attachmentId, opaque); assert.equal(withoutPage.pageNumber, null);
});

test('ambiguous media/page parameters and invalid page numbers are rejected', () => {
  for (const query of ['media=x&media=y&page=6', 'media=x&page=6&page=6', 'page=6', 'media=x&page=',
    'media=x&page=0', 'media=x&page=-1', 'media=x&page=1.5', 'media=x&page=01', 'media=x&page=1e2',
    'media=x&page=100001', 'media=x&page=Infinity']) assert.equal(parse(`${PUBLIC_ORIGIN}${plain}?${query}`, local), null, query);
  assert.equal(readTarget(pageUrl(100000)).pageNumber, 100000);
});

test('PDF Page 6 resolves its exact authorized bitmap and never the cover or first page', async () => {
  const f = fixture(); const result = await resolve(readTarget(), f.services);
  assert.equal(result.title, 'Actual project'); assert.equal(result.pageLabel, 'Page 6');
  assert.equal(result.kind, 'image'); assert.equal(result.source, 'https://media.test/page-6.webp');
  assert.equal(result.pageNumber, 6); assert.equal(result.aspectRatio, .7);
  assert.deepEqual(f.calls, [['project', 'project']]);
});

test('PDF selection requires both the matching page number and attachment identity', async () => {
  const f = fixture([document({ metadata: { pageCount: 8, renderedPages: [raster(1), raster(6, { attachmentId: 'different-document' })] } })]);
  const result = await resolve(readTarget(), f.services);
  assert.equal(result.kind, 'document'); assert.equal(result.source, 'https://media.test/original.pdf'); assert.equal(result.pageNumber, 6);
});

test('unrendered PDF Page 6 keeps the original and requested page for strict rendering, including unknown counts', async () => {
  for (const metadata of [{ pageCount: 8 }, undefined]) {
    const f = fixture([document({ metadata })]); const result = await resolve(readTarget(), f.services);
    assert.equal(result.kind, 'document'); assert.equal(result.pageNumber, 6); assert.equal(result.pageLabel, 'Page 6');
    assert.equal(result.source, 'https://media.test/original.pdf');
  }
});

test('out-of-bounds PDF pages, missing assets and missing page artwork do not borrow any cover', async () => {
  for (const attachments of [[], [document({ id: 'other-document' })], [document({ metadata: { pageCount: 5 } })],
    [document({ sourceUrl: null, metadata: { pageCount: 8, renderedPages: [raster(1)] } })],
    [{ id: attachmentId, kind: 'video', sourceUrl: 'video.mp4', order: 0 }]]) {
    await assert.rejects(resolve(readTarget(), fixture(attachments).services), /unavailable/);
  }
});

test('resolver rejects invalid page targets before service calls, even when bypassing the parser', async () => {
  for (const pageNumber of [0, -1, 1.5, 100001, NaN, Infinity]) {
    const f = fixture();
    await assert.rejects(resolve({ ...readTarget(), pageNumber }, f.services), /unavailable/);
    assert.equal(f.calls.length, 0);
  }
});

test('exact PDF bitmap remains available even if the original is unavailable', async () => {
  const result = await resolve(readTarget(), fixture([document({ sourceUrl: null })]).services);
  assert.equal(result.source, 'https://media.test/page-6.webp'); assert.equal(result.kind, 'image');
});

test('image shares follow stable attachment identity and sorted image ordinal, allowing earlier page=1 links', async () => {
  const images = [{ id: 'last-image', kind: 'image', sourceUrl: 'six.webp', order: 9, metadata: { aspectRatio: 1.4 } },
    ...Array.from({ length: 5 }, (_, index) => ({ id: `image-${index}`, kind: 'image', sourceUrl: `${index}.webp`, order: index }))];
  for (const page of [6, 1]) {
    const result = await resolve(readTarget(pageUrl(page, 'last-image')), fixture(images).services);
    assert.equal(result.source, 'six.webp'); assert.equal(result.pageLabel, 'Image 6');
    assert.equal(result.pageNumber, 6); assert.equal(result.aspectRatio, 1.4);
  }
  await assert.rejects(resolve(readTarget(pageUrl(5, 'last-image')), fixture(images).services), /unavailable/);
  await assert.rejects(resolve(readTarget(pageUrl(6, 'image-0')), fixture(images).services), /unavailable/);
  await assert.rejects(resolve(readTarget(pageUrl(6, 'last-image')), fixture(images.map(image => ({ ...image, sourceUrl: null }))).services), /unavailable/);
});

test('project/category/profile mismatches cannot show unrelated authorized content', async () => {
  for (const mutate of [f => { f.view.project.id = 'different-project'; }, f => { f.view.project.categoryId = 'different-portal'; },
    f => { f.view.creator.id = 'different-creator'; }]) {
    const f = fixture(); mutate(f); await assert.rejects(resolve(readTarget(), f.services), /unavailable/);
  }
});

test('handle lookup is permission-preserving and must identify the project creator', async () => {
  const target = readTarget(pageUrl(6, attachmentId, '/creator.work/c/portal/project'));
  const f = fixture(); assert.equal((await resolve(target, f.services)).source, 'https://media.test/page-6.webp');
  assert.deepEqual(f.calls, [['handle', 'creator.work'], ['project', 'project']]);
  for (const result of [null, { profileId: 'other-creator' }]) {
    const denied = fixture(); denied.services.profiles.resolvePublicHandle = async () => result;
    await assert.rejects(resolve(target, denied.services), /unavailable/);
  }
  const missing = fixture(); delete missing.services.profiles.resolvePublicHandle;
  await assert.rejects(resolve(target, missing.services), /unavailable/); assert.equal(missing.calls.length, 0);
});

test('private, removed and transient service failures propagate without fallback or extra reads', async () => {
  for (const error of [Object.assign(new Error('not readable'), { code: 'not_found' }), new Error('connection interrupted')]) {
    const f = fixture(); f.services.projects.getProjectView = async () => { throw error; };
    await assert.rejects(resolve(readTarget(), f.services), caught => caught === error);
  }
  const f = fixture(); const error = new Error('handle lookup failed');
  f.services.profiles.resolvePublicHandle = async () => { throw error; };
  await assert.rejects(resolve(readTarget(pageUrl(6, attachmentId, '/creator.work/c/portal/project')), f.services), caught => caught === error);
  assert.equal(f.calls.length, 0);
});

test('whole project shares return existing static covers and thumbnails without starting video or PDF', async () => {
  const target = readTarget(PUBLIC_ORIGIN + plain);
  const thumbnail = { version: 1, bucket: 'project-covers', sourceAttachmentId: attachmentId,
    sourceKey: 'existing', frameBaked: true, variants: [{ size: 400, width: 400, height: 300, sourceUrl: 'static-cover.webp', path: 'cover' }] };
  const f = fixture([], { cover: 'image-cover.webp', coverAspectRatio: 4 / 3, coverThumbnail: thumbnail });
  const image = await resolve(target, f.services);
  assert.equal(image.kind, 'cover'); assert.equal(image.source, 'image-cover.webp'); assert.equal(image.pageLabel, null);
  assert.equal(image.thumbnail, thumbnail); assert.equal(image.aspectRatio, 4 / 3);
  const pdf = await resolve(target, fixture([document({ isCover: true })], { coverKind: 'document', cover: 'original.pdf', coverPageNumber: 6 }).services);
  assert.equal(pdf.kind, 'cover'); assert.equal(pdf.source, 'https://media.test/page-6.webp');
  const video = await resolve(target, fixture([], { coverKind: 'video', cover: 'original.mp4' }).services);
  assert.equal(video.source, null); assert.equal(video.kind, 'cover');
  const unrenderedPdf = await resolve(target, fixture([document({ metadata: {} })], { coverKind: 'document', cover: 'original.pdf' }).services);
  assert.equal(unrenderedPdf.source, null);
});
