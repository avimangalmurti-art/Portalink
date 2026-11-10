import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';
import { deferred } from './helpers/hook-harness.mjs';

const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const textOf = node => React.isValidElement(node) ? React.Children.toArray(node.props.children).map(textOf).join('') : node == null ? '' : String(node);
const activityRows = (start = 0, count = 24) => Array.from({ length: count }, (_, index) => ({ kind: 'activity', id: `activity:n${start + index}`, title: `Update ${start + index}`, secondary: `Activity detail ${start + index}`, href: `/messages?conversation=${start + index}`, notification: { id: `n${start + index}`, isUnread: false } }));

/** Actual StudioPage with controlled commits and the existing data API boundary.
 * These DOM doubles establish focus/scroll/lifecycle contracts, not browser
 * layout, real network behavior, keyboard geometry or physical-phone results.
 */
function fixture(initial = {}) {
  const slots = [], hosts = new Map(), frames = new Map(), animations = [], calls = [], focuses = [], scrollWrites = [], events = new Map(), mediaEvents = new Map(), observers = [];
  let cursor = 0, dirty = true, tree, effects = [], layout = [], mounted = true, frameId = 0, active = true, mode = initial.mode ?? 'mobile', reduced = initial.reduced ?? false, appReduced = false, lateStateWrites = 0, contextOpen, activityControl = null;
  const registerActivityControl = control => { activityControl = control; };
  let params = new URLSearchParams('collection=activity'), auth = { user: { id: 'account-a' }, viewerProfileId: 'profile-a', isAuthenticated: true };
  let document;
  const add = (map, type, callback) => { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(callback); };
  const emit = (map, type, event = {}) => { for (const callback of [...(map.get(type) ?? [])]) callback({ type, ...event }); };
  class Element {
    constructor(tag, path) { this.tagName = tag.toUpperCase(); this.path = path; this.children = []; this.parentElement = null; this.props = {}; this.dataset = {}; this.events = new Map(); this.style = { overflowAnchor: 'auto' }; this.isConnected = true; this._top = 0; this.scrollLeft = 0; this.clientHeight = 600; this.clientWidth = 420; }
    get scrollTop() { return this._top; }
    set scrollTop(value) { this._top = Math.max(0, value); scrollWrites.push([this, this._top]); }
    get scrollHeight() { return this.querySelectorAll('[data-studio-row]').length * 100; }
    get className() { return this.props.className ?? ''; }
    get disabled() { return this.props.disabled === true; }
    contains(target) { for (let node = target; node; node = node.parentElement) if (node === this) return true; return false; }
    matches(selector) { return selector.includes(this.tagName.toLowerCase()) || selector === ':disabled' && this.disabled; }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (selector.includes('data-studio-scroll') && node.props['data-studio-scroll'] !== undefined || selector.includes('data-studio-row') && node.dataset.studioRow || selector.includes('role="alert"') && (node.props.role === 'alert' || node.tagName === 'ERROR') || selector.includes('aria-hidden') && node.props['aria-hidden'] === 'true' || selector.includes('inert') && node.inert) return node; return null; }
    getClientRects() { return this.isConnected && !this.inert ? [this.getBoundingClientRect()] : []; }
    getBoundingClientRect() { const list = this.closest('[data-studio-scroll]'), rows = list?.querySelectorAll('[data-studio-row]') ?? [], index = rows.indexOf(this), row = Boolean(this.dataset.studioRow); const top = row ? 200 + index * 100 - main.scrollTop : this.className === 'studio-content' ? 200 : 0; const height = row ? 100 : this.className === 'studio-content' ? this.clientHeight : 912; return { top, bottom: top + height, left: 0, right: 420, width: 420, height }; }
    querySelectorAll(selector) { const found = []; const visit = node => { for (const child of node.children) { if (selector.includes('[data-studio-row]') && child.dataset.studioRow || selector.includes('button') && child.tagName === 'BUTTON' || selector === 'li' && child.tagName === 'LI') found.push(child); visit(child); } }; visit(this); return found; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    addEventListener(type, callback) { add(this.events, type, callback); }
    removeEventListener(type, callback) { this.events.get(type)?.delete(callback); }
    focus(options) { document.activeElement = this; focuses.push({ node: this, options }); const ancestors = []; for (let node = this; node; node = node.parentElement) ancestors.push(node); ancestors.reverse().forEach(node => node.props.onFocusCapture?.({ target: this, currentTarget: node })); }
    scrollTo(options) { this.scrollTop = typeof options === 'number' ? options : options.top ?? this.scrollTop; }
    animate(keyframes, options) { let resolve, reject; const animation = { node: this, keyframes, options, finished: new Promise((yes, no) => { resolve = yes; reject = no; }), cancel() { this.cancelled = true; reject(Error('Cancelled')); }, finish() { resolve(); } }; animations.push(animation); return animation; }
  }
  const body = new Element('body', 'body'), html = new Element('html', 'html'), main = new Element('main', 'main'); main.parentElement = body;
  document = { body, documentElement: html, activeElement: body, querySelector: selector => selector.includes('.reduce-motion') ? appReduced ? html : null : null, addEventListener: (type, callback) => add(events, type, callback), removeEventListener: (type, callback) => events.get(type)?.delete(callback) };
  const media = { get matches() { return reduced; }, addEventListener: (type, callback) => add(mediaEvents, type, callback), removeEventListener: (type, callback) => mediaEvents.get(type)?.delete(callback) };
  const window = { location: { origin: 'https://portalink.test' }, innerHeight: 912, innerWidth: 420, getComputedStyle: node => ({ overflowY: node === main ? 'auto' : 'visible' }), matchMedia: () => media, addEventListener: (type, callback) => add(events, type, callback), removeEventListener: (type, callback) => events.get(type)?.delete(callback), requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); } };
  const globals = { document, window, navigator: {}, HTMLElement: Element, Element, requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame, getComputedStyle: () => ({ getPropertyValue: name => ({ '--m-fast': '120ms', '--m-enter': 'ease-out' }[name] ?? '') }), MutationObserver: class { constructor(callback) { this.callback = callback; this.active = true; observers.push(this); } observe() {} disconnect() { this.active = false; } } };
  const effect = (queue, callback, deps) => { const index = cursor++, prior = slots[index]; if (!same(prior?.deps, deps)) { const slot = slots[index] = { deps }; queue.push(() => { prior?.cleanup?.(); if (mounted) slot.cleanup = callback(); }); } };
  const react = { ...React,
    useState(initialValue) { const index = cursor++; slots[index] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue }; return [slots[index].value, next => { if (!mounted) { lateStateWrites++; return; } const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useRef(initialValue) { return slots[cursor++] ??= { current: initialValue }; },
    useMemo(factory, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) { effect(effects, callback, deps); }, useLayoutEffect(callback, deps) { effect(layout, callback, deps); } };
  const model = sourceModule('src/features/studio/studioModel.ts', { '../../app/routes': { buildPath: kind => `/${kind}` }, '../library/savedPages': { savedPageKey: target => target.attachmentId } });
  const view = sourceModule('src/features/studio/studioView.ts', { '../../app/routes': { buildPath: kind => `/${kind}` } });
  const motion = sourceModule('src/presentation/motion/motion.ts', { 'react-dom': { flushSync: callback => callback() }, '../../utils/projectContinuity': {} }, globals);
  let refreshImpl = () => Promise.resolve(true);
  const data = { rows: activityRows(), sections: [], status: 'ready', error: null, updatedAt: 100, hasMore: false, loadingMore: false, loadMoreError: null, pendingIds: new Set(), mutationError: null, activityRefreshing: false,
    refresh(...args) { calls.push(['refresh', ...args]); data.activityRefreshing = true; dirty = true; return Promise.resolve(refreshImpl(...args)).finally(() => { data.activityRefreshing = false; dirty = true; }); }, async markRead(row) { calls.push(['markRead', row.id]); return true; }, async unsave() { return true; } };
  const imports = {
    react, 'react-dom': { createPortal: (children, host) => React.createElement('header-portal', { host }, children) },
    'react-router-dom': { useNavigate: () => path => calls.push(['navigate', path]), useSearchParams: () => [params, next => { params = new URLSearchParams(next); dirty = true; }] },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
    '../citations/publicOrigin': { PUBLIC_ORIGIN: 'https://portalinknetworks.com' }, '../../presentation/usePresentation': { usePresentation: () => mode },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back', useMobileScreenActive: () => active }, '../../presentation/motion/motion': motion,
    '../../presentation/mobile/MobileContextActions': { useMobileScreenActions(_model, _priority, open) { contextOpen = open; } }, '../../presentation/mobile/contextActions': { contextActions: () => ({}) },
    '../../contexts/AuthContext': { useAuth: () => auth }, './StudioEmptyState': { StudioEmptyState: 'studio-empty' },
    '../references/useReferences': { useReferences: () => ({ externalReferences: async () => [] }) }, '../references/ExportSheet': { ExportSheet: 'export-sheet' },
    '../sharing/InternalContentShare': { useInternalContentShare: () => () => {} }, '../citations/service': { listCitations: async () => [], resolveCitationItem: async () => null, resolvePageId: async () => null, resolveImageId: async () => null, citationProject: async () => null }, '../citations/CiteSheet': { CiteSheet: 'cite-sheet' },
    '../../components/media/ProjectCover': { ProjectCover: 'cover' }, '../../components/profile/CreatorAvatar': { CreatorAvatar: 'avatar' }, '../../utils/copyPublicLink': { copyPublicLink: async () => {} }, '../../components/ui/InterfaceIcon': { InterfaceIcon: 'icon' },
    '../../components/ui/StateViews': { LoadingState: 'loading', EmptyState: 'empty', ErrorState: 'error' },
    '../projects/ProjectEditorDialog': { ProjectEditorDialog: 'editor' }, '../projects/useProjectManagement': { useProjectManagement: () => ({ editor: { result: null } }) },
    './StudioRow': { StudioRow: 'studio-row' }, './StudioActionSheet': { StudioActionSheet: 'sheet' }, './studioModel': model, './studioView': view,
    './useStudioData': { useStudioData(category, tab, options) { calls.push(['dataOptions', category, tab, options]); return { ...data, sections: [{ id: category, rows: data.rows }] }; } },
  };
  imports['./activityScrollAnchor'] = sourceModule('src/features/studio/activityScrollAnchor.ts', { react }, globals);
  const { StudioPage } = sourceModule('src/features/studio/StudioBookmarksList.tsx', imports, globals);
  function commit(node, path = '0', parent = null, seen = new Set()) {
    if (!React.isValidElement(node)) return [];
    if (typeof node.type !== 'string') return React.Children.toArray(node.props.children).flatMap((child, index) => commit(child, `${path}.${child.key ?? index}`, parent, seen));
    const tag = node.type === 'studio-row' ? 'li' : node.type;
    let host = hosts.get(path); if (!host || host.tagName !== tag.toUpperCase()) { host = new Element(tag, path); hosts.set(path, host); }
    seen.add(host); host.isConnected = true; host.props = node.props; host.parentElement = parent; host.dataset = Object.fromEntries(Object.entries(node.props).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value])); if (node.type === 'studio-row') host.dataset.studioRow = node.props.id;
    host.children = React.Children.toArray(node.props.children).flatMap((child, index) => commit(child, `${path}.${child.key ?? index}`, host, seen));
    host.nextRef = node.ref;
    return [host];
  }
  function render() { if (!mounted) return tree; for (let pass = 0; dirty; pass++) { assert.ok(pass < 30, 'Studio component settles'); dirty = false; cursor = 0; effects = []; layout = []; tree = StudioPage({ onBack: () => calls.push(['back']), onOpenProject: id => calls.push(['project', id]), onActivityRefreshControl: registerActivityControl }); const seen = new Set(); main.children = commit(tree, '0', main, seen);
      // React detaches removed/changed refs before DOM removal, and does not
      // reattach a stable callback merely because its label or props changed.
      for (const host of hosts.values()) if (host.attachedRef && (!seen.has(host) || host.attachedRef !== host.nextRef)) { if (typeof host.attachedRef === 'function') host.attachedRef(null); else host.attachedRef.current = null; host.attachedRef = null; }
      for (const host of hosts.values()) if (!seen.has(host)) host.isConnected = false;
      for (const host of seen) if (host.nextRef && host.attachedRef !== host.nextRef) { host.attachedRef = host.nextRef; if (typeof host.nextRef === 'function') host.nextRef(host); else host.nextRef.current = host; }
      layout.splice(0).forEach(run => run()); effects.splice(0).forEach(run => run()); } return tree; }
  const find = predicate => nodes(render()).find(predicate), hostFor = node => [...hosts.values()].find(host => host.isConnected && host.props === node?.props);
  render();
  return { data, calls, animations, frames, focuses, scrollWrites, document, render, find, hostFor,
    get lateStateWrites() { return lateStateWrites; }, get rows() { return nodes(render()).filter(node => node.type === 'studio-row'); }, get sheet() { return find(node => node.type === 'sheet'); }, get field() { return hostFor(find(node => node.type === 'input')); }, get scroller() { return main; },
    get control() { render(); return activityControl; }, open() { contextOpen(); render(); }, action(id = 'refresh') { return this.sheet?.props.actions.find(action => action.id === id); }, refresh() { assert.ok(activityControl, 'Expected visible Activity refresh registration'); const result = activityControl.refresh(); render(); return result; },
    refreshWith(callback) { refreshImpl = callback; }, update(value) { Object.assign(data, value); dirty = true; render(); },
    focusErrorRetry() { const parent = hostFor(find(node => node.type === 'error')); assert.ok(parent); const button = new Element('button', 'cold-error-retry'); button.parentElement = parent; parent.children.push(button); button.focus(); return button; },
    query(value) { find(node => node.type === 'input').props.onChange({ target: { value } }); render(); }, owner(id) { auth = { ...auth, user: { id }, viewerProfileId: `profile-${id}` }; dirty = true; render(); }, mode(value) { mode = value; dirty = true; render(); }, active(value) { active = value; main.inert = !value; dirty = true; render(); }, collection(value) { params = new URLSearchParams(`collection=${value}`); dirty = true; render(); },
    scroll(top) { this.scroller._top = top; emit(this.scroller.events, 'scroll'); }, input(type, target = this.scroller) { emit(events, type, { target }); emit(target.events, type, { target }); },
    paint() { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } render(); }, reduce(value) { reduced = value; emit(mediaEvents, 'change'); },
    async flush() { for (let pass = 0; pass < 20; pass++) { await Promise.resolve(); render(); } }, unmount() { mounted = false;
      // On an entire subtree removal, the ancestor section ref is cleared
      // before a descendant Retry callback; passive cleanup follows mutation.
      for (const host of hosts.values()) if (host.attachedRef && typeof host.attachedRef !== 'function') host.attachedRef.current = null;
      for (const host of hosts.values()) if (typeof host.attachedRef === 'function') host.attachedRef(null);
      slots.forEach(slot => slot?.cleanup?.()); for (const host of hosts.values()) { host.attachedRef = null; host.isConnected = false; }
    },
  };
}

