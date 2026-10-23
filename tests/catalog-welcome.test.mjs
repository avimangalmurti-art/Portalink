import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const textOf = node => React.isValidElement(node) ? React.Children.toArray(node.props.children).map(textOf).join('') : node == null ? '' : String(node);
const expanded = node => !React.isValidElement(node) ? node : typeof node.type === 'function' ? expanded(node.type(node.props)) : React.cloneElement(node, {}, ...React.Children.toArray(node.props.children).map(expanded));
const count = lines => lines.reduce((total, line) => total + Array.from(line).length, 0);
const legacyWelcomeKey = 'portalink:catalog-welcome:v1';

function stateFixture(options = {}) {
  const storage = options.storage ?? new Map(), reads = [], writes = [];
  const window = { localStorage: {
    getItem(key) { reads.push(key); if (options.blockedRead) throw Error('Storage is unavailable'); return storage.get(key) ?? null; },
    setItem(key, value) { if (options.blockedWrite) throw Error('Storage quota is unavailable'); writes.push([key, value]); storage.set(key, value); },
  } };
  const state = sourceModule('src/components/auth/catalogWelcomeState.ts', {}, { window });
  return { state, storage, reads, writes, window };
}

/** Actual component/state with controlled effects, preference events and a clock.
 * The visual TypedLines child is executed unchanged. DOM doubles cover timing,
 * events and accessibility markup; browser QA establishes layout and CSS motion.
 */
