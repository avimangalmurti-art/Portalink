import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { matchPath } from 'react-router-dom';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const account = (extra = {}) => ({ user: { id: 'account', profileId: 'owner', isEmailVerified: true }, isPrototype: false, ...extra });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function hooks() {
  const frames = new Map();
  let frame, cursor, dirty = false;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = { ...React,
    useState(initial) {
      const owner = frame, index = cursor++;
      if (!(index in owner.slots)) owner.slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [owner.slots[index].value, value => {
        const next = typeof value === 'function' ? value(owner.slots[index].value) : value;
        if (!Object.is(next, owner.slots[index].value)) { owner.slots[index].value = next; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return frame.slots[index] ??= { current: initial }; },
    useMemo(factory, deps) { const index = cursor++; if (!same(frame.slots[index]?.deps, deps)) frame.slots[index] = { deps, value: factory() }; return frame.slots[index].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const owner = frame, index = cursor++, old = owner.slots[index];
      if (!same(old?.deps, deps)) {
        owner.slots[index] = { deps };
        owner.effects.push(() => { old?.cleanup?.(); owner.slots[index].cleanup = effect(); });
      }
    },
  };
  return { react,
    begin() { dirty = false; }, get dirty() { return dirty; },
    render(key, component) {
      frame = frames.get(key) ?? { slots: [], effects: [] }; frames.set(key, frame); cursor = 0;
      const tree = component();
      frame.effects.splice(0).forEach(effect => effect());
      return tree;
    },
  };
}

const routes = sourceModule('src/app/routes.ts', { '../components/navigation': { navigationDestinations: [] } });
const engagement = sourceModule('src/types/engagement.ts');
const authTypes = sourceModule('src/types/auth.ts');
const accent = sourceModule('src/utils/accentTokens.ts');
const mac = sourceModule('src/utils/macTokens.ts');
const navTokens = sourceModule('src/data/navButtonTokens.ts');

/** Real auth state, route parsing and boundary; protected children are observable. */
function fixture({ presentation = 'mobile', path = '/', restored = null, restorationError = null, recoveryReturn = false, appearance: patch = {} } = {}) {
  const runtime = hooks(), requests = [], navigations = [], children = [], bodyClasses = new Set(), portals = [], lazy = [];
  const state = { presentation, location: new URL(path, 'https://portalink.example.test'), auth: null, tree: null, host: null, reads: 0, signIn: deferred(), authEvent: null };
  const appearance = { theme: 'dark', accentColor: '#FF453A', systemGray: '#8e8e93', highContrast: true, reduceTranslucency: true, ...patch,
    chooseAppearance(value) { Object.assign(appearance, value); },
  };
  const document = {
    activeElement: null, documentElement: { dataset: {}, style: {} },
    body: { classList: { toggle(name, active) { if (active) bodyClasses.add(name); else bodyClasses.delete(name); } } },
    querySelector(selector) { assert.equal(selector, '.app-shell'); return state.host?.props.className.includes('app-shell') ? state.host : null; },
  };
  const service = {
    getSession: async () => { if (restorationError) throw restorationError; return restored; },
    onAuthStateChange(callback) { state.authEvent = callback; return () => { state.authEvent = null; }; },
    signIn: () => state.signIn.promise, signOut: async () => {},
  };
  const { AuthProvider } = sourceModule('src/contexts/AuthContext.tsx', {
    react: runtime.react, './ServicesContext': { useServices: () => ({ auth: service }) }, '../types/auth': authTypes,
    '../utils/passwordRecoveryReturn': { isPasswordRecoveryReturn: () => recoveryReturn, clearPasswordRecoveryReturn() {} },
  }, { window: { location: { href: state.location.href } }, document, HTMLElement: class {} });
  const navigate = (destination, options) => {
    navigations.push([destination, plain(options ?? {})]);
    state.location = new URL(destination, state.location);
  };
  const routeHooks = sourceModule('src/app/useAppRoute.ts', {
    react: runtime.react, 'react-router-dom': { matchPath, useLocation: () => state.location, useNavigate: () => navigate },
    './routes': routes, '../types/engagement': engagement,
    '../utils/projectContinuity': { beginProjectContinuity() {} },
    '../features/profile/cataloguePageNavigation': { withCataloguePageTarget: value => value },
  });
  const AuthDialog = () => null;
  const react = { ...runtime.react, lazy(loader) { const component = () => null; component.load = loader; lazy.push(component); return component; } };
  const { AccountEntryBoundary } = sourceModule('src/app/AccountEntryBoundary.tsx', {
    react, 'react-router-dom': { useLocation: () => state.location, useNavigate: () => navigate },
    '../contexts/AuthContext': { useAuth: () => ({ ...state.auth,
      requestAuthenticatedDestination(intent, view) { requests.push(plain(intent)); state.auth.requestAuthenticatedDestination(intent, view); },
    }) },
    '../components/ui/DeferredDialog': { DeferredDialog: 'DeferredDialog' },
    '../features/auth/SessionStatusBanner': { SessionStatusBanner: 'SessionStatusBanner' },
    '../hooks/useDeviceAppearance': { useDeviceAppearance: value => { assert.equal(value, state.presentation); return appearance; } },
    '../presentation/AppPresentation': { AppPresentation: 'AppPresentation' },
    '../presentation/usePresentation': { usePresentation: () => state.presentation },
    '../utils/accentTokens': accent, '../utils/macTokens': mac, '../data/navButtonTokens': navTokens,
    './useAppRoute': routeHooks, '../features/auth/AuthDialog': { AuthDialog },
  }, { document });
  const { ModalPortal } = sourceModule('src/components/ui/ModalPortal.tsx', {
    react: React, 'react-dom': { createPortal(content, target) { const portal = { content, target }; portals.push(portal); return portal; } },
  }, { document });
  function render() {
    for (let pass = 0; pass < 12; pass++) {
      runtime.begin();
      state.auth = runtime.render('provider', () => AuthProvider({ children: null })).props.value;
      state.tree = runtime.render('boundary', () => AccountEntryBoundary({ children: flag => {
        children.push(flag); state.reads++;
        return React.createElement('AppContent', { accountEntrySignIn: flag });
      } }));
      state.host = state.tree.type === 'AppContent' ? null : runtime.render('host', () => state.tree.type(state.tree.props));
      if (!runtime.dirty) return state.tree;
    }
    assert.fail('Account entry did not settle');
  }
  return { state, requests, navigations, children, bodyClasses, document, portals, appearance, AuthDialog, lazy, render,
    async flush() { render(); await tick(); return render(); },
    emit(session) { state.authEvent(session); },
    portal(content) { return ModalPortal({ children: content }); },
    go(path) { state.location = new URL(path, state.location); return render(); },
  };
}

const elements = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(elements)];

for (const presentation of ['mobile', 'web']) {
  test(`${presentation}: signed-out Home, legacy guest links and protected destinations never invoke app children`, async () => {
    for (const path of ['/', '/?guest=world', '/?guest=search&q=Portal', '/?guest=profile', '/search?q=Portal#people', '/portalink/city', '/p/creator?view=portals#bio', '/messages?conversation=thread#latest', '/studio', '/portals', '/unrecognized']) {
      const h = fixture({ presentation, path });
      await h.flush();
      assert.equal(h.children.length, 0, path);
      assert.equal(h.state.reads, 0, path);
      assert.equal(h.state.host.props['data-account-entry-only'], '');
      assert.equal(h.state.host.props.showFloatingActions, false);
      assert.equal(h.state.location.pathname + h.state.location.search + h.state.location.hash, path);
      assert.equal(h.requests.length, path.startsWith('/?') || path === '/' ? 0 : 1);
    }
  });

  test(`${presentation}: protected query/hash survive the gate and cancellation does not reopen it`, async () => {
    const path = '/messages?conversation=thread&recipient=creator#latest';
    const h = fixture({ presentation, path });
    await h.flush();
    assert.deepEqual(h.requests, [{ kind: 'route', path, label: 'read your messages' }]);
    assert.equal(h.state.auth.peekPendingIntent().path, path);
    assert.equal(h.state.auth.pendingView, 'signIn');
    h.state.auth.closeAuth(); h.render(); h.render();
    assert.equal(h.state.auth.pendingView, null);
    assert.equal(h.state.auth.peekPendingIntent(), null);
    assert.equal(h.requests.length, 1);
    assert.equal(h.state.reads, 0);
    assert.deepEqual(h.navigations, []);
  });

  test(`${presentation}: entry uses the existing themed auth host and ModalPortal target`, async () => {
    const h = fixture({ presentation }); await h.flush();
    h.state.auth.requestAuth('signUp'); h.render();
    assert.equal(h.document.documentElement.dataset.appearance, 'dark');
    assert.equal(h.document.documentElement.style.colorScheme, 'dark');
    assert.ok(h.bodyClasses.has('theme-dark') && h.bodyClasses.has('high-contrast') && h.bodyClasses.has('reduce-translucency'));
    assert.equal(h.state.host.props.style['--mac-accent'], h.appearance.accentColor);
    const dialog = elements(h.state.host).find(node => node.type === 'DeferredDialog');
    assert.equal(dialog.props.active, true);
    const form = dialog.props.children;
    assert.equal((await form.type.load()).default, h.AuthDialog);
    assert.equal(form.props.theme, 'dark');
    assert.equal(form.props.highContrast, true);
    assert.equal(form.props.reduceTranslucency, true);
    form.props.onHighContrastChange(false); assert.equal(h.appearance.highContrast, false);
    const portal = h.portal(form);
    assert.equal(portal.target, h.state.host);
    assert.equal(portal.content, form);
    dialog.props.onClose(); h.render();
    assert.equal(h.state.auth.pendingView, null);
    assert.equal(h.state.reads, 0);
  });

  test(`${presentation}: explicit public catalogues, collaboration and preferences remain outside the gate`, async () => {
    for (const path of ['/share/creator', '/share/creator/c/art', '/share/creator/c/art/project?page=2#page', '/share/creator/collaboration', routes.routes.controlCenter.path, '/appearance']) {
      const h = fixture({ presentation, path }); await h.flush();
      assert.equal(h.state.tree.type, 'AppContent', path);
      assert.ok(h.state.reads > 0);
      assert.ok(h.children.every(flag => flag === false));
      assert.deepEqual(h.requests, []);
      assert.deepEqual(h.navigations, []);
    }
  });
}

test('initialization, unavailable sessions and password recovery remain live without protected-route prompts', async () => {
  const h = fixture({ path: '/messages', restorationError: new Error('Connection unavailable') });
  h.render(); assert.equal(h.state.auth.isInitializing, true); assert.deepEqual(h.requests, []);
  await h.flush(); assert.equal(h.state.auth.isSessionUnavailable, true); assert.deepEqual(h.requests, []);
  h.state.auth.requestAuth('resetPassword'); h.render();
  assert.equal(h.state.auth.pendingView, 'resetPassword');
  assert.equal(elements(h.state.host).find(node => node.type === 'DeferredDialog').props.active, true);
  assert.equal(h.state.reads, 0);
  const recovery = fixture({ path: '/messages?type=recovery#reset', recoveryReturn: true });
  await recovery.flush();
  assert.equal(recovery.state.auth.pendingView, 'resetPassword');
  assert.equal(elements(recovery.state.host).find(node => node.type === 'DeferredDialog').props.active, true);
  assert.equal(recovery.state.reads, 0);
  assert.deepEqual(recovery.requests, []);
  const recovered = fixture({ path: '/messages', restored: account({ isPasswordRecovery: true }) });
  await recovered.flush();
  assert.equal(recovered.state.tree.type, 'AppContent');
  assert.equal(recovered.state.auth.pendingView, 'resetPassword');
  assert.deepEqual(recovered.requests, []);
});

test('interactive authentication hands a true marker to the first app mount; restored sessions do not', async () => {
  const h = fixture(); await h.flush();
  h.state.auth.requestAuth('signIn'); h.render();
  const attempt = h.state.auth.signIn({ email: 'creator@example.test', password: 'synthetic-password' });
  h.render(); assert.equal(h.state.auth.phase, 'authenticating'); assert.equal(h.state.reads, 0);
  h.state.signIn.resolve(account()); await attempt; h.render();
  assert.equal(h.children[0], true);
  h.render(); assert.equal(h.children.at(-1), false);
  const restored = fixture({ path: '/p/creator?view=portals#bio', restored: account() });
  await restored.flush();
  assert.equal(restored.children[0], false);
  assert.deepEqual(restored.navigations, []);
});

test('failed sign-in followed by cancel cannot turn later external authentication into an interactive sign-in', async () => {
  const h = fixture({ path: '/messages?conversation=thread#latest' }); await h.flush();
  const attempt = h.state.auth.signIn({ email: 'creator@example.test', password: 'synthetic-password' }); h.render();
  h.state.signIn.reject(new Error('Sign-in failed')); await attempt; h.render();
  h.state.auth.closeAuth(); h.render();
  assert.equal(h.state.auth.peekPendingIntent(), null);
  h.emit(account()); h.render();
  assert.equal(h.children[0], false);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.navigations, []);
  assert.equal(h.state.location.pathname + h.state.location.search + h.state.location.hash, '/messages?conversation=thread#latest');
});

test('deliberate sign-out from Messages replaces Home without creating a new sign-in destination', async () => {
  const h = fixture({ path: '/messages?conversation=thread#latest', restored: account() }); await h.flush();
  const before = h.state.reads;
  const signingOut = h.state.auth.signOut(); h.render();
  assert.equal(h.state.host.props['data-account-entry-only'], '');
  assert.equal(h.state.reads, before);
  await signingOut; h.render(); h.render();
  assert.deepEqual(h.navigations, [['/', { replace: true }]]);
  assert.equal(h.state.location.pathname, '/');
  assert.deepEqual(h.requests, []);
  assert.equal(h.state.auth.peekPendingIntent(), null);
});

// Execute the App's existing coordinator/initializers, rather than a parallel
// implementation, for the mount that the boundary permits after authentication.
const app = ts.createSourceFile('App.tsx', readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate) {
  let found;
  function visit(node) { if (found) return; if (predicate(node)) found = node; else ts.forEachChild(node, visit); }
  visit(app); assert.ok(found, 'Expected the existing App auth coordinator'); return found;
}
const initializer = name => find(node => ts.isVariableDeclaration(node) && node.name.getText(app) === name).initializer.getText(app);
const transpile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
function evaluate(text, context) { vm.runInContext(transpile(`result = (${text});`), context); return context.result; }
function coordinator({ seed = false, intent = null, onboarding = 'ready' } = {}) {
  const calls = []; let pending = intent, consumes = 0;
  const context = vm.createContext({ result: null, accountEntrySignIn: seed, onboardingStatus: onboarding, isProtectedRoute: true, presentation: 'mobile',
    auth: { phase: 'authenticated', isAuthenticated: true, viewerProfileId: 'owner', user: { id: 'account' },
      peekPendingIntent: () => pending,
      consumePendingIntent() { consumes++; const value = pending; pending = null; return value; },
    },
    useRef: current => ({ current }), mainContentRef: { current: { focus() { calls.push(['focus']); } } },
    requestAnimationFrame: callback => callback(),
    nav: { home: replace => calls.push(['home', replace]), to: (path, replace) => calls.push(['route', path, replace]) },
    setIsOnboardingOpen(value) { context.isOnboardingOpen = value; calls.push(['onboarding', value]); },
    setOptionalSetupAccount() {}, openProfile: id => calls.push(['profile', id]),
  });
  for (const name of ['wasAuthenticatedRef', 'interactiveSignInRef', 'deferredIntentRef', 'signedOutOfProtectedRef']) context[name] = evaluate(initializer(name), context);
  const fulfil = find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'fulfilIntent');
  vm.runInContext(transpile(fulfil.getText(app)), context);
  const effect = find(node => ts.isCallExpression(node) && node.expression.getText(app) === 'useEffect' && node.arguments[0]?.getText(app).includes('const justSignedIn'));
  const run = evaluate(effect.arguments[0].getText(app), context);
  const dialog = find(node => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(app) === 'ProfileOnboardingDialog');
  const completion = dialog.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.getText(app) === 'onComplete');
  return { context, calls, run, complete: evaluate(completion.initializer.expression.getText(app), context), get consumes() { return consumes; } };
}

