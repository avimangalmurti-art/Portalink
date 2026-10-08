import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const source = name => readFileSync(new URL(`../src/components/profile/${name}.tsx`, import.meta.url), 'utf8');
function load(name, require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source(name), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, { exports, require });
  return exports;
}
function nodes(node) {
  return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
}
const creator = { id: 'creator', name: 'Portalite', avatar: '/avatar.webp' };
const project = { id: 'project', title: 'Report', summary: 'Published research', cover: '/cover.webp', coverAlt: 'Report cover' };

function cardHarness(presentation = 'mobile') {
  const imports = [];
  let expanded = false, lazyFactory, opened = 0, details = 0;
  const LazyExtension = () => null;
  const { ProjectPreviewCard } = load('ProjectPreviewCard', name => {
    imports.push(name);
    if (name === 'framer-motion' || name === './PreviewCreatorName') assert.fail('A bitmap card must not import animated attribution');
    if (name === 'react') return { ...React, useState: initial => [initial, next => { if (next === true) details++; }], lazy: factory => { lazyFactory = factory; return LazyExtension; }, useEffect: () => undefined };
    if (name === 'react-router-dom') return { Link: 'link' };
    if (name === 'lucide-react') return { MoreHorizontalIcon: 'horizontal-dots' };
    if (name.endsWith('/MobileContextActions')) return { useMobileActions: () => ({ open() {} }) };
    if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon: 'interface-icon' };
    if (name.endsWith('/useMobileProjectContext')) return { useMobileProjectContext: () => ({}) };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/useContentPreview')) return { useContentPreview: () => ({ expanded, events: {}, ref: {}, open: (event, action) => action(), toggleDetails: () => details++ }) };
    if (name.endsWith('/projectPresentation')) return { getProjectAspectRatio: () => 0.75, getProjectCoverPreview: () => undefined };
    if (name.endsWith('/projectContinuity')) return { projectContinuityStyle: () => ({}) };
    if (name.endsWith('/ProjectCover')) return { ProjectCover: 'cover' };
    if (name === './ProjectHoverDetails') return { ProjectHoverDetails: 'details' };
    if (name === './ProjectPreviewExtension') return { ProjectPreviewExtension: 'loaded-extension' };
    return {};
  });
  return { imports, LazyExtension, openCount: () => opened, detailsCount: () => details, loadExtension: () => lazyFactory(),
    render(props = {}, nextExpanded = false) { expanded = nextExpanded; return ProjectPreviewCard({ project, creator, onOpen: () => opened++, ...props }); },
  };
}

test('shared bitmap cards do not load the animated extension on WEB or MOBILE, even when details expand', () => {
  for (const presentation of ['web', 'mobile']) {
    const h = cardHarness(presentation);
    const props = { showCreator: false, showEngagementMetrics: false, priority: 'viewport', allowPdfFallback: false, allowVideoFallback: false };
    for (const expanded of [false, true]) {
      const tree = h.render(props, expanded);
      assert.equal(tree.props['data-has-extension'], false);
      assert.equal(nodes(tree).some(node => node.type === h.LazyExtension || node.type === React.Suspense), false);
      const cover = nodes(tree).find(node => node.type === 'cover');
      assert.equal(cover.props.priority, 'viewport');
      assert.equal(cover.props.allowPdfFallback, false);
      assert.equal(cover.props.allowVideoFallback, false);
      nodes(tree).find(node => node.props['data-preview-open'] !== undefined).props.onClick({});
      assert.ok(nodes(tree).some(node => node.type === 'details'), 'Description behavior remains in the artwork');
      if (presentation === 'mobile') nodes(tree).find(node => node.props.className?.startsWith('mobile-preview-details')).props.onClick({ stopPropagation() { /* No parent event in this component harness. */ } });
    }
    assert.equal(h.openCount(), 2);
    assert.equal(h.detailsCount(), presentation === 'mobile' ? 2 : 0);
    assert.ok(!h.imports.includes('./ProjectPreviewExtension'));
  }
});

test('ordinary cards request their extension with the same creator/actions and only the lazy factory imports it', async () => {
  const h = cardHarness('web');
  const onOpenCreator = () => undefined, onOpenComments = () => undefined, onWarmCreator = () => undefined;
  const tree = h.render({ onOpenCreator, onOpenComments, onWarmCreator, creatorHref: '/share/creator' }, true);
  assert.equal(tree.props['data-has-extension'], true);
  const extension = nodes(tree).find(node => node.type === h.LazyExtension);
  assert.equal(extension.props.creator, creator);
  assert.equal(extension.props.projectId, project.id);
  assert.equal(extension.props.expanded, true);
  assert.equal(extension.props.showCreator, true);
  assert.equal(extension.props.showEngagementMetrics, true);
  assert.equal(extension.props.onOpenCreator, onOpenCreator);
  assert.equal(extension.props.onOpenComments, onOpenComments);
  assert.equal(extension.props.onWarmCreator, onWarmCreator);
  assert.equal(extension.props.creatorHref, '/share/creator');
  assert.ok(!h.imports.includes('./ProjectPreviewExtension'));
  assert.equal((await h.loadExtension()).default, 'loaded-extension');
  assert.ok(h.imports.includes('./ProjectPreviewExtension'));
});

