import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function nodes(tree) {
  if (!React.isValidElement(tree)) return [];
  const result = [tree]; React.Children.forEach(tree.props.children, child => result.push(...nodes(child))); return result;
}

/** Models PDF.js transport-scoped rejected page promises, rather than a retry-friendly getPage stub. */
function cachedDocument(task, name = 'document', count = 5) {
  const promises = new Map(); let pageRequests = 0;
  return { name, numPages: count, get pageRequests() { return pageRequests; },
    getPage(pageNumber) {
      if (task.destroyCount) return Promise.reject(new Error('Transport destroyed'));
      if (!promises.has(pageNumber)) {
        pageRequests++;
        promises.set(pageNumber, name === 'failed-range' ? Promise.reject(new Error('Interrupted range read')) : Promise.resolve({ pageNumber, cleanup() {} }));
      }
      return promises.get(pageNumber);
    },
  };
}

function fixture({ mobile = true, focusedPage = 3 } = {}) {
  const slots = [], effects = [], tasks = [], errors = [], memoryWrites = [], preview = [];
  const timers = new Map(); let nextTimer = 0, cursor = 0, dirty = true, tree, mounted = true;
  const host = { scrollTop: 321, scrollLeft: 89, focus() {} };
  const memory = { focusedPageNumber: focusedPage, scrollTop: 321, scrollLeft: 89 };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const effect = (run, deps) => {
    const index = cursor++, prior = slots[index];
    if (!same(prior?.deps, deps)) { slots[index] = { deps }; effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = run(); }); }
  };
  const react = { ...React,
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { if (!mounted) return; const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useMemo(factory, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect: effect, useLayoutEffect: effect,
  };
  const pdfjs = { getDocument(options) {
    const request = deferred();
    const task = { ...request, options, destroyCount: 0, async destroy() { this.destroyCount++; } };
    tasks.push(task); return task;
  } };
  let props = { projectId: 'project', attachmentId: 'pdf', source: 'report.pdf', memoryKey: 'workspace:pdf', label: 'Report',
    columns: 1, onError: () => errors.push('initial-failure'), onPreviewDocument: doc => preview.push(doc), showMediaInteractions: false,
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/components/media/PdfImageDocument.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, console, URLSearchParams,
    window: { location: { search: '' }, setTimeout(callback, delay) { timers.set(++nextTimer, { callback, delay }); return nextTimer; }, clearTimeout(id) { timers.delete(id); } },
    require(path) {
      if (path === 'react') return react;
      if (path === './PdfPage') return { loadPdfJs: async () => pdfjs, pdfSourceOptions: source => ({ url: source }) };
      if (path === './useSinglePageZoom') return { useSinglePageZoom: () => 2.25 };
      if (path === './useFocusedPageSwipe') return { useFocusedPageSwipe: () => ({ isMobile: mobile, swipeStyle: { transform: 'translate3d(0,0,0)' }, swipeHandlers: {} }) };
      if (path === './useDocumentReadingScroll') return { useDocumentReadingScroll() {} };
      if (path === './viewerMemory') return { readViewerMemory: () => memory, updateViewerMemory: (key, patch) => memoryWrites.push({ key, patch }) };
      if (path === '../../features/projects/pageLayout') return { normalizePagesPerRow: value => value, MAX_PAGES_PER_ROW: 9 };
      return new Proxy({}, { get: (_, property) => property === '__esModule' ? false : `stub-${String(property)}` });
    },
  });
  async function flush() {
    for (let index = 0; index < 35; index++) {
      if (dirty && mounted) {
        cursor = 0; dirty = false; tree = exports.PdfImageDocument(props);
        for (const node of nodes(tree)) if (node.ref) node.ref.current = host;
        while (effects.length) effects.shift()();
      }
      await Promise.resolve();
    }
  }
  return { tasks, errors, memoryWrites, preview, host, timers, flush,
    get tree() { return tree; }, pages() { return nodes(tree).filter(node => node.type?.name === 'PdfImagePage'); },
    resolve(index, name = 'document', count = 5) { const doc = cachedDocument(tasks[index], name, count); tasks[index].resolve(doc); return doc; },
    async render(next) { props = { ...props, ...next }; dirty = true; await flush(); },
    dispose() { mounted = false; for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('mobile cached page failure requires and receives a fresh transport while preserving reader identity', async () => {
  const f = fixture(); await f.flush(); const old = f.resolve(0, 'failed-range'); await f.flush();
  const firstFailure = old.getPage(3); await assert.rejects(firstFailure, /Interrupted range/);
  assert.equal(old.getPage(3), firstFailure, 'The same transport cannot recover its cached rejected page promise');
  await assert.rejects(old.getPage(3), /Interrupted range/); assert.equal(old.pageRequests, 1);
  const page = f.pages()[0], rootKey = f.tree.key, pageParentKey = nodes(f.tree).find(node => node.type === 'li').key;
  const presentedPages = page.props.presentedPages;
  presentedPages.add(3);
  page.props.onRecoverDocument(); await f.flush();
  assert.equal(f.tasks.length, 2); assert.equal(f.pages()[0].props.document, old);
  const fresh = f.resolve(1, 'reconnected'); await f.flush();
  assert.equal(f.pages()[0].props.document, fresh);
  assert.equal(f.pages()[0].props.presentedPages, presentedPages);
  assert.equal(presentedPages.has(3), true, 'A reconnected transport must not replay already presented pages');
  assert.equal((await fresh.getPage(3)).pageNumber, 3);
  assert.equal(f.tree.key, rootKey); assert.equal(nodes(f.tree).find(node => node.type === 'li').key, pageParentKey);
  assert.equal(f.pages()[0].type, page.type); assert.equal(f.pages()[0].props.pageNumber, 3);
  assert.equal(f.pages()[0].props.zoom, 2.25); assert.equal(f.pages()[0].props.focusMemoryKey, 'workspace:pdf:page:3');
  assert.deepEqual([f.host.scrollTop, f.host.scrollLeft], [321, 89]); assert.deepEqual(f.memoryWrites, []);
  f.dispose();
});

test('a different document clears reader-local presentation history without retaining source URLs', async () => {
  const f = fixture(); await f.flush(); f.resolve(0); await f.flush();
  const presentedPages = f.pages()[0].props.presentedPages;
  presentedPages.add(3);
  await f.render({ source: 'different.pdf', attachmentId: 'next-pdf', memoryKey: 'workspace:next-pdf' });
  f.resolve(1); await f.flush();
  assert.equal(f.pages()[0].props.presentedPages, presentedPages);
  assert.equal(presentedPages.size, 0, 'Only the current document owns this bounded page-number history');
  f.dispose();
});

test('several nearby page callbacks coalesce to one pending document reload', async () => {
  const f = fixture({ focusedPage: null }); await f.flush(); f.resolve(0); await f.flush();
  const pages = f.pages(); assert.equal(pages.length, 5);
  for (const page of pages) page.props.onRecoverDocument(); await f.flush();
  assert.equal(f.tasks.length, 2);
  for (const page of pages) page.props.onRecoverDocument(); await f.flush();
  assert.equal(f.tasks.length, 2, 'Busy transport recovery must coalesce calls arriving after React rerenders');
  f.resolve(1); await f.flush(); assert.equal(f.pages().length, 5); f.dispose();
});

test('a failed transport reopen retains the live original document and permits one later recovery', async () => {
  const f = fixture(); await f.flush(); const old = f.resolve(0); await f.flush(); const page = f.pages()[0];
  page.props.onRecoverDocument(); await f.flush();
  assert.equal(f.tasks[0].destroyCount, 0, 'The current transport must stay usable while a replacement is pending');
  f.tasks[1].reject(new Error('Still offline')); await f.flush();
  assert.equal(f.pages()[0].props.document, old); assert.equal(f.pages()[0].props.pageNumber, 3);
  assert.equal(f.pages()[0].props.zoom, 2.25); assert.deepEqual(f.errors, []);
  assert.equal((await old.getPage(4)).pageNumber, 4, 'Failure must not leave the retained reader with a destroyed transport');
  assert.ok(f.tasks[1].destroyCount >= 1, 'Release the failed replacement worker immediately');
  f.pages()[0].props.onRecoverDocument(); await f.flush(); assert.equal(f.tasks.length, 3);
  const fresh = f.resolve(2); await f.flush(); assert.equal(f.pages()[0].props.document, fresh);
  assert.ok(f.tasks[0].destroyCount >= 1, 'Successful adoption releases the obsolete transport'); f.dispose();
});

test('a timed-out replacement releases only its pending transport and permits a later bounded attempt', async () => {
  const f = fixture(); await f.flush(); const old = f.resolve(0); await f.flush();
  f.pages()[0].props.onRecoverDocument(); await f.flush();
  const timeout = [...f.timers].find(([, timer]) => timer.delay === 30_000);
  assert.ok(timeout); f.timers.delete(timeout[0]); timeout[1].callback(); await f.flush();
  assert.equal(f.tasks.length, 2, 'Timeout must not automatically loop into another document request');
  assert.equal(f.tasks[0].destroyCount, 0); assert.ok(f.tasks[1].destroyCount >= 1);
  assert.equal(f.pages()[0].props.document, old); assert.deepEqual(f.errors, []);
  f.resolve(1, 'late-timeout-result'); await f.flush(); assert.equal(f.pages()[0].props.document, old);
  f.pages()[0].props.onRecoverDocument(); await f.flush(); assert.equal(f.tasks.length, 3);
  f.resolve(2); await f.flush(); f.dispose();
});

test('stale source results cannot replace the next document and both pending and active workers are cleaned up', async () => {
  const f = fixture(); await f.flush(); f.resolve(0); await f.flush();
  f.pages()[0].props.onRecoverDocument(); await f.flush();
  await f.render({ source: 'different.pdf', attachmentId: 'next-pdf', memoryKey: 'workspace:next-pdf' });
  assert.equal(f.tasks.length, 3); assert.equal(f.tasks[2].options.url, 'different.pdf');
  assert.ok(f.tasks[0].destroyCount >= 1); assert.ok(f.tasks[1].destroyCount >= 1);
  f.resolve(1, 'stale'); await f.flush(); assert.equal(f.pages().length, 0);
  const next = f.resolve(2, 'next'); await f.flush(); assert.equal(f.pages()[0].props.document, next);
  f.dispose(); assert.ok(f.tasks[2].destroyCount >= 1);
});

test('unmount cancels an in-flight replacement and late completion never publishes its document', async () => {
  const f = fixture(); await f.flush(); const old = f.resolve(0); await f.flush();
  f.pages()[0].props.onRecoverDocument(); await f.flush(); const previewCount = f.preview.length;
  f.dispose(); assert.ok(f.tasks[0].destroyCount >= 1); assert.ok(f.tasks[1].destroyCount >= 1);
  f.resolve(1, 'late'); await f.flush();
  assert.equal(f.preview.filter(Boolean).at(-1), old); assert.ok(f.preview.length <= previewCount + 1);
});

test('initial load failure still reaches the existing fallback and WEB receives no document-recovery callback', async () => {
  const failed = fixture(); await failed.flush(); failed.tasks[0].reject(new Error('Initial failure')); await failed.flush();
  assert.deepEqual(failed.errors, ['initial-failure']); failed.dispose();
  const web = fixture({ mobile: false }); await web.flush(); web.resolve(0); await web.flush();
  assert.equal(web.pages()[0].props.onRecoverDocument, undefined); assert.equal(web.pages()[0].props.retainCanvasWhileLoading, false);
  assert.equal(web.tasks.length, 1); web.dispose();
});

/** A tiny valid two-page PDF, created entirely in memory for the installed PDF.js API. */
function tinyPdf() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 2 /Kids [3 0 R 5 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 6 0 R >>', '<< /Length 0 >>\nstream\n\nendstream'];
  let source = '%PDF-1.7\n'; const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(source));
}

test('installed PDF.js caches a rejected GetPage promise until a fresh document transport is created', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const initial = pdfjs.getDocument({ data: tinyPdf(), verbosity: 0 }); let fresh;
  try {
    const doc = await initial.promise;
    const handler = doc._transport.messageHandler, send = handler.sendWithPromise.bind(handler); let reads = 0;
    handler.sendWithPromise = (name, data, ...rest) => {
      if (name === 'GetPage' && data.pageIndex === 1) { reads++; return Promise.reject(new Error('Synthetic interrupted range')); }
      return send(name, data, ...rest);
    };
    const first = doc.getPage(2); await assert.rejects(first, /Synthetic interrupted range/);
    handler.sendWithPromise = send;
    const cached = doc.getPage(2); assert.equal(cached, first); await assert.rejects(cached, /Synthetic interrupted range/);
    assert.equal(reads, 1);
    fresh = pdfjs.getDocument({ data: tinyPdf(), verbosity: 0 });
    assert.equal((await (await fresh.promise).getPage(2)).pageNumber, 2);
  } finally { await initial.destroy(); await fresh?.destroy(); }
});
