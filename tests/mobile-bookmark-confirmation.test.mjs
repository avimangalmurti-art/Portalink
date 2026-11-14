import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : '';
const record = (saved = false) => ({ engaged: { like: false, save: saved, repost: false }, counts: { like: 0, save: saved ? 1 : 0, repost: 0 }, comments: [] });

/** Actual page actions, account-scoped activity and confirmation/focus/viewport lifecycles. */
function fixture({ presentation = 'mobile', reduce = false } = {}) {
  const rootFrame = { slots: [], mounted: true }, dom = new Map(), reads = [], writes = [], listeners = new Map(), viewportListeners = new Map(), windowListeners = new Map(), gates = [], commits = [], timers = new Map();
  let now = 0, timerId = 0;
  const setTimeout = (callback, duration) => { const id = ++timerId; timers.set(id, { callback, duration, due: now + duration }); return id; };
  const clearTimeout = id => timers.delete(id);
  let frame = rootFrame, cursor = 0, child, childSeen = false, dirty = true, rendering = false, tree, confirmationTree, confirmationProps, activity, writesAfterUnmount = 0, document;
  const same = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const add = (map, name, callback) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(callback); };
  const remove = (map, name, callback) => { map.get(name)?.delete(callback); if (map.get(name)?.size === 0) map.delete(name); };
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.props = {}; this.children = []; this.parentElement = null; this.isConnected = true; this.tabIndex = -1; this.style = { setProperty(name, value) { this[name] = value; } }; }
    matches(selector) { return selector === ':disabled' ? Boolean(this.props.disabled) : false; }
    closest(selector) { for (let node = this; node; node = node.parentElement) { if (selector.includes('[hidden]') && (node.props.hidden || node.props.inert || node.props['aria-hidden'] === true)) return node; if (selector.includes('[role="dialog"]') && ['dialog', 'alertdialog'].includes(node.props.role) && node.props['aria-modal'] === 'true') return node; } return null; }
    contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    getClientRects() { return this.isConnected ? [{}] : []; }
    querySelectorAll(selector) { const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]); return selector === '*' ? all : all.filter(node => ['BUTTON', 'TEXTAREA', 'INPUT'].includes(node.tagName) || node.tabIndex >= 0); }
    focus(options) { this.focusOptions = options; document.activeElement = this; for (const callback of [...(listeners.get('focusin') ?? [])]) callback({ target: this }); }
  }
  const body = new Element('body'), fullscreen = new Element(), reader = { page: 2, zoom: 2.2, pan: { x: 160, y: 80 }, scrollTop: 477 }, initialFocus = new Element('button');
  document = { body, fullscreenElement: null, documentElement: new Element('html'), activeElement: initialFocus,
    addEventListener: (name, callback) => add(listeners, name, callback), removeEventListener: (name, callback) => remove(listeners, name, callback) };
  const viewport = { height: 912, offsetTop: 0, addEventListener: (name, callback) => add(viewportListeners, name, callback), removeEventListener: (name, callback) => remove(viewportListeners, name, callback) };
  const window = { visualViewport: viewport, innerHeight: 912, setTimeout, clearTimeout, location: { href: 'https://portalink.test/p/creator/c/portal/project', pathname: '/p/creator/c/portal/project', search: '' }, sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} }, matchMedia: () => ({ matches: reduce }),
    addEventListener: (name, callback) => add(windowListeners, name, callback), removeEventListener: (name, callback) => remove(windowListeners, name, callback), scrollTo() { assert.fail('Bookmark confirmation must not scroll the reader.'); } };
  const globals = { window, document, HTMLElement: Element, Error, setTimeout, clearTimeout, getComputedStyle: () => ({ visibility: 'visible' }) };
  const effect = (queue, callback, dependencies) => { const current = frame, index = cursor++, prior = current.slots[index]; if (!same(prior?.dependencies, dependencies)) { current.slots[index] = { dependencies }; current[queue].push(() => { prior?.cleanup?.(); if (current.mounted) current.slots[index].cleanup = callback(); }); } };
  const react = { ...React, useId: () => 'bookmark-confirmation', useContext: () => null,
    useRef(initial) { const index = cursor++; return frame.slots[index] ??= { current: initial }; },
    useState(initial) { const current = frame, index = cursor++, slot = current.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slot.value, next => { if (!current.mounted) { writesAfterUnmount++; return; } const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } }]; },
    useMemo(callback, dependencies) { const index = cursor++; if (!same(frame.slots[index]?.dependencies, dependencies)) frame.slots[index] = { dependencies, value: callback() }; return frame.slots[index].value; },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); }, useEffect(callback, dependencies) { effect('effects', callback, dependencies); }, useLayoutEffect(callback, dependencies) { effect('layout', callback, dependencies); } };
  const auth = { isAuthenticated: true, user: { id: 'alice' }, viewerProfileId: 'alice-profile', requestAuthenticatedDestination: (...args) => gates.push(args) };
  const { useMediaInteractions } = sourceModule('src/features/media-interactions/useMediaInteractions.ts', {
    react, '../../contexts/AuthContext': { useAuth: () => auth }, '../engagement/capabilities': { likesCapability: false }, '../sharing/InternalContentShare': { useInternalContentShare: () => () => assert.fail('Saving must not share content.') },
    '../reads/pageHeadings': { readPageHeading: () => undefined }, '../auth/registration': { readSharedReturnPath: () => undefined }, '../citations/publicOrigin': { PUBLIC_ORIGIN: 'https://portalinknetworks.com' },
    './mediaInteractionBatch': { readMediaInteraction(...args) { return new Promise((resolve, reject) => reads.push({ args, resolve, reject })); } },
    './mediaInteractionRequest': { mediaInteractionRequest(...args) { return new Promise((resolve, reject) => writes.push({ args, resolve, reject })); } },
  }, globals);
  const viewportHook = sourceModule('src/hooks/useDialogViewport.ts', { react }, globals), modalHook = sourceModule('src/hooks/useModalFocus.ts', { react }, globals);
  const Portal = () => null, ModalPortal = ({ children }) => React.createElement(Portal, { host: body }, children);
  const { ConfirmationDialog } = sourceModule('src/components/ui/ConfirmationDialog.tsx', {
    'lucide-react': { CheckIcon: 'check-icon' }, './InterfaceIcon': { InterfaceIcon: 'icon' },
    react, 'react-dom': { createPortal: (children, host) => React.createElement(Portal, { host }, children) }, '../../hooks/useDialogViewport': viewportHook, '../../hooks/useModalFocus': modalHook,
    '../../presentation/usePresentation': { usePresentation: () => presentation }, './ModalPortal': { ModalPortal }, '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back' }, './DestructiveWarning': { DestructiveWarning: 'warning' }, './confirmation-dialog.css': {},
  }, globals);
  const engagementRef = { current: null };
  const { MediaInteractionBar } = sourceModule('src/features/media-interactions/MediaInteractionBar.tsx', {
    react, '../../components/ui/ConfirmationDialog': { ConfirmationDialog }, '../references/ownCitation': {}, '../citations/useCiteTarget': { useCiteTarget: () => ({ surface: null, citedIn: null, open() {} }) }, '../citations/CiteSheet': {}, '../citations/CitedIn': {}, '../engagement/capabilities': { likesCapability: false },
    '../sharing/InternalContentShare': { useInternalContentShare: () => () => assert.fail('Saving must not share content.') }, 'lucide-react': new Proxy({}, { get: (_target, key) => key }), '../../components/ui/InterfaceIcon': { InterfaceIcon: 'icon' }, '../../components/publishing/ProjectFormDialog': { ProjectFormDialog: 'project-form' }, '../../components/ui/Button': { Button: 'button' },
    '../../contexts/AuthContext': { useAuth: () => auth }, '../auth/registration': { readSharedReturnPath: () => undefined }, './ProjectSharePathContext': { ProjectSharePathContext: {} }, './MobilePageContext': { MobilePageContext: {} }, '../../presentation/mobile/MobileContextActions': { useMobileScreenActions() {} }, '../../presentation/mobile/contextActions': { contextActions: () => ({ primary: [], groups: [] }) }, '../media/publicMediaUrl': { publicMediaUrl: source => source },
    './useMediaInteractions': { useMediaInteractions(...args) { activity = useMediaInteractions(...args); return activity; } }, './mediaToolbarLayout': { mediaToolbarLayout: () => ({ width: 200, unit: 40 }), mobileFocusedMediaToolbarLayout: () => ({ width: 200, unit: 40 }) },
    '../../presentation/usePresentation': { usePresentation: () => presentation }, './useMediaPageSize': { useMediaPageSize: () => ({ ref: engagementRef, pageWidth: 420, hostWidth: 420, isVisible: true }) }, './MediaCommentsPopover': { MediaCommentsPopover: 'comments' },
  }, globals);
  const props = { target: { projectId: 'project', attachmentId: 'attachment', pageIndex: 0, label: 'Source' }, placement: 'focused' };
  let visited;
  function cleanup(current) { if (!current?.mounted) return; current.mounted = false; current.slots.forEach(slot => slot?.cleanup?.()); }
  function commit(node, parent = null, path = 'root') {
    if (!React.isValidElement(node)) return;
    if (node.type === ConfirmationDialog) {
      confirmationProps = node.props;
      childSeen = true; const key = node.key ?? 'confirmation'; if (child?.key !== key) { cleanup(child); child = { key, slots: [], mounted: true }; }
      frame = child; cursor = 0; child.layout = []; child.effects = []; confirmationTree = ConfirmationDialog(node.props); frame = rootFrame; commit(confirmationTree, parent, path); return;
    }
    if (node.type === ModalPortal) { commit(node.type(node.props), parent, path); return; }
    if (node.type === Portal) { React.Children.toArray(node.props.children).forEach((childNode, index) => commit(childNode, node.props.host, `${path}.portal.${index}`)); return; }
    let container = parent;
    if (typeof node.type === 'string') { container = dom.get(path) ?? new Element(node.type); dom.set(path, container); visited.add(path); container.props = { ...node.props }; container.children = []; container.parentElement = parent; container.isConnected = true; container.tabIndex = node.props.tabIndex ?? (node.type === 'button' ? 0 : -1); Object.assign(container.style, node.props.style); if (parent && !parent.children.includes(container)) parent.children.push(container); if (typeof node.ref === 'function') node.ref(container); else if (node.ref) node.ref.current = container; }
    React.Children.toArray(node.props.children).forEach((childNode, index) => commit(childNode, container, `${path}.${React.isValidElement(childNode) ? childNode.key : index}`));
  }
  function render(changes = {}) {
    Object.assign(props, changes); if (rendering || !rootFrame.mounted) return tree;
    for (let pass = 0; pass === 0 || dirty; pass++) { assert.ok(pass < 20, 'Bookmark state must settle'); rendering = true; dirty = false; childSeen = false; visited = new Set(); frame = rootFrame; cursor = 0; rootFrame.layout = []; rootFrame.effects = []; tree = MediaInteractionBar(props); commits.push({ confirmation: nodes(tree).some(node => node.type === ConfirmationDialog) }); commit(tree); if (!childSeen) { cleanup(child); child = undefined; confirmationTree = undefined; confirmationProps = undefined; } for (const [path, element] of dom) if (!visited.has(path)) element.isConnected = false; child?.layout.splice(0).forEach(callback => callback()); rootFrame.layout.splice(0).forEach(callback => callback()); child?.effects.splice(0).forEach(callback => callback()); rootFrame.effects.splice(0).forEach(callback => callback()); rendering = false; }
    return tree;
  }
  render();
  return { reads, writes, auth, gates, reader, document, viewport, fullscreen, commits, timers, render,
    button(label) { render(); return [...nodes(confirmationTree), ...nodes(tree)].find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node) === label)); },
    domButton(label) { return [...dom.values()].find(element => element.isConnected && element.tagName === 'BUTTON' && (element.props['aria-label'] === label || text(element.props.children) === label)); },
    open() { render(); const button = nodes(tree).find(node => node.type === 'button' && /^Save:/.test(node.props['aria-label'] ?? '')); const element = this.domButton(button.props['aria-label']); element.focus({ preventScroll: true }); button.props.onClick(); render(); return element; },
    emit(name, event) { for (const callback of [...(listeners.get(name) ?? [])]) callback(event); render(); },
    emitViewport(name) { for (const callback of [...(viewportListeners.get(name) ?? [])]) callback(); render(); },
    advance(duration) { const end = now + duration; for (;;) { const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0]; if (!next) break; now = next[1].due; timers.delete(next[0]); next[1].callback(); render(); } now = end; },
    back() { render(); const back = nodes(confirmationTree).find(node => node.type === 'screen-back'); assert.ok(back, 'Confirmation must own Back'); back.props.action(); render(); },
    async flush() { render(); await new Promise(setImmediate); render(); },
    setPresentation(value) { presentation = value; render(); },
    unmount() { cleanup(child); cleanup(rootFrame); for (const element of dom.values()) element.isConnected = false; },
    get confirmation() { render(); return confirmationTree; }, get decision() { render(); return confirmationProps; }, get activity() { render(); return activity; }, get writesAfterUnmount() { return writesAfterUnmount; },
  };
}

