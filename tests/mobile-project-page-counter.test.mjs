import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const pageLayout = sourceModule('src/features/projects/pageLayout.ts', {});
const pageScroll = sourceModule('src/components/media/projectPageScroll.ts', {});
const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const control = (tree, label) => nodes(tree).find(node => node.props['aria-label'] === label);

const rect = (top, bottom, left = 0, right = 390) => ({ top, bottom, left, right });
const page = (number, total, bounds) => ({ dataset: { projectPageNumber: `${number}`, projectPageTotal: `${total}` },
  bounds, getBoundingClientRect() { return this.bounds; } });
const part = (id, count, pages = []) => ({ dataset: { projectReadingPart: id, projectReadingCount: count }, pages,
  querySelector() { return this.pages[0]; }, querySelectorAll() { return this.pages; } });

function mount(pages = [], { delayedRef = false, readingEnd = false, parts = [] } = {}) {
  const states = [], refs = [], documentEvents = new Map();
  let effectIndex = 0, stateIndex = 0, refIndex = 0, effect, visibilityEffect, visibilityCleanup, frame, onMutation, onResize, cleanedMutations = false, cleanedResize = false;
  const events = new Map(), windowEvents = new Map(), observed = new Set();
  const surface = { pages, parts, bounds: rect(0, 800), querySelectorAll(selector) { return selector.includes('data-project-reading-part') ? this.parts : this.pages; },
    closest: () => readingEnd ? {} : null, querySelector: () => null,
    getBoundingClientRect() { return this.bounds; }, addEventListener(name, fn, opts) { events.set(name, { fn, opts }); },
    removeEventListener(name) { events.delete(name); } };
  const surfaceRef = { current: delayedRef ? null : surface };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobileProjectPageCounter.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, {
    exports, require(name) {
      if (name === 'react') return { ...React,
        useState: initial => { const index = stateIndex++; if (!(index in states)) states[index] = initial;
          return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
        useRef: initial => { const index = refIndex++; return refs[index] ??= { current: initial }; },
        useId: () => 'page-previews', useEffect: fn => { if (effectIndex++ === 0) visibilityEffect = fn; }, useLayoutEffect: fn => { effect = fn; } };
      if (name.endsWith('/MobileContextActions')) return { useMobileScreenActions() {} };
      if (name.endsWith('/contextActions')) return { contextActions: () => ({}) };
      if (name.endsWith('/pageLayout')) return pageLayout;
      if (name === 'lucide-react') return { Grid2X2Icon: () => null };
      if (name === '../ui/InterfaceIcon') return { InterfaceIcon: () => null };
      if (name === './MobilePageThumbnails') return { MobilePageThumbnails: () => null };
      if (name === './projectPageScroll') return pageScroll;
      throw new Error(name);
    },
    MutationObserver: class { constructor(fn) { onMutation = fn; } observe() {} disconnect() { cleanedMutations = true; } },
    ResizeObserver: class { constructor(fn) { onResize = fn; } observe(node) { observed.add(node); } unobserve(node) { observed.delete(node); } disconnect() { cleanedResize = true; } },
    requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame: () => { frame = null; },
    window: { innerWidth: 390, innerHeight: 800, scrollY: readingEnd ? 800 : 0, addEventListener: (name, fn) => windowEvents.set(name, fn), removeEventListener: name => windowEvents.delete(name) },
    Node: Object,
    document: { documentElement: { scrollHeight: 1600 }, addEventListener: (name, fn) => documentEvents.set(name, fn), removeEventListener: name => documentEvents.delete(name) },
  });
  const render = (scope = 'project:images', props = {}) => { stateIndex = 0; refIndex = 0; effectIndex = 0;
    return exports.MobileProjectPageCounter({ surfaceRef, scope, ...props }); };
  assert.equal(render(), null);
  const cleanup = effect();
  const flush = () => { const callback = frame; frame = null; callback?.(); };
  return { surface, surfaceRef, render, flush, get position() { return states[0]?.position ?? null; }, events, observed, cleanup, refs, documentEvents,
    visibility() { visibilityCleanup?.(); visibilityCleanup = visibilityEffect(); },
    mutate() { onMutation(); flush(); }, resize() { onResize(); flush(); }, scroll() { events.get('scroll')?.fn(); flush(); },
    get clean() { return cleanedMutations && cleanedResize && !frame && !events.size && !windowEvents.size; } };
}