function fixture(options = {}) {
  const environment = options.environment ?? stateFixture(options), { state } = environment;
  const slots = [], timers = new Map(), mediaEvents = new Set(), starts = [], focuses = [], dismissals = [], portalTargets = [];
  let cursor = 0, effects = [], dirty = true, tree, now = 0, timerId = 0, mounted = true, lateStateWrites = 0, reduced = options.reduced ?? false, modalClose;
  const root = { focus(settings) { focuses.push(settings); } }, viewport = { current: root };
  const media = { get matches() { return reduced; }, addEventListener(type, listener) { assert.equal(type, 'change'); mediaEvents.add(listener); }, removeEventListener(type, listener) { assert.equal(type, 'change'); mediaEvents.delete(listener); } };
  const window = { ...environment.window, matchMedia(query) { assert.equal(query, '(prefers-reduced-motion: reduce)'); return media; },
    setTimeout(callback, delay = 0) { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; }, clearTimeout(id) { timers.delete(id); },
  };
  const react = { ...React,
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { if (!mounted) { lateStateWrites++; return; } const value = typeof next === 'function' ? next(slots[index].value) : next; if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; } }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useCallback(callback, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback }; return slots[index].callback; },
    useEffect(callback, deps) { const index = cursor++, previous = slots[index]; if (!same(previous?.deps, deps)) { const slot = slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); if (mounted) slot.cleanup = callback(); }); } },
  };
  const document = { body: { kind: 'body' }, fullscreenElement: options.fullscreen ? { kind: 'fullscreen' } : null };
  const { CatalogWelcome } = sourceModule('src/components/auth/CatalogWelcome.tsx', { react, 'react-dom': { createPortal(child, target) { portalTargets.push(target); return child; } }, '../../presentation/useViewportPresentation': { useViewportPresentation: () => options.presentation ?? 'mobile' }, '../../hooks/useDialogViewport': { useDialogViewport: () => viewport }, '../../hooks/useModalFocus': { useModalFocus(open, target, close, preventScroll = false) { assert.equal(open, true); assert.equal(preventScroll, false, 'Keyboard focus must be allowed to scroll a short or enlarged welcome viewport'); modalClose = close; react.useEffect(() => { target.current?.focus({ preventScroll }); }, []); } }, './catalogWelcomeState': state, './catalog-welcome.css': {} }, { window, document, performance: { now: () => now } });
  function render() { if (!mounted) return tree; for (let pass = 0; dirty; pass++) { assert.ok(pass < 20, 'Welcome effects should settle'); dirty = false; cursor = 0; effects = []; tree = CatalogWelcome({ onStart() { starts.push(now); }, onDismiss: options.dismissible ? () => dismissals.push(now) : undefined }); effects.splice(0).forEach(run => run()); } return tree; }
  const all = () => nodes(expanded(render()));
  const region = className => all().find(node => node.props.className === className);
  function event(extra = {}) { return { defaultPrevented: false, propagationStopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...extra }; }
  render();
  return { ...environment, environment, timers, mediaEvents, starts, focuses, dismissals, document, portalTargets, render, all,
    get lateStateWrites() { return lateStateWrites; }, get main() { return render(); }, get button() { return all().find(node => node.type === 'button'); }, get action() { return region('catalog-welcome-action'); },
    revealed(className) { return nodes(region(className)).filter(node => node.props.className === 'catalog-welcome-glyph' && node.props['data-revealed']).map(textOf).join(''); },
    glyphs(className) { return nodes(region(className)).filter(node => node.props.className === 'catalog-welcome-glyph'); },
    lines(className) { return nodes(region(className)).filter(node => node.props.className === 'catalog-welcome-line'); },
    advance(milliseconds) { const target = now + milliseconds; for (let pass = 0; ; pass++) { assert.ok(pass < 10000, 'Timers must remain bounded'); const next = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0]; if (!next) break; const [id, timer] = next; timers.delete(id); now = timer.at; timer.callback(); render(); } now = target; render(); },
    pointerDown() { render().props.onPointerDownCapture(event()); render(); },
    pointerCancel() { render().props.onPointerCancelCapture(event()); render(); },
    click(start = false) { const click = event(); render().props.onClickCapture(click); if (!click.propagationStopped && start) this.button.props.onClick(click); render(); return click; },
    key(key) { const pressed = event({ key }); render().props.onKeyDownCapture(pressed); render(); return pressed; },
    modalDismiss() { modalClose(); render(); },
    reduce(value) { reduced = value; for (const listener of [...mediaEvents]) listener({ matches: value }); render(); },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('welcome timeline types the headline, pauses, accumulates support and completes around five seconds', () => {
  const { state } = stateFixture(), headlineLength = count(state.CATALOG_HEADLINE), supportLength = count(state.CATALOG_SUPPORT);
  assert.equal(state.CATALOG_HEADLINE_MS >= 2000 && state.CATALOG_HEADLINE_MS <= 3000, true);
  assert.ok(state.CATALOG_SUPPORT_START_MS > state.CATALOG_HEADLINE_MS);
  assert.ok(state.CATALOG_TEXT_END_MS < state.CATALOG_WELCOME_MS);
  let previous = { headline: 0, support: 0 };
  for (let elapsed = 0; elapsed <= state.CATALOG_WELCOME_MS; elapsed += 50) {
    const current = state.catalogWelcomeProgress(elapsed);
    assert.ok(current.headline >= previous.headline && current.support >= previous.support, `Text must accumulate at ${elapsed}ms`);
    assert.ok(current.headline <= headlineLength && current.support <= supportLength);
    if (current.support > 0) assert.equal(current.headline, headlineLength);
    previous = current;
  }
  assert.equal(state.catalogWelcomeProgress(-20).headline, 0);
  const pause = state.catalogWelcomeProgress(state.CATALOG_HEADLINE_MS + 100); assert.equal(pause.headline, headlineLength); assert.equal(pause.support, 0); assert.equal(pause.supporting, false);
  const textDone = state.catalogWelcomeProgress(state.CATALOG_TEXT_END_MS); assert.equal(textDone.support, supportLength); assert.equal(textDone.textComplete, true); assert.equal(textDone.complete, false);
  assert.equal(state.catalogWelcomeProgress(state.CATALOG_WELCOME_MS - 1).complete, false); assert.equal(state.catalogWelcomeProgress(state.CATALOG_WELCOME_MS).complete, true);
  assert.equal(state.catalogWelcomeProgress(100000).support, supportLength);
});