test('cached MOBILE Activity is visible immediately without replaying content animation', () => {
  for (const reduced of [false, true]) {
    const h = fixture({ reduced });
    assert.equal(h.rows.length, 24);
    assert.equal(h.find(node => node.type === 'loading'), undefined);
    assert.equal(h.animations.length, 0);
    h.scroll(735); const field = h.field; field.focus();
    h.update({ rows: [...h.data.rows] }); h.paint();
    assert.equal(h.scroller.scrollTop, 735); assert.equal(h.document.activeElement, field);
    assert.equal(h.animations.length, 0); h.unmount();
  }
});

test('WEB Activity retains its loading row guards, heading/status and existing full error placement', () => {
  const h = fixture({ mode: 'web' });
  h.update({ status: 'loading' });
  assert.equal(h.find(node => node.type === 'h1').props.children, 'Activity');
  assert.equal(h.find(node => node.props.className === 'studio-status').props.children, 'Updating…');
  assert.ok(h.rows.every(row => row.props.pending));
  h.update({ status: 'error', error: 'Activity could not load' });
  const all = nodes(h.render()), error = all.find(node => node.type === 'error');
  assert.equal(error.props.description, 'Activity could not load');
  assert.ok(all.indexOf(error) < all.findIndex(node => node.type === 'ul'));
  h.open(); const action = h.action(); assert.equal(action.label, 'Refresh');
  action.onAction(); assert.equal(h.sheet, undefined, 'WEB Refresh retains its existing close-before-request behavior');
  h.unmount();
});

