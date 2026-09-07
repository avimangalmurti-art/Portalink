import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function eventTarget(values = {}) {
  const listeners = new Map();
  return {
    ...values, listeners,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { assert.equal(listeners.get(name), callback); listeners.delete(name); },
    emit(name) { listeners.get(name)?.(); },
  };
}

function mount(window) {
  let effect;
  const exports = {};
  const source = readFileSync(new URL('../src/hooks/useDialogViewport.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, window, require(name) {
    assert.equal(name, 'react');
    return { useRef: () => ({ current: null }), useEffect: (callback) => { effect = callback; } };
  } });
  const ref = exports.useDialogViewport();
  const styles = new Map();
  ref.current = { style: { setProperty: (key, value) => styles.set(key, value) } };
  const unmount = effect();
  return { styles, unmount };
}

test('dialog follows the visible viewport when the keyboard opens, pans, and closes', () => {
  const viewport = eventTarget({ height: 698, offsetTop: 0 });
  const window = eventTarget({ innerHeight: 698, visualViewport: viewport });
  const { styles, unmount } = mount(window);
  assert.equal(styles.get('--dialog-viewport-height'), '698px');
  assert.equal(styles.get('--dialog-viewport-top'), '0px');
  viewport.height = 390;
  viewport.offsetTop = 12;
  viewport.emit('resize');
  assert.equal(styles.get('--dialog-viewport-height'), '390px');
  assert.equal(styles.get('--dialog-viewport-top'), '12px');
  viewport.offsetTop = 26;
  viewport.emit('scroll');
  assert.equal(styles.get('--dialog-viewport-top'), '26px');
  viewport.height = 698;
  viewport.offsetTop = 0;
  viewport.emit('resize');
  assert.equal(styles.get('--dialog-viewport-height'), '698px');
  assert.equal(styles.get('--dialog-viewport-top'), '0px');
  unmount();
  assert.equal(viewport.listeners.size, 0);
  assert.equal(window.listeners.size, 0);
});

test('dialog falls back to window resizing when VisualViewport is unavailable', () => {
  const window = eventTarget({ innerHeight: 800 });
  const { styles, unmount } = mount(window);
  assert.equal(styles.get('--dialog-viewport-height'), '800px');
  assert.equal(styles.get('--dialog-viewport-top'), '0px');
  window.innerHeight = 500;
  window.emit('resize');
  assert.equal(styles.get('--dialog-viewport-height'), '500px');
  unmount();
  assert.equal(window.listeners.size, 0);
});
