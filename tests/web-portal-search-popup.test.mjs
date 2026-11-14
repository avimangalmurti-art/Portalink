import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

function fixture() {
  const calls = [], query = { status: 'loading', profile: null, retry() { calls.push('retry'); } };
  const { WebPortalSearchPopup } = sourceModule('src/features/portals/WebPortalSearchPopup.tsx', {
    '../projects/projectPortals': sourceModule('src/features/projects/projectPortals.ts'),
    react: { ...React, useMemo: fn => fn(), useRef: current => ({ current }) },
    'lucide-react': { ChevronLeftIcon: 'back-icon' },
    '../../components/profile/PortalProjectPopup': { PortalProjectPopup: 'chooser' },
    '../../components/profile/categoryIcons': { getCategoryIcon: () => 'portal-icon' },
    '../../components/ui/InterfaceIcon': { InterfaceIcon: 'icon' },
    '../../components/ui/ModalPortal': { ModalPortal: 'portal' },
    '../../components/ui/StateViews': { EmptyState: 'empty', ErrorState: 'error' },
    '../profile/useSharedProfileQuery': { useSharedProfileQuery: (...args) => { calls.push(args); return query; } },
    '../../hooks/useModalFocus': { useModalFocus: () => {} },
    './web-portal-search-popup.css': {},
  });
  const portal = { id: 'work', profileId: 'creator', label: 'Work', iconName: 'camera' };
  const profile = { id: 'creator', categories: [{ id: 'work', label: 'Work' }], projects: [
    { id: 'public', categoryId: 'work', title: 'Public' }, { id: 'hidden', categoryId: 'work', title: 'Hidden', isPubliclyVisible: false },
    { id: 'another', categoryId: 'other', title: 'Other portal' },
  ] };
  return { query, calls, portal, profile, render() { return WebPortalSearchPopup({ portal, onClose: () => calls.push('close'), onSelect: (...args) => calls.push(['select', ...args]) }); } };
}

test('WEB portal chooser loads only the chosen public bundle and never requests project originals', () => {
  const h = fixture(), tree = h.render();
  assert.deepEqual(h.calls, [['creator', null, 'work']]);
  assert.equal(tree.props.children.props.role, 'status');
  assert.equal(tree.props.children.props.children.props.className, 'premium-media-loading-mark');
  h.query.status = 'ready'; h.query.profile = h.profile;
  const chooser = h.render();
  assert.equal(chooser.type, 'chooser'); assert.equal(chooser.props.desktopBrowsing, true);
  assert.equal(chooser.props.showCopyLink, true);
  assert.deepEqual(Array.from(chooser.props.profile.projects, item => item.id), ['public', 'another']);
  chooser.props.onSelect('work', 'hidden'); chooser.props.onSelect('other', 'another');
  assert.equal(h.calls.some(call => call[0] === 'select'), false);
  chooser.props.onSelect('work', 'public');
  assert.deepEqual(h.calls.at(-1), ['select', 'creator', 'work', 'public']);
});

test('unavailable or private creators/categories never become chooser rows, and network errors retain retry', () => {
  for (const alter of [profile => ({ ...profile, id: 'other' }), profile => ({ ...profile, isPrivate: true }), profile => ({ ...profile, categories: [] })]) {
    const h = fixture(); h.query.status = 'ready'; h.query.profile = alter(h.profile);
    const status = h.render(); assert.equal(status.props.children.type, 'empty');
  }
  const h = fixture(); h.query.status = 'error';
  const status = h.render(); assert.equal(status.props.children.type, 'error');
  status.props.children.props.onRetry(); assert.equal(h.calls.at(-1), 'retry');
  h.query.status = 'not-found'; assert.equal(h.render().props.children.type, 'empty');
});

test('read-only WEB chooser grid renders real preview labels through an explicit opt-in only', () => {
  const state = { presentation: 'web' };
  const react = { ...React, lazy: () => 'lazy', useState: initial => [initial, () => {}], useRef: current => ({ current }), useCallback: fn => fn };
  const { ProjectIndexList } = sourceModule('src/components/profile/ProjectIndexList.tsx', {
    react, 'react-dom': { createPortal: value => value },
    '../media/MobileProjectPopup': { MobileProjectPopup: 'popup' }, '../../hooks/useMenuFocus': { useMenuFocus: () => ({}) },
    '../../utils/anchoredMenu': { positionAnchoredMenu: () => ({}) },
    '../../features/media/videoPlayback': { videoSources: () => [] },
    '../../features/profile/useInlineProjectContent': { useInlineProjectContent: ({ project }) => ({ project }) },
    'framer-motion': { AnimatePresence: 'presence', motion: {}, Reorder: {}, useDragControls: () => ({}) },
    'lucide-react': new Proxy({}, { get: (_, key) => String(key) }),
    '../ui/InterfaceIcon': { InterfaceIcon: 'icon' }, './TypographyInspector': { TypographyInspector: 'typeface' },
    '../../presentation/usePresentation': { usePresentation: () => state.presentation },
    '../media/ProjectCover': { ProjectCover: 'cover' }, '../../utils/projectPresentation': { getProjectCoverPreview: () => 'public-thumbnail.webp' },
  });
  const props = { projects: [{ id: 'work', title: 'Work', publishedAt: '2026-01-01' }], typefaceStacks: {}, hiddenIds: [], pinnedIds: [], activeProjectId: null,
    isOwner: false, sharedReadOnly: true, mobileLayout: 'grid', onReorder() {}, onToggleHidden() {}, onTogglePinned() {}, onSelect() {} };
  const list = ProjectIndexList({ ...props, readOnlyBrowsing: true });
  assert.equal(list.props['data-web-project-layout'], 'grid');
  const elements = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(elements)] : [];
  const row = elements(list).find(node => typeof node.type === 'function' && node.type.name === 'ProjectLink');
  const label = elements(row.type(row.props)).find(node => typeof node.type === 'function' && node.type.name === 'MobileProjectLabel');
  assert.ok(label);
  const indexCover = elements(label.type(label.props)).find(node => node.type?.name === 'ProjectIndexCover');
  const cover = indexCover.type(indexCover.props);
  assert.equal(cover.props.allowPdfFallback, false); assert.equal(cover.props.allowVideoFallback, false);
  assert.equal(ProjectIndexList(props).props['data-web-project-layout'], undefined);
  state.presentation = 'mobile';
  const mobile = ProjectIndexList({ ...props, readOnlyBrowsing: true });
  assert.equal(mobile.props['data-mobile-project-layout'], 'grid'); assert.equal(mobile.props['data-web-project-layout'], undefined);
});
