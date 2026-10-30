import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

function fixture({ kind = 'ordinary', mobile = true, catalogue = true, view = 'projects', hidden = false, height = 700, offset = 240, maximum = 900, cardTop = 277, scale = 1, measured = true, hasCards = true } = {}) {
  const writes = [], frames = new Map(), observed = []; let id = 0, resized, disconnected = false;
  const layout = { measured, hasCards, height, cardTop };
  const marker = kind === 'public' ? 'data-public-image-catalogue' : 'data-mobile-catalogue-spacing';
  const scroller = { scrollTop: offset, scrollHeight: maximum + 912, clientHeight: 912 };
  const card = { getBoundingClientRect: () => ({ top: layout.cardTop - scroller.scrollTop, width: layout.measured ? 100 : 0, height: layout.measured ? 100 : 0 }) };
  const firstCard = () => layout.hasCards ? card : null;
  const wall = { querySelector(selector) { assert.equal(selector, '[data-preview-open][data-project-continuity-id]'); return firstCard(); } };
  const header = { getBoundingClientRect: () => ({ bottom: 249 }) };
  const profile = {
    hasAttribute: name => catalogue && view === 'projects' && name === marker,
    closest: selector => selector === '[data-presentation="mobile"]' ? mobile ? {} : null : hidden ? {} : null,
    querySelector(selector) {
      if (selector === ':scope > .profile-header-region') return header;
      if (selector === ':scope > #profile-content > .mobile-profile-wall:not([hidden])') return kind === 'ordinary' ? wall : null;
      if (selector === '[data-profile-wall-columns]') return kind === 'public' ? wall : null;
      if (selector === '[data-profile-wall-columns] [data-preview-open][data-project-continuity-id]') return kind === 'public' ? firstCard() : null;
      assert.fail(`Unexpected catalogue query: ${selector}`);
    },
    getBoundingClientRect: () => ({ top: -scroller.scrollTop, width: layout.measured ? 420 : 0, height: layout.height }),
  };
  const globals = {
    document: { scrollingElement: scroller },
    window: { innerHeight: 912, visualViewport: { height: 912, scale }, scrollTo({ top, behavior }) { writes.push({ top, behavior }); scroller.scrollTop = top; }, scrollBy({top}) { scroller.scrollTop += top; }, addEventListener() {}, removeEventListener() {} },
    getComputedStyle: () => ({overflowY:'visible',position:'sticky',top:'0px'}),
    ResizeObserver: class { constructor(callback) { resized = callback; } observe(node) { observed.push(node); } disconnect() { disconnected = true; } },
    requestAnimationFrame(callback) { const key = ++id; frames.set(key, callback); return key; },
    cancelAnimationFrame(key) { frames.delete(key); },
  };
  const api = sourceModule('src/components/profile/mobileCatalogueScroll.ts', {}, globals);
  return { ...api, profile, wall, layout, observed, scroller, writes, frames, globals,
    resize(node = profile) { assert.ok(observed.includes(node), 'The changing layout must be observed'); resized(); },
    get disconnected() { return disconnected; }, flush() { for (const callback of frames.values()) callback(); frames.clear(); } };
}

test('a fitting mobile catalogue opened at a stale offset reveals its first row', () => {
  const h = fixture(); h.repairMobileCatalogueScroll(h.profile);
  assert.deepEqual(h.writes.map(x => x.top), [0]);
  assert.equal(h.scroller.scrollTop, 0);
});

test('an active public image catalogue repairs its measured first row without an ordinary wall or marker', () => {
  const h = fixture({ kind: 'public' });
  assert.equal(h.profile.hasAttribute('data-mobile-catalogue-spacing'), false);
  assert.equal(h.profile.querySelector(':scope > #profile-content > .mobile-profile-wall:not([hidden])'), null);
  assert.equal(h.repairMobileCatalogueScroll(h.profile), true);
  assert.deepEqual(h.writes.map(value => value.top), [0]);
  assert.equal(h.scroller.scrollTop, 0);
});

test('shortening a long catalogue clamps the old document offset to the new range', () => {
  const h = fixture({ height: 1200, offset: 800, maximum: 288 }); h.repairMobileCatalogueScroll(h.profile);
  assert.equal(h.scroller.scrollTop, 288);
  assert.equal(h.writes[0].behavior, 'instant');
});

test('valid reading positions in longer catalogues remain untouched', () => {
  const h = fixture({ height: 1800, offset: 480, maximum: 888 }); h.repairMobileCatalogueScroll(h.profile);
  assert.equal(h.scroller.scrollTop, 480); assert.equal(h.writes.length, 0);
});

