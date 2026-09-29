import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function harness() {
  let cursor = 0; const state = [];
  const react = { ...React, useEffect() { /* Covers render synchronously in this harness. */ }, useState(initial) {
    const i = cursor++; if (!(i in state)) state[i] = initial;
    return [state[i], next => { state[i] = next; }];
  } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read('../src/components/media/ProjectCover.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(name) {
    if (name === 'react') return react;
    if (name === './PdfPage') return { PdfPage: 'pdf-page' };
    if (name.endsWith('/ResponsiveImage')) return { ResponsiveImage: 'image' };
    if (name.endsWith('/coverFrame')) return { normalizeProjectCoverFrame: frame => frame };
    return { InterfaceIcon: 'icon', FileIcon: 'file' };
  } });
  return props => { cursor = 0; return exports.ProjectCover({ source: '', alt: 'Project artwork', ...props }); };
}
const image = (id, order) => ({ id, order, kind: 'image', sourceUrl: `${id}.png`, metadata: { aspectRatio: 1.5 } });
const page = (attachmentId, withinDocumentIndex, sourceUrl) => ({ attachmentId, withinDocumentIndex, sourceUrl, aspectRatio: 0.7 });
const document = extra => ({ id: 'pdf', order: 0, kind: 'document', sourceUrl: 'original.pdf', ...extra });

test('shared cover fallback uses existing image order without changing the project attachments', () => {
  const attachments = [image('later', 4), image('first', 0)];
  const before = JSON.stringify(attachments);
  const result = harness()({ fallbackAttachments: attachments });
  assert.equal(result.type, 'image'); assert.equal(result.props.src, 'first.png');
  assert.equal(JSON.stringify(attachments), before);
});

test('shared PDF fallback uses only its first rendered page and retains original PDF fallback', () => {
  const render = harness();
  const props = { pageNumber: 9, frame: { x: 0.2, y: 0.7, zoom: 3 }, fallbackAttachments: [document({ metadata: { renderedPages: [
    page('other', 1, 'wrong.png'), page('pdf', 2, 'second.png'), page('pdf', 1, 'first.png'),
  ] } })] };
  const first = render(props);
  assert.equal(first.type, 'image'); assert.equal(first.props.src, 'first.png');
  assert.match(first.props.className, /object-contain/);
  first.props.onError();
  const fallback = render(props);
  assert.equal(fallback.type, 'pdf-page'); assert.equal(fallback.props.source, 'original.pdf');
  assert.equal(fallback.props.pageNumber, 1, 'A missing cover never inherits an old selected cover page or crop.');
});

test('shared cover fallback can display an existing first page without an original URL or lazily render the PDF', () => {
  const rendered = harness()({ fallbackAttachments: [document({ sourceUrl: null, metadata: { renderedPages: [page('pdf', 1, 'first.png')] } })] });
  assert.equal(rendered.type, 'image'); assert.equal(rendered.props.src, 'first.png');
  assert.match(rendered.props.className, /object-contain/);
  const original = harness()({ fallbackAttachments: [document()] });
  assert.equal(original.type, 'pdf-page'); assert.equal(original.props.source, 'original.pdf'); assert.equal(original.props.pageNumber, 1);
});

test('explicit covers win, ordinary missing covers stay placeholders, and unavailable data is not invented', () => {
  const chosen = harness()({ source: 'chosen.png', fallbackAttachments: [image('other', 0)] });
  assert.equal(chosen.props.src, 'chosen.png');
  for (const props of [{}, { fallbackAttachments: [] }, { fallbackAttachments: [{ kind: 'audio', sourceUrl: 'track.mp3', order: 0 }] },
    { fallbackAttachments: [document({ sourceUrl: null, metadata: { renderedPages: [page('pdf', 2, 'second.png')] } })] }]) {
    const result = harness()(props);
    assert.equal(result.type, 'span'); assert.equal(result.props['aria-label'], 'Project artwork has no cover');
  }
});

test('project cards opt into attachment fallbacks explicitly', () => {
  const source = read('../src/components/profile/ProjectPreviewCard.tsx');
  const file = ts.createSourceFile('ProjectPreviewCard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'fallbackAttachments') expression = node.initializer.expression.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(expression);
  const project = { attachments: [image('first', 0)] };
  for (const sharedCoverFallback of [false, true]) assert.equal(vm.runInNewContext(expression, { project, sharedCoverFallback }), sharedCoverFallback ? project.attachments : undefined);
  assert.match(source, /sharedCoverFallback = false/);
});
