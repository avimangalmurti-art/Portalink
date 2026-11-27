import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function nodes(tree) { const result = []; if (!React.isValidElement(tree)) return result; result.push(tree); React.Children.forEach(tree.props.children, child => result.push(...nodes(child))); return result; }

/** Execute the real warmup helper; only its dynamic module-import boundary is controlled. */
function warmer(trace = []) {
  const requests = [], exports = {};
  const file = new URL('../src/components/media/warmDocumentRenderer.ts', import.meta.url);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    transformers: { before: [context => root => {
      const visit = node => {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          assert.equal(node.arguments[0].text, './DocumentAttachment');
          return context.factory.createCallExpression(context.factory.createIdentifier('importDocumentRenderer'), undefined, []);
        }
        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(root, visit);
    }] },
  }).outputText;
  vm.runInNewContext(code, { exports, importDocumentRenderer() { trace.push('import-request'); const request = deferred(); requests.push(request); return request.promise; },
    require(name) { assert.fail(`Unexpected eager dependency: ${name}`); },
    fetch() { assert.fail('Warming code must not read a document or backend'); },
  });
  return { requests, warm: exports.warmProjectDocumentRenderer };
}

const project = { id: 'project', categoryId: 'portal', title: 'Report', summary: 'Project summary', cover: '/cover.webp', coverAlt: 'Report cover' };
const creator = { id: 'creator', name: 'Creator', avatar: '/avatar.webp' };
const clickEvent = () => ({ defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } });

