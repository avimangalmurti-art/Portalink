import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const panels = sourceModule('src/utils/projectPanelLayout.ts');
const portalBrowsing = sourceModule('src/components/profile/portalProjectBrowsing.ts');
const pageLayout = sourceModule('src/features/projects/pageLayout.ts');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const one = (tree, type) => nodes(tree).find(node => node.type === type);
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && (node.props['aria-label'] === label || node.props.children === label));
const plain = value => JSON.parse(JSON.stringify(value));
const text = tree => React.Children.toArray(tree?.props?.children).map(child => React.isValidElement(child) ? text(child) : String(child)).join('');

function fixture(presentation = 'web', { empty = false } = {}) {
  const alpha = { id: 'alpha', categoryId: 'work', title: 'Alpha project', summary: 'First', design: { pagesPerRow: 4, typefaceId: 'alpha-face' }, attachments: [] };
  const beta = { id: 'beta', categoryId: 'work', title: 'Beta project', summary: 'Second', isPinned: true, design: { pagesPerRow: 2 }, attachments: [] };
  const state = { presentation, width: 1000, project: empty ? null : alpha, categoryId: empty ? 'empty' : undefined, loading: false,
    profile: { id: 'creator', name: 'Creator', categories: [{ id: 'work', label: 'Work' }, { id: 'empty', label: 'Empty portal' }],
      projects: [alpha, { id: 'hidden', categoryId: 'work', title: 'Hidden project', isPubliclyVisible: false, isPinned: true }, beta,
        { id: 'elsewhere', categoryId: 'other', title: 'Other portal project' }],
    },
  };
  const slots = [], calls = [], processingReads = [];
  let cursor = 0;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); },
  };
  const { VisitorProjectPage } = sourceModule('src/visitor/VisitorProjectPage.tsx', {
    react,
    'lucide-react': { ChevronLeftIcon: 'back-icon', ListIcon: 'list-icon', PanelLeftCloseIcon: 'collapse-icon', PanelLeftOpenIcon: 'expand-icon', SearchIcon: 'search-icon', XIcon: 'close-icon' },
    '../presentation/usePresentation': { usePresentation: () => state.presentation },
    '../components/media/ProjectMediaViewer': { ProjectMediaViewer: 'media-viewer' },
    '../components/media/ProjectPagesPerRowControl': { ProjectPagesPerRowControl: 'page-layout-control' },
    '../components/ui/ResizablePanelHandle': { useResizablePanelWidth: () => ({ width: 280, preferredWidth: 280 }) },
    '../features/media/useAssetProcessing': { useAssetProcessing: attachments => { processingReads.push(attachments); return { statuses: {} }; } },
    '../data/typefaces': { getTypefaceStack: id => `typeface:${id}` },
    '../utils/panelLayoutDefaults': { panelLayoutDefaults: { sharedDetails: 280 } },
    '../components/ui/InterfaceIcon': { InterfaceIcon: 'interface-icon' },
    '../components/ui/StateViews': { LoadingSkeleton: 'loading-skeleton' },
    '../hooks/useElementSize': { useElementSize: () => ({ width: state.width, ref: null }) },
    '../utils/projectPanelLayout': panels,
    '../components/profile/ProjectIndexList': { ProjectIndexList: 'project-index' },
    '../components/profile/MobilePortalProjectToolbar': { MobilePortalProjectToolbar: 'portal-toolbar' },
    '../components/profile/portalProjectBrowsing': portalBrowsing,
    '../features/projects/pageLayout': pageLayout,
    '../components/profile/web-reader-spacing.css': {},
  }, { requestAnimationFrame: callback => callback() });
  return { state, alpha, beta, calls, processingReads, render() {
    cursor = 0;
    return VisitorProjectPage({ profile: state.profile, project: state.project, categoryId: state.categoryId, loading: state.loading,
      onBack: () => calls.push('back'), onBackToProfile: () => calls.push('profile'), onSelect: id => calls.push(id), browsing: state.browsing });
  } };
}