async function ready(options) { const h = fixture(options); h.reads[0].resolve(record()); await h.flush(); return h; }

function assertSaved(h) {
  assert.ok(h.confirmation, 'Confirmed success must remain visible briefly.');
  assert.equal(h.decision.title, 'Page saved');
  assert.match(text(h.decision.description), /has been saved privately in your Bookmarks/);
  const status = nodes(h.confirmation).find(node => node.props.role === 'status');
  assert.equal(text(status), 'Saved');
  assert.ok(nodes(status).some(node => node.type === 'icon' && node.props.icon === 'check-icon'), 'Confirmed success has a static tick.');
  assert.equal(h.button('Saved').props.disabled, true);
  assert.equal(h.button('Done').props.disabled, false);
  assert.equal(nodes(h.confirmation).find(node => node.props.role === 'alertdialog').props['aria-busy'], false);
  assert.equal(nodes(h.confirmation).some(node => node.props.role === 'alert'), false);
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].duration, 800);
}

test('MOBILE Save remains Saving until the private write confirms, with a synchronous duplicate/cancel lock', async () => {
  const h = await ready(), opener = h.open(), confirm = h.button('Save'), cancel = h.button('Cancel');
  assert.equal(h.writes.length, 0); confirm.props.onClick(); confirm.props.onClick(); cancel.props.onClick();
  assert.equal(h.writes.length, 1); await h.flush(); assert.ok(h.button('Saving…')); assert.equal(h.button('Saving…').props.disabled, true); assert.equal(h.button('Cancel').props.disabled, true);
  assert.equal(nodes(h.confirmation).find(node => node.props.role === 'alertdialog').props['aria-busy'], true); assert.equal(h.document.activeElement.props.role, 'alertdialog');
  assert.equal(h.timers.size, 0); assert.equal(nodes(h.confirmation).some(node => node.props.role === 'status'), false);
  h.advance(10000); assert.ok(h.button('Saving…'), 'Elapsed time never fabricates confirmed success.'); assert.equal(h.timers.size, 0);
  const [path, init, required, account] = h.writes[0].args, payload = JSON.parse(init.body);
  assert.equal(path, '/api/media-interactions/engagement'); assert.equal(init.method, 'POST'); assert.equal(required, true); assert.equal(account, 'alice');
  assert.deepEqual(payload, { projectId: 'project', attachmentId: 'attachment', pageIndex: 0, label: 'Page 1', kind: 'save', engaged: true, shareWithCreator: false });
  const reader = JSON.stringify(h.reader); h.writes[0].resolve(record(true)); await h.flush();
  assertSaved(h); assert.equal(h.activity.record.engaged.save, true); assert.equal(h.activity.pendingKind, null); assert.equal(JSON.stringify(h.reader), reader);
  h.advance(799); assert.ok(h.confirmation); h.advance(1);
  assert.equal(h.confirmation, undefined); assert.equal(h.document.activeElement, opener); assert.equal(opener.focusOptions.preventScroll, true); assert.equal(JSON.stringify(h.reader), reader); assert.equal(h.timers.size, 0); h.unmount();
});

