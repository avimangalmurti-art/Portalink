import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const shareModel = sourceModule('src/features/sharing/shareModel.ts');
const validation = sourceModule('src/features/profile/validation.ts', { '../sharing/shareModel': shareModel });
const registration = sourceModule('src/features/auth/registration.ts', {
  '../sharing/shareModel': shareModel, '../profile/validation': validation,
});
const profileId = '11111111-1111-4111-8111-111111111111';
const draft = { version: 1, id: '22222222-2222-4222-8222-222222222222', name: 'Test maker',
  handle: 'test.maker', location: '', accentColor: '#0A84FF', hasAvatar: false };
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const setupType = 'lazy:../features/profile/ProfileOnboardingDialog';
const welcomeType = 'lazy:../components/auth/FirstLoginWelcome';

// Exercise the actual visitor component and effects, retaining lazy descendants
// as boundaries. No browser, authentication, profile or network writes occur.
function harness(presentation = 'mobile') {
  const states = [], refs = [], memos = [], effects = [];
  let stateIndex, refIndex, memoIndex, effectIndex, pending, dirty;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = { ...React,
    lazy: loader => `lazy:${loader.toString().match(/require\(['"]([^'"]+)/)?.[1]}`,
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], update => {
        const next = typeof update === 'function' ? update(states[index]) : update;
        if (!Object.is(next, states[index])) { states[index] = next; dirty = true; }
      }];
    },
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useMemo(factory, deps) {
      const index = memoIndex++;
      if (!equal(memos[index]?.deps, deps)) memos[index] = { deps, value: factory() };
      return memos[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const index = effectIndex++;
      if (!equal(effects[index]?.deps, deps)) pending.push(() => {
        effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: callback() };
      });
    },
  };
  let pendingIntent = null;
  const navigations = [];
  const state = { auth: { phase: 'unauthenticated', isAuthenticated: false, isInitializing: false,
    viewerProfileId: null, user: null, session: null, needsProfileSetup: false, pendingView: null,
    peekPendingIntent: () => pendingIntent,
    consumePendingIntent: () => { const value = pendingIntent; pendingIntent = null; return value; },
    closeAuth() { state.auth = { ...state.auth, pendingView: null }; },
  } };
  const route = { kind: 'sharedProfile', profileId };
  const location = { pathname: `/share/${profileId}`, search: '', hash: '', state: null };
  const appearance = { systemTheme: 'light', accentColor: '#0A84FF', systemGray: 'gray',
    highContrast: false, reduceTranslucency: false, chooseMode() {}, chooseAppearance() {} };
  const navigate = (...args) => navigations.push(args);
  const names = (...items) => Object.fromEntries(items.map(name => [name, name]));
  const { VisitorApp } = sourceModule('src/visitor/VisitorApp.tsx', {
    react, 'react-router-dom': { useLocation: () => location, useNavigate: () => navigate },
    '../app/useAppRoute': { useAppRoute: () => route },
    '../app/routes': { buildPath: () => '/profile' },
    '../app/screenModules': { loadVisitorProjectPage: async () => ({ default: 'VisitorProjectPage' }) },
    '../components/ui/StateViews': names('LoadingSkeleton'),
    '../utils/projectContinuity': { beginProjectContinuity() {} },
    '../components/ui/RouteError': { ...names('RouteError'), routeErrorKind: () => 'network' },
    './mobile/SharedPortalPopup': names('SharedPortalPopup'),
    '../features/profile/VisitorPreviewBar': names('VisitorPreviewBar'),
    '../features/profile/visitorPreview': { isOwnVisitorPreview: () => false, visitorPreviewReturn: () => '/' },
    '../features/sharing/shareModel': shareModel,
    './useHandleRoute': { useHandleRoute: route => ({ route, pending: false, error: '' }) },
    '../presentation/AppPresentation': names('AppPresentation'),
    '../presentation/usePresentation': { usePresentation: () => presentation },
    '../presentation/mobile/MobileBackNavigation': names('MobileBackProvider'),
    '../components/profile/SharedProfileSidebar': names('SharedProfileSidebar'),
    '../components/ui/DeferredDialog': names('DeferredDialog', 'DeferredSurface', 'DeferredSurfaceBoundary'),
    '../features/profile/useSharedProfileQuery': { useSharedProfileQuery: () => ({ status: 'ready',
      profile: { id: profileId, name: 'Creator', categories: [], projects: [] }, error: null }) },
    '../contexts/AuthContext': { useAuth: () => state.auth },
    '../hooks/useDeviceAppearance': { useDeviceAppearance: () => appearance },
    '../utils/accentTokens': { resolveAccentTokens: () => ({}) },
    '../utils/macTokens': { resolveMacTokens: () => ({}) },
    '../data/navButtonTokens': { resolveNavButtonTokens: () => ({}) },
    './VisitorProfileGrid': names('VisitorProfileGrid'),
    './mobile/PublicActionSheet': names('PublicActionSheet'),
    '../features/auth/registration': registration,
    '../features/auth/interactionIntent': { interactionIntent: label => ({ kind: 'interaction', label }) },
    '../app/screenTransitions.css': {},
  }, {
    window: { scrollY: 0, scrollTo() {}, addEventListener() {}, removeEventListener() {},
      history: { state: { idx: 1 } }, location: { assign: navigate, replace: navigate } },
    document: { documentElement: { dataset: {}, style: {} }, body: { classList: { toggle() {} } }, querySelector: () => null },
    requestAnimationFrame: callback => { callback(); return 1; },
  });
  const render = () => {
    for (let pass = 0; pass < 12; pass++) {
      stateIndex = refIndex = memoIndex = effectIndex = 0; pending = []; dirty = false;
      const tree = VisitorApp(); pending.forEach(effect => effect());
      if (!dirty) return tree;
    }
    throw new Error('Visitor onboarding did not settle');
  };
  return { state, render, navigations,
    signedIn({ existing = false, verified = true, recovery = false, view = null, accountId = 'new-account' } = {}) {
      const user = { id: accountId, profileId: existing ? 'existing-profile' : '', isEmailVerified: verified, registration: draft };
      state.auth = { ...state.auth, phase: 'authenticated', isAuthenticated: true, user,
        viewerProfileId: user.profileId || null, session: { user, isPasswordRecovery: recovery },
        needsProfileSetup: verified && !existing, pendingView: view };
    },
  };
}