test('ordered sections wait for PDF totals and report global and attachment-local positions', () => {
  const cover = part('cover', '1', [page(1, 1, rect(0, 600))]);
  const report = part('report', undefined);
  const appendix = part('appendix', '1', [page(1, 1, rect(1900, 2100))]);
  const h = mount([], { parts: [cover, report, appendix] }); h.flush();
  assert.equal(h.render(), null, 'an unresolved PDF must not produce a false total');
  report.pages = [page(1, 3, rect(620, 1200)), page(2, 3, rect(1200, 1750))]; h.mutate();
  assert.equal(h.position.current, 1);
  assert.equal(h.position.total, 5);
  assert.equal(h.position.attachmentId, 'cover');
  cover.pages[0].bounds = rect(-1200, -600);
  report.pages[0].bounds = rect(-580, 0);
  report.pages[1].bounds = rect(0, 550);
  h.scroll();
  assert.deepEqual(JSON.parse(JSON.stringify(h.position)), { scope: 'project:images', current: 3, total: 5,
    ready: true, attachmentId: 'report', attachmentPage: 2, attachmentTotal: 3 });
  const props = { readingMode: true, onSelectPage: number => selected.push(number) };
  const selected = [];
  const counter = control(h.render(undefined, props), 'Page 3 of 5. Show page previews');
  counter.props.onClick();
  const tree = h.render(undefined, props);
  const thumbnails = nodes(tree).find(node => node.props.total === 5 && node.props.current === 3);
  assert.deepEqual(JSON.parse(JSON.stringify(thumbnails.props.readingParts)), [
    { attachmentId: 'cover', firstPage: 1, count: 1 }, { attachmentId: 'report', firstPage: 2, count: 3 },
    { attachmentId: 'appendix', firstPage: 5, count: 1 },
  ]);
  control(tree, 'Next page').props.onClick();
  assert.deepEqual(selected, [4]);
  report.pages[1].bounds = rect(-550, 0);
  appendix.pages[0].bounds = rect(10, 210); h.scroll();
  assert.equal(h.position.current, 5);
  assert.equal(h.position.attachmentPage, 1);
  h.cleanup();
});

test('shows the actual most-visible page while a nested renderer scrolls', () => {
  const one = page(1, 3, rect(0, 600)), two = page(2, 3, rect(602, 1202)), three = page(3, 3, rect(1204, 1804));
  const h = mount([one, two, three]); h.flush();
  assert.equal(h.render().props.children.find(child=>child?.props?.['data-mobile-project-page-count'] !== undefined).props['aria-label'], 'Page 1 of 3. Show page previews');
  assert.equal(typeof h.render().props.children.find(child=>child?.props?.['data-mobile-project-page-count'] !== undefined).props.onClick, 'function');
  assert.equal(h.events.get('scroll').opts.capture, true);
  one.bounds = rect(-600, 0); two.bounds = rect(2, 602); three.bounds = rect(604, 1204); h.scroll();
  assert.equal(h.render().props.children.find(child=>child?.props?.['data-mobile-project-page-count'] !== undefined).props['aria-label'], 'Page 2 of 3. Show page previews');
  h.cleanup(); assert.equal(h.clean, true);
});

