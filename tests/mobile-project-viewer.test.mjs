import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const AttachmentRenderer = () => null, EngagementBar = () => null, CommentThreadView = () => null, MediaCommentsPopover = () => null, EngagementFeedback = () => null;
const MobileProjectPageCounter = () => null;
function nodes(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
}
const withProp = (tree, prop) => nodes(tree).find(node => prop in node.props);
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.props['aria-label'] === label);

function harness({ mobile = true, readOnlyShare = false, empty = false, engagement = {}, mediaKind = 'video' } = {}) {
  const slots = []; let cursor = 0, panel = null;
  const serviceIds = [];
  const swipeCalls = [], navigationCalls = [];
  const onBack = () => navigationCalls.push('back'), onClose = () => navigationCalls.push('close');
  const swipeHandlers = { onPointerUpCapture() {}, onClickCapture() {} };
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
    if (name.endsWith('/MobileProjectPageCounter')) return { MobileProjectPageCounter };
    if (name.endsWith('/EngagementBar')) return { EngagementBar, EngagementFeedback };
    if (name.endsWith('/CommentThreadView')) return { CommentThreadView };
    if (name.endsWith('/MediaCommentsPopover')) return { MediaCommentsPopover };
    if (name.endsWith('/useProjectBackSwipe')) return { useProjectBackSwipe: (surfaceRef, options) => {
      swipeCalls.push({ surfaceRef, ...options });
      return swipeHandlers;
    } };
    if (name.endsWith('/useProjectEngagement')) return { useProjectEngagement: id => { serviceIds.push(id); return engagement; } };
    if (name.endsWith('/useProjectComments')) return { useProjectComments: id => { serviceIds.push(id); return {}; } };
    if (name.endsWith('/pageLayout')) return { normalizePagesPerRow: value => value };
    if (name.endsWith('/viewerMemory')) return { readViewerMemory: () => ({}), updateViewerMemory() {} };
    if (name.endsWith('/projectContinuity')) return { projectContinuityStyle: () => ({}) };
    return new Proxy({}, { get: () => () => null });
  } });
  const attachments = empty ? [] : ['first', 'second'].map(id => ({ id, kind: mediaKind, displayName: id, typeLabel: 'Video' }));
  const index = React.createElement('aside', { 'data-project-index-panel': '' }, React.createElement('button', { onClick: () => { panel = null; }, 'aria-label': 'Collapse document list' }));
  return { attachments, serviceIds, swipeCalls, swipeHandlers, navigationCalls, onBack, openIndex() { panel = 'index'; }, render() {
    cursor = 0;
    return exports.ProjectMediaViewer({ projectId: 'project', projectTitle: 'Work', attachments, pageCount: null,
      responseRailWidth: { width: panel === 'response' ? 320 : 52 }, singlePanel: null, readOnlyShare,
      mobileNavigation: mobile ? { index, isIndexOpen: panel === 'index', onOpenIndex: () => { panel = 'index'; }, onCloseIndex: () => { panel = null; }, onBack } : undefined,
      isRailOpen: panel === 'response', onRailOpenChange: open => { panel = open ? 'response' : null; },
      processing: { resolveState: () => 'ready', resolveMessage: () => '', canRetry: () => false, retrying: [] }, onClose,
    });
  } };
}

test('project overview attaches mobile swipe Back to the work stage and uses navigation rather than media Close', () => {
  const h = harness();
  const tree = h.render(), stage = withProp(tree, 'data-project-stage'), swipe = h.swipeCalls.at(-1);
  assert.equal(swipe.enabled, true);
  assert.equal(swipe.scope, 'project:first');
  assert.equal(stage.ref, swipe.surfaceRef);
  assert.equal(stage.props.onPointerUpCapture, h.swipeHandlers.onPointerUpCapture);
  assert.equal(stage.props.onClickCapture, h.swipeHandlers.onClickCapture);
  assert.equal(swipe.onBack, h.onBack);
  assert.notEqual(swipe.onBack, nodes(tree).find(node => node.type === AttachmentRenderer).props.onClose);
  swipe.onBack();
  assert.deepEqual(h.navigationCalls, ['back']);
  button(tree, 'second, Video').props.onClick();
  h.render();
  assert.equal(h.swipeCalls.at(-1).scope, 'project:second', 'Switching content must invalidate a gesture from the previous attachment');
});

