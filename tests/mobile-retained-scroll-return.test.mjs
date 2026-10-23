import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

// Run the actual ScreenLayer function with controlled commit, DOM offsets and
// animation frames. This checks lifecycle ownership, not browser scroll layout.
const path = 'src/presentation/AppScreenLayers.tsx';
const file = ts.createSourceFile(path, readFileSync(new URL('../' + path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ScreenLayer');
assert.ok(component?.body, 'The production ScreenLayer is exercised directly');
const source = ts.transpileModule(`exports.ScreenLayer = ${component.getText(file)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;

function harness({ mobile = true, active = true, restored = false } = {}) {
  const slots = [], frames = new Map(), writes = [], cancelled = [];
  let cursor = 0, pending = [], frameId = 0, dismissed = 0, tree;
  const listeners = () => {
    const entries = new Map();
    return {
      entries,
      addEventListener(type, callback) { if (!entries.has(type)) entries.set(type, new Set()); entries.get(type).add(callback); },
      removeEventListener(type, callback) { entries.get(type)?.delete(callback); if (!entries.get(type)?.size) entries.delete(type); },
      emit(type, extra = {}) { for (const callback of [...(entries.get(type) ?? [])]) callback({ type, isTrusted: true, ...extra }); },
    };
  };
  const docEvents = listeners(), windowEvents = listeners();
  const node = (id, top = 0, left = 0, parentElement = null) => {
    let y = top, x = left, maxTop = Infinity, maxLeft = Infinity;
    return { id, parentElement, dataset: {}, isConnected: true,
      get scrollHeight() { return Number.isFinite(maxTop) ? maxTop + 912 : 5000; }, clientHeight: 912,
      get scrollWidth() { return Number.isFinite(maxLeft) ? maxLeft + 420 : 5000; }, clientWidth: 420,
      get scrollTop() { return y; }, set scrollTop(value) { y = Math.min(value, maxTop); writes.push([id, 'top', value]); },
      get scrollLeft() { return x; }, set scrollLeft(value) { x = Math.min(value, maxLeft); writes.push([id, 'left', value]); },
      raw(top, left = x) { y = top; x = left; },
      maximum(top, left = Infinity) { maxTop = top; maxLeft = left; },
    };
  };
  const documentNode = node('document', 725, 3), body = node('body', 0, 0, documentNode);
  const workspace = node('workspace', 7, 2, body), viewport = node('viewport', 9, 4, workspace);
  const host = node('layer', 11, 5, viewport), feed = node('feed', 80, 6), nested = node('nested', 23, 8);
  const material = node('material'); material.dataset.mobileHeaderUnderlap = 'true';
  host.querySelectorAll = selector => selector === '[data-mobile-header-underlap]' ? [material] : [feed, nested];
  const nodes = [documentNode, body, workspace, viewport, host, feed, nested];
  const useRef = initial => { const index = cursor++; return slots[index] ??= { current: initial }; };
  const useLayoutEffect = (run, deps) => {
    const index = cursor++, previous = slots[index];
    if (previous && previous.deps.length === deps.length && deps.every((value, position) => Object.is(value, previous.deps[position]))) return;
    pending.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: run() }; });
  };
  const exports = {};
  vm.runInNewContext(source, { exports, React, useRef, useLayoutEffect,
    document: { ...docEvents, scrollingElement: documentNode }, window: windowEvents,
    finishPullDismiss() { dismissed++; },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { cancelled.push(id); frames.delete(id); },
    MobileBackScope: 'mobile-back-scope', UNSAFE_LocationContext: { Provider: 'location-context' },
  });
  let props = { mobile, active, layer: { phase: 'screen-active', retained: false, underlay: false, restored,
    snapshot: { mainClassName: 'overflow-y-auto', ariaLabel: 'Home', content: 'actual retained content' } },
    mainContentRef: { current: null }, onScroll() {}, navigation: undefined };
  function render(changes = {}) {
    props = { ...props, ...changes, layer: { ...props.layer, ...changes.layer } };
    cursor = 0; pending = [];
    tree = exports.ScreenLayer(props);
    tree.ref(host);
    pending.forEach(commit => commit());
    return tree;
  }
  return { nodes, host, feed, nested, documentNode, material, docEvents, windowEvents, frames, writes, cancelled, render,
    get dismissed() { return dismissed; }, get tree() { return tree; },
    offsets() { return nodes.map(item => [item.id, item.scrollTop, item.scrollLeft]); },
    reset() { nodes.forEach(item => item.raw(0, 0)); },
    capture() { docEvents.emit('portalink-before-navigation'); },
    leave() { render({ active: false, layer: { retained: true, phase: 'screen-retained' } }); },
    return() { render({ active: true, layer: { retained: false, restored: true, phase: 'screen-active' } }); },
    paint() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('returning MOBILE layer waits for delayed grid height, restores captured offsets and stops after stable completion', () => {
  const h = harness(); h.render(); const saved = h.offsets();
  h.capture(); h.leave(); h.reset();
  h.windowEvents.emit('popstate'); // The inactive layer cannot replace its own saved Home position.
  h.documentNode.maximum(0);
  h.return();
  assert.equal(h.documentNode.scrollTop, 0, 'The first commit cannot scroll a viewport-height grid');
  assert.equal(h.frames.size, 1); assert.equal(h.dismissed, 1);
  h.paint(); h.paint(); h.paint();
  assert.equal(h.documentNode.scrollTop, 0); assert.equal(h.frames.size, 1, 'Clamping must not be mistaken for a completed return');
  h.documentNode.maximum(Infinity);
  h.paint(); assert.deepEqual(h.offsets(), saved);
  assert.equal(h.frames.size, 1, 'One successful frame still awaits a stable second frame');
  h.paint(); assert.equal(h.frames.size, 0);
  h.documentNode.raw(930); h.feed.raw(110);
  const writeCount = h.writes.length;
  h.paint(); h.render(); h.paint();
  assert.equal(h.documentNode.scrollTop, 930); assert.equal(h.feed.scrollTop, 110);
  assert.equal(h.writes.length, writeCount, 'Later reading and ordinary renders retain user-controlled offsets');
  h.dispose();
});

test('leaving a restored MOBILE layer cancels its pending correction frame', () => {
  const h = harness(); h.render(); h.capture(); h.leave(); h.reset(); h.return();
  assert.equal(h.frames.size, 1);
  h.leave(); assert.equal(h.frames.size, 0); assert.equal(h.cancelled.length, 1);
  h.reset(); const writeCount = h.writes.length; h.paint();
  assert.equal(h.documentNode.scrollTop, 0); assert.equal(h.writes.length, writeCount);
  h.dispose();
});

test('unmounting a restored MOBILE layer cancels correction and all capture listeners', () => {
  const h = harness(); h.render(); h.capture(); h.leave(); h.return();
  assert.equal(h.frames.size, 1); h.dispose();
  assert.equal(h.frames.size, 0); assert.equal(h.docEvents.entries.size, 0); assert.equal(h.windowEvents.entries.size, 0);
  h.reset(); const writeCount = h.writes.length; h.paint();
  assert.equal(h.writes.length, writeCount);
});

test('fresh and inactive MOBILE destinations never run retained offset restoration', () => {
  const fresh = harness(); fresh.render(); fresh.capture(); fresh.reset(); fresh.render(); fresh.paint();
  assert.equal(fresh.dismissed, 0); assert.equal(fresh.frames.size, 0); assert.deepEqual(fresh.writes, []);
  const inactive = harness({ active: false, restored: true }); inactive.render(); inactive.capture(); inactive.paint();
  assert.equal(inactive.dismissed, 0); assert.equal(inactive.frames.size, 0); assert.deepEqual(inactive.writes, []);
  fresh.dispose(); inactive.dispose();
});

test('WEB keeps native contained offsets and never installs the MOBILE restore/capture effects', () => {
  const h = harness({ mobile: false, restored: true }); h.render(); const before = h.offsets();
  h.capture(); h.windowEvents.emit('popstate'); h.paint(); h.render({ active: false });
  assert.deepEqual(h.offsets(), before); assert.deepEqual(h.writes, []); assert.equal(h.dismissed, 0);
  assert.equal(h.frames.size, 0); assert.equal(h.docEvents.entries.size, 0); assert.equal(h.windowEvents.entries.size, 0);
  h.dispose();
});

test('a subsequent MOBILE visit captures the updated Home position instead of replaying an earlier return', () => {
  const h = harness(); h.render(); h.capture(); h.leave(); h.return(); h.paint(); h.paint();
  h.documentNode.raw(1030, 0); h.feed.raw(160, 2); const newer = h.offsets();
  h.capture(); h.leave(); h.reset(); h.return(); h.reset(); h.paint(); h.paint();
  assert.deepEqual(h.offsets(), newer); assert.equal(h.frames.size, 0); h.dispose();
});

test('MOBILE delayed restoration has a bounded frame budget when the destination never grows tall enough', () => {
  const h = harness(); h.render(); h.capture(); h.leave(); h.reset(); h.documentNode.maximum(0); h.return();
  for (let index = 0; index < 40; index++) h.paint();
  assert.equal(h.frames.size, 0, 'An impossible offset must not keep an animation loop alive');
  const restores = h.writes.filter(([id, axis]) => id === 'document' && axis === 'top').length;
  assert.ok(restores > 1 && restores <= 30, `Restoration attempts must be bounded to the thirty-attempt budget; got ${restores}`);
  const count = h.writes.length; h.documentNode.maximum(Infinity); h.documentNode.raw(980); h.paint();
  assert.equal(h.documentNode.scrollTop, 980); assert.equal(h.writes.length, count); h.dispose();
});

test('new user input cancels pending MOBILE restoration before it can replace the user position', () => {
  for (const type of ['pointerdown', 'touchstart', 'wheel', 'keydown']) {
    const h = harness(); h.render(); h.capture(); h.leave(); h.reset(); h.documentNode.maximum(0); h.return();
    const queued = [...h.frames.values()][0];
    h.windowEvents.emit(type, { key: 'ArrowDown' }); h.docEvents.emit(type, { key: 'ArrowDown' });
    assert.equal(h.frames.size, 0, type);
    h.documentNode.maximum(Infinity); h.documentNode.raw(1000);
    const count = h.writes.length; h.paint(); queued(); // A selected stale callback must honor the stopped flag too.
    assert.equal(h.documentNode.scrollTop, 1000, type); assert.equal(h.writes.length, count, type); h.dispose();
  }
});

test('a new clamp after one successful frame restarts the stable-completion count', () => {
  const h = harness(); h.render(); h.capture(); h.leave(); h.reset(); h.documentNode.maximum(0); h.return();
  h.documentNode.maximum(Infinity); h.paint();
  assert.equal(h.documentNode.scrollTop, 725); assert.equal(h.frames.size, 1);
  h.documentNode.maximum(0); h.paint();
  assert.equal(h.documentNode.scrollTop, 0); assert.equal(h.frames.size, 1);
  h.documentNode.maximum(Infinity); h.paint();
  assert.equal(h.frames.size, 1, 'Two consecutive successful attempts are required after the new clamp');
  h.paint(); assert.equal(h.frames.size, 0); assert.equal(h.documentNode.scrollTop, 725); h.dispose();
});

test('a detached MOBILE layer cannot keep restoring the active document', () => {
  const h = harness(); h.render(); h.capture(); h.leave(); h.reset(); h.documentNode.maximum(0); h.return();
  h.host.isConnected = false; const count = h.writes.length; h.paint();
  assert.equal(h.frames.size, 0); assert.equal(h.writes.length, count); h.dispose();
});
