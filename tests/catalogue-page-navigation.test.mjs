import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
function fixture(globals = {}) {
  const positions = new Map();
  const api = sourceModule('src/features/profile/cataloguePageNavigation.ts', {
    './cataloguePagePosition': { getCataloguePagePosition: id => positions.get(id) },
  }, globals);
  return { ...api, positions };
}

test('cover, unknown project and invalid positions preserve the existing default reader address', () => {
  const h = fixture(), path = '/p/creator/c/portal/project?visitorPreview=1#work';
  assert.equal(h.withCataloguePageTarget(path, 'project'), path);
  for (const position of [{ index: 0, key: 'cover' }, { index: 0, key: 'cover', attachmentId: 'a', page: 1 },
    { index: -1, key: 'a', attachmentId: 'a' }, { index: Number.NaN, key: 'a', attachmentId: 'a' }, { index: 2, key: 'a' }]) {
    h.positions.set('project', position);
    assert.equal(h.withCataloguePageTarget(path, 'project'), path);
  }
  h.positions.set('other', { index: 3, key: 'other', attachmentId: 'unrelated', page: 3 });
  assert.equal(h.withCataloguePageTarget(path, 'project'), path);
});

test('image and PDF hints use the existing one-based reader contract without changing the remembered page', () => {
  const h = fixture();
  for (const [key, attachmentId, page] of [['image-a:image', 'image-a', 2], ['pdf:page:9', 'pdf', 9]]) {
    const position = { index: 3, key, attachmentId, page };
    h.positions.set('project', position);
    assert.equal(h.withCataloguePageTarget('/p/creator/c/portal/project', 'project'), `/p/creator/c/portal/project?media=${attachmentId}&page=${page}&view=page`);
    assert.deepEqual(position, { index: 3, key, attachmentId, page });
  }
});

test('MOBILE image and document scroll hints address the selected page without requesting isolated focus', () => {
  const h = fixture(), position = { index: 4, key: 'image/a&b:image', attachmentId: 'image/a&b', page: 3 };
  h.positions.set('project', position);
  assert.equal(h.withCataloguePageTarget('/project?visitorPreview=1#work', 'project', undefined, 'scroll'),
    '/project?visitorPreview=1&media=image%2Fa%26b&page=3#work');
  assert.equal(h.withCataloguePageTarget('/project', 'project', undefined, 'focused'), '/project?media=image%2Fa%26b&page=3&view=page');
  assert.deepEqual(position, { index: 4, key: 'image/a&b:image', attachmentId: 'image/a&b', page: 3 });
  for (const key of ['image/a&b:page:4', 'unrelated:image']) {
    assert.equal(h.withCataloguePageTarget('/project', 'project', { ...position, key }, 'scroll'),
      '/project?media=image%2Fa%26b&page=3&view=page', 'Only matching canonical page keys opt into continuous reading.');
  }
  assert.equal(h.withCataloguePageTarget('/project', 'project', { index: 3, key: 'pdf:page:9', attachmentId: 'pdf', page: 9 }, 'scroll'),
    '/project?media=pdf&page=9');
});

test('MOBILE image scroll mode preserves explicit saved targets and deliberate view queries', () => {
  const h = fixture(), position = { index: 3, key: 'image:image', attachmentId: 'image', page: 2 };
  for (const path of ['/project?media=saved&page=7&view=page#citation', '/project?page=7', '/project?media=saved',
    '/project?media=image&page=2&view=page', '/project?media=&page=2&page=3']) {
    assert.equal(h.withCataloguePageTarget(path, 'project', position, 'scroll'), path);
  }
  assert.equal(h.withCataloguePageTarget('/project?view=page#deliberate', 'project', position, 'scroll'),
    '/project?view=page&media=image&page=2#deliberate');
  assert.equal(h.withCataloguePageTarget('/project?view=existing', 'project', position, 'scroll'),
    '/project?view=existing&media=image&page=2');
});

test('other media selects its real attachment without inventing a page or focused-page mode', () => {
  const h = fixture();
  h.positions.set('project', { index: 2, key: 'video', attachmentId: 'video/a&b' });
  assert.equal(h.withCataloguePageTarget('/portalite/c/design/project', 'project'), '/portalite/c/design/project?media=video%2Fa%26b');
});

