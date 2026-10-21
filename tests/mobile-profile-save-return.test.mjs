import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const plain = value => JSON.parse(JSON.stringify(value));
const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const text = node => Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : typeof node === 'string' ? node : '';
const profile = id => ({ id, name: `${id} original`, headline: 'Independent bio', location: 'Portland', isPrivate: false, links: [], socialLinks: {}, avatar: 'https://images.example.test/original.webp' });

/** Real editor, save hook and async action; only child widgets, services and host DOM are substituted. */
function fixture(options = {}) {
  const reads = [], writes = [], saved = [], closed = [], invalidations = [], cached = [], operations = [], scheduled = [], focusCalls = [], commits = [];
  const timers = new Map(), frames = new Map(), listeners = new Map(), elements = new Map(), records = new Map(['owner', 'other'].map(id => [id, profile(id)]));
  const origin = { scrollTop: 812, scrollLeft: 7 }, appearance = { reduceMotion: options.reduce === true, theme: 'dark', accent: 'violet' };
  const document = { activeElement: null, documentElement: { dataset: { reduceMotion: appearance.reduceMotion ? 'true' : undefined } }, modal: null,
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); }, querySelector: () => document.modal };
  class Element {
    constructor(tagName) { this.tagName = tagName.toUpperCase(); this.props = {}; this.style = {}; this.isConnected = true; this.parentElement = null; this.inert = false; this.hidden = false; }
    contains(target) { for (let current = target; current; current = current.parentElement) if (current === this) return true; return false; }
    closest(selector) { for (let current = this; current; current = current.parentElement) if (selector === 'main' ? current.tagName === 'MAIN' : current.inert || current.props['aria-hidden'] === true) return current; return null; }
    matches(selector) { return selector === ':disabled' && this.props.disabled === true; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    focus(settings) { document.activeElement = this; this.focusSettings = settings; focusCalls.push({ element: this, settings }); }
  }
  const originMain = new Element('main'), opener = new Element('button'); originMain.inert = true; opener.parentElement = originMain; document.body = new Element('body');
  const returnFocusTarget = { opener, main: originMain };
  document.activeElement = opener;
  let presentation = options.presentation ?? 'mobile', profileId = 'owner', active = true, tree, editor, dirty = true, rendering = false, cursor = 0, now = 0, nextTimer = 0, writesAfterUnmount = 0;
  let frame = { mounted: true, slots: [], effects: [], layout: [] };
  const auth = { user: { id: 'account-owner' }, viewerProfileId: 'owner', isAuthenticated: true };
  const enqueue = (queue, callback, dependencies) => {
    const current = frame, index = cursor++, prior = current.slots[index];
    if (!same(prior?.dependencies, dependencies)) {
      const slot = current.slots[index] = { dependencies };
      current[queue].push(() => { prior?.cleanup?.(); if (current.mounted) slot.cleanup = callback(); });
    }
  };
  const react = { ...React,
    useRef(initial) { return frame.slots[cursor++] ??= { current: initial }; },
    useState(initial) {
      const current = frame, index = cursor++, slot = current.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, update => { if (!current.mounted) { writesAfterUnmount++; return; } const value = typeof update === 'function' ? update(slot.value) : update; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } }];
    },
    useMemo(create, dependencies) { const index = cursor++; if (!same(frame.slots[index]?.dependencies, dependencies)) frame.slots[index] = { dependencies, value: create() }; return frame.slots[index].value; },
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); },
    useEffect(callback, dependencies) { enqueue('effects', callback, dependencies); },
    useLayoutEffect(callback, dependencies) { enqueue('layout', callback, dependencies); },
  };
  const window = {
    setTimeout(callback, delay) { const id = ++nextTimer; scheduled.push({ delay, at: now }); timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    matchMedia: () => ({ matches: appearance.reduceMotion, addEventListener() {}, removeEventListener() {} }),
  };
  const globals = { window, document, Error, File, Blob, HTMLElement: Element, requestAnimationFrame(callback) { const id = ++nextTimer; frames.set(id, callback); return id; }, cancelAnimationFrame(id) { frames.delete(id); } };
  const avatar = { avatar: null, error: null, storageNotice: '', clear() { avatar.avatar = null; }, select() {} };
  const invalidateProfiles = () => { invalidations.push(now); operations.push('invalidate'); };
  const cacheProfile = value => { cached.push(plain(value)); operations.push('cache'); };
  const services = { profiles: {
    getProfile(id) { return new Promise((resolve, reject) => reads.push({ id, resolve: value => resolve(value ?? plain(records.get(id))), reject })); },
    updateProfile(id, input) { return new Promise((resolve, reject) => writes.push({ id, input: plain(input), resolve(value) { const confirmed = value ?? { ...records.get(id), ...plain(input) }; records.set(id, plain(confirmed)); resolve(plain(confirmed)); }, reject })); },
  } };
  const shareModel = sourceModule('src/features/sharing/shareModel.ts');
  const validation = sourceModule('src/features/profile/validation.ts', { '../sharing/shareModel': shareModel });
  const profileLinks = sourceModule('src/features/profile/profileLinks.ts', { '../../components/profile/categoryIcons': { profileLinkIconNames: ['globe'] } });
  const asyncAction = sourceModule('src/hooks/useAsyncAction.ts', { react }, globals);
  const profileHook = sourceModule('src/features/profile/useProfileEditor.ts', {
    react, '../../contexts/ServicesContext': { useServices: () => services }, '../../contexts/ProfileDataContext': { useProfileData: () => ({ invalidateProfiles, cacheProfile }) },
    '../../contexts/AuthContext': { useAuth: () => auth }, '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../../hooks/useAsyncAction': asyncAction, '../employer/employer': sourceModule('src/features/employer/employer.ts'), './validation': validation, './profileLinks': profileLinks,
    './useProfileOnboarding': { useAvatarSelection: () => avatar },
  }, globals);
  const { ProfileEditorPage } = sourceModule('src/features/profile/ProfileEditorDialog.tsx', {
    react, '../../components/ui/ConfirmationDialog': { ConfirmationDialog: 'confirmation-dialog' }, '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back', useMobileScreenActive: () => active },
    'lucide-react': new Proxy({}, { get: (_target, key) => String(key) }), '../../components/profile/ProfileLocationPicker': { ProfileLocationPicker: 'location-picker' }, '../../components/profile/ProfileField': { ProfileField: 'profile-field' },
    '../../components/profile/MobileProfileAvatarEditor': { MobileProfileAvatarEditor: 'avatar-editor' }, '../../components/ui/InterfaceIcon': { InterfaceIcon: 'interface-icon' }, '../../components/ui/StateViews': { ErrorState: 'error-state', LoadingState: 'loading-state' },
    './useProfileEditor': { useProfileEditor(...args) { editor = profileHook.useProfileEditor(...args); return editor; } }, './ProfileLinksEditor': { ProfileLinksEditor: 'links-editor' }, './validation': validation,
    '../../contexts/AuthContext': { useAuth: () => auth }, '../../presentation/usePresentation': { usePresentation: () => presentation }, './profileEditorPage.css': {},
  }, globals);
  const callbacks = {
    onClose() { closed.push(now); },
    onSaved() { saved.push(now); options.onSaved?.({ document, opener, origin }); },
  };
  function commit(node, path = 'root', parent = null) {
    if (!React.isValidElement(node)) return;
    if (typeof node.type === 'string') {
      const element = elements.get(path) ?? new Element(node.type);
      elements.set(path, element); element.props = node.props; element.isConnected = true; element.parentElement = parent; parent = element;
      if (typeof node.ref === 'function') node.ref(element); else if (node.ref) node.ref.current = element;
    }
    React.Children.toArray(node.props.children).forEach((child, index) => commit(child, `${path}.${index}`, parent));
  }
  function render(changes = {}) {
    if ('profileId' in changes) profileId = changes.profileId;
    if ('presentation' in changes) presentation = changes.presentation;
    if ('active' in changes) active = changes.active;
    if (rendering || !frame.mounted) return tree;
    for (let pass = 0; pass === 0 || dirty; pass++) {
      assert.ok(pass < 25, 'Profile editor must settle'); rendering = true; dirty = false; cursor = 0; frame.effects = []; frame.layout = [];
      tree = ProfileEditorPage({ profileId, ...callbacks, ...(options.providedOrigin ? { returnFocusTarget } : {}) });
      commits.push({ phase: editor.phase, profileId, saved: nodes(tree).some(node => node.props.role === 'status'), saving: nodes(tree).some(node => node.type === 'button' && text(node) === 'Saving…') });
      commit(tree); frame.layout.splice(0).forEach(run => run()); frame.effects.splice(0).forEach(run => run()); rendering = false;
    }
    return tree;
  }
  function unmount() { if (!frame.mounted) return; frame.mounted = false; frame.slots.forEach(slot => slot?.cleanup?.()); elements.forEach(element => { element.isConnected = false; }); }
  if (options.initialFocusBody) document.activeElement = document.body;
  render();
  return {
    reads, writes, saved, closed, invalidations, cached, operations, scheduled, focusCalls, document, opener, originMain, origin, appearance, auth, commits, render, unmount,
    get editor() { render(); return editor; }, get tree() { render(); return tree; }, get writesAfterUnmount() { return writesAfterUnmount; }, get timers() { return timers; },
    find(predicate) { render(); return nodes(tree).find(predicate); },
    button(label) { return this.find(node => node.type === 'button' && (text(node) === label || node.props['aria-label'] === label)); },
    field(label) { return this.find(node => node.type === 'profile-field' && node.props.label === label); },
    form() { return this.find(node => node.type === 'form'); },
    submit() { return this.form().props.onSubmit({ preventDefault() {} }); },
    async flush() { for (let i = 0; i < 4; i++) { if (frame.mounted) render(); await new Promise(setImmediate); } },
    async ready() { reads.at(-1).resolve(); await this.flush(); return this; },
    async changeName(value = 'Updated name') { this.field('Name').props.onChange(value); await this.flush(); },
    advance(milliseconds) { now += milliseconds; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } if (frame.mounted) render(); },
    paint() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now)); },
    emit(name) { for (const callback of [...(listeners.get(name) ?? [])]) callback(); },
  };
}

