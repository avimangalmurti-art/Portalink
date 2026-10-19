const shareModel = sourceModule('src/features/sharing/shareModel.ts');
import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { hookHarness } from './helpers/hook-harness.mjs';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, URLSearchParams, ...globals, require(name) {
      if (name.endsWith('/sharing/InternalContentShare')) return { useInternalContentShare: () => () => { throw new Error('Unexpected sharing action'); } };
      if (name.endsWith('/engagement/capabilities')) return sourceModule('src/features/engagement/capabilities.ts');
      if (name.endsWith('/textFormatting')) return sourceModule('src/components/text/textFormatting.ts');
    assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name];
  } });
  return exports;
}
const registration = load('../src/features/auth/registration.ts', { '../profile/validation': sourceModule('src/features/profile/validation.ts', { '../sharing/shareModel': shareModel }), '../sharing/shareModel': shareModel });
const commentsDomain = load('../src/types/comments.ts');
const path = '/share/creator/c/category/project';
const target = { projectId: 'project', attachmentId: 'document-a', pageIndex: 4, label: 'Page 5' };
const record = () => ({ engaged: { like: false, save: false, repost: false }, counts: { like: 0, save: 0, repost: 0 }, comments: [] });
function browser(href = `https://portalink.test${path}?view=projects&page=2&media=old&code=secret#callback`) {
  const storage = new Map();
  return { location: new URL(href), sessionStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  }, storage };
}
function intentModule(window) {
  return load('../src/features/auth/interactionIntent.ts', { './registration': registration }, { window });
}

test('shared interaction intents retain each content destination and only safe reading parameters', () => {
  const { interactionIntent } = intentModule(browser());
  for (const route of ['/share/creator', '/share/creator/c/category', path]) {
    for (const label of ['follow this creator', 'message this creator', 'save this project', 'join this conversation']) {
      const intent = interactionIntent(label, `${route}?view=projects&page=8&media=document-a&code=secret&access_token=secret#token`);
      assert.equal(intent.kind, 'route'); assert.equal(intent.label, label);
      assert.equal(intent.path, `${route}?view=projects&page=8&media=document-a`);
      assert.doesNotMatch(intent.path, /secret|token|code=/);
    }
  }
  for (const route of ['/profile/creator', '/home', '//evil.test/share/creator', 'https://evil.test/share/creator', '/share/../settings']) {
    const intent = interactionIntent('save this project', route);
    assert.equal(intent.kind, 'interaction'); assert.equal(intent.path, undefined);
  }
  assert.equal(interactionIntent('comment').path, `${path}?view=projects&page=2&media=old`);
});

function mediaSetup(window = browser()) {
  const gates = [], reads = [], writes = [], shares = [];
  const auth = { isAuthenticated: false, user: null, requestAuthenticatedDestination: intent => gates.push(intent) };
  const hook = hookHarness(new URL('../src/features/media-interactions/useMediaInteractions.ts', import.meta.url),
    'useMediaInteractions', {}, auth, [target, true], undefined, {
      '../auth/registration': registration,
      '../sharing/InternalContentShare': { useInternalContentShare: () => value => shares.push(value) },
      './mediaInteractionBatch': { readMediaInteraction(value, account) { reads.push({ value, account }); return Promise.resolve(record()); } },
      '../reads/pageHeadings': sourceModule('src/features/reads/pageHeadings.ts'),
    './mediaInteractionRequest': { mediaInteractionRequest(url, init, required) { writes.push({ url, init, required }); return Promise.resolve(record()); } },
    }, { window });
  return { hook, auth, gates, reads, writes, shares, window,
    async signIn() { auth.isAuthenticated = true; auth.user = { id: 'visitor' }; hook.rerender(); await hook.flush(); },
  };
}

test('page sharing uses the official public address and exact media target without callback state', async () => {
  for (const origin of ['https://portalinknetworksinc.avimangalmurti566055.chatgpt.site', 'http://127.0.0.1:5173', 'https://portalinknetworks.com']) {
    const route = '/portalite/c/category/project';
    const window = browser(`${origin}${route}?view=projects&via=friend8&page=2&media=old&code=secret&entry=oauth&access_token=secret#refresh_token=secret`);
    const h = mediaSetup(window);
    try {
      await h.hook.flush();
      await h.hook.value.share();
      assert.equal(h.shares.length, 1);
      const shared = h.shares[0], url = new URL(shared.url);
      assert.equal(shared.title, target.label);
      assert.equal(url.origin, 'https://portalinknetworks.com');
      assert.equal(url.pathname, route);
      assert.deepEqual([...url.searchParams], [['via', 'friend8'], ['view', 'projects'], ['page', '5'], ['media', 'document-a']]);
      assert.equal(url.hash, '');
      assert.doesNotMatch(shared.url, /chatgpt\.site|127\.0\.0\.1|secret|token|entry=|code=/);
      assert.equal(h.hook.value.shareState, 'idle');
      assert.equal(h.writes.length, 0);
      shared.onSent(); await h.hook.flush();
      assert.equal(h.hook.value.shareState, 'shared');
    } finally { h.hook.dispose(); }
  }
});