test('completion and account entry are document-local and ignore legacy completion storage', () => {
  for (const blocked of [false, true]) {
    const storage = new Map([[legacyWelcomeKey, 'done']]);
    const h = stateFixture({ storage, blockedRead: blocked, blockedWrite: blocked });
    assert.equal(h.state.hasCompletedCatalogWelcome(), false); assert.equal(h.state.hasEnteredCatalogWelcome(), false);
    assert.doesNotThrow(() => h.state.rememberCatalogWelcomeCompletion()); assert.equal(h.state.hasCompletedCatalogWelcome(), true); assert.equal(h.state.hasEnteredCatalogWelcome(), false);
    h.state.rememberCatalogWelcomeEntry(); assert.equal(h.state.hasEnteredCatalogWelcome(), true);
    const refreshed = stateFixture({ storage: h.storage, blockedRead: blocked, blockedWrite: blocked });
    assert.equal(refreshed.state.hasCompletedCatalogWelcome(), false); assert.equal(refreshed.state.hasEnteredCatalogWelcome(), false);
    assert.deepEqual(h.reads, []); assert.deepEqual(h.writes, []); assert.deepEqual(refreshed.reads, []); assert.deepEqual(refreshed.writes, []);
    assert.deepEqual([...storage], [[legacyWelcomeKey, 'done']], 'Presentation state must not read, write or remove existing storage.');
  }
});

test('welcome eligibility preserves recovery, OAuth and token callback entry paths', () => {
  const { state } = stateFixture();
  for (const view of ['signIn', 'signUp']) {
    for (const [search, hash] of [['', ''], ['?welcome=1', ''], ['?q=code', '']]) assert.equal(state.canOfferCatalogWelcome(view, search, hash), true);
    for (const marker of ['auth', 'code', 'token', 'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token', 'token_hash', 'type', 'error', 'error_code', 'error_description']) {
      assert.equal(state.canOfferCatalogWelcome(view, `?${marker}=value`, ''), false, marker); assert.equal(state.canOfferCatalogWelcome(view, '', `#${marker}=value`), false, marker);
    }
    assert.equal(state.canOfferCatalogWelcome(view, '?CODE=value', ''), false);
    assert.equal(state.canOfferCatalogWelcome(view, '?%63ode=value', ''), false);
    assert.equal(state.canOfferCatalogWelcome(view, '', '#%74ype=recovery'), false);
  }
  for (const view of [null, 'forgotPassword', 'resetPassword', 'verifyEmail']) assert.equal(state.canOfferCatalogWelcome(view, '', ''), false);
});

test('the actual composition reserves its full text and exposes one complete accessible version from the first frame', () => {
  const h = fixture(), accessible = h.all().filter(node => node.props.className === 'catalog-welcome-accessible');
  assert.deepEqual(accessible.map(textOf), [h.state.CATALOG_HEADLINE.join(' '), h.state.CATALOG_SUPPORT.join(' ')]);
  assert.equal(h.glyphs('catalog-welcome-headline').length, count(h.state.CATALOG_HEADLINE)); assert.equal(h.glyphs('catalog-welcome-support').length, count(h.state.CATALOG_SUPPORT));
  assert.equal(h.revealed('catalog-welcome-headline'), ''); assert.equal(h.revealed('catalog-welcome-support'), '');
  for (const className of ['catalog-welcome-headline', 'catalog-welcome-support']) {
    const container = h.all().find(node => node.props.className === className), visual = nodes(container).find(node => node.props['aria-hidden'] === 'true'); assert.ok(visual);
    assert.equal(nodes(visual).filter(node => node.props.className === 'catalog-welcome-accessible').length, 0);
  }
  assert.equal(h.all().some(node => node.props['aria-live'] || node.props.role === 'status'), false, 'Typing must not create character-by-character announcements');
  assert.equal(h.button.props.disabled, true); assert.equal(h.button.props.tabIndex, -1); assert.equal(h.action.props['aria-hidden'], true);
  assert.equal(h.main.props.role, 'dialog'); assert.equal(h.main.props['aria-modal'], 'true'); assert.equal(h.main.props.tabIndex, -1);
  assert.equal(h.focuses.length, 1); assert.equal(h.focuses[0].preventScroll, false); h.unmount();
});

