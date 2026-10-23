import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const account = 'account-a';
const project = '/p/creator/c/portal/project';
const plain = value => JSON.parse(JSON.stringify(value));

function events(extra = {}) {
  const handlers = new Map();
  const target = { handlers,
    addEventListener(type, callback) { const bucket = handlers.get(type) ?? new Set(); bucket.add(callback); handlers.set(type, bucket); },
    removeEventListener(type, callback) { handlers.get(type)?.delete(callback); },
    emit(type) { for (const callback of [...handlers.get(type) ?? []]) callback({ type }); },
    count(type) { return handlers.get(type)?.size ?? 0; },
  };
  return Object.defineProperties(target, Object.getOwnPropertyDescriptors(extra));
}
function device() {
  const values = new Map(), session = new Map(), frames = new Map(), timers = new Map(), writes = [];
  let frameId = 0, timerId = 0, top = 0, maximum = Infinity;
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const document = events({ visibilityState: 'visible', getElementById: () => null, querySelector: () => null, scrollingElement: {
    get scrollTop() { return top; }, set scrollTop(value) { top = Math.max(0, Math.min(value, maximum)); writes.push(value); },
  } });
  const window = events({ localStorage: storage, sessionStorage: { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, value) },
    innerHeight: 912, get scrollY() { return top; }, dispatchEvent(event) { this.emit(event.type); return true; },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; }, clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); },
  });
  return { window, document, values, session, frames, timers, writes,
    globals: { window, document, Event, requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame },
    frame() { const next = [...frames.values()]; frames.clear(); for (const callback of next) callback(); },
    settleTimers() { const next = [...timers.values()]; timers.clear(); for (const callback of next) callback(); },
    rawScroll(value) { top = value; }, maximum(value) { maximum = value; },
    get scrollTop() { return top; },
    card(id, documentY, height = 100) { return { dataset: { projectContinuityId: id }, getBoundingClientRect: () => ({ top: documentY - top, bottom: documentY + height - top }) }; },
  };
}

/** Execute production hooks/components and their actual effect cleanup order. DOM geometry is controlled. */
function runtime(d) {
  const slots = [];
  let cursor = 0, dirty = true, layout = [], passive = [], renderFn, input, value, mounted = true;
  const same = (a, b) => a && b && a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
  const effect = (queue, run, deps) => {
    const index = cursor++, previous = slots[index];
    if (same(previous?.deps, deps)) return;
    slots[index] = { ...previous, deps };
    queue.push(() => { previous?.cleanup?.(); slots[index].cleanup = run(); });
  };
  const react = { ...React,
    createContext: initial => ({ current: initial, Provider: 'resume-provider' }), useContext: context => context.current,
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { if (!mounted) return; const result = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(result, slots[index].value)) { slots[index].value = result; dirty = true; } }]; },
    useReducer(reduce, initial) { const [state, set] = react.useState(initial); return [state, action => set(previous => reduce(previous, action))]; },
    useLayoutEffect(run, deps) { effect(layout, run, deps); }, useEffect(run, deps) { effect(passive, run, deps); },
  };
  return { react,
    load(path, dependencies = {}) { return sourceModule(path, { react, ...dependencies }, d.globals); },
    mount(fn, options) { renderFn = fn; input = options; return this.flush(); },
    update(options) { input = options; dirty = true; return this.flush(); },
    flush() { let attempts = 0; while (dirty && mounted) { assert.equal(++attempts < 30, true, 'Production effects must settle'); cursor = 0; dirty = false; layout = []; passive = []; value = renderFn(input); layout.forEach(run => run()); passive.forEach(run => run()); } return value; },
    get value() { return this.flush(); },
    dispose() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
  };
}

