import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const nodes = tree => React.isValidElement(tree)
  ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
  : React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(text).join('') : '';

/** Component/effect runner keeps a committed view separate from effect settlement. */
function componentHarness(file, name, initialProps, dependencies = {}, globals = {}, suffix = '') {
  const slots = [];
  let cursor = 0, props = initialProps, dirty = true, mounted = true, tree, effects = [], writesAfterUnmount = 0;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const effect = (run, deps) => {
    const index = cursor++, prior = slots[index];
    if (!same(prior?.deps, deps)) {
      slots[index] = { deps };
      effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = run(); });
    }
  };
  const react = { ...React,
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        if (!mounted) { writesAfterUnmount++; return; }
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useMemo(factory, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect: effect, useLayoutEffect: effect,
  };
  const exports = {};
  const output = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
    ...(globals.__testImport ? { transformers: { before: [context => root => {
      const visit = node => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? context.factory.createCallExpression(context.factory.createIdentifier('__testImport'), undefined, node.arguments)
        : ts.visitEachChild(node, visit, context);
      return ts.visitNode(root, visit);
    }] } } : {}),
  }).outputText;
  vm.runInNewContext(output + suffix, { exports, URL, URLSearchParams, Error, console, ...globals,
    require(path) {
      if (path === 'react') return react;
      assert.ok(Object.hasOwn(dependencies, path), `Unexpected component dependency ${path}`);
      return dependencies[path];
    },
  });
  const focusCalls = [];
  const host = { isConnected: true, getBoundingClientRect: () => ({ width: 260, height: 260 }), contains: () => false,
    focus(options) { focusCalls.push(options); } };
  function render(next = props) {
    props = next; cursor = 0; dirty = false; effects = []; tree = exports[name](props);
    for (const node of nodes(tree)) if (node.ref && typeof node.ref === 'object') node.ref.current = node.type === 'canvas'
      ? { width: 0, height: 0 } : host;
    return tree;
  }
  function commit() { for (const run of effects.splice(0)) run(); }
  return {
    render, commit, exports, focusCalls,
    get tree() { return tree; }, get writesAfterUnmount() { return writesAfterUnmount; },
    async flush() {
      for (let index = 0; index < 35; index++) { if (dirty && mounted) { render(); commit(); } await Promise.resolve(); }
      return tree;
    },
    dispose() { mounted = false; for (const slot of slots) slot?.cleanup?.(); host.isConnected = false; },
  };
}

function pdfFixture({ pageNumber = 3, strictPageNumber, count = 2, usePageAspectRatio = false } = {}) {
  const requests = [], failed = [], counts = [], tasks = [];
  const page = { getViewport: ({ scale }) => ({ width: 600 * scale, height: 900 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel() {} }) };
  const document = { numPages: count, async getPage(number) { requests.push(number); return page; } };
  const pdfjs = { getDocument() {
    const task = { promise: Promise.resolve(document), destroyed: 0, async destroy() { this.destroyed++; } };
    tasks.push(task); return task;
  } };
  const h = componentHarness('src/components/media/PdfPage.tsx', 'PdfPage', {
    source: 'https://storage.test/permission-checked.pdf', label: 'Shared page', pageNumber, usePageAspectRatio,
    ...(strictPageNumber === undefined ? {} : { strictPageNumber }),
    onRenderFailure: () => failed.push('failed'), onPageCountChange: value => counts.push(value),
  }, {
    'lucide-react': { FileTextIcon: 'file-icon' }, 'pdfjs-dist/build/pdf.worker.min.mjs?url': 'worker-url',
    './pdf-page.css': {}, '../../features/performance/rum': { markRumPdf() {}, rumViewToken: () => 1 },
  }, { __pdfjs: pdfjs, window: { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout } },
  '\nloadPdfJs = async () => __pdfjs;');
  return Object.assign(h, { requests, failed, counts, tasks });
}

const target = (projectId = 'project', pageNumber = 6) => ({
  to: `/share/creator/c/portal/${projectId}?media=pdf%2Fsource&page=${pageNumber}#page-${pageNumber}`,
  projectId, categoryId: 'portal', profileId: 'creator', handle: null,
  attachmentId: 'pdf/source', pageNumber,
});
const preview = (name = 'Current project', source = 'https://storage.test/current-page.png') => ({
  title: name, pageLabel: 'Page 6', source, kind: 'image', pageNumber: 6,
});