test('line entrance states follow typing into each line while preserving the accumulating composition', () => {
  const h = fixture();
  const states = className => h.lines(className).map(line => [line.props['data-started'], line.props['data-finished']]);
  const waiting = [[false, false], [false, false], [false, false]], finished = [[true, true], [true, true], [true, true]];
  assert.deepEqual(states('catalog-welcome-headline'), waiting);
  assert.deepEqual(states('catalog-welcome-support'), waiting);
  assert.deepEqual(h.lines('catalog-welcome-headline').map(textOf), [...h.state.CATALOG_HEADLINE]);
  assert.deepEqual(h.lines('catalog-welcome-support').map(textOf), [...h.state.CATALOG_SUPPORT]);

  h.advance(80);
  assert.deepEqual(states('catalog-welcome-headline'), [[true, false], [false, false], [false, false]]);
  h.advance(1200);
  assert.deepEqual(states('catalog-welcome-headline'), [[true, true], [true, false], [false, false]]);
  assert.deepEqual(states('catalog-welcome-support'), waiting);
  h.advance(1240);
  assert.deepEqual(states('catalog-welcome-headline'), finished);
  assert.deepEqual(states('catalog-welcome-support'), waiting);

  h.advance(760);
  assert.deepEqual(states('catalog-welcome-support'), [[true, false], [false, false], [false, false]]);
  h.advance(640);
  assert.deepEqual(states('catalog-welcome-support'), [[true, true], [true, false], [false, false]]);
  assert.deepEqual(states('catalog-welcome-headline'), finished, 'Earlier lines retain their settled state.');
  h.advance(800);
  assert.deepEqual(states('catalog-welcome-support'), finished);
  assert.equal(h.button.props.disabled, true, 'Settled text does not bypass the existing Start deadline.');
  h.advance(280);
  assert.equal(h.button.props.disabled, false);
  assert.deepEqual(h.starts, []); h.unmount();
});

test('skip, same-document reopening and reduced motion mark every line settled without a delayed entrance', () => {
  const skipped = fixture(); skipped.advance(900); skipped.pointerDown(); skipped.click(true);
  const returned = fixture({ environment: skipped.environment }), reduced = fixture({ reduced: true }), changed = fixture();
  changed.advance(1280); changed.reduce(true);
  for (const h of [skipped, returned, reduced, changed]) {
    assert.equal(h.main.props['data-instant'], true);
    assert.equal(h.main.props['data-complete'], true);
    for (const className of ['catalog-welcome-headline', 'catalog-welcome-support']) {
      assert.equal(h.lines(className).length, 3);
      assert.ok(h.lines(className).every(line => line.props['data-started'] === true && line.props['data-finished'] === true));
    }
    assert.equal(h.timers.size, 0); assert.deepEqual(h.starts, []);
    h.reduce(false); h.advance(1000);
    assert.equal(h.main.props['data-instant'], true, 'Clearing a preference cannot replay the entrance.');
    h.unmount();
  }
});

test('welcome owns a presentation-scoped body or fullscreen portal while retaining its explicit action shape', () => {
  for (const presentation of ['mobile', 'web']) for (const fullscreen of [false, true]) {
    const h = fixture({ presentation, fullscreen, reduced: true });
    assert.equal(h.main.props['data-presentation'], presentation); assert.ok(h.portalTargets.length > 0);
    assert.ok(h.portalTargets.every(target => target === (fullscreen ? h.document.fullscreenElement : h.document.body)));
    assert.equal(h.button.props['data-ui-shape'], 'action'); assert.equal(h.button.props['data-keep-color'], ''); h.unmount();
  }
});

