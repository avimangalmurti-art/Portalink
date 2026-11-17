import assert from 'node:assert/strict';
import React from 'react';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

function bootstrap(presentation, authenticated = true, search = authenticated ? '' : '?welcome=1') {
  const slots = [], timers = new Map();
  let cursor = 0, effects = [], timer = 0;
  const react = {
    ...React,
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }];
    },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, n) => dep !== slots[i].deps[n])) slots[i] = { deps, value: factory() };
      return slots[i].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((dep, n) => dep !== slots[i].deps[n])) {
        const old = slots[i]; slots[i] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = effect(); });
      }
    },
  };
  const user = { id: 'account' };
  const requested = [];
  const auth = { isInitializing: false, isAuthenticated: authenticated, isSessionUnavailable: false, user: authenticated ? user : null, session: authenticated ? { user } : null, pendingView: null,
    requestAuth(view) { requested.push(view); auth.pendingView = view; } };
  const { ApplicationBootstrap } = sourceModule('src/app/ApplicationBootstrap.tsx', {
    react, 'framer-motion': { AnimatePresence: 'presence' },
    'react-router-dom': { Navigate: 'navigate', matchPath: () => null, useLocation: () => ({ pathname: '/', search, hash: '' }) },
    '../App': { App: 'app' }, '../components/ui/PortalinkSplashLoader': { PortalinkSplashLoader: 'splash' },
    '../components/auth/ProfessionalEntry': { ProfessionalEntry: 'professional-entry' },
    '../components/ui/StateViews': { ErrorState: 'error', LoadingState: 'loading' },
    '../contexts/AuthContext': { useAuth: () => auth },
    './routes': { routes: { sharedCollaboration: {}, sharedProject: {}, sharedProfileCategory: {}, sharedProfile: {}, controlCenter: { path: '/settings' } }, buildPath: () => '/share' },
    './splashLifecycle': { PORTALINK_SPLASH_EXIT_EVENT: 'splash-exit' },
    './screenModules': { warmScreenForPath: () => Promise.resolve() },
    './homeStartup': { HOME_STARTUP_TIMEOUT_MS: 12000 },
    '../features/sharing/shareModel': { handleFromPath: () => null },
    '../features/sharing/sharedSettings': { sharedSettingsPath: () => undefined },
    '../presentation/useViewportPresentation': { useViewportPresentation: () => presentation },
    '../presentation/usePresentation': { PresentationContext: { Provider: 'presentation-provider' } },
    '../features/install/useMobileInstall': { useMobileInstallCapture() {} },
    '../presentation/mobile/useMobileResumeSession': { useMobileResumeSession: () => ({ resumeTo: null, launchRecord: null }) },
    '../presentation/mobile/MobileResumeContext': { MobileResumeProvider: 'resume-provider' },
  }, { Event: class { constructor(type) { this.type = type; } }, document: { getElementById: () => null }, window: { dispatchEvent() {},
    sessionStorage: { getItem: () => null, removeItem() { return; } },
    setTimeout(callback, delay) { timers.set(++timer, { callback, delay }); return timer; },
    clearTimeout(id) { timers.delete(id); },
  } });
  return {
    requested,
    authenticate() { auth.isAuthenticated = true; auth.user = user; auth.session = { user }; auth.pendingView = null; },
    render() { cursor = 0; effects = []; const tree = ApplicationBootstrap(); effects.forEach(effect => effect()); return tree.props.children.map(child => child?.type === 'resume-provider' ? child.props.children : child); },
    timeout() { const pending = [...timers.values()].find(item => item.delay === 12000); assert.ok(pending); pending.callback(); },
  };
}

test('restored WEB plays the opening before Home Retry and retains account and attempt readiness', () => {
 const h=bootstrap('web');let [app,presence]=h.render();const splash=presence.props.children;assert.equal(splash.props.stillOnly,false);assert.equal(app.props.homeStartupPending,true);const old=app.props;
 h.timeout();const pending=h.render();assert.equal(pending[1].props.children.key,splash.key);assert.equal(pending[3],false);
 splash.props.onComplete();const timeout=h.render();assert.equal(timeout[1].props.children,null);timeout[3].props.children.props.onRetry();[app,presence]=h.render();assert.equal(app.props.homeStartupAttempt,1);assert.equal(presence.props.children,null);
 old.onHomeStartupReady(true);old.onHomeStartupShellReady(true);assert.equal(h.render()[0].props.homeStartupPending,true,'Old attempt cannot uncover Home');
 app.props.onHomeStartupReady(true);app.props.onHomeStartupShellReady(true);h.render();assert.equal(h.render()[0].props.homeStartupPending,false);
});

test('restored WEB keeps playing even when Home is already ready', () => {
 const h=bootstrap('web');let [app,presence]=h.render();
 const splash=presence.props.children;
 app.props.onHomeStartupReady(true);app.props.onHomeStartupShellReady(true);
 [app,presence]=h.render();assert.equal(app.props.homeStartupPending,false);
 assert.equal(presence.props.children.key,splash.key);assert.equal(presence.props.children.props.stillOnly,false);
 splash.props.onComplete();assert.equal(h.render()[1].props.children,null);
});

test('ordinary signed-out WEB keeps the intro mounted until account choices can appear', () => {
 const h=bootstrap('web',false,'');const splash=h.render()[1].props.children;
 assert.equal(splash.props.landing,undefined);
 assert.equal(splash.props.stillOnly,false);
 splash.props.onComplete();const accountEntry=h.render()[1].props.children;
 assert.equal(accountEntry.key,splash.key);
 assert.equal(accountEntry.props.landing.ready,true);
});

test('welcome sign-in enters MOBILE immediately and preserves the WEB Home-readiness handoff', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = bootstrap(presentation, false);
    let [app, presence] = h.render();
    if (presentation === 'web') assert.equal(presence.props.children.props.landing, undefined);
    else assert.ok(presence.props.children.props.landing);
    presence.props.children.props.onComplete();
    [app, presence] = h.render();
    assert.equal(presence.props.children.props.stillOnly, false);
    const landing = presence.props.children.props.landing;
    assert.equal(landing.onContinue, undefined); assert.equal(landing.onDismiss, undefined);
    landing.onSignIn(); assert.deepEqual(h.requested, ['signIn']);
    assert.equal(h.render()[1].props.children.props.hidden, true, 'The existing account form owns focus during sign-in');
    h.authenticate();
    [app, presence] = h.render();
    if (presentation === 'mobile') {
      [app, presence] = h.render();
      assert.equal(presence.props.children, null, 'An authenticated MOBILE account enters without the WEB Home wait');
      assert.equal(app.props.homeStartupPending, false);
      continue;
    }
    assert.equal(presence.props.children.props.landing, undefined);
    assert.equal(presence.props.children.props.welcomeHandoff, true);
    assert.equal(presence.props.children.props.stillOnly, false, 'The existing workspace handoff remains until real Home readiness');
    app.props.onHomeStartupReady(true); app.props.onHomeStartupShellReady(true);
    h.render(); assert.equal(h.render()[1].props.children, null);
  }
});