test('MOBILE Save stays truthful while the actual profile service is pending', async () => {
  const h = await fixture().ready(); await h.changeName('  Updated name  '); h.submit(); await h.flush();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].id, 'owner'); assert.deepEqual(h.writes[0].input, { name: 'Updated name' });
  assert.equal(h.editor.phase, 'saving'); assert.equal(h.button('Saving…').props.disabled, true); assert.equal(h.button('Back').props.disabled, true);
  assert.equal(h.field('Name').props.disabled, true); assert.equal(h.find(node => node.type === 'avatar-editor').props.disabled, true); assert.equal(h.find(node => node.type === 'links-editor').props.disabled, true);
  assert.equal(h.saved.length, 0); assert.equal(h.closed.length, 0); assert.equal(h.invalidations.length, 0); assert.equal(h.find(node => node.props.role === 'status'), undefined);
  h.advance(5000); assert.equal(h.saved.length, 0); assert.equal(h.editor.phase, 'saving'); h.unmount(); h.writes[0].reject(new Error('Disposed request')); await h.flush();
});

test('WEB retains its existing confirmed-success status and 700 ms return delay', async () => {
  const h = await fixture({ presentation: 'web' }).ready(); await h.changeName(); h.submit();
  h.writes[0].resolve(); await h.flush();
  assert.equal(h.editor.phase, 'saved'); assert.equal(text(h.find(node => node.props.role === 'status')), 'Profile updated.'); assert.equal(h.saved.length, 0);
  assert.deepEqual(h.scheduled.map(timer => timer.delay), [700]); h.advance(699); assert.equal(h.saved.length, 0); h.advance(1); assert.equal(h.saved.length, 1); assert.equal(h.invalidations.length, 1); assert.equal(h.cached.length, 0);
  h.advance(1000); assert.equal(h.saved.length, 1); h.unmount();
  const cancelled = await fixture({ presentation: 'web' }).ready(); await cancelled.changeName(); cancelled.submit(); cancelled.writes[0].resolve(); await cancelled.flush();
  cancelled.unmount(); cancelled.advance(700); assert.equal(cancelled.saved.length, 0);
});

