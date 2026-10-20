import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

// Executes the real public-reader return hook with committed route entries and
// document geometry. Native history traversal/layout still need browser QA.
function harness({ enabled = true, index = 4, initialProject = null } = {}) {
  const slots = [], frames = new Map(), listeners = new Map(), documentListeners = new Map(), navigations = [], continuity = [], writes = [], focus = [];
  let cursor = 0, pending = [], passive = [], frameId = 0, result, maximum = Infinity, cards = [];
  const state = { enabled, scope: 'creator:guest', projectId: initialProject, catalogueReady: !initialProject, otherScreen: false,
    location: { key: initialProject ? 'direct' : 'catalogue', pathname: initialProject ? '/creator/c/art/work' : '/creator', search: '?view=projects', hash: '#work', state: null } };
  const window = {
    scrollX: 0, scrollY: 0, innerWidth: 420, innerHeight: 912, history: { state: { idx: index } },
    scrollTo(value) { writes.push(value); this.scrollX = value.left ?? this.scrollX; this.scrollY = Math.min(maximum, value.top ?? this.scrollY); },
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); if (!listeners.get(type)?.size) listeners.delete(type); },
  };
  class Element {
    constructor(name, parent = null, top = 0) { this.name = name; this.parent = parent; this.isConnected = true; this.top = top; this.height = 80; this.width = 180; this.left = 24; this.hidden = false; this.isButton = name === 'opener'; this.dataset = {}; }
    closest(selector) {
      if (selector === '[hidden], [inert], [aria-hidden="true"]') return this.hidden ? this : null;
      if (selector === 'button, a[href]') return this.isButton ? this : this.parent?.closest(selector) ?? null;
      return selector === 'main' ? main : null;
    }
    getBoundingClientRect() { const top = this.top - window.scrollY; return { top, bottom: top + this.height, left: this.left, right: this.left + this.width, width: this.width, height: this.height }; }
    contains(node) { return Boolean(node && (node === this || node.parent && this.contains(node.parent))); }
    matches() { return Boolean(this.dataset.projectContinuityId); }
    focus(options) { if (this.inert) return; document.activeElement = this; focus.push([this.name, options]); }
    querySelector(selector) { return selector === 'h1[tabindex="-1"]' ? heading : null; }
    querySelectorAll() { return cards.filter(card => card.isConnected && this.contains(card)); }
  }
  const main = new Element('main'), root = new Element('root', main), heading = new Element('heading', root);
  const opener = new Element('opener', root, 980), child = new Element('thumbnail', opener), alternate = new Element('alternate', root, 1180);
  opener.dataset.projectContinuityId = 'work'; alternate.dataset.projectContinuityId = 'other'; cards = [opener, alternate];
  const unrelated = new Element('unrelated-control', root, 1050); unrelated.isButton = true;
  const document = { activeElement: null, querySelector: selector => selector === '#app-viewport main' ? main : selector === '[data-public-portfolio-grid]' ? root : null,
    addEventListener(type, listener) { if (!documentListeners.has(type)) documentListeners.set(type, new Set()); documentListeners.get(type).add(listener); },
    removeEventListener(type, listener) { documentListeners.get(type)?.delete(listener); if (!documentListeners.get(type)?.size) documentListeners.delete(type); },
  };
  const equal = (a, b) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
  const react = { ...React,
    useMemo(fn, dependencies) {
      const index = cursor++;
      if (!equal(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, value: fn() };
      return slots[index].value;
    },
    useLayoutEffect(effect, dependencies) {
      const index = cursor++;
      if (!equal(slots[index]?.dependencies, dependencies)) pending.push(() => {
        slots[index]?.cleanup?.(); slots[index] = { dependencies, cleanup: effect() };
      });
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!equal(slots[index]?.dependencies, dependencies)) passive.push(() => {
        slots[index]?.cleanup?.(); slots[index] = { dependencies, cleanup: effect() };
      });
    },
  };
  const { useMobileProjectReturn, restoreVisitorCatalogue } = sourceModule('src/visitor/useMobileProjectReturn.ts', {
    react, '../utils/projectContinuity': { beginProjectContinuity: id => continuity.push(id) },
  }, { window, document, Element, HTMLElement: Element,
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id) });
  const render = afterLayout => { cursor = 0; pending = []; passive = []; result = useMobileProjectReturn({ ...state, navigate: (...args) => navigations.push(args) }); pending.forEach(effect => effect()); afterLayout?.(); passive.forEach(effect => effect()); return result; };
  const commit = (projectId, index, key = projectId ? `reader:${projectId}` : 'catalogue', afterLayout) => {
    state.projectId = projectId; state.catalogueReady = !projectId; state.otherScreen = false; root.hidden = !state.catalogueReady;
    state.location = { ...state.location, key, pathname: projectId ? `/creator/c/art/${projectId}` : '/creator' };
    window.history.state = { idx: index }; return render(afterLayout);
  };
  const paint = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  const settle = () => { for (let i = 0; i < 40 && frames.size; i++) paint(); };
  render();
  return { state, window, document, root, main, heading, opener, child, alternate, unrelated, frames, listeners, documentListeners, navigations, continuity, writes, focus,
    render, commit, paint, settle, restoreVisitorCatalogue, get api() { return result; },
    scroll(y, x = 0) { window.scrollY = y; window.scrollX = x; }, maximum(value) { maximum = value; },
    recreateCard(id, top = 980) { const card = new Element(`recreated:${id}`, root, top); card.dataset.projectContinuityId = id; card.isButton = true; cards.push(card); return card; },
    emit(type) { [...listeners.get(type) ?? []].forEach(listener => listener({ type })); },
    beforeNavigation() { [...documentListeners.get('portalink-before-navigation') ?? []].forEach(listener => listener({ type: 'portalink-before-navigation' })); },
    other(path = '/settings', index = 5) { state.otherScreen = true; state.projectId = null; state.catalogueReady = false; root.hidden = true; state.location = { ...state.location, key: `other:${path}`, pathname: path }; window.history.state = { idx: index }; return render(); },
    transientListeners() { return [...listeners.keys()].filter(type => type !== 'scroll').length; },
    dispose() { slots.forEach(slot => slot.cleanup?.()); },
    open(id = 'work') { result.captureOpener({ target: child }); result.open(`/creator/c/art/${id}`, id); },
  };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('MOBILE Close traverses exactly once to a captured catalogue entry and restores its anchor and opener focus', () => {
  const h = harness(); h.scroll(720, 2); h.open();
  assert.deepEqual(plain(h.navigations), [['/creator/c/art/work', { replace: false }]]);
  h.commit('work', 5); assert.equal(h.window.scrollY, 0); assert.deepEqual(plain(h.focus.at(-1)), ['main', { preventScroll: true }]);
  assert.equal(h.api.close('/creator'), true); assert.equal(h.api.close('/creator'), true);
  assert.deepEqual(plain(h.navigations.at(-1)), [-1]); assert.equal(h.navigations.length, 2, 'A second Close cannot skip another history entry.');
  h.commit(null, 4); h.settle();
  assert.equal(h.window.scrollY, 720); assert.equal(h.window.scrollX, 2);
  assert.deepEqual(plain(h.focus.at(-1)), ['opener', { preventScroll: true }]);
  assert.equal(h.frames.size, 0); assert.equal(h.transientListeners(), 0);
  assert.equal(h.listeners.get('scroll')?.size, 1); assert.equal(h.documentListeners.get('portalink-before-navigation')?.size, 1);
  h.dispose(); assert.equal(h.listeners.size, 0); assert.equal(h.documentListeners.size, 0);
});

