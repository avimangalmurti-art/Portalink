import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

function fixture({ mobile = true, catalogue = true, hidden = false, height = 700, offset = 240, maximum = 900, cardTop = 277, scale = 1, measured = true } = {}) {
  const writes = [], frames = new Map(); let id = 0, resized, disconnected = false;
  const scroller = { scrollTop: offset, scrollHeight: maximum + 912, clientHeight: 912 };
  const card = { getBoundingClientRect: () => ({ top: cardTop - scroller.scrollTop, width: measured ? 100 : 0, height: measured ? 100 : 0 }) };
  const wall = { querySelector: () => card };
  const header = { getBoundingClientRect: () => ({ bottom: 249 }) };
  const profile = {
    hasAttribute: () => catalogue,
    closest: selector => selector === '[data-presentation="mobile"]' ? mobile ? {} : null : hidden ? {} : null,
    querySelector: selector => selector.includes('mobile-profile-wall') ? wall : header,
    getBoundingClientRect: () => ({ top: -scroller.scrollTop, width: measured ? 420 : 0, height }),
  };
  const globals = {
    document: { scrollingElement: scroller },
    window: { innerHeight: 912, visualViewport: { height: 912, scale }, scrollTo({ top, behavior }) { writes.push({ top, behavior }); scroller.scrollTop = top; }, scrollBy({top}) { scroller.scrollTop += top; }, addEventListener() {}, removeEventListener() {} },
    getComputedStyle: () => ({overflowY:'visible',position:'sticky',top:'0px'}),
    ResizeObserver: class { constructor(callback) { resized = callback; } observe() {} disconnect() { disconnected = true; } },
    requestAnimationFrame(callback) { const key = ++id; frames.set(key, callback); return key; },
    cancelAnimationFrame(key) { frames.delete(key); },
  };
  const api = sourceModule('src/components/profile/mobileCatalogueScroll.ts', {}, globals);
  return { ...api, profile, scroller, writes, frames, globals, resize: () => resized(), get disconnected() { return disconnected; }, flush() { for (const callback of frames.values()) callback(); frames.clear(); } };
}

test('a fitting mobile catalogue opened at a stale offset reveals its first row', () => {
  const h = fixture(); h.repairMobileCatalogueScroll(h.profile);
  assert.deepEqual(h.writes.map(x => x.top), [0]);
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

test('visible first rows and elastic overscroll do not trigger resets', () => {
  for (const options of [{ offset: 0 }, { offset: -30 }, { offset: 20 }]) {
    const h = fixture(options); h.repairMobileCatalogueScroll(h.profile); assert.equal(h.writes.length, 0);
  }
});

test('WEB, hidden screens, non-catalogue views, unmeasured cards and browser zoom are excluded', () => {
  for (const options of [{ mobile: false }, { catalogue: false }, { hidden: true }, { measured: false }, { scale: 1.5 }]) {
    const h = fixture(options); h.repairMobileCatalogueScroll(h.profile); assert.equal(h.writes.length, 0);
  }
});

test('layout changes repair once per frame and cleanup cancels pending authority', () => {
  const h = fixture(); const stop = h.observeMobileCatalogueScroll(h.profile);
  h.resize(); h.resize(); assert.equal(h.frames.size, 1); h.flush(); assert.equal(h.scroller.scrollTop, 0);
  h.scroller.scrollTop = 240; h.resize(); const selected = [...h.frames.values()][0]; stop(); h.flush(); selected();
  assert.equal(h.disconnected, true); assert.equal(h.scroller.scrollTop, 240); assert.equal(h.writes.length, 1);
});

test('a density anchor cannot restore a later project over a fitting catalogue repair', () => {
  const h = fixture({offset:800});
  const later = {dataset:{projectContinuityId:'later'},closest:()=>null,getBoundingClientRect:()=>({top:500-h.scroller.scrollTop,bottom:600-h.scroller.scrollTop,width:100,height:100})};
  const surface = {isConnected:true,closest:selector=>selector==='[data-profile-page]'?h.profile:null,getBoundingClientRect:()=>({width:420}),querySelectorAll:()=>[later]};
  const browsing = sourceModule('src/components/profile/ProjectPageBrowsingContext.tsx', {react:React,'./mobileCatalogueScroll':h},h.globals);
  browsing.restoreCatalogueDensityAnchor(surface,{projectId:'later',offset:0,scroller:null});
  h.repairMobileCatalogueScroll(h.profile); h.flush();
  assert.equal(h.scroller.scrollTop,0,'The old later-project anchor must surrender to the fitting catalogue.');
  assert.equal(h.frames.size,0);
});
