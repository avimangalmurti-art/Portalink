import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import * as icons from 'lucide-react';
import { sourceModule } from './helpers/source-module.mjs';

const routes = sourceModule('src/app/routes.ts', { '../components/navigation': { navigationDestinations: [] } });

// Execute the actual Sidebar, its local tile components, and the actual MOBILE
// dock. State and unrelated UI boundaries cannot reach accounts or a backend.
function harness({ collapsed = false, authenticated = true, presentation = 'web', theme = 'light' } = {}) {
  const calls = [], dockCalls = [];
  const react = { ...React, useEffect() {}, useMemo: factory => factory(), useCallback: callback => callback,
    useRef: initial => ({ current: initial }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  };
  const router = { Link: ({ to, ...props }) => React.createElement('a', { ...props, href: to }), useLocation: () => ({ pathname: '/p/owner' }) };
  const ui = { InterfaceIcon: 'interface-icon' };
  const { MobileNavigation } = sourceModule('src/presentation/mobile/MobileNavigation.tsx', {
    react, 'react-router-dom': router, 'lucide-react': icons, '../../app/routes': routes,
    '../../components/ui/InterfaceIcon': ui,
    './useMobileDockScroll': { useMobileDockScroll: (...args) => dockCalls.push(args) },
    './MobileContextActions': { useMobileActions: () => null },
  });
  const { Sidebar } = sourceModule('src/components/Sidebar.tsx', {
    react, 'react-router-dom': router, 'lucide-react': icons,
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
    isInsightsActive: false, isActivityActive: false, isSavedActive: false, isStudioActive: false, isPortalSearchActive: false, isProfileActive: false, isSoCalActive: false,
    accentColor: '#007aff', isAuthenticated: authenticated, isAuthActionPending: false,
    onSearchOpen: () => calls.push('search'), onControlCenterOpen: () => calls.push('settings'),
    onSignIn: () => calls.push('signIn'), onSignOut: async () => false, onPortalinkOpen: () => calls.push('world'),
    addCategoryRequest: null, liveShow: null, onLeaveShow() {},
    management: { arrangement: { categoryOrder: [], hiddenCategoryIds: [] }, categoryIcons: {}, pending: null },
    onChangeCategoryIcon() {}, isCollapsed: collapsed, onCollapsedChange: value => { props.isCollapsed = value; calls.push(['collapsed', value]); },
    onNavigate: destination => calls.push(['navigate', destination]), onProfileOpen: () => calls.push('profile'), profileHref: '/p/owner',
    onSoCalOpen: (...args) => calls.push(['socal', ...args]),
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

test('authenticated WEB destinations place Insights first and Portal search fifth in expanded and collapsed navigation', () => {
  for (const collapsed of [false, true]) {
    const tree = harness({ collapsed }).render(), nav = main(tree, collapsed), items = controls(nav);
    assert.deepEqual(items.map(label), ['Open Insights', 'Open Saved', 'Open Portalink world view', 'Open Home', 'Open Portal search', 'Search accounts', 'Open messages', 'Open your profile']);
    assert.equal(items[0].type, 'a'); assert.equal(items[0].props.href, '/insights'); assert.equal(items[0].props.title, 'Insights');
    assert.equal(items[4].type, 'a'); assert.equal(items[4].props.href, '/portal-search'); assert.equal(items[4].props.title, 'Portal search');
    assert.ok(nodes(items[4]).some(node => node.type === 'interface-icon' && node.props.icon === 'portal-ring-icon'));
    assert.equal(items[4].props.onClick, undefined, 'Portal search retains native Router link activation');
    assert.equal(items[1].props.href, '/saved'); assert.equal(items[7].props.href, '/p/owner');
    assert.equal(items.some(node => node.props.disabled), false, 'Both former inactive slots now hold usable links');
    assert.ok(items.every(node => node.props['aria-current'] === undefined));
    if (!collapsed) {
      const rows = nodes(nav).filter(node => node.props.role === 'group');
      assert.deepEqual(rows.map(row => controls(row).map(label)), [items.slice(0, 4).map(label), items.slice(4).map(label)]);
    }
    assert.equal(controls(tree).filter(node => label(node) === 'Open Insights').length, 1);
    assert.equal(controls(tree).filter(node => label(node) === 'Open Portal search').length, 1);
    assert.equal(controls(tree).filter(node => label(node) === 'Open Activity').length, 1);
  }
});

test('personal links retain their own active flags and canonical routes in both WEB rail sizes', () => {
  for (const collapsed of [false, true]) for (const [flag, selected, path] of [
    ['isInsightsActive', 'Open Insights', '/insights'], ['isPortalSearchActive', 'Open Portal search', '/portal-search'],
  ]) {
    const tree = harness({ collapsed }).render({ [flag]: true });
    const selectedItems = controls(main(tree, collapsed)).filter(node => node.props['aria-current'] === 'page');
    assert.deepEqual(selectedItems.map(label), [selected]);
    assert.equal(selectedItems[0].props.href, path);
    assert.match(selectedItems[0].props.className, collapsed ? /surface-selected/ : /font-semibold/,
      'Each existing tile variant retains its selected presentation');
    assert.ok(controls(footer(tree)).every(node => node.props['aria-current'] === undefined), 'Footer destinations never inherit unrelated route selection');
  }
});

test('authenticated WEB footer places Activity after Studio while preserving Settings and Appearance order', () => {
  for (const collapsed of [false, true]) for (const theme of ['light', 'dark']) {
    const h = harness({ collapsed, theme }), tree = h.render(), items = controls(footer(tree));
    assert.deepEqual(items.map(label), ['Open settings', 'Open Studio', 'Open Activity', `Switch to ${theme === 'light' ? 'dark' : 'light'} appearance`]);
    for (const [index, href, title, icon] of [[1, '/studio', 'Studio', icons.WarehouseIcon], [2, '/notifications', 'Activity', icons.BellIcon]]) {
      const destination = items[index];
      assert.equal(destination.type, 'a'); assert.equal(destination.props.disabled, undefined);
      assert.equal(destination.props.href, href); assert.equal(destination.props.title, title);
      assert.equal(destination.props.onClick, undefined, 'Router links keep native activation and modified-click behavior');
      assert.equal(destination.props['aria-current'], undefined);
      assert.match(destination.props.className, collapsed ? /sidebar-rail-slot/ : /sidebar-primary-control/);
      assert.ok(nodes(destination).some(node => node.type === 'interface-icon' && node.props.icon === icon));
    }
    items[0].props.onClick(); items[3].props.onClick();
    assert.deepEqual(h.calls, ['settings', ['theme', theme === 'light' ? 'dark' : 'light']]);
  }
});

test('signed-out WEB preserves upper inactive Portals and Studio without exposing personal destination links or footer markers', () => {
  for (const collapsed of [false, true]) {
    const h = harness({ collapsed, authenticated: false }), tree = h.render({ isInsightsActive: true, isActivityActive: true, isStudioActive: true, isPortalSearchActive: true });
    const items = controls(main(tree, collapsed));
    assert.deepEqual(items.map(label), ['Portals unavailable', 'Open Saved', 'Open Portalink world view', 'Open Home', 'Studio unavailable', 'Search accounts', 'Open messages', 'Open your profile']);
    assert.equal(items[0].props.disabled, true); assert.equal(items[4].props.disabled, true);
    assert.equal(items[0].props.onClick, undefined); assert.equal(items[4].props.onClick, undefined);
    assert.equal(named(tree, 'Open Insights'), undefined); assert.equal(named(tree, 'Open Activity'), undefined);
    assert.equal(named(tree, 'Open Studio'), undefined); assert.equal(named(tree, 'Open Portal search'), undefined);
    assert.deepEqual(controls(footer(tree)).map(label), ['Open settings', 'Switch to dark appearance']);
    assert.equal(controls(tree).filter(node => label(node) === 'Portals unavailable').length, 1);
    assert.equal(controls(tree).filter(node => label(node) === 'Studio unavailable').length, 1);
  }
});

test('the WEB swap preserves collapse and existing Home, world, search, messages and profile behavior', () => {
  const h = harness(), props = { profileHref: undefined };
  let tree = h.render(props);
  named(tree, 'Collapse sidebar').props.onClick(); tree = h.render(props);
  assert.ok(main(tree, true));
  named(tree, 'Expand sidebar').props.onClick(); tree = h.render(props);
  assert.ok(main(tree, false));
  for (const target of ['Open Home', 'Open Portalink world view', 'Search accounts', 'Open messages', 'Open your profile']) named(tree, target).props.onClick();
  assert.deepEqual(h.calls, [['collapsed', true], ['collapsed', false], ['navigate', 'Today'], 'world', 'search', ['messages'], 'profile']);
});

test('MOBILE renders its actual five-destination dock without WEB personal links or footer controls', () => {
  for (const authenticated of [true, false]) for (const collapsed of [true, false]) {
    const h = harness({ presentation: 'mobile', authenticated, collapsed });
    const tree = h.render({ isInsightsActive: true, isActivityActive: true, isStudioActive: true, isPortalSearchActive: true, isProfileActive: true });
    const items = controls(tree);
    assert.deepEqual(items.map(label), ['Explore', 'Messages', 'SoCal', 'Studio', 'Profile']);
    assert.equal(items[0].props.href, '/'); assert.equal(items[3].props.href, '/studio'); assert.equal(items[4].props.href, '/p/owner');
    assert.equal(items[4].props['aria-current'], 'page');
    assert.equal(items[2].type, 'button'); assert.equal(items[2].props.title, 'SoCal');
    const icon = nodes(items[2]).find(node => node.type === 'interface-icon');
    assert.equal(icon.props.icon, icons.CalendarDaysIcon); assert.equal(icon.props.weight, 'medium');
    assert.equal(footer(tree), undefined); assert.equal(nodes(tree).some(node => node.type === 'aside'), false);
    items[1].props.onClick();
    assert.deepEqual(h.calls, [['messages', undefined, true]], 'The dock retains its existing fromDock context');
    const profileControl = named(h.render({ profileHref: undefined }), 'Profile'); profileControl.props.onClick();
    assert.equal(h.calls.at(-1), 'profile');
    assert.equal(h.dockCalls.at(-1)[0], true);
  }
});

test('MOBILE forwards the explicit SoCal action without an event and selects only the SoCal destination', () => {
  for (const collapsed of [true, false]) {
    const h = harness({ presentation: 'mobile', collapsed });
    const tree = h.render({ isSoCalActive: true, isProfileActive: false });
    const items = controls(tree);
    assert.deepEqual(items.filter(node => node.props['aria-current'] === 'page').map(label), ['SoCal']);
    assert.equal(named(tree, 'Profile').props.href, '/p/owner');
    named(tree, 'SoCal').props.onClick({ type: 'click', target: { accountId: 'unrelated' } });
    assert.deepEqual(h.calls, [['socal']], 'The action chooses its own account in App instead of receiving the click event');
    assert.equal(footer(tree), undefined);
  }
});

test('optional SoCal callers use the existing profile fallback while WEB exposes no new destination', () => {
  const mobile = harness({ presentation: 'mobile' });
  const tree = mobile.render({ onSoCalOpen: undefined });
  assert.equal(named(tree, 'SoCal').props['aria-current'], undefined);
  named(tree, 'SoCal').props.onClick({ type: 'click' });
  assert.deepEqual(mobile.calls, ['profile']);
  for (const collapsed of [true, false]) {
    const web = harness({ presentation: 'web', collapsed });
    const webTree = web.render({ isSoCalActive: true });
    assert.equal(named(webTree, 'SoCal'), undefined);
    assert.deepEqual(controls(main(webTree, collapsed)).map(label), ['Open Insights', 'Open Saved', 'Open Portalink world view', 'Open Home', 'Open Portal search', 'Search accounts', 'Open messages', 'Open your profile']);
    assert.deepEqual(controls(footer(webTree)).map(label), ['Open settings', 'Open Studio', 'Open Activity', 'Switch to dark appearance']);
    assert.deepEqual(web.calls, []);
  }
});


test('WEB footer destinations use only their own active flags in either sidebar size', () => {
  for (const collapsed of [false, true]) for (const [flag, selected, href] of [
    ['isStudioActive', 'Open Studio', '/studio'], ['isActivityActive', 'Open Activity', '/notifications'],
  ]) {
    const tree = harness({ collapsed }).render({ [flag]: true });
    const selectedItems = controls(footer(tree)).filter(node => node.props['aria-current'] === 'page');
    assert.deepEqual(selectedItems.map(label), [selected]);
    assert.equal(selectedItems[0].props.href, href);
    assert.match(selectedItems[0].props.className, collapsed ? /surface-selected/ : /font-semibold/);
    assert.ok(controls(main(tree, collapsed)).every(node => node.props['aria-current'] === undefined), 'Footer routes cannot select a main destination');
    assert.equal(controls(tree).filter(node => label(node) === selected).length, 1);
  }
});
