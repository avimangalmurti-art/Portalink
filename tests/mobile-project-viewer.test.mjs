import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const AttachmentRenderer = () => null, EngagementBar = () => null, CommentThreadView = () => null;
function nodes(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
}
const withProp = (tree, prop) => nodes(tree).find(node => prop in node.props);
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props['aria-label'] === label);

function harness({ mobile = true, readOnlyShare = false, empty = false } = {}) {
  const slots = []; let cursor = 0, panel = null;
  const serviceIds = [];
  const react = { ...React, useEffect() {}, useCallback: fn => fn,
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/ProjectMediaViewer.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('/AttachmentRenderer')) return { AttachmentRenderer };
    if (name.endsWith('/EngagementBar')) return { EngagementBar };
    if (name.endsWith('/CommentThreadView')) return { CommentThreadView };
    if (name.endsWith('/useProjectEngagement')) return { useProjectEngagement: id => { serviceIds.push(id); return {}; } };
    if (name.endsWith('/useProjectComments')) return { useProjectComments: id => { serviceIds.push(id); return {}; } };
    if (name.endsWith('/pageLayout')) return { normalizePagesPerRow: value => value };
    if (name.endsWith('/viewerMemory')) return { readViewerMemory: () => ({}), updateViewerMemory() {} };
    if (name.endsWith('/projectContinuity')) return { projectContinuityStyle: () => ({}) };
    return new Proxy({}, { get: () => () => null });
  } });
  const attachments = empty ? [] : ['first', 'second'].map(id => ({ id, kind: 'video', displayName: id, typeLabel: 'Video' }));
  const index = React.createElement('aside', { 'data-project-index-panel': '' }, React.createElement('button', { onClick: () => { panel = null; }, 'aria-label': 'Collapse document list' }));
  return { serviceIds, render() {
    cursor = 0;
    return exports.ProjectMediaViewer({ projectId: 'project', projectTitle: 'Work', attachments, pageCount: null,
      responseRailWidth: { width: panel === 'response' ? 320 : 52 }, singlePanel: null, readOnlyShare,
      mobileNavigation: mobile ? { index, isIndexOpen: panel === 'index', onOpenIndex: () => { panel = 'index'; } } : undefined,
      isRailOpen: panel === 'response', onRailOpenChange: open => { panel = open ? 'response' : null; },
      processing: { resolveState: () => 'ready', resolveMessage: () => '', canRetry: () => false, retrying: [] }, onClose() {},
    });
  } };
}

test('mobile uses one right-panel slot and keeps selected media while opening and closing the project list', () => {
  const h = harness();
  let tree = h.render();
  button(tree, 'second, Video').props.onClick();
  tree = h.render();
  const work = withProp(tree, 'data-project-work-column');
  const media = nodes(work).find(node => node.type === AttachmentRenderer);
  assert.equal(media.props.attachment.id, 'second');
  button(tree, 'Show project list').props.onClick();
  tree = h.render();
  assert.ok(withProp(tree, 'data-project-index-panel'));
  assert.equal(withProp(tree, 'data-project-response-rail'), undefined);
  assert.equal(withProp(tree, 'data-project-work-column').type, work.type);
  assert.equal(nodes(tree).find(node => node.type === AttachmentRenderer).props.attachment.id, 'second');
  button(tree, 'Collapse document list').props.onClick();
  tree = h.render();
  assert.equal(withProp(tree, 'data-project-index-panel'), undefined);
  assert.ok(withProp(tree, 'data-project-response-rail'));
  button(tree, 'Show engagement and comments').props.onClick();
  tree = h.render();
  assert.ok(nodes(tree).some(node => node.type === CommentThreadView));
  assert.equal(withProp(tree, 'data-project-work-column').props.style.display, undefined);
  button(tree, 'Show project list').props.onClick();
  assert.equal(withProp(h.render(), 'data-project-response-rail'), undefined);
});

test('empty mobile projects keep their project-list access; WEB keeps its existing empty state', () => {
  const mobile = harness({ empty: true });
  button(mobile.render(), 'Show project list').props.onClick();
  assert.ok(withProp(mobile.render(), 'data-project-index-panel'));
  const web = harness({ mobile: false, empty: true }).render();
  assert.equal(withProp(web, 'data-project-response-rail'), undefined);
  assert.equal(button(web, 'Show project list'), undefined);
});

test('shared mobile projects retain public details without social service requests or controls', () => {
  const h = harness({ readOnlyShare: true });
  let tree = h.render();
  assert.ok(button(tree, 'Show project list'));
  button(tree, 'Show project details').props.onClick();
  tree = h.render();
  assert.ok(button(tree, 'Show project information'));
  assert.equal(nodes(tree).some(node => node.type === EngagementBar || node.type === CommentThreadView), false);
  assert.ok(h.serviceIds.every(id => id === null));
});

test('WEB does not receive the combined mobile controls or change its response layout', () => {
  const tree = harness({ mobile: false }).render();
  assert.equal(tree.props['data-mobile-combined-rail'], undefined);
  assert.equal(button(tree, 'Show project list'), undefined);
  assert.ok(withProp(tree, 'data-project-response-rail'));
  assert.ok(nodes(tree).some(node => node.type === EngagementBar));
});