/** Render the actual card with the actual touch/disabled preview gate and controlled hooks. */
function fixture({ presentation = 'mobile', project: nextProject = {}, ...props } = {}) {
  const trace = [], warm = warmer(trace), slots = [], effects = [];
  let cursor = 0, tree, dirty = true, options = { project: { ...project, ...nextProject }, creator,
    onOpen: () => trace.push('open'), showCreator: false, showEngagementMetrics: false, ...props };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = { ...React,
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useEffect(run, deps) { const index = cursor++, prior = slots[index]; if (!same(prior?.deps, deps)) { slots[index] = { deps }; effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = run(); }); } },
    lazy() { return () => null; },
  };
  const host = { getBoundingClientRect: () => ({ width: 300 }), contains: () => false };
  const preview = sourceModule('src/hooks/useContentPreview.ts', { react }, { document: { addEventListener() {}, removeEventListener() {} } });
  const { ProjectPreviewCard } = sourceModule('src/components/profile/ProjectPreviewCard.tsx', {
    react, 'react-router-dom': { Link: 'router-link' }, 'lucide-react': { MoreHorizontalIcon: 'dots' },
    './ProjectPageBrowsingContext': { useInlineProjectPages: () => false },
    '../../features/profile/cataloguePagePosition': { getCataloguePagePosition: () => undefined, rememberCataloguePagePosition() {} },
    '../../features/profile/cataloguePageNavigation': { withCataloguePageTarget: href => href },
    '../../features/media/videoPlayback': { videoSources: () => [] },
    '../../features/profile/useInlineProjectContent': { useInlineProjectContent: ({ project }) => ({ project, metadataComplete: false }) },
    './inlineProjectPageModel': { normalizeInlineProjectPosition: (_, position) => position, inlinePositionMatches: (left, right) => left === right },
    '../media/MobileProjectPopup': { MobileProjectPopup: 'project-popup' },
    '../../presentation/mobile/useMobileProjectContext': { useMobileProjectContext: () => ({}) },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../../hooks/useContentPreview': preview,
    '../../utils/projectPresentation': { getProjectAspectRatio: () => 0.75, getProjectCoverPreview: () => undefined },
    '../../utils/projectContinuity': { projectContinuityStyle: () => ({}), getProjectContinuityArtwork: () => undefined, beginProjectContinuity() {} },
    './CreatorAvatar': { CreatorAvatar: 'creator-avatar' },
    '../media/ProjectCover': { ProjectCover: 'project-cover' }, './ProjectHoverDetails': { ProjectHoverDetails: 'hover-details' },
    '../ui/InterfaceIcon': { InterfaceIcon: 'interface-icon' }, '../media/warmDocumentRenderer': { warmProjectDocumentRenderer: warm.warm },
    './project-preview-actions.css': {},
  });
  function render(changes = {}) {
    options = { ...options, ...changes }; dirty = true;
    for (let count = 0; dirty && count < 10; count++) {
      cursor = 0; dirty = false; tree = ProjectPreviewCard(options); tree.ref.current = host;
      while (effects.length) effects.shift()();
    }
    return tree;
  }
  const artwork = () => nodes(tree).find(node => node.props['data-preview-open'] !== undefined);
  render();
  return { trace, requests: warm.requests, render, get tree() { return tree; }, artwork,
    click() { const event = clickEvent(); artwork().props.onClick(event); return event; },
    tap({ moved = false, cancelled = false } = {}) {
      tree.props.onPointerDownCapture({ pointerType: 'touch', clientX: 100, clientY: 100 });
      if (moved) tree.props.onPointerMoveCapture({ pointerType: 'touch', clientX: 120, clientY: 125 });
      if (cancelled) tree.props.onPointerCancel(); else tree.props.onPointerUpCapture();
      const event = clickEvent(); artwork().props.onClick(event); return event;
    },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('accepted MOBILE PDF artwork starts code warming synchronously before routing', () => {
  const f = fixture({ project: { coverKind: 'document' } });
  assert.deepEqual(f.trace, [], 'Rendering the feed must not warm document code');
  const event = f.tap(); assert.deepEqual(f.trace, ['import-request', 'open']);
  assert.equal(event.defaultPrevented, false); assert.equal(event.stopped, false);
  assert.equal(f.requests.length, 1); f.dispose();
});

test('a PDF attachment warms even when its cover is a bitmap; image/video projects remain untouched', () => {
  const attachment = { kind: 'document' };
  Object.defineProperty(attachment, 'sourceUrl', { get() { assert.fail('Warming must not read document source URLs'); } });
  const pdf = fixture({ project: { attachments: [{ kind: 'image' }, attachment] } }); pdf.tap();
  assert.deepEqual(pdf.trace, ['import-request', 'open']); pdf.dispose();
  for (const nextProject of [{}, { coverKind: 'video', attachments: [{ kind: 'video' }] }, { attachments: [{ kind: 'image' }, { kind: 'audio' }] }]) {
    const f = fixture({ project: nextProject }); f.tap(); assert.deepEqual(f.trace, ['open']); assert.equal(f.requests.length, 0); f.dispose();
  }
});

test('WEB keeps its established first-touch preview and opening behavior without document warming', () => {
  const f = fixture({ presentation: 'web', project: { coverKind: 'document' } });
  const first = f.tap(); assert.equal(first.defaultPrevented, true); assert.deepEqual(f.trace, []);
  f.render(); const second = f.tap(); assert.equal(second.defaultPrevented, false); assert.deepEqual(f.trace, ['open']);
  assert.equal(f.requests.length, 0); f.dispose();
  const mouse = fixture({ presentation: 'web', project: { coverKind: 'document' } }); mouse.click();
  assert.deepEqual(mouse.trace, ['open']); assert.equal(mouse.requests.length, 0); mouse.dispose();
});

test('disabled cards and cancelled/scrolling touch gestures never warm or open the renderer', () => {
  const disabled = fixture({ disabled: true, project: { coverKind: 'document' } }); disabled.tap();
  assert.deepEqual(disabled.trace, []); disabled.dispose();
  for (const gesture of [{ moved: true }, { cancelled: true }]) {
    const f = fixture({ project: { coverKind: 'document' } }); const event = f.tap(gesture);
    assert.equal(event.defaultPrevented, true); assert.equal(event.stopped, true); assert.deepEqual(f.trace, []);
    f.tap(); assert.deepEqual(f.trace, ['import-request', 'open'], 'The next deliberate tap still opens normally'); f.dispose();
  }
});

test('hover, focus, description and details controls do not warm document renderer code', () => {
  let creatorWarms = 0;
  const f = fixture({ project: { coverKind: 'document' }, onWarmCreator: () => creatorWarms++ });
  f.artwork().props.onPointerEnter(); f.artwork().props.onFocus();
  assert.equal(creatorWarms, 2, 'Existing creator warming is preserved'); assert.deepEqual(f.trace, []);
  const description = nodes(f.tree).find(node => node.type === 'hover-details'); const event = clickEvent(); description.props.onOpen(event);
  assert.equal(event.defaultPrevented, true); assert.equal(event.stopped, true);
  f.render(); nodes(f.tree).find(node => node.props.className?.startsWith('mobile-preview-details')).props.onClick(clickEvent());
  assert.deepEqual(f.trace, []); assert.equal(f.requests.length, 0); f.dispose();
});

test('mobile keyboard activation keeps the accepted-open warmup and does not await its unresolved import', async () => {
  const f = fixture({ project: { coverKind: 'document' } });
  f.tree.props.onKeyDown({ key: 'Enter' }); f.click(); assert.deepEqual(f.trace, ['import-request', 'open']);
  await Promise.resolve(); assert.deepEqual(f.trace, ['import-request', 'open'], 'Navigation is synchronous while code remains pending');
  f.requests[0].resolve({ DocumentAttachment: () => null }); await Promise.resolve();
  assert.deepEqual(f.trace, ['import-request', 'open']); f.dispose();
});

test('failed warming is swallowed without blocking navigation or creating a second navigation action', async () => {
  const f = fixture({ project: { coverKind: 'document' } }); f.tap();
  assert.deepEqual(f.trace, ['import-request', 'open']); f.requests[0].reject(new Error('Disconnected code fetch'));
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(f.trace, ['import-request', 'open']); f.dispose();
});

test('Link cards preserve router destination and default navigation while warming accepted mobile document opens', () => {
  const href = '/share/creator/c/portal/project';
  const f = fixture({ href, project: { coverKind: 'document' } });
  assert.equal(f.artwork().type, 'router-link'); assert.equal(f.artwork().props.to, href);
  const event = f.tap(); assert.equal(event.defaultPrevented, false); assert.equal(event.stopped, false);
  assert.deepEqual(f.trace, ['import-request'], 'Router links must not also call the button navigation action');
  f.dispose();
  const cancelled = fixture({ href, project: { coverKind: 'document' } });
  assert.equal(cancelled.tap({ moved: true }).defaultPrevented, true); assert.deepEqual(cancelled.trace, []); cancelled.dispose();
  const web = fixture({ presentation: 'web', href, project: { coverKind: 'document' } });
  assert.equal(web.click().defaultPrevented, false); assert.deepEqual(web.trace, []); web.dispose();
});

test('warmup and existing React.lazy resolve the same document renderer module URL', () => {
  const imports = file => {
    const path = new URL(file, import.meta.url), source = ts.createSourceFile(path.pathname, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const values = [];
    const visit = node => { if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) values.push(new URL(`${node.arguments[0].text}.tsx`, path).href); ts.forEachChild(node, visit); };
    visit(source); return values;
  };
  const warm = imports('../src/components/media/warmDocumentRenderer.ts');
  const renderer = imports('../src/components/media/AttachmentRenderer.tsx');
  assert.equal(warm.length, 1); assert.ok(renderer.includes(warm[0]), 'Native module caching must deduplicate the warm import with the actual renderer');
});
