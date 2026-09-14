import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function harness(enabled = true) {
  const listeners = new Map();
  let cleanup;
  let saves = 0;
  class Element { constructor(excluded = false) { this.excluded = excluded; } closest() { return this.excluded ? this : null; } }
  const root = { current: new Element() };
  const exports = {};
  const source = readFileSync(new URL('../src/features/profile/useReorderOutsideTap.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, Element,
    require: () => ({ useRef: current => ({ current }), useEffect: effect => { cleanup = effect(); } }),
    document: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
  });
  exports.useReorderOutsideTap(enabled, root, () => saves++);
  const outside = new Element();
  const excluded = new Element(true);
  const down = (target = outside) => listeners.get('pointerdown')?.({ clientX: 10, clientY: 10, isPrimary: true, button: 0, target });
  const click = (target = outside, detail = 1) => {
    const event = { target, detail, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    listeners.get('click')?.(event);
    return event;
  };
  return { listeners, root, outside, excluded, down, click, cleanup: () => cleanup?.(), saves: () => saves };
}

test('an outside tap saves and consumes navigation; cards and explicit reorder controls do not', () => {
  const h = harness();
  h.down(h.excluded); h.click(h.excluded);
  assert.equal(h.saves(), 0);
  h.down(); const event = h.click();
  assert.equal(h.saves(), 1);
  assert.equal(event.prevented, true); assert.equal(event.stopped, true);
  h.cleanup(); assert.equal(h.listeners.size, 0);
});

test('long-press release, drag from a card, scrolling, and cancelled gestures never save', () => {
  const h = harness();
  h.click(); // The hold began before the outside listener was mounted.
  h.down(h.excluded); h.click(); // Drag released over blank space.
  h.down(); h.listeners.get('pointermove')({ clientX: 10, clientY: 50 }); h.click();
  h.down(); h.listeners.get('pointercancel')(); h.click();
  assert.equal(h.saves(), 0);
});

test('inactive and exiting screens cannot intercept navigation; keyboard outside activation can finish', () => {
  const inactive = harness(false);
  assert.equal(inactive.listeners.size, 0);
  const h = harness();
  h.root.current = h.excluded;
  h.down(); assert.equal(h.click().prevented, false);
  h.root.current = h.outside;
  assert.equal(h.click(h.outside, 0).prevented, true);
  assert.equal(h.saves(), 1);
});