test('exiting fullscreen keeps the mounted welcome, viewport ref and focus trap in their original portal host', () => {
  const h = fixture({ fullscreen: true }), original = h.document.fullscreenElement;
  assert.equal(h.portalTargets[0], original); h.document.fullscreenElement = null; h.advance(640);
  h.pointerDown(); h.click(); assert.equal(h.main.props['data-complete'], true);
  assert.ok(h.portalTargets.every(target => target === original)); assert.equal(h.focuses.length, 1); assert.equal(h.focuses[0].preventScroll, false);
  h.pointerDown(); h.click(true); assert.equal(h.starts.length, 1); h.unmount();
});

test('actual timers reveal the support lines in order, reserve the button fade and enable Start only after completion', () => {
  const h = fixture(), headline = h.state.CATALOG_HEADLINE.join(''), support = h.state.CATALOG_SUPPORT.join('');
  h.advance(1280); const partial = h.revealed('catalog-welcome-headline'); assert.ok(partial.length > 0 && partial.length < headline.length); assert.ok(headline.startsWith(partial)); assert.equal(h.revealed('catalog-welcome-support'), '');
  h.advance(1240); assert.equal(h.revealed('catalog-welcome-headline'), headline); assert.equal(h.revealed('catalog-welcome-support'), '');
  h.advance(320); assert.equal(h.revealed('catalog-welcome-support'), '');
  h.advance(440); const first = h.revealed('catalog-welcome-support'); assert.ok(first.length > 0 && first.length < h.state.CATALOG_SUPPORT[0].length); assert.ok(support.startsWith(first));
  h.advance(640); const second = h.revealed('catalog-welcome-support'); assert.ok(second.length > h.state.CATALOG_SUPPORT[0].length && second.length < h.state.CATALOG_SUPPORT[0].length + h.state.CATALOG_SUPPORT[1].length); assert.ok(support.startsWith(second));
  h.advance(640); const third = h.revealed('catalog-welcome-support'); assert.ok(third.length > h.state.CATALOG_SUPPORT[0].length + h.state.CATALOG_SUPPORT[1].length && third.length < support.length); assert.ok(support.startsWith(third));
  h.advance(120); assert.equal(h.revealed('catalog-welcome-support'), support); assert.equal(h.action.props['data-ready'], true); assert.equal(h.button.props.disabled, true);
  h.advance(320); assert.equal(h.main.props['data-complete'], true); assert.equal(h.button.props.disabled, false); assert.equal(h.button.props.tabIndex, 0); assert.equal(h.action.props['aria-hidden'], undefined);
  assert.equal(h.state.hasCompletedCatalogWelcome(), true); assert.equal(h.state.hasEnteredCatalogWelcome(), false); assert.deepEqual(h.starts, []); assert.equal(h.focuses.length, 1); assert.equal(h.timers.size, 0); h.unmount();
});

test('a tap while typing completes the composition without entering, and a separate Start tap hands off once', () => {
  const h = fixture(); h.advance(900); h.pointerDown(); const click = h.click(true);
  assert.equal(click.defaultPrevented, true); assert.equal(click.propagationStopped, true); assert.equal(h.main.props['data-complete'], true); assert.equal(h.main.props['data-instant'], true); assert.deepEqual(h.starts, []);
  assert.equal(h.state.hasCompletedCatalogWelcome(), true); assert.equal(h.state.hasEnteredCatalogWelcome(), false); assert.equal(h.timers.size, 0);
  h.pointerDown(); h.click(true); h.pointerDown(); h.click(true); assert.equal(h.starts.length, 1); assert.equal(h.state.hasEnteredCatalogWelcome(), true); h.unmount();
});

test('a tap that starts before the deadline cannot enter when its click lands after natural completion', () => {
  const h = fixture(); h.advance(4960); h.pointerDown(); h.advance(80); assert.equal(h.button.props.disabled, false);
  const click = h.click(true); assert.equal(click.propagationStopped, true); assert.deepEqual(h.starts, []);
  h.pointerDown(); h.click(true); assert.equal(h.starts.length, 1); h.unmount();
});

