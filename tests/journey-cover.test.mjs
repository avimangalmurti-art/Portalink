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
function harness() {
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
  const render = harness(), project = document({ coverThumbnail: { version: 1, variants: [
    { size: 400, width: 280, height: 400, sourceUrl: 'stored.webp' },
  ] } });
  const result = render(project);
  assert.equal(result.type, ResponsiveImage);
  assert.equal(result.props.src, 'stored.webp');
  result.props.onError();
  assert.equal(render(project).type, 'span');
});

test('Timeline rejects unrelated document previews and keeps unavailable originals out of thumbnails', () => {
  for (const patch of [{ coverPageNumber: 3 }, { cover: 'other.pdf' }, { attachments: [] }]) {
    const result = harness()(document(patch));
    assert.equal(result.type, 'span');
    assert.equal(result.props['aria-label'], 'Study artwork preview unavailable');
  }
  const video = harness()(document({ cover: 'movie.mp4', coverKind: 'video' }));
  assert.equal(video.type, 'span');
  const image = harness()(document({ cover: 'art.webp', coverKind: undefined }));
  assert.equal(image.type, ResponsiveImage);
  assert.equal(image.props.src, 'art.webp');
});
