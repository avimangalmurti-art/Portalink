import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const text = readFileSync(new URL('../src/features/publishing/usePublishProject.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('usePublishProject.ts', text, ts.ScriptTarget.Latest, true);
assert.equal(source.parseDiagnostics.length, 0);
function find(predicate) {
  let result;
  const visit = node => { if (result) return; if (predicate(node)) result = node; else ts.forEachChild(node, visit); };
  visit(source); assert.ok(result, 'Expected actual publishing callback'); return result;
}
const callback = name => find(node => ts.isVariableDeclaration(node) && node.name.getText(source) === name).initializer.arguments[0].getText(source);
const initialization = find(node => ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('const requestKey =')).arguments[0].getText(source);
const evaluate = (expression, context) => {
  vm.runInContext(ts.transpileModule(`result = (${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.result;
};
const tick = () => new Promise(setImmediate);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

function database() {
  const stores = new Map();
  const indexedDB = { open() {
    const request = {};
    setImmediate(() => {
      request.result = { createObjectStore: name => stores.set(name, new Map()), close() {}, transaction() {
        let pending = 0, ended = false;
        const tx = { abort() { ended = true; tx.onabort?.(); }, objectStore(name) {
          const store = stores.get(name);
          const run = action => { pending++; const req = {}; setImmediate(() => { if (ended) return; req.result = action(); req.onsuccess?.(); pending--; if (!pending) setImmediate(() => { if (!pending && !ended) { ended = true; tx.oncomplete?.(); } }); }); return req; };
          return { get: key => run(() => store.get(key)), getAll: () => run(() => [...store.values()]), put: (value, key) => run(() => store.set(key, value)), delete: key => run(() => store.delete(key)) };
        } }; return tx;
      } };
      if (!stores.size) request.onupgradeneeded?.(); request.onsuccess?.();
    }); return request;
  } };
  return sourceModule('src/features/publishing/firstProjectDraft.ts', {}, { indexedDB, File, Blob });
}
const record = (overrides = {}) => ({
  version: 1, accountId: 'account', profileId: 'profile', updatedAt: '2026-10-19T10:00:00Z',
  draft: { id: 'draft', profileId: 'profile', categoryId: 'portal', createdAt: '2026-10-19T09:00:00Z', metadata: { title: '', summary: '' } },
  metadata: { title: 'A project', summary: 'The work behind it.', accessLevel: 'private' }, location: 'London', stage: 'review',
  media: [{ id: 'file', file: new File(['art'], 'work.png', { type: 'image/png', lastModified: 123 }), fileName: 'work.png', order: 0, family: 'image', isCover: true, previewUrl: 'blob:temporary', metadata: { coverCrop: { x: 0.2, y: 0.3, zoom: 1.5 } } }],
  persisted: [], attachments: [], ...overrides,
});

function operationHarness(overrides = {}) {
  const calls = [], states = {};
  const opening = { active: true, isOpen: true, accountId: 'account', profileId: 'profile', categoryId: 'portal', resumeId: 'draft' };
  const saved = record();
  const context = vm.createContext({
    Error, result: undefined, isOpen: true, profileId: 'profile', categoryId: 'portal', isOwner: true,
    auth: { user: { id: 'account' }, loginSession: {} }, firstProject: false, persistWorkspace: true, resumeId: 'draft',
    initialTitle: undefined, initialSummary: undefined, presetMadeIn: '', activation: false, draftAttempt: 0,
    opening, currentOpening: { current: opening }, draftRequestRef: { current: null }, draftCompleted: { current: false },
    initializedOpening: { current: { opening, draftId: saved.draft.id } }, remoteDiscarded: { current: false },
    checkpointSignature: { current: null }, checkpointRevision: { current: 0 }, committedPublish: { current: undefined },
    latestWorkspace: { current: { draft: saved.draft, metadata: saved.metadata, location: saved.location, stage: saved.stage, media: saved.media, restoringDraft: false, opening } },
    upload: { getCheckpoint: () => ({ persisted: [], attachments: [] }) },
    projectService: { getDraft: async () => saved.draft, createDraft: async () => { calls.push('unexpected-create'); return saved.draft; }, updateDraft: async () => calls.push('remote-save') },
    readFirstProjectDraft: async () => saved,
    saveFirstProjectDraft: async value => calls.push(['checkpoint', value]),
    draftWorkspaceFingerprint: database().draftWorkspaceFingerprint,
    readSetupDraft: () => null, clearSetupDraft: () => calls.push('clear-setup'),
    restoreMedia: media => calls.push(['restore-media', media]), restoreUpload: (value, media) => calls.push(['restore-upload', value, media]),
    ...overrides,
  });
  context.getUploadCheckpoint = () => context.upload.getCheckpoint();
  for (const name of ['DraftError', 'RestoringDraft', 'Draft', 'Metadata', 'HasChosenLocation', 'FirstProjectStage', 'Step', 'HasCommittedProject', 'HasDiscardedDraft', 'CheckpointStatus', 'LocalDraftError', 'DiscardError', 'IsDiscarding', 'Result']) context[`set${name}`] = value => { states[name] = value; calls.push([name, value]); };
  context.updateLocation = value => { states.location = value; };
  return { context, calls, states, initialize: () => evaluate(initialization, context)(), save: (...args) => evaluate(callback('saveLocalDraft'), context)(...args) };
}

function dialogHarness(presentation, changes = {}) {
  const calls = [], hookCalls = [];
  const slots = []; let cursor = 0;
  const react = { ...React, useEffect() {}, useRef: current => ({ current }), useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; } };
  const flow = {
    step: 'metadata', state: 'editing', firstProjectStage: 'files', isOwner: true, isDirty: true,
    draft: { id: 'draft' }, metadata: { title: 'Project', summary: '' }, fieldErrors: {}, media: { items: [{}], state: 'ready' },
    upload: {}, publish: {}, inferredRelevance: {}, discard: async () => { calls.push('discard'); return true; },
    saveLocalDraft: async () => calls.push('save'), ...changes,
  };
  const { PublishProjectDialog } = sourceModule('src/features/publishing/PublishProjectDialog.tsx', new Proxy({
    react,
    './usePublishProject': { usePublishProject: (...args) => { hookCalls.push(args); return flow; } },
    './validation': { TITLE_MAX_LENGTH: 80 },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
  }, { has: () => true, get(target, key) { return target[key] ?? new Proxy({}, { get: (_, property) => property }); } }));
  const resumeDraft = record().draft;
  const render = () => { cursor = 0; return PublishProjectDialog({ isOpen: true, profileId: 'profile', categoryId: 'portal', categoryLabel: 'Work', resumeDraft, onClose: () => calls.push('close'), onPublished() {} }); };
  return { calls, hookCalls, tree: render(), render, resumeDraft };
}

test('mobile close awaits durable saving, retains work on failure, and WEB still discards', async () => {
  const pending = deferred(), mobile = dialogHarness('mobile', { saveLocalDraft: () => { mobile.calls.push('save'); return pending.promise; } });
  const close = mobile.tree.props.onClose(); await tick(); assert.deepEqual(mobile.calls, ['save']);
  pending.resolve(); await close; assert.deepEqual(mobile.calls, ['save', 'close']);
  const failed = dialogHarness('mobile', { saveLocalDraft: async () => { throw Error('Local quota'); } });
  await failed.tree.props.onClose(); assert.deepEqual(failed.calls, []);
  const committed = dialogHarness('mobile', { isDirty: false, hasCommittedProject: true });
  await committed.tree.props.onClose(); assert.deepEqual(committed.calls, ['save', 'close']);
  const web = dialogHarness('web'); await web.tree.props.onClose(); assert.deepEqual(web.calls, ['discard', 'close']);
});

test('actual dialog forwards mobile recovery without enabling first-project defaults or changing WEB', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = dialogHarness(presentation), args = h.hookCalls[0];
    assert.equal(args[5], false);
    assert.equal(args[7].persist, presentation === 'mobile');
    assert.equal(args[7].resume, presentation === 'mobile' ? h.resumeDraft : undefined);
    assert.equal(args[7].awaitProfile, presentation === 'mobile');
  }
});

test('missing remote draft fails closed without recreating it or losing the local checkpoint', async () => {
  const saved = record(), h = operationHarness({ readFirstProjectDraft: async () => saved, projectService: { getDraft: async () => null, createDraft: async () => assert.fail('Must not recreate possibly published work') } });
  h.initialize(); await tick(); await tick();
  assert.match(h.states.DraftError, /no longer available/);
  assert.equal(h.states.Draft, undefined);
  assert.equal(h.calls.some(([name]) => name === 'restore-media'), false);
  assert.equal(saved.media[0].file.name, 'work.png');
});

test('late restore from an old opening never replaces the current opening fields or files', async () => {
  for (const cleanup of [true, false]) {
    const read = deferred(), h = operationHarness({ projectService: { getDraft: () => read.promise } });
    const stop = h.initialize(); await tick();
    if (cleanup) stop(); else { h.context.opening.active = false; h.context.currentOpening.current = { active: true }; }
    read.resolve(record().draft); await tick(); await tick();
    assert.equal(h.states.Metadata, undefined); assert.equal(h.states.Draft, undefined);
    assert.equal(h.calls.some(([name]) => name === 'restore-media'), false);
  }
});

test('checkpoint uses confirmed upload output before React rerenders and does not acknowledge an old opening', async () => {
  const confirmed = { persisted: [{ objectId: 'stored', storagePath: 'path' }], attachments: [{ id: 'stored', storagePath: 'path' }] };
  const h = operationHarness({ upload: { attachments: [], persisted: [], getCheckpoint: () => confirmed } });
  await h.save();
  const checkpoint = h.calls.find(([name]) => name === 'checkpoint')[1];
  assert.equal(checkpoint.attachments, confirmed.attachments); assert.equal(checkpoint.persisted, confirmed.persisted);
  const pending = deferred(), old = operationHarness({ saveFirstProjectDraft: () => pending.promise });
  const save = old.save(); old.context.currentOpening.current = { active: true }; pending.resolve(); await save;
  assert.equal(old.context.checkpointSignature.current, null);
  assert.notEqual(old.states.CheckpointStatus, 'saved');
});

test('an uninitialized new opening cannot checkpoint its predecessor’s draft', async () => {
  const h = operationHarness(); h.context.initializedOpening.current = null;
  await assert.rejects(h.save(), /still opening/);
  assert.equal(h.calls.some(([name]) => name === 'checkpoint'), false);
  h.context.initializedOpening.current = { opening: h.context.opening, draftId: 'draft' };
  h.context.latestWorkspace.current.draft = { ...record().draft, profileId: 'other-profile' };
  await assert.rejects(h.save(), /still opening/);
  assert.equal(h.calls.some(([name]) => name === 'checkpoint'), false);
});

test('removing every field and file overwrites an older checkpoint with the actual empty state', async () => {
  const h = operationHarness(); h.context.checkpointSignature.current = 'previous-content';
  Object.assign(h.context.latestWorkspace.current, { metadata: { title: '', summary: '' }, location: '', media: [], stage: 'files' });
  await h.save();
  const saved = h.calls.find(([name]) => name === 'checkpoint')[1];
  assert.equal(saved.metadata.title, ''); assert.equal(saved.metadata.summary, ''); assert.equal(saved.media.length, 0);
});

test('effect replay shares one draft request while only its current subscriber restores work', async () => {
  const read = deferred(); let count = 0;
  const h = operationHarness({ projectService: { getDraft: () => { count++; return read.promise; } } });
  const stop = h.initialize(); stop(); h.initialize(); await tick();
  read.resolve(record().draft); await tick(); await tick();
  assert.equal(count, 1);
  assert.equal(h.calls.filter(([name]) => name === 'restore-media').length, 1);
  assert.equal(h.states.Draft.id, 'draft');
});

test('failed local checkpoint reports failure without clearing the setup copy', async () => {
  const h = operationHarness({ initialTitle: 'A project', initialSummary: 'The work behind it.', readSetupDraft: () => ({ portal: 'portal', title: 'A project', summary: 'The work behind it.' }), saveFirstProjectDraft: async () => { throw Error('Device storage full'); } });
  await assert.rejects(h.save(), /storage full/);
  assert.match(h.states.LocalDraftError, /storage full/);
  assert.equal(h.calls.includes('clear-setup'), false);
  assert.equal(h.context.checkpointSignature.current, null);
});

test('matching setup is cleared only after a durable checkpoint; another setup stays intact', async () => {
  for (const title of ['A project', 'A different project']) {
    const pending = deferred();
    const h = operationHarness({ initialTitle: 'A project', initialSummary: 'The work behind it.', readSetupDraft: () => ({ portal: 'portal', title, summary: 'The work behind it.' }), saveFirstProjectDraft: () => pending.promise });
    const save = h.save(); assert.equal(h.calls.includes('clear-setup'), false);
    pending.resolve(); await save;
    assert.equal(h.calls.includes('clear-setup'), title === 'A project');
  }
});

test('terminal cleanup wins over queued saves and cannot resurrect files or the legacy alias', async () => {
  const db = database(), saved = record();
  await db.saveFirstProjectDraft(saved);
  const pending = db.saveFirstProjectDraft(saved, 'draft');
  const clear = db.clearDraftWorkspace('account', 'profile', 'draft');
  const late = db.saveFirstProjectDraft({ ...saved, metadata: { ...saved.metadata, title: 'Late edit' } }, 'draft');
  await Promise.all([pending, clear, late]);
  assert.equal(await db.readFirstProjectDraft('account', 'profile', 'draft'), null);
  assert.equal(await db.readFirstProjectDraft('account', 'profile'), null);
  await db.saveFirstProjectDraft(saved, 'draft');
  assert.equal(await db.readFirstProjectDraft('account', 'profile', 'draft'), null);
  assert.equal((await db.listDeviceDrafts('account', 'profile', true)).length, 0);
});

test('recovery selection includes unfinished committed handoffs and leaves unavailable portals untouched', async () => {
  const db = database(), earlier = record(), committed = record({
    draft: { ...record().draft, id: 'published-draft' }, updatedAt: '2026-10-19T08:00:00Z', committed: { projectId: 'published' },
  });
  await db.saveFirstProjectDraft(earlier, earlier.draft.id);
  await db.saveFirstProjectDraft(committed, committed.draft.id);
  assert.equal((await db.listDeviceDrafts('account', 'profile')).length, 1);
  const all = await db.listDeviceDrafts('account', 'profile', true);
  assert.equal(all.length, 2); assert.equal(db.latestDeviceDraft(all, ['portal']).draft.id, 'published-draft');
  assert.equal(db.latestDeviceDraft(all, ['another-portal']), null);
  assert.equal((await db.readFirstProjectDraft('account', 'profile', earlier.draft.id)).media[0].file.name, 'work.png');
  assert.equal((await db.listDeviceDrafts('other-account', 'profile', true)).length, 0);
});

test('unavailable saved-copy removal clears only this device checkpoint and preserves work on failure', async () => {
  const h = operationHarness({ draft: null, draftError: 'This draft is no longer available.' });
  const clear = [];
  h.context.clearDraftWorkspace = async (...args) => { clear.push(args); };
  h.context.projectService = new Proxy({}, { get: () => () => assert.fail('Local removal must not call a remote project service') });
  h.context.upload = new Proxy({}, { get: () => () => assert.fail('Local removal must not call upload cleanup') });
  assert.equal(await evaluate(callback('removeLocalDraft'), h.context)(), true);
  assert.deepEqual(clear, [['account', 'profile', 'draft']]);
  assert.equal(h.states.IsDiscarding, false);
  h.context.clearDraftWorkspace = async () => { throw Error('Device unavailable'); };
  assert.equal(await evaluate(callback('removeLocalDraft'), h.context)(), false);
  assert.match(h.states.DiscardError, /could not be removed from this device/);
  assert.equal(h.states.IsDiscarding, false);
});

test('saved-copy removal refuses active drafts and missing recovery/account/error scope', async () => {
  for (const overrides of [
    { draft: record().draft }, { draftError: null }, { resumeId: undefined }, { auth: { user: null } }, { profileId: null },
  ]) {
    const h = operationHarness({ draft: null, draftError: 'Unavailable', ...overrides, clearDraftWorkspace: async () => assert.fail('Guarded state must not clear local work') });
    assert.equal(await evaluate(callback('removeLocalDraft'), h.context)(), false);
  }
});

test('mobile initialization error requires an explicit confirmation before removing only the saved copy', async () => {
  let removals = 0, allow = false;
  const changes = { draft: null, draftError: 'This draft is no longer available.', removeLocalDraft: async () => { removals++; return allow; }, dismissDiscardError() {} };
  const all = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(all)] : [];
  const h = dialogHarness('mobile', changes);
  const action = all(h.tree).find(node => node.props.children === 'Remove saved copy');
  assert.ok(action); assert.equal(removals, 0); action.props.onClick();
  let confirmation = h.render().props.confirmation;
  assert.equal(confirmation.props.title, 'Remove saved copy?');
  assert.match(confirmation.props.description, /Published work and uploaded files remain/);
  await confirmation.props.onDiscard(); assert.equal(removals, 1); assert.deepEqual(h.calls, []);
  assert.ok(h.render().props.confirmation);
  allow = true; confirmation = h.render().props.confirmation;
  await confirmation.props.onDiscard(); assert.equal(removals, 2); assert.deepEqual(h.calls, ['close']);
  assert.equal(all(dialogHarness('web', changes).tree).some(node => node.props.children === 'Remove saved copy'), false);
});

test('uploaded and committed checkpoints restore the exact local files and transport state', async () => {
  const react = { useCallback: fn => fn, useMemo: fn => fn(), useRef: current => ({ current }), useState: initial => [initial, () => {}] };
  const { useMediaUpload } = sourceModule('src/features/publishing/useMediaUpload.ts', {
    react, '../../contexts/ServicesContext': { useServices: () => ({ media: {} }) },
    '../media/persistedMediaAttachments': { attachmentsFromPersistedMedia: () => assert.fail('Restore must not re-upload') },
    '../../types/publishing': { UploadServiceError: class extends Error {} },
  });
  for (const committed of [undefined, { projectId: 'published', mediaPersisted: true }]) {
    const transport = useMediaUpload({ isAvailable: true });
    const saved = record({ persisted: [{ objectId: 'stored', storagePath: 'path' }], attachments: [{ id: 'stored', storagePath: 'path' }], committed });
    let remoteReads = 0;
    const h = operationHarness({ readFirstProjectDraft: async () => saved, restoreUpload: transport.restore, projectService: { getDraft: async () => { remoteReads++; return saved.draft; }, createDraft: async () => assert.fail('Recovered work must not create another draft') } });
    h.initialize(); await tick(); await tick();
    assert.equal(h.states.Draft, saved.draft); assert.equal(h.states.Metadata, saved.metadata); assert.equal(h.states.Step, 'preview');
    assert.equal(transport.getCheckpoint().attachments, saved.attachments);
    assert.equal(transport.getCheckpoint().persisted, saved.persisted);
    assert.equal(h.context.committedPublish.current, committed);
    assert.equal(remoteReads, committed ? 0 : 1);
    assert.equal(h.calls.find(([name]) => name === 'restore-media')[1][0].file, saved.media[0].file);
  }
});

function publishingHarness(committed = false) {
  const h = operationHarness(), saved = record(), stored = { id: 'stored', storagePath: 'path' };
  Object.assign(h.context, {
    draft: saved.draft, metadata: saved.metadata, manualLocation: true, hasChosenLocation: true, location: saved.location,
    ignoreInferredLocation: false, inferredRelevance: {}, isPublishingRef: { current: false }, validate: () => true,
    waitForProfile: true,
    media: { items: saved.media, capability: { isAvailable: true }, clear: () => h.calls.push('clear-media'), releaseOwnership: () => assert.fail('Durable files must not become session-only') },
    upload: { attachments: [stored], getCheckpoint: () => ({ attachments: [stored], persisted: [{ objectId: 'stored', storagePath: 'path' }] }), upload: async () => assert.fail('Recovered uploads must not transfer again') },
    projectService: {
      updateDraft: async () => h.calls.push('remote-save'),
      publishProject: async input => { h.calls.push('publish'); const result = { projectId: 'published', mediaPersisted: true }; await input.onCommitted(result); return result; },
    },
    profileService: { getProfile: async () => ({ id: 'profile', projects: [{ id: 'published' }] }) },
    cacheProfile: () => h.calls.push('cache-profile'), invalidateProfiles: () => h.calls.push('invalidate'),
    clearDraftWorkspace: async () => h.calls.push('clear-checkpoint'),
  });
  h.context.saveLocalDraft = () => h.save();
  if (committed) h.context.committedPublish.current = { projectId: 'published', mediaPersisted: true };
  return { ...h, publish: () => evaluate(callback('publish'), h.context)() };
}

test('uploaded recovery publishes once without transfer; committed recovery only completes its profile handoff', async () => {
  for (const committed of [false, true]) {
    const h = publishingHarness(committed); await h.publish();
    assert.equal(h.calls.filter(call => call === 'publish').length, committed ? 0 : 1);
    assert.equal(h.calls.filter(call => call === 'remote-save').length, committed ? 0 : 1);
    assert.equal(h.states.Result.projectId, 'published'); assert.equal(h.states.Step, 'done');
    assert.ok(h.calls.indexOf('cache-profile') < h.calls.indexOf('clear-checkpoint'));
  }
});

test('changing opening during a pending checkpoint stops backend publication', async () => {
  const h = publishingHarness(), pending = deferred();
  h.context.saveFirstProjectDraft = () => pending.promise;
  const publishing = h.publish(); h.context.opening.active = false; pending.resolve();
  await assert.rejects(publishing, /session has changed/);
  assert.equal(h.calls.includes('remote-save'), false); assert.equal(h.calls.includes('publish'), false);
});

test('failed local cleanup after remote discard retries only local removal and cannot resume editing', async () => {
  const h = operationHarness(); let clearAttempts = 0;
  Object.assign(h.context, {
    draft: record().draft,
    media: { clear: () => h.calls.push('clear-media') },
    upload: { persisted: [], reset: () => h.calls.push('reset-upload') },
    projectService: { discardDraft: async () => h.calls.push('remote-discard') },
    clearDraftWorkspace: async () => { if (++clearAttempts === 1) throw Error('Device unavailable'); },
  });
  const discard = evaluate(callback('discard'), h.context);
  assert.equal(await discard(), false);
  assert.equal(h.context.remoteDiscarded.current, true); assert.equal(h.states.HasDiscardedDraft, true);
  assert.equal(h.context.draftCompleted.current, true);
  assert.equal(await discard(), true);
  assert.equal(clearAttempts, 2); assert.equal(h.calls.filter(call => call === 'remote-discard').length, 1);
});