test('MOBILE returns once immediately after confirmation and seeds only the canonical server record', async () => {
  for (const reduce of [false, true]) {
    const h = await fixture({ reduce }).ready(); await h.changeName(); h.submit(); await h.flush();
    assert.equal(h.cached.length, 0); assert.equal(h.saved.length, 0);
    const confirmed = { ...profile('owner'), name: 'Canonical server name', avatar: 'https://images.example.test/confirmed.webp' };
    h.writes[0].resolve(confirmed); await h.flush();
    assert.equal(h.saved.length, 1); assert.equal(h.closed.length, 0); assert.equal(h.scheduled.some(timer => timer.delay === 700), false);
    assert.deepEqual(h.cached, [confirmed]); assert.deepEqual(h.operations, ['invalidate', 'cache']); assert.equal(h.reads.length, 1, 'Returning does not wait for a second profile read.');
    const appearance = plain(h.appearance); h.render(); h.advance(5000); await h.flush(); assert.equal(h.saved.length, 1); assert.deepEqual(h.appearance, appearance); h.unmount();
  }
});

test('the same MOBILE submit and Back callbacks cannot bypass the synchronous pending guard', async () => {
  const h = await fixture().ready(); await h.changeName(); const submit = h.form().props.onSubmit, back = h.button('Back').props.onClick;
  submit({ preventDefault() {} }); submit({ preventDefault() {} }); back();
  assert.equal(h.writes.length, 1); await h.flush(); assert.equal(h.find(node => node.type === 'confirmation-dialog'), undefined); assert.equal(h.closed.length, 0); assert.equal(h.saved.length, 0);
  h.writes[0].resolve(); await h.flush(); assert.equal(h.saved.length, 1); h.unmount();
});