test('MOBILE Activity Refresh immediately acknowledges one request while keeping rows and keyboard focus', async () => {
  const pending = deferred(), h = fixture(); h.refreshWith(() => pending.promise);
  h.scroll(815); const field = h.field; field.focus(); const focuses = h.focuses.length;
  h.refresh();
  assert.equal(h.control.pending, true);
  assert.equal(h.calls.filter(call => call[0] === 'refresh').length, 1);
  assert.equal(h.rows.length, 24); assert.ok(h.rows.every(row => !row.props.pending));
  assert.equal(h.scroller.scrollTop, 815); assert.equal(h.document.activeElement, field); assert.equal(h.focuses.length, focuses);
  pending.resolve(true); await h.flush();
  assert.equal(h.control.pending, false); assert.equal(h.rows.length, 24); assert.equal(h.scroller.scrollTop, 815);
  assert.equal(h.animations.length, 0); h.unmount();
});

test('MOBILE Activity failure keeps its rows and a Retry action with error below retained updates', async () => {
  const first = deferred(), retry = deferred(), h = fixture(); let calls = 0; h.refreshWith(() => ++calls === 1 ? first.promise : retry.promise);
  h.scroll(925); h.refresh();
  h.update({ status: 'error', error: 'A connection problem prevented updates.' }); first.resolve(false); await h.flush();
  assert.equal(h.rows.length, 24); assert.equal(h.scroller.scrollTop, 925);
  assert.equal(h.control.error, true); assert.equal(h.control.pending, false);
  assert.equal(h.find(node => node.type === 'error'), undefined, 'The large full-list error must not appear above cached Activity');
  const all = nodes(h.render()), alert = all.find(node => node.props.role === 'alert');
  assert.ok(alert, 'Connection failure stays visible'); assert.ok(all.indexOf(alert) > all.findIndex(node => node.type === 'ul'));
  h.refresh(); assert.equal(h.control.pending, true);
  assert.ok(h.find(node => node.props.role === 'alert'), 'Retry must not hide a still-unconfirmed failure');
  h.update({ status: 'ready', error: null }); retry.resolve(true); await h.flush();
  assert.equal(h.control.pending, false); assert.equal(h.find(node => node.props.role === 'alert'), undefined);
  assert.equal(h.rows.length, 24); assert.equal(h.scroller.scrollTop, 925); h.unmount();
});

