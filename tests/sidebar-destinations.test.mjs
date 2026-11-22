import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import * as icons from 'lucide-react';
import { sourceModule } from './helpers/source-module.mjs';

const routes = sourceModule('src/app/routes.ts', { '../components/navigation': { navigationDestinations: [] } });

// Execute the actual Sidebar, its local tile components, and the actual MOBILE
// dock. State and unrelated UI boundaries cannot reach accounts or a backend.
function harness({ collapsed = false, authenticated = true, presentation = 'web', theme = 'light', pathname = '/p/owner' } = {}) {
  const calls = [], dockCalls = [];
  const react = { ...React, useEffect() {}, useMemo: factory => factory(), useCallback: callback => callback,
    useRef: initial => ({ current: initial }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  };
  const router = { Link: ({ to, ...props }) => React.createElement('a', { ...props, href: to }), useLocation: () => ({ pathname }) };
  const ui = { InterfaceIcon: 'interface-icon' };
  const { MobileNavigation } = sourceModule('src/presentation/mobile/MobileNavigation.tsx', {
    react, 'react-router-dom': router, 'lucide-react': icons, '../../app/routes': routes,
    '../../components/ui/InterfaceIcon': ui,
    '../../components/PortalRingIcon': { PortalRingIcon: 'portal-ring-icon' },
    './useMobileDockScroll': { useMobileDockScroll: (...args) => dockCalls.push(args) },
    './MobileContextActions': { useMobileActions: () => null },
  });
  const { Sidebar } = sourceModule('src/components/Sidebar.tsx', {
    react, 'react-router-dom': router, 'lucide-react': icons,
    '../features/profile/portalHierarchy': sourceModule('src/features/profile/portalHierarchy.ts'),
    'framer-motion': { Reorder: { Group: 'reorder-group', Item: 'reorder-item' }, useDragControls: () => ({ start() {} }), useReducedMotion: () => true },
    './ui/SavedChangeNotice': { SavedChangeNotice: 'saved-notice' },
    '../presentation/mobile/MobileNavigation': { MobileNavigation },
    '../presentation/usePresentation': { usePresentation: () => presentation },
    '../hooks/useCompactNavigation': { useCompactNavigation: (value, change) => ({ collapsed: value, toggle: () => change(!value), closeCompact() {} }) },
    '../app/routes': routes,
    './profile/categoryIcons': { getCategoryIcon: () => 'category-icon' },
    './PortalRingIcon': { PortalRingIcon: 'portal-ring-icon' },
    './profile/NewCategoryDialog': { NewCategoryDialog: 'new-category-dialog' },
    './profile/CategoryOptionsMenu': { CategoryOptionsMenu: 'category-options-menu' },
    './ui/InterfaceIcon': ui,
    './ui/ResizablePanelHandle': { ResizablePanelHandle: 'resize-handle', useResizablePanelWidth: () => ({ width: 330, updateWidth() {}, commitWidth() {}, resetWidth() {} }) },
    '../utils/panelLayoutDefaults': { panelLayoutDefaults: { navigation: 330 } },
  });
  const props = {
    isHomeActive: false, isSearchActive: false, isPortalinkActive: false, isMessagesActive: false,
    isInsightsActive: false, isActivityActive: false, isSavedActive: false, isStudioActive: false, isPortalSearchActive: false, isProfileActive: false,
    accentColor: '#007aff', isAuthenticated: authenticated, isAuthActionPending: false,
    onSearchOpen: () => calls.push('search'), onControlCenterOpen: () => calls.push('settings'),
    onSignIn: () => calls.push('signIn'), onSignOut: async () => false, onPortalinkOpen: () => calls.push('world'),
    addCategoryRequest: null, liveShow: null, onLeaveShow() {},
    management: { arrangement: { categoryOrder: [], hiddenCategoryIds: [] }, categoryIcons: {}, pending: null },
    onChangeCategoryIcon() {}, isCollapsed: collapsed, onCollapsedChange: value => { props.isCollapsed = value; calls.push(['collapsed', value]); },
    onNavigate: destination => calls.push(['navigate', destination]), onProfileOpen: () => calls.push('profile'), profileHref: '/p/owner',
    onMessagesOpen: (...args) => calls.push(['messages', ...args]), theme, onThemeChange: value => calls.push(['theme', value]),
    viewedProfile: null, activeCategoryId: null, onCategorySelect() {}, isOwnerMode: false,
  };
  return { calls, dockCalls, render: overrides => Sidebar({ ...props, ...overrides }) };
}

function nodes(tree) {
  if (!React.isValidElement(tree)) return [];
  if (typeof tree.type === 'function') return nodes(tree.type(tree.props));
  return [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
}
const controls = tree => nodes(tree).filter(node => node.type === 'a' || node.type === 'button');
const label = node => node.props['aria-label'];
const main = (tree, collapsed) => nodes(tree).find(node => node.type === 'nav' && label(node) === (collapsed ? 'Compact main destinations' : 'Main destinations'));
const footer = tree => nodes(tree).find(node => node.props.className?.split(' ').includes('sidebar-account-footer'));
const named = (tree, name) => controls(tree).find(node => label(node) === name);

test('WEB navigation uses a labelled five-destination main group and separate workspace group', () => {
  const tree = harness().render();
  assert.deepEqual(controls(main(tree, false)).map(label), ['Open Explore', 'Open messages', 'Open Portal search', 'Open Studio', 'Open your profile']);
  const workspace = nodes(tree).find(node => node.type === 'nav' && label(node) === 'Workspace destinations');
  assert.deepEqual(controls(workspace).map(label), ['Open Saved', 'Open Insights', 'Open Activity']);
  for (const item of [...controls(main(tree, false)), ...controls(workspace)]) {
    assert.ok(nodes(item).some(node => node.props.className === 'desktop-navigation-label'), `${label(item)} has a visible label`);
  }
  const navigation = nodes(tree).find(node => node.props['data-desktop-navigation'] !== undefined);
  assert.equal(navigation.props['data-collapsed'], 'false');
  assert.equal(navigation.props.style.width, '330px');
  assert.ok(nodes(tree).some(node => node.type === 'resize-handle'));
  assert.equal(nodes(tree).some(node => node.props.className?.includes('sidebar-network-grid')), false);
});

test('collapsed WEB navigation retains every main and workspace destination in the compact rail', () => {
  const tree = harness({ collapsed: true }).render();
  assert.deepEqual(controls(main(tree, true)).map(label), ['Open Explore', 'Open messages', 'Open Portal search', 'Open Studio', 'Open your profile', 'Open Saved', 'Open Insights', 'Open Activity']);
  assert.ok(controls(main(tree, true)).every(node => node.props.className.includes('desktop-navigation-icon')));
  const navigation = nodes(tree).find(node => node.props['data-desktop-navigation'] !== undefined);
  assert.equal(navigation.props.style.width, '52px');
  assert.equal(nodes(tree).some(node => node.type === 'resize-handle'), false);
});

test('personal WEB links preserve canonical routes, native activation and their own selection flags', () => {
  for (const collapsed of [false, true]) for (const [flag, selected, href, icon] of [
    ['isInsightsActive', 'Open Insights', '/insights', icons.ChartNoAxesColumnIcon],
    ['isPortalSearchActive', 'Open Portal search', '/portal-search', 'portal-ring-icon'],
    ['isStudioActive', 'Open Studio', '/studio', icons.ShapesIcon],
    ['isActivityActive', 'Open Activity', '/notifications', icons.BellIcon],
    ['isSavedActive', 'Open Saved', '/saved', icons.BookmarkIcon],
  ]) {
    const tree = harness({ collapsed }).render({ [flag]: true });
    const selectedItems = controls(tree).filter(node => node.props['aria-current'] === 'page');
    assert.deepEqual(selectedItems.map(label), [selected]);
    assert.equal(selectedItems[0].type, 'a');
    assert.equal(selectedItems[0].props.href, href);
    assert.equal(selectedItems[0].props.onClick, undefined);
    assert.ok(nodes(selectedItems[0]).some(node => node.type === 'interface-icon' && node.props.icon === icon));
    assert.equal(controls(tree).filter(node => label(node) === selected).length, 1);
  }
});

test('WEB rail preserves Settings, Appearance, World and account search callbacks', () => {
  for (const collapsed of [false, true]) for (const theme of ['light', 'dark']) {
    const h = harness({ collapsed, theme }), tree = h.render();
    const themeLabel = `Switch to ${theme === 'light' ? 'dark' : 'light'} appearance`;
    for (const target of ['Open settings', themeLabel, 'Open Portalink world view', 'Search accounts']) named(tree, target).props.onClick();
    assert.deepEqual(h.calls, ['settings', ['theme', theme === 'light' ? 'dark' : 'light'], 'world', 'search']);
    assert.equal(named(tree, 'Open your profile').props.href, '/p/owner');
  }
});

test('signed-out WEB retains disabled personal placeholders and does not expose authenticated destinations', () => {
  for (const collapsed of [false, true]) {
    const h = harness({ collapsed, authenticated: false }), tree = h.render({ isInsightsActive: true, isActivityActive: true, isStudioActive: true, isPortalSearchActive: true });
    for (const unavailable of ['Portals unavailable', 'Studio unavailable']) {
      const item = named(tree, unavailable);
      assert.equal(item.props.disabled, true);
      assert.equal(item.props.onClick, undefined);
      assert.equal(item.props['aria-current'], undefined);
    }
    for (const personal of ['Open Insights', 'Open Activity', 'Open Studio', 'Open Portal search']) assert.equal(named(tree, personal), undefined);
    assert.equal(named(tree, 'Open Saved').props.href, '/saved');
    named(tree, collapsed ? 'Sign in' : 'Sign in to Portalink').props.onClick();
    assert.deepEqual(h.calls, ['signIn']);
  }
});

test('WEB hierarchy preserves collapse and existing Explore, Messages and Profile behavior', () => {
  const h = harness(), props = { profileHref: undefined };
  let tree = h.render(props);
  named(tree, 'Collapse sidebar').props.onClick(); tree = h.render(props);
  assert.ok(main(tree, true));
  named(tree, 'Expand sidebar').props.onClick(); tree = h.render(props);
  assert.ok(main(tree, false));
  for (const target of ['Open Explore', 'Open messages', 'Open your profile', 'Open account profile']) named(tree, target).props.onClick();
  assert.deepEqual(h.calls, [['collapsed', true], ['collapsed', false], ['navigate', 'Today'], ['messages'], 'profile', 'profile']);
});

test('expanded WEB account footer reflects the actual account identity', () => {
  const tree = harness().render({ accountName: 'Example account', accountAvatar: '/account-avatar.jpg' });
  const account = named(tree, 'Open account profile');
  assert.ok(nodes(account).some(node => node.type === 'img' && node.props.src === '/account-avatar.jpg'));
  assert.ok(nodes(account).some(node => node.type === 'span' && node.props.children === 'Example account'));
  assert.equal(named(footer(tree), 'Open account profile').props.onClick, account.props.onClick);
});

test('MOBILE renders its actual five-destination dock without WEB personal links or footer controls', () => {
  for (const authenticated of [true, false]) for (const collapsed of [true, false]) {
    const h = harness({ presentation: 'mobile', authenticated, collapsed });
    const tree = h.render({ isInsightsActive: true, isActivityActive: true, isStudioActive: true, isPortalSearchActive: true, isProfileActive: true });
    const items = controls(tree);
    assert.deepEqual(items.map(label), ['Explore', 'Messages', 'Portal search', 'Studio', 'Profile']);
    assert.equal(items[0].props.href, '/'); assert.equal(items[2].props.href, '/portal-search'); assert.equal(items[3].props.href, '/studio'); assert.equal(items[4].props.href, '/p/owner');
    assert.equal(items[4].props['aria-current'], 'page');
    assert.equal(items[2].type, 'a'); assert.equal(items[2].props.title, 'Portal search');
    assert.equal(items[2].props.onClick, undefined);
    const icon = nodes(items[2]).find(node => node.type === 'interface-icon');
    assert.equal(icon.props.icon, 'portal-ring-icon'); assert.equal(icon.props.weight, 'medium');
    assert.equal(footer(tree), undefined); assert.equal(nodes(tree).some(node => node.type === 'aside'), false);
    items[1].props.onClick();
    assert.deepEqual(h.calls, [['messages', undefined, true]], 'The dock retains its existing fromDock context');
    const profileControl = named(h.render({ profileHref: undefined }), 'Profile'); profileControl.props.onClick();
    assert.equal(h.calls.at(-1), 'profile');
    assert.equal(h.dockCalls.at(-1)[0], true);
  }
});

test('MOBILE portal-search location selects only its center link and keeps native navigation', () => {
  for (const collapsed of [true, false]) {
    const h = harness({ presentation: 'mobile', collapsed, pathname: '/portal-search' });
    const tree = h.render({ isPortalSearchActive: true, isProfileActive: false });
    const items = controls(tree);
    assert.deepEqual(items.filter(node => node.props['aria-current'] === 'page').map(label), ['Portal search']);
    assert.equal(named(tree, 'Profile').props.href, '/p/owner');
    assert.equal(named(tree, 'Portal search').props.href, '/portal-search');
    assert.equal(named(tree, 'Portal search').props.onClick, undefined);
    assert.equal(named(tree, 'Explore').props['aria-current'], undefined);
    assert.deepEqual(h.calls, [], 'Portal search must not fall back to a profile action');
    assert.equal(footer(tree), undefined);
  }
});