function previewFixture({ observe = false, holdChunks = false, standalonePage = false } = {}) {
  const requests = [], observers = [], chunks = [];
  let auth = { user: { id: 'account-a' }, viewerProfileId: 'viewer-a', loginSession: {} };
  let services = { projects: { name: 'current projects' }, profiles: { name: 'current profiles' } };
  let props = { target: target(), standalonePage };
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; this.disconnected = false; observers.push(this); }
    observe(host) { this.host = host; }
    disconnect() { this.disconnected = true; }
    enter() { this.callback([{ isIntersecting: true }]); }
  }
  const h = componentHarness('src/components/messages/SharedContentMessagePreview.tsx', 'SharedContentMessagePreview', props, {
    'react-router-dom': { Link: 'internal-link' },
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../contexts/ServicesContext': { useServices: () => services },
    '../../features/media/coverThumbnailSources': { coverThumbnailSources: thumbnail => thumbnail ? { src: thumbnail.src, srcSet: thumbnail.srcSet } : null },
    '../../features/messages/sharedContentPreview': { resolveSharedContentPreview(destination, currentServices) {
      const pending = deferred(); requests.push({ ...pending, target: destination, services: currentServices }); return pending.promise;
    } },
    './shared-content-message-preview.css': {},
  }, { ...(observe ? { IntersectionObserver: Observer } : {}), __testImport(path) {
    assert.equal(path, '../media/PdfPage');
    const pending = deferred(); chunks.push({ ...pending, path });
    if (!holdChunks) pending.resolve({ PdfPage: 'pdf-page' });
    return pending.promise;
  } });
  return Object.assign(h, { requests, observers, chunks,
    update(change = {}) {
      if (change.auth) auth = change.auth;
      if (change.services) services = change.services;
      if (change.target) props = { ...props, target: change.target };
      return h.render(props);
    },
    getAuth: () => auth, getServices: () => services,
    retry() {
      const button = nodes(h.tree).find(node => node.type === 'button' && text(node) === 'Retry preview');
      assert.ok(button, 'A failed preview must expose Retry preview'); button.props.onClick();
    },
  });
}

test('shared artwork loads only near the viewport and preserves one exact in-app destination and frame', async () => {
  const h = previewFixture({ observe: true, standalonePage: true }); await h.flush();
  assert.equal(h.requests.length, 0, 'Off-screen history must not request project metadata');
  const frame = nodes(h.tree).find(node => node.props.className === 'shared-content-message-preview-frame');
  const loadingLink = nodes(h.tree).find(node => node.type === 'internal-link');
  assert.equal(loadingLink.props.to, target().to);
  assert.ok(text(frame).includes('Loading preview'));
  assert.equal(h.tree.props['data-shared-page-only'], undefined);
  h.observers[0].enter(); await h.flush(); assert.equal(h.requests.length, 1);
  assert.equal(h.observers[0].disconnected, true);
  h.requests[0].resolve({ ...preview(), aspectRatio: 0.75 }); await h.flush();
  const readyFrame = nodes(h.tree).find(node => node.props.className === frame.props.className);
  assert.equal(readyFrame.type, frame.type); assert.equal(readyFrame.key, frame.key);
  assert.equal(h.tree.props['data-shared-page-only'], '');
  assert.equal(readyFrame.props['data-shared-page-image'], '');
  assert.equal(readyFrame.props.style['--shared-page-ratio'], 0.75);
  assert.equal(text(h.tree), '');
  const image = nodes(h.tree).find(node => node.type === 'img');
  assert.equal(image.props.src, preview().source); assert.equal(image.props.alt, 'Current project · Page 6');
  assert.equal(image.props.referrerPolicy, 'no-referrer');
  const readyLink = nodes(h.tree).find(node => node.type === 'internal-link');
  assert.equal(readyLink.props.to, target().to);
  assert.equal(readyLink.props['aria-label'], 'Open Current project · Page 6');
  const css = readFileSync(new URL('../src/components/messages/shared-content-message-preview.css', import.meta.url), 'utf8');
  assert.match(css, /\.shared-content-message-preview-frame\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(css, /\.shared-content-message-preview-frame\s*>\s*img\s*\{[^}]*object-fit:\s*contain/);
  assert.match(css, /\[data-shared-page-image\]\s*>\s*img\s*\{[^}]*height:\s*auto[^}]*aspect-ratio:\s*auto/);
  h.dispose(); assert.equal(h.observers[0].disconnected, true);
});

