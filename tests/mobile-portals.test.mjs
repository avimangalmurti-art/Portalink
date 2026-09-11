import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function compile(path, require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, require });
  return exports;
}
const EmptyState = () => null, LoadingState = () => null, ErrorState = () => null;
const FeatureInDesignPage = () => null;
const CategoryOptionsMenu = () => null, NewCategoryDialog = () => null;
const MobileReorderList = () => null;
const Icon = () => null;
function harness() {
  let presentation = 'mobile';
  let auth = { isAuthenticated: true, viewerProfileId: 'owner', phase: 'authenticated' };
  const slots = []; let cursor = 0;
  const react = { ...React, useMemo: fn => fn(), useRef: value => ({ current: value }), useEffect() {}, useState: initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  } };
  const { PortalsPage } = compile('../src/features/profile/PortalsPage.tsx', name => {
    if (name === 'react') return react;
    if (name === 'lucide-react') return { ChevronRightIcon: Icon, CheckIcon: Icon, PlusIcon: Icon, XIcon: Icon };
    if (name.endsWith('/AuthContext')) return { useAuth: () => auth };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/FeatureInDesignPage')) return { FeatureInDesignPage };
    if (name.endsWith('/StateViews')) return { EmptyState, LoadingState, ErrorState };
    if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon: Icon };
    if (name.endsWith('/categoryIcons')) return { getCategoryIcon: () => Icon };
    if (name.endsWith('/CategoryOptionsMenu')) return { CategoryOptionsMenu };
    if (name.endsWith('/NewCategoryDialog')) return { NewCategoryDialog };
    if (name.endsWith('/MobileReorderList')) return { MobileReorderList };
    if (name.endsWith('/useCategoryManagement')) return { MAX_CATEGORY_LABEL: 40 };
    throw new Error(`Unexpected import: ${name}`);
  });
  const chosen = [];
  const profile = { id: 'owner', categories: [
    { id: 'typography', label: 'Typography', iconName: 'type' },
    { id: 'design', label: 'Graphic Design', iconName: 'window' },
  ] };
  let continued = 0, retried = 0;
  const props = { profileQuery: { status: 'ready', profile, retry: () => retried++ },
    management: { categoryIcons: {}, arrangement: { categoryOrder: ['typography', 'design'], hiddenCategoryIds: [] },
      pending: null, failure: null, dismissFailure() {}, isLoadingArrangement: false,
      createCategory: async () => null, renameCategory: async () => false },
    theme: 'dark', accentColor: '#ff2d55', onChangeCategoryIcon() {},
    onboardingStatus: 'ready', onContinue: () => continued++, onSelectCategory: id => chosen.push(id), onBack() {} };
  return { props, chosen, render: () => { cursor = 0; return PortalsPage(props); },
    setAuth: patch => { auth = { ...auth, ...patch }; }, setPresentation: value => { presentation = value; },
    get continued() { return continued; }, get retried() { return retried; } };
}
function elements(node) {
  if (!React.isValidElement(node)) return [];
  if (node.type === MobileReorderList) return [node, ...node.props.items.flatMap(item => elements(node.props.renderItem(item, {})))];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}
const find = (tree, type) => elements(tree).find(node => node.type === type);

test('mobile Portals lists the confirmed owner portals in saved order and selects by stable id', () => {
  const h = harness();
  const buttons = elements(h.render()).filter(node => node.type === 'button' && node.props.className === 'mobile-portal-row');
  assert.deepEqual(buttons.map(button => find(button, 'span').props.children), ['Typography', 'Graphic Design']);
  buttons[1].props.onClick();
  assert.deepEqual(h.chosen, ['design']);
});

test('signed-out and profile-setup states continue through the existing account flow', () => {
  const h = harness();
  h.setAuth({ isAuthenticated: false, viewerProfileId: null });
  const guest = h.render();
  assert.equal(find(guest, 'button'), undefined);
  find(guest, EmptyState).props.action.onClick();
  h.setAuth({ isAuthenticated: true });
  h.props.onboardingStatus = 'required';
  find(h.render(), EmptyState).props.action.onClick();
  assert.equal(h.continued, 2);
  h.props.onboardingStatus = 'not-required';
  assert.equal(find(h.render(), EmptyState).props.action, undefined);
});