test('MOBILE failure preserves the draft and focuses the error; Retry submits current edits once', async () => {
  const h = await fixture().ready(); await h.changeName('First draft'); h.submit(); h.writes[0].reject(new Error('Profile could not be saved.')); await h.flush();
  const alert = h.find(node => node.props.role === 'alert'); assert.ok(alert); assert.match(text(alert), /Profile could not be saved\./);
  assert.equal(h.editor.phase, 'failed'); assert.equal(h.field('Name').props.value, 'First draft'); assert.equal(h.saved.length, 0); assert.equal(h.cached.length, 0); assert.equal(h.invalidations.length, 0);
  assert.equal(h.document.activeElement.props.role, 'alert'); assert.deepEqual(h.origin, { scrollTop: 812, scrollLeft: 7 });
  await h.changeName('Edited after failure'); const retry = h.button('Try again').props.onClick; retry(); retry();
  assert.equal(h.writes.length, 2); assert.deepEqual(h.writes[1].input, { name: 'Edited after failure' }); await h.flush(); assert.equal(h.button('Saving…').props.disabled, true); assert.equal(h.saved.length, 0);
  h.writes[1].resolve(); await h.flush(); assert.equal(h.saved.length, 1); h.unmount();
});

test('inactive MOBILE editors consume delayed success or failure and cannot return later on Forward', async () => {
  for (const fails of [false, true]) {
    const h = await fixture().ready(); await h.changeName(); h.submit(); await h.flush(); h.render({ active: false }); const focuses = h.focusCalls.length;
    if (fails) h.writes[0].reject(new Error('Old entry failed')); else h.writes[0].resolve(); await h.flush(); h.advance(1000);
    assert.equal(h.saved.length, 0); assert.equal(h.focusCalls.length, focuses);
    h.render({ active: true }); await h.flush(); h.advance(1000); assert.equal(h.saved.length, 0); assert.equal(h.find(node => node.props.role === 'alert'), undefined); assert.equal(h.find(node => node.props.role === 'status'), undefined);
    await h.changeName('Fresh entry edit'); h.submit(); assert.equal(h.writes.length, 2); h.writes[1].resolve(); await h.flush(); assert.equal(h.saved.length, 1); h.unmount();
  }
});