for (const [label, mutate] of [
  ['account', (h, index) => ({ auth: { ...h.getAuth(), user: { id: `account-${index}` }, viewerProfileId: `viewer-${index}` } })],
  ['login session', h => ({ auth: { ...h.getAuth(), loginSession: {} } })],
  ['profile', (h, index) => ({ auth: { ...h.getAuth(), viewerProfileId: `replacement-profile-${index}` } })],
  ['services', () => ({ services: { projects: { name: 'replacement projects' }, profiles: {} } })],
  ['message destination', (h, index) => ({ target: target(`another-project-${index}`, index) })],
]) {
  test(`a changed ${label} hides old artwork before effects and rejects stale success and failure`, async () => {
    for (const outcome of ['resolve', 'reject']) {
      const h = previewFixture(); await h.flush();
      h.requests[0].resolve(preview('Old project', 'https://storage.test/old.png')); await h.flush();
      const oldImage = nodes(h.tree).find(node => node.type === 'img'); assert.ok(oldImage);
      const next = h.update(mutate(h, 1));
      assert.equal(nodes(next).some(node => node.type === 'img'), false, 'Prior recipient artwork must disappear in the scope-changing render');
      h.commit(); await h.flush(); assert.equal(h.requests.length, 2);
      h.update(mutate(h, 2)); h.commit(); await h.flush(); assert.equal(h.requests.length, 3);
      const latest = h.requests[2];
      h.requests[1][outcome](outcome === 'resolve' ? preview('Obsolete response', 'https://storage.test/obsolete.png') : new Error('obsolete failure'));
      await h.flush();
      assert.equal(text(h.tree).includes('Obsolete response'), false);
      assert.equal(text(h.tree).includes('Preview unavailable'), false, 'A superseded failure must not replace the latest loading state');
      oldImage.props.onError(); await h.flush();
      assert.equal(text(h.tree).includes('Preview unavailable'), false, 'An old image error must not mark a replacement request as failed');
      latest.resolve(preview('Replacement project', 'https://storage.test/replacement.png')); await h.flush();
      assert.equal(nodes(h.tree).find(node => node.type === 'img')?.props.src, 'https://storage.test/replacement.png');
      h.dispose();
    }
  });
}

test('late resolver success and rejection after unmount cannot update preview state', async () => {
  for (const outcome of ['resolve', 'reject']) {
    const h = previewFixture(); await h.flush(); h.dispose();
    h.requests[0][outcome](outcome === 'resolve' ? preview() : new Error('late read failure'));
    await h.flush(); assert.equal(h.writesAfterUnmount, 0);
  }
});

test('failed metadata and image loads expose Retry and make one fresh read without changing the destination', async () => {
  const h = previewFixture({ standalonePage: true }); await h.flush();
  h.requests[0].reject(new Error('Private storage backend details must not reach the message')); await h.flush();
  assert.ok(text(h.tree).includes('Preview unavailable'));
  assert.equal(text(h.tree).includes('Private storage'), false);
  assert.equal(nodes(h.tree).some(node => node.type === 'img'), false);
  h.retry(); h.retry(); await h.flush();
  assert.equal(h.focusCalls.length, 2);
  assert.ok(h.focusCalls.every(options => options?.preventScroll === true), 'Retry hands keyboard focus to its stable link without scrolling the thread');
  assert.equal(h.requests.length, 2, 'Repeated taps before a render coalesce into one fresh read');
  assert.ok(text(h.tree).includes('Loading preview')); assert.equal(text(h.tree).includes('Retry preview'), false);
  h.requests[1].resolve(preview()); await h.flush();
  const image = nodes(h.tree).find(node => node.type === 'img'); image.props.onError(); await h.flush();
  assert.ok(text(h.tree).includes('Preview unavailable'));
  assert.equal(h.tree.props['data-shared-page-only'], undefined);
  h.retry(); await h.flush();
  assert.equal(h.requests.length, 3); assert.equal(h.requests[2].target.to, target().to);
  h.requests[2].resolve(preview('Refreshed title', 'https://storage.test/refreshed.png')); await h.flush();
  assert.equal(nodes(h.tree).find(node => node.type === 'img')?.props.src, 'https://storage.test/refreshed.png');
  assert.equal(nodes(h.tree).find(node => node.type === 'internal-link').props.to, target().to); h.dispose();
});

test('standalone PDF fallback opens the exact page with no visible caption and keeps Retry on failure', async () => {
  const h = previewFixture({ standalonePage: true }); await h.flush();
  h.requests[0].resolve({ ...preview(), kind: 'document', source: 'https://storage.test/exact.pdf', pageNumber: 6 }); await h.flush();
  const page = nodes(h.tree).find(node => node.props.strictPageNumber === true);
  assert.ok(page); assert.equal(page.props.pageNumber, 6); assert.equal(page.props.source, 'https://storage.test/exact.pdf');
  assert.equal(page.props.usePageAspectRatio, true);
  assert.equal(h.tree.props['data-shared-page-only'], '');
  assert.equal(text(h.tree).includes('Current project'), false);
  assert.equal(nodes(h.tree).find(node => node.type === 'internal-link').props['aria-label'], 'Open Current project · Page 6');
  page.props.onRenderFailure(); await h.flush();
  assert.ok(text(h.tree).includes('Preview unavailable')); assert.ok(text(h.tree).includes('Retry preview')); h.dispose();
});

