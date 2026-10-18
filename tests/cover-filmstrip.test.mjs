import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
function execute(source, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, ...globals });
  return exports;
}
const geometry = execute(read('utils/imageCrop.ts'));
function callbacks(path, names) {
  const file = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true);
  const found = {};
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(file))) found[node.name.getText(file)] = node.initializer.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return Object.entries(found).map(([name, source]) => `exports.${name} = ${source};`).join('\n');
}

function mediaHarness() {
  let items = [
    { id: 'pdf', isCover: true, metadata: { pageCount: 5, coverPageNumber: 1, coverFrame: { x: .2, y: .8, zoom: 2, aspectRatio: 4 / 3 } } },
    { id: 'other', isCover: false, metadata: {} },
  ];
  const actions = execute(callbacks('features/publishing/useMediaPreparation.ts', ['setCoverPage', 'setPageCount', 'setCoverFrame']), {
    setItems: (update) => { items = update(items); }, reindex: (value) => value,
  });
  return { ...actions, get items() { return items; } };
}

test('background PDF page counts do not change the cover or its crop', () => {
  const h = mediaHarness();
  const frame = h.items[0].metadata.coverFrame;
  h.setPageCount('other', 19);
  assert.equal(h.items[0].isCover, true);
  assert.equal(h.items[1].isCover, false);
  assert.equal(h.items[1].metadata.pageCount, 19);
  assert.equal(h.items[0].metadata.coverFrame, frame);
  h.setPageCount('removed', 100);
  h.setPageCount('other', 0);
  assert.equal(h.items.length, 2);
  assert.equal(h.items[1].metadata.pageCount, 19);
});

test('page changes reset the old crop or atomically restore that page’s draft', () => {
  const h = mediaHarness();
  h.setCoverPage('pdf', 2, 5);
  assert.equal(h.items[0].metadata.coverPageNumber, 2);
  assert.equal(h.items[0].metadata.coverFrame.zoom, 1);
  assert.equal(h.items[0].metadata.coverFrame.aspectRatio, 4 / 3);
  const saved = { x: .8, y: .1, zoom: 2.4, aspectRatio: 3 / 4 };
  h.setCoverPage('pdf', 1, 5, saved);
  assert.equal(h.items[0].metadata.coverPageNumber, 1);
  assert.equal(h.items[0].metadata.coverFrame, saved);
  h.setCoverPage('pdf', 100, 5);
  assert.equal(h.items[0].metadata.coverPageNumber, 5);
});

test('late crop callbacks cannot overwrite another page or another file’s cover', () => {
  const h = mediaHarness();
  h.setCoverPage('pdf', 2, 5);
  const frame = h.items[0].metadata.coverFrame;
  h.setCoverFrame('pdf', { x: 0, y: 0, zoom: 3 }, 1);
  assert.equal(h.items[0].metadata.coverFrame, frame);
  h.setCoverPage('other', 1);
  h.setCoverFrame('pdf', { x: 0, y: 0, zoom: 3 }, 2);
  assert.equal(h.items[0].metadata.coverFrame, frame);
  assert.equal(h.items[1].isCover, true);
});

