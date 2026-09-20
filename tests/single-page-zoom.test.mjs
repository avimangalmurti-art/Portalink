import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

function harness(mobile = true) {
  let cursor = 0, zoom, exits = 0, key = 'one';
  const slots = [], pending = [], events = new Map(), motions = [], saved = [];
  const surface = { isConnected: true, scrollLeft: 0, scrollTop: 0, clientWidth: 390, clientHeight: 600, scrollWidth: 390, scrollHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0 }), querySelector() { return this; }, addEventListener: (name, fn) => events.set(name, fn), removeEventListener(name, fn) { if (events.get(name) === fn) events.delete(name); } };
  const ref = { current: surface };
  const effect = (fn, deps) => {
    const i = cursor++, old = slots[i];
    if (!old || deps.some((dep, j) => dep !== old.deps[j])) { slots[i] = { deps, cleanup: old?.cleanup }; pending.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); }); }
  };
  const react = { useRef(value) { return slots[cursor++] ??= { current: value }; }, useState(value) {
    const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
    return [slots[i], next => { slots[i] = next; }];
  }, useEffect: effect, useLayoutEffect: effect, useCallback(fn, deps) {
    const i = cursor++; if (!slots[i] || deps.some((dep, j) => dep !== slots[i].deps[j])) slots[i] = { deps, fn };
    return slots[i].fn;
  } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/useSinglePageZoom.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, document: { addEventListener() {}, removeEventListener() {} }, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => mobile ? 'mobile' : 'web' };
    if (name.endsWith('/viewerMemory')) return { readViewerMemory: () => ({}), updateViewerMemory: (key, state) => saved.push([key, state.zoom]) };
    return { touchMidpoint: t => ({ x: (t[0].clientX + t[1].clientX) / 2, y: 100 }), beginContentPinch() {
      const m = { values: [], settleCount: 0, cancelled: false, update(ratio) { this.values.push(ratio); }, settle() { this.settleCount++; }, cancel() { this.cancelled = true; } }; motions.push(m); return m;
    } };
  } });
  function render() { cursor = 0; zoom = exports.useSinglePageZoom({ surfaceRef: ref, active: true, memoryKey: key, onExit: () => exits++ }); pending.splice(0).forEach(fn => fn()); }
  render();
  return { render, motions, saved, get zoom() { return zoom; }, get exits() { return exits; },
    event(type, distance = 0, count = 2) { events.get(type)({ type, touches: Array.from({ length: count }, (_,i) => ({ clientX: i * distance, clientY: 100 })), preventDefault() {}, stopPropagation() {} }); },
    changePage() { key = 'two'; render(); }, wheel(event) { events.get('wheel')(event); },
  };
}

test('focused mobile pinch previews at finger speed and commits a single bounded zoom at release', () => {
  const h = harness(); h.event('touchstart', 100); h.event('touchmove', 173); h.render();
  assert.equal(h.zoom, 1); assert.deepEqual(h.saved, []); assert.deepEqual(h.motions[0].values, [1.73]);
  h.event('touchend', 0, 0); h.render(); assert.equal(h.zoom, 1.73); assert.deepEqual(h.saved, [['one', 1.73]]); assert.equal(h.motions[0].settleCount, 1);
  h.event('touchstart', 100); h.event('touchmove', 10000); h.event('touchend', 0, 0); h.render(); assert.equal(h.zoom, 4);
});

test('focused cancellation with remaining touches and page changes discard the unfinished gesture', () => {
  const h = harness(); h.event('touchstart', 100); h.event('touchmove', 180); h.event('touchcancel', 180, 2); h.render();
  assert.equal(h.zoom, 1); assert.deepEqual(h.saved, []); assert.equal(h.motions[0].settleCount, 1);
  h.event('touchstart', 100); h.event('touchmove', 180); h.changePage(); assert.equal(h.motions[1].cancelled, true);
  h.event('touchend', 0, 0); h.render(); assert.equal(h.zoom, 1); assert.deepEqual(h.saved, []);
});

test('mobile pinch-to-exit waits for release; ordinary WEB scrolling remains native', () => {
  const h = harness(); h.event('touchstart', 100); h.event('touchmove', 70); assert.equal(h.exits, 0);
  h.event('touchend', 0, 0); assert.equal(h.exits, 1);
  const web = harness(false); web.event('touchstart', 100); web.event('touchmove', 160); web.render(); assert.equal(web.zoom, 1.6);
  web.wheel({ deltaY: 40, preventDefault() { assert.fail('Plain wheel must stay native'); } });
});