test('a failed PDF renderer download stays inside its preview and Retry attempts a fresh import', async () => {
  const h = previewFixture({ holdChunks: true }); await h.flush();
  const document = { ...preview(), kind: 'document', source: 'https://storage.test/exact.pdf', pageNumber: 6 };
  h.requests[0].resolve(document); await h.flush();
  assert.equal(h.chunks.length, 1); assert.ok(text(h.tree).includes('Loading preview'));
  h.chunks[0].reject(new Error('Private deployment chunk path must stay hidden')); await h.flush();
  assert.ok(text(h.tree).includes('Preview unavailable'));
  assert.equal(text(h.tree).includes('Private deployment'), false);
  assert.equal(nodes(h.tree).find(node => node.type === 'internal-link').props.to, target().to);
  h.retry(); await h.flush(); assert.equal(h.requests.length, 2);
  assert.equal(h.focusCalls.at(-1)?.preventScroll, true);
  h.requests[1].resolve(document); await h.flush(); assert.equal(h.chunks.length, 2);
  h.chunks[1].resolve({ PdfPage: 'recovered-pdf-page' }); await h.flush();
  const page = nodes(h.tree).find(node => node.type === 'recovered-pdf-page');
  assert.ok(page); assert.equal(page.props.pageNumber, 6); assert.equal(page.props.strictPageNumber, true);
  assert.equal(text(h.tree).includes('Preview unavailable'), false); h.dispose();
});

test('obsolete PDF renderer download success and rejection cannot replace current-recipient artwork', async () => {
  for (const outcome of ['resolve', 'reject']) {
    const h = previewFixture({ holdChunks: true }); await h.flush();
    h.requests[0].resolve({ ...preview(), kind: 'document', source: 'https://storage.test/previous.pdf' }); await h.flush();
    assert.equal(h.chunks.length, 1);
    h.update({ auth: { ...h.getAuth(), loginSession: {} }, target: target('replacement-project', 2) }); h.commit(); await h.flush();
    h.requests[1].resolve(preview('New recipient artwork', 'https://storage.test/replacement.png')); await h.flush();
    h.chunks[0][outcome](outcome === 'resolve' ? { PdfPage: 'obsolete-pdf-page' } : new Error('obsolete chunk failure'));
    await h.flush();
    assert.equal(nodes(h.tree).find(node => node.type === 'img')?.props.src, 'https://storage.test/replacement.png');
    assert.equal(nodes(h.tree).some(node => node.type === 'obsolete-pdf-page'), false);
    assert.equal(text(h.tree).includes('Preview unavailable'), false); h.dispose();
  }
});

test('an unmounted preview ignores a pending PDF renderer download and does not import after stale metadata', async () => {
  for (const outcome of ['resolve', 'reject']) {
    const h = previewFixture({ holdChunks: true }); await h.flush();
    h.requests[0].resolve({ ...preview(), kind: 'document' }); await h.flush(); h.dispose();
    h.chunks[0][outcome](outcome === 'resolve' ? { PdfPage: 'unmounted-pdf-page' } : new Error('late download failure'));
    await h.flush(); assert.equal(h.writesAfterUnmount, 0);
  }
  const h = previewFixture({ holdChunks: true }); await h.flush(); h.dispose();
  h.requests[0].resolve({ ...preview(), kind: 'document' }); await h.flush();
  assert.equal(h.chunks.length, 0, 'Unnecessary renderer import must not start after stale metadata');
  assert.equal(h.writesAfterUnmount, 0);
});

test('WEB MessageBody default keeps canonical text links without constructing or resolving previews', async () => {
  let parses = 0;
  const h = componentHarness('src/components/messages/MessageBody.tsx', 'MessageBody', {
    body: 'Page 6\nhttps://portalinknetworks.com/share/creator/c/portal/project?media=pdf%2Fsource&page=6',
  }, {
    'react-router-dom': { Link: 'internal-link' },
    '../../features/citations/publicOrigin': { PUBLIC_ORIGIN: 'https://portalinknetworks.com' },
    '../../features/sharing/shareModel': { isPublicSharePath: path => path.startsWith('/share/') },
    '../../features/messages/sharedContentPreview': { parseSharedContentLink() { parses++; throw new Error('WEB must not resolve a preview'); } },
    './SharedContentMessagePreview': { SharedContentMessagePreview: 'metadata-preview' },
  }, { window: { location: { origin: 'https://portalinknetworks.com' } } });
  await h.flush(); assert.equal(parses, 0);
  assert.equal(nodes(h.tree).some(node => node.type === 'metadata-preview'), false);
  assert.equal(nodes(h.tree).find(node => node.type === 'internal-link')?.props.to, target().to.split('#')[0]);
  assert.ok(text(h.tree).includes('https://portalinknetworks.com/share/creator/c/portal/project')); h.dispose();
});