test('WEB portal reader opens its public project index beside the read-only selected media', () => {
  const h = fixture(), tree = h.render(), index = one(tree, 'project-index'), viewer = one(tree, 'media-viewer');
  assert.equal(one(tree, 'aside').props['data-collapsed'], false);
  assert.equal(one(tree, 'nav').props['aria-label'], 'Work index');
  assert.deepEqual(index.props.projects.map(project => project.id), ['alpha', 'beta']);
  assert.deepEqual(plain(index.props.pinnedIds), ['beta']);
  assert.equal(index.props.activeProjectId, 'alpha');
  assert.equal(index.props.isOwner, false); assert.equal(index.props.sharedReadOnly, true);
  assert.deepEqual(plain(index.props.hiddenIds), []);
  assert.equal(index.props.onEdit, undefined); assert.equal(index.props.onDelete, undefined);
  assert.equal(viewer.key, 'alpha'); assert.equal(viewer.props.projectId, 'alpha');
  assert.equal(viewer.props.creator, h.state.profile);
  assert.equal(viewer.props.readOnlyShare, true); assert.equal(viewer.props.isOwner, false);
  assert.equal(viewer.props.onPagesPerRowCommit, undefined); assert.equal(viewer.props.onDeleteProject, undefined);
  assert.equal(viewer.props.mobileNavigation, undefined);
  assert.equal(viewer.props.contentTypefaceStack, 'typeface:alpha-face');
  assert.equal(tree.props['data-web-reader-spacing'], '');
  assert.equal(nodes(tree.props.children).filter(node => node.type === 'header').length, 1, 'The index toolbar is the only header outside the media viewer');
  assert.equal(one(tree, 'header'), one(one(tree, 'aside'), 'header'));
  assert.doesNotMatch(text(one(tree, 'header')), /Alpha project/);
  assert.equal(h.processingReads.every(attachments => attachments.length === 0), true, 'Public media never queries owner job tables');
  button(tree, 'Back').props.onClick(); viewer.props.onClose();
  assert.deepEqual(h.calls, ['back', 'back']);
});

test('WEB project index adjusts the public media layout for multi-page work without committing an owner change', () => {
  const h = fixture();
  h.alpha.attachments = [{ id: 'document', kind: 'document' }];
  let tree = h.render();
  assert.equal(one(tree, 'page-layout-control'), undefined, 'Wait for a known page total.');
  one(tree, 'media-viewer').props.onDocumentPageCountResolved('document', 6);
  tree = h.render();
  const slider = one(one(tree, 'header'), 'page-layout-control');
  assert.equal(slider.props.value, 4);
  assert.equal(slider.props.onCommit, undefined);
  slider.props.onChange(2);
  tree = h.render();
  assert.equal(one(tree, 'media-viewer').props.pagesPerRow, 2);
  assert.equal(one(tree, 'page-layout-control').props.value, 2);
  assert.equal(h.alpha.design.pagesPerRow, 4);
  button(tree, 'Close project list').props.onClick();
  tree = h.render();
  assert.equal(one(tree, 'page-layout-control'), undefined);
  assert.ok(button(tree, 'Back'), 'The collapsed rail retains Back.');
  button(tree, 'Project list').props.onClick();
  assert.equal(one(h.render(), 'page-layout-control').props.value, 2);

  h.beta.pageCount = 1;
  h.state.project = h.beta;
  assert.equal(one(h.render(), 'page-layout-control'), undefined);
  h.state.presentation = 'mobile';
  h.state.project = h.alpha;
  assert.equal(one(h.render(), 'page-layout-control'), undefined);
  assert.equal(h.render().props['data-web-reader-spacing'], undefined);
});

test('WEB project selection keeps the index and its case-insensitive search mounted', () => {
  const h = fixture();
  one(h.render(), 'input').props.onChange({ target: { value: 'BETA' } });
  let tree = h.render(), index = one(tree, 'project-index');
  assert.deepEqual(index.props.projects.map(project => project.id), ['beta']);
  index.props.onSelect('beta'); h.state.project = h.beta;
  tree = h.render(); index = one(tree, 'project-index');
  assert.deepEqual(h.calls, ['beta']);
  assert.equal(one(tree, 'aside').props['data-collapsed'], false);
  assert.equal(one(tree, 'input').props.value, 'BETA');
  assert.equal(index.props.activeProjectId, 'beta');
  assert.equal(one(tree, 'media-viewer').key, 'beta');
  one(tree, 'input').props.onChange({ target: { value: 'missing' } });
  tree = h.render();
  assert.deepEqual(one(tree, 'project-index').props.projects, []);
  assert.match(text(one(tree, 'nav')), /No projects match “missing”/);
  assert.equal(one(tree, 'media-viewer').props.projectId, 'beta', 'Filtering the index never silently changes the selected work');
});

test('WEB index collapse and search survive a same-category project change', () => {
  const h = fixture();
  one(h.render(), 'input').props.onChange({ target: { value: 'project' } });
  button(h.render(), 'Close project list').props.onClick();
  h.state.project = h.beta;
  let tree = h.render();
  assert.equal(one(tree, 'aside').props['data-collapsed'], true);
  assert.equal(one(tree, 'project-index'), undefined);
  button(tree, 'Project list').props.onClick(); tree = h.render();
  assert.equal(one(tree, 'input').props.value, 'project');
  assert.equal(one(tree, 'project-index').props.activeProjectId, 'beta');
});