function cropHarness() {
  const refs = []; let cursor = 0, effect, cleanup;
  const changes = [], listeners = new Map();
  const element = { focus() {}, setPointerCapture() {}, hasPointerCapture: () => false,
    getBoundingClientRect: () => ({ width: 160, height: 120, left: 0, top: 0 }),
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  const { useInlineCoverCrop } = execute(read('components/publishing/useInlineCoverCrop.ts'), { require(name) {
    if (name.endsWith('/imageCrop')) return geometry;
    return { useRef: (initial) => refs[cursor++] ??= { current: initial }, useEffect: (fn) => { effect = fn; } };
  } });
  let frame = { x: .5, y: .5, zoom: 2, aspectRatio: 4 / 3 };
  function render(active = true) {
    cleanup?.(); cursor = 0;
    const result = useInlineCoverCrop({ active, frame, size: { width: 600, height: 900 }, onChange: (next) => { frame = next; changes.push(next); } });
    result.ref.current = element;
    cleanup = effect();
    return result;
  }
  return { render, element, changes, listeners, dispose: () => cleanup?.() };
}

test('thumbnail drag, wheel and keyboard crop the draft without leaving empty bounds', () => {
  const h = cropHarness(), crop = h.render();
  const event = { currentTarget: h.element, pointerId: 1, button: 0, clientX: 20, clientY: 20 };
  crop.onPointerDown(event);
  crop.onPointerMove({ ...event, clientX: 1000, clientY: -1000 });
  crop.onPointerUp(event);
  assert.equal(h.changes.length, 1);
  let prevented = false;
  h.listeners.get('wheel')({ deltaY: -100000, deltaMode: 0, clientX: 80, clientY: 60, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  let interceptedHorizontalScroll = false;
  h.listeners.get('wheel')({ deltaX: 80, deltaY: 0, preventDefault() { interceptedHorizontalScroll = true; } });
  assert.equal(interceptedHorizontalScroll, false);
  crop.onKeyDown({ currentTarget: h.element, key: 'ArrowLeft', shiftKey: true, preventDefault() {} });
  for (const frame of h.changes) {
    assert.ok(frame.zoom >= 1 && frame.zoom <= 3);
    const { x, y, width, height } = frame.crop;
    assert.ok(x >= 0 && y >= 0 && x + width <= 1.000001 && y + height <= 1.000001);
    assert.ok(Math.abs(width * 600 / (height * 900) - 4 / 3) < 1e-9);
  }
  const count = h.changes.length;
  const locked = h.render(false);
  locked.onPointerDown(event); locked.onPointerMove({ ...event, clientX: 200 });
  locked.onKeyDown({ currentTarget: h.element, key: 'ArrowRight', preventDefault() {} });
  assert.equal(h.changes.length, count);
  assert.equal(h.listeners.size, 0);
  h.dispose();
});

test('creation accepts optional blank descriptions and unrestricted prose', () => {
  const validators = execute(read('features/publishing/validation.ts'));
  for (const summary of ['', '  \n ', 'Detailed project description. '.repeat(10000)]) {
    let errors;
    const { validate } = execute(callbacks('features/publishing/usePublishProject.ts', ['validate']), {
      firstProject: false, metadata: { title: 'Project', summary }, validateTitle: validators.validateTitle,
      FIELD_ORDER: ['title', 'summary'], setFieldErrors: (next) => { errors = next; }, setInvalidField() {},
    });
    assert.equal(validate(), true);
    assert.equal(errors.summary, null);
  }
});

function documentHarness(held = false) {
  const source = read('components/publishing/CoverFilmstrip.tsx');
  const file = ts.createSourceFile('filmstrip.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = file.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'FileThumbnails');
  const slots = []; let cursor = 0, dirty = true, effects = [], documentCount = 0, destroyed = 0, finish;
  const counts = [], rendered = [];
  const document = { numPages: 19 };
  const promise = held ? new Promise((resolve) => { finish = () => resolve(document); }) : Promise.resolve(document);
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, (next) => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true; }]; },
    useEffect(effect, deps) { const i = cursor++; const previous = slots[i]; if (!previous || deps.some((value, n) => value !== previous.deps[n])) {
      slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = effect(); });
    } },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`${fn.getText(file)}\nexports.Component = FileThumbnails;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, {
    exports, React: react, useState: react.useState, useEffect: react.useEffect,
    pdfSourceOptions: (url) => ({ url }),
    loadPdfJs: async () => ({ getDocument: () => { documentCount++; return { promise, destroy: async () => { destroyed++; } }; } }),
  });
  const item = { id: 'pdf', family: 'document', previewUrl: 'blob:original', displayTitle: 'Document' };
  const media = { setPageCount: (id, count) => counts.push([id, count]) };
  function render() { cursor = 0; effects = []; dirty = false; rendered.length = 0;
    exports.Component({ item, media, render: (page, pdf) => { rendered.push([page, pdf]); return null; } });
    effects.forEach((effect) => effect());
  }
  return { async flush() { for (let i = 0; i < 20; i++) { if (dirty) render(); await Promise.resolve(); } },
    render, rendered, counts, finish: () => finish?.(), get documentCount() { return documentCount; }, get destroyed() { return destroyed; },
    unmount() { slots.forEach((slot) => slot.cleanup?.()); dirty = false; },
  };
}

test('all PDF thumbnails share one document and rerenders do not reopen it', async () => {
  const h = documentHarness(); await h.flush();
  assert.equal(h.documentCount, 1);
  assert.equal(h.rendered.length, 19);
  assert.ok(h.rendered.every(([page, pdf], index) => page === index + 1 && pdf === h.rendered[0][1]));
  assert.deepEqual(h.counts, [['pdf', 19]]);
  h.render(); await h.flush(); assert.equal(h.documentCount, 1);
  h.unmount(); assert.equal(h.destroyed, 1);
});

test('removing a file destroys its pending PDF loader and ignores late page counts', async () => {
  const h = documentHarness(true); await h.flush();
  h.unmount(); h.finish(); await h.flush();
  assert.equal(h.destroyed, 1);
  assert.equal(h.counts.length, 0);
});
