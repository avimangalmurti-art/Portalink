import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { coverThumbnailGeometry, renderCoverVariants } from '../src/features/media/coverThumbnailCore.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function execute(path, require = () => ({}), globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path).replaceAll('import.meta.env.VITE_SUPABASE_URL', 'undefined'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, { exports, require, URL, ...globals });
  return exports;
}
function runtime() {
  const calls = [], canvases = [];
  const loaded = { source: 'decoded', width: 1200, height: 800, dispose: () => calls.push(['dispose']) };
  return { calls, canvases, adapter: {
    loadImage: async url => { calls.push(['image', url]); return loaded; },
    renderPdfPage: async (...args) => { calls.push(['pdf', ...args]); return loaded; },
    loadVideoFrame: async url => { calls.push(['video', url]); return loaded; },
    createCanvas: (width, height) => {
      const draw = [], fills = [];
      const canvas = { width, height, draw, fills, getContext: () => ({ drawImage: (...args) => draw.push(args), fillRect: (...args) => fills.push(args) }) };
      canvases.push(canvas); return canvas;
    },
    encodeWebp: async canvas => new Blob([JSON.stringify(canvas.draw)], { type: 'image/webp' }),
  } };
}

test('image covers use the selected source and create exactly three bounded WebP variants', async () => {
  const r = runtime();
  const result = await renderCoverVariants({ kind: 'image', sourceUrl: 'chosen.jpg' }, r.adapter);
  assert.deepEqual(r.calls, [['image', 'chosen.jpg'], ['dispose']]);
  assert.deepEqual(result.map(({ size, width, height }) => [size, width, height]), [[200, 200, 133], [400, 400, 267], [800, 800, 533]]);
  assert.ok(result.every(item => item.blob.type === 'image/webp'));
  assert.ok(r.canvases.every(canvas => Math.max(canvas.width, canvas.height) <= 800));
});

test('PDF covers render the selected page once through the bounded PDF adapter and keep white paper', async () => {
  const r = runtime();
  await renderCoverVariants({ kind: 'document', sourceUrl: 'report.pdf', pageNumber: 7, frame: { x: .5, y: .5, zoom: 2 } }, r.adapter);
  assert.deepEqual(r.calls, [['pdf', 'report.pdf', 7, 1600], ['dispose']]);
  assert.equal(r.canvases.length, 3);
  assert.ok(r.canvases.every(canvas => canvas.fills.length === 1));
  const plain = runtime();
  await renderCoverVariants({ kind: 'document', sourceUrl: 'report.pdf' }, plain.adapter);
  assert.deepEqual(plain.calls[0], ['pdf', 'report.pdf', 1, 800]);
});

test('video covers use an existing poster without opening the video, otherwise decode its first frame', async () => {
  for (const posterUrl of [undefined, 'poster.webp']) {
    const r = runtime();
    await renderCoverVariants({ kind: 'video', sourceUrl: 'movie.mp4', posterUrl }, r.adapter);
    assert.deepEqual(r.calls[0], posterUrl ? ['image', posterUrl] : ['video', 'movie.mp4']);
    assert.equal(r.canvases.length, 3);
  }
});

test('saved cover rectangles and legacy focal/zoom frames bake once without touching originals', () => {
  const frame = { x: .1, y: .9, zoom: 2, aspectRatio: 1, crop: { x: .25, y: .125, width: .5, height: .75, zoom: 2 } };
  const before = JSON.stringify(frame);
  assert.deepEqual(coverThumbnailGeometry(1200, 800, { frame }).source, { x: 300, y: 100, width: 600, height: 600 });
  assert.equal(JSON.stringify(frame), before);
  const legacy = coverThumbnailGeometry(1200, 800, { frame: { x: .25, y: .75, zoom: 2 }, aspectRatio: 1 });
  assert.deepEqual(legacy.source, { x: 200.00000000000003, y: 300, width: 400, height: 400 });
  const unframedPdf = coverThumbnailGeometry(1200, 800, { kind: 'document', aspectRatio: 1 });
  assert.equal(unframedPdf.contain, true);
  assert.deepEqual(unframedPdf.source, { x: 0, y: 0, width: 1200, height: 800 });
});

test('renderer rejects unsupported/invalid sources and disposes decoded media after encoding failure', async () => {
  const r = runtime();
  await assert.rejects(renderCoverVariants({ kind: 'audio', sourceUrl: 'sound.mp3' }, r.adapter), /Choose an image/);
  await assert.rejects(renderCoverVariants({ kind: 'image', sourceUrl: '' }, r.adapter), /Choose a cover/);
  r.adapter.encodeWebp = async () => { throw new Error('encode failed'); };
  await assert.rejects(renderCoverVariants({ kind: 'image', sourceUrl: 'image.jpg' }, r.adapter), /encode failed/);
  assert.deepEqual(r.calls.at(-1), ['dispose']);
  assert.throws(() => coverThumbnailGeometry(0, 100), /dimensions/);
});