test('a resolved current position overrides stale memory while an explicit URL target still wins', () => {
  const h = fixture();
  h.positions.set('project', { index: 12, key: 'removed:page:12', attachmentId: 'removed', page: 12 });
  assert.equal(h.withCataloguePageTarget('/project', 'project', { index: 0, key: 'cover' }), '/project');
  assert.equal(h.withCataloguePageTarget('/project?visitorPreview=1#work', 'project', { index: 2, key: 'kept:page:2', attachmentId: 'kept', page: 2 }),
    '/project?visitorPreview=1&media=kept&page=2&view=page#work');
  assert.equal(h.withCataloguePageTarget('/project?media=saved&page=4', 'project', { index: 2, key: 'kept:page:2', attachmentId: 'kept', page: 2 }),
    '/project?media=saved&page=4');
  assert.equal(h.positions.get('project').attachmentId, 'removed', 'Address projection must not mutate remembered state.');
});

test('an explicit saved target always wins, including repeated parameters and partial target queries', () => {
  const h = fixture(); h.positions.set('project', { index: 5, key: 'pdf:page:5', attachmentId: 'pdf', page: 5 });
  for (const path of ['/project?media=other&page=3&view=page#citation', '/project?media=other', '/project?page=4',
    '/project?media=&page=2&page=3', '/project?page=#target']) assert.equal(h.withCataloguePageTarget(path, 'project'), path);
});

test('catalogue target preserves preview/filter query values and the exact hash', () => {
  const h = fixture(); h.positions.set('project', { index: 3, key: 'pdf:page:2', attachmentId: 'pdf', page: 2 });
  assert.equal(h.withCataloguePageTarget('/portalite/c/art/project?visitorPreview=1&filter=recent#section-2', 'project'),
    '/portalite/c/art/project?visitorPreview=1&filter=recent&media=pdf&page=2&view=page#section-2');
  assert.equal(h.withCataloguePageTarget('/project?view=existing#part?x=1', 'project'), '/project?view=existing&media=pdf&page=2#part?x=1');
  for (const href of ['', '//external.test/project', 'https://external.test/project', 'mailto:creator@example.test']) {
    assert.equal(h.withCataloguePageTarget(href, 'project'), href);
  }
});

test('main and shared navigator project entry keeps ownership, transition and replace behavior while addressing the selected page', () => {
  const h = fixture(), calls = [], transitions = [];
  h.positions.set('project', { index: 4, key: 'pdf:page:4', attachmentId: 'pdf', page: 4 });
  const routes = sourceModule('src/app/routes.ts', { '../components/navigation': { navigationDestinations: [] } });
  const routing = sourceModule('src/app/useAppRoute.ts', {
    react: { useMemo: fn => fn(), useRef: value => ({ current: value }) },
    'react-router-dom': { useNavigate: () => (...args) => calls.push(args), useLocation: () => ({ pathname: '/p/creator', search: '', hash: '' }), matchPath: () => null },
    './routes': routes, '../types/engagement': { activityKindFromSlug: value => value, activitySlugForKind: value => value },
    '../utils/projectContinuity': { beginProjectContinuity: id => { transitions.push(id); return true; } },
    '../features/profile/cataloguePageNavigation': h,
  });
  const nav = routing.useRouteNavigator();
  nav.project('creator', 'portal', 'project');
  nav.sharedProject('creator', 'portal', 'project', true);
  assert.deepEqual(plain(calls), [
    ['/p/creator/c/portal/project?media=pdf&page=4&view=page', { replace: false, viewTransition: true }],
    ['/share/creator/c/portal/project?media=pdf&page=4&view=page', { replace: true, viewTransition: false }],
  ]);
  assert.deepEqual(transitions, ['project']);
  nav.project('creator', 'portal', 'other');
  assert.equal(calls.at(-1)[0], '/p/creator/c/portal/other');
});