test('MOBILE failure rolls back the optimistic bookmark and keeps the same confirmation available for Retry', async () => {
  const h = await ready(), opener = h.open(); h.button('Save').props.onClick(); await h.flush(); assert.equal(h.activity.record.engaged.save, true);
  h.writes[0].reject(new Error('Bookmark could not be saved.')); await h.flush();
  assert.equal(h.activity.record.engaged.save, false); assert.equal(h.activity.record.counts.save, 0); assert.equal(text(nodes(h.confirmation).find(node => node.props.role === 'alert')), 'Bookmark could not be saved.');
  assert.equal(h.button('Retry').props.disabled, false); assert.equal(h.button('Cancel').props.disabled, false); h.button('Retry').props.onClick(); h.button('Saving…').props.onClick();
  assert.equal(h.writes.length, 2); assert.equal(JSON.parse(h.writes[1].args[1].body).engaged, true, 'Retry is an explicit save, never an unsave of optimistic state.'); assert.equal(JSON.parse(h.writes[1].args[1].body).shareWithCreator, false);
  assert.equal(h.timers.size, 0, 'Neither pending nor failure may start success dismissal.');
  h.writes[1].resolve(record(true)); await h.flush(); assertSaved(h); assert.equal(h.activity.record.engaged.save, true); h.advance(800); assert.equal(h.confirmation, undefined); assert.equal(h.document.activeElement, opener); h.unmount();
});