test('new mobile shared registration mounts the keyed welcome before creator setup', () => {
  const h = harness(); h.render(); h.signedIn();
  const tree = h.render(), welcome = nodes(tree).find(node => node.type === welcomeType);
  assert.ok(welcome, 'A confirmed new mobile account must see the introduction.');
  assert.equal(welcome.key, 'new-account'); assert.equal(welcome.props.accountId, 'new-account');
  assert.equal(welcome.props.children.type, setupType);
  assert.equal(welcome.props.children.key, 'new-account');
  assert.equal(nodes(tree).filter(node => node.type === setupType).length, 1);
  assert.deepEqual(h.navigations, [], 'Opening onboarding preserves the requested catalogue.');
});

test('WEB shared registration retains direct creator setup without adding the mobile tour', () => {
  const h = harness('web'); h.render(); h.signedIn();
  const tree = h.render();
  assert.equal(nodes(tree).some(node => node.type === welcomeType), false);
  const surface = nodes(tree).find(node => node.type === 'DeferredSurface');
  assert.equal(surface.props.children.type, setupType);
});

test('existing profiles, unverified accounts and recovery never acquire a mobile tour', () => {
  for (const options of [{ existing: true }, { verified: false }, { recovery: true }, { view: 'resetPassword' }, { view: 'forgotPassword' }]) {
    const h = harness(); h.render(); h.signedIn(options);
    const tree = h.render();
    assert.equal(nodes(tree).some(node => node.type === welcomeType || node.type === setupType), false, JSON.stringify(options));
    assert.deepEqual(h.navigations, []);
  }
});

test('root onboarding distinguishes missing profiles from returning creators and recovery', () => {
  const path = new URL('../src/App.tsx', import.meta.url);
  const source = readFileSync(path, 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
      node.arguments[0]?.getText(ast).includes("auth.isAuthenticated && onboardingStatus === 'required'")) effect = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(effect);
  const hookSource = readFileSync(new URL('../src/features/profile/useProfileOnboarding.ts', import.meta.url), 'utf8');
  const hookAst = ts.createSourceFile('useProfileOnboarding.ts', hookSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statusFunction = hookAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useProfileOnboardingStatus');
  assert.ok(statusFunction);
  const code = ts.transpileModule(`${statusFunction.getText(hookAst)}\nexports.run = () => { const onboardingStatus = useProfileOnboardingStatus(); (${effect.getText(ast)})(); return onboardingStatus; };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [options, expectedStatus, expectedOpens] of [
    [{}, 'required', 1], [{ existing: true }, 'ready', 0], [{ verified: false }, 'not-required', 0],
    [{ recovery: true }, 'required', 0], [{ view: 'resetPassword' }, 'required', 0],
  ]) {
    const h = harness(); h.signedIn(options); let opens = 0; const exports = {};
    vm.runInNewContext(code, { exports, auth: h.state.auth, useAuth: () => h.state.auth, setIsOnboardingOpen: () => opens++ });
    assert.equal(exports.run(), expectedStatus); assert.equal(opens, expectedOpens);
  }
});