test('mobile overview Back yields to focused pages, the project index and response popups', () => {
  const h = harness();
  let tree = h.render();
  nodes(tree).find(node => node.type === AttachmentRenderer).props.onFocusModeChange(true);
  tree = h.render();
  assert.equal(h.swipeCalls.at(-1).enabled, false);
  nodes(tree).find(node => node.type === AttachmentRenderer).props.onFocusModeChange(false);
  tree = h.render();
  assert.equal(h.swipeCalls.at(-1).enabled, true);
  h.openIndex();
  tree = h.render();
  assert.equal(h.swipeCalls.at(-1).enabled, false);
  button(tree, 'Close project list').props.onClick();
  tree = h.render();
  assert.equal(h.swipeCalls.at(-1).enabled, true);
  for (const label of ['Show comments', 'Show project description']) {
    button(tree, label).props.onClick();
    tree = h.render();
    assert.equal(h.swipeCalls.at(-1).enabled, false);
    button(tree, 'Close project popup').props.onClick();
    tree = h.render();
    assert.equal(h.swipeCalls.at(-1).enabled, true);
  }
});

test('overview swipe Back remains available on public mobile content but is disabled on WEB and 3D media', () => {
  const shared = harness({ readOnlyShare: true });
  shared.render();
  assert.equal(shared.swipeCalls.at(-1).enabled, true);
  assert.equal(shared.swipeCalls.at(-1).onBack, shared.onBack);
  const web = harness({ mobile: false });
  web.render();
  assert.equal(web.swipeCalls.at(-1).enabled, false);
  assert.equal(web.swipeCalls.at(-1).onBack, undefined);
  const model = harness({ mediaKind: 'model3d' });
  model.render();
  assert.equal(model.swipeCalls.at(-1).enabled, false, 'Model manipulation must retain its horizontal gestures');
});

test('mobile keeps selected media while opening its floating project list and separate response popups', () => {
  const h = harness();
  let tree = h.render();
  button(tree, 'second, Video').props.onClick();
  tree = h.render();
  const work = withProp(tree, 'data-project-work-column');
  const media = nodes(work).find(node => node.type === AttachmentRenderer);
  assert.equal(media.props.attachment.id, 'second');
  h.openIndex();
  tree = h.render();
  assert.ok(withProp(tree, 'data-project-index-panel'));
  assert.equal(withProp(tree, 'data-project-response-rail'), undefined);
  assert.equal(withProp(tree, 'data-project-work-column').type, work.type);
  assert.equal(nodes(tree).find(node => node.type === AttachmentRenderer).props.attachment.id, 'second');
  assert.ok(button(tree, 'Collapse document list'));
  button(tree, 'Close project list').props.onClick();
  tree = h.render();
  assert.equal(withProp(tree, 'data-project-index-panel'), undefined);
  assert.ok(withProp(tree, 'data-project-response-rail'));
  button(tree, 'Show comments').props.onClick();
  tree = h.render();
  assert.ok(nodes(tree).some(node => node.type === CommentThreadView));
  assert.equal(nodes(tree).find(node => node.type === MediaCommentsPopover).props.label, 'Project comments');
  button(tree, 'Close project popup').props.onClick();
  tree = h.render();
  assert.equal(nodes(tree).some(node => node.type === MediaCommentsPopover), false);
  button(tree, 'Show project description').props.onClick();
  tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === MediaCommentsPopover).props.label, 'Project description');
  assert.equal(nodes(tree).some(node => node.type === CommentThreadView), false);
  assert.equal(withProp(tree, 'data-project-work-column').props.style.display, undefined);
  h.openIndex();
  assert.equal(withProp(h.render(), 'data-project-response-rail'), undefined);
});

