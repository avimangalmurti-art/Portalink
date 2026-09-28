import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function execute(source, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, { exports, ...globals });
  return exports;
}
function serviceFunction(name, globals) {
  const file = ts.createSourceFile('content.ts', read('src/services/supabase/contentServices.ts'), ts.ScriptTarget.Latest, true);
  const fn = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  assert.ok(fn);
  return execute(`${fn.getText(file)}\nexports.run = ${name};`, globals).run;
}
function query(result, onRead = () => {}) {
  const chain = { then(resolve, reject) { onRead(); return Promise.resolve(result).then(resolve, reject); } };
  for (const method of ['select', 'eq', 'in', 'order', 'maybeSingle']) chain[method] = () => chain;
  return chain;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('Home ranking uses existing identity/location without reloading the full portfolio', async () => {
  let profileReads = 0, authReads = 0, requested, ranked;
  const rows = {
    profiles: { id: 'owner', location: 'San Francisco' },
    profile_follows: [{ target_profile_id: 'followed' }],
    project_engagement: [], discovery_signals: [], discovery_preferences: { home_mode: 'latest' },
  };
  const projects = [{ project: { id: 'real-project' } }];
  const run = serviceFunction('discoveryContext', {
    requireSupabase: () => ({ auth: { getUser: async () => { authReads++; return { data: { user: { id: 'account' } } }; } },
      from: table => query({ data: rows[table], error: null }),
    }),
    projectIdsForProfiles: async ids => { requested = ids; return ['real-project']; },
    projectViewsForIds: async () => projects,
    supabaseProfileService: { getProfile: () => { profileReads++; throw new Error('Duplicate portfolio request'); } },
    buildUserContentSphere: input => { ranked = input; return 'sphere'; },
    asHomeFeedMode: mode => mode,
  });
  const result = await run('home');
  assert.equal(profileReads, 0); assert.equal(authReads, 1);
  assert.deepEqual(plain(requested), ['owner', 'followed']);
  assert.deepEqual(plain(ranked.viewerProfile), rows.profiles);
  assert.equal(result.availableProjects, projects); assert.equal(result.homeMode, 'latest');
});

test('guest Home stays empty and request failures are not hidden by the faster path', async () => {
  const guest = serviceFunction('discoveryContext', {
    requireSupabase: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
    projectViewsForIds: async ids => { assert.equal(ids.length, 0); return []; },
    buildUserContentSphere: input => input, guestHomeFeedMode: 'balanced',
  });
  assert.equal((await guest('home')).availableProjects.length, 0);
  const failing = serviceFunction('discoveryContext', {
    requireSupabase: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'account' } } }) },
      from: () => query({ data: null, error: { message: 'offline' } }),
    }),
  });
  await assert.rejects(failing('home'), /offline/);
});

test('profile data starts alongside auth but visibility still waits for verified identity', async () => {
  for (const account of ['owner-account', 'visitor-account', null]) {
    let resolveAuth, profileStarted = false, resolved = false;
    const auth = new Promise(resolve => { resolveAuth = resolve; });
    const rows = {
      profiles: [{ id: 'owner', account_id: 'owner-account', name: 'Owner', handle: 'owner', is_private: false }],
      portfolio_categories: [false, true].map((hidden, i) => ({ id: `c${i}`, profile_id: 'owner', is_hidden: hidden })),
      projects: [false, true].map((hidden, i) => ({ id: `p${i}`, profile_id: 'owner', category_id: `c${i}`, is_hidden: hidden, position: i })),
      project_attachments: [],
    };
    const run = serviceFunction('loadProfiles', {
      requireSupabase: () => ({ auth: { getUser: () => auth },
        from: table => query({ data: rows[table], error: null }, () => { if (table === 'profiles') profileStarted = true; }),
      }),
      hydrateProjects: async projects => new Map(projects.map(p => [p.id, p])),
      deriveInitials: () => 'O', asStats: () => [], asStringRecord: () => ({}), asLinks: () => [], normalizePublicAppearance: () => ({}), normalizeProjectGridColumns: () => 2,
    });
    const pending = run('owner').then(value => { resolved = true; return value; });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(profileStarted, true); assert.equal(resolved, false);
    resolveAuth({ data: { user: account ? { id: account } : null } });
    const [profile] = await pending;
    assert.equal(profile.projects.length, account === 'owner-account' ? 2 : 1);
    assert.equal(profile.categories.length, account === 'owner-account' ? 2 : 1);
  }
});