function feedFixture({ point = null, enabled = true, accountId = account, ready = true, launchAccount = account } = {}) {
  const d = device(), r = runtime(d);
  const core = r.load('src/presentation/mobile/mobileResumeState.ts');
  let launch = point ? { accountId: launchAccount, record: { version: 1, accountId: launchAccount, savedAt: Date.now(), path: '/', feed: { path: '/', ...point } }, feeds: new Set() } : null;
  const cards = [];
  const host = { current: { closest: () => false, querySelectorAll: () => cards, querySelector: selector => cards.find(card => selector.includes(`"${card.dataset.projectContinuityId}"`)) ?? null } };
  let more = 0;
  let input = { enabled, accountId, path: '/', host, projectIds: Array.from({ length: 12 }, (_, i) => `card-${i}`), ready, saveReady: true, failed: false, busy: false, nextCursor: null, loadMore() { more += 1; } };
  const { useMobileFeedResume } = r.load('src/presentation/mobile/useMobileFeedResume.ts', { './mobileResumeState': core, './mobileResumeLaunch': { useMobileResumeLaunch: () => launch } });
  r.mount(useMobileFeedResume, input);
  return { d, r, core, cards, host,
    get more() { return more; }, get launch() { return launch; },
    update(changes = {}) { input = { ...input, ...changes }; return r.update(input); },
    changeLaunch(value) { launch = value; return this.update(); },
    frame() { d.frame(); return r.flush(); },
  };
}

test('cold Home fetches missing canonical pages once, aligns the saved artwork, and retires restoration listeners', () => {
  const f = feedFixture({ point: { scrollTop: 604, loadedCount: 24, anchorId: 'card-20', anchorOffset: 100 } });
  assert.equal(f.r.value.restoring, true);
  const cursor = { id: 'cursor-a', publishedAt: '2026-10-01' };
  f.update({ nextCursor: cursor }); assert.equal(f.more, 1);
  f.update(); assert.equal(f.more, 1);
  f.update({ busy: true }); assert.equal(f.d.frames.size, 0);
  f.cards.push(f.d.card('card-20', 900));
  f.update({ busy: false, projectIds: Array.from({ length: 24 }, (_, i) => `card-${i}`), nextCursor: null });
  f.frame(); f.frame(); f.frame();
  assert.equal(f.d.scrollTop, 800); assert.equal(f.r.value.restoring, false); assert.equal(f.r.value.handled, true);
  for (const type of ['pointerdown', 'touchstart', 'wheel', 'keydown']) assert.equal(f.d.window.count(type), 0, type);
  assert.equal(f.launch.feeds.has('/'), true);
  f.r.dispose(); assert.equal(f.d.frames.size, 0);
});

test('a clamped feed restore stops after forty-five frames and does not keep fighting user scroll', () => {
  const f = feedFixture({ point: { scrollTop: 604, loadedCount: 12 } }); f.d.maximum(0);
  for (let i = 0; i < 46; i++) f.frame();
  assert.equal(f.d.writes.length, 45); assert.equal(f.r.value.restoring, false);
  const count = f.d.writes.length; f.d.rawScroll(300); f.frame();
  assert.equal(f.d.writes.length, count); assert.equal(f.d.scrollTop, 300); f.r.dispose();
});

for (const type of ['pointerdown', 'touchstart', 'wheel', 'keydown']) {
  test(`${type} cancels cold restore, removes listeners and leaves subsequent input in control`, () => {
    const f = feedFixture({ point: { scrollTop: 604, loadedCount: 12 } });
    f.d.window.emit(type); f.r.flush(); const count = f.d.writes.length; f.d.rawScroll(220); f.frame();
    assert.equal(f.r.value.restoring, false); assert.equal(f.d.writes.length, count); assert.equal(f.d.scrollTop, 220);
    for (const name of ['pointerdown', 'touchstart', 'wheel', 'keydown']) assert.equal(f.d.window.count(name), 0);
    f.r.dispose();
  });
}

test('programmatic leave cancels an unfinished cold restore and retained Back cannot replay it', () => {
  const f = feedFixture({ point: { scrollTop: 604, loadedCount: 12 } });
  f.update({ enabled: false }); const writes = f.d.writes.length; f.frame();
  assert.equal(f.d.frames.size, 0); assert.equal(f.r.value.restoring, false);
  f.update({ enabled: true }); f.frame();
  assert.equal(f.d.writes.length, writes, 'Retained Back owns its own later position'); f.r.dispose();
});