test('main and shared navigators open catalogue images continuously only on MOBILE', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture(), calls = [], transitions = [];
    const routes = sourceModule('src/app/routes.ts', { '../components/navigation': { navigationDestinations: [] } });
    const routing = sourceModule('src/app/useAppRoute.ts', {
      react: { useMemo: fn => fn(), useRef: value => ({ current: value }) },
      'react-router-dom': { useNavigate: () => (...args) => calls.push(args), useLocation: () => ({ pathname: '/p/creator', search: '', hash: '' }), matchPath: () => null },
      './routes': routes, '../types/engagement': { activityKindFromSlug: value => value, activitySlugForKind: value => value },
      '../utils/projectContinuity': { beginProjectContinuity: id => { transitions.push(id); return true; } },
      '../features/profile/cataloguePageNavigation': h,
    });
    const nav = routing.useRouteNavigator(presentation), mode = presentation === 'mobile' ? '' : '&view=page';
    h.positions.set('project', { index: 4, key: 'image:image', attachmentId: 'image', page: 3 });
    nav.project('creator', 'portal', 'project');
    nav.sharedProject('creator', 'portal', 'project', true);
    assert.deepEqual(plain(calls), [
      [`/p/creator/c/portal/project?media=image&page=3${mode}`, { replace: false, viewTransition: true }],
      [`/share/creator/c/portal/project?media=image&page=3${mode}`, { replace: true, viewTransition: false }],
    ]);
    assert.deepEqual(transitions, ['project']);
    h.positions.set('project', { index: 4, key: 'pdf:page:4', attachmentId: 'pdf', page: 4 });
    nav.project('creator', 'portal', 'project');
    assert.equal(calls.at(-1)[0], `/p/creator/c/portal/project?media=pdf&page=4${mode}`);
  }
});

test('real preview-card href uses the presentation-specific image target and preserves saved-page artwork links', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture(), position = { index: 3, key: 'image:image', attachmentId: 'image', page: 2 };
    h.positions.set('project', position);
    const { ProjectPreviewCard } = sourceModule('src/components/profile/ProjectPreviewCard.tsx', {
      react: { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect() {}, lazy: () => 'lazy-component' },
      'react-router-dom': { Link: 'link' }, 'lucide-react': { MoreHorizontalIcon: 'dots' },
      '../../presentation/usePresentation': { usePresentation: () => presentation },
      '../../hooks/useContentPreview': { useContentPreview: () => ({ expanded: false, events: {}, ref: {}, open: (_event, action) => action() }) },
      '../../utils/projectPresentation': { getProjectAspectRatio: () => 1, getProjectCoverPreview: () => undefined },
      '../../utils/projectContinuity': { projectContinuityStyle: () => ({}), getProjectContinuityArtwork: () => undefined, beginProjectContinuity() {} },
      '../../features/profile/cataloguePagePosition': { getCataloguePagePosition: id => h.positions.get(id), rememberCataloguePagePosition() {} },
      '../../features/profile/cataloguePageNavigation': h,
      '../../features/media/videoPlayback': { videoSources: () => [] },
      '../../features/profile/useInlineProjectContent': { useInlineProjectContent: ({ project }) => ({ project, metadataComplete: true }) },
      './inlineProjectPageModel': { normalizeInlineProjectPosition: (_project, selected) => selected, inlinePositionMatches: () => true },
      './ProjectPageBrowsingContext': { useInlineProjectPages: () => false },
      './CreatorAvatar': { CreatorAvatar: 'creator-avatar' },
      '../media/ProjectCover': { ProjectCover: 'cover' }, './ProjectHoverDetails': { ProjectHoverDetails: 'details' },
      '../ui/InterfaceIcon': { InterfaceIcon: 'icon' }, '../media/MobileProjectPopup': { MobileProjectPopup: 'popup' },
      '../media/warmDocumentRenderer': { warmProjectDocumentRenderer() {} }, './project-preview-actions.css': {},
    });
    const props = { project: { id: 'project', title: 'Photos', attachments: [] }, creator: { id: 'creator', name: 'Creator' },
      href: '/project?visitorPreview=1#photos', onOpen() {}, showCreator: false, showEngagementMetrics: false };
    const links = tree => React.Children.toArray(tree.props.children).flatMap(function visit(node) {
      return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(visit)] : [];
    }).filter(node => node.type === 'link');
    assert.equal(links(ProjectPreviewCard(props))[0].props.to,
      `/project?visitorPreview=1&media=image&page=2${presentation === 'mobile' ? '' : '&view=page'}#photos`);
    assert.equal(links(ProjectPreviewCard({ ...props, href: '/project?media=saved&page=7&view=page', cover: React.createElement('span') }))[0].props.to,
      '/project?media=saved&page=7&view=page');
  }
});