test('browser POP restores the same catalogue without needing the Close handler', () => {
  const h = harness(); h.scroll(720); h.open(); h.commit('work', 5);
  h.commit(null, 4); h.settle();
  assert.equal(h.window.scrollY, 720); assert.equal(h.document.activeElement, h.opener);
  assert.equal(h.navigations.length, 1, 'POP restoration must not introduce an extra PUSH or replacement.');
  h.scroll(811); h.render(); h.paint(); assert.equal(h.window.scrollY, 811, 'An ordinary render cannot replay the saved position.'); h.dispose();
});

test('Forward revisits the same reader entry with reader focus after catalogue popup cleanup releases inert', () => {
  const h = harness(); h.scroll(720); h.open(); h.commit('work', 5, 'same-reader');
  h.commit(null, 4); h.settle(); assert.equal(h.document.activeElement, h.opener);
  h.main.inert = true;
  h.commit('work', 5, 'same-reader', () => {
    assert.equal(h.document.activeElement, h.opener, 'Layout commits do not focus an inert reader before modal cleanup.');
    h.main.inert = false;
  });
  assert.equal(h.window.scrollY, 0, 'A reused reader history key resets the document to its reader position.');
  assert.equal(h.document.activeElement, h.main); assert.deepEqual(plain(h.focus.at(-1)), ['main', { preventScroll: true }]);
  h.commit(null, 4); h.settle();
  assert.equal(h.window.scrollY, 720); assert.equal(h.document.activeElement, h.opener);
  assert.equal(h.navigations.length, 1, 'Back/Forward commits do not synthesize another navigation entry.'); h.dispose();
});