test('loss of the eligible launch/account context cancels its pending correction before another account renders', () => {
  const f = feedFixture({ point: { scrollTop: 604, loadedCount: 12 } });
  f.changeLaunch(null); const count = f.d.writes.length; f.frame();
  assert.equal(f.r.value.restoring, false); assert.equal(f.d.writes.length, count);
  f.update({ accountId: 'account-b' }); f.frame();
  assert.equal(f.d.writes.length, count); f.r.dispose();
});

test('feed pagination recovery is capped and duplicate cursors never start concurrent extra reads', () => {
  const f = feedFixture({ point: { scrollTop: 100, loadedCount: 120 } });
  for (let i = 0; i < 14; i++) {
    const cursor = { id: `cursor-${i}`, publishedAt: '2026-10-01' };
    f.update({ nextCursor: cursor }); f.update();
  }
  assert.equal(f.more, 10); for (let i = 0; i < 4; i++) f.frame();
  assert.equal(f.r.value.restoring, false); f.r.dispose();
});

test('feed persistence captures only bounded position, count and stable artwork anchor, then flushes on hide', () => {
  const f = feedFixture(); f.cards.push(f.d.card('card-7', 900)); f.d.rawScroll(800); f.frame();
  assert.equal(f.d.values.size, 0, 'Scroll capture is debounced');
  f.d.document.visibilityState = 'hidden'; f.d.document.emit('visibilitychange');
  const saved = f.core.readMobileResume(account);
  assert.deepEqual(plain(saved.feed), { path: '/', scrollTop: 800, loadedCount: 12, anchorId: 'card-7', anchorOffset: 100 });
  f.update({ projectIds: Array.from({ length: 150 }, (_, i) => `card-${i}`) });
  f.d.window.emit('pagehide'); assert.equal(f.core.readMobileResume(account).feed.loadedCount, 120);
  assert.equal(Object.keys(saved).some(key => /content|title|token|source|cards/i.test(key)), false);
  f.r.dispose(); assert.equal(f.d.window.count('scroll'), 0); assert.equal(f.d.window.count('pagehide'), 0);
});

test('Web/inactive/guest/failed feeds do not capture or restore device hints', () => {
  for (const options of [{ enabled: false }, { accountId: null }, { ready: false }]) {
    const f = feedFixture(options); f.frame(); f.d.window.emit('scroll'); f.d.window.emit('pagehide'); f.d.settleTimers();
    assert.equal(f.d.values.size, 0); assert.equal(f.d.writes.length, 0); f.r.dispose();
  }
  const f = feedFixture(); f.update({ failed: true }); f.frame(); f.d.window.emit('pagehide');
  assert.equal(f.d.values.size, 0); f.r.dispose();
});

test('pending old-account feed writes cannot land under a replacement account', () => {
  const f = feedFixture(); f.d.rawScroll(700); f.frame();
  f.update({ accountId: 'account-b', ready: false }); f.d.settleTimers(); f.d.window.emit('pagehide');
  assert.equal(f.core.readMobileResume(account), null); assert.equal(f.core.readMobileResume('account-b'), null); f.r.dispose();
});

test('legacy scroll restoration must settle before a fresh feed checkpoint can replace a saved position', () => {
  const f = feedFixture({ ready: false });
  f.core.saveMobileResumeFeed(account, '/', { scrollTop: 604, loadedCount: 24 });
  f.update({ ready: true, saveReady: false }); f.frame(); f.d.window.emit('pagehide');
  assert.equal(f.core.readMobileResume(account).feed.scrollTop, 604);
  f.d.rawScroll(725); f.update({ saveReady: true }); f.frame(); f.d.window.emit('pagehide');
  assert.equal(f.core.readMobileResume(account).feed.scrollTop, 725); f.r.dispose();
});