test('the actual private-save hook coalesces calls before a render and returns confirmed booleans', async () => {
  const h = await ready(), save = h.activity.saveWithCreator, first = save(), duplicate = save();
  assert.equal(h.writes.length, 1); h.writes[0].resolve(record(true)); assert.equal(await first, true); assert.equal(await duplicate, true); await h.flush(); assert.equal(h.activity.record.engaged.save, true); h.unmount();
  const failed = await ready(), pending = failed.activity.saveWithCreator(); failed.writes[0].reject(new Error('Offline')); assert.equal(await pending, false); await failed.flush(); assert.equal(failed.activity.record.engaged.save, false); failed.unmount();
});

test('late MOBILE saves cannot close or fail a newly opened target/account confirmation', async () => {
  for (const scope of ['project', 'attachment', 'page', 'account']) for (const fails of [false, true]) {
    const h = await ready(); h.open(); h.button('Save').props.onClick(); await h.flush();
    const original = { projectId: 'project', attachmentId: 'attachment', pageIndex: 0, label: 'Source' };
    if (scope === 'account') { h.auth.user = { id: 'bob' }; h.auth.viewerProfileId = 'bob-profile'; h.render(); }
    else h.render({ target: { ...original, ...(scope === 'project' ? { projectId: 'new-project' } : scope === 'attachment' ? { attachmentId: 'new-attachment' } : { pageIndex: 1 }) } });
    assert.equal(h.confirmation, undefined); h.reads.at(-1).resolve(record()); await h.flush(); h.open();
    if (fails) h.writes[0].reject(new Error('Old save failed')); else h.writes[0].resolve(record(true)); await h.flush();
    assert.ok(h.button('Save')); assert.equal(h.button('Save').props.disabled, false); assert.equal(nodes(h.confirmation).some(node => node.props.role === 'alert'), false); assert.equal(h.activity.record.engaged.save, false); h.unmount();
  }
});