test('MOBILE Activity selection remains intact and usable during refresh', async () => {
  const pending = deferred(), h = fixture(); h.refreshWith(() => pending.promise);
  h.find(node => node.type === 'button' && node.props['aria-label'] === 'Select items').props.onClick(); h.render();
  h.rows[6].props.onSelect(); h.render(); assert.equal(h.rows[6].props.selected, true);
  h.refresh();
  assert.equal(h.rows[6].props.selected, true); assert.ok(h.rows.every(row => !row.props.pending));
  assert.equal(h.find(node => node.type === 'button' && node.props['aria-label'] === 'Exit selection').props.disabled, false);
  pending.resolve(true); await h.flush(); assert.equal(h.rows[6].props.selected, true); h.unmount();
});

test('MOBILE Activity footer Retry preserves its error while pending and restores removed keyboard focus safely', async () => {
  const pending = deferred(), h = fixture(); h.refreshWith(() => pending.promise); h.update({ status: 'error', error: 'A connection problem prevented updates.' }); h.scroll(725);
  const retry = h.find(node => node.type === 'button' && textOf(node) === 'Retry'), host = h.hostFor(retry); host.focus();
  retry.props.onClick({ currentTarget: host }); h.render();
  const working = h.find(node => node.type === 'button' && textOf(node) === 'Refreshing…'); assert.equal(working.props['aria-busy'], true); assert.equal(working.props['aria-disabled'], true);
  assert.ok(h.find(node => node.props.role === 'alert')); assert.equal(h.rows.length, 24); assert.equal(h.scroller.scrollTop, 725);
  h.update({ status: 'ready', error: null }); pending.resolve(true); await h.flush();
  assert.equal(h.document.activeElement.props['data-mobile-studio'], ''); assert.equal(h.focuses.at(-1).options.preventScroll, true);
  assert.equal(h.scroller.scrollTop, 725); h.unmount();
});

test('MOBILE Activity footer completion cannot steal focus after new input, owner, query, mode or screen changes', async () => {
  for (const change of ['input', 'owner', 'query', 'mode', 'inactive', 'unmount']) {
    const pending = deferred(), h = fixture(); h.refreshWith(() => pending.promise); h.update({ status: 'error', error: 'Offline' });
    const retry = h.find(node => node.type === 'button' && textOf(node) === 'Retry'), host = h.hostFor(retry); host.focus(); retry.props.onClick({ currentTarget: host }); h.render();
    if (change === 'input') h.field.focus(); else if (change === 'owner') h.owner('account-b'); else if (change === 'query') h.query('Update 1'); else if (change === 'mode') h.mode('web'); else if (change === 'inactive') h.active(false); else h.unmount();
    const count = h.focuses.length; h.update({ status: 'ready', error: null }); pending.resolve(true); await h.flush();
    assert.equal(h.focuses.length, count, change); assert.equal(h.lateStateWrites, 0, change); h.unmount();
  }
});

test('uncached MOBILE Activity retains its existing initial loader and full failure state', () => {
  const h = fixture(); h.update({ rows: [], status: 'loading', error: null });
  assert.ok(h.find(node => node.type === 'loading')); assert.equal(h.rows.length, 0);
  h.update({ status: 'error', error: 'No updates could be loaded.' });
  const error = h.find(node => node.type === 'error'); assert.equal(error.props.description, 'No updates could be loaded.');
  assert.equal(h.find(node => node.props.role === 'alert'), undefined); h.unmount();
});

test('initial Activity Retry restores removed keyboard focus only after confirmed completion in the same active scope', async () => {
  for (const change of ['none', 'input', 'owner', 'query', 'inactive', 'unmount']) {
    const pending = deferred(), h = fixture(); h.refreshWith(() => pending.promise); h.update({ rows: [], status: 'error', error: 'The connection is unavailable.' });
    h.focusErrorRetry(); h.find(node => node.type === 'error').props.onRetry(); h.render();
    h.update({ status: 'loading' }); h.document.activeElement = h.document.body;
    if (change === 'input') h.field.focus(); else if (change === 'owner') h.owner('account-b'); else if (change === 'query') h.query('Update 1'); else if (change === 'inactive') h.active(false); else if (change === 'unmount') h.unmount();
    const count = h.focuses.length; h.update({ rows: activityRows(), status: 'ready', error: null }); pending.resolve(true); await h.flush();
    if (change === 'none') { assert.equal(h.document.activeElement.props['data-mobile-studio'], ''); assert.equal(h.focuses.at(-1).options.preventScroll, true); }
    else assert.equal(h.focuses.length, count, change);
    assert.equal(h.lateStateWrites, 0, change); h.unmount();
  }
});