function readerFixture({ enabled = true, accountId = account, record = null, pathname = project, search = '', domView = null } = {}) {
  const d = device(), r = runtime(d), core = r.load('src/presentation/mobile/mobileResumeState.ts');
  const viewer = r.load('src/components/media/viewerMemory.ts');
  let route = { pathname, search, hash: '' };
  let currentView = domView;
  const pageNode = () => currentView && !currentView.loading ? { dataset: { projectPageNumber: String(currentView.page ?? 1), reachAttachment: currentView.attachmentId ?? 'pdf' } } : null;
  const focused = { querySelector: pageNode };
  const stage = { closest: selector => selector === '[data-premium-project-viewer]' ? { getAttribute: () => currentView?.shared ? 'true' : 'false' } : currentView?.inert ? {} : null,
    querySelector: selector => selector === '[data-mobile-focused-view]' ? currentView?.mode === 'focused' ? focused : null : pageNode(),
  };
  d.document.querySelector = selector => currentView && selector.includes('data-project-continuity-id="project"') ? stage : null;
  const { MobileResumeProvider } = r.load('src/presentation/mobile/MobileResumeContext.tsx', {
    'react-router-dom': { useLocation: () => route }, '../../components/media/viewerMemory': viewer, './mobileResumeState': core,
    './mobileResumeLaunch': r.load('src/presentation/mobile/mobileResumeLaunch.ts'),
  });
  let props = { enabled, accountId, record, children: React.createElement('actual-reader-boundary') };
  r.mount(MobileResumeProvider, props);
  return { d, r, core, viewer,
    update(changes = {}, nextRoute) { props = { ...props, ...changes }; if (nextRoute) route = { ...route, ...nextRoute }; return r.update(props); },
    setDomView(value) { currentView = value; },
  };
}

test('reader provider seeds exact validated values before child initialization without recursively checkpointing', () => {
  const entries = [{ key: 'workspace:document:project:pdf:rendered', state: { focusedPageNumber: 0, lastFocusedPageNumber: 0 } }, { key: 'workspace:document:project:pdf:rendered:page:0', state: { zoom: 2.2, scrollTop: 42, scrollLeft: 17 } }];
  const record = { version: 1, accountId: account, savedAt: Date.now(), path: project, reader: { path: project, entries } };
  const f = readerFixture({ record });
  assert.deepEqual(plain(f.viewer.readViewerMemory(entries[0].key)), entries[0].state);
  assert.deepEqual(plain(f.viewer.readViewerMemory(entries[1].key)), entries[1].state);
  assert.equal(f.d.values.size, 0, 'Seeding does not notify the ordinary mutation observer');
  f.viewer.updateViewerMemory(entries[1].key, { zoom: 3 }); f.d.window.emit('pagehide');
  assert.equal(f.core.readMobileResume(account).reader.entries.find(entry => entry.key === entries[1].key).state.zoom, 3);
  f.r.dispose();
});

test('reader checkpoint observes only current workspace project, bounds entries and excludes unknown state fields', () => {
  const f = readerFixture();
  f.viewer.updateViewerMemory('workspace:project:project', { activeAttachmentId: 'pdf' });
  for (let i = 0; i < 9; i++) f.viewer.updateViewerMemory(`workspace:document:project:pdf:live:page:${i}`, { zoom: 2, scrollTop: i, sourceUrl: 'https://signed.example/token' });
  f.viewer.updateViewerMemory('workspace:document:other:pdf:live', { focusedPageNumber: 7 });
  f.viewer.updateViewerMemory('shared:project:project', { activeAttachmentId: 'public' });
  f.d.window.emit('pagehide'); const saved = f.core.readMobileResume(account);
  assert.equal(saved.reader.entries.length, 6);
  assert.equal(saved.reader.entries.some(entry => entry.key === 'workspace:project:project'), true);
  assert.equal(saved.reader.entries.every(entry => entry.key.includes(':project') && !('sourceUrl' in entry.state)), true);
  assert.equal(JSON.stringify(saved).includes('signed.example'), false); f.r.dispose();
});

test('reader observers retire without writing old account state after account replacement or disabled mobile scope', () => {
  for (const changes of [{ accountId: 'account-b' }, { enabled: false }]) {
    const f = readerFixture(); f.viewer.updateViewerMemory('workspace:project:project', { activeAttachmentId: 'pdf' });
    f.update(changes); f.d.settleTimers(); f.viewer.updateViewerMemory('workspace:project:project', { activeAttachmentId: 'later' });
    f.d.window.emit('pagehide');
    assert.equal(f.core.readMobileResume(account), null);
    if (!changes.accountId) assert.equal(f.d.values.size, 0);
    f.r.dispose();
  }
});