test('ordinary Settings or collaboration return preserves the visible catalogue position without assigning project focus', () => {
  for (const [path, checkpoint] of [['/settings', 'scroll'], ['/creator/collaboration', 'navigation']]) {
    const h = harness(); h.scroll(720, 2); h.document.activeElement = h.unrelated;
    if (checkpoint === 'scroll') h.emit('scroll'); else h.beforeNavigation();
    const focusCount = h.focus.length;
    h.other(path); h.scroll(0); h.commit(null, 4); h.settle();
    assert.equal(h.window.scrollY, 720, path); assert.equal(h.window.scrollX, 2, path);
    assert.equal(h.focus.length, focusCount, 'An ordinary return does not replay project opener or heading focus.');
    assert.equal(h.document.activeElement, h.unrelated); h.dispose();
    assert.equal(h.listeners.size, 0); assert.equal(h.documentListeners.size, 0);
  }
});

test('ordinary return after reading preserves the latest catalogue scroll rather than the previous project origin', () => {
  const h = harness(); h.scroll(720); h.open(); h.commit('work', 5); h.commit(null, 4); h.settle();
  h.scroll(960); h.beforeNavigation(); const focusCount = h.focus.length;
  h.other('/settings'); h.scroll(0); h.commit(null, 4); h.settle();
  assert.equal(h.window.scrollY, 960); assert.equal(h.focus.length, focusCount);
  assert.notEqual(h.window.scrollY, 720, 'The earlier project origin is used only for a return from its reader.'); h.dispose();
});

test('Collaboration Back may PUSH a new catalogue key while retaining its latest same-path position', () => {
  const h = harness(); h.scroll(720, 2); h.beforeNavigation(); h.document.activeElement = h.unrelated;
  const focusCount = h.focus.length;
  h.other('/creator/collaboration', 5); h.scroll(0); h.commit(null, 6, 'collaboration-back'); h.settle();
  assert.equal(h.window.scrollY, 720); assert.equal(h.window.scrollX, 2);
  assert.equal(h.focus.length, focusCount); assert.equal(h.document.activeElement, h.unrelated);
  assert.equal(h.navigations.length, 0, 'Restoration preserves the existing Collaboration navigation contract.');
  h.scroll(850); h.beforeNavigation(); h.commit(null, 7, 'unrelated-new-entry'); h.settle();
  assert.equal(h.window.scrollY, 0, 'The pathname fallback is restricted to an actual return from another screen.'); h.dispose();
});

test('same-path fallback chooses the latest updated position after revisiting an older history entry', () => {
  const h = harness(); h.scroll(400); h.beforeNavigation();
  h.commit(null, 5, 'newer-catalogue'); h.scroll(800); h.beforeNavigation();
  h.commit(null, 4, 'catalogue'); h.settle(); assert.equal(h.window.scrollY, 400);
  h.scroll(600); h.beforeNavigation();
  h.other('/creator/collaboration', 5); h.scroll(0); h.commit(null, 6, 'collaboration-back'); h.settle();
  assert.equal(h.window.scrollY, 600, 'An updated older entry is more recent than the later-created entry at 800px.'); h.dispose();
});

test('keyboard activation captures the focused project and an off-screen source falls back to a visible catalogue anchor', () => {
  const keyboard = harness(); keyboard.scroll(720); keyboard.document.activeElement = keyboard.opener;
  keyboard.api.open('/creator/c/art/work', 'work'); keyboard.commit('work', 5); keyboard.commit(null, 4); keyboard.settle();
  assert.equal(keyboard.window.scrollY, 720); assert.equal(keyboard.document.activeElement, keyboard.opener); keyboard.dispose();
  const offscreen = harness(); offscreen.scroll(720); offscreen.opener.top = 2400; offscreen.open(); offscreen.commit('work', 5);
  offscreen.alternate.top += 100; offscreen.commit(null, 4); offscreen.settle();
  assert.equal(offscreen.window.scrollY, 820, 'A visible retained anchor preserves the viewport rather than scrolling to an off-screen opener.');
  assert.equal(offscreen.document.activeElement, offscreen.heading); offscreen.dispose();
});

