import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { matchPath } from 'react-router-dom';
import { sourceModule } from './helpers/source-module.mjs';

const shareModel = sourceModule('src/features/sharing/shareModel.ts');
const registration = sourceModule('src/features/auth/registration.ts', {
  '../sharing/shareModel': shareModel,
  '../profile/validation': sourceModule('src/features/profile/validation.ts', { '../sharing/shareModel': shareModel }),
});
const sharedSettings = sourceModule('src/features/sharing/sharedSettings.ts', { '../auth/registration': registration, './shareModel': shareModel });
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
function fixture({ presentation = 'mobile', authenticated = true, initializing = true, path = '/', search = '', hash = '', state = null, savedPath = '/p/creator/c/work/project', pendingView = null, phase = authenticated ? 'authenticated' : 'guest', sessionUnavailable = false, enteredWelcome = true, welcomeState } = {}) {
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
  const messageDrafts = sourceModule('src/presentation/mobile/mobileMessageDrafts.ts', {}, globals);
  const resumeHook = sourceModule('src/presentation/mobile/useMobileResumeSession.ts', { react, './mobileResumeState': resumeState, './mobileMessageDrafts': messageDrafts }, globals);
  const auth = { isInitializing: initializing, isAuthenticated: authenticated, isSessionUnavailable: sessionUnavailable, pendingView, phase,
    user: authenticated ? { id: 'account' } : null, session: authenticated ? { user: { id: 'account' } } : null,
    requestAuth(view) { trace.push(['request-auth', view]); auth.pendingView = view; } };
  const location = { pathname: path, search, hash, state, key: 'default' };
  const { ApplicationBootstrap } = sourceModule('src/app/ApplicationBootstrap.tsx', {
    react, 'framer-motion': { AnimatePresence: 'presence' }, 'react-router-dom': { Navigate: 'navigate', matchPath, useLocation: () => location },
    '../App': { App: 'app' }, '../components/ui/PortalinkSplashLoader': { PortalinkSplashLoader: 'splash' },
    '../components/auth/ProfessionalEntry': { ProfessionalEntry: 'professional-entry' }, '../presentation/usePresentation': { PresentationContext: { Provider: 'presentation-provider' } },
    '../components/auth/CatalogWelcome': { CatalogWelcome: 'catalog-welcome' }, '../components/auth/catalogWelcomeState': welcomeState ?? { hasEnteredCatalogWelcome: () => enteredWelcome },
    '../components/ui/StateViews': { LoadingState: 'loading', ErrorState: 'error' }, '../contexts/AuthContext': { useAuth: () => auth },
    './routes': { routes, buildPath: (_name, params) => `/share/${params.profileId}` }, './splashLifecycle': { PORTALINK_SPLASH_EXIT_EVENT: 'splash-exited' },
    './screenModules': { warmScreenForPath: value => { trace.push(['warm', value]); return Promise.resolve(); } }, './homeStartup': { HOME_STARTUP_TIMEOUT_MS: 12000 },
    '../features/sharing/shareModel': shareModel, '../features/sharing/sharedSettings': sharedSettings, '../presentation/useViewportPresentation': { useViewportPresentation: () => presentation },
    '../features/install/useMobileInstall': { useMobileInstallCapture: enabled => captures.push(enabled) },
    '../presentation/mobile/useMobileResumeSession': resumeHook, '../presentation/mobile/MobileResumeContext': { MobileResumeProvider: 'resume-provider' },
  }, globals);
  const render = () => { cursor = 0; effects = []; dirty = false; rendered = ApplicationBootstrap(); for (const effect of effects) effect(); return rendered; };
  return { auth, location, trace, captures, storage, sessionStorage, timers, window, document,
    render,
    settle() { for (let attempts = 0; dirty && attempts < 25; attempts++) render(); assert.equal(dirty, false, 'Bootstrap must settle without a render loop'); return rendered; },
    rerender() { dirty = true; return render(); },
    setPresentation(value) { presentation = value; dirty = true; },
    authenticate() { auth.isAuthenticated = true; auth.pendingView = null; auth.phase = 'authenticated'; auth.user = { id: 'account' }; auth.session = { user: auth.user }; dirty = true; },
    get destination() { return rendered.props.children[0]; },
    get app() { const item = rendered.props.children[0]; return item?.type === 'resume-provider' ? item.props.children : item; },
    get splash() { return rendered.props.children[1].props.children; },
    get catalogWelcome() { return rendered.props.children.find(child => child?.type === 'catalog-welcome') ?? false; },
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

test('MOBILE account entry stays gated through cancellation and ignores another account’s saved route', () => {
  const h = fixture({ authenticated: false, initializing: false }); h.render(); h.settle();
  assert.equal(h.app.type, 'app'); assert.equal(h.splash.type, 'splash');
  assert.equal(h.splash.props.landing.onContinue, undefined); assert.equal(h.splash.props.landing.continueLabel, undefined); assert.equal(h.splash.props.landing.onDismiss, undefined);
  assert.equal(h.trace.some(item => item[0] === 'pause-video'), false);
  h.splash.props.landing.onSignIn(); h.rerender(); h.settle(); assert.deepEqual(h.trace.find(item => item[0] === 'request-auth'), ['request-auth', 'signIn']);
  assert.equal(h.splash.props.hidden, true); assert.equal(h.destination.props.enabled, false);
  h.auth.pendingView = null; h.rerender(); h.settle(); assert.equal(h.splash.props.hidden, false);
  h.authenticate(); h.rerender(); h.settle();
  assert.equal(h.app.type, 'app'); assert.equal(h.splash, null); assert.equal(h.app.props.homeStartupPending, false); h.dispose();
});

test('restored WEB skips the intro but retains decoded Home readiness instead of using MOBILE resume or install capture', () => {
  const h = fixture({ presentation: 'web', initializing: false }); h.render(); h.settle();
  assert.equal(h.app.type, 'app'); assert.equal(h.splash, null);
  assert.equal(h.app.props.homeStartupPending, true); assert.equal(h.destination.props.enabled, false); assert.ok(h.captures.every(enabled => enabled === false));
  h.app.props.onHomeStartupShellReady(true); h.rerender(); h.settle(); assert.equal(h.app.props.homeStartupPending, true);
  h.app.props.onHomeStartupReady(true); h.app.props.onHomeStartupShellReady(true); h.rerender(); h.settle(); assert.equal(h.splash, null);
  assert.equal(h.app.props.homeStartupPending, false);
  assert.equal(h.trace.some(item => item[0] === 'pause-video'), true); h.dispose();
});

test('explicit projects, city pages and Settings/security links stay authoritative over saved route hints', () => {
  for (const [path, search, hash] of [['/p/other/c/work/chosen', '?page=2&media=image', ''], ['/portalink/san-francisco', '', ''], ['/settings', '?section=account&security=1', ''], ['/', '?welcome=1', ''], ['/', '', '#projects']]) {
    const h = fixture({ initializing: false, path, search, hash }); h.render(); h.settle();
    assert.equal(h.destination.type, 'resume-provider'); assert.equal(h.app.type, 'app');
    assert.equal(h.location.pathname + h.location.search + h.location.hash, path + search + hash); assert.equal(h.destination.props.record, null); h.dispose();
  }
});

test('every WEB and MOBILE shared address hands off to the public entry before the main app can mount', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  for (const presentation of ['web', 'mobile']) for (const authenticated of [false, true]) {
    for (const path of [`/share/${profileId}`, `/share/${profileId}/c/portal`, `/share/${profileId}/c/portal/project`, `/share/${profileId}/collaboration`, '/creator', '/creator/c/portal/project', '/share/invalid-profile']) {
      const h = fixture({ presentation, authenticated, initializing: true, path, search: '?via=friend&page=2&media=paper', hash: '#reading' });
      h.render(); h.settle();
      assert.equal(h.app, null, `${presentation}/${authenticated}/${path}`);
      assert.deepEqual(h.trace.filter(item => item[0] === 'replace'), [['replace', `${path}?via=friend&page=2&media=paper#reading`]]);
      assert.equal(h.trace.some(item => item[0] === 'warm'), false, 'Public routes do not download ordinary account destinations.');
      h.auth.isInitializing = false; h.rerender(); h.settle();
      assert.equal(h.app, null, 'Restored ownership cannot turn a public address into the signed-in platform.');
      assert.equal(h.trace.filter(item => item[0] === 'replace').length, 1); h.dispose();
    }
  }
});

test('legacy public Settings hand off to durable public Settings before rendering the account workspace', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  for (const presentation of ['web', 'mobile']) for (const authenticated of [false, true]) for (const path of ['/settings', '/appearance']) {
    const h = fixture({ presentation, authenticated, initializing: false, path,
      search: '?section=account&security=1&panel=appearance&redirect=https%3A%2F%2Fevil.test',
      state: { settingsReturn: `/share/${profileId}/c/portal/project?media=paper&page=3&visitorPreview=1` } });
    h.render(); h.settle();
    assert.equal(h.app, null, `${presentation}/${authenticated}/${path}`);
    assert.deepEqual(h.trace.filter(item => item[0] === 'replace'), [['replace', `/share/${profileId}/c/portal/project?page=3&media=paper&settings=1&section=account&panel=appearance&security=1`]]);
    assert.equal(h.trace.some(item => item[0] === 'warm'), false);
    assert.equal(h.trace.some(item => item[0] === 'request-auth'), false); h.dispose();
  }
  const handle = fixture({ presentation: 'web', initializing: true, path: '/settings/', search: '?section=appearance&panel=system-grey', state: { settingsReturn: '/creator?view=projects' } });
  handle.render(); handle.settle();
  assert.equal(handle.app, null);
  assert.deepEqual(handle.trace.filter(item => item[0] === 'replace'), [['replace', '/creator?view=projects&settings=1&section=appearance&panel=system-grey']]); handle.dispose();
});

