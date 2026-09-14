import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
function execute(source, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, ...globals });
  return exports;
}
const { normalizeProjectCoverFrame } = execute(read('../src/utils/coverFrame.ts'));
const hook = ts.createSourceFile('management.ts', read('../src/features/projects/useProjectManagement.ts'), ts.ScriptTarget.Latest, true);
let saveCallback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(hook) === 'save') saveCallback = node.initializer.arguments[0].getText(hook);
  ts.forEachChild(node, visit);
}
visit(hook);

function saveHarness(fail = false) {
  const calls = [], events = [];
  const original = [
    { id: 'cover', displayName: 'Cover', order: 0, isCover: true, coverFrame: { x: .5, y: .5, zoom: 1 } },
    { id: 'second', displayName: 'Second page', order: 1, isCover: false }
  ];
  const { save } = execute(`exports.save = ${saveCallback}`, {
    editingProjectId: 'project', profileId: 'owner', isSavingRef: { current: false }, isMountedRef: { current: true },
    validate: () => null, attachmentEdits: original, normalizeProjectCoverFrame,
    metadata: { title: 'Existing title', summary: 'Existing description' },
    addedMedia: { items: [], clear: () => events.push('clear'), releaseOwnership() {} },
    isTransportAvailable: true,
    upload: { isBusy: false, reset: () => events.push('reset'), upload: () => { throw Error('Unexpected upload'); } },
    setEditorPhase: (phase) => events.push(phase), setSaveFailure: (failure) => { if (failure) events.push('failure'); }, setSaveResult() {},
    projectService: { updateProject: async (input) => { calls.push(input); if (fail) throw Error('Network failed'); return { project: { id: 'project' } }; } },
    invalidateProfiles: () => events.push('invalidate'), hydrate: () => events.push('hydrate'),
    failureFrom: (error) => ({ code: 'network', message: error.message }), isRetryable: () => true,
  });
  return { save, calls, events, original };
}

test('direct preview Save persists the new crop on its first request without a state rerender', async () => {
  const harness = saveHarness();
  const frame = { x: .2, y: .8, zoom: 2, aspectRatio: 16 / 9, crop: { x: .1, y: .4, width: .5, height: .5, zoom: 2 } };
  assert.equal(await harness.save({ attachmentId: 'cover', frame }), null);
  assert.equal(harness.calls.length, 1);
  const input = harness.calls[0];
  assert.equal(input.attachments[0].coverFrame.zoom, 2);
  assert.equal(input.attachments[0].coverFrame.aspectRatio, 16 / 9);
  assert.equal(input.attachments[0].coverFrame.crop.x, .1);
  assert.equal(input.attachments[1], harness.original[1]);
  assert.equal(harness.original[0].coverFrame.zoom, 1);
  assert.equal(input.metadata.title, 'Existing title');
  assert.equal(input.metadata.summary, 'Existing description');
  assert.equal(input.addedAttachments, undefined);
  assert.ok(harness.events.includes('invalidate') && harness.events.includes('hydrate'));
});

test('a rejected save never reports success or refreshes the project as saved', async () => {
  const harness = saveHarness(true);
  assert.equal(await harness.save({ attachmentId: 'cover', frame: { x: .2, y: .8, zoom: 2 } }), 'failed');
  assert.ok(harness.events.includes('failure') && harness.events.includes('editing'));
  assert.ok(!harness.events.includes('saved') && !harness.events.includes('invalidate') && !harness.events.includes('hydrate'));
  assert.equal(harness.original[0].coverFrame.zoom, 1);
});

test('a stale cover selection cannot apply a crop to another attachment', async () => {
  const harness = saveHarness();
  await assert.rejects(harness.save({ attachmentId: 'second', frame: { x: 0, y: 0, zoom: 2 } }), /preview has changed/);
  assert.equal(harness.calls.length, 0);
});

function sourceHarness({ hold = false, failRender = false } = {}) {
  let requestedPage, renderOptions, destroyed = 0, renderComplete;
  const canvas = { width: 0, height: 0, toBlob: (done) => done(new Blob(['preview'], { type: 'image/png' })) };
  const renderPromise = hold ? new Promise((resolve) => { renderComplete = resolve; }) : failRender ? Promise.reject(Error('Unreadable page')) : Promise.resolve();
  const page = { getViewport: ({ scale }) => ({ width: 600 * scale, height: 900 * scale }), render: (options) => { renderOptions = options; return { promise: renderPromise }; } };
  const task = { promise: Promise.resolve({ numPages: 8, getPage: async (number) => { requestedPage = number; return page; } }), destroy: async () => { destroyed++; } };
  const { projectPreviewSource } = execute(read('../src/components/media/projectPreviewSource.ts'), {
    Blob, DOMException, document: { createElement: () => canvas },
    require: (name) => { assert.equal(name, './PdfPage'); return { loadPdfJs: async () => ({ getDocument: () => task }), pdfSourceOptions: (source) => ({ url: source }) }; }
  });
  return { projectPreviewSource, canvas, get requestedPage() { return requestedPage; }, get renderOptions() { return renderOptions; }, get destroyed() { return destroyed; }, finish: () => renderComplete?.() };
}

test('PDF cover preparation renders the selected page at its original proportions and releases the document', async () => {
  const harness = sourceHarness();
  const blob = await harness.projectPreviewSource('cover.pdf', 'document', 5, new AbortController().signal);
  assert.equal(harness.requestedPage, 5);
  assert.equal(harness.canvas.width, 1280);
  assert.equal(harness.canvas.height, 1920);
  assert.equal(harness.renderOptions.background, '#ffffff');
  assert.equal(blob.type, 'image/png');
  assert.equal(harness.destroyed, 1);
});

test('cancelling PDF preparation rejects stale results and releases its worker', async () => {
  const harness = sourceHarness({ hold: true }), abort = new AbortController();
  const result = harness.projectPreviewSource('cover.pdf', 'document', 5, abort.signal);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  abort.abort(); harness.finish();
  await assert.rejects(result, { name: 'AbortError' });
  assert.ok(harness.destroyed >= 1);
});

test('an unreadable PDF reports failure and releases its worker', async () => {
  const harness = sourceHarness({ failRender: true });
  await assert.rejects(harness.projectPreviewSource('cover.pdf', 'document', 100, new AbortController().signal), /Unreadable page/);
  assert.equal(harness.requestedPage, 8);
  assert.equal(harness.destroyed, 1);
});

test('video preview preparation exports a proportional frame and releases the media resource', async () => {
  let drawn = false, released = false;
  const video = { videoWidth: 3840, videoHeight: 2160, src: '', load() { if (this.src) queueMicrotask(() => this.onloadeddata?.()); }, removeAttribute() { this.src = ''; released = true; } };
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (input) => { assert.equal(input, video); drawn = true; } }), toBlob: (done) => done(new Blob(['frame'])) };
  const { projectPreviewSource } = execute(read('../src/components/media/projectPreviewSource.ts'), {
    Blob, DOMException, window: { setTimeout, clearTimeout }, document: { createElement: (tag) => tag === 'video' ? video : canvas }, require: () => ({})
  });
  await projectPreviewSource('movie.mp4', 'video', 1, new AbortController().signal);
  assert.equal(canvas.width, 1920); assert.equal(canvas.height, 1080); assert.ok(drawn && released);
});
