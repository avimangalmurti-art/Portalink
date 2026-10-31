import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import {sourceModule} from './helpers/source-module.mjs';

const routeMap=sourceModule('src/app/routes.ts',{'../components/navigation':sourceModule('src/components/navigation.ts')});
const routeModel=sourceModule('src/app/useAppRoute.ts',{react:React,'react-router-dom':{},'./routes':routeMap,'../types/engagement':{},'../utils/projectContinuity':{},'../features/profile/cataloguePageNavigation':{}});

const source = ts.createSourceFile('App.tsx', fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
const functions = new Map();
let studioBranch;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer);
  if (ts.isConditionalExpression(node) && node.condition.getText(source) === 'isStudioPageOpen' && node.whenTrue.getText(source).includes('<StudioPage')) studioBranch = node;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(studioBranch, 'App must route Studio on both presentations before the existing WEB Saved destination');

function evaluate(node, context) {
  return vm.runInContext(ts.transpileModule(`(${node.getText(source)})`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
}
function renderRoute(presentation, kind, overrides = {}) {
  const calls = [];
  const context = vm.createContext({
    React, StudioPage: 'studio', SavedPage: 'saved', FeatureInDesignPage: 'placeholder', LoadingState: 'loading',
    presentation, route: { kind }, pathname: `/${kind}`, auth: { isAuthenticated: true, isInitializing: false, phase: 'authenticated', user: { id: 'account-a' } },
    PROTECTED_ROUTE_KINDS: routeModel.PROTECTED_ROUTE_KINDS,
    isSoCalOpen: false, isSharedRoute: false, isProfileEditorRoute: false, activeCategory: null, isSearchOpen: false, isMessagesOpen: false,
    routeStateView: null, isControlCenterOpen: false, iconPickerCategoryId: null,
    routeActivityKind: null, viewedProfileId: null, activeCategoryId: null, activeDestination: 'Today',
    nav: { back: () => calls.push('back') }, openProjectById: (...args) => calls.push(['project', ...args]), requestGlobalPublish: () => calls.push('create'), requestMobilePublish: () => calls.push('create'),
    ...overrides,
  });
  for (const name of ['isCollaborationOpen', 'isPortalsOpen', 'isPortalSearchOpen', 'isInsightsOpen', 'isStudioOpen', 'isSavedOpen', 'isMobileStudioOpen', 'isStudioPageOpen', 'inDesignFeature', 'isActivityOpen', 'personalScreen', 'isProtectedRoute', 'isRouteBlocked', 'screenTransitionKey', 'screenMainClassName']) {
    context[name] = evaluate(declarations.get(name), context);
  }
  return { context, calls, screen: evaluate(studioBranch, context) };
}

test('mobile Studio and saved alias share one account-scoped workspace with existing navigation and profile-only creation', () => {
  const studio = renderRoute('mobile', 'studio');
  const saved = renderRoute('mobile', 'saved');
  for (const result of [studio, saved]) {
    assert.equal(result.screen.type, 'studio');
    assert.equal(result.screen.key, 'account-a');
    assert.equal(result.context.personalScreen, 'Studio');
    assert.equal(result.context.isProtectedRoute, true);
    assert.match(result.context.screenMainClassName, /overflow-hidden/);
    result.screen.props.onBack();
    assert.equal(result.screen.props.onNewProject, result.context.requestMobilePublish);
    result.screen.props.onNewProject();
    result.screen.props.onOpenProject('project-a', { profileId: 'owner', categoryId: 'category-a' });
    assert.deepEqual(result.calls, ['back', 'create', ['project', 'project-a', { profileId: 'owner', categoryId: 'category-a' }]]);
  }
  assert.equal(studio.screen.props.savedRoute, false);
  assert.equal(saved.screen.props.savedRoute, true);
  assert.equal(studio.context.screenTransitionKey, saved.context.screenTransitionKey, 'Category and alias changes remain within Studio');
  const other = renderRoute('mobile', 'studio', { auth: { isAuthenticated: true, isInitializing: false, phase: 'authenticated', user: { id: 'account-b' } } });
  assert.notEqual(other.screen.key, studio.screen.key);
  assert.notEqual(other.context.screenTransitionKey, studio.context.screenTransitionKey);
});

test('WEB Studio opens the existing protected workbench while WEB Saved retains its library', () => {
  const studio = renderRoute('web', 'studio');
  assert.equal(studio.context.isProtectedRoute, true);
  assert.equal(studio.screen.type, 'studio');
  assert.equal(studio.screen.key, 'account-a');
  assert.equal(studio.screen.props.savedRoute, false);
  assert.equal(studio.context.personalScreen, 'Studio');
  assert.equal(studio.context.screenTransitionKey, 'personal-Studio-account-a');
  assert.match(studio.context.screenMainClassName, /overflow-hidden/);
  assert.equal(studio.screen.props.onNewProject, studio.context.requestGlobalPublish);
  studio.screen.props.onBack(); studio.screen.props.onNewProject();
  studio.screen.props.onOpenProject('project-b', { profileId: 'owner', categoryId: 'work' });
  assert.deepEqual(studio.calls, ['back', 'create', ['project', 'project-b', { profileId: 'owner', categoryId: 'work' }]]);
  const saved = renderRoute('web', 'saved');
  assert.equal(saved.context.isProtectedRoute, true);
  assert.equal(saved.screen.type, 'saved');
  assert.equal(saved.context.personalScreen, 'Saved');
  assert.match(saved.context.screenMainClassName, /overflow-y-auto/);
});

test('Studio on both presentations and the MOBILE saved alias keep private workbench content behind transition guards', () => {
  for (const [presentation, kind] of [['mobile','studio'],['mobile','saved'],['web','studio']]) {
    const signedOut = renderRoute(presentation, kind, { auth: { isAuthenticated: false, isInitializing: false, phase: 'unauthenticated', user: null } });
    assert.equal(signedOut.context.isRouteBlocked, true);
    assert.equal(signedOut.screen.type, 'loading', 'The private component never mounts even before the gate renders');
    for (const auth of [
      { isAuthenticated: false, isInitializing: true, phase: 'initializing', user: null },
      { isAuthenticated: true, isInitializing: true, phase: 'initializing', user: { id: 'account-a' } },
      { isAuthenticated: true, isInitializing: false, phase: 'authenticating', user: { id: 'account-a' } },
      { isAuthenticated: true, isInitializing: false, phase: 'signing-out', user: { id: 'account-a' } },
    ]) assert.equal(renderRoute(presentation, kind, { auth }).screen.type, 'loading');
  }
});


test('Studio creation uses the presentation-specific coordinator while WEB Saved and guests retain their existing behavior', () => {
  for (const route of ['studio', 'saved']) {
    const result = renderRoute('mobile', route);
    assert.equal(result.screen.props.onNewProject, result.context.requestMobilePublish);
    result.screen.props.onNewProject();
    assert.deepEqual(result.calls, ['create']);
  }
  const webStudio=renderRoute('web','studio');
  assert.equal(webStudio.screen.props.onNewProject,webStudio.context.requestGlobalPublish);
  assert.equal(renderRoute('web','saved').screen.props.onNewProject,undefined);
  assert.equal(renderRoute('mobile', 'studio', { auth: { isAuthenticated: false, isInitializing: false, phase: 'unauthenticated', user: null } }).screen.props.onNewProject, undefined);
  assert.ok(!source.text.includes('onMobileCreateProject'));
});

test('closing creation restores the mobile trigger without stealing another destination or dialog focus', () => {
  for (const after of ['body', 'other-control', 'another-modal', 'removed-trigger']) {
    const calls = [], frames = [];
    class Element {
      isConnected = true;
      focus(options) { calls.push(['focus', options.preventScroll]); }
    }
    const opener = new Element(), body = {}, doc = { body, activeElement: opener, querySelector: () => after === 'another-modal' ? {} : null };
    const context = vm.createContext({ firstProjectPublisher:false, setProjectSetupAccountId() {}, setMobileRecoveryDraft() {}, setMobileRecoveryError() {}, setProjectSetupMetadata() {}, setPublishResumeDraft() {},setFirstProjectPublisher() {}, setJourneyMadeIn() {}, HTMLElement: Element, document: doc, mobilePublishOpener: { current: null },
      requestGlobalPublish: () => { calls.push('create'); doc.activeElement = body; },
      setIsPublishOpen: value => calls.push(['open', value]), setPublishTargetCategoryId: value => calls.push(['target', value]),
      requestAnimationFrame: frame => frames.push(frame),
    });
    for (const name of ['requestMobilePublish', 'closePublisher']) vm.runInContext(ts.transpileModule(functions.get(name).getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    context.requestMobilePublish();
    assert.equal(context.mobilePublishOpener.current, opener);
    context.closePublisher();
    assert.equal(context.mobilePublishOpener.current, null);
    if (after === 'other-control') doc.activeElement = new Element();
    if (after === 'removed-trigger') opener.isConnected = false;
    frames.forEach(frame => frame());
    assert.deepEqual(calls, ['create', ['open', false], ['target', null], ...(after === 'body' ? [['focus', true]] : [])]);
  }
});
