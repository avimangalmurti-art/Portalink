import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

function harness(mobile = true, { active: initialActive = true, entryReady: initialEntryReady = true, mounted = true, stayFocused = false } = {}) {
  let cursor = 0, zoom, exits = 0, key = 'one';
  let active = initialActive, entryReady = initialEntryReady;
  const slots = [], pending = [], events = new Map(), motions = [], saved = [], entryAttachments = [], entryRequests = [];
  const surface = { isConnected: true, scrollLeft: 0, scrollTop: 0, clientWidth: 390, clientHeight: 600, scrollWidth: 390, scrollHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0 }), querySelector() { return this; }, addEventListener: (name, fn) => events.set(name, fn), removeEventListener(name, fn) { if (events.get(name) === fn) events.delete(name); } };
  const ref = { current: mounted ? surface : null };
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
  }).outputText, { exports, WheelEvent: { DOM_DELTA_LINE: 1, DOM_DELTA_PAGE: 2 }, document: { addEventListener() {}, removeEventListener() {} }, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('/usePresentation')) return { usePresentation: () => mobile ? 'mobile' : 'web' };
    if (name.endsWith('/viewerMemory')) return { readViewerMemory: () => ({}), updateViewerMemory: (key, state) => saved.push([key, state.zoom]) };
    if (name.endsWith('/pageZoomEntry')) {
      function attach(target, onEnter) {
      assert.equal(target, surface);
      const attachment = { onEnter, cleanupCount: 0 };
      entryAttachments.push(attachment);
      return () => attachment.cleanupCount++;
      }
      return { installPageZoomEntry: attach, installOverviewPageTaps: attach };
    }
    return { touchMidpoint: t => ({ x: (t[0].clientX + t[1].clientX) / 2, y: 100 }), beginContentPinch() {
      const m = { values: [], settleCount: 0, cancelled: false, update(ratio) { this.values.push(ratio); }, settle() { this.settleCount++; }, cancel() { this.cancelled = true; } }; motions.push(m); return m;
    } };
  } });
  function render() { cursor = 0; zoom = exports.useSinglePageZoom({ surfaceRef: ref, active, entryReady, stayFocused, memoryKey: key,
    onEnter: (page, nextZoom) => entryRequests.push([page, nextZoom]), onExit: () => exits++ }); pending.splice(0).forEach(fn => fn()); }
  render();
  return { render, motions, saved, events, entryAttachments, entryRequests, get zoom() { return zoom; }, get exits() { return exits; },
    setEntryState(next) {
      if ('active' in next) active = next.active;
      if ('entryReady' in next) entryReady = next.entryReady;
      if ('mounted' in next) ref.current = next.mounted ? surface : null;
      render();
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
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

test('reading mode retains pinch zoom and resets outward pinches without returning to the grid',()=>{
 const h=harness(true,{stayFocused:true});h.event('touchstart',100);h.event('touchmove',170);h.event('touchend',0,0);h.render();assert.equal(h.zoom,1.7);
 h.event('touchstart',170);h.event('touchmove',40);h.event('touchend',0,0);h.render();assert.equal(h.zoom,1);assert.equal(h.exits,0);
});

test('mobile pinch-to-exit waits for release; ordinary WEB scrolling remains native', () => {
  const h = harness(); h.event('touchstart', 100); h.event('touchmove', 70); assert.equal(h.exits, 0);
  h.event('touchend', 0, 0); assert.equal(h.exits, 1);
  const web = harness(false); web.event('touchstart', 100); web.event('touchmove', 160); web.render(); assert.equal(web.zoom, 1.6);
  web.wheel({ deltaY: 40, preventDefault() { assert.fail('Plain wheel must stay native'); } });
});

test('small modified wheel zoom-in steps accumulate instead of snapping back to fitted size', () => {
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    const h = harness(false);
    let prevented = 0, stopped = 0;
    for (let step = 0; step < 12; step++) {
      const previous = h.zoom;
      h.wheel({ deltaY: -0.5, deltaMode: 0, clientX: 195, clientY: 300, ...modifier,
        preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
      h.render();
      assert.ok(h.zoom > previous, `Zoom-in step ${step + 1} must grow from ${previous}`);
    }
    assert.ok(h.zoom > 1.012, 'Small trackpad deltas must eventually pass the fit snap range');
    assert.equal(h.saved.length, 12);
    assert.equal(prevented, 12); assert.equal(stopped, 12); assert.equal(h.exits, 0);
  }
});

test('a document surface mounted after processing attaches zoom entry when ready and cleans it up', () => {
  const h = harness(true, { active: false, entryReady: false, mounted: false });
  assert.equal(h.entryAttachments.length, 0);
  h.setEntryState({ mounted: true });
  assert.equal(h.entryAttachments.length, 0, 'A mounted surface must still wait for its page content');
  h.setEntryState({ entryReady: true });
  assert.equal(h.entryAttachments.length, 1, 'Processing completion must attach without a focus or memory-key change');
  h.entryAttachments[0].onEnter(2);
  assert.deepEqual(h.entryRequests, [[2, undefined]]);
  h.render();
  assert.equal(h.entryAttachments.length, 1, 'Routine renders must preserve the current gesture listeners');
  h.setEntryState({ entryReady: false });
  assert.equal(h.entryAttachments[0].cleanupCount, 1);
  h.setEntryState({ entryReady: true });
  assert.equal(h.entryAttachments.length, 2);
  h.setEntryState({ active: true });
  assert.equal(h.entryAttachments[1].cleanupCount, 1, 'Focused-page zoom takes over the surface');
  h.setEntryState({ active: false });
  assert.equal(h.entryAttachments.length, 3);
  h.unmount();
  assert.equal(h.entryAttachments[2].cleanupCount, 1);

  const focused = harness(true, { active: true, entryReady: false, mounted: false });
  assert.equal(focused.events.size, 0);
  focused.setEntryState({ mounted: true });
  assert.equal(focused.events.size, 0);
  focused.setEntryState({ entryReady: true });
  assert.ok(focused.events.has('wheel'), 'An already-focused deep link must attach zoom when rendered pages arrive');
  assert.ok(focused.events.has('touchmove'));
  assert.equal(focused.entryAttachments.length, 0, 'Focused content uses its existing zoom rather than overview entry');
  focused.setEntryState({ entryReady: false });
  assert.equal(focused.events.size, 0);
  focused.setEntryState({ entryReady: true });
  assert.ok(focused.events.has('wheel'));
  focused.unmount();
  assert.equal(focused.events.size, 0);
});

test('a mobile overview pinch retains the overview and its magnification until a page is tapped twice', () => {
  const h = harness(true, { active: false });
  h.event('touchstart', 100);
  h.event('touchmove', 175);
  h.event('touchend', 0, 1);
  h.render();
  assert.equal(h.zoom, 1.75);
  assert.deepEqual(h.saved, [['one', 1.75]]);
  assert.equal(h.motions[0].settleCount, 1);
  assert.deepEqual(h.entryRequests, []);
  h.entryAttachments[0].onEnter(2);
  assert.deepEqual(h.entryRequests, [[2, undefined]]);
  assert.equal(h.exits, 0);
});