test('a cancelled pointer gesture does not consume a later accessible Start activation', () => {
  const h = fixture(); h.advance(960); h.pointerDown(); h.pointerCancel(); h.advance(4040);
  assert.equal(h.button.props.disabled, false); const click = h.click(true);
  assert.equal(click.propagationStopped, false); assert.equal(h.starts.length, 1); h.unmount();
});

test('keyboard activation clears an abandoned pointer gesture before entering a completed composition', () => {
  const h = fixture(); h.advance(960); h.pointerDown(); h.advance(4040);
  const key = h.key('Enter'); assert.equal(key.defaultPrevented, false);
  const click = h.click(true); assert.equal(click.propagationStopped, false); assert.equal(h.starts.length, 1); h.unmount();
});

test('the shared modal dismissal path completes the intro without bypassing its explicit Start action', () => {
  const h = fixture(); h.advance(640); h.modalDismiss(); assert.equal(h.main.props['data-complete'], true); assert.deepEqual(h.starts, []);
  assert.equal(h.timers.size, 0); h.pointerDown(); h.click(true); assert.equal(h.starts.length, 1); h.unmount();
});

test('dismissible auth intros consume an unfinished Escape but retain the existing cancel action after completion', () => {
  const h = fixture({ dismissible: true }); h.advance(640); h.modalDismiss(); assert.equal(h.main.props['data-complete'], true); assert.deepEqual(h.starts, []); assert.deepEqual(h.dismissals, []);
  h.modalDismiss(); assert.equal(h.dismissals.length, 1); assert.deepEqual(h.starts, []); assert.equal(h.state.hasEnteredCatalogWelcome(), false); h.unmount();
});

test('stale Start handlers cannot enter before completion or hand off twice', () => {
  const h = fixture(), start = h.button.props.onClick; start(); assert.deepEqual(h.starts, []);
  h.advance(5000); start(); start(); assert.equal(h.starts.length, 1); assert.equal(h.state.hasEnteredCatalogWelcome(), true); h.unmount();
});

test('Enter, Space and Escape finish the animation without invoking the account entry', () => {
  for (const key of ['Enter', ' ', 'Escape']) {
    const h = fixture(); h.advance(600); const event = h.key(key); assert.equal(event.defaultPrevented, true); assert.equal(event.propagationStopped, true);
    assert.equal(h.button.props.disabled, false); assert.deepEqual(h.starts, []); assert.equal(h.state.hasCompletedCatalogWelcome(), true); assert.equal(h.timers.size, 0); h.unmount();
  }
  const h = fixture(); const event = h.key('ArrowDown'); assert.equal(event.defaultPrevented, false); assert.equal(h.button.props.disabled, true); h.unmount();
});

test('Reduce Motion displays the complete composition immediately without timed typing', () => {
  const h = fixture({ reduced: true }); assert.equal(h.main.props['data-complete'], true); assert.equal(h.main.props['data-instant'], true);
  assert.equal(h.revealed('catalog-welcome-headline'), h.state.CATALOG_HEADLINE.join('')); assert.equal(h.revealed('catalog-welcome-support'), h.state.CATALOG_SUPPORT.join(''));
  assert.equal(h.button.props.disabled, false); assert.equal(h.timers.size, 0); assert.equal(h.all().some(node => node.props.className === 'catalog-welcome-cursor'), false);
  assert.deepEqual(h.starts, []); h.pointerDown(); h.click(true); assert.equal(h.starts.length, 1); h.unmount();
});

test('enabling Reduce Motion midway completes once and never restarts typing when the preference clears', () => {
  const h = fixture(); h.advance(1000); h.reduce(true); assert.equal(h.main.props['data-complete'], true); assert.equal(h.timers.size, 0); assert.deepEqual(h.starts, []);
  h.reduce(false); h.advance(10000); assert.equal(h.main.props['data-complete'], true); assert.equal(h.timers.size, 0); assert.equal(h.focuses.length, 1); h.unmount();
});