test('PDF cover preview matches its attachment and selected one-based page, never an unrelated page', () => {
  const { getProjectCoverPreview } = execute(read('src/utils/projectPresentation.ts'));
  const project = { coverKind: 'document', cover: 'original.pdf', coverPageNumber: 2, attachments: [{
    id: 'doc', kind: 'document', sourceUrl: 'original.pdf', metadata: { renderedPages: [
      { attachmentId: 'other-doc', withinDocumentIndex: 2, sourceUrl: 'wrong.png' },
      { attachmentId: 'doc', index: 9, withinDocumentIndex: 1, sourceUrl: 'page1.png' },
      { attachmentId: 'doc', index: 10, withinDocumentIndex: 2, sourceUrl: 'page2.png' },
    ] },
  }] };
  assert.equal(getProjectCoverPreview(project), 'page2.png');
  assert.equal(getProjectCoverPreview({ ...project, coverPageNumber: undefined }), 'page1.png');
  assert.equal(getProjectCoverPreview({ ...project, coverPageNumber: 3 }), undefined);
  assert.equal(getProjectCoverPreview({ ...project, coverKind: 'video' }), undefined);
  assert.equal(getProjectCoverPreview({ ...project, cover: 'different.pdf' }), undefined);
});

test('rendered PDF previews retain contain/crop framing and fall back to the original on image failure', () => {
  let cursor = 0; const state = [];
  const react = { ...React, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], next => { state[i] = next; }]; }, useEffect() {} };
  const { ProjectCover } = execute(read('src/components/media/ProjectCover.tsx'), { require(name) {
    if (name === 'react') return react;
    if (name === './PdfPage') return { PdfPage: 'pdf-page' };
    if (name.endsWith('/ResponsiveImage')) return { ResponsiveImage: 'responsive-image' };
    if (name.endsWith('/coverFrame')) return { normalizeProjectCoverFrame: frame => frame };
    return {};
  } });
  const props = { source: 'original.pdf', previewSource: 'preview.png', kind: 'document', alt: 'Cover', pageNumber: 2 };
  const render = props => { cursor = 0; return ProjectCover(props); };
  const image = render(props);
  assert.equal(image.type, 'responsive-image'); assert.equal(image.props.src, 'preview.png');
  assert.match(image.props.className, /object-contain/);
  const framed = render({ ...props, frame: { x: 0.2, y: 0.7, zoom: 2 } });
  assert.equal(framed.props.children.props.style.transform, 'scale3d(2, 2, 1)');
  assert.match(framed.props.children.props.children.props.className, /object-cover/);
  image.props.onError();
  const fallback = render(props);
  assert.equal(fallback.type, 'pdf-page'); assert.equal(fallback.props.source, 'original.pdf');
  assert.equal(fallback.props.pageNumber, 2);
});

test('external font styles cannot block the application stylesheet on a cold visit', () => {
  assert.equal(/^@import url\(/m.test(read('src/index.css')), false);
  assert.match(read('index.html'), /<link rel="stylesheet" media="print" onload="this.media='all'"/);
  assert.match(read('index.html'), /family=Noto\+Sans\+JP/);
});

test('PDF covers request needed byte ranges while ordinary full viewers and upload blobs are unchanged', () => {
  const file = ts.createSourceFile('PdfPage.tsx', read('src/components/media/PdfPage.tsx'), ts.ScriptTarget.Latest, true);
  const fn = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'pdfSourceOptions');
  const { pdfSourceOptions } = execute(fn.getText(file));
  const remote = 'https://storage.example.test/large.pdf';
  const cover = pdfSourceOptions(remote, true);
  assert.equal(cover.disableAutoFetch, true); assert.equal(cover.disableStream, true);
  assert.equal(cover.url, remote);
  assert.deepEqual(plain(pdfSourceOptions(remote)), { url: remote });
  assert.deepEqual(plain(pdfSourceOptions('blob:local-upload', true)), { url: 'blob:local-upload' });
  assert.equal(pdfSourceOptions('/__portalink_media/id/file.pdf').disableAutoFetch, true);
});

test('route chunks warm during profile data reads, including portal/category routes, without loading on Home', () => {
  const file = ts.createSourceFile('App.tsx', read('src/App.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect' && node.arguments[0]?.getText(file).includes('void loadProfilePage()')) effect = node.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(effect);
  for (const [kind, expected] of [['home', []], ['profile', ['profile']], ['sharedProfile', ['profile']], ['portals', ['profile']], ...['category', 'project', 'sharedCategory', 'sharedProject'].map(kind => [kind, ['profile', 'category']])]) {
    const calls = [];
    const { run } = execute(`exports.run = ${effect}`, { route: { kind }, loadProfilePage: async () => { calls.push('profile'); }, loadCategoryPage: async () => { calls.push('category'); } });
    run(); assert.deepEqual(calls, expected);
  }
});

test('upload client loads only for an authorized upload and cancellation during download cannot start it', async () => {
  const file = ts.createSourceFile('mediaService.ts', read('src/services/supabase/mediaService.ts'), ts.ScriptTarget.Latest, true);
  const fn = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'uploadFileResumably');
  let imports = 0, started = 0;
  const runtime = { cancelRequested: false };
  const { run } = execute(`${fn.getText(file)}\nexports.run = uploadFileResumably;`, {
    requireSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'test-only' } } }) } }),
    require(name) { assert.equal(name, 'tus-js-client'); imports++; runtime.cancelRequested = true; return { Upload: class { constructor() { started++; } } }; },
  });
  assert.equal(imports, 0);
  await run({ runtime });
  assert.equal(imports, 1); assert.equal(started, 0);
});