test('shared page save returns through sign-in to the clicked media/page and requires a deliberate authenticated press', async () => {
  const h = mediaSetup();
  try {
    await h.hook.flush(); assert.equal(h.gates.length, 0); assert.equal(h.writes.length, 0);
    h.hook.value.toggle('save'); await h.hook.flush();
    assert.equal(h.gates.length, 1); assert.equal(h.gates[0].kind, 'route');
    assert.equal(h.gates[0].path, `${path}?view=projects&page=5&media=document-a`);
    assert.equal(h.writes.length, 0); assert.equal(h.window.storage.size, 0);
    await h.signIn();
    assert.equal(h.reads.at(-1).account, 'visitor'); assert.equal(h.writes.length, 0);
    h.hook.value.toggle('save'); await h.hook.flush();
    assert.equal(h.writes.length, 1); assert.equal(h.writes[0].required, true);
    assert.equal(h.writes[0].url, '/api/media-interactions/engagement');
    assert.deepEqual(JSON.parse(h.writes[0].init.body), { ...target, kind: 'save', engaged: true, shareWithCreator: false });
  } finally { h.hook.dispose(); }
});

test('shared page comment opens authentication without posting and sends the exact target only on authenticated submission', async () => {
  const h = mediaSetup();
  try {
    await h.hook.flush();
    assert.equal(await h.hook.value.postComment('A considered response'), false);
    assert.equal(h.gates[0].path, `${path}?view=projects&page=5&media=document-a`);
    assert.equal(h.writes.length, 0);
    await h.signIn(); assert.equal(h.writes.length, 0);
    assert.equal(await h.hook.value.postComment('A considered response'), true);
    assert.equal(h.writes[0].url, '/api/media-interactions/comments');
    assert.equal(h.writes[0].required, true);
    assert.deepEqual(JSON.parse(h.writes[0].init.body), { ...target, body: 'A considered response' });
  } finally { h.hook.dispose(); }
});

test('a cancelled shared action cannot leave a stored write for a later sign-in or remount', async () => {
  const window = browser();
  window.sessionStorage.setItem('portalink.pendingMediaAction', JSON.stringify({ targetKey: 'project:document-a:4', action: 'save' }));
  const h = mediaSetup(window);
  try {
    await h.hook.flush(); h.hook.value.toggle('save'); await h.hook.flush();
    assert.equal(window.storage.size, 0);
    // Authentication can be dismissed, followed later by an independent sign-in.
    await h.signIn(); assert.equal(h.writes.length, 0);
  } finally { h.hook.dispose(); }
  const restored = mediaSetup(window);
  try { await restored.signIn(); assert.equal(restored.writes.length, 0); }
  finally { restored.hook.dispose(); }
});

test('ordinary workspace media keeps its existing explicit stored action replay', async () => {
  const h = mediaSetup(browser('https://portalink.test/profile/creator/c/category/project'));
  try {
    await h.hook.flush(); h.hook.value.toggle('save'); await h.hook.flush();
    assert.equal(h.writes.length, 0); assert.equal(h.window.storage.size, 1);
    await h.signIn(); assert.equal(h.writes.length, 1);
    assert.equal(JSON.parse(h.writes[0].init.body).engaged, true);
    assert.equal(h.window.storage.size, 0);
  } finally { h.hook.dispose(); }
});

test('shared project comments keep their route through the guest gate without replaying the draft', async () => {
  const window = browser(); const gates = [], writes = [];
  const auth = { isAuthenticated: false, user: null, requestAuthenticatedDestination: intent => gates.push(intent) };
  const service = {
    listComments: async () => ({ projectId: 'project', threads: [], totalCount: 0 }),
    createComment: async (projectId, body) => { writes.push({ projectId, body }); },
  };
  const hook = hookHarness(new URL('../src/features/comments/useProjectComments.ts', import.meta.url),
    'useProjectComments', { comments: service }, auth, ['project'], undefined, {
      '../../types/comments': commentsDomain, '../auth/interactionIntent': intentModule(window),
    }, { window });
  try {
    await hook.flush(); hook.value.setBody('Project feedback'); await hook.flush(); hook.value.submit();
    assert.equal(gates[0].path, `${path}?view=projects&page=2&media=old`); assert.equal(writes.length, 0);
    auth.isAuthenticated = true; auth.user = { id: 'visitor' }; hook.rerender(); await hook.flush();
    assert.equal(writes.length, 0); assert.equal(hook.value.canWrite, true);
    hook.value.setBody('Project feedback'); await hook.flush(); hook.value.submit(); await hook.flush();
    assert.deepEqual(writes, [{ projectId: 'project', body: 'Project feedback' }]);
  } finally { hook.dispose(); }
});
