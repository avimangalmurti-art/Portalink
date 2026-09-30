import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';

function execute(path, require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/components/${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require });
  return exports;
}
const { LoadingState } = execute('ui/StateViews.tsx', name => name === 'react' ? React : new Proxy({}, { get: () => () => null }));
function harness() {
  const loaded = [];
  const components = Object.fromEntries(['MediaFrame', 'ImageAttachment', 'GenericFileCard', 'ProcessingNotice',
    'AudioAttachment', 'AudioPlayer', 'DocumentAttachment', 'PdfViewer', 'VideoAttachment', 'ModelAttachment'].map(name => [name, () => null]));
  const deferredPaths = new Map(['AudioAttachment', 'DocumentAttachment', 'VideoAttachment', 'ModelAttachment'].map(name => [`./${name}`, name]));
  deferredPaths.set('../profile/AudioPlayer', 'AudioPlayer');
  deferredPaths.set('../profile/PdfViewer', 'PdfViewer');
  const { AttachmentRenderer } = execute('media/AttachmentRenderer.tsx', name => {
    if (name === 'react') return { ...React, lazy: load => Object.assign(() => null, { load }) };
    if (name === '../ui/StateViews') return { LoadingState };
    if (deferredPaths.has(name)) {
      loaded.push(name);
      const component = deferredPaths.get(name);
      return { [component]: components[component] };
    }
    const component = name.slice(2);
    assert.ok(['MediaFrame', 'ImageAttachment', 'GenericFileCard', 'ProcessingNotice'].includes(component), `Unexpected eager import ${name}`);
    return { [component]: components[component] };
  });
  const attachment = { id: 'file', displayName: 'Selected work', fileName: 'work', kind: 'image', status: 'ready', sourceUrl: '/work' };
  const render = (props = {}) => AttachmentRenderer({ projectId: 'project', projectTitle: 'Title', onClose() {}, ...props, attachment: { ...attachment, ...props.attachment } });
  return { render, loaded, components };
}
const boundary = tree => tree.type === React.Suspense ? tree : tree.props.children;

test('the image renderer static module graph contains no runtime document or playback import', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier) || node.isTypeOnly) continue;
      const clause = node.importClause;
      if (clause?.isTypeOnly || (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
        && clause.namedBindings.elements.every(item => item.isTypeOnly))) continue;
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith('.')) continue;
      const target = resolve(dirname(file), specifier);
      const match = [target, `${target}.ts`, `${target}.tsx`, `${target}.js`, resolve(target, 'index.ts'), resolve(target, 'index.tsx')]
        .find(candidate => existsSync(candidate) && ['.ts', '.tsx', '.js', '.mjs'].includes(extname(candidate)));
      if (match) visit(match);
    }
  }
  visit(resolve(root, 'src/components/media/AttachmentRenderer.tsx'));
  assert.ok(visited.has(resolve(root, 'src/components/media/ImageAttachment.tsx')));
  for (const name of ['PdfPage', 'PdfImageDocument', 'DocumentAttachment', 'VideoAttachment', 'ModelAttachment', 'AudioAttachment']) {
    assert.equal(visited.has(resolve(root, `src/components/media/${name}.tsx`)), false, `${name} must load only for its media kind`);
  }
  assert.equal(visited.has(resolve(root, 'src/components/profile/PdfViewer.tsx')), false);
  assert.equal(visited.has(resolve(root, 'src/components/profile/AudioPlayer.tsx')), false);
});

test('image, generic and processing presentations do not request any other media renderer', () => {
  const h = harness();
  const pages = [{ id: 'first' }, { id: 'second' }], focus = () => {};
  const image = h.render({ imagePages: pages, imageColumns: 1, onFocusModeChange: focus, controlsVisible: false,
    showMediaInteractions: false, isOwner: true, memoryScope: 'shared', pageViewToggleRequest: 9 }).props.children;
  assert.equal(image.type, h.components.ImageAttachment);
  assert.equal(image.props.pages, pages);
  assert.equal(image.props.columns, 1);
  assert.equal(image.props.onFocusModeChange, focus);
  assert.equal(image.props.controlsVisible, false);
  assert.equal(image.props.showMediaInteractions, false);
  assert.equal(image.props.memoryScope, 'shared');
  assert.equal(image.props.pageViewToggleRequest, 9);
  assert.equal(h.render({ attachment: { kind: 'unknown' } }).props.children.type, h.components.GenericFileCard);
  const waiting = h.render({ attachment: { kind: 'document', status: 'processing', sourceUrl: null },
    processing: { state: 'processing', canRetry: true } }).props.children;
  assert.equal(waiting.type, h.components.ProcessingNotice);
  assert.equal(waiting.props.canRetry, false);
  assert.deepEqual(h.loaded, []);
});