test('mobile engagement failures keep the recovery popup accessible', () => {
  const h = harness({ engagement: { resolveError: 'Could not load engagement' } });
  button(h.render(), 'Review engagement error').props.onClick();
  const tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === MediaCommentsPopover).props.label, 'Engagement update');
  assert.ok(nodes(tree).some(node => node.type === EngagementFeedback));
});

test('empty mobile projects keep their project-list access; WEB keeps its existing empty state', () => {
  const mobile = harness({ empty: true });
  mobile.openIndex();
  assert.ok(withProp(mobile.render(), 'data-project-index-panel'));
  const web = harness({ mobile: false, empty: true }).render();
  assert.equal(withProp(web, 'data-project-response-rail'), undefined);
  assert.equal(button(web, 'Show project list'), undefined);
});

test('shared mobile projects retain public details without social service requests or controls', () => {
  const h = harness({ readOnlyShare: true });
  let tree = h.render();
  button(tree, 'Show project description').props.onClick();
  tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === MediaCommentsPopover).props.label, 'Project description');
  assert.equal(button(tree, 'Show comments'), undefined);
  assert.equal(nodes(tree).some(node => node.type === EngagementBar || node.type === CommentThreadView), false);
  assert.ok(h.serviceIds.every(id => id === null));
});

test('WEB does not receive the combined mobile controls or change its response layout', () => {
  const tree = harness({ mobile: false }).render();
  assert.equal(tree.props['data-mobile-combined-rail'], undefined);
  assert.equal(button(tree, 'Show project list'), undefined);
  assert.equal(button(tree, 'Close project list'), undefined);
  assert.ok(withProp(tree, 'data-project-response-rail'));
  assert.ok(nodes(tree).some(node => node.type === EngagementBar));
  assert.equal(nodes(tree).find(node => node.type === EngagementBar).props.variant, 'rail');
  assert.equal(nodes(tree).some(node => node.type === MobileProjectPageCounter), false);
});

test('mobile overview uses the reading rail and real-page counter, while focused pages and panels own their controls', () => {
  const h = harness();
  let tree = h.render();
  assert.equal(nodes(tree).find(node => node.type === EngagementBar).props.variant, 'viewer');
  const counter = nodes(tree).find(node => node.type === MobileProjectPageCounter);
  assert.equal(counter.props.surfaceRef, withProp(tree, 'data-project-stage').ref);
  assert.equal(counter.props.scope, 'project:first');
  nodes(tree).find(node => node.type === AttachmentRenderer).props.onFocusModeChange(true);
  assert.equal(nodes(h.render()).some(node => node.type === MobileProjectPageCounter), false);
  nodes(tree).find(node => node.type === AttachmentRenderer).props.onFocusModeChange(false);
  h.openIndex();
  tree = h.render();
  assert.equal(nodes(tree).some(node => node.type === MobileProjectPageCounter), false);
  assert.equal(nodes(tree).some(node => node.type === EngagementBar), false);
});

test('mobile page previews use image order, available rendered pages, or the loaded PDF; WEB does not register previews', () => {
  const images = harness({ mediaKind: 'image' });
  images.attachments.forEach((page, index) => { page.sourceUrl = `image-${index + 1}`; });
  const preview = tree => nodes(tree).find(node => node.type === MobileProjectPageCounter);
  assert.deepEqual(Array.from(preview(images.render()).props.previewSources), ['image-1', 'image-2']);
  const documents = harness({ mediaKind: 'document' });
  documents.attachments[0].metadata = { renderedPages: [{ sourceUrl: 'page-1' }, {}, { sourceUrl: 'page-2' }] };
  assert.deepEqual(Array.from(preview(documents.render()).props.previewSources), ['page-1', 'page-2']);
  const pdf = { numPages: 30 };
  nodes(documents.render()).find(node => node.type === AttachmentRenderer).props.onPreviewDocument(pdf);
  assert.equal(preview(documents.render()).props.pdfDocument, pdf);
  nodes(documents.render()).find(node => node.type === AttachmentRenderer).props.onPreviewDocument(null);
  assert.equal(preview(documents.render()).props.pdfDocument, null);
  assert.equal(nodes(harness({ mobile: false }).render()).find(node => node.type === AttachmentRenderer).props.onPreviewDocument, undefined);
});