test('MOBILE only treats a standalone page share or its generated label as an image-only message', async () => {
  const origin = 'https://portalinknetworks.com';
  const { isGeneratedPageShareLabel } = sourceModule('src/features/messages/sharedContentPreview.ts', {
    '../projects/projectPortals': sourceModule('src/features/projects/projectPortals.ts'),
    '../citations/publicOrigin': { PUBLIC_ORIGIN: origin },
    '../sharing/shareModel': sourceModule('src/features/sharing/shareModel.ts'),
  });
  const pageTarget = target();
  const pageUrl = origin + pageTarget.to;
  const projectUrl = pageUrl.split('?')[0];
  const h = componentHarness('src/components/messages/MessageBody.tsx', 'MessageBody', {
    body: pageUrl, previewLinks: true,
  }, {
    'react-router-dom': { Link: 'internal-link' },
    '../../features/citations/publicOrigin': { PUBLIC_ORIGIN: origin },
    '../../features/sharing/shareModel': { isPublicSharePath: path => path.startsWith('/share/') },
    '../../features/messages/sharedContentPreview': { isGeneratedPageShareLabel, parseSharedContentLink: url => url === pageUrl ? pageTarget : { to: new URL(url).pathname } },
    './SharedContentMessagePreview': { SharedContentMessagePreview: 'metadata-preview' },
  }, { window: { location: { origin } } });
  for (const body of [pageUrl, `Page 6\n${pageUrl}`]) {
    const tree = h.render({ body, previewLinks: true });
    assert.equal(nodes(tree).find(node => node.type === 'metadata-preview')?.props.standalonePage, true);
    assert.equal(text(tree), '');
  }
  for (const body of [`Page 6 ${pageUrl}`, `Page 7\n${pageUrl}`, `Check this out\n${pageUrl}`, `${pageUrl}\nWhat do you think?`, `${pageUrl} ${pageUrl}`, projectUrl]) {
    const tree = h.render({ body, previewLinks: true });
    const previews = nodes(tree).filter(node => node.type === 'metadata-preview');
    assert.ok(previews.length > 0);
    assert.ok(previews.every(node => !node.props.standalonePage));
    assert.equal(text(tree), body.replaceAll(pageUrl, '').replaceAll(projectUrl, ''));
  }
  h.dispose();
});

test('strict shared PDF page rendering refuses unavailable page instead of showing another page', async () => {
  const h = pdfFixture({ pageNumber: 6, strictPageNumber: true, count: 2 });
  await h.flush();
  assert.deepEqual(h.requests, [], 'Out-of-range page must fail before document.getPage');
  assert.equal(h.failed.length, 1);
  assert.ok(text(h.tree).includes('PDF preview unavailable'));
  h.dispose(); assert.equal(h.tasks[0].destroyed, 1);
});

test('strict shared PDF preview uses the exact page and its intrinsic layout while legacy covers still clamp', async () => {
  const strict = pdfFixture({ pageNumber: 2, strictPageNumber: true, count: 5, usePageAspectRatio: true });
  await strict.flush(); assert.deepEqual(strict.requests, [2]); assert.deepEqual(strict.failed, []);
  assert.equal(strict.tree.props.style.aspectRatio, '600 / 900');
  assert.equal(strict.tree.props.style.height, 'auto');
  strict.dispose();
  const legacy = pdfFixture({ pageNumber: 6, count: 2 });
  await legacy.flush(); assert.deepEqual(legacy.requests, [2]); assert.deepEqual(legacy.failed, []);
  assert.equal(legacy.tree.props.style, undefined);
  legacy.dispose();
});

test('strict shared PDF preview rejects nonpositive, fractional and nonfinite page values', async () => {
  for (const pageNumber of [0, -1, 1.5, NaN, Infinity]) {
    const h = pdfFixture({ pageNumber, strictPageNumber: true, count: 3 });
    await h.flush(); assert.deepEqual(h.requests, [], `Invalid page ${pageNumber} must not render`);
    assert.equal(h.failed.length, 1); h.dispose();
  }
});