test('a completed introduction reopens immediately in the same document, while unavailable storage never blocks entry', () => {
  const first = fixture(); first.advance(5000); first.unmount();
  const second = fixture({ environment: first.environment }); assert.equal(second.main.props['data-complete'], true); assert.equal(second.timers.size, 0); second.unmount();
  const blocked = fixture({ blockedRead: true, blockedWrite: true }); blocked.pointerDown(); blocked.click(); assert.equal(blocked.button.props.disabled, false);
  blocked.pointerDown(); blocked.click(true); assert.equal(blocked.starts.length, 1); assert.equal(blocked.state.hasCompletedCatalogWelcome(), true); blocked.unmount();
});

test('refreshing mobile or web replays the full introduction despite earlier completion and a legacy saved value', () => {
  for (const presentation of ['mobile', 'web']) for (const completion of ['natural', 'skipped']) {
    const storage = new Map([[legacyWelcomeKey, 'done']]);
    const first = fixture({ presentation, storage });
    assert.equal(first.main.props['data-complete'], false, 'A previous stored completion cannot suppress this document\'s animation.');
    if (completion === 'natural') first.advance(5000);
    else { first.advance(900); first.pointerDown(); first.click(true); }
    assert.equal(first.main.props['data-complete'], true); assert.deepEqual(first.starts, []); first.unmount();

    const reopened = fixture({ presentation, environment: first.environment });
    assert.equal(reopened.main.props['data-instant'], true); assert.equal(reopened.button.props.disabled, false); assert.equal(reopened.timers.size, 0);
    reopened.pointerDown(); reopened.click(true); assert.equal(reopened.starts.length, 1); assert.equal(reopened.state.hasEnteredCatalogWelcome(), true); reopened.unmount();

    // A fresh source module models a document reload; its backing storage survives.
    const refreshed = fixture({ presentation, storage });
    assert.equal(refreshed.state.hasEnteredCatalogWelcome(), false); assert.equal(refreshed.state.hasCompletedCatalogWelcome(), false);
    assert.equal(refreshed.main.props['data-instant'], false); assert.equal(refreshed.main.props['data-complete'], false);
    assert.equal(refreshed.revealed('catalog-welcome-headline'), ''); assert.equal(refreshed.revealed('catalog-welcome-support'), '');
    assert.equal(refreshed.button.props.disabled, true); assert.equal(refreshed.button.props.tabIndex, -1); assert.equal(refreshed.action.props['aria-hidden'], true);
    refreshed.advance(1280); const partial = refreshed.revealed('catalog-welcome-headline');
    assert.ok(partial.length > 0 && partial.length < count(refreshed.state.CATALOG_HEADLINE)); assert.equal(refreshed.revealed('catalog-welcome-support'), '');
    refreshed.advance(3720); assert.equal(refreshed.main.props['data-complete'], true); assert.equal(refreshed.button.props.disabled, false);
    assert.equal(refreshed.revealed('catalog-welcome-support'), refreshed.state.CATALOG_SUPPORT.join('')); assert.deepEqual(refreshed.starts, []);
    assert.deepEqual(refreshed.reads, []); assert.deepEqual(refreshed.writes, []); assert.deepEqual([...storage], [[legacyWelcomeKey, 'done']]); refreshed.unmount();

    const reducedRefresh = fixture({ presentation, storage, reduced: true });
    assert.equal(reducedRefresh.main.props['data-instant'], true); assert.equal(reducedRefresh.main.props['data-complete'], true); assert.equal(reducedRefresh.timers.size, 0);
    assert.equal(reducedRefresh.button.props.disabled, false); assert.deepEqual(reducedRefresh.starts, []); reducedRefresh.unmount();
  }
});

test('unmount cancels pending typing and preference listeners without late state or navigation', () => {
  const h = fixture(); h.advance(880); assert.equal(h.timers.size, 1); assert.equal(h.mediaEvents.size, 1);
  h.unmount(); assert.equal(h.timers.size, 0); assert.equal(h.mediaEvents.size, 0); h.advance(20000); h.reduce(true);
  assert.equal(h.lateStateWrites, 0); assert.deepEqual(h.starts, []); assert.equal(h.state.hasCompletedCatalogWelcome(), false);
});