test('returning A to B to A cannot duplicate an older unresolved save and can retry after it settles', async () => {
  const h = await ready(), original = { projectId: 'project', attachmentId: 'attachment', pageIndex: 0, label: 'Source' }, old = h.activity.saveWithCreator();
  h.render({ target: { ...original, pageIndex: 1 } }); h.reads.at(-1).resolve(record()); await h.flush(); h.render({ target: original }); h.reads.at(-1).resolve(record()); await h.flush();
  assert.equal(await h.activity.saveWithCreator(), false); assert.equal(h.writes.length, 1); h.writes[0].resolve(record(true)); assert.equal(await old, false); await h.flush(); assert.equal(h.activity.record.engaged.save, false);
  const current = h.activity.saveWithCreator(); assert.equal(h.writes.length, 2); h.writes[1].resolve(record(true)); assert.equal(await current, true); await h.flush(); assert.equal(h.activity.record.engaged.save, true); h.unmount();
});

test('retained A callbacks invoked only after A to B to A cannot dispatch or close the newly opened confirmation', async () => {
  const h = await ready(), original = { projectId: 'project', attachmentId: 'attachment', pageIndex: 0, label: 'Source' }; h.open();
  const oldSave = h.activity.saveWithCreator, oldConfirm = h.decision.onConfirm;
  h.render({ target: { ...original, pageIndex: 1 } }); h.reads.at(-1).resolve(record()); await h.flush(); h.render({ target: original }); h.reads.at(-1).resolve(record()); await h.flush(); h.open();
  assert.equal(await oldSave(), false); assert.equal(await oldConfirm(), false); await h.flush(); assert.equal(h.writes.length, 0); assert.ok(h.button('Save')); assert.equal(h.button('Save').props.disabled, false); h.unmount();
});