test('a launch on Home never primes an older reader context during later ordinary project navigation', () => {
  const key = 'workspace:images:project';
  const record = { version: 1, accountId: account, savedAt: Date.now(), path: '/', reader: { path: project, entries: [{ key, state: { focusedPageId: 'old-image' } }] } };
  const f = readerFixture({ pathname: '/', record });
  f.viewer.updateViewerMemory(key, { focusedPageId: 'new-image' });
  f.update({}, { pathname: project });
  assert.equal(f.viewer.readViewerMemory(key).focusedPageId, 'new-image'); f.r.dispose();
});

test('viewer observer is detachable and throwing checkpoint subscribers cannot interrupt existing session persistence', () => {
  const d = device(), r = runtime(d), viewer = r.load('src/components/media/viewerMemory.ts');
  const seen = [], stop = viewer.observeViewerMemory((key, state) => seen.push([key, state.zoom]));
  viewer.observeViewerMemory(() => { throw new Error('Optional checkpoint failure'); });
  viewer.updateViewerMemory('workspace:images:project:image', { zoom: 2 }); stop();
  viewer.updateViewerMemory('workspace:images:project:image', { scrollTop: 42 }); d.frame();
  assert.deepEqual(seen, [['workspace:images:project:image', 2]]);
  assert.deepEqual(JSON.parse(d.session.get('portalink.viewer.workspace:images:project:image')), { zoom: 2, scrollTop: 42 });
});

function nodes(element) { return React.isValidElement(element) ? [element, ...React.Children.toArray(element.props.children).flatMap(nodes)] : []; }
function bootstrapFixture({ pathname = '/', search = '', hash = '', mobile = true, guest = false, pendingView = null } = {}) {
  const d = device(), r = runtime(d), core = r.load('src/presentation/mobile/mobileResumeState.ts');
  core.saveMobileResumeRoute(account, project);
  let route = { pathname, search, hash, key: 'initial' };
  let auth = { isAuthenticated: !guest, isInitializing: false, isSessionUnavailable: false, pendingView, phase: 'authenticated', session: null, user: guest ? null : { id: account } };
  const messageDrafts = r.load('src/presentation/mobile/mobileMessageDrafts.ts');
  const resume = r.load('src/presentation/mobile/useMobileResumeSession.ts', { './mobileResumeState': core, './mobileMessageDrafts': messageDrafts });
  const routes = { controlCenter: { path: '/settings' }, sharedProfile: { path: '/share/:profileId' }, sharedCollaboration: { path: '/share/:profileId/collaboration' }, sharedProject: { path: '/share/:profileId/c/:categoryId/:projectId' }, sharedProfileCategory: { path: '/share/:profileId/c/:categoryId' } };
  const { ApplicationBootstrap } = r.load('src/app/ApplicationBootstrap.tsx', {
    '../features/sharing/shareModel': { handleFromPath: () => null }, 'framer-motion': { AnimatePresence: 'animate-presence' },
    'react-router-dom': { Navigate: 'navigate', useLocation: () => route, matchPath: () => null }, '../App': { App: 'app-boundary' },
    '../components/ui/PortalinkSplashLoader': { PortalinkSplashLoader: 'splash' }, '../components/ui/StateViews': { ErrorState: 'error', LoadingState: 'loading' },
    '../components/auth/CatalogWelcome': { CatalogWelcome: 'catalog-welcome' }, '../components/auth/catalogWelcomeState': { hasEnteredCatalogWelcome: () => true },
    '../contexts/AuthContext': { useAuth: () => auth }, './routes': { routes, buildPath: () => '/share/profile' }, './splashLifecycle': { PORTALINK_SPLASH_EXIT_EVENT: 'splash-exit' },
    '../presentation/useViewportPresentation': { useViewportPresentation: () => mobile ? 'mobile' : 'web' }, './screenModules': { warmScreenForPath: () => Promise.resolve() },
    './homeStartup': { HOME_STARTUP_TIMEOUT_MS: 1000 }, '../features/install/useMobileInstall': { useMobileInstallCapture() {} },
    '../presentation/mobile/useMobileResumeSession': resume, '../presentation/mobile/MobileResumeContext': { MobileResumeProvider: 'resume-provider' },
  });
  r.mount(ApplicationBootstrap);
  return { d, r, core,
    update(nextRoute = {}, nextAuth = {}) { route = { ...route, ...nextRoute }; auth = { ...auth, ...nextAuth }; return r.update(); },
  };
}

