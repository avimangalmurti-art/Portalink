import {motionFixture} from './helpers/motion-fixture.mjs';
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
function textContent(node) {
  return React.isValidElement(node) ? React.Children.toArray(node.props.children).map(textContent).join('') : String(node);
}
const creator = { id: 'creator', name: 'Portalite', avatar: '/avatar.webp' };
const project = { id: 'project', title: 'Report', summary: 'Published research', cover: '/cover.webp', coverAlt: 'Report cover' };
const detailsButton = node => node.type === 'button' && node.props['aria-label'] === `Show details for ${project.title}`;
const artworkFrame = node => node.props['data-packing-base'] !== undefined;
const mobileInfo = node => node.props['data-mobile-project-info'] !== undefined;

function cardHarness(presentation = 'mobile', inlineContent = {}) {
  const imports = [];
  let expanded = false, lazyFactory, opened = 0, details = 0;
  let inline = false;
  const positions = new Map();
  const LazyExtension = () => null;
  const { ProjectPreviewCard } = load('ProjectPreviewCard', name => {
    imports.push(name);
    if (name === 'framer-motion' || name === './PreviewCreatorName') assert.fail('A bitmap card must not import animated attribution');
    if (name === 'react') return { ...React, useState: initial => [initial, next => { if (next === true) details++; }], lazy: factory => { lazyFactory = factory; return LazyExtension; }, useEffect: () => undefined };
    if (name === 'react-router-dom') return { Link: 'link' };
    if (name === 'lucide-react') return { MoreHorizontalIcon: 'horizontal-dots', InfoIcon: 'info-circle' };
    if (name === './ProjectPageBrowsingContext') return { useInlineProjectPages: () => inline };
    if (name.endsWith('/cataloguePagePosition')) return { getCataloguePagePosition: id => positions.get(id), rememberCataloguePagePosition: (id, value) => positions.set(id, value) };
    if (name.endsWith('/cataloguePageNavigation')) return { withCataloguePageTarget: href => href };
    if (name.endsWith('/useInlineProjectContent')) return { useInlineProjectContent: ({ project }) => ({ project, metadataComplete: true, ...inlineContent }) };
    if (name === './inlineProjectPageModel') return { normalizeInlineProjectPosition: (_, position) => position, inlinePositionMatches: (left, right) => left === right };
    if (name.endsWith('/MobileContextActions')) return { useMobileActions: () => ({ open() {} }) };
    if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon: 'interface-icon' };
    if (name.endsWith('/warmDocumentRenderer')) return { warmProjectDocumentRenderer() {} };
    if (name.endsWith('/useMobileProjectContext')) return { useMobileProjectContext: () => ({}) };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/useContentPreview')) return { useContentPreview: () => ({ expanded, events: {}, ref: {}, open: (event, action) => action(), toggleDetails: () => details++ }) };
    if (name.endsWith('/projectPresentation')) return { getProjectAspectRatio: () => 0.75, getProjectCoverPreview: () => undefined };
    if (name.endsWith('/projectContinuity')) return { projectContinuityStyle: () => ({}), getProjectContinuityArtwork: () => project.cover, beginProjectContinuity() {} };
    if (name.endsWith('/ProjectCover')) return { ProjectCover: 'cover' };
    if (name === './CreatorAvatar') return { CreatorAvatar: 'creator-avatar' };
    if (name === './ProjectHoverDetails') return { ProjectHoverDetails: 'details' };
    if (name === './ProjectPreviewExtension') return { ProjectPreviewExtension: 'loaded-extension' };
    return {};
  });
  return { imports, LazyExtension, openCount: () => opened, detailsCount: () => details, loadExtension: () => lazyFactory(), setInline: value => { inline = value; },
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
      if (presentation === 'mobile') nodes(tree).find(node => node.props.className?.startsWith('mobile-preview-details')).props.onClick({
        preventDefault() { /* No native navigation in this component harness. */ },
        stopPropagation() { /* No parent event in this component harness. */ },
      });
    }
    assert.equal(h.openCount(), 2);
    assert.equal(h.detailsCount(), presentation === 'mobile' ? 2 : 0);
    assert.ok(!h.imports.includes('./ProjectPreviewExtension'));
  }
});

