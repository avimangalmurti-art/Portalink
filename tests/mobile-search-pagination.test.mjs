import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';
import { deferred } from './helpers/hook-harness.mjs';

const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const people = (offset = 0, count = 30, prefix = 'Creator') => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${offset + index}`, name: `${prefix} ${offset + index}`, kind: `@${prefix.toLowerCase()}${offset + index}` }));
const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const textOf = node => React.isValidElement(node) ? React.Children.toArray(node.props.children).map(textOf).join('') : node == null ? '' : String(node);

/** Real SearchAccountsPage with controlled React commits and service responses.
 * DOM doubles expose only focus, scroll, geometry and animation contracts; this
 * establishes state/lifecycle behavior, not browser layout or device behavior.
 */
function fixture(searchAccounts, initial = {}) {
  const slots = [], timers = new Map(), frames = new Map(), hosts = new Map(), events = new Map(), mediaEvents = new Map(), animations = [], focusCalls = [], scrollWrites = [], observers = [];
  let cursor = 0, dirty = true, tree, effects = [], layout = [], mounted = true, active = true, lateStateWrites = 0, timerId = 0, frameId = 0, mode = initial.mode ?? 'mobile', reduced = initial.reduced ?? false, appReduced = false;
  let auth = { user: { id: 'account-a' }, viewerProfileId: 'profile-a' };
  const requests = [], visits = [], props = { query: '', onQueryChange(value) { props.query = value; dirty = true; }, onOpenCreator: id => visits.push(id) };
  const add = (map, type, callback) => { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(callback); };
  const emit = (map, type, event = {}) => { for (const callback of [...(map.get(type) ?? [])]) callback({ type, ...event }); };
  const discovery = { searchAccounts: (...args) => { requests.push(args); return searchAccounts(...args); } };
  let document;
  class Element {
    constructor(type, path) { this.tagName = type.toUpperCase(); this.path = path; this.children = []; this.parentElement = null; this.props = {}; this.dataset = {}; this.style = {}; this.isConnected = true; this.events = new Map(); this._top = 0; this.scrollLeft = 0; this.clientHeight = 500; this.scrollHeight = 2500; }
    get scrollTop() { return this._top; }
    set scrollTop(value) { this._top = value; scrollWrites.push([this, value]); }
    get className() { return this.props.className ?? ''; }
    get disabled() { return this.props.disabled === true; }
    get childElementCount() { return this.children.length; }
    contains(target) { for (let node = target; node; node = node.parentElement) if (node === this) return true; return false; }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (selector === 'main' && node.tagName === 'MAIN' || selector.includes('inert') && node.inert || selector.includes('aria-hidden') && node.props['aria-hidden'] === 'true') return node; return null; }
    matches(selector) { return selector.includes(this.tagName.toLowerCase()) || selector === ':disabled' && this.disabled; }
    getClientRects() { return this.isConnected ? [this.getBoundingClientRect()] : []; }
    getBoundingClientRect() { if (this.zeroGeometry) return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; const index = this.parentElement?.children.indexOf(this) ?? 0, results = this.className.includes('account-search-results'); const top = results ? 150 : this.tagName === 'MAIN' || this.tagName === 'SECTION' ? 0 : 150 + index * 64 - (this.parentElement?.parentElement?._top ?? 0), height = results ? this.clientHeight : this.tagName === 'MAIN' || this.tagName === 'SECTION' ? 912 : 64; return { top, bottom: top + height, left: 0, right: 420, width: 420, height }; }
    querySelectorAll(selector) { const result = []; const visit = node => { for (const child of node.children) { if (/\bli\b/.test(selector) && child.tagName === 'LI' || selector.includes('button') && child.tagName === 'BUTTON' || selector.startsWith('[data-') && Object.keys(child.props).some(name => name.startsWith('data-'))) result.push(child); visit(child); } }; visit(this); return result; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    addEventListener(type, callback) { add(this.events, type, callback); }
    removeEventListener(type, callback) { this.events.get(type)?.delete(callback); }
    focus(options) { document.activeElement = this; focusCalls.push({ node: this, options }); }
    scrollTo(options) { this.scrollTop = typeof options === 'number' ? options : options.top ?? this.scrollTop; }
    animate(keyframes, options) { let resolve, reject; const animation = { node: this, keyframes, options, finished: new Promise((yes, no) => { resolve = yes; reject = no; }), cancel() { this.cancelled = true; reject(Error('Cancelled')); }, finish() { resolve(); } }; animations.push(animation); return animation; }
  }
  const body = new Element('body', 'body'), html = new Element('html', 'html'), main = new Element('main', 'main'); main.parentElement = body;
  document = { body, documentElement: html, activeElement: body,
    querySelector: selector => selector.includes('.reduce-motion') ? appReduced ? html : null : [...hosts.values()].find(node => selector.includes('account-search') && node.props['data-account-search'] !== undefined) ?? null,
    addEventListener: (type, callback) => add(events, type, callback), removeEventListener: (type, callback) => events.get(type)?.delete(callback) };
  const media = { get matches() { return reduced; }, addEventListener: (type, callback) => add(mediaEvents, type, callback), removeEventListener: (type, callback) => mediaEvents.get(type)?.delete(callback) };
  const window = { innerHeight: 912, matchMedia: () => media, addEventListener: (type, callback) => add(events, type, callback), removeEventListener: (type, callback) => events.get(type)?.delete(callback),
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; }, clearTimeout(id) { timers.delete(id); }, requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); } };
  const globals = { document, window, HTMLElement: Element, getComputedStyle: () => ({ getPropertyValue: name => ({ '--m-fast': '120ms', '--m-enter': 'ease-out' }[name] ?? '') }),
    requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame,
    MutationObserver: class { constructor(callback) { this.callback = callback; this.active = true; observers.push(this); } observe() {} disconnect() { this.active = false; } } };
  const effect = (queue, callback, deps) => { const index = cursor++, prior = slots[index]; if (!same(prior?.deps, deps)) { const slot = slots[index] = { deps }; queue.push(() => { prior?.cleanup?.(); if (mounted) slot.cleanup = callback(); }); } };
  const react = { ...React,
    useState(initialValue) { const index = cursor++; slots[index] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue }; return [slots[index].value, next => { if (!mounted) { lateStateWrites++; return; } const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useRef(initialValue) { return slots[cursor++] ??= { current: initialValue }; },
    useMemo(factory, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) { effect(effects, callback, deps); }, useLayoutEffect(callback, deps) { effect(layout, callback, deps); } };
  const motion = sourceModule('src/presentation/motion/motion.ts', { 'react-dom': { flushSync: callback => callback() }, '../../utils/projectContinuity': {} }, globals);
  const { SearchAccountsPage } = sourceModule('src/components/SearchAccountsPage.tsx', { react, '../contexts/AuthContext': { useAuth: () => auth }, '../contexts/ServicesContext': { useServices: () => ({ discovery }) },
    '../features/follows/recentAccounts': { readRecentAccounts: () => [], rememberAccount() {}, forgetAccount() {} }, '../presentation/usePresentation': { usePresentation: () => mode },
    '../presentation/motion/motion': motion, '../presentation/mobile/MobileBackNavigation': { ScreenBack: 'ScreenBack', useMobileScreenActive: () => active },
    './profile/CreatorAvatar': { CreatorAvatar: 'CreatorAvatar' }, './ui/StateViews': { EmptyState: 'EmptyState', ErrorState: 'ErrorState', LoadingState: 'LoadingState' },
    'lucide-react': { ArrowLeftIcon: 'ArrowLeftIcon', XIcon: 'XIcon' } }, globals);
  function commit(node, path = '0', parent = null, seen = new Set()) {
    if (!React.isValidElement(node)) return [];
    if (typeof node.type !== 'string') return React.Children.toArray(node.props.children).flatMap((child, index) => commit(child, `${path}.${child.key ?? index}`, parent, seen));
    let host = hosts.get(path); if (!host || host.tagName !== node.type.toUpperCase()) { host = new Element(node.type, path); hosts.set(path, host); }
    seen.add(host); host.isConnected = true; host.props = node.props; host.parentElement = parent; host.dataset = Object.fromEntries(Object.entries(node.props).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
    host.children = React.Children.toArray(node.props.children).flatMap((child, index) => commit(child, `${path}.${child.key ?? index}`, host, seen));
    if (typeof node.ref === 'function') node.ref(host); else if (node.ref) node.ref.current = host;
    return [host];
  }
  function render() { if (!mounted) return tree; for (let pass = 0; dirty; pass++) { assert.ok(pass < 30, 'Component render should settle'); dirty = false; cursor = 0; effects = []; layout = []; tree = SearchAccountsPage(props); const seen = new Set(); main.children = commit(tree, '0', main, seen); for (const host of hosts.values()) if (!seen.has(host)) host.isConnected = false; layout.splice(0).forEach(run => run()); effects.splice(0).forEach(run => run()); } return tree; }
  const find = predicate => nodes(render()).find(predicate);
  const hostFor = element => [...hosts.values()].find(host => host.isConnected && host.props === element?.props);
  render();
  return { requests, visits, document, main, animations, focusCalls, scrollWrites, frames, render,
    get lateStateWrites() { return lateStateWrites; },
    get rows() { return nodes(render()).filter(node => node.type === 'strong').map(node => textOf(node)); },
    get loader() { return find(node => node.type === 'LoadingState'); },
    get error() { return find(node => node.type === 'ErrorState' || node.props.role === 'alert'); },
    get footer() { return find(node => node.type === 'button' && /Show more accounts|Loading…|Retrying…|^Retry$/.test(textOf(node))); },
    get results() { return [...hosts.values()].find(host => host.isConnected && host.className.includes('account-search-results')); },
    get paginationRegion() { return [...hosts.values()].find(host => host.isConnected && host.className === 'flow-root'); },
    get field() { return hostFor(find(node => node.type === 'textarea' || node.type === 'input')); },
    find, hostFor,
    query(value) { props.query = value; dirty = true; render(); },
    owner(id) { auth = { user: { id }, viewerProfileId: `profile-${id}` }; dirty = true; render(); },
    mode(value) { mode = value; dirty = true; render(); },
    active(value) { active = value; main.inert = !value; dirty = true; render(); },
    runTimers() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } render(); },
    paint() { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } render(); },
    clickMore() { const button = this.footer; assert.ok(button, 'Expected pagination control'); button.props.onClick({ currentTarget: hostFor(button) }); render(); },
    retry() { const error = this.error; const button = find(node => node.type === 'button' && /^(Retry|Try again)$/.test(textOf(node))); assert.ok(button || error?.props.onRetry, 'Expected retry control'); const callback = button?.props.onClick ?? error.props.onRetry; callback({ currentTarget: hostFor(button) }); render(); return callback; },
    input(type, target = this.results) { emit(events, type, { target }); if (target?.events) emit(target.events, type, { target }); },
    reduce(value) { reduced = value; emit(mediaEvents, 'change'); },
    appReduce(value) { appReduced = value; observers.filter(observer => observer.active).forEach(observer => observer.callback()); },
    async flush() { for (let pass = 0; pass < 15; pass++) { await Promise.resolve(); render(); } },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); for (const host of hosts.values()) host.isConnected = false; },
  };
}

async function loaded(searchAccounts, initial) { const h = fixture(searchAccounts, initial); h.query('portal'); h.runTimers(); await h.flush(); assert.equal(h.rows.length, 30); return h; }

test('MOBILE pagination retains rows, scroll and focused search while one disabled footer reports loading', async () => {
  const page = deferred(), h = await loaded((query, offset = 0) => offset ? page.promise : Promise.resolve(people()));
  h.results._top = 640; h.field.focus(); const focusCount = h.focusCalls.length; h.clickMore(); h.clickMore();
  assert.equal(h.rows.length, 30); assert.equal(h.loader, undefined); assert.match(textOf(h.footer), /Loading…/); assert.equal(h.footer.props['aria-disabled'], true); assert.equal(h.footer.props['aria-busy'], true);
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1][1], 30); assert.equal(h.results.scrollTop, 640); assert.equal(h.document.activeElement, h.field); assert.equal(h.focusCalls.length, focusCount);
  page.resolve(people(30, 3)); await h.flush(); assert.equal(h.rows.length, 33); assert.equal(h.footer, undefined); assert.equal(h.results.scrollTop, 640); assert.equal(h.document.activeElement, h.field); assert.equal(h.scrollWrites.length, 0); h.unmount();
});

test('MOBILE failed page and repeated Retry retain the loaded page and use its same offset', async () => {
  const attempts = [deferred(), deferred(), deferred()]; let next = 0;
  const h = await loaded((query, offset = 0) => offset ? attempts[next++].promise : Promise.resolve(people()));
  h.results._top = 712; h.clickMore(); attempts[0].reject(Error('offline')); await h.flush();
  assert.equal(h.rows.length, 30); assert.ok(h.error); assert.equal(h.loader, undefined); assert.equal(h.results.scrollTop, 712);
  const failedTree = nodes(h.render()); assert.ok(failedTree.findIndex(node => node.type === 'ErrorState' || node.props.role === 'alert') > failedTree.findIndex(node => node.type === 'ul'), 'A pagination error must not insert height above retained rows');
  const retryAgain = h.retry(); assert.equal(h.rows.length, 30); assert.equal(h.loader, undefined); assert.equal(h.requests.at(-1)[1], 30); retryAgain({}); h.render(); assert.equal(h.requests.length, 3, 'A repeated Retry cannot create a duplicate request');
  attempts[1].reject(Error('still offline')); await h.flush(); assert.equal(h.rows.length, 30); h.retry(); assert.equal(h.requests.at(-1)[1], 30);
  attempts[2].resolve(people(30, 2)); await h.flush(); assert.equal(h.rows.length, 32); assert.equal(h.error, undefined); assert.equal(h.results.scrollTop, 712); assert.equal(h.scrollWrites.length, 0); h.unmount();
});

test('MOBILE next successful page advances offset only after confirmed append', async () => {
  const h = await loaded((query, offset = 0) => Promise.resolve(people(offset))); h.clickMore(); await h.flush(); assert.equal(h.rows.length, 60); h.clickMore(); await h.flush();
  assert.equal(h.rows.length, 90); assert.deepEqual(h.requests.map(([, offset = 0]) => offset), [0, 30, 60]); h.unmount();
});

test('a new MOBILE query hides prior rows immediately and rejects late pagination results and failures', async () => {
  for (const fail of [false, true]) { const oldPage = deferred(); const h = await loaded((query, offset = 0) => query === 'portal' && offset ? oldPage.promise : Promise.resolve(people(0, 30, query)));
    h.clickMore(); h.query('other'); assert.equal(h.rows.length, 0); h.runTimers(); await h.flush();
    if (fail) oldPage.reject(Error('late offline')); else oldPage.resolve(people(30, 4, 'old'));
    await h.flush(); assert.equal(h.rows.length, 30); assert.ok(h.rows.every(name => name.startsWith('other'))); assert.equal(h.error, undefined); h.unmount(); }
});

test('clearing MOBILE search supersedes a held page and cannot repopulate recent accounts', async () => {
  const page = deferred(), h = await loaded((query, offset = 0) => offset ? page.promise : Promise.resolve(people())); h.clickMore(); h.query(''); page.resolve(people(30, 5)); await h.flush();
  assert.equal(h.rows.length, 0); assert.equal(h.loader, undefined); assert.equal(h.error, undefined); h.unmount();
});

test('MOBILE owner and presentation changes reject stale page responses', async () => {
  for (const change of ['owner', 'mode']) for (const fail of [false, true]) { const page = deferred(); const h = await loaded((query, offset = 0) => offset ? page.promise : Promise.resolve(people(0, 30, 'current'))); h.clickMore();
    if (change === 'owner') h.owner('account-b'); else h.mode('web'); h.runTimers(); await h.flush();
    if (fail) page.reject(Error('stale offline')); else page.resolve(people(30, 5, 'stale')); await h.flush();
    assert.equal(h.rows.some(name => name.startsWith('stale')), false, change); assert.equal(h.error, undefined); h.unmount(); }
});

test('unmounted MOBILE search ignores an outstanding page completion', async () => {
  const page = deferred(), h = await loaded((query, offset = 0) => offset ? page.promise : Promise.resolve(people())); h.clickMore(); const before = h.render(); h.unmount(); page.resolve(people(30, 4)); await h.flush(); assert.equal(h.render(), before); assert.equal(h.lateStateWrites, 0); assert.equal(h.animations.some(animation => !animation.cancelled), false);
});

test('MOBILE initial-search failure still retries the first page', async () => {
  let fail = true; const h = fixture((query, offset = 0) => fail ? Promise.reject(Error('offline')) : Promise.resolve(people(offset, 2))); h.query('portal'); h.runTimers(); await h.flush(); assert.equal(h.rows.length, 0); assert.ok(h.error);
  fail = false; h.retry(); h.runTimers(); await h.flush(); assert.equal(h.rows.length, 2); assert.deepEqual(h.requests.map(([, offset = 0]) => offset), [0, 0]); h.unmount();
});

test('MOBILE pagination transfers disappearing footer focus with preventScroll, without stealing search focus', async () => {
  const page = deferred(), h = await loaded((query, offset = 0) => offset ? page.promise : Promise.resolve(people()));
  h.results._top = 1810; h.hostFor(h.footer).focus(); h.clickMore(); assert.equal(h.document.activeElement, h.hostFor(h.footer), 'Loading preserves the same enabled-to-focus footer element');
  page.resolve(people(30, 2)); await h.flush(); h.paint(); assert.equal(h.footer, undefined); assert.equal(h.document.activeElement, h.main); assert.equal(h.focusCalls.at(-1).options.preventScroll, true); assert.equal(h.results.scrollTop, 1810); assert.equal(h.scrollWrites.length, 0); h.unmount();
});

test('MOBILE appended visible rows reveal once with existing fast opacity motion; existing rows stay immediately visible', async () => {
  const page = deferred(), h = await loaded((query, offset = 0) => offset ? page.promise : Promise.resolve(people()));
  assert.equal(h.animations.length, 0); h.results._top = 1900; h.clickMore(); page.resolve(people(30, 3)); await h.flush(); h.paint();
  assert.ok(h.animations.length > 0); assert.ok(h.animations.every(animation => animation.node.tagName === 'LI' && animation.node.parentElement.children.indexOf(animation.node) >= 30));
  for (const animation of h.animations) { assert.deepEqual(JSON.parse(JSON.stringify(animation.keyframes)), [{ opacity: 0 }, { opacity: 1 }]); assert.equal(animation.options.duration, 120); assert.equal(animation.options.easing, 'ease-out'); assert.equal(animation.options.delay ?? 0, 0); }
  const count = h.animations.length; h.render(); h.paint(); assert.equal(h.animations.length, count); assert.equal(h.results.scrollTop, 1900); assert.equal(h.scrollWrites.length, 0); h.unmount(); await h.flush();
});

test('MOBILE direct input interrupts an append reveal and pending input skips it without delaying results', async () => {
  for (const pending of [false, true]) { const page = deferred(), h = await loaded((query, offset = 0) => offset ? page.promise : Promise.resolve(people())); h.results._top = 1900; h.clickMore();
    if (pending) h.input('wheel'); page.resolve(people(30, 3)); await h.flush(); h.paint(); if (!pending) { assert.ok(h.animations.length > 0); h.input('pointerdown'); }
    assert.equal(h.rows.length, 33); assert.ok(h.animations.every(animation => animation.cancelled)); assert.equal(h.results.scrollTop, 1900); h.unmount(); await h.flush(); }
});

test('MOBILE OS and app Reduce Motion skip or interrupt append motion', async () => {
  for (const preference of ['os', 'app']) for (const before of [true, false]) { const page = deferred(), h = await loaded((query, offset = 0) => offset ? page.promise : Promise.resolve(people())); h.results._top = 1900;
    if (before) { if (preference === 'os') h.reduce(true); else h.appReduce(true); } h.clickMore(); page.resolve(people(30, 3)); await h.flush(); h.paint();
    if (!before) { assert.ok(h.animations.length > 0); if (preference === 'os') h.reduce(true); else h.appReduce(true); }
    assert.equal(h.rows.length, 33); assert.ok(h.animations.every(animation => animation.cancelled)); assert.equal(h.scrollWrites.length, 0); h.unmount(); await h.flush(); }
});

test('MOBILE Back, query replacement and unmount cancel an unfinished append reveal', async () => {
  for (const change of ['back', 'query', 'unmount']) { const page = deferred(), h = await loaded((query, offset = 0) => offset ? page.promise : Promise.resolve(people())); h.results._top = 1900; h.clickMore(); page.resolve(people(30, 3)); await h.flush(); h.paint(); assert.ok(h.animations.length > 0);
    if (change === 'back') h.input('popstate'); else if (change === 'query') h.query('different'); else h.unmount();
    assert.ok(h.animations.every(animation => animation.cancelled), change); assert.equal(h.scrollWrites.length, 0); if (change !== 'unmount') h.unmount(); await h.flush(); }
});

test('a retained inactive MOBILE search can accept its page but does not animate or move focus on completion', async () => {
  const page = deferred(), h = await loaded((query, offset = 0) => offset ? page.promise : Promise.resolve(people())); h.results._top = 1900; h.clickMore(); h.active(false); const focusCount = h.focusCalls.length;
  page.resolve(people(30, 3)); await h.flush(); h.paint(); assert.equal(h.rows.length, 33); assert.equal(h.animations.length, 0); assert.equal(h.focusCalls.length, focusCount); assert.equal(h.results.scrollTop, 1900); h.active(true); h.paint(); assert.equal(h.animations.length, 0); h.unmount();
});

test('an empty final MOBILE page completing while hidden retains its last visible footer footprint without focus changes', async () => {
  const page = deferred(), h = await loaded((query, offset = 0) => offset ? page.promise : Promise.resolve(people())); h.results._top = 2015;
  h.active(false); h.clickMore(); assert.equal(h.requests.length, 1, 'An inactive retained screen cannot initiate pagination'); h.active(true);
  const height = h.paginationRegion.getBoundingClientRect().height; h.hostFor(h.footer).focus(); h.clickMore(); h.active(false); h.paginationRegion.zeroGeometry = true; const focusCount = h.focusCalls.length;
  page.resolve([]); await h.flush(); h.paint(); assert.equal(h.rows.length, 30); assert.equal(h.footer, undefined); assert.equal(h.paginationRegion.props.style.height, height); assert.equal(h.focusCalls.length, focusCount); assert.equal(h.animations.length, 0); assert.equal(h.results.scrollTop, 2015);
  h.active(true); h.paint(); assert.equal(h.paginationRegion.props.style.height, height); assert.equal(h.focusCalls.length, focusCount); assert.equal(h.scrollWrites.length, 0); h.unmount();
});

test('WEB retains its top pagination loader and restart-from-first-page Retry behavior', async () => {
  const page = deferred(); let retry = false; const h = await loaded((query, offset = 0) => offset && !retry ? page.promise : Promise.resolve(people(offset)), { mode: 'web' });
  h.clickMore(); assert.ok(h.loader); assert.equal(h.rows.length, 30); assert.equal(textOf(h.footer), 'Show more accounts'); page.reject(Error('offline')); await h.flush(); assert.ok(h.error);
  retry = true; h.retry(); assert.equal(h.rows.length, 0); h.runTimers(); await h.flush(); assert.equal(h.rows.length, 30); assert.equal(h.requests.at(-1)[1] ?? 0, 0); assert.equal(h.animations.length, 0); h.unmount();
});