test('leaving and returning before an old MOBILE save settles does not make that completion current again', async () => {
  for (const boundary of ['entry', 'owner', 'presentation']) for (const fails of [false, true]) {
    const h = await fixture().ready(); await h.changeName(); h.submit(); await h.flush();
    if (boundary === 'entry') { h.render({ active: false }); h.render({ active: true }); }
    else if (boundary === 'presentation') { h.render({ presentation: 'web' }); h.render({ presentation: 'mobile' }); }
    else { h.render({ profileId: 'other' }); h.reads.at(-1).resolve(); await h.flush(); h.render({ profileId: 'owner' }); h.reads.at(-1).resolve(); }
    await h.flush(); const focuses = h.focusCalls.length;
    if (fails) h.writes[0].reject(new Error('Obsolete entry failed')); else h.writes[0].resolve(); await h.flush(); h.advance(1000);
    assert.equal(h.saved.length, 0, boundary); assert.equal(h.closed.length, 0); assert.equal(h.focusCalls.length, focuses); assert.equal(h.find(node => node.props.role === 'alert'), undefined); assert.equal(h.find(node => node.props.role === 'status'), undefined); h.unmount();
  }
});

test('MOBILE completions cannot navigate a replacement owner or a replacement presentation', async () => {
  for (const boundary of ['owner', 'mobile-web', 'web-mobile']) for (const fails of [false, true]) {
    const h = await fixture({ presentation: boundary === 'web-mobile' ? 'web' : 'mobile' }).ready(); await h.changeName(); h.submit(); await h.flush();
    if (boundary === 'owner') { h.auth.user = { id: 'account-other' }; h.auth.viewerProfileId = 'other'; h.render({ profileId: 'other' }); h.reads.at(-1).resolve(); }
    else h.render({ presentation: boundary === 'mobile-web' ? 'web' : 'mobile' });
    await h.flush(); const focuses = h.focusCalls.length;
    if (fails) h.writes[0].reject(new Error('Old owner or mode failed')); else h.writes[0].resolve(); await h.flush(); h.advance(1000);
    assert.equal(h.saved.length, 0, boundary); assert.equal(h.closed.length, 0); assert.equal(h.focusCalls.length, focuses); assert.equal(h.find(node => node.props.role === 'alert'), undefined); assert.equal(h.find(node => node.props.role === 'status'), undefined); h.unmount();
  }
});

test('a pending physical write cannot be duplicated by leaving and returning to MOBILE or crossing the presentation boundary', async () => {
  for (const boundary of ['entry', 'owner', 'mobile-web', 'web-mobile']) {
    const h = await fixture({ presentation: boundary === 'web-mobile' ? 'web' : 'mobile' }).ready(); await h.changeName(); h.submit(); await h.flush();
    if (boundary === 'entry') { h.render({ active: false }); h.render({ active: true }); }
    else if (boundary === 'owner') { h.render({ profileId: 'other' }); h.reads.at(-1).resolve(); await h.flush(); await h.changeName('Other draft'); }
    else h.render({ presentation: boundary === 'mobile-web' ? 'web' : 'mobile' });
    await h.flush(); h.submit(); assert.equal(h.writes.length, 1, boundary); assert.equal(h.button('Saving…').props.disabled, true);
    h.writes[0].resolve(); await h.flush(); assert.equal(h.saved.length, 0); if (boundary === 'web-mobile') assert.equal(h.cached.length, 1, 'The canonical response is available when the pending WEB request becomes MOBILE.');
    await h.changeName('Freshly confirmed entry'); h.submit(); assert.equal(h.writes.length, 2); h.writes[1].resolve(); await h.flush(); h.unmount();
  }
});

