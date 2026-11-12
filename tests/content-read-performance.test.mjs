import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const text = ['contentServices', 'contentReaders', 'projectReaders'].map(name => readFileSync(new URL(`../src/services/supabase/${name}.ts`, import.meta.url), 'utf8')).join('\n');
const source = ts.createSourceFile('content.ts', text, ts.ScriptTarget.Latest, true);
const fn = name => source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(source);
const methods = (service, names) => source.statements.flatMap(n => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : []).filter(n => [service, service.replace('Service', 'ReadService')].includes(n.name.getText(source))).flatMap(n => n.initializer.properties).filter(n => names.includes(n.name?.getText(source))).map(n => n.getText(source)).join(',\n');
const plain = value => JSON.parse(JSON.stringify(value));
function contentFixture({ hiddenCategory = false, owner = false } = {}) {
  const queries = [], hydration = [], signals = [];
  const rows = {
    projects: ['a', 'b'].map(id => ({ published_at: '2026-09-01T00:00:00Z', id, profile_id: 'creator', category_id: id === 'a' ? 'category' : 'other', title: id, summary: 'Design', topic_keys: ['design'], design: { typefaceId: id } })),
    profiles: [{ id: 'creator', name: 'Creator', headline: 'Bio', location: 'City', avatar_url: 'avatar' }],
    portfolio_categories: [{ id: 'category', label: 'Design' }, { id: 'other', label: 'Other' }].filter(row => row.id !== 'category' || !hiddenCategory || owner),
    project_attachments: [{ project_id: 'a', id: 'attachment-a' }, { project_id: 'b', id: 'attachment-b' }],
  };
  const client = {
    from(table) {
      const query = { table, filters: [], columns: '*', single: false };
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        in(key, values) { query.filters.push(row => values.includes(row[key])); return builder; },
        eq(key, value) { query.filters.push(row => row[key] === value); return builder; },
        order() { return builder; },
        single() { query.single = true; return builder; },
        then(resolve, reject) {
          queries.push({ table, columns: query.columns });
          const result = rows[table].filter(row => query.filters.every(filter => filter(row)));
          return Promise.resolve({ data: query.single ? result[0] : result, error: query.single && !result[0] ? { message: 'not found' } : null }).then(resolve, reject);
        },
      };
      return builder;
    },
    rpc: async (name, input) => { signals.push({ name, input }); return { error: null }; },
  };
  const exports = {};
  const program = `${fn('loadRequestedProjectViews')}\nconst projects={${methods('supabaseProjectService', ['getProject', 'getProjectView', 'listProjectViews', 'getProjectDesign', 'listProjectDesigns'])}}; const discovery={${methods('supabaseDiscoveryService', ['recordProjectSignal'])}}; exports.projects=projects;exports.discovery=discovery;`;
  vm.runInNewContext(ts.transpileModule(program, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, requireSupabase: () => client, ProjectMutationError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
    throwProfileError: error => { throw new Error(error.message); }, asDesign: value => value,
    hydrateProjects: async (projects, categories, attachments) => { hydration.push(plain({ projects, attachments })); return new Map(projects.map(row => [row.id, { id: row.id, design: row.design }])); },
    deriveProjectRelevance: input => ({ topicKeys: [...input.stored.topicKeys, input.categoryLabel.toLowerCase()] }),
    isMissingDiscoveryTable: () => false,
  });
  return { ...exports, queries, hydration, signals };
}

test('opening one project reads only that project and its attachments, not the creator portfolio', async () => {
  const h = contentFixture();
  assert.equal((await h.projects.getProjectView('a')).project.id, 'a');
  assert.deepEqual(h.hydration[0].projects.map(row => row.id), ['a']);
  assert.deepEqual(h.hydration[0].attachments.map(row => row.id), ['attachment-a']);
  assert.equal(h.queries.filter(row => row.table === 'projects').length, 1);
  assert.equal(h.queries.find(row => row.table === 'profiles').columns, 'id,name,headline,avatar_url,location,is_private');
});

test('direct reads never sign hidden-category files for visitors, while owners retain access', async () => {
  const visitor = contentFixture({ hiddenCategory: true });
  await assert.rejects(visitor.projects.getProject('a'), /could not be found/);
  assert.equal(visitor.hydration[0].projects.length, 0);
  assert.equal(visitor.hydration[0].attachments.length, 0);
  assert.equal((await contentFixture({ hiddenCategory: true, owner: true }).projects.getProject('a')).id, 'a');
});