test('ordinary Settings and untrusted legacy return state retain the standard authenticated platform', () => {
  const invalidReturns = [undefined, '/studio', '/p/owner', '/cite/public-project', '//external.test/creator', 'https://external.test/creator', 'javascript:alert(1)', '/share/creator/../../settings', 123];
  for (const presentation of ['web', 'mobile']) for (const settingsReturn of invalidReturns) {
    const h = fixture({ presentation, initializing: false, path: '/settings', search: '?section=account&security=1', state: { settingsReturn } });
    h.render(); h.settle();
    assert.equal(h.app.type, 'app', `${presentation}/${String(settingsReturn)}`);
    assert.equal(h.trace.some(item => item[0] === 'replace'), false);
    assert.equal(h.location.search, '?section=account&security=1'); h.dispose();
  }
  for (const options of [{ search: '?code=callback' }, { hash: '#access_token=callback' }, { pendingView: 'resetPassword' }]) {
    const h = fixture({ initializing: false, savedPath: null, state: { settingsReturn: '/creator' }, ...options });
    h.render(); h.settle();
    assert.equal(h.app.type, 'app'); assert.equal(h.trace.some(item => item[0] === 'replace'), false);
    assert.equal(h.destination.props.enabled, false); h.dispose();
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

test('MOBILE and WEB root visitors receive immediate account-only company entry', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = fixture({ presentation, authenticated: false, initializing: false, enteredWelcome: false, savedPath: null }); h.render(); h.settle();
    assert.equal(h.catalogWelcome, false); assert.equal(h.splash.props.hidden, false); assert.equal(h.splash.props.landing.ready, true);
    assert.equal(h.trace.some(item => item[0] === 'request-auth'), false); assert.equal(h.auth.pendingView, null);
    const landing = h.splash.props.landing;
    assert.equal(landing.content.props.children.type, 'professional-entry'); assert.equal(landing.content.props.children.props.onGuest, undefined);
    assert.equal(landing.onContinue, undefined); assert.equal(landing.continueLabel, undefined); assert.equal(landing.onDismiss, undefined); assert.equal(h.auth.pendingView, null);
    h.splash.props.landing.onSignIn(); assert.deepEqual(h.trace.filter(item => item[0] === 'request-auth'), [['request-auth', 'signIn']]);
    h.rerender(); h.settle(); assert.equal(h.splash.props.hidden, true);
    h.auth.pendingView = null; h.rerender(); h.settle(); assert.equal(h.splash.props.hidden, false);
    assert.equal(h.location.pathname, '/'); h.dispose();
  }
});

test('account entry preserves explicit public links, callback/recovery routes, signed-in users and open auth forms', () => {
  for (const presentation of ['mobile', 'web']) for (const change of [{ path: '/share/creator/c/work/project' }, { path: '/messages' }, { search: '?code=callback' }, { hash: '#access_token=callback' }, { pendingView: 'resetPassword' }, { pendingView: 'signIn' }, { pendingView: 'signUp' }, { authenticated: true }]) {
    const h = fixture({ presentation, authenticated: false, initializing: false, savedPath: null, enteredWelcome: false, ...change }); h.render(); h.settle();
    assert.equal(h.catalogWelcome, false, `${presentation}/${JSON.stringify(change)}`); assert.equal(h.trace.some(item => item[0] === 'request-auth'), false); h.dispose();
  }
});

test('a legacy browser-local entered marker cannot bypass account entry after cancellation or remount', () => {
  const welcomeState = sourceModule('src/components/auth/catalogWelcomeState.ts', {}, { window: { localStorage: { getItem: () => null, setItem() {} } } });
  welcomeState.rememberCatalogWelcomeEntry();
  const first = fixture({ authenticated: false, initializing: false, savedPath: null, welcomeState }); first.render(); first.settle(); assert.equal(first.catalogWelcome, false);
  first.splash.props.landing.onCreateAccount(); first.rerender(); first.settle(); assert.equal(first.splash.props.hidden, true);
  first.auth.pendingView = null; first.rerender(); first.settle(); assert.equal(first.splash.props.hidden, false); first.dispose();
  const next = fixture({ presentation: 'web', authenticated: false, initializing: false, savedPath: null, welcomeState }); next.render(); next.settle();
  assert.equal(next.catalogWelcome, false); assert.equal(next.splash.props.hidden, false); assert.equal(next.splash.props.landing.onDismiss, undefined); assert.equal(next.splash.props.landing.onContinue, undefined); next.dispose();
});