test('a valid empty WEB portal retains its index, title and Back without fabricating a reader', () => {
  const h = fixture('web', { empty: true }), tree = h.render();
  assert.equal(one(tree, 'media-viewer'), undefined);
  assert.equal(one(tree, 'loading-skeleton'), undefined);
  assert.equal(one(tree, 'aside').props['data-collapsed'], false);
  assert.deepEqual(one(tree, 'project-index').props.projects, []);
  assert.equal(one(tree, 'project-index').props.activeProjectId, null);
  assert.equal(one(tree, 'project-index').props.isOwner, false);
  assert.equal(one(tree, 'nav').props['aria-label'], 'Empty portal index');
  assert.equal(text(one(tree, 'h2')), 'No projects in Empty portal');
  assert.match(text(tree), /No work has been published in this portal/);
  assert.match(text(one(tree, 'nav')), /No published projects in this portal/);
  assert.doesNotMatch(text(tree), /No projects match/);
  assert.equal(one(tree, 'section').props['aria-label'], 'Empty portal work');
  button(tree, 'Back').props.onClick(); assert.deepEqual(h.calls, ['back']);
});

test('an uncached WEB project shows reader loading while retaining the portal index and search', () => {
  const h = fixture();
  one(h.render(), 'input').props.onChange({ target: { value: 'BETA' } });
  one(h.render(), 'project-index').props.onSelect('beta');
  h.state.project = null; h.state.categoryId = 'work'; h.state.loading = true;
  let tree = h.render();
  assert.equal(one(tree, 'aside').props['data-collapsed'], false);
  assert.equal(one(tree, 'input').props.value, 'BETA');
  assert.deepEqual(one(tree, 'project-index').props.projects.map(project => project.id), ['beta']);
  assert.equal(one(tree, 'media-viewer'), undefined, 'The previous project is never shown while the next one loads');
  assert.equal(one(tree, 'h2'), undefined, 'Loading never claims the portal is empty');
  assert.equal(one(tree, 'loading-skeleton').props.kind, 'reader');
  assert.equal(one(tree, 'loading-skeleton').props.label, 'Opening shared project…');
  h.state.project = h.beta; h.state.loading = false;
  tree = h.render();
  assert.equal(one(tree, 'loading-skeleton'), undefined);
  assert.equal(one(tree, 'media-viewer').props.projectId, 'beta');
  assert.equal(one(tree, 'media-viewer').props.pagesPerRow, 2);
  assert.equal(one(tree, 'input').props.value, 'BETA');
  assert.equal(one(tree, 'project-index').props.activeProjectId, 'beta');
});

test('MOBILE keeps its closed index, portal toolbar and close-after-selection behavior', () => {
  const h = fixture('mobile');
  let tree = h.render(), viewer = one(tree, 'media-viewer');
  assert.equal(viewer.props.mobileNavigation.isIndexOpen, false);
  assert.equal(one(tree, 'aside'), undefined);
  assert.ok(button(tree, 'Go back'));
  viewer.props.mobileNavigation.onOpenIndex(); tree = h.render(); viewer = one(tree, 'media-viewer');
  assert.equal(viewer.props.mobileNavigation.isIndexOpen, true);
  assert.equal(button(tree, 'Go back'), undefined);
  const index = viewer.props.mobileNavigation.index;
  assert.equal(one(index, 'input'), undefined);
  assert.equal(one(index, 'portal-toolbar').props.sharedReadOnly, true);
  assert.equal(one(index, 'portal-toolbar').props.browsingControls, true);
  assert.equal(one(index, 'portal-toolbar').props.category.label, 'Work');
  assert.deepEqual(Array.from(one(index, 'project-index').props.projects, project => project.id), ['alpha', 'beta']);
  one(index, 'portal-toolbar').props.onBack(); one(index, 'project-index').props.onSelect('beta');
  assert.deepEqual(h.calls, ['profile', 'beta']);
  assert.equal(one(h.render(), 'media-viewer').props.mobileNavigation.isIndexOpen, false);
});