test('design reads and discovery signals do not fetch attachments or hydrate files', async () => {
  const h = contentFixture();
  assert.deepEqual(plain(await h.projects.listProjectDesigns(['a'])), { a: { typefaceId: 'a' } });
  await h.discovery.recordProjectSignal('a', 'interest');
  assert.equal(h.hydration.length, 0);
  assert.equal(h.queries.some(row => row.table === 'project_attachments'), false);
  assert.deepEqual(plain(h.signals[0].input), { p_topic_keys: ['design', 'design'], p_signal_kind: 'interest' });
  assert.ok(h.queries.some(row => row.columns === 'title,summary,topic_keys,category_id'));
});

test('minimal design and signal reads retain the readable category boundary', async () => {
  const h = contentFixture({ hiddenCategory: true });
  await assert.rejects(h.projects.getProjectDesign('a'), /could not be found/);
  await assert.rejects(h.discovery.recordProjectSignal('a', 'interest'), /could not be found/);
  assert.equal(h.signals.length, 0);
});

function mediaFixture() {
  let accountId = 'account-a', now = 0, callback, failure = false, deferred;
  const calls = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: accountId ? { user: { id: accountId } } : null }, error: null }),
      onAuthStateChange: cb => { callback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    },
    storage: { from: bucket => ({ createSignedUrls: async (paths, seconds) => {
      calls.push({ bucket, paths, seconds }); const serial = calls.length;
      if (deferred) await deferred;
      return failure ? { error: { message: 'Denied' }, data: null } : { error: null, data: paths.map(path => ({ path, signedUrl: `signed/${serial}/${path}` })) };
    } }) },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/services/supabase/mediaUrlCache.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: () => ({ requireSupabase: () => client }), Date: { now: () => now },
  });
  return {
    ...exports, calls, advance: value => { now += value; }, fail: value => { failure = value; }, defer: value => { deferred = value; },
    change: (next, event = 'SIGNED_IN') => { accountId = next; callback?.(event, next ? { user: { id: next } } : null); },
  };
}

test('signed URLs reuse stable in-flight and completed results, renewing before expiry', async () => {
  const h = mediaFixture();
  const [one, two] = await Promise.all([h.signedMediaUrls('private', ['a', 'b']), h.signedMediaUrls('private', ['a'])]);
  assert.equal(h.calls.length, 1); assert.equal(one.get('a'), two.get('a'));
  assert.equal((await h.signedMediaUrls('private', ['a'])).get('a'), one.get('a'));
  h.advance(6 * 3600_000 - 4 * 60_000);
  assert.notEqual((await h.signedMediaUrls('private', ['a'])).get('a'), one.get('a'));
  assert.equal(h.calls.length, 2);
});

test('account changes and sign-out purge capabilities; token refresh alone keeps them', async () => {
  const h = mediaFixture();
  const first = (await h.signedMediaUrls('private', ['a'])).get('a');
  h.change('account-a', 'TOKEN_REFRESHED');
  assert.equal((await h.signedMediaUrls('private', ['a'])).get('a'), first);
  h.change('account-b');
  assert.notEqual((await h.signedMediaUrls('private', ['a'])).get('a'), first);
  h.change(null, 'SIGNED_OUT');
  await h.signedMediaUrls('private', ['a']);
  assert.equal(h.calls.length, 3);
});

test('new multipart registrations renew cached parts that would expire before their virtual URL', async () => {
  const h = mediaFixture();
  const first = (await h.signedMediaUrls('private', ['part'], 5 * 3600_000)).get('part');
  h.advance(2 * 3600_000);
  assert.equal((await h.signedMediaUrls('private', ['part'])).get('part'), first);
  assert.notEqual((await h.signedMediaUrls('private', ['part'], 5 * 3600_000)).get('part'), first);
});

test('a late signing result cannot cross an account boundary and failed signing can retry', async () => {
  const h = mediaFixture(); let release;
  h.defer(new Promise(resolve => { release = resolve; }));
  const pending = h.signedMediaUrls('private', ['a']);
  await new Promise(resolve => setImmediate(resolve));
  h.change('account-b'); release();
  await assert.rejects(pending, /session changed/);
  h.defer(null); h.fail(true);
  await assert.rejects(h.signedMediaUrls('private', ['a']), /Denied/);
  h.fail(false);
  assert.ok((await h.signedMediaUrls('private', ['a'])).get('a'));
});