test('one-column cards select the inline surface and information popup while denser cards retain their existing control', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = cardHarness(presentation); h.setInline(true);
    let tree = h.render();
    const inline = nodes(tree).find(node => node.type === h.LazyExtension && node.props.onSelect);
    assert.ok(inline); assert.equal(inline.props.project, project);
    assert.equal(tree.props['data-expanded'], false);
    const frame = nodes(tree).find(artworkFrame);
    assert.ok(nodes(frame).some(node => node.type === h.LazyExtension && node.props.onSelect), 'The carousel stays within the artwork frame');
    const [info, duplicate] = nodes(tree).filter(detailsButton);
    assert.ok(info); assert.equal(duplicate, undefined);
    assert.equal(info.props['aria-haspopup'], 'dialog');
    assert.equal(nodes(info).find(node => node.type === 'interface-icon').props.icon, 'horizontal-dots');
    assert.equal(nodes(frame).some(detailsButton), presentation === 'web');
    assert.equal(nodes(tree).some(mobileInfo), presentation === 'mobile');
    assert.ok(info.props.className.includes(presentation === 'mobile' ? 'mobile-project-info-menu' : 'mobile-preview-details'));
    let stopped = false; info.props.onClick({ preventDefault() {}, stopPropagation() { stopped = true; } });
    assert.equal(stopped, true); assert.equal(h.detailsCount(), 1); assert.equal(h.openCount(), 0);
    const selected = { index: 2, key: 'page-two', attachmentId: 'image-two', page: 2 };
    inline.props.onSelect(selected);
    tree = h.render(); assert.equal(nodes(tree).find(node => node.type === h.LazyExtension && node.props.onSelect).props.position, selected);
    h.setInline(false); tree = h.render();
    assert.equal(nodes(tree).some(node => node.type === h.LazyExtension && node.props.onSelect), false);
    assert.equal(nodes(tree).some(mobileInfo), false);
    const denseFrame = nodes(tree).find(artworkFrame);
    assert.deepEqual(denseFrame.props.style, frame.props.style);
    const dots = nodes(denseFrame).find(detailsButton);
    assert.ok(dots?.props.className.includes('mobile-preview-details'));
    assert.equal(nodes(dots).find(node => node.type === 'interface-icon').props.icon, 'horizontal-dots');
    h.setInline(true);
    for (const props of [{ cover: React.createElement('span', {}, 'Saved page') }, { disabled: true }]) {
      const card = nodes(h.render(props));
      assert.equal(card.some(node => node.type === h.LazyExtension && node.props.onSelect), false);
      assert.equal(card.some(mobileInfo), false);
      const button = nodes(card.find(artworkFrame)).find(detailsButton);
      if (props.disabled) assert.equal(button, undefined);
      else assert.ok(button?.props.className.includes('mobile-preview-details'));
    }
  }
});

test('mobile keeps the loading cover tappable without an inline retry overlay', () => {
  let retries = 0;
  const failure = { metadataComplete: false, error: 'Offline', retry: () => { retries++; } };
  const mobile = cardHarness('mobile', failure); mobile.setInline(true);
  const elements = nodes(mobile.render({ showCoverLoading: true }));
  assert.equal(elements.some(node => node.props.className === 'inline-project-retry'), false);
  assert.equal(elements.find(node => node.type === 'cover').props.showLoadingIndicator, true);
  elements.find(node => node.props['data-preview-open'] !== undefined).props.onClick({});
  assert.equal(mobile.openCount(), 1);

  const desktop = cardHarness('web', failure); desktop.setInline(true);
  const retry = nodes(desktop.render()).find(node => node.props.className === 'inline-project-retry');
  retry.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(retries, 1);
});

test('the mobile info row follows the artwork with squircle attribution and available project metadata', () => {
  const h = cardHarness(); h.setInline(true);
  const publishedAt = '2026-10-14T12:00:00.000Z';
  const shared = { showCreator: false, showEngagementMetrics: false, creatorHref: '/share/creator' };
  const tree = h.render({ ...shared, project: { ...project, publishedAt } });
  const children = React.Children.toArray(tree.props.children);
  const frameIndex = children.findIndex(artworkFrame);
  assert.ok(frameIndex >= 0);
  const row = children[frameIndex + 1];
  assert.ok(row && mobileInfo(row), 'Info follows the artwork as an article child');
  const elements = nodes(row);
  const avatar = elements.find(node => node.type === 'creator-avatar');
  assert.equal(avatar?.props.shape, 'squircle');
  assert.equal(avatar?.props.name, creator.name);
  assert.equal(avatar?.props.avatar, creator.avatar);
  assert.ok(textContent(row).includes(project.title));
  assert.ok(textContent(row).includes(creator.name));
  assert.equal(elements.find(node => node.type === 'time')?.props.dateTime, publishedAt);
  assert.equal(elements.filter(detailsButton).length, 1);
  for (const date of [undefined, 'not a date']) {
    const undated = nodes(h.render({ ...shared, project: { ...project, publishedAt: date } })).find(mobileInfo);
    assert.equal(nodes(undated).some(node => node.type === 'time'), false);
  }

  for (const contentTypeLabel of ['Image', 'PDF']) {
    const explore = nodes(h.render({ className: 'explore-feed-card', contentTypeLabel, project: { ...project, publishedAt } }));
    const metadata = explore.find(node => node.props.className === 'mobile-project-info-meta');
    assert.equal(nodes(metadata).find(node => node.type === 'time')?.props.dateTime, publishedAt);
    assert.equal(textContent(metadata).split('·').length, 2, 'The date has a single separator');
    assert.equal(textContent(metadata).includes(contentTypeLabel), false);
    assert.equal(textContent(explore.find(artworkFrame)).includes(contentTypeLabel), false);
  }
});