test('a cancelled same-scope confirmation cannot dispatch a stale Save after the user reopens it', async () => {
  const h = await ready(); h.open(); const oldConfirm = h.decision.onConfirm; h.button('Cancel').props.onClick(); h.render(); h.open();
  assert.equal(await oldConfirm(), false); await h.flush(); assert.equal(h.writes.length, 0); assert.ok(h.button('Save')); assert.equal(h.button('Save').props.disabled, false); h.unmount();
});

test('scope changes mask the old MOBILE confirmation in the first commit before passive cleanup', async () => {
  for (const scope of ['project', 'attachment', 'page', 'account', 'presentation']) {
    const h = await ready(); h.open(); const before = h.commits.length, target = { projectId: 'project', attachmentId: 'attachment', pageIndex: 0, label: 'Source' };
    if (scope === 'account') { h.auth.user = { id: 'bob' }; h.render(); }
    else if (scope === 'presentation') h.setPresentation('web');
    else h.render({ target: { ...target, ...(scope === 'project' ? { projectId: 'new-project' } : scope === 'attachment' ? { attachmentId: 'new-attachment' } : { pageIndex: 1 }) } });
    assert.ok(h.commits.slice(before).length > 0); assert.equal(h.commits.slice(before).some(commit => commit.confirmation), false, 'No transient decision for the replacement page or account may commit.'); assert.equal(h.writes.length, 0); h.unmount();
  }
});

test('unmount invalidates private-save completion without writes or confirmation callbacks into the disposed owner', async () => {
  for (const fails of [false, true]) {
    const h = await ready(); h.open(); h.button('Save').props.onClick(); const pending = h.activity.saveWithCreator(); h.unmount();
    if (fails) h.writes[0].reject(new Error('Late failure')); else h.writes[0].resolve(record(true)); assert.equal(await pending, false); await h.flush(); assert.equal(h.writesAfterUnmount, 0);
  }
});