test('background Activity recovery transfers focused Retry before removal without requiring a new Retry tap', () => {
  for (const cached of [true, false]) {
    const h = fixture(); h.update({ rows: cached ? activityRows() : [], status: 'error', error: 'Offline', activityRefreshing: false }); h.scroll(725);
    const button = cached ? h.hostFor(h.find(node => node.type === 'button' && textOf(node) === 'Retry')) : h.focusErrorRetry(); button.focus(); const count = h.focuses.length;
    h.update({ activityRefreshing: true }); assert.equal(h.document.activeElement, button); assert.equal(h.focuses.length, count, 'A stable ref must not detach merely because status rerenders');
    if (cached) assert.equal(h.hostFor(h.find(node => node.type === 'button' && textOf(node) === 'Refreshing…')), button);
    h.update({ rows: activityRows(), status: 'ready', error: null, activityRefreshing: false });
    assert.equal(h.document.activeElement.props['data-mobile-studio'], '', `cached=${cached}`); assert.equal(h.focuses.length, count + 1);
    assert.equal(h.focuses.at(-1).options.preventScroll, true); assert.equal(h.scroller.scrollTop, 725); h.unmount();
  }
});

test('background Activity recovery leaves newer focus, scope, inactive screens and unmount alone', () => {
  for (const change of ['input', 'owner', 'query', 'mode', 'inactive', 'unmount']) {
    const h = fixture(); h.update({ status: 'error', error: 'Offline', activityRefreshing: true });
    h.hostFor(h.find(node => node.type === 'button' && textOf(node) === 'Refreshing…')).focus();
    if (change === 'input') h.field.focus(); else if (change === 'owner') h.owner('account-b'); else if (change === 'query') h.query('Update 1'); else if (change === 'mode') h.mode('web'); else if (change === 'inactive') h.active(false); else h.unmount();
    const count = h.focuses.length; h.update({ status: 'ready', error: null, activityRefreshing: false });
    assert.equal(h.focuses.length, count, change); assert.equal(h.lateStateWrites, 0, change); h.unmount();
  }
});

test('explicitly refocusing Retry after a query change establishes its new background-recovery focus owner', () => {
  const h = fixture(); h.update({ status: 'error', error: 'Offline', activityRefreshing: true });
  const retry = h.hostFor(h.find(node => node.type === 'button' && textOf(node) === 'Refreshing…')); retry.focus();
  h.query('Update 1'); assert.equal(h.hostFor(h.find(node => node.type === 'button' && textOf(node) === 'Refreshing…')), retry, 'The same Retry DOM node remains in the filtered view');
  h.field.focus(); retry.focus(); const count = h.focuses.length; h.scroll(345);
  h.update({ status: 'ready', error: null, activityRefreshing: false });
  assert.equal(h.document.activeElement.props['data-mobile-studio'], ''); assert.equal(h.focuses.length, count + 1); assert.equal(h.focuses.at(-1).options.preventScroll, true);
  assert.equal(h.scroller.scrollTop, 345); assert.equal(h.field.props.value, 'Update 1'); h.unmount();
});

/** Actual outer StudioPage; child registration is its public component API. */
function shellFixture(initial = {}) {
  const slots = [], history = []; let cursor = 0, dirty = true, tree, effects = [], mode = initial.mode ?? 'mobile', params = new URLSearchParams(initial.search ?? 'collection=activity');
  const react = { ...React,
    useState(value) { const index = cursor++; slots[index] ??= { value: typeof value === 'function' ? value() : value }; return [slots[index].value, next => { const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useRef: value => slots[cursor++] ??= { current: value }, useCallback(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback }; return slots[index].callback; },
    useEffect(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const previous = slots[index], slot = slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slot.cleanup = callback(); }); } },
  };
  const location = { state: { from: 'fixture' } }, { StudioPage } = sourceModule('src/features/studio/StudioPage.tsx', {
    react, '../../presentation/usePresentation': { usePresentation: () => mode },
    'lucide-react': new Proxy({}, { get: (_, key) => key }), '../../components/ui/InterfaceIcon': { InterfaceIcon: 'interface-icon' },
    'react-router-dom': { useLocation: () => location, useNavigate: () => (path, options) => history.push(['navigate', path, options]), useSearchParams: () => [params, (next, options) => { params = new URLSearchParams(next); history.push(['params', String(params), options]); dirty = true; }] },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'account-a' }, viewerProfileId: 'profile-a', isAuthenticated: true }) }, '../../contexts/ServicesContext': { useServices: () => ({}) },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back' }, '../../presentation/mobile/MobileContextActions': { useMobileScreenActions() {} }, '../../presentation/mobile/contextActions': { contextActions: () => ({}) },
    '../../components/ui/StateViews': { LoadingState: 'loading', ErrorState: 'error' },
    './StudioOverview': { StudioOverview: 'overview' }, '../library/PersonalPages': { InsightsPage: 'insights' }, '../citations/StudioCitations': { StudioCitations: 'citations' },
    '../publishing/PublishProjectDialog': { PublishProjectDialog: 'publisher' }, './discardStudioDraft': {}, './StudioBookmarksList': { StudioPage: 'collection' }, './StudioDraftsList': { StudioDraftsList: 'drafts' }, './StudioWorkbenchView': { StudioWorkbenchHeader: 'header' },
    './workbenchModel': { newestDraft: () => null }, './useWorkbench': { useWorkbench: () => ({ data: { profile: { projects: [] }, drafts: [] }, loading: false, retry() {} }) }, './studio-workbench.css': {},
  });
  function render() { for (let pass = 0; dirty; pass++) { assert.ok(pass < 20, 'Outer Studio settles'); dirty = false; cursor = 0; effects = []; tree = StudioPage({ onBack() {}, onOpenProject() {}, savedRoute: initial.savedRoute }); effects.splice(0).forEach(run => run()); } return tree; }
  const find = predicate => nodes(render()).find(predicate); render();
  return { history, render, find, pill: id => find(node => node.props['data-studio-pill'] === id),
    register(control) { const child = find(node => node.type === 'collection'); assert.ok(child?.props.onActivityRefreshControl, 'Expected Activity refresh registration'); child.props.onActivityRefreshControl(control); render(); },
    get registrar() { return find(node => node.type === 'collection')?.props.onActivityRefreshControl; },
    mode(value) { mode = value; dirty = true; render(); }, route(value) { params = new URLSearchParams(value); dirty = true; render(); },
  };
}