test('each real media kind requests only its renderer and retains a polite loading surface', async () => {
  for (const [kind, module, name] of [
    ['document', './DocumentAttachment', 'DocumentAttachment'], ['video', './VideoAttachment', 'VideoAttachment'],
    ['model3d', './ModelAttachment', 'ModelAttachment'], ['audio', './AudioAttachment', 'AudioAttachment'],
  ]) {
    const h = harness();
    const tree = h.render({ attachment: { kind }, videoActive: false });
    assert.equal(tree.type, h.components.MediaFrame);
    const pending = boundary(tree);
    assert.equal(pending.type, React.Suspense);
    assert.deepEqual(h.loaded, []);
    const fallback = pending.props.fallback;
    assert.equal(fallback.type, LoadingState);
    const status = LoadingState(fallback.props);
    assert.equal(status.props.role, 'status');
    assert.equal(status.props['aria-live'], 'polite');
    assert.match(fallback.props.label, /Selected work/);
    const resolved = await pending.props.children.type.load();
    assert.equal(resolved.default, h.components[name]);
    assert.deepEqual(h.loaded, [module]);
    assert.equal(pending.props.children.props.attachment.kind, kind);
    if (kind === 'video') assert.equal(pending.props.children.props.active, false);
  }
});

test('seeded document and audio players are deferred without changing their existing inputs', async () => {
  for (const [kind, module, name] of [['document', '../profile/PdfViewer', 'PdfViewer'], ['audio', '../profile/AudioPlayer', 'AudioPlayer']]) {
    const h = harness(), close = () => {};
    const pending = h.render({ attachment: { kind, sourceUrl: null, metadata: { pageCount: 12, durationSeconds: 87 } },
      onClose: close, artwork: { url: '/cover.webp', alt: 'Cover art' } });
    assert.equal(pending.type, React.Suspense);
    assert.equal(pending.props.fallback.type, h.components.MediaFrame);
    assert.deepEqual(h.loaded, []);
    const renderer = pending.props.children;
    assert.equal((await renderer.type.load()).default, h.components[name]);
    assert.deepEqual(h.loaded, [module]);
    assert.equal(renderer.props.onClose, close);
    assert.equal(renderer.props.fileName, 'Selected work');
    if (kind === 'document') assert.equal(renderer.props.pageCount, 12);
    else { assert.equal(renderer.props.duration, 87); assert.equal(renderer.props.artworkUrl, '/cover.webp'); }
  }
});

test('document processing, page reporting and focused-reader controls survive the deferred boundary', async () => {
  const h = harness(), reports = [], preview = () => {}, focus = () => {}, retry = () => {};
  const renderer = boundary(h.render({ attachment: { kind: 'document', status: 'processing-failed' }, imageColumns: 1,
    processing: { state: 'processing-failed', message: 'Retry conversion', canRetry: true, isRetrying: false, onRetry: retry },
    onDocumentPageCountResolved: (...args) => reports.push(args), onPreviewDocument: preview, onFocusModeChange: focus,
    showMediaInteractions: false, isOwner: true, memoryScope: 'shared', pageViewToggleRequest: 3 })).props.children;
  assert.equal((await renderer.type.load()).default, h.components.DocumentAttachment);
  renderer.props.onPageCountResolved(8);
  assert.deepEqual(reports, [['file', 8]]);
  assert.equal(renderer.props.processing.onRetry, retry);
  assert.equal(renderer.props.processing.state, 'processing-failed');
  assert.equal(renderer.props.onPreviewDocument, preview);
  assert.equal(renderer.props.onFocusModeChange, focus);
  assert.equal(renderer.props.columns, 1);
  assert.equal(renderer.props.memoryScope, 'shared');
  assert.equal(renderer.props.pageViewToggleRequest, 3);
  assert.equal(renderer.props.showMediaInteractions, false);
});