test('Escape/cancel stay blocked while Saving and a failed dialog can cancel without another write', async () => {
  const h = await ready(), opener = h.open(); h.button('Save').props.onClick();
  h.emit('keydown', { key: 'Escape', target: h.document.activeElement, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }); assert.ok(h.confirmation); assert.equal(h.writes.length, 1);
  h.writes[0].reject(new Error('Offline')); await h.flush(); h.button('Cancel').props.onClick(); h.render(); assert.equal(h.confirmation, undefined); assert.equal(h.writes.length, 1); assert.equal(h.document.activeElement, opener); h.unmount();
});

test('WEB retains its existing optimistic toggle and immediate confirmation close', async () => {
  const h = await ready({ presentation: 'web' }); h.open(); h.button('Save').props.onClick(); await h.flush(); assert.equal(h.writes.length, 1); assert.equal(h.confirmation, undefined); assert.equal(h.activity.record.engaged.save, true);
  h.writes[0].reject(new Error('Legacy failure')); await h.flush(); assert.equal(h.activity.record.engaged.save, false); assert.equal(h.confirmation, undefined); h.unmount();
});

test('MOBILE reduced motion uses the same confirmation, focus return and truthful save completion', async () => {
  const h = await ready({ reduce: true }), opener = h.open(); h.button('Save').props.onClick(); await h.flush(); assert.ok(h.button('Saving…')); h.writes[0].resolve(record(true)); await h.flush();
  assertSaved(h); assert.equal(nodes(h.confirmation).some(node => /animate-|transition/.test(node.props.className ?? '') && node.type === 'icon' && node.props.icon === 'check-icon'), false, 'The confirmation tick is static with Reduce Motion.');
  h.advance(800); assert.equal(h.confirmation, undefined); assert.equal(h.document.activeElement, opener); assert.equal(opener.focusOptions.preventScroll, true); h.unmount();
});

test('MOBILE success cannot dispatch another save or extend its automatic exit through retained callbacks', async () => {
  const h = await ready(); h.open(); const oldConfirm = h.decision.onConfirm, oldButton = h.button('Save');
  oldButton.props.onClick(); h.writes[0].resolve(record(true)); await h.flush(); assertSaved(h);
  const timer = [...h.timers.values()][0]; h.advance(400);
  await oldConfirm(); oldButton.props.onClick(); h.button('Saved').props.onClick(); await h.flush();
  assertSaved(h);
  assert.equal(h.writes.length, 1, 'Success locks both the current and retained confirmation handlers.');
  assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0], timer, 'Repeated activation must not restart the success interval.');
  h.advance(400); assert.equal(h.confirmation, undefined); h.unmount();
});

test('Done, Escape and Back close confirmed success immediately and return reader focus without waiting', async () => {
  for (const action of ['Done', 'Escape', 'Back']) {
    const h = await ready(), opener = h.open(), before = JSON.stringify(h.reader); h.button('Save').props.onClick();
    if (action === 'Back') { h.back(); assert.ok(h.confirmation, 'Back cannot cancel an actual pending save.'); }
    h.writes[0].resolve(record(true)); await h.flush(); assertSaved(h); const stale = [...h.timers.values()][0].callback;
    if (action === 'Done') h.button('Done').props.onClick();
    else if (action === 'Back') h.back();
    else h.emit('keydown', { key: 'Escape', target: h.document.activeElement, preventDefault() {}, stopPropagation() {} });
    h.render(); assert.equal(h.confirmation, undefined); assert.equal(h.timers.size, 0); assert.equal(h.document.activeElement, opener); assert.equal(opener.focusOptions.preventScroll, true); assert.equal(JSON.stringify(h.reader), before);
    stale(); h.render(); assert.equal(h.confirmation, undefined); assert.equal(h.writes.length, 1); h.unmount();
  }
});