test('the visible MOBILE Activity pill refreshes on reselect, acknowledges immediately and never replaces its route', () => {
  const h = shellFixture(); let requests = 0;
  const control = { pending: false, error: false, refresh() { requests++; h.register({ ...control, pending: true }); } };
  h.register(control); const registrar = h.registrar; h.pill('activity').props.onClick(); h.render();
  const pending = h.pill('activity'); assert.equal(textOf(pending), 'Refreshing…'); assert.equal(pending.props['aria-label'], 'Refreshing…'); assert.equal(pending.props['aria-busy'], true); assert.equal(pending.props['aria-disabled'], true); assert.equal(pending.props.disabled, undefined);
  const activityKey = pending.key, activityIcon = nodes(pending).find(node => node.type === 'interface-icon')?.props.icon;
  assert.ok(activityIcon, 'Refreshing retains the Activity glyph beside its visible label.');
  pending.props.onClick(); assert.equal(requests, 1); assert.deepEqual(h.history, []); assert.equal(h.registrar, registrar);
  h.register({ ...control, error: true }); assert.equal(textOf(h.pill('activity')), 'Retry'); assert.equal(h.pill('activity').props['aria-label'], 'Retry');
  assert.equal(h.pill('activity').key, activityKey); assert.equal(nodes(h.pill('activity')).find(node => node.type === 'interface-icon')?.props.icon, activityIcon);
  h.pill('activity').props.onClick(); assert.equal(requests, 2); assert.deepEqual(h.history, []);
  h.register(control); assert.equal(textOf(h.pill('activity')), 'Activity'); assert.equal(h.pill('activity').props['aria-label'], 'Activity');
  assert.equal(h.pill('activity').key, activityKey);
});

test('MOBILE collection deep links expose the matching selected, named icon control without changing route state', () => {
  for (const [search, selected] of [['category=references', 'references'], ['collection=cited', 'cited'], ['collection=activity', 'activity'], ['collection=published', 'overview']]) {
    const h = shellFixture({ search });
    const pills = nodes(h.render()).filter(node => node.props['data-studio-pill']);
    assert.equal(pills.length, 6);
    assert.deepEqual(pills.filter(node => node.props['aria-pressed'] === true).map(node => node.props['data-studio-pill']), [selected]);
    for (const pill of pills) {
      assert.ok(pill.props['aria-label'], 'Collapsed icon controls retain full accessible names.');
      assert.equal(pill.type, 'button');
      assert.equal(nodes(pill).filter(node => node.type === 'interface-icon').length, 1);
    }
    assert.deepEqual(h.history, [], 'Rendering a selected icon does not replace the deep link.');
  }
});

test('first Activity selection and every WEB selection keep their original navigation behavior', () => {
  for (const initial of [{ search: 'collection=bookmarks' }, { mode: 'web' }, { search: 'collection=bookmarks', savedRoute: true }]) {
    const h = shellFixture(initial); h.pill('activity').props.onClick(); h.render(); assert.equal(h.history.length, 1);
    if (initial.savedRoute) assert.equal(h.history[0][0], 'navigate'); else { assert.equal(h.history[0][0], 'params'); assert.match(h.history[0][1], /collection=activity/); }
    assert.equal(textOf(h.pill('activity')), 'Activity'); assert.equal(h.pill('activity').props['aria-busy'], undefined);
  }
});

test('unregistered, inactive and mode-replaced Activity cannot dispatch a retained mobile refresh', () => {
  const h = shellFixture(); let requests = 0;
  h.register({ pending: false, error: false, refresh() { requests++; } }); h.register(null); h.pill('activity').props.onClick(); assert.equal(requests, 0); assert.deepEqual(h.history, []);
  h.mode('web'); assert.equal(h.registrar, undefined); h.pill('activity').props.onClick(); assert.equal(requests, 0); assert.equal(h.history.length, 1);
});

test('Activity control registration follows actual active, presentation and collection ownership', () => {
  for (const change of ['inactive', 'web', 'collection', 'unmount']) {
    const h = fixture(); assert.ok(h.control, change); const old = h.control;
    if (change === 'inactive') h.active(false); else if (change === 'web') h.mode('web'); else if (change === 'collection') h.collection('bookmarks'); else h.unmount();
    assert.equal(h.control, null, change);
    old.refresh(); h.render(); assert.equal(h.calls.filter(call => call[0] === 'refresh').length, 0, change);
    h.unmount();
  }
});