test('the boundary render callback passes its interactive marker into AppContent', () => {
  const boundary = find(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(app) === 'AccountEntryBoundary');
  const callback = boundary.children.find(node => ts.isJsxExpression(node)).expression;
  const context = vm.createContext({ result: null, React, AppContent: 'AppContent', props: {} });
  const render = evaluate(callback.getText(app), context);
  assert.equal(render(true).props.accountEntrySignIn, true);
  assert.equal(render(false).props.accountEntrySignIn, false);
});

test('newly mounted App consumes either the transient sign-in seed or a pending destination exactly once', () => {
  const path = '/messages?conversation=thread&recipient=creator#latest';
  for (const seed of [true, false]) {
    const h = coordinator({ seed, intent: { kind: 'route', path, label: 'read your messages' } });
    h.run(); h.run();
    assert.equal(h.consumes, 1);
    assert.deepEqual(h.calls.filter(call => call[0] === 'route'), [['route', path, true]]);
    assert.equal(h.context.interactiveSignInRef.current, false);
  }
  const restored = coordinator(); restored.run(); restored.run();
  assert.equal(restored.consumes, 0); assert.deepEqual(restored.calls, []);
});

test('required onboarding waits for identity, consumes once and fulfils the exact deferred route once', () => {
  const path = '/p/creator?view=portals#bio';
  const h = coordinator({ seed: true, intent: { kind: 'route', path, label: 'explore this creator' }, onboarding: 'unknown' });
  h.run(); assert.equal(h.consumes, 0); assert.deepEqual(h.calls, []);
  h.context.onboardingStatus = 'required'; h.run(); h.run();
  assert.equal(h.consumes, 1);
  assert.equal(h.context.isOnboardingOpen, true);
  assert.equal(h.context.deferredIntentRef.current.path, path);
  assert.equal(h.calls.some(call => call[0] === 'route'), false);
  h.context.onboardingStatus = 'ready'; h.complete('owner'); h.run();
  assert.equal(h.context.deferredIntentRef.current, null);
  assert.equal(h.context.isOnboardingOpen, false);
  assert.equal(h.consumes, 1);
  assert.deepEqual(h.calls.filter(call => call[0] === 'route'), [['route', path, true]]);
});