test('the mobile squircle opens its creator without invoking artwork or project details', () => {
  const h = cardHarness(); h.setInline(true);
  const calls = [];
  const onOpenCreator = () => calls.push('open creator');
  const onWarmCreator = () => calls.push('warm creator');
  const infoElements = props => nodes(nodes(h.render(props)).find(mobileInfo));
  const avatarAction = elements => {
    const actions = elements.filter(node => node.props['aria-label'] === `Open ${creator.name}'s profile`);
    assert.equal(actions.length, 1);
    const [action] = actions;
    assert.ok(action.props.className.includes('mobile-project-info-creator'));
    const children = React.Children.toArray(action.props.children);
    assert.equal(children.length, 1);
    assert.equal(children[0].type, 'creator-avatar');
    assert.equal(children[0].props.shape, 'squircle');
    assert.equal(action.props.onPointerEnter, onWarmCreator);
    assert.equal(action.props.onFocus, onWarmCreator);
    return action;
  };

  const elements = infoElements({ onOpenCreator, onWarmCreator, creatorHref: '/share/creator' });
  const avatar = avatarAction(elements);
  assert.equal(avatar.type, 'button');
  assert.equal(avatar.props.type, 'button');
  avatar.props.onPointerEnter();
  avatar.props.onFocus();
  avatar.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(calls, ['warm creator', 'warm creator', 'open creator']);
  assert.equal(h.openCount(), 0);
  assert.equal(h.detailsCount(), 0);

  const menu = elements.find(detailsButton);
  menu.props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(h.detailsCount(), 1);
  assert.equal(h.openCount(), 0);
  assert.deepEqual(calls, ['warm creator', 'warm creator', 'open creator']);

  for (const [props, destination] of [
    [{ showCreator: false, creatorHref: '/share/creator' }, '/share/creator'],
    [{}, `/p/${creator.id}`],
  ]) {
    const link = avatarAction(infoElements({ ...props, onWarmCreator }));
    assert.equal(link.type, 'link');
    assert.equal(link.props.to, destination);
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
  assert.equal(extension.props.deferUntilExpanded, false);
  assert.ok(!h.imports.includes('./ProjectPreviewExtension'));
  assert.equal((await h.loadExtension()).default, 'loaded-extension');
  assert.ok(h.imports.includes('./ProjectPreviewExtension'));
});

test('deferred WEB detail loading reaches the extension while one-column and MOBILE cards keep their entry behavior', () => {
  const web = cardHarness('web');
  const props = { deferDesktopDetails: true };
  const extension = nodes(web.render(props)).find(node => node.type === web.LazyExtension);
  assert.equal(extension.props.deferUntilExpanded, true);
  web.setInline(true);
  assert.equal(nodes(web.render(props)).some(node => node.type === web.LazyExtension && 'deferUntilExpanded' in node.props), false);
  const mobile = cardHarness('mobile');
  assert.equal(nodes(mobile.render(props)).some(node => node.type === mobile.LazyExtension), false);
});

function extensionHarness(reducedMotion = false) {
  const state = [], effects = [], element = { inert: undefined };
  let cursor = 0;
  const { ProjectPreviewExtension } = load('ProjectPreviewExtension', name => {
    if(name.endsWith('/motion/motion')) return motionFixture;
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

test('Home deferred details mount on first expansion and remain mounted through collapse and reopening', () => {
  const h = extensionHarness(), props = { deferUntilExpanded: true };
  let tree = h.render(props); h.layout();
  assert.equal(tree.props.animate.height, 0);
  assert.equal(nodes(tree).some(node => ['metrics', 'avatar', 'name'].includes(node.type)), false,
    'Collapsed Home cards cannot mount the network-backed metrics or avatar');
  const onOpenComments = () => undefined, onOpenCreator = () => undefined;
  tree = h.render({ ...props, expanded: true, onOpenComments, onOpenCreator }); h.layout();
  assert.equal(nodes(tree).find(node => node.type === 'metrics').props.onOpenComments, onOpenComments);
  assert.equal(h.element.inert, false);
  assert.equal(nodes(tree).find(node => node.props['aria-label'] === "Open Portalite's profile").props.onClick, onOpenCreator);
  tree = h.render(props); h.layout();
  assert.equal(h.element.inert, true);
  assert.equal(nodes(tree).some(node => node.type === 'metrics'), true,
    'Closing preserves resolved detail children for the next preview');
  tree = h.render({ ...props, expanded: true }); h.layout();
  assert.equal(h.element.inert, false);
  assert.equal(tree.props.animate.opacity, 1);
  assert.equal(nodes(tree).find(node => node.type === 'name').props.active, true);
});