test('project workspace combines only resolved mobile projects and uses the existing Back callback', () => {
  const compile = (path, require) => {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
    }).outputText, { exports, require, requestAnimationFrame: callback => callback(),
      window: { addEventListener() {}, removeEventListener() {}, setTimeout() {}, clearTimeout() {} },
      document: { addEventListener() {}, removeEventListener() {}, fullscreenElement: null },
    });
    return exports;
  };
  const geometry = compile('../src/utils/projectPanelLayout.ts', () => ({}));
  const { MobilePortalProjectToolbar } = compile('../src/components/profile/MobilePortalProjectToolbar.tsx', name => {
    if (name === 'react') return React;
    if (name.endsWith('/pageLayout')) return { MIN_PAGES_PER_ROW: 1, MAX_PAGES_PER_ROW: 6 };
    return new Proxy({}, { get: () => () => null });
  });
  const toolbar = tree => {
    const control = nodes(tree).find(node => node.type === MobilePortalProjectToolbar);
    return control && control.type(control.props);
  };
  let presentation = 'mobile', workspaceWidth = 390, back = 0, portalReturns = 0, cursor = 0, effectCursor = 0;
  let currentRoute = { kind: 'project', profileId: 'owner', categoryId: 'portal', projectId: 'work' };
  const slots = [], effects = [], pendingEffects = [], selections = [], indexVisibility = [];
  const Viewer = () => null;
  const Index = () => null;
  const react = { ...React, useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useMemo: fn => fn(), useCallback: fn => fn, useRef: current => ({ current }),
    useEffect(fn, deps) {
      const i = effectCursor++;
      if (!effects[i] || deps.some((value, j) => !Object.is(value, effects[i][j]))) pendingEffects.push(fn);
      effects[i] = deps;
    } };
  const { ProfileCategoryPage } = compile('../src/components/profile/ProfileCategoryPage.tsx', name => {
    if (name === 'react') return react;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/useAppRoute')) return { useAppRoute: () => currentRoute };
    if (name.endsWith('/projectPanelLayout')) return geometry;
    if (name.endsWith('/useElementSize')) return { useElementSize: () => ({ ref: { current: null }, width: workspaceWidth }) };
    if (name.endsWith('/ResizablePanelHandle')) return { ResizablePanelHandle: () => null, useResizablePanelWidth: () => ({ preferredWidth: 315 }) };
    if (name.endsWith('/ProjectMediaViewer')) return { ProjectMediaViewer: Viewer };
    if (name.endsWith('/ProjectIndexList')) return { ProjectIndexList: Index };
    if (name.endsWith('/MobilePortalProjectToolbar')) return { MobilePortalProjectToolbar };
    if (name.endsWith('/viewer')) return { canAuthor: role => role === 'owner' };
    if (name.endsWith('/useProjectArrangement')) return { useProjectArrangement: () => ({ arrange: projects => Object.freeze(projects), pinnedIds: [], hiddenIds: [], isLoading: false, isSaving: false }) };
    if (name.endsWith('/useProjectManagement')) return { useProjectManagement: () => ({ deletion: { projectId: null }, editor: {} }) };
    if (name.endsWith('/useProjectTypography')) return { useProjectTypography: () => ({ resolveTypefaceId: () => null, resolvePagesPerRow: () => 3 }) };
    if (name.endsWith('/typefaces')) return { getTypefaceStack: () => 'sans-serif' };
    if (name.endsWith('/projectAttachments')) return { resolveProjectAttachments: () => [] };
    if (name.endsWith('/pageLayout')) return { normalizePagesPerRow: value => value };
    if (name.endsWith('/useAssetProcessing')) return { useAssetProcessing: () => ({ statuses: {} }) };
    if (name.endsWith('/panelLayoutDefaults')) return { panelLayoutDefaults: {} };
    return new Proxy({}, { get: () => () => null });
  });
  const props = { profile: { id: 'owner', projects: Object.freeze([
      { id: 'work', categoryId: 'portal', title: 'Alpha', summary: 'Earlier project', publishedAt: '2026-09-10T12:00:00Z', pageCount: 2 },
      { id: 'second', categoryId: 'portal', title: 'Zulu', summary: 'Needle in the newer project', publishedAt: '2026-09-14T12:00:00Z', pageCount: 2 },
    ]) },
    category: { id: 'portal', label: 'Portal', iconName: 'camera' }, viewerRole: 'visitor', activeProjectId: 'work',
    onBack: () => back++, onBackToPortals: () => portalReturns++, onSelectProject(id, replace) { selections.push([id, replace]); props.activeProjectId = id; },
    isIndexCollapsed: true, isEngagementOpen: false,
    onCreateProject: () => {}, onMobileIndexOpenChange: open => indexVisibility.push(open),
    onIndexCollapsedChange: () => assert.fail('Mobile must not write WEB panel preferences'),
    onEngagementOpenChange: () => assert.fail('Mobile must not write WEB panel preferences') };
  const render = values => {
    cursor = 0; effectCursor = 0;
    const tree = ProfileCategoryPage(values);
    pendingEffects.splice(0).forEach(effect => effect());
    return tree;
  };
  let tree = render(props);
  assert.equal(indexVisibility.at(-1), false);
  assert.equal(withProp(tree, 'data-project-index-panel'), undefined);
  assert.ok(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.onBack, props.onBack);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.onBack, button(tree, 'Go back').props.onClick,
    'Swiping and the existing floating Back button must use the same route callback');
  nodes(tree).find(node => node.type === Viewer).props.onPageFocusModeChange(true);
  tree = render(props);
  assert.equal(button(tree, 'Go back'), undefined, 'The project Back button must not overlap focused-page controls');
  assert.equal(button(tree, 'Portal preview'), undefined);
  nodes(tree).find(node => node.type === Viewer).props.onPageFocusModeChange(false);
  tree = render(props);
  button(tree, 'Go back').props.onClick();
  assert.equal(back, 1);
  button(tree, 'Portal preview').props.onClick();
  tree = render(props);
  assert.equal(indexVisibility.at(-1), true, 'Opening the navigation tells the shared profile header to appear');
  assert.equal(button(tree, 'Go back'), undefined, 'The open project list already has Back to portals beside its title');
  const projectList = nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.index;
  const currentList = () => nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.index;
  const index = () => nodes(currentList()).find(node => node.type === Index).props;
  const toolbarProps = () => nodes(currentList()).find(node => node.type === MobilePortalProjectToolbar).props;
  assert.deepEqual(Array.from(index().projects, project => project.id), ['second', 'work']);
  assert.equal(index().mobileReorderDisabled, true, 'Recent sorting must not overwrite saved order');
  assert.equal(button(toolbar(projectList), 'Add a new project to Portal'), undefined, 'Visitors never receive authoring controls');
  toolbarProps().onSort('title'); tree = render(props);
  assert.deepEqual(Array.from(index().projects, project => project.id), ['work', 'second']);
  assert.equal(index().mobileReorderDisabled, true);
  toolbarProps().onSort('saved'); tree = render(props);
  assert.deepEqual(Array.from(index().projects, project => project.id), ['work', 'second']);
  assert.equal(index().mobileReorderDisabled, false);
  toolbarProps().onQuery('needle'); tree = render(props);
  assert.deepEqual(Array.from(index().projects, project => project.id), ['second']);
  assert.equal(index().mobileReorderDisabled, true, 'A partial search result is never reorderable');
  toolbarProps().onQuery(''); toolbarProps().onLayout('grid'); tree = render(props);
  assert.equal(index().mobileLayout, 'grid');
  assert.deepEqual(props.profile.projects.map(project => project.id), ['work', 'second'], 'Browsing sorts never mutate stored order');
  tree = render({ ...props, viewerRole: 'owner' });
  assert.equal(toolbarProps().onCreate, props.onCreateProject, 'The owner receives the existing creation callback');
  tree = render(props);
  nodes(projectList).find(node => node.type === Index).props.onSelect('second');
  render(props);
  tree = render(props);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.projectId, 'second');
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.isIndexOpen, true);
  assert.equal(indexVisibility.at(-1), true, 'Choosing a project keeps the same navigation and profile context open');
  assert.equal(button(tree, 'Go back'), undefined, 'Selecting another project keeps the duplicate Back hidden');
  nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.onCloseIndex();
  tree = render(props);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.isIndexOpen, false);
  assert.equal(indexVisibility.at(-1), false, 'Dismissing navigation restores the content-only presentation');
  assert.ok(button(tree, 'Go back'), 'Closing the list restores the content viewer Back button');
  assert.ok(button(tree, 'Portal preview'));
  button(toolbar(projectList), 'Back to portals').props.onClick();
  assert.equal(button(projectList, 'Collapse document list'), undefined, 'The clean mobile header uses outside dismissal instead of a duplicate collapse control');
  assert.equal(portalReturns, 1);
  currentRoute = { kind: 'category', profileId: 'owner', categoryId: 'portal' };
  tree = render({ ...props, activeProjectId: null });
  assert.deepEqual(selections.at(-1), ['work', true]);
  button(toolbar(tree), 'Back to portals').props.onClick();
  assert.equal(portalReturns, 2);
  assert.equal(back, 1);
  tree = render(props);
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.projectId, 'work');
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation.isIndexOpen, true);
  const selectionCount = selections.length;
  for (const route of [
    { kind: 'profile', profileId: 'owner' },
    { kind: 'portals' },
    { kind: 'category', profileId: 'owner', categoryId: 'another-portal' },
    { kind: 'category', profileId: 'another-owner', categoryId: 'portal' },
  ]) {
    currentRoute = route;
    render({ ...props, activeProjectId: null });
    assert.equal(selections.length, selectionCount, 'An outgoing category snapshot must not redirect the live screen');
  }
  currentRoute = { kind: 'category', profileId: 'owner', categoryId: 'portal' };
  tree = render({ ...props, activeProjectId: null, profile: { ...props.profile, projects: [] } });
  assert.equal(selections.length, selectionCount);
  assert.ok(button(toolbar(tree), 'Back to portals'));
  tree = render({ ...props, activeProjectId: 'missing' });
  assert.equal(selections.length, selectionCount);
  assert.equal(tree.props['data-mobile-project-view'], undefined);
  assert.equal(withProp(tree, 'data-project-index-panel').props.style.width, '52px');
  assert.ok(nodes(tree).find(node => node.props['aria-label'] === 'Project not found'));
  nodes(projectList).find(node => node.type === MobilePortalProjectToolbar).props.onSort('recent');
  presentation = 'web'; workspaceWidth = 1200;
  tree = render({ ...props, isIndexCollapsed: false });
  assert.ok(withProp(tree, 'data-project-index-panel'));
  assert.equal(nodes(tree).find(node => node.type === Viewer).props.mobileNavigation, undefined);
  assert.equal(button(tree, 'Go back'), undefined);
  assert.equal(button(tree, 'Back to portals'), undefined);
  assert.equal(toolbar(tree), undefined, 'WEB keeps its existing toolbar');
  const webIndex = nodes(tree).find(node => node.type === Index).props;
  assert.deepEqual(Array.from(webIndex.projects, project => project.id), ['work', 'second']);
  assert.equal(webIndex.mobileReorderFromMenu, false);
  assert.equal(webIndex.mobileReorderDisabled, false);
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
