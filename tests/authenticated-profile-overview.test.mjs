import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const PROFILE = '11111111-1111-4111-8111-111111111111';
const CATEGORY = '22222222-2222-4222-8222-222222222222';
const HIDDEN_CATEGORY = '33333333-3333-4333-8333-333333333333';
const HASH = 'a'.repeat(64);
const source = ts.createSourceFile('contentReaders.ts', readFileSync(new URL('../src/services/supabase/contentReaders.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const fn = name => source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(source);
const service = source.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
  .find(node => node.name.getText(source) === 'supabaseProfileReadService').getText(source);
const plain = value => JSON.parse(JSON.stringify(value));
const manifest = (id, bucket = 'project-covers') => ({ version: 1, bucket, frameBaked: true, sourceKey: HASH, sourceAttachmentId: `${id}-cover`,
  variants: [200, 400, 800].map(size => ({ size, path: `${PROFILE}/${id}/${HASH}/${size}.webp`, width: size / 2, height: size })) });
const project = (id, extra = {}) => ({ id, profile_id: PROFILE, category_id: CATEGORY, title: id, summary: 'Project description',
  published_at: '2026-10-01T00:00:00Z', made_on: '2026-09-01', position: 0, is_hidden: false, is_pinned: false,
  design: { typefaceId: 'inter', tags: ['design'] }, cover_thumbnail: null, page_count: 300, ...extra });
const attachment = (projectId, id, extra = {}) => ({ project_id: projectId, id, kind: 'document', file_name: `${id}.pdf`,
  display_name: id, extension: 'pdf', mime_type: 'application/pdf', size_bytes: 100, type_label: 'PDF', storage_path: `${id}.pdf`,
  status: 'ready', is_cover: true, position: 0, metadata: { multipart: { version: 1 }, pageCount: 300, coverPageNumber: 7,
    renderedPages: Array.from({ length: 300 }, (_, index) => ({ index, withinDocumentIndex: index + 1, attachmentId: id,
      storagePath: `${id}-page-${index + 1}.png`, width: 600, height: 800, aspectRatio: .75 })) }, ...extra });

function harness({ projects = [project('bitmap', { cover_thumbnail: manifest('bitmap') }), project('legacy')], attachments,
  accountId = 'owner', profile = {}, readable = true, errors = {} } = {}) {
  const queries = [], signing = [], multipart = [];
  const rows = {
    profiles: readable ? [{ id: PROFILE, account_id: 'owner', name: 'Creator Name', handle: 'creator', headline: 'Bio', location: 'City',
      avatar_url: 'avatar.jpg', nav_heading: 'Portals', stats: [{ label: 'Projects', value: '2' }], social_links: { instagram: 'https://example.com' },
      links: [{ label: 'Website', href: 'https://example.com' }], is_private: false, show_journey: true, project_grid_columns: 7,
      public_appearance: { accentColor: '#000000', systemGray: 'gray6', mode: 'auto' }, then_now: { then: 'legacy', now: 'bitmap' }, ...profile }] : [],
    portfolio_categories: [{ id: CATEGORY, profile_id: PROFILE, label: 'Design', icon_name: 'palette', format: 'grid', blurb: 'Work', position: 0, is_hidden: false },
      { id: HIDDEN_CATEGORY, profile_id: PROFILE, label: 'Hidden', icon_name: 'lock', format: 'grid', blurb: '', position: 1, is_hidden: true }],
    projects,
    project_attachments: attachments ?? projects.flatMap(row => [attachment(row.id, `${row.id}-cover`),
      attachment(row.id, `${row.id}-other`, { kind: 'video', is_cover: false, position: 1, metadata: { multipart: { version: 1 } } })]),
    profile_journey_pairs: [{ profile_id: PROFILE, pair: { then: 'bitmap', now: 'legacy' } }],
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: accountId ? { user: { id: accountId } } : null }, error: null }) },
    from(table) {
      const filters = [], orders = [], record = { table, columns: '*', inputs: [] };
      const builder = {
        select(columns) { record.columns = columns; return builder; },
        eq(key, value) { filters.push(row => row[key] === value); record.inputs.push({ key, value }); return builder; },
        in(key, values) { filters.push(row => values.includes(row[key])); record.inputs.push({ key, values: [...values] }); return builder; },
        order(key, options) { orders.push({ key, ascending: options?.ascending !== false }); return builder; },
        then(resolve, reject) {
          queries.push(record);
          let data = rows[table].filter(row => filters.every(filter => filter(row)));
          for (const { key, ascending } of [...orders].reverse()) data = [...data].sort((a, b) => {
            const compared = typeof a[key] === 'number' ? a[key] - b[key] : String(a[key]).localeCompare(String(b[key]));
            return ascending ? compared : -compared;
          });
          return Promise.resolve({ data, error: errors[table] ?? null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const covers = sourceModule('src/services/supabase/coverThumbnailReads.ts', {
    '../../features/media/publicMediaUrl': { publicCoverUrl: path => `/media/covers/${path}` },
  });
  const exports = {};
  const functions = ['deriveInitials', 'asStringRecord', 'asStats', 'asLinks', 'renderedPagePaths', 'asMetadata', 'asDesign',
    'throwProfileError', 'signedUrls', 'hydrateProjects', 'loadProfiles'].map(fn).join('\n');
  vm.runInNewContext(ts.transpileModule(`${functions}\nconst ${service};\nexports.service=supabaseProfileReadService;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, requireSupabase: () => client,
    ...sourceModule('src/features/publishing/firstProject.ts'), ...sourceModule('src/features/journey/journey.ts'),
    ...sourceModule('src/features/employer/employer.ts'), ...covers,
    PROJECT_MEDIA_BUCKET: 'project-media', MAX_PAGES_PER_ROW: 8, MIN_PAGES_PER_ROW: 1,
    ProfileServiceError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
    signedMediaUrls: async (_bucket, paths) => {
      if (paths.length) signing.push([...paths]);
      return new Map(paths.map(path => [path, `signed:${path}`]));
    },
    readMultipartSpec: value => value,
    multipartSource: async path => { multipart.push(path); return `multipart:${path}`; },
    readVideoPlayback: () => undefined,
    resolveStoredMediaKind: kind => kind,
    normalizeProjectCoverFrame: value => value,
    normalizePublicAppearance: value => value,
    normalizeProjectGridColumns: value => value,
    deriveProjectRelevance: () => ({}),
    readSharedProfileBundle: async () => ({ status: 'unsupported' }),
  });
  return { ...exports, queries, signing, multipart };
}

test('bitmap overview keeps complete identity/counts/order without reading, signing or preparing originals', async () => {
  const projects = [project('first', { cover_thumbnail: manifest('first'), position: -1 }),
    project('second', { cover_thumbnail: manifest('second'), position: -2 })];
  const h = harness({ projects });
  const profile = await h.service.getProfileOverview(PROFILE);
  assert.equal(profile.name, 'Creator Name');
  assert.equal(profile.handle, '@creator');
  assert.equal(profile.location, 'City');
  assert.equal(profile.projectGridColumns, 7);
  assert.equal(profile.projects.length, 2);
  assert.deepEqual(Array.from(profile.projects, row => row.id), ['second', 'first']);
  assert.ok(profile.projects.every(row => row.cover.endsWith('/800.webp') && row.attachments.length === 0));
  assert.equal(h.queries.some(query => query.table === 'project_attachments'), false);
  assert.equal(h.signing.length, 0);
  assert.equal(h.multipart.length, 0);
});

test('private bitmap overview signs only cover variants and does not read attachment metadata', async () => {
  const h = harness({ projects: [project('private-cover', { cover_thumbnail: manifest('private-cover', 'project-media') })], profile: { is_private: true } });
  const profile = await h.service.getProfileOverview(PROFILE);
  assert.equal(profile.isPrivate, true);
  assert.equal(profile.projects[0].cover, `signed:${manifest('private-cover', 'project-media').variants[2].path}`);
  assert.deepEqual(h.signing, [manifest('private-cover', 'project-media').variants.map(variant => variant.path)]);
  assert.equal(h.queries.some(query => query.table === 'project_attachments'), false);
  assert.equal(h.multipart.length, 0);
});

test('legacy overview reads only projects without bitmaps and prepares one selected PDF page and cover', async () => {
  const h = harness();
  const profile = await h.service.getProfileOverview(PROFILE);
  const query = h.queries.find(query => query.table === 'project_attachments');
  assert.deepEqual(query.inputs, [{ key: 'project_id', values: ['legacy'] }]);
  assert.deepEqual(h.signing, [['legacy-cover.pdf', 'legacy-cover-page-7.png']]);
  assert.equal(h.multipart.length, 0);
  const legacy = profile.projects.find(row => row.id === 'legacy');
  assert.equal(legacy.cover, 'signed:legacy-cover-page-7.png');
  assert.equal(legacy.pageCount, 300);
  assert.equal(legacy.attachments.length, 1);
  assert.equal(legacy.attachments[0].metadata.renderedPages.length, 1);
});

test('legacy no-cover projects preserve the existing first-image fallback', async () => {
  const h = harness({ projects: [project('legacy')], attachments: [
    attachment('legacy', 'document', { is_cover: false }),
    attachment('legacy', 'image', { is_cover: false, kind: 'image', position: 1, metadata: null }),
    attachment('legacy', 'other-image', { is_cover: false, kind: 'image', position: 2, metadata: null }),
  ] });
  const profile = await h.service.getProfileOverview(PROFILE);
  assert.equal(profile.projects[0].cover, 'signed:image.pdf');
  assert.deepEqual(h.signing, [['image.pdf']]);
  assert.equal(profile.projects[0].attachments.length, 1);
  assert.equal(h.multipart.length, 0);
});

test('owner overview retains private Journey pair, hidden projects and categories', async () => {
  const h = harness({ projects: [project('bitmap', { cover_thumbnail: manifest('bitmap') }),
    project('legacy', { cover_thumbnail: manifest('legacy'), category_id: HIDDEN_CATEGORY, is_hidden: true })],
    profile: { is_private: true, show_journey: false } });
  const profile = await h.service.getProfileOverview(PROFILE);
  assert.equal(profile.isPrivate, true);
  assert.equal(profile.showJourney, false);
  assert.equal(profile.projects.length, 2);
  assert.equal(profile.categories.length, 2);
  assert.equal(profile.projects.find(row => row.id === 'legacy').isPubliclyVisible, false);
  assert.deepEqual(plain(profile.thenNow), { then: 'bitmap', now: 'legacy' });
  assert.equal(h.queries.filter(query => query.table === 'profile_journey_pairs').length, 1);
});

test('nonowner overview keeps the existing public visibility and Journey opt-in rules', async () => {
  const h = harness({ accountId: 'visitor', projects: [project('bitmap', { cover_thumbnail: manifest('bitmap') }),
    project('legacy', { cover_thumbnail: manifest('legacy'), category_id: HIDDEN_CATEGORY, is_hidden: true })], profile: { show_journey: false } });
  const profile = await h.service.getProfileOverview(PROFILE);
  assert.deepEqual(Array.from(profile.projects, row => row.id), ['bitmap']);
  assert.equal(profile.categories.length, 1);
  assert.equal(profile.thenNow, null);
  assert.equal(h.queries.some(query => query.table === 'profile_journey_pairs'), false);
});

test('full profile reader still retains every attachment, rendered PDF page and original media source', async () => {
  const h = harness();
  const profile = await h.service.getProfile(PROFILE);
  assert.equal(profile.projects.length, 2);
  assert.ok(profile.projects.every(row => row.attachments.length === 2 && row.attachments[0].metadata.renderedPages.length === 300));
  assert.ok(h.signing[0].includes('bitmap-cover.pdf'));
  assert.ok(h.signing[0].includes('legacy-cover-page-300.png'));
  assert.ok(h.signing[0].includes('legacy-other.pdf'));
  assert.equal(h.multipart.length, 4);
});

test('existing public fallback keeps its original cover-only bundle behavior', async () => {
  const h = harness({ accountId: null });
  const profile = await h.service.getSharedProfile(PROFILE);
  assert.equal(profile.projects.length, 2);
  assert.equal(profile.categories.length, 1);
  assert.equal(profile.projects.find(row => row.id === 'bitmap').attachments.length, 0);
  assert.equal(profile.projects.find(row => row.id === 'legacy').attachments.length, 2);
  const query = h.queries.find(query => query.table === 'project_attachments');
  assert.deepEqual(query.inputs, [{ key: 'project_id', values: ['bitmap', 'legacy'] }]);
  assert.equal(h.queries.some(query => query.table === 'profile_journey_pairs'), false);
});

test('missing/unreadable profiles remain absent and database failures are still reported', async () => {
  await assert.rejects(harness({ readable: false }).service.getProfileOverview(PROFILE), /could not be found/);
  await assert.rejects(harness({ errors: { project_attachments: { message: 'Access denied' } } }).service.getProfileOverview(PROFILE), /Access denied/);
  const h = harness({ errors: { profile_journey_pairs: { code: '42P01', message: 'profile_journey_pairs does not exist' } } });
  assert.deepEqual(plain((await h.service.getProfileOverview(PROFILE)).thenNow), { then: 'legacy', now: 'bitmap' });
});
