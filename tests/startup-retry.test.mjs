import assert from 'node:assert/strict';
import React from 'react';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

function bootstrap(presentation, authenticated = true) {
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
  const auth = { isInitializing: false, isAuthenticated: authenticated, isSessionUnavailable: false, user: authenticated ? user : null, session: authenticated ? { user } : null, pendingView: null };
  const { ApplicationBootstrap } = sourceModule('src/app/ApplicationBootstrap.tsx', {
    react, 'framer-motion': { AnimatePresence: 'presence' },
    'react-router-dom': { Navigate: 'navigate', matchPath: () => null, useLocation: () => ({ pathname: '/', search: authenticated ? '' : '?welcome=1', hash: '' }) },
    '../App': { App: 'app' }, '../components/ui/PortalinkSplashLoader': { PortalinkSplashLoader: 'splash' },
    '../components/ui/StateViews': { ErrorState: 'error', LoadingState: 'loading' },
    '../contexts/AuthContext': { useAuth: () => auth },
    './routes': { routes: { sharedCollaboration: {}, sharedProject: {}, sharedProfileCategory: {}, sharedProfile: {}, controlCenter: { path: '/settings' } }, buildPath: () => '/share' },
    './splashLifecycle': { PORTALINK_SPLASH_EXIT_EVENT: 'splash-exit' },
    './screenModules': { warmScreenForPath: () => Promise.resolve() },
    './homeStartup': { HOME_STARTUP_TIMEOUT_MS: 12000 },
    '../features/sharing/shareModel': { handleFromPath: () => null },
    '../presentation/useViewportPresentation': { useViewportPresentation: () => presentation },
    '../features/install/useMobileInstall': { useMobileInstallCapture() {} },
    '../presentation/mobile/useMobileResumeSession': { useMobileResumeSession: () => ({ resumeTo: null, launchRecord: null }) },
    '../presentation/mobile/MobileResumeContext': { MobileResumeProvider: 'resume-provider' },
  }, { window: {
    sessionStorage: { getItem: () => null, removeItem() { return; } },
    setTimeout(callback, delay) { timers.set(++timer, { callback, delay }); return timer; },
    clearTimeout(id) { timers.delete(id); },
  } });
  return {
    render() { cursor = 0; effects = []; const tree = ApplicationBootstrap(); effects.forEach(effect => effect()); return tree.props.children.map(child => child?.type === 'resume-provider' ? child.props.children : child); },
    timeout() { const pending = [...timers.values()].find(item => item.delay === 12000); assert.ok(pending); pending.callback(); },
  };
}

test('WEB Home Retry preserves completed startup media while retaining account/attempt readiness', () => {
    const h = bootstrap('web');
    let [app, presence] = h.render();
    assert.equal(presence.props.children.props.stillOnly, false);
    presence.props.children.props.onComplete();
    [app, presence] = h.render(); const old = app.props;
    assert.equal(presence.props.children.props.stillOnly, false, 'The first attempt retains its painted final frame');
    h.timeout(); const timeout = h.render(); assert.equal(timeout[1].props.children, null);
    timeout[3].props.children.props.onRetry(); [app, presence] = h.render();
    assert.equal(presence.props.children.props.stillOnly, true, 'Retry cannot replay the already completed intro');
    assert.equal(app.props.homeStartupAttempt, 1);
    old.onHomeStartupReady(true); old.onHomeStartupShellReady(true);
    assert.equal(h.render()[1].props.children.type, 'splash', 'Old attempt cannot uncover Home');
    app.props.onHomeStartupReady(true); app.props.onHomeStartupShellReady(true);
    h.render(); assert.equal(h.render()[1].props.children, null);
});

test('WEB natural completion keeps the first-attempt media surface while Home waits', () => {
    const h = bootstrap('web');
    let [app, presence] = h.render();
    presence.props.children.props.onComplete();
    for (let render = 0; render < 3; render++) {
      [app, presence] = h.render();
      assert.equal(app.props.homeStartupAttempt, 0);
      assert.equal(presence.props.children.props.stillOnly, false, 'Completion must not replace the final video frame with the first poster');
    }
    app.props.onHomeStartupReady(true); app.props.onHomeStartupShellReady(true);
    h.render(); assert.equal(h.render()[1].props.children, null);
});

test('explicit welcome Continue enters MOBILE immediately and preserves WEB Home-wait handoff', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = bootstrap(presentation, false);
    let [app, presence] = h.render();
    assert.ok(presence.props.children.props.landing);
    presence.props.children.props.onComplete();
    [app, presence] = h.render();
    assert.equal(presence.props.children.props.stillOnly, false);
    presence.props.children.props.landing.onContinue();
    [app, presence] = h.render();
    if (presentation === 'mobile') {
      assert.equal(presence.props.children, null, 'MOBILE guest enters the app without waiting for Home');
      assert.equal(app.props.homeStartupPending, false);
      continue;
    }
    assert.equal(presence.props.children.props.landing, undefined);
    assert.equal(presence.props.children.props.welcomeHandoff, true);
    assert.equal(presence.props.children.props.stillOnly, false, 'The existing guest animation continues until Home is ready');
    app.props.onHomeStartupReady(true); app.props.onHomeStartupShellReady(true);
    h.render(); assert.equal(h.render()[1].props.children, null);
  }
});