function extensionHarness(reducedMotion = false) {
  const state = [], effects = [], element = { inert: undefined };
  let cursor = 0;
  const { ProjectPreviewExtension } = load('ProjectPreviewExtension', name => {
    if (name === 'react') return { ...React,
      useRef: () => ({ current: element }), useLayoutEffect: effect => effects.push(effect),
      useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], next => { state[i] = next; }]; },
    };
    if (name === 'framer-motion') return { motion: { div: 'motion.div' }, useReducedMotion: () => reducedMotion };
    if (name === 'react-router-dom') return { Link: 'link' };
    if (name === './CreatorAvatar') return { CreatorAvatar: 'avatar' };
    if (name === './PreviewCreatorName') return { PreviewCreatorName: 'name' };
    if (name === './ProjectHoverDetails') return { ProjectPreviewMetrics: 'metrics' };
    return {};
  });
  return { element, layout() { effects.splice(0).forEach(effect => effect()); },
    render(props = {}) { cursor = 0; return ProjectPreviewExtension({ expanded: false, creator, projectId: project.id, showCreator: true, showEngagementMetrics: true, ...props }); },
  };
}

test('animated owner extension preserves sizing, motion, inert handling and overflow through expand/collapse', () => {
  const h = extensionHarness();
  let tree = h.render(); h.layout();
  assert.equal(tree.type, 'motion.div');
  assert.equal(tree.props.className, 'project-preview-extension');
  assert.equal(tree.props.initial, false);
  assert.equal(tree.props.animate.height, 0);
  assert.equal(tree.props.animate.opacity, 0);
  assert.equal(tree.props.transition.duration, 0.18);
  assert.deepEqual(Array.from(tree.props.transition.ease), [0.2, 0.8, 0.2, 1]);
  assert.equal(h.element.inert, true);
  tree = h.render({ expanded: true }); h.layout();
  assert.equal(tree.props.animate.height, 'auto');
  assert.equal(tree.props.animate.opacity, 1);
  assert.equal(tree.props['aria-hidden'], false);
  assert.equal(tree.props.style.overflow, 'hidden');
  assert.equal(h.element.inert, false);
  tree.props.onAnimationComplete();
  tree = h.render({ expanded: true });
  assert.equal(tree.props.style.overflow, 'visible');
  assert.equal(nodes(tree).find(node => node.type === 'name').props.active, true);
  tree.props.onAnimationStart();
  tree = h.render(); h.layout();
  assert.equal(tree.props.style.overflow, 'hidden');
  assert.equal(tree.props['aria-hidden'], true);
  assert.equal(h.element.inert, true);
  assert.equal(nodes(tree).find(node => node.type === 'name').props.active, false);
});

test('extension retains reduced motion, canonical metrics, custom controls and creator navigation', () => {
  const h = extensionHarness(true);
  let tree = h.render({ expanded: true });
  assert.equal(tree.props.transition.duration, 0);
  assert.equal(tree.props.style.overflow, 'visible');
  assert.equal(nodes(tree).find(node => node.type === 'metrics').props.projectId, project.id);
  assert.equal(nodes(tree).find(node => node.type === 'link').props.to, '/p/creator');
  const customMetrics = React.createElement('span', null, 'Counts'), footerEnd = React.createElement('button', null, 'Edit');
  let opens = 0, warms = 0;
  const onOpenCreator = () => opens++, onWarmCreator = () => warms++;
  tree = h.render({ expanded: true, metrics: customMetrics, footerEnd, onOpenCreator, onWarmCreator });
  assert.equal(nodes(tree).some(node => node.type === 'metrics'), false);
  assert.ok(nodes(tree).some(node => node.type === customMetrics.type && node.props.children === 'Counts'));
  assert.ok(nodes(tree).some(node => node.type === footerEnd.type && node.props.children === 'Edit'));
  const creatorButton = nodes(tree).find(node => node.props['aria-label'] === "Open Portalite's profile");
  creatorButton.props.onClick(); creatorButton.props.onFocus(); creatorButton.props.onPointerEnter();
  assert.equal(opens, 1); assert.equal(warms, 2);
  assert.equal(nodes(tree).find(node => node.type === 'avatar').props.avatar, creator.avatar);
});