test('actual bootstrap selects an eligible mobile destination before mounting App/Home and passes the same launch context afterward', () => {
  const f = bootstrapFixture();
  let tree = nodes(f.r.value);
  assert.equal(tree.find(node => node.type === 'navigate')?.props.to, project);
  assert.equal(tree.some(node => node.type === 'app-boundary'), false);
  tree = nodes(f.update({ pathname: project, key: 'resume-replacement' }));
  assert.equal(tree.some(node => node.type === 'navigate'), false);
  assert.equal(tree.some(node => node.type === 'app-boundary'), true);
  assert.equal(tree.find(node => node.type === 'resume-provider')?.props.record.path, project);
  f.r.dispose();
});

test('actual bootstrap leaves explicit incoming links, welcome/Auth actions, guests and Web on their requested destination', () => {
  for (const options of [{ pathname: project, search: '?media=pdf&page=2&view=page' }, { search: '?welcome=1' }, { hash: '#access_token=secret' }, { pendingView: 'resetPassword' }, { guest: true }, { mobile: false }]) {
    const f = bootstrapFixture(options), tree = nodes(f.r.value);
    assert.equal(tree.some(node => node.type === 'navigate' && node.props.to === project), false, JSON.stringify(options));
    const provider = tree.find(node => node.type === 'resume-provider');
    assert.equal(provider?.props.record ?? null, null, JSON.stringify(options));
    f.r.dispose();
  }
});

