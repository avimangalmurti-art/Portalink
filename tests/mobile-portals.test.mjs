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
const Icon = () => null;
function harness() {
  let presentation = 'mobile';
  let auth = { isAuthenticated: true, viewerProfileId: 'owner', phase: 'authenticated' };
  const { PortalsPage } = compile('../src/features/profile/PortalsPage.tsx', name => {
    if (name === 'react') return React;
    if (name === 'lucide-react') return { ChevronRightIcon: Icon };
    if (name.endsWith('/AuthContext')) return { useAuth: () => auth };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/FeatureInDesignPage')) return { FeatureInDesignPage };
    if (name.endsWith('/StateViews')) return { EmptyState, LoadingState, ErrorState };
    if (name.endsWith('/InterfaceIcon')) return { InterfaceIcon: Icon };
    if (name.endsWith('/categoryIcons')) return { getCategoryIcon: () => Icon };
    throw new Error(`Unexpected import: ${name}`);
  });
  const chosen = [];
  const profile = { id: 'owner', categories: [
    { id: 'typography', label: 'Typography', iconName: 'type' },
    { id: 'design', label: 'Graphic Design', iconName: 'window' },
  ] };
  let continued = 0, retried = 0;
  const props = { profileQuery: { status: 'ready', profile, retry: () => retried++ },
    onboardingStatus: 'ready', onContinue: () => continued++, onSelectCategory: id => chosen.push(id), onBack() {} };
  return { props, chosen, render: () => PortalsPage(props),
    setAuth: patch => { auth = { ...auth, ...patch }; }, setPresentation: value => { presentation = value; },
    get continued() { return continued; }, get retried() { return retried; } };
}
function elements(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(elements)];
}
const find = (tree, type) => elements(tree).find(node => node.type === type);

test('mobile Portals lists the confirmed owner portals in saved order and selects by stable id', () => {
  const h = harness();
  const buttons = elements(h.render()).filter(node => node.type === 'button');
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
  for (const status of ['idle', 'loading']) {
    h.props.profileQuery.status = status;
    assert.ok(find(h.render(), LoadingState));
  }
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