const publicUrls = execute('src/features/media/publicMediaUrl.ts');
const { coverThumbnailSources } = execute('src/features/media/coverThumbnailSources.ts', () => publicUrls);
const thumbnail = { version: 1, frameBaked: true, sourceKey: 'hash', variants: [
  { size: 800, width: 566, height: 800, sourceUrl: '/cover-800.webp' },
  { size: 200, width: 142, height: 200, sourceUrl: '/cover-200.webp' },
  { size: 400, width: 283, height: 400, sourceUrl: '/cover-400.webp' },
] };
test('srcset is ordered by actual portrait pixel widths, excluding unresolved variants', () => {
  assert.equal(coverThumbnailSources(thumbnail).srcSet, '/cover-200.webp 142w, /cover-400.webp 283w, /cover-800.webp 566w');
  assert.equal(coverThumbnailSources(thumbnail).width, 566);
  assert.equal(coverThumbnailSources({ variants: [{ width: 200, height: 100, sourceUrl: null }] }), null);
});

test('cover-only bundle cards retain the stored artwork shape without attachment metadata', () => {
  const { getProjectAspectRatio } = execute('src/utils/projectPresentation.ts');
  assert.equal(getProjectAspectRatio({ coverThumbnail: thumbnail }), 566 / 800);
  assert.equal(getProjectAspectRatio({ coverThumbnail: thumbnail, coverFrame: { aspectRatio: 1 }, pageCount: 20 }), 566 / 800, 'A baked thumbnail takes precedence over stale source framing');
  assert.equal(getProjectAspectRatio({ coverAspectRatio: 1.5 }), 1.5, 'Legacy covers retain their existing shape');
});

test('thumbnail grid render never imports PDF.js or falls back to its original when the image fails', () => {
  let cursor = 0; const state = [], imports = [];
  const react = { ...React, lazy: factory => ({ lazyFactory: factory }), useEffect() {}, useState(initial) {
    const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], next => { state[i] = next; }];
  } };
  const { ProjectCover } = execute('src/components/media/ProjectCover.tsx', name => {
    imports.push(name);
    if (name === 'react') return react;
    if (name.endsWith('/ResponsiveImage')) return { ResponsiveImage: 'responsive-image' };
    if (name.endsWith('/coverThumbnailSources')) return { coverThumbnailSources };
    if (name.endsWith('/coverFrame')) return { normalizeProjectCoverFrame: value => value };
    if (name.includes('PdfPage') || name.includes('pdfjs')) assert.fail('Thumbnail requested the PDF renderer');
    return { InterfaceIcon: 'icon', FileIcon: 'file' };
  });
  const render = (showLoadingIndicator = false) => { cursor = 0; return ProjectCover({ thumbnail, source: 'original.pdf', kind: 'document', alt: 'Report', frame: { x: .1, y: .8, zoom: 3 }, showLoadingIndicator }); };
  const tree = render();
  assert.equal(tree.type, 'responsive-image');
  assert.equal(tree.props.src, '/cover-800.webp');
  assert.equal(tree.props.measureWidth, true);
  assert.equal(tree.props.style, undefined, 'Stored frame is not cropped twice');
  const [image, loadingMark] = React.Children.toArray(render(true).props.children);
  assert.equal(image.type, 'responsive-image');
  assert.equal(loadingMark.props['data-project-cover-loading'], '');
  assert.equal(loadingMark.props.children.props.className, 'premium-media-loading-mark');
  image.props.onLoad();
  assert.equal(React.Children.toArray(render(true).props.children).length, 1);
  image.props.onError();
  const failed = render(true);
  assert.equal(failed.type, 'span');
  assert.equal(failed.props['data-project-cover-loading'], undefined);
  assert.ok(imports.every(name => !name.includes('pdf')));
  const ast = ts.createSourceFile('cover.tsx', read('src/components/media/ProjectCover.tsx'), ts.ScriptTarget.Latest, true);
  assert.ok(ast.statements.filter(ts.isImportDeclaration).every(node => !/PdfPage|pdfjs/.test(node.moduleSpecifier.text)));
});

test('responsive thumbnail sizes track the actual tile width through density/sidebar changes', () => {
  let cursor = 0, measured = 170, resize;
  const state = [], effects = [];
  const react = { ...React,
    useRef: () => ({ current: { getBoundingClientRect: () => ({ width: measured }) } }),
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], next => { state[i] = next; }]; },
    useLayoutEffect: effect => effects.push(effect),
  };
  const { ResponsiveImage } = execute('src/components/ui/ResponsiveImage.tsx', name => {
    if (name === 'react') return react;
    if (name.endsWith('/rum')) return { rumViewToken: () => null, markRumCover() {} };
    if (name.endsWith('/publicMediaUrl')) return { publicMediaUrl: source => source };
    throw new Error(`Unexpected dependency ${name}`);
  }, {
    ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() {} },
  });
  const render = () => { cursor = 0; return ResponsiveImage({ src: '/cover.webp', alt: 'Cover', measureWidth: true, sizes: '90vw' }); };
  assert.equal(render().props.src, undefined, 'No wrong-size download starts before measurement'); effects.splice(0).forEach(effect => effect());
  assert.equal(render().props.sizes, '170px');
  assert.equal(render().props.src, '/cover.webp');
  measured = 306.4; resize();
  assert.equal(render().props.sizes, '307px');
});