test('a successful old target/account timer cannot close a replacement confirmation even if its queued callback fires', async () => {
  for (const scope of ['project', 'attachment', 'page', 'account', 'presentation']) {
    const h = await ready(); h.open(); h.button('Save').props.onClick(); h.writes[0].resolve(record(true)); await h.flush(); assertSaved(h);
    const stale = [...h.timers.values()][0].callback, original = { projectId: 'project', attachmentId: 'attachment', pageIndex: 0, label: 'Source' };
    if (scope === 'account') { h.auth.user = { id: 'bob' }; h.auth.viewerProfileId = 'bob-profile'; h.render(); }
    else if (scope === 'presentation') { h.setPresentation('web'); h.render({ target: { ...original, pageIndex: 1 } }); h.setPresentation('mobile'); }
    else h.render({ target: { ...original, ...(scope === 'project' ? { projectId: 'new-project' } : scope === 'attachment' ? { attachmentId: 'new-attachment' } : { pageIndex: 1 }) } });
    assert.equal(h.confirmation, undefined); assert.equal(h.timers.size, 0, 'Scope changes clean up the old success timer.');
    h.reads.at(-1).resolve(record()); await h.flush(); h.open(); assert.ok(h.button('Save'));
    const before = JSON.stringify(h.reader); stale(); await h.flush();
    assert.ok(h.button('Save')); assert.equal(h.button('Save').props.disabled, false); assert.equal(h.decision.title, 'Save this page?'); assert.equal(h.timers.size, 0); assert.equal(h.writes.length, 1); assert.equal(JSON.stringify(h.reader), before); h.unmount();
  }
});

test('dismissed success timer and retained Save cannot affect a reopened decision for the same page', async () => {
  const h = await ready(); h.open(); const oldConfirm = h.decision.onConfirm;
  h.button('Save').props.onClick(); h.writes[0].resolve(record(true)); await h.flush(); const stale = [...h.timers.values()][0].callback;
  h.button('Done').props.onClick(); h.render(); assert.equal(h.timers.size, 0);
  h.button('Remove save: Page 1 (1)').props.onClick(); assert.equal(h.writes.length, 2); h.writes[1].resolve(record()); await h.flush(); h.open();
  await oldConfirm(); stale(); await h.flush(); assert.ok(h.button('Save')); assert.equal(h.decision.title, 'Save this page?'); assert.equal(h.writes.length, 2); assert.equal(h.timers.size, 0); h.unmount();
});

test('success timer cleanup makes an already queued callback harmless after owner unmount', async () => {
  const h = await ready(); h.open(); h.button('Save').props.onClick(); h.writes[0].resolve(record(true)); await h.flush(); assertSaved(h);
  const stale = [...h.timers.values()][0].callback; h.unmount(); assert.equal(h.timers.size, 0); stale(); h.advance(800); await h.flush(); assert.equal(h.writesAfterUnmount, 0); assert.equal(h.writes.length, 1);
});

test('keyboard viewport changes and tab focus remain managed during the static success state', async () => {
  const h = await ready(), opener = h.open(), before = JSON.stringify(h.reader);
  h.viewport.height = 470; h.viewport.offsetTop = 18; h.emitViewport('resize');
  const overlay = nodes(h.confirmation).find(node => /portalink-confirmation-overlay/.test(node.props.className ?? '')).ref.current;
  assert.equal(overlay.style['--dialog-viewport-height'], '470px'); assert.equal(overlay.style['--dialog-viewport-top'], '18px');
  h.button('Save').props.onClick(); h.writes[0].resolve(record(true)); await h.flush(); assertSaved(h);
  assert.equal(h.document.activeElement, h.domButton('Done'));
  h.emit('keydown', { key: 'Tab', target: h.document.activeElement, preventDefault() {}, stopPropagation() {} }); assert.equal(h.document.activeElement, h.domButton('Done'), 'The disabled Saved control is excluded from the focus loop.');
  h.viewport.height = 912; h.viewport.offsetTop = 0; h.emitViewport('resize');
  assert.equal(overlay.style['--dialog-viewport-height'], '912px'); assert.equal(overlay.style['--dialog-viewport-top'], '0px');
  h.advance(800); assert.equal(h.document.activeElement, opener); assert.equal(JSON.stringify(h.reader), before); assert.equal(h.viewport.height, 912); h.unmount();
});