test('an earlier unrelated capture expires before a sibling popup opens a project', async () => {
  const h = harness(); h.scroll(720); h.document.activeElement = h.unrelated;
  h.api.captureOpener({ target: h.unrelated });
  await Promise.resolve();
  h.api.open('/creator/c/art/work', 'work'); h.commit('work', 5); h.commit(null, 4); h.settle();
  assert.equal(h.window.scrollY, 720);
  assert.equal(h.document.activeElement, h.heading, 'An unrelated focused control cannot become the project opener after the original activation expires.');
  assert.equal(h.focus.some(([name]) => name === 'unrelated-control'), false); h.dispose();
});

test('selecting another project replaces the reader entry while preserving its original catalogue return', () => {
  const h = harness(); h.scroll(720); h.open(); h.commit('work', 5);
  h.api.open('/creator/c/art/next', 'next'); h.api.open('/creator/c/art/ignored', 'ignored');
  assert.deepEqual(plain(h.navigations.at(-1)), ['/creator/c/art/next', { replace: true }]);
  assert.equal(h.navigations.length, 2); h.commit('next', 5); h.api.close('/creator');
  assert.deepEqual(plain(h.navigations.at(-1)), [-1]); h.commit(null, 4); h.settle();
  assert.equal(h.window.scrollY, 720); assert.equal(h.document.activeElement, h.opener); h.dispose();
});

test('a direct project link and a mismatched history index replace the catalogue instead of traversing outside it', () => {
  for (const index of [0, 9, undefined, -1, 1.5]) {
    const h = harness({ initialProject: 'work', index });
    h.state.location.state = { origin: '/creator', idx: 8 }; h.render(); h.api.close('/creator');
    assert.deepEqual(plain(h.navigations), [['/creator', { replace: true }]], String(index));
    h.commit(null, typeof index === 'number' ? index : 0, 'replacement'); h.settle();
    assert.equal(h.document.activeElement, h.heading); assert.equal(h.window.scrollY, 0); h.dispose();
  }
  const h = harness(); h.open(); h.commit('work', 5); h.window.history.state.idx = 12; h.api.close('/creator');
  assert.deepEqual(plain(h.navigations.at(-1)), ['/creator', { replace: true }]); h.dispose();
});

test('account, creator and presentation scope changes discard previous in-memory return authority', () => {
  for (const scope of ['other:guest', 'creator:member']) {
    const h = harness(); h.open(); h.commit('work', 5); h.state.scope = scope; h.render(); h.api.close('/creator');
    assert.deepEqual(plain(h.navigations.at(-1)), ['/creator', { replace: true }]); h.dispose();
  }
  const h = harness(); h.open(); h.commit('work', 5); h.state.enabled = false; h.render();
  assert.equal(h.api.close('/creator'), false); h.api.open('/creator/c/art/next', 'next');
  assert.deepEqual(plain(h.navigations.at(-1)), ['/creator/c/art/next']);
  h.state.enabled = true; h.render(); h.api.close('/creator');
  assert.deepEqual(plain(h.navigations.at(-1)), ['/creator', { replace: true }]); h.dispose();
});

test('WEB leaves its existing navigation, document position and focus untouched', () => {
  const h = harness({ enabled: false }); h.scroll(720); const count = h.writes.length;
  h.open(); h.commit('work', 5); assert.equal(h.api.close('/creator'), false);
  assert.deepEqual(plain(h.navigations), [['/creator/c/art/work']]);
  assert.deepEqual(h.continuity, ['work']); assert.equal(h.window.scrollY, 720);
  assert.equal(h.writes.length, count); assert.deepEqual(h.focus, []); assert.equal(h.frames.size, 0); h.dispose();
});

test('missing or unpainted opener restores the recorded position and focuses the catalogue heading without scrolling it', () => {
  for (const mode of ['detached', 'zero-size', 'hidden', 'outside-root']) {
    const h = harness(); h.scroll(720); h.open(); h.commit('work', 5);
    if (mode === 'detached') h.opener.isConnected = false;
    if (mode === 'zero-size') { h.opener.width = 0; h.opener.height = 0; }
    if (mode === 'hidden') h.opener.hidden = true;
    if (mode === 'outside-root') h.opener.parent = null;
    h.commit(null, 4); h.settle();
    assert.equal(h.window.scrollY, 720, mode); assert.equal(h.document.activeElement, h.heading, mode);
    assert.deepEqual(plain(h.focus.at(-1)[1]), { preventScroll: true }); h.dispose();
  }
});

