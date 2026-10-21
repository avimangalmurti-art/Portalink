import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { matchPath } from 'react-router-dom';
import { sourceModule } from './helpers/source-module.mjs';

const shareModel = sourceModule('src/features/sharing/shareModel.ts');
const routes = {
  sharedCollaboration: { path: '/share/:profileId/collaboration' }, sharedProject: { path: '/share/:profileId/c/:categoryId/:projectId' },
  sharedProfileCategory: { path: '/share/:profileId/c/:categoryId' }, sharedProfile: { path: '/share/:profileId' }, controlCenter: { path: '/settings' },
};
function events() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    dispatchEvent(event) { for (const handler of [...listeners.get(event.type) ?? []]) handler(event); },
    count() { return [...listeners.values()].reduce((sum, items) => sum + items.size, 0); },
  };
}

/** Real bootstrap and real resume hook/state; only browser, Auth and child rendering are controlled. */
function fixture({ presentation = 'mobile', authenticated = true, initializing = true, path = '/', search = '', hash = '', savedPath = '/p/creator/c/work/project', pendingView = null, phase = authenticated ? 'authenticated' : 'guest', sessionUnavailable = false } = {}) {
  const slots = [], timers = new Map(), captures = [], trace = [], storage = new Map(), sessionStorage = new Map();
  let cursor = 0, effects = [], dirty = true, rendered, timerId = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  const react = { ...React,
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, update => { const next = typeof update === 'function' ? update(slots[index].value) : update; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; } }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(factory, dependencies) { const index = cursor++; if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, value: factory() }; return slots[index].value; },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); },
    useEffect(effect, dependencies) { const index = cursor++, prior = slots[index]; if (!same(prior?.dependencies, dependencies)) { slots[index] = { dependencies }; effects.push(() => { prior?.cleanup?.(); slots[index].cleanup = effect(); }); } },
  };
  const local = { getItem: key => storage.get(key) ?? null, setItem(key, value) { storage.set(key, value); }, removeItem(key) { storage.delete(key); } };
  const window = { ...events(), localStorage: local, sessionStorage: { getItem: key => sessionStorage.get(key) ?? null, setItem(key, value) { sessionStorage.set(key, value); }, removeItem(key) { sessionStorage.delete(key); } },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; }, clearTimeout(id) { timers.delete(id); }, location: { replace: value => trace.push(['replace', value]) } };
  const dispatch = window.dispatchEvent; window.dispatchEvent = event => { trace.push(['window-event', event.type]); dispatch(event); };
  let bootRemoved = false;
  const document = { ...events(), visibilityState: 'visible', getElementById(id) {
    if (id === 'portalink-preboot') return bootRemoved ? null : { remove() { bootRemoved = true; trace.push(['remove-preboot']); } };
    if (id === 'portalink-preboot-video') return bootRemoved ? null : { dispatchEvent: event => trace.push(['video-event', event.type]), pause: () => trace.push(['pause-video']) };
    assert.fail(`Unexpected DOM read ${id}`);
  } };
  class BrowserEvent { constructor(type) { this.type = type; } }
  const globals = { window, document, Event: BrowserEvent };
  const resumeState = sourceModule('src/presentation/mobile/mobileResumeState.ts', {}, globals);
  if (savedPath) assert.equal(resumeState.saveMobileResumeRoute('account', savedPath), true);
  const resumeHook = sourceModule('src/presentation/mobile/useMobileResumeSession.ts', { react, './mobileResumeState': resumeState }, globals);
  const auth = { isInitializing: initializing, isAuthenticated: authenticated, isSessionUnavailable: sessionUnavailable, pendingView, phase,
    user: authenticated ? { id: 'account' } : null, session: authenticated ? { user: { id: 'account' } } : null,
    requestAuth(view) { trace.push(['request-auth', view]); auth.pendingView = view; } };
  const location = { pathname: path, search, hash, key: 'default' };
  const { ApplicationBootstrap } = sourceModule('src/app/ApplicationBootstrap.tsx', {
    react, 'framer-motion': { AnimatePresence: 'presence' }, 'react-router-dom': { Navigate: 'navigate', matchPath, useLocation: () => location },
    '../App': { App: 'app' }, '../components/ui/PortalinkSplashLoader': { PortalinkSplashLoader: 'splash' },
    '../components/ui/StateViews': { LoadingState: 'loading', ErrorState: 'error' }, '../contexts/AuthContext': { useAuth: () => auth },
    './routes': { routes, buildPath: (_name, params) => `/share/${params.profileId}` }, './splashLifecycle': { PORTALINK_SPLASH_EXIT_EVENT: 'splash-exited' },
    './screenModules': { warmScreenForPath: value => { trace.push(['warm', value]); return Promise.resolve(); } }, './homeStartup': { HOME_STARTUP_TIMEOUT_MS: 12000 },
    '../features/sharing/shareModel': shareModel, '../presentation/useViewportPresentation': { useViewportPresentation: () => presentation },
    '../features/install/useMobileInstall': { useMobileInstallCapture: enabled => captures.push(enabled) },
    '../presentation/mobile/useMobileResumeSession': resumeHook, '../presentation/mobile/MobileResumeContext': { MobileResumeProvider: 'resume-provider' },
  }, globals);
  const render = () => { cursor = 0; effects = []; dirty = false; rendered = ApplicationBootstrap(); for (const effect of effects) effect(); return rendered; };
  return { auth, location, trace, captures, storage, sessionStorage, timers, window, document,
    render,
    settle() { for (let attempts = 0; dirty && attempts < 25; attempts++) render(); assert.equal(dirty, false, 'Bootstrap must settle without a render loop'); return rendered; },
    rerender() { dirty = true; return render(); },
    setPresentation(value) { presentation = value; dirty = true; },
    get destination() { return rendered.props.children[0]; },
    get app() { const item = rendered.props.children[0]; return item?.type === 'resume-provider' ? item.props.children : item; },
    get splash() { return rendered.props.children[1].props.children; },
    get waiting() { return rendered.props.children[2]; },
    dispose() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('authenticated MOBILE waits for real session restoration, then bypasses media and resumes the saved route before mounting Home', () => {
  const h = fixture(); h.render(); assert.equal(h.app, null); assert.equal(h.splash.type, 'splash');
  assert.equal(h.trace.some(item => item[0] === 'pause-video'), false);
  h.auth.isInitializing = false; h.rerender(); h.settle();
  assert.equal(h.destination.type, 'navigate'); assert.equal(h.destination.props.to, '/p/creator/c/work/project'); assert.equal(h.destination.props.replace, true);
  assert.equal(h.splash, null); assert.equal(h.app.type, 'navigate', 'Unrelated root Home is never mounted before resume');
  assert.deepEqual(h.trace.filter(item => ['video-event', 'pause-video', 'remove-preboot'].includes(item[0])), [['video-event', 'portalink:splash-adopt'], ['pause-video'], ['remove-preboot']]);
  h.location.pathname = '/p/creator/c/work/project'; h.location.key = 'resumed'; h.rerender(); h.settle();
  assert.equal(h.app.type, 'app'); assert.equal(h.destination.props.enabled, true); assert.equal(h.destination.props.accountId, 'account');
  assert.equal(h.destination.props.record.path, '/p/creator/c/work/project'); assert.equal(h.app.props.homeStartupPending, false);
  assert.equal(h.splash, null); h.dispose();
});

test('authenticated MOBILE without a saved destination enters Home immediately and never waits for artwork or a startup timer', () => {
  const h = fixture({ initializing: false, savedPath: null }); h.render(); h.settle();
  assert.equal(h.app.type, 'app'); assert.equal(h.splash, null); assert.equal(h.app.props.homeStartupPending, false);
  assert.equal([...h.timers.values()].some(item => item.delay === 12000), false);
  h.app.props.onHomeStartupReady(false); h.app.props.onHomeStartupShellReady(false); h.rerender(); h.settle(); assert.equal(h.splash, null); h.dispose();
});

test('guest MOBILE retains Hello World and deliberate guest/auth entry, ignoring another account’s saved route', () => {
  const h = fixture({ authenticated: false, initializing: false }); h.render(); h.settle();
  assert.equal(h.app.type, 'app'); assert.equal(h.splash.type, 'splash'); assert.equal(h.splash.props.landing.continueLabel, 'Continue as guest');
  assert.equal(h.trace.some(item => item[0] === 'pause-video'), false);
  h.splash.props.landing.onSignIn(); h.rerender(); h.settle(); assert.deepEqual(h.trace.find(item => item[0] === 'request-auth'), ['request-auth', 'signIn']);
  assert.equal(h.splash.props.hidden, true); assert.equal(h.destination.props.enabled, false);
  h.auth.pendingView = null; h.rerender(); h.settle(); h.splash.props.landing.onContinue(); h.rerender(); h.settle();
  assert.equal(h.app.type, 'app'); assert.equal(h.splash, null); assert.equal(h.app.props.homeStartupPending, false); h.dispose();
});

test('WEB retains full intro and decoded Home readiness instead of using the MOBILE saved route or install capture', () => {
  const h = fixture({ presentation: 'web', initializing: false }); h.render(); h.settle();
  assert.equal(h.app.type, 'app'); assert.equal(h.splash.type, 'splash'); assert.equal(h.splash.props.timedIntro, false);
  assert.equal(h.app.props.homeStartupPending, true); assert.equal(h.destination.props.enabled, false); assert.ok(h.captures.every(enabled => enabled === false));
  h.splash.props.onComplete(); h.rerender(); h.settle(); assert.equal(h.splash.type, 'splash');
  h.app.props.onHomeStartupReady(true); h.app.props.onHomeStartupShellReady(true); h.rerender(); h.settle(); assert.equal(h.splash, null);
  assert.equal(h.trace.some(item => item[0] === 'pause-video'), false); h.dispose();
});

test('explicit projects, city pages and Settings/security links stay authoritative over saved route hints', () => {
  for (const [path, search, hash] of [['/p/other/c/work/chosen', '?page=2&media=image', ''], ['/portalink/san-francisco', '', ''], ['/settings', '?section=account&security=1', ''], ['/', '?welcome=1', ''], ['/', '', '#projects']]) {
    const h = fixture({ initializing: false, path, search, hash }); h.render(); h.settle();
    assert.equal(h.destination.type, 'resume-provider'); assert.equal(h.app.type, 'app');
    assert.equal(h.location.pathname + h.location.search + h.location.hash, path + search + hash); assert.equal(h.destination.props.record, null); h.dispose();
  }
});

test('Auth callbacks, recovery, pending forms, unavailable sessions and transitional Auth phases block resume and bypass', () => {
  for (const options of [{ search: '?code=auth-callback' }, { hash: '#access_token=auth-callback' }, { pendingView: 'resetPassword' }, { pendingView: 'signIn' }, { sessionUnavailable: true }, { phase: 'authenticating' }, { phase: 'signing-out' }, { search: '?welcome=1' }]) {
    const h = fixture({ initializing: false, ...options }); h.render(); h.settle();
    assert.equal(h.app.type, 'app'); assert.equal(h.destination.props.enabled, false); assert.equal(h.destination.props.record, null);
    assert.equal(h.splash.type, 'splash'); assert.equal(h.trace.some(item => item[0] === 'pause-video'), false); h.dispose();
  }
  const recovered = fixture({ initializing: false }); recovered.auth.session.isPasswordRecovery = true; recovered.render(); recovered.settle();
  assert.equal(recovered.destination.props.enabled, false); assert.equal(recovered.destination.props.record, null); assert.equal(recovered.splash.type, 'splash'); recovered.dispose();
});

test('an already presented guest welcome is not later truncated by signing in', () => {
  const h = fixture({ authenticated: false, initializing: false }); h.render(); h.settle(); assert.equal(h.splash.type, 'splash');
  h.auth.isAuthenticated = true; h.auth.user = { id: 'account' }; h.auth.session = { user: h.auth.user }; h.auth.phase = 'authenticated'; h.rerender();
  assert.equal(h.splash.type, 'splash'); assert.equal(h.splash.props.welcomeHandoff, true); assert.equal(h.trace.some(item => item[0] === 'pause-video'), false);
  h.settle(); assert.equal(h.splash, null); h.dispose();
});

test('bootstrap passes only MOBILE presentation to install capture, including later presentation changes', () => {
  const h = fixture({ initializing: false, savedPath: null }); h.render(); h.settle(); assert.ok(h.captures.every(Boolean));
  h.setPresentation('web'); h.rerender(); assert.equal(h.captures.at(-1), false);
  h.setPresentation('mobile'); h.rerender(); assert.equal(h.captures.at(-1), true); h.dispose();
});

test('a skipped MOBILE intro stays complete when session revalidation temporarily returns to initializing', () => {
  const h = fixture({ initializing: false, savedPath: null }); h.render(); h.settle(); assert.equal(h.splash, null);
  h.auth.isInitializing = true; h.rerender(); h.settle();
  assert.equal(h.app, null); assert.equal(h.splash, null); assert.equal(h.waiting.props.children.type, 'loading');
  assert.equal(h.waiting.props.children.props.label, 'Opening Portalink…'); h.dispose();
});