/** Actual anchor hook over a nested or document scroller and stable row IDs. */
function anchorFixture({ documentScroll = false } = {}) {
  const slots = [], frames = new Map(), writes = [], events = new Map(); let cursor = 0, layout = [], effects = [], options, frameId = 0, rectReads = 0;
  const listen = (map, type, callback) => { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(callback); };
  class Element {
    constructor(kind) { this.kind = kind; this.parentElement = null; this.children = []; this.dataset = {}; this.style = { overflowAnchor: 'auto' }; this.isConnected = true; this.clientHeight = 600; this.clientWidth = 420; this.events = new Map(); this._top = 0; this.scrollLeft = 0; this.overflowY = 'visible'; }
    get scrollTop() { return this._top; } set scrollTop(value) { this._top = value; writes.push(value); }
    get scrollHeight() { return list.children.length * 100; }
    querySelectorAll(selector) { return selector.includes('data-studio-row') ? this.children : []; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    contains(target) { for (let node = target; node; node = node.parentElement) if (node === this) return true; return false; }
    getBoundingClientRect() { rectReads++; const index = list.children.indexOf(this), top = index >= 0 ? (documentScroll ? 0 : 200) + index * 100 - scroller.scrollTop : documentScroll ? 0 : 200, height = index >= 0 ? 100 : 600; return { top, bottom: top + height, left: 0, right: 420, width: 420, height }; }
    getClientRects() { return this.isConnected ? [this.getBoundingClientRect()] : []; }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (selector.includes('inert') && node.inert || selector.includes('aria-hidden') && node.ariaHidden) return node; return null; }
    matches(selector) { return /input|textarea|select|contenteditable/.test(selector) && ['input', 'textarea', 'select'].includes(this.kind); }
    addEventListener(type, callback) { listen(this.events, type, callback); } removeEventListener(type, callback) { this.events.get(type)?.delete(callback); }
  }
  const html = new Element('html'), body = new Element('body'), outer = new Element('outer'), list = new Element('list'); list.parentElement = outer; outer.parentElement = body; body.parentElement = html;
  const scroller = documentScroll ? html : outer; scroller.overflowY = 'auto';
  const document = { scrollingElement: html, documentElement: html, body, addEventListener: (type, callback) => listen(events, type, callback), removeEventListener: (type, callback) => events.get(type)?.delete(callback) };
  const window = { innerHeight: 912, innerWidth: 420, getComputedStyle: node => ({ overflowY: node.overflowY }), addEventListener: (type, callback) => listen(events, type, callback), removeEventListener: (type, callback) => events.get(type)?.delete(callback) };
  const effect = (queue, callback, deps) => { const index = cursor++, previous = slots[index]; if (!same(previous?.deps, deps)) { const slot = slots[index] = { deps }; queue.push(() => { previous?.cleanup?.(); slot.cleanup = callback(); }); } };
  const react = { useRef: initial => slots[cursor++] ??= { current: initial }, useMemo(factory, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { value: factory(), deps }; return slots[index].value; }, useCallback(callback, deps) { return this.useMemo(() => callback, deps); }, useEffect: (callback, deps) => effect(effects, callback, deps), useLayoutEffect: (callback, deps) => effect(layout, callback, deps) };
  const { useActivityScrollAnchor } = sourceModule('src/features/studio/activityScrollAnchor.ts', { react }, { document, window, HTMLElement: Element, getComputedStyle: node => ({ overflow: node.overflowY, overflowY: node.overflowY, overflowX: 'visible' }), requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); } });
  options = { enabled: true, active: true, scope: {}, list: { current: list }, rowsKey: '' };
  function render(changes = {}, { afterLayout } = {}) { options = { ...options, ...changes }; cursor = 0; layout = []; effects = []; useActivityScrollAnchor(options); layout.splice(0).forEach(run => run()); afterLayout?.(); effects.splice(0).forEach(run => run()); }
  function rows(ids, changes = {}) { list.children.forEach(row => { row.isConnected = false; row.parentElement = null; }); list.children = ids.map(id => { const row = new Element('row'); row.dataset.studioRow = id; row.parentElement = list; return row; }); render({ rowsKey: ids.join('|'), ...changes }); }
  const emit = () => { for (const callback of [...(scroller.events.get('scroll') ?? []), ...(events.get('scroll') ?? [])]) callback({ type: 'scroll', target: scroller }); };
  const ids = Array.from({ length: 24 }, (_, index) => `update-${index}`); rows(ids);
  return { scroller, list, outer, html, ids, writes, render, rows, frames, document, window,
    get rectReads() { return rectReads; },
    scroll(top) { scroller._top = top; emit(); },
    offset(id) { return list.children.find(row => row.dataset.studioRow === id).getBoundingClientRect().top - scroller.getBoundingClientRect().top; },
    paint() { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } },
    input(type, target = list, key) { for (const callback of [...(events.get(type) ?? [])]) callback({ type, target, key }); },
    resize(height, announce = true) { scroller.clientHeight = height; if (announce) for (const callback of [...(events.get('resize') ?? [])]) callback({ type: 'resize' }); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('MOBILE Activity prepends preserve the visible update in the actual nested scroll owner', () => {
  const h = anchorFixture(); h.scroll(815); const offset = h.offset('update-8');
  h.rows(['new-a', 'new-b', ...h.ids]); h.paint();
  assert.equal(h.scroller.scrollTop, 1015); assert.equal(h.offset('update-8'), offset); h.unmount();
});

test('MOBILE Activity anchor follows user scrolling while refresh is pending and does not replay on cached arrays', () => {
  const h = anchorFixture(); h.scroll(815); h.scroll(1035); const offset = h.offset('update-10');
  h.rows(['new-a', ...h.ids]); h.paint();
  assert.equal(h.scroller.scrollTop, 1135); assert.equal(h.offset('update-10'), offset);
  const writes = h.writes.length; h.rows(['new-a', ...h.ids]); h.paint(); assert.equal(h.writes.length, writes); h.unmount();
});

test('MOBILE Activity supports document scrolling without choosing its non-scrolling inner list', () => {
  const h = anchorFixture({ documentScroll: true }); h.scroll(725); const offset = h.offset('update-7'); h.rows(['new', ...h.ids]); h.paint();
  assert.equal(h.html.scrollTop, 825); assert.equal(h.outer.scrollTop, 0); assert.equal(h.offset('update-7'), offset); h.unmount();
});

test('inactive, changed-scope and WEB Activity cannot apply an old scroll correction', () => {
  for (const change of [{ active: false }, { scope: {} }, { enabled: false }]) {
    const h = anchorFixture(); h.scroll(815); const writes = h.writes.length; h.rows(['new', ...h.ids], change); h.paint();
    assert.equal(h.writes.length, writes); assert.equal(h.scroller.scrollTop, 815); h.unmount();
  }
});

test('removed or disconnected Activity anchor skips correction and cleans up its scroll listener', () => {
  const h = anchorFixture(); h.scroll(815); const writes = h.writes.length;
  h.rows(h.ids.filter(id => id !== 'update-8')); h.paint(); assert.equal(h.writes.length, writes);
  assert.equal(h.scroller.style.overflowAnchor, 'none');
  h.unmount(); assert.equal(h.scroller.events.get('scroll')?.size ?? 0, 0); assert.equal(h.scroller.style.overflowAnchor, 'auto');
});

test('keyboard geometry alone never reapplies an old Activity anchor; a deliberate new scroll establishes the new position', () => {
  for (const announce of [false, true]) {
    const h = anchorFixture(); h.scroll(815); h.resize(400, announce);
    const writes = h.writes.length; h.rows(['new', ...h.ids]); assert.equal(h.writes.length, writes); assert.equal(h.scroller.scrollTop, 815);
    h.input('wheel'); h.scroll(935); const offset = h.offset('update-8'); h.rows(['next', 'new', ...h.ids]);
    assert.equal(h.scroller.scrollTop, 1035); assert.equal(h.offset('update-8'), offset); h.unmount();
  }
});

test('ordinary viewport events with unchanged geometry preserve the current Activity anchor', () => {
  const h = anchorFixture(); h.scroll(815); const offset = h.offset('update-8'); h.input('resize'); h.rows(['new', ...h.ids]);
  assert.equal(h.scroller.scrollTop, 915); assert.equal(h.offset('update-8'), offset); h.unmount();
});

test('hidden or zero-sized retained Activity cannot overwrite or apply a reading correction', () => {
  for (const hide of ['document', 'disconnected', 'zero-size']) {
    const h = anchorFixture(); h.scroll(815);
    if (hide === 'document') h.document.visibilityState = 'hidden'; else if (hide === 'disconnected') h.list.isConnected = false; else h.scroller.clientHeight = 0;
    const writes = h.writes.length; h.rows(['new', ...h.ids]); assert.equal(h.writes.length, writes, hide); h.unmount();
  }
});

test('retained inactive Activity restores its visible update after a background prepend without measuring hidden rows', () => {
  const h = anchorFixture(); h.scroll(815); const offset = h.offset('update-8');
  h.render({ active: false }); const reads = h.rectReads, writes = h.writes.length;
  h.rows(['new-a', 'new-b', 'new-c', ...h.ids]);
  assert.equal(h.rectReads, reads, 'Background updates must not measure the hidden retained screen');
  assert.equal(h.writes.length, writes); assert.equal(h.scroller.scrollTop, 815);
  h.render({ active: true }); h.paint();
  assert.equal(h.scroller.scrollTop, 1115); assert.equal(h.offset('update-8'), offset); h.unmount();
});

test('retained Activity skips an obsolete return correction after scroll, geometry, identity or owner changes', () => {
  for (const change of ['scroll', 'geometry', 'scope', 'owner', 'missing-row']) {
    const h = anchorFixture(); h.scroll(815); h.render({ active: false });
    let rows = ['new-a', 'new-b', 'new-c', ...h.ids];
    if (change === 'scroll') h.scroll(415);
    else if (change === 'geometry') h.resize(400);
    else if (change === 'scope') h.render({ scope: {} });
    else if (change === 'owner') { h.outer.overflowY = 'visible'; h.html.overflowY = 'auto'; h.html._top = 815; }
    else rows = rows.filter(id => id !== 'update-8');
    h.rows(rows); const writes = h.writes.length, before = h.scroller.scrollTop;
    h.render({ active: true }); h.paint();
    assert.equal(h.writes.length, writes, change); assert.equal(h.scroller.scrollTop, before, change); h.unmount();
  }
});

test('Activity return waits for the parent retained-screen layout to remove inert or aria-hidden', () => {
  for (const marker of ['inert', 'ariaHidden']) {
    const h = anchorFixture(); h.scroll(815); const offset = h.offset('update-8'); h.render({ active: false }); h.outer[marker] = true;
    h.rows(['new-a', 'new-b', 'new-c', ...h.ids]); const reads = h.rectReads;
    h.render({ active: true }, { afterLayout() { assert.equal(h.rectReads, reads, `${marker}: child layout cannot measure a still-hidden screen`); h.outer[marker] = false; } });
    h.paint(); assert.equal(h.scroller.scrollTop, 1115, marker); assert.equal(h.offset('update-8'), offset, marker); h.unmount();
  }
});

test('a still-hidden Activity return preserves its unconsumed row key for a later visible update', () => {
  const h = anchorFixture(); h.scroll(815); const offset = h.offset('update-8'); h.render({ active: false }); h.outer.inert = true;
  h.rows(['new-a', 'new-b', 'new-c', ...h.ids]); const reads = h.rectReads, writes = h.writes.length;
  h.render({ active: true }); assert.ok(h.frames.size <= 1, 'A hidden return may schedule only one bounded paint attempt'); h.paint(); assert.equal(h.frames.size, 0); assert.equal(h.rectReads, reads); assert.equal(h.writes.length, writes);
  h.outer.inert = false; h.rows(['next', 'new-a', 'new-b', 'new-c', ...h.ids]); h.paint();
  assert.equal(h.scroller.scrollTop, 1215); assert.equal(h.offset('update-8'), offset); h.unmount();
});

test('Activity return can restore after the parent becomes visible before its single paint fallback', () => {
  const h = anchorFixture(); h.scroll(815); const offset = h.offset('update-8'); h.render({ active: false }); h.outer.inert = true;
  h.rows(['new-a', 'new-b', 'new-c', ...h.ids]); h.render({ active: true });
  assert.equal(h.scroller.scrollTop, 815); h.outer.inert = false; h.paint();
  assert.equal(h.scroller.scrollTop, 1115); assert.equal(h.offset('update-8'), offset); assert.equal(h.frames.size, 0); h.unmount();
});

test('queued Activity return cannot apply after newer scroll, geometry, scope, dismissal or unmount', () => {
  for (const change of ['scroll', 'geometry', 'scope', 'inactive', 'unmount']) {
    const h = anchorFixture(); h.scroll(815); h.render({ active: false }); h.outer.inert = true;
    h.rows(['new-a', 'new-b', 'new-c', ...h.ids]); h.render({ active: true });
    if (change === 'scroll') h.scroll(415); else if (change === 'geometry') h.resize(400); else if (change === 'scope') h.render({ scope: {} }); else if (change === 'inactive') h.render({ active: false }); else h.unmount();
    const writes = h.writes.length; h.outer.inert = false; h.paint(); assert.equal(h.writes.length, writes, change); h.unmount();
  }
});
