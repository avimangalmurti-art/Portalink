import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const presentation = sourceModule('src/utils/projectPresentation.ts');
const { coverThumbnailSources } = sourceModule('src/features/media/coverThumbnailSources.ts', {
  './publicMediaUrl': { publicMediaUrl: value => value },
});
const ResponsiveImage = () => null;
function harness(presentationMode = 'mobile') {
  let cursor = 0;
  const state = [];
  const react = { ...React, useEffect() {}, useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = value; }];
  } };
  function load(path, imports) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText, { exports, require: name => name === 'react' ? react : imports[name]
      ?? new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key }) });
    return exports;
  }
  const { ProjectCover } = load('src/components/media/ProjectCover.tsx', {
    '../ui/ResponsiveImage': { ResponsiveImage },
    '../../utils/coverFrame': { normalizeProjectCoverFrame: value => value },
    '../../features/media/coverThumbnailSources': { coverThumbnailSources },
  });
  const { JourneyCover } = load('src/features/journey/JourneyView.tsx', {
    '../../components/media/ProjectCover': { ProjectCover },
    '../../utils/projectPresentation': presentation,
    '../../presentation/usePresentation': { usePresentation: () => presentationMode },
  });
  return project => {
    cursor = 0;
    const cover = JourneyCover({ project });
    return cover.type(cover.props);
  };
}
const document = (patch = {}) => ({
  title: 'Fictional study', coverAlt: 'Study artwork', cover: 'original.pdf', coverKind: 'document', coverPageNumber: 2,
  attachments: [{ id: 'pdf', kind: 'document', sourceUrl: 'original.pdf', metadata: { renderedPages: [
    { attachmentId: 'other', withinDocumentIndex: 2, sourceUrl: 'unrelated.webp' },
    { attachmentId: 'pdf', withinDocumentIndex: 1, sourceUrl: 'first.webp' },
    { attachmentId: 'pdf', withinDocumentIndex: 2, sourceUrl: 'selected.webp' },
  ] } }], ...patch,
});

test('Timeline uses the selected document bitmap instead of a file placeholder or PDF original', () => {
  const project = document(), before = JSON.stringify(project), result = harness()(project);
  assert.equal(result.type, ResponsiveImage);
  assert.equal(result.props.src, 'selected.webp');
  assert.match(result.props.className, /object-contain/);
  assert.equal(result.props.priority, 'viewport');
  assert.equal(JSON.stringify(project), before);
});

test('Timeline stored thumbnail wins; its failure never starts original media fallback', () => {
  for (const mode of ['mobile', 'web']) for (const coverKind of ['document', 'video']) {
    const render = harness(mode), project = document({ coverKind, cover: coverKind === 'video' ? 'movie.mp4' : 'original.pdf',
      coverThumbnail: { version: 1, variants: [
        { size: 400, width: 280, height: 400, sourceUrl: 'stored.webp' },
      ] } });
    const result = render(project);
    assert.equal(result.type, ResponsiveImage);
    assert.equal(result.props.src, 'stored.webp');
    result.props.onError();
    assert.equal(render(project).type, 'span');
  }
});

test('Timeline rejects unrelated document previews and keeps unavailable originals out of thumbnails', () => {
  for (const patch of [{ coverPageNumber: 3 }, { cover: 'other.pdf' }, { attachments: [] }]) {
    const result = harness()(document(patch));
    assert.equal(result.type, 'span');
    assert.equal(result.props['aria-label'], 'Study artwork preview unavailable');
  }
  const image = harness()(document({ cover: 'art.webp', coverKind: undefined }));
  assert.equal(image.type, ResponsiveImage);
  assert.equal(image.props.src, 'art.webp');
});

test('MOBILE Timeline shows legacy video cover artwork while WEB retains its existing placeholder', () => {
  const cases = [
    { title: 'Selected video cover', cover: 'selected.mp4', coverKind: 'video',
      attachments: [{ id: 'other', kind: 'image', sourceUrl: 'other.webp', order: 0 }], expected: 'selected.mp4' },
    { title: 'Existing first video', cover: '', attachments: [
      { id: 'later', kind: 'video', sourceUrl: 'later.mp4', order: 2 },
      { id: 'first', kind: 'video', sourceUrl: 'first.mp4', order: 0 },
    ], expected: 'first.mp4' },
  ];
  for (const project of cases) {
    const before = JSON.stringify(project), result = harness()(project);
    assert.equal(result.type, 'video');
    assert.equal(result.props.src, project.expected);
    assert.equal(result.props.muted, true);
    assert.equal(result.props.playsInline, true);
    assert.equal(result.props.autoPlay, true);
    assert.equal(result.props.loop, true);
    assert.equal(result.props.preload, 'metadata');
    assert.match(result.props.className, /object-contain/);
    const web = harness('web')(project);
    assert.equal(web.type, 'span');
    assert.equal(web.props['aria-label'], `${project.title} preview unavailable`);
    assert.equal(JSON.stringify(project), before, 'Rendering never changes canonical cover or attachment order.');
  }
});
