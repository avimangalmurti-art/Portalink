import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

test('document reading restores the overview and preserves it through focused-page clamping', () => {
  let effect, saved = 640, focused = false, callback, cancelled = false;
  const listeners = new Map();
  const window = { scrollY: 0, scrollTo({top}) { this.scrollY = top; },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const host = { current: { isConnected: true, closest: selector => selector === '.screen-exit' ? null : { querySelector: () => focused } } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/useDocumentReadingScroll.ts', import.meta.url),'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, window, requestAnimationFrame: fn => { callback = fn; return 1; }, cancelAnimationFrame: () => { cancelled = true; },
    require: name => name === 'react' ? { useLayoutEffect: fn => { effect = fn; } } : {
      readViewerMemory: () => ({ scrollTop: saved }), updateViewerMemory: (_, patch) => { saved = patch.scrollTop; },
    } });
  exports.useDocumentReadingScroll(true, host, 'project'); const cleanup = effect(); callback();
  assert.equal(window.scrollY, 640);
  window.scrollY = 820; listeners.get('scroll')(); assert.equal(saved, 820);
  focused = true; window.scrollY = 0; listeners.get('scroll')(); assert.equal(saved, 820);
  cleanup(); assert.equal(listeners.size, 0); assert.equal(cancelled, true);
  exports.useDocumentReadingScroll(false, host, 'project'); assert.equal(effect(), undefined);
  focused = false; exports.useDocumentReadingScroll(true, host, 'project'); const backCleanup = effect(); callback();
  assert.equal(window.scrollY, 820); backCleanup();
});
