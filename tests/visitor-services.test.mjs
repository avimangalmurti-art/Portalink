import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = name => readFileSync(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8');
function execute(source, require = () => { throw new Error('Unexpected import'); }) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require });
  return exports;
}
const deferred = execute(read('deferredService'));

function registry() {
  const imports = [], calls = [];
  const auth = { getSession: async () => null, onAuthStateChange: () => () => {} };
  const projectReads = {
    async getProjectView(id) { calls.push(['viewer', id]); return { project: { id }, creator: { id: 'creator' } }; },
    async getProject(id) { return (await this.getProjectView(id)).project; },
    async listProjectViews(ids) { return Promise.all(ids.map(id => this.getProjectView(id))); },
    async listProjects(id) { return [{ id }]; },
    async getProjectDesign(id) { return { id, typefaceId: 'default' }; },
    async listProjectDesigns() { return {}; },
  };
  const profiles = {
    async getProfileForAccount(id) { calls.push(['account-profile', id]); return { id: 'private-owner', isPrivate: true }; },
    async createProfile(id) { calls.push(['create', id]); return { id }; },
  };
  const community = {
    supabaseEngagementService: { async getProjectEngagement(id) { calls.push(['engagement', id]); return { projectId: id }; } },
    supabaseSocialService: { async followProfile(id) { calls.push(['follow', id]); return { profileId: id, isFollowing: true }; } },
    supabaseCommentService: { async createComment(id, body) { calls.push(['comment', id, body]); return { id, body }; } },
  };
  const { visitorServices } = execute(read('visitorServices'), name => {
    imports.push(name);
    switch (name) {
      case './deferredService': return deferred;
      case './supabase/profileSharing': return { profileSharing: {} };
      case './supabase/authService': return { supabaseAuthService: auth };
      case './supabase/contentReaders': return { supabaseProfileReadService: {
        async getSharedProfile(id) { calls.push(['shared', id]); return { id, isPrivate: false, projects: [] }; },
        async getProjectGridLayout(id) { return { id, projectGridColumns: 2 }; },
      } };
      case './supabase/projectReaders': return { supabaseProjectReadService: projectReads };
      case './supabase/contentServices': return { supabaseProfileService: profiles, supabaseProjectService: {
        async updateProject(input) { calls.push(['update-project', input.projectId]); return input; },
      } };
      case './supabase/communityServices': return community;
      case './supabase/mediaProcessingReads': return { supabaseMediaProcessingReadService: {
        async getProcessingCapability() { calls.push(['processing-capability']); return { isAvailable: true }; },
        async getProcessingStatus(ids) { calls.push(['processing-status', [...ids]]); return ids.map(id => ({ objectId: id, state: 'ready' })); },
      } };
      case './supabase/mediaService': return { supabaseMediaService: { async getUploadCapability() { return { available: true }; } } };
      case './supabase/creatorSaveService': return { supabaseCreatorSaveService: { async setCreatorSave(id) { calls.push(['save', id]); return true; } } };
      default: throw new Error(`Unexpected visitor import ${name}`);
    }
  });
  return { services: visitorServices, imports, calls, auth };
}

test('public landing reads use the canonical public reader without loading account writes or viewer services', async () => {
  const h = registry();
  assert.equal(h.services.auth, h.auth);
  await h.services.auth.getSession();
  await h.services.profiles.getSharedProfile('creator');
  await h.services.profiles.getProfile('creator');
  assert.deepEqual(h.calls, [['shared', 'creator'], ['shared', 'creator']]);
  assert.deepEqual(h.imports, ['./supabase/profileSharing', './supabase/authService', './supabase/contentReaders', './deferredService']);
});

test('opening a full project loads only canonical project reads and preserves method this binding', async () => {
  const h = registry();
  assert.equal((await h.services.projects.getProject('document')).id, 'document');
  assert.equal((await h.services.projects.getProjectView('image')).project.id, 'image');
  assert.equal(h.imports.filter(name => name === './supabase/projectReaders').length, 1);
  assert.equal(h.imports.includes('./supabase/contentServices'), false);
  assert.deepEqual(h.calls, [['viewer', 'document'], ['viewer', 'image']]);
});

test('a document processing read loads no uploader or content mutation module', async () => {
  const h = registry();
  const [capability, statuses] = await Promise.all([
    h.services.media.getProcessingCapability(), h.services.media.getProcessingStatus(['document']),
  ]);
  assert.equal(capability.isAvailable, true);
  assert.equal(statuses[0].objectId, 'document');
  assert.equal(h.imports.filter(name => name === './supabase/mediaProcessingReads').length, 1);
  assert.equal(h.imports.includes('./supabase/mediaService'), false);
  assert.equal(h.imports.includes('./supabase/contentServices'), false);
  await h.services.media.getUploadCapability();
  assert.equal(h.imports.filter(name => name === './supabase/mediaService').length, 1);
});

test('account setup and actions invoke their real services only on demand; private-owner setup remains readable', async () => {
  const h = registry();
  assert.equal(h.imports.includes('./supabase/contentServices'), false);
  assert.equal((await h.services.profiles.getProfileForAccount('account')).isPrivate, true);
  assert.equal(h.imports.filter(name => name === './supabase/contentServices').length, 1);
  await h.services.profiles.createProfile('account');
  await h.services.projects.updateProject({ projectId: 'work' });
  assert.deepEqual(h.calls.slice(0, 3), [['account-profile', 'account'], ['create', 'account'], ['update-project', 'work']]);
  await h.services.engagement.getProjectEngagement('work');
  await h.services.social.followProfile('creator');
  await h.services.comments.createComment('work', 'Hello');
  await h.services.creatorSaves.setCreatorSave('creator', true);
  assert.deepEqual(h.calls.slice(3), [['engagement', 'work'], ['follow', 'creator'], ['comment', 'work', 'Hello'], ['save', 'creator']]);
});

test('platform-only actions fail clearly and do not import a full registry or pretend to subscribe', () => {
  const h = registry();
  const before = [...h.imports];
  assert.throws(() => h.services.messaging.getOrCreateConversation('creator'), /Open Messages/);
  assert.throws(() => h.services.notifications.subscribeToNotifications(() => {}), /Open Notifications/);
  assert.throws(() => h.services.geography.readLocalGeography(), /Open Discover/);
  assert.deepEqual(h.imports, before);
  assert.equal(h.services.messaging.then, undefined);
});

test('deferred calls share an in-flight load, preserve method identity, and retry a failed chunk', async () => {
  let loads = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const real = { count: 4, async run(value) { return this.count + value; } };
  const service = deferred.deferredService(async () => { loads++; await pending; return real; });
  assert.equal(service.run, service.run);
  assert.equal(loads, 0);
  const first = service.run(1), second = service.run(2);
  assert.equal(loads, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [5, 6]);
  let attempts = 0;
  const retry = deferred.deferredService(async () => { if (++attempts === 1) throw new Error('Chunk unavailable'); return real; });
  await assert.rejects(retry.run(0), /Chunk unavailable/);
  assert.equal(await retry.run(3), 7);
  assert.equal(attempts, 2);
});
