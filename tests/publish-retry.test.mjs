import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile('usePublishProject.ts', readFileSync(new URL('../src/features/publishing/usePublishProject.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const callbacks = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['publish', 'retryUpload'].includes(node.name.getText(source))) callbacks[node.name.getText(source)] = node.initializer.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
function harness({ retryResult = [{ id: 'stored', storagePath: 'confirmed/path' }], publicationFails = false } = {}) {
  const calls = [];
  let complete;
  const context = vm.createContext({
    draft: { id: 'draft' }, profileId: 'owner', categoryId: 'portal', isPublishingRef: { current: false }, validate: () => true,
    metadata: { title: 'Project', summary: 'Description' }, manualLocation: true, hasChosenLocation: true, location: 'London',
    ignoreInferredLocation: false, inferredRelevance: {},
    media: { items: [{ id: 'selected' }], capability: { isAvailable: true }, clear: () => calls.push('clear'), releaseOwnership: () => calls.push('release') },
    // Deliberately stale: the successful retry has not triggered a render yet.
    upload: { attachments: [], retry: async () => { calls.push('retry'); return retryResult; }, upload: async () => { calls.push('unexpected-upload'); return retryResult; } },
    projectService: { updateDraft: async () => calls.push('save'), publishProject: input => { calls.push(['publish', input.attachments]); return new Promise((resolve,reject)=> { complete = () => publicationFails ? reject(Error('Publication failed')) : resolve({ projectId: 'published' }); }); } },
    invalidateProfiles: () => calls.push('invalidate'), setResult: result => calls.push(['result', result.projectId]), setStep: step => calls.push(['step',step]),
  });
  const compile = expression => ts.transpileModule(`result = (${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(compile(callbacks.publish), context); context.publish = { run: context.result };
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