test('long files are signed in bounded batches and multipart virtual URLs share the same scope', async () => {
  const h = mediaFixture();
  const urls = await h.signedMediaUrls('private', Array.from({ length: 4500 }, (_, index) => `page-${index}`));
  assert.equal(urls.size, 4500); assert.ok(h.calls.every(call => call.paths.length <= 100));
  let loads = 0;
  const load = async () => `virtual/${++loads}`;
  assert.equal(await h.cachedMediaSource('multipart', load, 5 * 3600_000), 'virtual/1');
  assert.equal(await h.cachedMediaSource('multipart', load, 5 * 3600_000), 'virtual/1');
  h.change('other');
  assert.equal(await h.cachedMediaSource('multipart', load, 5 * 3600_000), 'virtual/2');
});

test('feed page uses the stable cursor and only falls back when its prepared RPC is absent', async () => {
  let response = { data: Array.from({ length: 31 }, (_, i) => ({ project: { id: `p${i}`, published_at: '2026-09-01' } })), error: null };
  const calls = [], exports = {};
  vm.runInNewContext(ts.transpileModule(`${fn('readFeedPage')}\nexports.read=readFeedPage;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, requireSupabase: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return response; } }),
  });
  const page = await exports.read('home', { id: 'cursor', publishedAt: '2026-09-02' });
  assert.equal(page.rows.length, 30);
  assert.deepEqual(plain(page.nextCursor), { id: 'p29', publishedAt: '2026-09-01' });
  assert.deepEqual(plain(calls[0]), { name: 'project_feed_page', args: { p_scope: 'home', p_before_date: '2026-09-02', p_before_id: 'cursor', p_limit: 31 } });
  response = { error: { code: 'PGRST202', message: 'not installed' } };
  assert.equal(await exports.read('home'), null);
  response = { error: { code: '42501', message: 'denied' } };
  await assert.rejects(exports.read('home'), /denied/);
});

test('feed PDF covers sign only the selected rendered page while full viewers keep every page', async () => {
  const signed = [], multipart = [], exports = {};
  const program = ['renderedPagePaths', 'asMetadata', 'hydrateProjects'].map(fn).join('\n');
  vm.runInNewContext(ts.transpileModule(`${program}\nexports.hydrate=hydrateProjects;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, ...sourceModule('src/features/publishing/firstProject.ts'), ...sourceModule('src/features/journey/journey.ts'),
    signedUrls: async paths => { signed.push(paths); return new Map(paths.map(path => [path, `url/${path}`])); },
    readVideoPlayback: () => null, readMultipartSpec: value => value,
    readCoverThumbnail: () => undefined,
    multipartSource: async path => { multipart.push(path); return 'virtual-source'; },
    multipartPdfRangeReader: () => async () => assert.fail('Hydration must not open or download the PDF ranges'),
    normalizeProjectCoverFrame: value => value, resolveStoredMediaKind: kind => kind,
    deriveProjectRelevance: () => ({}), asDesign: value => value,
  });
  const row = { published_at: '2026-09-01T00:00:00Z', id: 'p', title: 'PDF', category_id: 'category' };
  const attachment = { id: 'pdf', project_id: 'p', kind: 'document', storage_path: 'original', is_cover: true, metadata: {
    multipart: { partCount: 20 }, coverPageNumber: 2,
    renderedPages: Array.from({ length: 300 }, (_, i) => ({ index: i, withinDocumentIndex: i + 1, attachmentId: 'pdf', storagePath: `page-${i + 1}`, width: 600, height: 800, aspectRatio: .75 })),
  } };
  const feed = (await exports.hydrate([row], [], [attachment], 'cover')).get('p');
  assert.deepEqual(Array.from(signed[0]), ['original', 'page-2']);
  assert.equal(feed.cover, 'url/page-2'); assert.equal(feed.coverKind, undefined);
  assert.equal(feed.coverAspectRatio, .75); assert.equal(multipart.length, 0);
  const full = (await exports.hydrate([row], [], [attachment])).get('p');
  assert.equal(signed[1].length, 301); assert.equal(multipart.length, 1);
  assert.equal(full.attachments[0].metadata.renderedPages.length, 300);
  assert.equal(full.coverKind, 'document'); assert.equal(full.cover, 'virtual-source');
});