test('MOBILE public reader offers local list/grid and sorting while retaining only published project rows', () => {
  const h = fixture('mobile');
  h.alpha.publishedAt = '2026-01-02T00:00:00Z';
  h.beta.publishedAt = '2026-01-04T00:00:00Z';
  h.state.profile.projects.push({ id: 'gamma', categoryId: 'work', title: 'Aardvark', publishedAt: 'invalid' });
  one(h.render(), 'media-viewer').props.mobileNavigation.onOpenIndex();
  const index = () => one(h.render(), 'media-viewer').props.mobileNavigation.index;
  const ids = tree => Array.from(one(tree, 'project-index').props.projects, project => project.id);
  let tree = index();
  assert.deepEqual(ids(tree), ['beta', 'alpha', 'gamma']);
  assert.equal(one(tree, 'project-index').props.mobileLayout, 'list');
  one(tree, 'portal-toolbar').props.onLayout('grid');
  one(tree, 'portal-toolbar').props.onSort('title');
  tree = index();
  assert.deepEqual(ids(tree), ['gamma', 'alpha', 'beta']);
  assert.equal(one(tree, 'project-index').props.mobileLayout, 'grid');
  one(tree, 'portal-toolbar').props.onSort('saved');
  tree = index();
  assert.deepEqual(ids(tree), ['alpha', 'beta', 'gamma']);
  const list = one(tree, 'project-index');
  assert.equal(list.props.isOwner, false);
  assert.equal(list.props.sharedReadOnly, true);
  assert.deepEqual(Array.from(list.props.hiddenIds), []);
  assert.deepEqual(Array.from(list.props.pinnedIds), ['beta']);
  assert.equal(one(tree, 'portal-toolbar').props.onCreate, undefined);
  assert.equal(one(h.render(), 'media-viewer').props.readOnlyShare, true);
  assert.ok(h.processingReads.every(attachments => attachments.length === 0), 'Browsing never queries owner processing jobs.');
  assert.deepEqual(h.calls, []);
});

test('MOBILE public reader consumes shared browsing preferences and delegates changes without owner callbacks', () => {
  const h = fixture('mobile'), changes = [];
  h.state.browsing = { layout: 'grid', sort: 'title', onLayout: value => changes.push(['layout', value]), onSort: value => changes.push(['sort', value]) };
  one(h.render(), 'media-viewer').props.mobileNavigation.onOpenIndex();
  let index = one(h.render(), 'media-viewer').props.mobileNavigation.index;
  assert.equal(one(index, 'project-index').props.mobileLayout, 'grid');
  assert.equal(one(index, 'portal-toolbar').props.sort, 'title');
  one(index, 'portal-toolbar').props.onLayout('list');
  one(index, 'portal-toolbar').props.onSort('saved');
  assert.deepEqual(changes, [['layout', 'list'], ['sort', 'saved']]);
  h.state.browsing = { ...h.state.browsing, layout: 'list', sort: 'saved' };
  index = one(h.render(), 'media-viewer').props.mobileNavigation.index;
  assert.equal(one(index, 'project-index').props.mobileLayout, 'list');
  assert.equal(one(index, 'portal-toolbar').props.sort, 'saved');
  assert.equal(one(index, 'project-index').props.isOwner, false);
});

test('project density, focus and document counts reset on selection and ignore late prior-reader callbacks', () => {
  for (const presentation of ['web', 'mobile']) {
    const h = fixture(presentation);
    h.alpha.attachments = [{ id: 'document', kind: 'document' }];
    h.beta.attachments = [{ id: 'document', kind: 'document' }];
    const old = one(h.render(), 'media-viewer');
    old.props.onPagesPerRowChange(6); old.props.onDocumentPageCountResolved('document', 12); old.props.onPageFocusModeChange(true);
    let viewer = one(h.render(), 'media-viewer');
    assert.equal(viewer.props.pagesPerRow, 6); assert.equal(viewer.props.pageCount, 12);
    if (presentation === 'mobile') assert.equal(button(h.render(), 'Go back'), undefined);
    h.state.project = h.beta; let tree = h.render(); viewer = one(tree, 'media-viewer');
    assert.equal(viewer.props.pagesPerRow, 2); assert.equal(viewer.props.pageCount, null);
    if (presentation === 'mobile') assert.ok(button(tree, 'Go back'));
    viewer.props.onPagesPerRowChange(5); viewer.props.onDocumentPageCountResolved('document', 8);
    old.props.onPagesPerRowChange(13); old.props.onDocumentPageCountResolved('document', 99); old.props.onPageFocusModeChange(true);
    tree = h.render(); viewer = one(tree, 'media-viewer');
    assert.equal(viewer.props.pagesPerRow, 5); assert.equal(viewer.props.pageCount, 8);
    if (presentation === 'mobile') assert.ok(button(tree, 'Go back'));
    h.state.project = h.alpha; tree = h.render(); viewer = one(tree, 'media-viewer');
    assert.equal(viewer.props.pagesPerRow, 4); assert.equal(viewer.props.pageCount, null, 'Returning creates a fresh reader session for the original project');
    old.props.onDocumentPageCountResolved('document', 99);
    assert.equal(one(h.render(), 'media-viewer').props.pageCount, null);
  }
});

test('a different creator using the same selected project identifier receives fresh media state', () => {
  const h = fixture(); let viewer = one(h.render(), 'media-viewer');
  viewer.props.onPagesPerRowChange(9);
  h.state.profile = { ...h.state.profile, id: 'another-creator' };
  viewer = one(h.render(), 'media-viewer');
  assert.equal(viewer.props.pagesPerRow, 4);
  assert.equal(viewer.props.creator.id, 'another-creator');
});