test('retained MOBILE callbacks cannot dispatch after an entry or owner leaves and returns', async () => {
  for (const boundary of ['entry', 'owner', 'presentation']) {
    const h = await fixture().ready(); await h.changeName(); const oldSubmit = h.form().props.onSubmit;
    if (boundary === 'entry') { h.render({ active: false }); h.render({ active: true }); }
    else if (boundary === 'presentation') { h.render({ presentation: 'web' }); h.render({ presentation: 'mobile' }); }
    else { h.render({ profileId: 'other' }); h.reads.at(-1).resolve(); await h.flush(); h.render({ profileId: 'owner' }); h.reads.at(-1).resolve(); }
    await h.flush(); oldSubmit({ preventDefault() {} }); await h.flush(); assert.equal(h.writes.length, 0, boundary); assert.equal(h.saved.length, 0); h.unmount();
  }
});

test('an unmounted MOBILE editor cannot focus or return when a dispatched save later settles', async () => {
  for (const fails of [false, true]) {
    const h = await fixture().ready(); await h.changeName(); h.submit(); await h.flush(); h.unmount(); const focuses = h.focusCalls.length;
    if (fails) h.writes[0].reject(new Error('Disposed failure')); else h.writes[0].resolve(); await h.flush(); h.advance(5000);
    assert.equal(h.saved.length, 0); assert.equal(h.closed.length, 0); assert.equal(h.focusCalls.length, focuses); assert.equal(h.writesAfterUnmount, 0); assert.equal(h.timers.size, 0);
  }
});

test('MOBILE return captures the actual opener before heading focus and restores it without moving origin scroll', async () => {
  for (const reduce of [false, true]) {
    const h = await fixture({ reduce }).ready(); assert.equal(h.document.activeElement.props.id, 'profile-editor-title'); assert.equal(h.document.activeElement.focusSettings.preventScroll, true);
    h.originMain.inert = false; h.unmount(); h.document.activeElement = h.document.body; const count = h.focusCalls.length;
    assert.equal(h.focusCalls.length, count); h.paint(); assert.equal(h.document.activeElement, h.opener); assert.equal(h.opener.focusSettings.preventScroll, true); assert.deepEqual(h.origin, { scrollTop: 812, scrollLeft: 7 });
    h.paint(); assert.equal(h.focusCalls.length, count + 1);
  }
});

test('MOBILE return falls back to the originating main region when the opener is no longer available', async () => {
  for (const unavailable of ['disconnected', 'disabled', 'hidden']) {
    const h = await fixture().ready(); h.originMain.inert = false;
    if (unavailable === 'disconnected') h.opener.isConnected = false; else if (unavailable === 'disabled') h.opener.props.disabled = true; else h.opener.hidden = true;
    h.unmount(); h.document.activeElement = h.document.body; h.paint(); assert.equal(h.document.activeElement, h.originMain); assert.equal(h.originMain.focusSettings.preventScroll, true);
  }
});

test('MOBILE return uses the opener supplied before navigation when the retained origin has already lost focus', async () => {
  const h = await fixture({ providedOrigin: true, initialFocusBody: true }).ready(); assert.equal(h.document.activeElement.props.id, 'profile-editor-title');
  h.originMain.inert = false; h.unmount(); h.document.activeElement = h.document.body; h.paint(); assert.equal(h.document.activeElement, h.opener); assert.equal(h.opener.focusSettings.preventScroll, true);
});

test('MOBILE return focus cannot take focus from another interaction, modal, inactive origin or WEB mode', async () => {
  for (const reason of ['pointerdown', 'keydown', 'other-focus', 'modal', 'inert', 'global-opener', 'direct-entry', 'web']) {
    const h = await fixture({ providedOrigin: reason === 'global-opener', initialFocusBody: reason === 'direct-entry' }).ready(); if (!['inert', 'global-opener'].includes(reason)) h.originMain.inert = false;
    if (reason === 'global-opener') h.opener.parentElement = null;
    if (reason === 'web') h.render({ presentation: 'web' });
    h.unmount(); const count = h.focusCalls.length; h.document.activeElement = h.document.body;
    if (reason === 'pointerdown' || reason === 'keydown') h.emit(reason);
    if (reason === 'other-focus') h.document.activeElement = { external: true };
    if (reason === 'modal') h.document.modal = { open: true };
    h.paint(); assert.equal(h.focusCalls.length, count, reason); assert.notEqual(h.document.activeElement, h.opener);
  }
});