test('segmented reading progress follows the visible page forwards and backwards with one semantic value', () => {
  const one = page(1, 3, rect(0, 600)), two = page(2, 3, rect(602, 1202)), three = page(3, 3, rect(1204, 1804));
  const h = mount([one, two, three]); h.flush();
  const assertProgress = current => {
    const tree = h.render(undefined, { readingMode: true, segmentedProgress: true });
    const progress = control(tree, 'Reading progress');
    assert.equal(progress.props.role, 'progressbar');
    assert.equal(progress.props['aria-valuemin'], 0);
    assert.equal(progress.props['aria-valuemax'], 3);
    assert.equal(progress.props['aria-valuenow'], current);
    assert.equal(progress.props['aria-valuetext'], `Page ${current} of 3`);
    const segments = React.Children.toArray(progress.props.children);
    assert.equal(segments.length, 3);
    assert.ok(segments.every(segment => segment.props['aria-hidden'] === 'true'), 'page sections do not create duplicate accessible progress');
    assert.deepEqual(segments.map(segment => segment.props['data-reached'] !== undefined), [1, 2, 3].map(pageNumber => pageNumber <= current));
    assert.equal(nodes(tree).filter(node => node.props.role === 'progressbar' || node.type === 'progress').length, 1);
    assert.ok(control(tree, `Page ${current} of 3. Show page previews`), 'page counter and progress describe the same visible page');
  };
  assertProgress(1);
  one.bounds = rect(-600, 0); two.bounds = rect(2, 602); three.bounds = rect(604, 1204); h.scroll();
  assertProgress(2);
  one.bounds = rect(0, 600); two.bounds = rect(602, 1202); three.bounds = rect(1204, 1804); h.scroll();
  assertProgress(1);
  assert.equal(h.render('another-project', { readingMode: true, segmentedProgress: true }), null, 'progress cannot leak into the next document before its page is measured');
  h.cleanup(); assert.equal(h.clean, true);
});

test('public/default readers preserve native progress and inactive reading headers show none', () => {
  const h = mount([page(2, 3, rect(0, 600))]); h.flush();
  for (const props of [{ readingMode: true }, { readingMode: true, segmentedProgress: false }]) {
    const tree = h.render(undefined, props);
    const progress = control(tree, 'Reading progress');
    assert.equal(progress.type, 'progress');
    assert.equal(progress.props.value, 2);
    assert.equal(progress.props.max, 3);
    assert.equal(nodes(tree).some(node => node.props.role === 'progressbar'), false);
  }
  assert.equal(control(h.render(undefined, { segmentedProgress: true }), 'Reading progress'), undefined);
  h.surface.pages = [page(1, 1, rect(0, 600))]; h.mutate();
  const progress = control(h.render(undefined, { readingMode: true, segmentedProgress: true }), 'Reading progress');
  assert.equal(progress.props['aria-valuemax'], 1);
  assert.equal(progress.props['aria-valuenow'], 1);
  const sections = React.Children.toArray(progress.props.children);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].props['data-reached'], '');
  h.cleanup();
});

test('the shorter final page becomes current when vertical reading reaches the end', () => {
  const h = mount([page(2, 3, rect(-30, 500)), page(3, 3, rect(502, 750))], { readingEnd: true });
  h.flush();
  assert.equal(h.position.current, 3);
  h.surface.querySelector = () => ({}); h.scroll();
  assert.equal(h.position.current, 2, 'Focused zoom continues using visible page geometry');
  h.cleanup();
});

test('waits for real page metadata and handles a delayed parent ref and asynchronous PDF catalog', () => {
  const h = mount([], { delayedRef: true });
  h.surfaceRef.current = h.surface; h.flush();
  assert.equal(h.render(), null, 'no guessed total while the document is loading');
  h.surface.pages = [page(1, 12, rect(0, 600)), page(2, 12, rect(602, 1202))]; h.mutate();
  assert.equal(h.render().props.children.find(child=>child?.props?.['data-mobile-project-page-count'] !== undefined).props['aria-label'], 'Page 1 of 12. Show page previews');
  assert.equal(h.render('another-project:document'), null, 'old count cannot leak across project/media changes');
  h.surface.pages = []; h.mutate();
  assert.equal(h.render(), null);
  assert.equal(h.observed.size, 1, 'removed page wrappers are no longer observed');
  h.cleanup(); assert.equal(h.clean, true);
});

test('clips to the viewer and viewport and breaks multi-column ties by page number', () => {
  const h = mount([page(3, 6, rect(0, 400, 195, 390)), page(1, 6, rect(0, 400, 0, 195)), page(2, 6, rect(-900, 0))]);
  h.surface.bounds = rect(100, 700); h.flush();
  assert.equal(h.render().props.children.find(child=>child?.props?.['data-mobile-project-page-count'] !== undefined).props['aria-label'], 'Page 1 of 6. Show page previews');
  h.surface.pages[0].bounds = rect(100, 650, 195, 390); h.resize();
  assert.equal(h.render().props.children.find(child=>child?.props?.['data-mobile-project-page-count'] !== undefined).props['aria-label'], 'Page 3 of 6. Show page previews');
  h.cleanup();
});