test('a measured wall may recreate the same project card without losing its anchor or focus identity', () => {
  const h = harness(); h.scroll(720); h.open(); h.commit('work', 5);
  h.opener.isConnected = false;
  h.commit(null, 4);
  const unrelated = h.recreateCard('unrelated', 1140);
  const recreated = h.recreateCard('work', 1140);
  h.settle();
  assert.equal(h.window.scrollY, 880, 'The recreated source retains the saved 260px viewport anchor after its layout moves.');
  assert.equal(recreated.getBoundingClientRect().top, 260);
  assert.equal(h.document.activeElement, recreated, 'Focus resolves the same project ID instead of the detached DOM object.');
  assert.notEqual(h.document.activeElement, unrelated); assert.notEqual(h.document.activeElement, h.alternate);
  assert.deepEqual(plain(h.focus.at(-1)[1]), { preventScroll: true }); h.dispose();
});

test('a removed source cannot substitute a different recreated project card as its opener', () => {
  const h = harness(); h.scroll(720); h.open(); h.commit('work', 5); h.opener.isConnected = false;
  h.recreateCard('different', 1140); h.commit(null, 4); h.settle();
  assert.equal(h.window.scrollY, 720); assert.equal(h.document.activeElement, h.heading);
  assert.equal(h.focus.some(([name]) => name.startsWith('recreated:')), false); h.dispose();
});

test('a shifted retained source anchors the return instead of relying only on an outdated pixel offset', () => {
  const h = harness(); h.scroll(720); h.open(); h.commit('work', 5); h.opener.top += 160;
  h.commit(null, 4); h.settle();
  assert.equal(h.window.scrollY, 880); assert.equal(h.opener.getBoundingClientRect().top, 260);
  assert.equal(h.document.activeElement, h.opener); h.dispose();
});

test('restoration waits through clamped layout, is bounded, and surrenders to touch, wheel or keyboard input', () => {
  const delayed = harness(); delayed.scroll(720); delayed.open(); delayed.commit('work', 5); delayed.maximum(0); delayed.commit(null, 4);
  delayed.paint(); delayed.paint(); assert.equal(delayed.frames.size, 1);
  delayed.maximum(Infinity); delayed.settle(); assert.equal(delayed.window.scrollY, 720); delayed.dispose();
  const bounded = harness(); bounded.scroll(720); bounded.open(); bounded.commit('work', 5); bounded.maximum(0); bounded.commit(null, 4); bounded.settle();
  assert.equal(bounded.frames.size, 0); assert.equal(bounded.transientListeners(), 0); assert.ok(bounded.writes.length <= 40); bounded.dispose();
  for (const type of ['pointerdown', 'touchstart', 'wheel', 'keydown']) {
    const h = harness(); h.scroll(720); h.open(); h.commit('work', 5); h.maximum(0); h.commit(null, 4);
    const stale = [...h.frames.values()][0]; h.emit(type); assert.equal(h.frames.size, 0, type);
    h.maximum(Infinity); h.scroll(900); const count = h.writes.length; stale?.(); h.paint();
    assert.equal(h.window.scrollY, 900, type); assert.equal(h.writes.length, count, type); assert.equal(h.transientListeners(), 0, type); h.dispose();
    assert.equal(h.listeners.size, 0, type); assert.equal(h.documentListeners.size, 0, type);
  }
});

test('leaving or unmounting the catalogue cancels pending restoration before it can overwrite another screen', () => {
  for (const mode of ['leave', 'unmount', 'detached']) {
    const h = harness(); h.scroll(720); h.open(); h.commit('work', 5); h.maximum(0); h.commit(null, 4);
    if (mode === 'leave') h.commit('next', 5);
    if (mode === 'unmount') h.dispose();
    if (mode === 'detached') { h.root.isConnected = false; h.paint(); }
    const count = h.writes.length; h.maximum(Infinity); h.scroll(900); h.paint();
    assert.equal(h.writes.length, count, mode); assert.equal(h.window.scrollY, 900, mode); assert.equal(h.frames.size, 0, mode); h.dispose();
  }
});