test('public long-wall reading positions remain valid while offsets beyond the new extent clamp', () => {
  for (const [options, expected, expectedWrites] of [
    [{ height: 1800, offset: 480, maximum: 888 }, 480, 0],
    [{ height: 1200, offset: 800, maximum: 288 }, 288, 1],
  ]) {
    const h = fixture({ kind: 'public', ...options });
    assert.equal(h.repairMobileCatalogueScroll(h.profile), false);
    assert.equal(h.scroller.scrollTop, expected);
    assert.equal(h.writes.length, expectedWrites);
    if (expectedWrites) assert.equal(h.writes[0].behavior, 'instant');
  }
});

test('visible first rows and elastic overscroll do not trigger resets', () => {
  for (const kind of ['ordinary', 'public']) for (const options of [{ offset: 0 }, { offset: -30 }, { offset: 20 }]) {
    const h = fixture({ kind, ...options }); h.repairMobileCatalogueScroll(h.profile); assert.equal(h.writes.length, 0);
  }
});

test('public Timeline, Portals, hidden screens, WEB, browser zoom and unpainted or empty walls are excluded', () => {
  for (const options of [
    { catalogue: false }, { view: 'journey' }, { view: 'portals' }, { mobile: false },
    { hidden: true }, { measured: false }, { hasCards: false }, { scale: 1.5 },
  ]) {
    const h = fixture({ kind: 'public', ...options });
    assert.equal(h.repairMobileCatalogueScroll(h.profile), false);
    assert.equal(h.scroller.scrollTop, 240);
    assert.deepEqual(h.writes, []);
  }
});

test('public first-card arrival repairs after query readiness even when only the wall changes height', () => {
  const h = fixture({ kind: 'public', height: 912, measured: false, hasCards: false });
  assert.equal(h.repairMobileCatalogueScroll(h.profile), false);
  const stop = h.observeMobileCatalogueScroll(h.profile);
  assert.deepEqual(h.observed, [h.profile, h.wall], 'Observe the wall as well as its min-height-constrained profile');
  h.resize(h.wall); h.flush(); assert.equal(h.writes.length, 0, 'Do not repair while the first card has no geometry');
  h.layout.measured = true; h.layout.hasCards = true;
  h.resize(h.wall); h.resize(h.wall); assert.equal(h.frames.size, 1);
  h.flush();
  assert.equal(h.layout.height, 912, 'A viewport-height root need not resize when dense cards appear');
  assert.equal(h.scroller.scrollTop, 0);
  assert.deepEqual(h.writes.map(value => value.top), [0]);
  h.resize(h.wall); h.flush(); assert.equal(h.writes.length, 1, 'A later size notification cannot replay restoration');
  stop();
});

test('WEB, hidden screens, non-catalogue views, unmeasured cards and browser zoom are excluded', () => {
  for (const options of [{ mobile: false }, { catalogue: false }, { hidden: true }, { measured: false }, { scale: 1.5 }]) {
    const h = fixture(options); h.repairMobileCatalogueScroll(h.profile); assert.equal(h.writes.length, 0);
  }
});

test('layout changes repair once per frame and cleanup cancels pending authority', () => {
  for (const kind of ['ordinary', 'public']) {
  const h = fixture({ kind }); const stop = h.observeMobileCatalogueScroll(h.profile);
  h.resize(); h.resize(); assert.equal(h.frames.size, 1); h.flush(); assert.equal(h.scroller.scrollTop, 0);
  h.scroller.scrollTop = 240; h.resize(); const selected = [...h.frames.values()][0]; stop(); h.flush(); selected();
  assert.equal(h.disconnected, true); assert.equal(h.scroller.scrollTop, 240); assert.equal(h.writes.length, 1);
  }
});

test('a density anchor cannot restore a later project over a fitting catalogue repair', () => {
  for (const kind of ['ordinary', 'public']) {
  const h = fixture({kind,offset:800});
  const later = {dataset:{projectContinuityId:'later'},closest:()=>null,getBoundingClientRect:()=>({top:500-h.scroller.scrollTop,bottom:600-h.scroller.scrollTop,width:100,height:100})};
  const surface = {isConnected:true,closest:selector=>selector==='[data-profile-page]'?h.profile:null,getBoundingClientRect:()=>({width:420}),querySelectorAll:()=>[later]};
  const browsing = sourceModule('src/components/profile/ProjectPageBrowsingContext.tsx', {react:React,'./mobileCatalogueScroll':h},h.globals);
  browsing.restoreCatalogueDensityAnchor(surface,{projectId:'later',offset:0,scroller:null});
  h.repairMobileCatalogueScroll(h.profile); h.flush();
  assert.equal(h.scroller.scrollTop,0,'The old later-project anchor must surrender to the fitting catalogue.');
  assert.equal(h.frames.size,0);
  }
});