test('loading, failure, missing profile and empty data never substitute another creator’s portals', () => {
  const h = harness();
  h.setAuth({ isInitializing: true });
  assert.ok(find(h.render(), LoadingState));
  h.setAuth({ isInitializing: false });
  const owner = h.props.profileQuery.profile;
  h.props.profileQuery.profile = null;
  for (const status of ['idle', 'loading']) {
    h.props.profileQuery.status = status;
    assert.ok(find(h.render(), LoadingState));
  }
  h.props.profileQuery.profile = owner;
  h.props.profileQuery.status = 'error';
  find(h.render(), ErrorState).props.onRetry();
  assert.equal(h.retried, 1);
  for (const status of ['ready', 'not-found']) {
    h.props.profileQuery.status = status;
    h.props.profileQuery.profile = { id: 'someone-else', categories: [{ id: 'private', label: 'Private' }] };
    assert.ok(find(h.render(), ErrorState));
    assert.equal(find(h.render(), 'button'), undefined);
  }
  h.props.profileQuery = { ...h.props.profileQuery, status: 'ready', profile: { id: 'owner', categories: [] } };
  assert.ok(find(h.render(), EmptyState));
});

test('WEB retains its existing Portals destination regardless of account state', () => {
  const h = harness();
  h.setPresentation('web');
  assert.equal(h.render().type, FeatureInDesignPage);
  h.setAuth({ isAuthenticated: false });
  assert.equal(h.render().type, FeatureInDesignPage);
});

test('profile entry reuses the owner list and keeps its existing editing controls', () => {
  const h = harness();
  h.props.profileContext = true;
  const tree = h.render();
  assert.deepEqual(Array.from(find(tree, MobileReorderList).props.items, item => item.id), ['typography', 'design']);
  assert.equal(find(tree, MobileReorderList).props.disabled, false);
  assert.equal(elements(tree).filter(node => node.type === CategoryOptionsMenu).length, 2);
  assert.ok(elements(tree).some(node => node.props['aria-label'] === 'Add portal'));
});

test('visitor and guest profile entry shows that creator’s canonical portals without owner actions', () => {
  for (const isAuthenticated of [true, false]) {
    const h = harness();
    h.props.profileContext = true;
    h.props.onboardingStatus = 'required';
    h.setAuth({ isAuthenticated, viewerProfileId: isAuthenticated ? 'viewer' : null });
    h.props.profileQuery.profile = { id: 'creator', name: 'Creator', categories: [
      { id: 'design', label: 'Creator Design', iconName: 'window' },
      { id: 'typography', label: 'Creator Type', iconName: 'type' },
    ] };
    // Another account's arrangement must not reorder or hide the creator's rows.
    h.props.management.arrangement.hiddenCategoryIds = ['design'];
    h.props.management.reorderCategories = () => assert.fail('Visitor tried to reorder');
    const tree = h.render();
    const list = find(tree, MobileReorderList);
    assert.deepEqual(Array.from(list.props.items, item => item.id), ['design', 'typography']);
    assert.equal(list.props.disabled, true);
    list.props.onReorder([...list.props.items].reverse());
    assert.equal(elements(tree).some(node => node.type === CategoryOptionsMenu), false);
    assert.equal(elements(tree).some(node => node.props['aria-label'] === 'Add portal'), false);
    const rows = elements(tree).filter(node => node.props.className === 'mobile-portal-row');
    assert.ok(rows.every(node => node.props['data-hidden'] === undefined));
    rows[0].props.onClick();
    assert.deepEqual(h.chosen, ['design']);
    h.props.profileQuery.status = 'error';
    assert.ok(find(h.render(), ErrorState));
    assert.equal(find(h.render(), MobileReorderList), undefined);
  }
});

test('portal reordering saves the complete ordered IDs through the existing management boundary', async () => {
  const h = harness(), saves = [];
  h.props.management.reorderCategories = async ids => { saves.push(ids); return true; };
  const list = find(h.render(), MobileReorderList);
  assert.equal(list.props.disabled, false);
  list.props.onReorder([...list.props.items].reverse());
  await Promise.resolve();
  assert.deepEqual(saves, [['design', 'typography']]);
  assert.deepEqual(h.chosen, []);
  // No local committed draft conceals a failed save or a later canonical reload.
  assert.deepEqual(Array.from(find(h.render(), MobileReorderList).props.items, item => item.id), ['typography', 'design']);
});