const visitorSource = readFileSync(new URL('../src/visitor/VisitorApp.tsx', import.meta.url), 'utf8');
const visitorTree = ts.createSourceFile('VisitorApp.tsx', visitorSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const visitorCallbacks = {};
function findVisitorCallbacks(node) {
  if (ts.isVariableDeclaration(node) && ['openProject', 'back'].includes(node.name.getText(visitorTree))) visitorCallbacks[node.name.getText(visitorTree)] = node.initializer?.getText(visitorTree);
  if (ts.isCallExpression(node) && node.expression.getText(visitorTree) === 'useLayoutEffect' && node.arguments[0]?.getText(visitorTree).includes('desktopCatalogueOrigin')) {
    visitorCallbacks.returnEffect = node.arguments[0].getText(visitorTree);
  }
  ts.forEachChild(node, findVisitorCallbacks);
}
findVisitorCallbacks(visitorTree);
function visitorCallback(name, context) {
  assert.ok(visitorCallbacks[name], `Exercise the actual VisitorApp ${name} callback.`);
  const code = ts.transpileModule(`(${visitorCallbacks[name]})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(code, context);
}

test('public catalogue entry uses the selected page while preserving preview suffix and one captured WEB origin', () => {
  const calls = [], captures = [], paths = fixture();
  paths.positions.set('project', { index: 3, key: 'pdf:page:3', attachmentId: 'pdf', page: 3 });
  const root = {}, origin = { profileId: 'creator', path: '/portalite?view=projects#work', projectId: 'project' };
  const context = {
    profileId: 'creator', projectId: null, presentation: 'web', catalogueReady: true, catalogueScope: 'creator:guest',
    location: { pathname: '/portalite', search: '?view=projects', hash: '#work' },
    desktopCatalogueOrigin: { current: null }, setPortalPopup: value => calls.push(['popup', value]), setPortalNavigationRequest() {},
    captureCatalogueReaderOrigin: (...args) => { captures.push(args); return origin; },
    document: { querySelector: () => root }, projectReturn: { open: (...args) => calls.push(['open', ...args]) },
    portfolioProjectPath: (_profile, category, project) => `/portalite/c/${category}/${project}`, handleFromPath: () => 'portalite',
    withCataloguePageTarget: paths.withCataloguePageTarget,
  };
  visitorCallback('openProject', context)('art', 'project');
  assert.deepEqual(plain(calls), [['open', '/portalite/c/art/project?media=pdf&page=3&view=page', 'project']]);
  assert.equal(captures.length, 1); assert.equal(captures[0][1], '/portalite?view=projects#work'); assert.equal(captures[0][3], root);
  assert.equal(context.desktopCatalogueOrigin.current.origin, origin);
  context.projectId = 'project'; visitorCallback('openProject', context)('art', 'next');
  assert.equal(captures.length, 1, 'The reader index must not replace the catalogue origin.');
  context.presentation = 'mobile'; visitorCallback('openProject', context)('art', 'project');
  assert.deepEqual(plain(calls.at(-2)), ['popup', null]); assert.equal(captures.length, 1, 'MOBILE retains its existing origin hook.');
});

test('public catalogue callback preserves image selection while MOBILE opens continuous reading and WEB keeps focus', () => {
  for (const presentation of ['mobile', 'web']) {
    const paths = fixture(), calls = [];
    paths.positions.set('project', { index: 4, key: 'image:image', attachmentId: 'image', page: 3 });
    const context = { profileId: 'creator', projectId: null, presentation, catalogueReady: true, catalogueScope: 'creator:guest',
      location: { pathname: '/portalite', search: '', hash: '' }, desktopCatalogueOrigin: { current: null },
      setPortalPopup: value => calls.push(['popup', value]), setPortalNavigationRequest() {},
      captureCatalogueReaderOrigin: () => null, document: { querySelector: () => null },
      projectReturn: { open: (...args) => calls.push(['open', ...args]) },
      portfolioProjectPath: (_profile, category, project) => `/portalite/c/${category}/${project}`, handleFromPath: () => 'portalite',
      withCataloguePageTarget: paths.withCataloguePageTarget };
    visitorCallback('openProject', context)('art', 'project');
    assert.deepEqual(plain(calls.at(-1)), ['open', `/portalite/c/art/project?media=image&page=3${presentation === 'mobile' ? '' : '&view=page'}`, 'project']);
    assert.equal(calls.filter(call => call[0] === 'popup').length, presentation === 'mobile' ? 1 : 0);
    paths.positions.set('project', { index: 4, key: 'pdf:page:3', attachmentId: 'pdf', page: 3 });
    visitorCallback('openProject', context)('art', 'project');
    assert.equal(calls.at(-1)[1], `/portalite/c/art/project?media=pdf&page=3${presentation === 'mobile' ? '' : '&view=page'}`);
  }
});

test('public WEB Back returns to its captured catalogue only within the same creator/account scope', () => {
  const calls = [];
  const context = { settings: false, settingsReturn: null, sharedPortalLink: false, presentation: 'web', profileId: 'creator', projectId: 'project', categoryId: 'art',
    invalidShared: false, handleError: null, profile: { id: 'creator' }, catalogueScope: 'creator:account', readerRoute: true,
    desktopCatalogueOrigin: { current: { scope: 'creator:account', origin: { path: '/portalite?view=projects#work' } } },
    navigate: (...args) => calls.push(args), projectReturn: { close: () => false }, location: { pathname: '/portalite/c/art/project' }, previewSuffix: '',
    portfolioPath: () => '/portalite', handleFromPath: () => 'portalite', window: { history: { state: { idx: 4 } } },
  };
  visitorCallback('back', context)(); assert.deepEqual(plain(calls.at(-1)), ['/portalite?view=projects#work']);
  context.catalogueScope = 'creator:other-account'; visitorCallback('back', context)();
  assert.deepEqual(plain(calls.at(-1)), ['/portalite', { replace: true }], 'Unrelated account scope returns to the creator without reopening an auto-selected portal.');
});

test('public WEB return waits for ready exact-origin composition, restores once and invalidates on scope/presentation changes', () => {
  const restores = [], root = {}, origin = { path: '/portalite?view=projects#work' };
  const context = { presentation: 'web', catalogueScope: 'creator:guest', projectId: 'project', catalogueRoute: false, catalogueReady: false,
    location: { pathname: '/portalite', search: '?view=projects', hash: '#work' }, desktopCatalogueOrigin: { current: { scope: 'creator:guest', origin, pending: false } },
    document: { querySelector: () => root }, restoreCatalogueReaderOrigin: (value, resolve) => { restores.push([value, resolve()]); return () => {}; },
  };
  visitorCallback('returnEffect', context)(); assert.equal(context.desktopCatalogueOrigin.current.pending, true);
  context.projectId = null; context.catalogueRoute = true; visitorCallback('returnEffect', context)(); assert.equal(restores.length, 0);
  context.catalogueReady = true; visitorCallback('returnEffect', context)();
  assert.equal(restores.length, 1); assert.equal(restores[0][0], origin); assert.equal(restores[0][1], root);
  visitorCallback('returnEffect', context)(); assert.equal(restores.length, 1, 'Ordinary renders cannot replay restoration.');
  context.projectId = 'project'; visitorCallback('returnEffect', context)();
  context.projectId = null; context.location.pathname = '/portalite/c/other'; visitorCallback('returnEffect', context)(); assert.equal(restores.length, 1);
  context.catalogueScope = 'other:guest'; visitorCallback('returnEffect', context)(); assert.equal(context.desktopCatalogueOrigin.current, null);
  context.desktopCatalogueOrigin.current = { scope: 'other:guest', origin, pending: true }; context.presentation = 'mobile';
  visitorCallback('returnEffect', context)(); assert.equal(context.desktopCatalogueOrigin.current, null);
});

function scrollFixture() {
  const frames = new Map(), listeners = new Map(), writes = [], focuses = [];
  let next = 0, ready = true, present = true, cardTop = 1100, maximum = Infinity;
  const window = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
  };
  const main = { isConnected: true, scrollTop: 500, scrollLeft: 3,
    getBoundingClientRect: () => ({ top: 30, bottom: 930, width: 1280, height: 900 }),
    scrollTo(value) { writes.push(value); this.scrollTop = Math.min(maximum, value.top); this.scrollLeft = value.left; },
    focus(options) { focuses.push(['main', options]); },
  };
  const opener = { dataset: { projectContinuityId: 'project' },
    closest: () => null,
    getBoundingClientRect: () => ({ top: cardTop - main.scrollTop + 30, bottom: cardTop - main.scrollTop + 430, width: 360, height: 400 }),
    focus(options) { focuses.push(['opener', options]); },
  };
  const other = { dataset: { projectContinuityId: 'other' } };
  const root = { isConnected: true, closest: () => main, querySelectorAll: () => present ? [other, opener] : [other] };
  const h = fixture({ window,
    requestAnimationFrame(callback) { frames.set(++next, callback); return next; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  const paint = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  const settle = () => { for (let i = 0; i < 40 && frames.size; i++) paint(); };
  return { ...h, root, main, opener, writes, focuses, frames, listeners, paint, settle,
    resolve: () => ready ? root : null, ready(value) { ready = value; }, present(value) { present = value; },
    cardTop(value) { cardTop = value; }, maximum(value) { maximum = value; },
  };
}

test('WEB catalogue return restores the same project offset after remount and layout change, then releases its listeners', () => {
  const h = scrollFixture();
  const origin = h.captureCatalogueReaderOrigin('creator', '/portalite?visitorPreview=1#work', 'project', h.root);
  assert.deepEqual(plain(origin), { profileId: 'creator', path: '/portalite?visitorPreview=1#work', projectId: 'project', top: 500, left: 3, anchorTop: 600 });
  h.main.scrollTop = 0; h.cardTop(1180); h.ready(false);
  h.restoreCatalogueReaderOrigin(origin, h.resolve); h.paint(); h.paint(); assert.equal(h.writes.length, 0);
  h.ready(true); h.settle();
  assert.equal(h.main.scrollTop, 580); assert.equal(h.main.scrollLeft, 3);
  assert.deepEqual(plain(h.focuses), [['opener', { preventScroll: true }]]);
  assert.equal(h.frames.size, 0); assert.equal(h.listeners.size, 0);
});

test('WEB return captures and focuses the current inline slide instead of an inert neighboring page', () => {
  const h = scrollFixture(), current = h.opener;
  const hidden = { ...current, closest: () => ({}), focus() { assert.fail('A hidden neighboring slide must never receive focus.'); } };
  h.root.querySelectorAll = () => [hidden, current, hidden];
  const origin = h.captureCatalogueReaderOrigin('creator', '/portalite', 'project', h.root);
  h.main.scrollTop = 0; h.restoreCatalogueReaderOrigin(origin, h.resolve); h.settle();
  assert.deepEqual(plain(h.focuses), [['opener', { preventScroll: true }]]);
});

test('removed or offscreen source cards restore only the contained scroll position and focus the existing main', () => {
  for (const offscreen of [false, true]) {
    const h = scrollFixture();
    if (offscreen) h.cardTop(2000); else h.present(false);
    const origin = h.captureCatalogueReaderOrigin('creator', '/portalite', 'project', h.root);
    assert.equal(origin.anchorTop, null);
    h.main.scrollTop = 0; h.restoreCatalogueReaderOrigin(origin, h.resolve); h.settle();
    assert.equal(h.main.scrollTop, 500); assert.deepEqual(plain(h.focuses), [['main', { preventScroll: true }]]);
  }
  const h = scrollFixture(); assert.equal(h.captureCatalogueReaderOrigin('creator', '/portalite', 'project', null), null);
});

test('WEB restoration is bounded and yields immediately to pointer, scroll or keyboard input', () => {
  for (const type of ['pointerdown', 'touchstart', 'wheel', 'keydown']) {
    const h = scrollFixture(), origin = h.captureCatalogueReaderOrigin('creator', '/portalite', 'project', h.root);
    h.main.scrollTop = 0; h.restoreCatalogueReaderOrigin(origin, h.resolve);
    h.listeners.get(type)(); h.settle();
    assert.equal(h.writes.length, 0); assert.equal(h.frames.size, 0); assert.equal(h.listeners.size, 0);
  }
  const h = scrollFixture(), origin = h.captureCatalogueReaderOrigin('creator', '/portalite', 'project', h.root);
  h.main.scrollTop = 0; h.maximum(20); h.restoreCatalogueReaderOrigin(origin, h.resolve); h.settle();
  assert.equal(h.frames.size, 0); assert.equal(h.listeners.size, 0); assert.ok(h.writes.length <= 36);
});
