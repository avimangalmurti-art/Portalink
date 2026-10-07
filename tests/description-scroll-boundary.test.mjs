import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function mount() {
  let effect;
  const listeners = new Map(), options = new Map();
  class Element {
    constructor(selector = null, parentElement = null) {
      Object.assign(this, { selector: selector === true ? '.project-description-body' : selector, parentElement, scrollTop: 0, scrollHeight: 100, clientHeight: 100 });
    }
    closest(selectors) { return selectors.split(',').map(selector => selector.trim()).includes(this.selector) ? this : this.parentElement?.closest(selectors) ?? null; }
  }
  const overlay = new Element();
  Object.assign(overlay, {
    contains(el) { for (; el; el = el.parentElement) if (el === this) return true; return false; },
    addEventListener(name, fn, opt) { listeners.set(name, fn); options.set(name, opt); },
    removeEventListener(name, fn) { assert.equal(listeners.get(name), fn); listeners.delete(name); },
  });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/hooks/useDescriptionSheetScrollBoundary.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, Element, require(name) { assert.equal(name, 'react'); return { useEffect(fn) { effect = fn; } }; } });
  exports.useDescriptionSheetScrollBoundary({ current: overlay });
  const cleanup = effect();
  const body = new Element(true, overlay);
  const fire = (name, props = {}) => {
    let blocked = false;
    listeners.get(name)?.({ target: body, cancelable: true, touches: [], preventDefault() { blocked = true; }, ...props });
    return blocked;
  };
  return { body, overlay, Element, fire, cleanup, listeners, options };
}

test('wheel scroll stays inside long descriptions and cannot chain from either edge or the backdrop', () => {
  const h = mount(); h.body.scrollHeight = 1000; h.body.clientHeight = 200;
  assert.equal(h.fire('wheel', { deltaY: -60 }), true);
  assert.equal(h.fire('wheel', { deltaY: 60 }), false);
  h.body.scrollTop = 800;
  assert.equal(h.fire('wheel', { deltaY: 60 }), true);
  assert.equal(h.fire('wheel', { deltaY: -60 }), false);
  assert.equal(h.fire('wheel', { target: h.overlay, deltaY: 60 }), true);
  assert.equal(h.fire('wheel', { target: h.overlay, deltaY: 60, ctrlKey: true }), false, 'browser zoom remains available');
  assert.equal(h.options.get('wheel').passive, false);
  h.cleanup(); assert.equal(h.listeners.size, 0);
});

test('touch scrolling allows reading but blocks rubber-banding, short bodies and non-scrolling header areas', () => {
  const h = mount();
  const move = y => h.fire('touchmove', { touches: [{ clientY: y }] });
  h.fire('touchstart', { touches: [{ clientY: 400 }] });
  assert.equal(move(350), true, 'short body cannot move its ancestors');
  h.body.scrollHeight = 1000;
  assert.equal(move(300), false);
  assert.equal(move(350), true, 'downward pull at top is contained');
  h.body.scrollTop = 900;
  assert.equal(move(300), true, 'upward pull at bottom is contained');
  assert.equal(move(350), false);
  assert.equal(h.fire('touchmove', { target: h.overlay, touches: [{ clientY: 400 }] }), true);
  assert.equal(h.options.get('touchmove').passive, false);
  h.fire('touchcancel');
  assert.equal(move(100), false, 'cancel clears the previous gesture');
  h.cleanup();
});

test('textarea and editor scrolling remain usable and multi-touch does not trap browser zoom', () => {
  const h = mount(); h.body.scrollHeight = 700; h.body.selector = '.project-description-editor';
  const textarea = new h.Element('textarea', h.body); textarea.scrollHeight = 400;
  assert.equal(h.fire('wheel', { target: textarea, deltaY: 30 }), false);
  textarea.scrollTop = 300;
  assert.equal(h.fire('wheel', { target: textarea, deltaY: 30 }), false, 'the editor may scroll once the textarea reaches its end');
  h.body.scrollTop = 600;
  assert.equal(h.fire('wheel', { target: textarea, deltaY: 30 }), true);
  h.fire('touchstart', { touches: [{ clientY: 400 }] });
  assert.equal(h.fire('touchmove', { touches: [{ clientY: 380 }, { clientY: 420 }] }), false);
  h.cleanup();
});

test('a confirmation in a short visible viewport can scroll to both actions without moving the page behind it', () => {
  const h = mount();
  const confirmation = new h.Element('.project-description-discard', h.overlay);
  confirmation.scrollHeight = 260; confirmation.clientHeight = 120;
  const button = new h.Element('button', confirmation);
  assert.equal(h.fire('wheel', { target: button, deltaY: 30 }), false);
  assert.equal(h.fire('wheel', { target: button, deltaY: -30 }), true);
  h.fire('touchstart', { target: button, touches: [{ clientY: 300 }] });
  assert.equal(h.fire('touchmove', { target: button, touches: [{ clientY: 260 }] }), false);
  confirmation.scrollTop = 140;
  assert.equal(h.fire('wheel', { target: button, deltaY: 30 }), true);
  assert.equal(h.fire('wheel', { target: button, deltaY: -30 }), false);
  assert.equal(h.fire('touchmove', { target: button, touches: [{ clientY: 220 }] }), true);
  assert.equal(h.fire('touchmove', { target: button, touches: [{ clientY: 260 }] }), false);
  assert.equal(h.fire('wheel', { target: h.overlay, deltaY: 30 }), true);
  confirmation.scrollHeight = 100;
  assert.equal(h.fire('wheel', { target: button, deltaY: 30 }), true, 'A fitting confirmation still contains the gesture');
  h.cleanup();
});