test('portal hold cannot start while editing or saving, and hidden portals keep a separate group', () => {
  const h = harness();
  h.props.management.arrangement.hiddenCategoryIds = ['typography'];
  let list = find(h.render(), MobileReorderList);
  assert.deepEqual(Array.from(list.props.items, item => item.id), ['design', 'typography']);
  assert.equal(list.props.groupForItem(list.props.items[0]), 'visible');
  assert.equal(list.props.groupForItem(list.props.items[1]), 'hidden');
  h.props.management.pending = { kind: 'arrangement' };
  assert.equal(find(h.render(), MobileReorderList).props.disabled, true);
  h.props.management.pending = null;
  elements(h.render()).find(node => node.type === CategoryOptionsMenu).props.onRenameStart();
  assert.equal(find(h.render(), MobileReorderList).props.disabled, true);
});

const byLabel = (tree, label) => elements(tree).find(node => node.props['aria-label'] === label);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('plus creates through management, retains the dialog on failure and opens the confirmed new portal', async () => {
  const h = harness();
  byLabel(h.render(), 'Add portal').props.onClick();
  assert.ok(find(h.render(), NewCategoryDialog));
  find(h.render(), NewCategoryDialog).props.onCreate('My portal', 'camera');
  await flush();
  assert.ok(find(h.render(), NewCategoryDialog));
  assert.deepEqual(h.chosen, []);
  h.props.management.createCategory = async (label, icon) => {
    assert.equal(label, 'My portal'); assert.equal(icon, 'camera');
    return { id: 'created-portal' };
  };
  find(h.render(), NewCategoryDialog).props.onCreate('My portal', 'camera');
  await flush();
  assert.equal(find(h.render(), NewCategoryDialog), undefined);
  assert.deepEqual(h.chosen, ['created-portal']);
});

test('row options edit that portal without navigating and retain rejected rename drafts', async () => {
  const h = harness(); const calls = [];
  h.props.management.toggleCategoryHidden = id => calls.push(['hide', id]);
  h.props.management.deleteCategory = id => calls.push(['delete', id]);
  h.props.management.readDeletionCapability = id => calls.push(['capability', id]);
  h.props.onChangeCategoryIcon = id => calls.push(['icon', id]);
  const menu = elements(h.render()).filter(node => node.type === CategoryOptionsMenu)[1];
  assert.equal(menu.props.mobile, true);
  menu.props.onHideToggle(); menu.props.onChangeIcon(); menu.props.readDeletionCapability();
  assert.deepEqual(calls, [['hide', 'design'], ['icon', 'design'], ['capability', 'design']]);
  assert.deepEqual(h.chosen, []);
  menu.props.onRenameStart();
  byLabel(h.render(), 'Rename Graphic Design').props.onChange({ target: { value: 'New name' } });
  find(h.render(), 'form').props.onSubmit({ preventDefault() {} });
  await flush();
  assert.equal(byLabel(h.render(), 'Rename Graphic Design').props.value, 'New name');
  h.props.management.renameCategory = async (id, label) => { assert.equal(id, 'design'); assert.equal(label, 'New name'); return true; };
  find(h.render(), 'form').props.onSubmit({ preventDefault() {} });
  await flush();
  assert.equal(find(h.render(), 'form'), undefined);
  assert.deepEqual(h.chosen, []);
});

test('pending or unreadable arrangement disables editing, while empty owner profiles retain Add', () => {
  const h = harness();
  h.props.management.arrangementError = 'Unavailable';
  assert.equal(byLabel(h.render(), 'Add portal').props.disabled, true);
  for (const menu of elements(h.render()).filter(node => node.type === CategoryOptionsMenu)) assert.equal(menu.props.disabled, true);
  h.props.management.arrangementError = null;
  h.props.management.pending = { kind: 'create', categoryId: null };
  assert.equal(byLabel(h.render(), 'Add portal').props.disabled, true);
  h.props.management.pending = null;
  h.props.profileQuery.profile.categories = [];
  assert.equal(byLabel(h.render(), 'Add portal').props.disabled, false);
});

test('mobile project index owns the entire width including wider phones and restores without changing preferences', () => {
  const { allocateProjectPanels: allocate } = compile('../src/utils/projectPanelLayout.ts');
  for (const width of [0, 320, 390, 440, 592, 639]) {
    const preferences = [width, true, true, 315, 400, 304, 'response', null, false];
    const before = allocate(...preferences);
    const index = allocate(...preferences, true);
    assert.deepEqual([index.indexWidth, index.workWidth, index.responseWidth], [width, 0, 0]);
    assert.equal(index.singlePanel, 'index');
    assert.equal(index.indexOpen, true);
    assert.equal(index.responseOpen, false);
    assert.deepEqual(allocate(...preferences), before);
  }
});
