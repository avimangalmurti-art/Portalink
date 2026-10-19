import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile('usePublishProject.ts', readFileSync(new URL('../src/features/publishing/usePublishProject.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const callbacks = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['publish', 'retryUpload'].includes(node.name.getText(source))) callbacks[node.name.getText(source)] = node.initializer.arguments[0].getText(source);
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'waitForProfile') callbacks.waitForProfile = node.initializer.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness({ retryResult = [{ id: 'stored', storagePath: 'confirmed/path' }], publicationFails = false, firstProject = false, awaitProfile = false } = {}) {
  const calls = [];
  let complete;
  const context = vm.createContext({
    opening: {active:true}, committedPublish: { current: undefined }, setHasCommittedProject: () => {}, saveLocalDraft: async () => {}, draftCompleted: { current: false }, firstProject, workspace: { persist: false, awaitProfile }, persistWorkspace: false, resumeId: undefined, auth: {},
    draft: { id: 'draft', categoryId: 'portal' }, profileId: 'owner', categoryId: 'portal', isPublishingRef: { current: false }, validate: () => true,
    metadata: { title: 'Project', summary: 'Description' }, manualLocation: true, hasChosenLocation: true, location: 'London',
    ignoreInferredLocation: false, inferredRelevance: {},
    media: { items: [{ id: 'selected' }], capability: { isAvailable: true }, clear: () => calls.push('clear'), releaseOwnership: () => calls.push('release') },
    // Deliberately stale: the successful retry has not triggered a render yet.
    upload: { attachments: [], retry: async () => { calls.push('retry'); return retryResult; }, upload: async () => { calls.push('unexpected-upload'); return retryResult; } },
    projectService: { updateDraft: async () => calls.push('save'), publishProject: input => { calls.push(['publish', input.attachments]); return new Promise((resolve,reject)=> { complete = () => publicationFails ? reject(Error('Publication failed')) : resolve({ projectId: 'published' }); }); } },
    profileService: { getProfile: async () => { assert.fail('WEB publication must not wait for a profile refresh'); } },
    cacheProfile: profile => calls.push(['cache', profile]),
    invalidateProfiles: () => calls.push('invalidate'), setResult: result => calls.push(['result', result.projectId]), setStep: step => calls.push(['step',step]),
  });
  context.currentOpening={current:context.opening};
  const compile = expression => ts.transpileModule(`result = (${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(compile(callbacks.publish), context);
  const publish = context.result;
  context.publish = { run: (...args) => {
    // Evaluate the actual policy on each simulated render, not a copied test rule.
    vm.runInContext(`waitForProfile = (${callbacks.waitForProfile});`, context);
    return publish(...args);
  } };
  vm.runInContext(compile(callbacks.retryUpload), context);
  return { retry: context.result, context, calls, complete: () => complete() };
}

test('successful upload retry passes confirmed attachments to publishing without a second transfer', async () => {
  const h = harness(), pending = h.retry();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.calls.slice(0,2), ['retry','save']);
  assert.equal(h.calls.includes('unexpected-upload'), false);
  assert.equal(h.calls.filter(item=>Array.isArray(item)&&item[0]==='publish').length, 1);
  assert.equal(h.calls.some(item=>Array.isArray(item)&&item[0]==='result'), false, 'Transfer completion is not publication completion');
  assert.equal(h.context.upload.attachments.length, 0, 'Regression must exercise a stale React capture');
  assert.equal(h.calls[2][1][0].storagePath, 'confirmed/path');
  h.complete(); await pending;
  assert.equal(h.calls.includes('clear'), true);
  assert.ok(h.calls.some(item=>Array.isArray(item)&&item[0]==='step'&&item[1]==='done'));
});

test('cancelled retry and failed publication cannot report a completed project', async () => {
  const cancelled = harness({ retryResult: null }); await cancelled.retry();
  assert.deepEqual(cancelled.calls, ['retry']);
  const failed = harness({ publicationFails: true }), pending = failed.retry();
  await new Promise(resolve=>setImmediate(resolve)); failed.complete();
  await assert.rejects(pending, /Publication failed/);
  assert.equal(failed.calls.includes('unexpected-upload'), false);
  assert.equal(failed.calls.includes('clear'), false);
  assert.equal(failed.context.isPublishingRef.current, false);
  assert.equal(failed.calls.some(item=>Array.isArray(item)&&item[0]==='result'), false);
});

test('a committed publication retries only pending details and never re-uploads or creates another project', async () => {
  const h=harness();
  h.context.committedPublish.current={projectId:'already-published',creationDetailsPending:true};
  h.context.metadata.creationDetails={madeIn:'2024-05',field:'Design',answers:{what:'',did:'',learned:'Saved'}};
  let attempts=0;
  h.context.projectService.updateProjectCreationDetails=async(id,details)=>{assert.equal(id,'already-published');assert.equal(details.answers.learned,'Saved');if(++attempts===1)throw Error('network');};
  await assert.rejects(h.context.publish.run(),/already|published/);
  assert.equal(h.context.committedPublish.current.projectId,'already-published');
  await h.context.publish.run();
  assert.equal(attempts,2);assert.equal(h.calls.includes('save'),false);assert.equal(h.calls.includes('unexpected-upload'),false);assert.equal(h.calls.some(value=>Array.isArray(value)&&value[0]==='publish'),false);
  assert.ok(h.calls.some(value=>Array.isArray(value)&&value[0]==='result'&&value[1]==='already-published'));
});


test('first publication keeps its real preview until the canonical profile contains the committed tile',async()=>{
 const h=harness();h.context.firstProject=true;h.context.auth={user:{id:'account'}};
 h.context.committedPublish.current={projectId:'already-published'};
 h.context.clearDraftWorkspace=async()=>{};let ready=false;
 h.context.profileService={getProfile:async()=>({id:'owner',projects:ready?[{id:'already-published'}]:[]})};
 h.context.cacheProfile=profile=>h.calls.push(['cache',profile.projects[0].id]);
 await assert.rejects(h.context.publish.run(),/updated catalogue/);
 assert.equal(h.calls.includes('clear'),false);
 assert.equal(h.calls.some(value=>Array.isArray(value)&&value[0]==='result'),false);
 ready=true;await h.context.publish.run();
 assert.ok(h.calls.some(value=>Array.isArray(value)&&value[0]==='cache'&&value[1]==='already-published'));
 assert.equal(h.calls.includes('unexpected-upload'),false);
});

test('ordinary MOBILE publication waits for the canonical tile before clearing previews or completing', async () => {
  const h = harness({ awaitProfile: true }), refresh = deferred();
  assert.equal(h.context.firstProject, false, 'This must cover the ordinary mobile dialog, not onboarding');
  h.context.profileService.getProfile = async profileId => { h.calls.push(['refresh', profileId]); return refresh.promise; };
  const pending = h.retry(); await tick(); h.complete(); await tick();
  assert.equal(h.context.committedPublish.current.projectId, 'published');
  assert.equal(h.context.isPublishingRef.current, true);
  assert.equal(h.context.draftCompleted.current, false);
  assert.equal(h.calls.filter(call => Array.isArray(call) && call[0] === 'refresh').length, 1);
  assert.equal(h.calls.includes('invalidate'), false);
  assert.equal(h.calls.includes('clear'), false);
  assert.equal(h.calls.some(call => Array.isArray(call) && ['cache', 'result', 'step'].includes(call[0])), false);
  await h.context.publish.run();
  assert.equal(h.calls.filter(call => Array.isArray(call) && call[0] === 'publish').length, 1, 'Repeated submit while refreshing cannot publish twice');
  const profile = { id: 'owner', projects: [{ id: 'published' }] };
  refresh.resolve(profile); await pending;
  assert.deepEqual(h.calls.slice(-5), ['invalidate', ['cache', profile], 'clear', ['result', 'published'], ['step', 'done']]);
  assert.equal(h.calls.filter(call => call === 'invalidate').length, 1, 'Do not invalidate away the fresh cached catalogue after completion');
  assert.equal(h.context.draftCompleted.current, true);
  assert.equal(h.context.isPublishingRef.current, false);
});

for (const failure of ['read-error', 'missing-project', 'wrong-profile']) {
  test('MOBILE ' + failure + ' retains the committed project and retries only its profile refresh', async () => {
    const h = harness({ awaitProfile: true }); let reads = 0;
    h.context.profileService.getProfile = async profileId => {
      assert.equal(profileId, 'owner'); reads++;
      if (reads > 1) return { id: 'owner', projects: [{ id: 'published' }] };
      if (failure === 'read-error') throw Error('Profile unavailable');
      return failure === 'wrong-profile' ? { id: 'different-owner', projects: [{ id: 'published' }] }
        : { id: 'owner', projects: [{ id: 'older-project' }] };
    };
    const pending = h.retry(); await tick(); h.complete();
    await assert.rejects(pending, failure === 'read-error' ? /Profile unavailable/ : /updated catalogue/);
    assert.equal(h.context.committedPublish.current.projectId, 'published');
    assert.equal(h.context.isPublishingRef.current, false);
    assert.equal(h.context.draftCompleted.current, false);
    assert.equal(h.calls.includes('invalidate'), false);
    assert.equal(h.calls.includes('clear'), false);
    assert.equal(h.calls.includes('release'), false);
    assert.equal(h.calls.some(call => Array.isArray(call) && ['cache', 'result', 'step'].includes(call[0])), false);
    await h.context.publish.run();
    assert.equal(reads, 2);
    assert.equal(h.calls.filter(call => call === 'retry').length, 1);
    assert.equal(h.calls.filter(call => call === 'save').length, 1);
    assert.equal(h.calls.includes('unexpected-upload'), false);
    assert.equal(h.calls.filter(call => Array.isArray(call) && call[0] === 'publish').length, 1);
    assert.equal(h.calls.filter(call => call === 'invalidate').length, 1);
    assert.equal(h.calls.filter(call => Array.isArray(call) && call[0] === 'cache').length, 1);
    assert.ok(h.calls.some(call => Array.isArray(call) && call[0] === 'step' && call[1] === 'done'));
  });
}

test('ordinary WEB publication keeps its existing completion without a canonical-profile wait', async () => {
  const h = harness({ firstProject: false, awaitProfile: false }), pending = h.retry();
  await tick(); h.complete(); await pending;
  assert.deepEqual(h.calls.slice(-4), ['clear', 'invalidate', ['result', 'published'], ['step', 'done']]);
  assert.equal(h.calls.some(call => Array.isArray(call) && call[0] === 'cache'), false);
});

test('activation tags retry only the committed metadata write and retain publication identity',async()=>{
 const h=harness();h.context.committedPublish.current={projectId:'already-published'};h.context.metadata.tags='Design, Study, Design';let attempts=0;
 h.context.projectService.updateProjectTags=async(id,tags)=>{assert.equal(id,'already-published');assert.deepEqual(Array.from(tags),['Design','Study']);if(++attempts===1)throw Error('network');};
 await assert.rejects(h.context.publish.run(),/finish saving its tags/);assert.equal(h.calls.some(value=>Array.isArray(value)&&value[0]==='result'),false);
 await h.context.publish.run();assert.equal(attempts,2);assert.equal(h.calls.includes('unexpected-upload'),false);assert.equal(h.calls.includes('save'),false);assert.equal(h.calls.some(value=>Array.isArray(value)&&value[0]==='publish'),false);assert.ok(h.calls.some(value=>Array.isArray(value)&&value[0]==='result'&&value[1]==='already-published'));
});