function initialDocumentMode(destination, remembered) {
  const source = ts.createSourceFile('ProjectMediaViewer.tsx', readFileSync(new URL('../src/components/media/ProjectMediaViewer.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ProjectMediaViewer');
  const names = ['singlePageQuery', 'singlePageNumber', 'isSavedSinglePage', 'isVerticalReading'];
  const declarations = component.body.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]);
  const code = names.map(name => 'const ' + declarations.find(item => item.name.getText(source) === name).getText(source) + ';').join('\n');
  const context = { active: { id: 'pdf', kind: 'document' }, isMobileViewer: true, window: { location: { search: new URL(destination, 'https://portalinknetworks.com').search } }, URLSearchParams };
  const vertical = vm.runInNewContext(code + '\nisVerticalReading;', context);
  const documentSource = ts.createSourceFile('DocumentAttachment.tsx', readFileSync(new URL('../src/components/media/DocumentAttachment.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const deepLink = documentSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'deepLinkedDocumentPage').getText(documentSource);
  const documentComponent = documentSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'DocumentAttachment');
  const focus = documentComponent.body.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]).find(declaration => declaration.name.getText(documentSource).includes('focusedPageIndex'));
  const initializer = focus.initializer.arguments[0].getText(documentSource);
  const output = ts.transpileModule(deepLink + '\n(' + initializer + ')();', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const focused = vm.runInNewContext(output, { ...context, verticalReading: vertical, attachment: { id: 'pdf' }, readViewerMemory: () => remembered, memoryKey: 'workspace:document:project:pdf:rendered', readingMode: false });
  return { vertical, focused };
}

test('plain-project cold resume preserves actual focused reader initialization after the URL originally had no page query', () => {
  const d = device(), r = runtime(d), core = r.load('src/presentation/mobile/mobileResumeState.ts');
  core.saveMobileResumeRoute(account, project);
  const state = { focusedPageNumber: 6, lastFocusedPageNumber: 6 };
  core.saveMobileResumeReader(account, project, { view: { mode: 'focused', attachmentId: 'pdf', page: 7 }, entries: [{ key: 'workspace:project:project', state: { activeAttachmentId: 'pdf' } }, { key: 'workspace:document:project:pdf:rendered', state }] });
  const saved = core.readMobileResume(account), destination = core.mobileResumeDestination(saved);
  assert.deepEqual(initialDocumentMode(destination, state), { vertical: false, focused: 6 });
});

test('current focused DOM mode checkpoints a one-based page and restores its exact renderer initialization', () => {
  const f = readerFixture({ domView: { mode: 'focused', attachmentId: 'pdf', page: 7 } });
  f.core.saveMobileResumeRoute(account, project);
  f.viewer.updateViewerMemory('workspace:document:project:pdf:rendered', { focusedPageNumber: 6, zoom: 2 });
  f.d.window.emit('pagehide'); const saved = f.core.readMobileResume(account);
  assert.deepEqual(plain(saved.reader.view), { mode: 'focused', attachmentId: 'pdf', page: 7 });
  assert.deepEqual(initialDocumentMode(f.core.mobileResumeDestination(saved), { focusedPageNumber: 6 }), { vertical: false, focused: 6 });
  f.r.dispose();
});

test('DOM overview retires stale linked focus, while cached focus alone cannot promote an ordinary vertical reader', () => {
  const f = readerFixture({ domView: { mode: 'overview' }, search: '?media=pdf&page=1&view=page' });
  f.core.saveMobileResumeRoute(account, `${project}?media=pdf&page=1&view=page`);
  f.viewer.updateViewerMemory('workspace:document:project:pdf:rendered', { focusedPageNumber: 6 });
  f.d.window.emit('pagehide'); const saved = f.core.readMobileResume(account);
  assert.deepEqual(plain(saved.reader.view), { mode: 'overview' });
  const destination = f.core.mobileResumeDestination(saved);
  assert.deepEqual(initialDocumentMode(destination, { focusedPageNumber: 6 }), { vertical: true, focused: null });
  const legacy = { ...saved, path: project, reader: { ...saved.reader } }; delete legacy.reader.view;
  assert.equal(f.core.mobileResumeDestination(legacy), project, 'A stale numeric memory is not proof of focused mode');
  f.r.dispose();
});

test('invalid or loading DOM pages cannot persist URLs, unsafe fields or overwrite the last observed reader mode', () => {
  const f = readerFixture({ domView: { mode: 'focused', attachmentId: 'pdf', page: 7 } });
  f.core.saveMobileResumeRoute(account, project); f.d.window.emit('pagehide');
  assert.equal(f.core.readMobileResume(account).reader.view.page, 7);
  for (const view of [{ mode: 'focused', attachmentId: 'https://signed.example', page: 8 }, { mode: 'focused', attachmentId: 'pdf', page: 10001 }, { loading: true }]) {
    f.setDomView(view); f.d.window.emit('pagehide');
    assert.equal(f.core.readMobileResume(account).reader.view.page, 7);
  }
  for (const view of [{ mode: 'overview', sourceUrl: 'private' }, { mode: 'focused', attachmentId: 'pdf', page: 0 }, { mode: 'focused', attachmentId: 'pdf', page: 1.5 }, { mode: 'focused', attachmentId: 'pdf', page: 1, token: 'private' }]) {
    assert.equal(f.core.saveMobileResumeReader(account, project, { view }), false);
  }
  assert.equal(JSON.stringify(f.core.readMobileResume(account)).includes('signed.example'), false); f.r.dispose();
});

test('inert transition snapshots and read-only public readers cannot become the private launch mode', () => {
  const f = readerFixture({ domView: { mode: 'focused', attachmentId: 'pdf', page: 7 } });
  f.d.window.emit('pagehide'); assert.equal(f.core.readMobileResume(account).reader.view.page, 7);
  for (const guard of [{ inert: true }, { shared: true }]) {
    f.setDomView({ mode: 'focused', attachmentId: 'pdf', page: 9, ...guard });
    f.d.window.emit('pagehide'); assert.equal(f.core.readMobileResume(account).reader.view.page, 7);
  }
  f.r.dispose();
});