test('project workspace combines only resolved mobile projects and uses the existing Back callback', () => {
  const compile = (path, require) => {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText, { exports, require, requestAnimationFrame: callback => callback() });
    return exports;
  };
  const geometry = compile('../src/utils/projectPanelLayout.ts', () => ({}));
  let presentation = 'mobile', back = 0, portalReturns = 0, cursor = 0;
  const slots = [];
  const Viewer = () => null;
  const react = { ...React, useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useMemo: fn => fn(), useCallback: fn => fn, useRef: current => ({ current }), useEffect() {} };
  const { ProfileCategoryPage } = compile('../src/components/profile/ProfileCategoryPage.tsx', name => {
    if (name === 'react') return react;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/projectPanelLayout')) return geometry;
    if (name.endsWith('/useElementSize')) return { useElementSize: () => ({ ref: { current: null }, width: 390 }) };
    if (name.endsWith('/ResizablePanelHandle')) return { useResizablePanelWidth: () => ({ preferredWidth: 315 }) };
    if (name.endsWith('/ProjectMediaViewer')) return { ProjectMediaViewer: Viewer };
    if (name.endsWith('/viewer')) return { canAuthor: () => false };
    if (name.endsWith('/useProjectArrangement')) return { useProjectArrangement: () => ({ arrange: projects => projects, pinnedIds: [] }) };
    if (name.endsWith('/useProjectManagement')) return { useProjectManagement: () => ({ deletion: { projectId: null }, editor: {} }) };
    if (name.endsWith('/useProjectTypography')) return { useProjectTypography: () => ({ resolveTypefaceId: () => null, resolvePagesPerRow: () => 3 }) };
    if (name.endsWith('/typefaces')) return { getTypefaceStack: () => 'sans-serif' };
    if (name.endsWith('/projectAttachments')) return { resolveProjectAttachments: () => [] };
    if (name.endsWith('/pageLayout')) return { normalizePagesPerRow: value => value };
    if (name.endsWith('/useAssetProcessing')) return { useAssetProcessing: () => ({ statuses: {} }) };
    if (name.endsWith('/panelLayoutDefaults')) return { panelLayoutDefaults: {} };
    return new Proxy({}, { get: () => () => null });
  });
  const props = { profile: { id: 'owner', projects: [{ id: 'work', categoryId: 'portal', title: 'Work' }] },
    category: { id: 'portal', label: 'Portal' }, viewerRole: 'visitor', activeProjectId: 'work',
    onBack: () => back++, onBackToPortals: () => portalReturns++, onSelectProject() {}, isIndexCollapsed: true, isEngagementOpen: false };
  const render = values => { cursor = 0; return ProfileCategoryPage(values); };
  let tree = render(props);
  assert.equal(withProp(tree, 'data-project-index-panel'), undefined);
  assert.ok(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation);
  button(tree, 'Go back').props.onClick();
  assert.equal(back, 1);
  nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.onOpenIndex();
  tree = render(props);
  const projectList = nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.index;
  button(projectList, 'Back to portals').props.onClick();
  assert.ok(button(projectList, 'Collapse document list'));
  assert.equal(portalReturns, 1);
  tree = render({ ...props, activeProjectId: null });
  button(tree, 'Back to portals').props.onClick();
  assert.equal(portalReturns, 2);
  assert.equal(back, 1);
  tree = render({ ...props, activeProjectId: 'missing' });
  assert.equal(tree.props['data-mobile-project-view'], undefined);
  assert.equal(withProp(tree, 'data-project-index-panel').props.style.width, '52px');
  assert.ok(nodes(tree).find(node => node.props['aria-label'] === 'Project not found'));
  presentation = 'web';
  tree = render(props);
  assert.ok(withProp(tree, 'data-project-index-panel'));
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation, undefined);
  assert.equal(button(tree, 'Go back'), undefined);
  assert.equal(button(tree, 'Back to portals'), undefined);
});

test('direct public-project Back remains public; existing browser history takes priority', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const fn = source.match(/function returnFromPortal\(\) \{[\s\S]*?\n  \}/)[0];
  for (const idx of [0, 2]) {
    const calls = [];
    const back = vm.runInNewContext(`(${fn})`, { window: { history: { state: { idx } } },
      isSharedRoute: true, viewedProfileId: 'creator', isOwnerMode: false,
      nav: { back: () => calls.push('back'), to: (...args) => calls.push(args) },
      buildPath: (kind, values) => `${kind}/${values?.profileId ?? ''}` });
    back();
    assert.deepEqual(calls, idx === 2 ? ['back'] : [['sharedProfile/creator', true]]);
  }
});


test('Back to portals targets the viewed creator collection rather than previous projects', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const fn = source.match(/function returnToPortalCollection\(\) \{[\s\S]*?\n  \}/)[0];
  for (const [isSharedRoute, isOwnerMode, expected] of [
    [false, true, 'portals/'], [false, false, 'profile/creator?view=portals'], [true, false, 'sharedProfile/creator'],
  ]) {
    const calls = [];
    const go = vm.runInNewContext(`(${fn})`, { isSharedRoute, isOwnerMode, viewedProfileId: 'creator',
      nav: { to: (...args) => calls.push(args), back: () => assert.fail('Must not revisit a project') },
      buildPath: (kind, values) => `${kind}/${values?.profileId ?? ''}` });
    go();
    assert.deepEqual(calls, [[expected, true]]);
  }
});