test('ignores invalid metadata and hidden pages without a fake 1 of 1 fallback', () => {
  const h = mount([page(0, 4, rect(0, 600)), page(5, 4, rect(0, 600)), page(1.5, 4, rect(0, 600)), page(1, 4, rect(0, 0))]);
  h.flush(); assert.equal(h.render(), null); h.cleanup(); assert.equal(h.clean, true);
});

test('tapping toggles page previews; outside click and Escape dismiss; project changes cannot carry the open panel', () => {
  const h = mount([page(1, 3, rect(0, 600))]); h.flush();
  const button = () => h.render().props.children.find(child=>child?.props?.['data-mobile-project-page-count'] !== undefined);
  button().props.onClick();
  assert.equal(button().props['aria-expanded'], true);
  assert.equal(h.render().props.children.find(child=>child?.props?.total).props.total, 3);
  const inside = {}; let restoredFocus = false;
  h.refs[0].current = { contains: target => target === inside };
  h.refs[1].current = { focus: () => { restoredFocus = true; } };
  h.visibility();
  h.documentEvents.get('click')({ target: inside });
  assert.equal(button().props['aria-expanded'], true);
  h.documentEvents.get('click')({ target: {} });
  assert.equal(button().props['aria-expanded'], false);
  button().props.onClick(); h.render(); h.visibility();
  h.documentEvents.get('keydown')({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(button().props['aria-expanded'], false); assert.equal(restoredFocus, true);
  button().props.onClick(); assert.equal(h.render('other-project'), null);
  button().props.onClick(); h.render(); h.visibility();
  assert.equal(h.documentEvents.size, 0);
  h.cleanup();
});

test('image, rendered-document and live-PDF renderers expose their actual page sequence without changing focus handlers', () => {
  const image = readFileSync(new URL('../src/components/media/ImageAttachment.tsx', import.meta.url), 'utf8');
  const document = readFileSync(new URL('../src/components/media/DocumentAttachment.tsx', import.meta.url), 'utf8');
  const pdf = readFileSync(new URL('../src/components/media/PdfImageDocument.tsx', import.meta.url), 'utf8');
  assert.match(image, /data-project-page-number=\{pageNumber\} data-project-page-total=\{pageCount\}/);
  assert.match(document, /data-project-page-number=\{index \+ 1\}[^\n]+data-project-page-total=\{renderedPages.length\}/);
  assert.match(pdf, /data-project-page-number=\{pageNumber\}[\s\S]*?data-project-page-total=\{document.numPages\}/);
  for (const source of [image, document, pdf]) assert.match(source, /onDoubleClick=/);
});

test('reader navigation survives pending paint while page actions get an explicit not-ready position',()=>{
 const one=page(2,3,rect(0,600));one.dataset.projectPageReady='false';const h=mount([one]);h.flush();
 assert.equal(h.position.current,2);assert.equal(h.position.ready,false);assert.ok(h.render());
 one.dataset.projectPageReady='true';h.mutate();assert.equal(h.position.ready,true);assert.equal(h.position.current,2);
 one.dataset.projectPageNumber='3';one.dataset.projectPageReady='false';h.mutate();assert.equal(h.position.current,3);assert.equal(h.position.ready,false);h.cleanup();
});

test('reader density pill preserves limits, draft and commit events, save blocking and page controls', () => {
  const h = mount([page(2, 12, rect(0, 600))]); h.flush();
  const calls = [];
  const density = { value: 1, saving: false, onChange: value => calls.push(['change', value]), onCommit: value => calls.push(['commit', value]) };
  const props = { density, readingMode: true, onSelectPage: value => calls.push(['page', value]) };
  let tree = h.render(undefined, props);
  assert.equal(tree.props['data-page-density-enabled'], true);
  const slider = control(tree, 'Pages per row');
  assert.equal(slider.props.type, 'range');
  assert.equal(slider.props.min, pageLayout.MIN_PAGES_PER_ROW);
  assert.equal(slider.props.max, pageLayout.MAX_PAGES_PER_ROW);
  assert.equal(slider.props.step, 1);
  assert.equal(slider.props.value, 1);
  assert.equal(slider.props['aria-valuetext'], '1 page per row');
  slider.props.onChange({ currentTarget: { value: '3' } });
  assert.deepEqual(calls, [], 'dragging updates only the slider, not the PDF layout');
  tree = h.render(undefined, props);
  assert.equal(control(tree, 'Pages per row').props.value, 3);
  for (const event of ['onPointerUp', 'onKeyUp', 'onBlur']) slider.props[event]({ currentTarget: { value: '3' } });
  assert.deepEqual(calls, [['change', 3], ['commit', 3], ['change', 3], ['commit', 3], ['change', 3], ['commit', 3]]);
  density.value = 3; density.saving = true;
  tree = h.render(undefined, props);
  assert.equal(control(tree, 'Pages per row').props.disabled, true);
  assert.equal(control(tree, 'Pages per row').props['aria-valuetext'], '3 pages per row');
  density.value = 6;
  assert.equal(control(h.render(undefined, props), 'Pages per row').props.value, 6, 'a later pinch/parent density change is not masked by an old slider draft');
  density.value = 3;
  const counter = nodes(tree).find(node => 'data-mobile-project-page-count' in node.props);
  assert.equal(counter.props['aria-label'], 'Page 2 of 12. Show page previews');
  assert.ok(nodes(counter).some(node => node.type === 'span' && node.props.children === '2 / 12'));
  control(tree, 'Previous page').props.onClick();
  control(tree, 'Next page').props.onClick();
  assert.deepEqual(calls.slice(-2), [['page', 1], ['page', 3]]);
  counter.props.onClick(); tree = h.render(undefined, props);
  assert.ok(nodes(tree).find(node => node.props.total === 12 && node.props.current === 2), 'density does not replace page previews');
  h.cleanup();
});

test('reader density is absent without permission, during focused view, and for one real page', () => {
  const h = mount([page(1, 3, rect(0, 600))]); h.flush();
  const density = { value: 1, saving: false, onChange() { assert.fail('Hidden control cannot change density'); }, onCommit() { assert.fail('Hidden control cannot save'); } };
  for (const props of [{}, { density, showControl: false }]) {
    const tree = h.render(undefined, props);
    assert.equal(control(tree, 'Pages per row'), undefined);
    assert.equal(tree.props['data-page-density-enabled'], undefined);
  }
  h.surface.pages = [page(1, 1, rect(0, 600))]; h.mutate();
  const tree = h.render(undefined, { density, readingMode: true });
  assert.equal(control(tree, 'Pages per row'), undefined);
  assert.equal(control(tree, 'Previous page').props.disabled, true);
  assert.equal(control(tree, 'Next page').props.disabled, true);
  assert.equal(h.render('other-project', { density }), null);
  h.cleanup();
});


test('image reading progress updates without adding document next/previous controls', () => {
  const one = page(1, 2, rect(0, 700)), two = page(2, 2, rect(702, 1402));
  const h = mount([one, two]); h.flush();
  const props = { readingMode: false, showProgress: true };
  for (const current of [1, 2, 1]) {
    one.bounds = current === 1 ? rect(0, 700) : rect(-700, 0);
    two.bounds = current === 1 ? rect(702, 1402) : rect(2, 702);
    h.scroll();
    const tree = h.render(undefined, props), progress = control(tree, 'Reading progress');
    assert.equal(progress.type, 'progress'); assert.equal(progress.props.value, current); assert.equal(progress.props.max, 2);
    assert.equal(control(tree, 'Previous page'), undefined); assert.equal(control(tree, 'Next page'), undefined);
    assert.equal(tree.props['data-document-reader-header'], true);
    assert.ok(control(tree, `Page ${current} of 2. Show page previews`));
  }
  h.cleanup();
});
