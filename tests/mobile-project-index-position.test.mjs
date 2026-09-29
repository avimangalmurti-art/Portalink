import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function mount({ delayedAnchor = false } = {}) {
  let layoutEffect, frame, observerCallback, observerTarget, disconnected = false, resize;
  const styles = new Map();
  const attributes = new Set();
  const overlay = {
    style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) },
    toggleAttribute: (name, enabled) => enabled ? attributes.add(name) : attributes.delete(name),
  };
  const header = { bottom: 108, getBoundingClientRect() { return { bottom: this.bottom }; } };
  const anchor = { closest: () => ({ querySelector: () => header }) };
  const anchorRef = { current: delayedAnchor ? null : anchor };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobileProjectIndexPortal.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, {
    exports,
    require(name) {
      if (name === 'react') return { ...React, useEffect() {}, useLayoutEffect: fn => { layoutEffect = fn; }, useRef: () => ({ current: overlay }), useState: () => [{}, () => {}] };
      if (name === 'react-dom') return { createPortal: node => node };
      throw new Error(name);
    },
    getComputedStyle: () => ({ getPropertyValue: key => key.endsWith('bottom') ? '80px' : '0px' }),
    ResizeObserver: class { constructor(fn) { observerCallback = fn; } observe(node) { observerTarget = node; } disconnect() { disconnected = true; } },
    requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame: () => { frame = null; },
    window: { addEventListener: (_, fn) => { resize = fn; }, removeEventListener: () => { resize = null; } },
  });
  exports.MobileProjectIndexPortal({ anchorRef, children: null });
  const cleanup = layoutEffect();
  return { styles, header, cleanup, attach() { anchorRef.current = anchor; frame?.(); }, updateHeader() { observerCallback(); },
    get observerTarget() { return observerTarget; }, get cleanedUp() { return disconnected && !frame && !resize; } };
}

test('fresh portal entry measures the header and dock after the parent ref attaches', () => {
  const h = mount({ delayedAnchor: true });
  assert.equal(h.styles.size, 0);
  h.attach();
  assert.equal(h.styles.get('--mobile-content-safe-bottom'), '80px');
  assert.equal(h.styles.get('--mobile-project-panel-top'), '120px');
  assert.equal(h.observerTarget, h.header);
  h.cleanup();
  assert.equal(h.cleanedUp, true);
});

test('profile options expansion moves the floating panel below the new header height', () => {
  const h = mount();
  assert.equal(h.styles.get('--mobile-project-panel-top'), '120px');
  h.header.bottom = 220;
  h.updateHeader();
  assert.equal(h.styles.get('--mobile-project-panel-top'), '232px');
  h.header.bottom = 0;
  h.updateHeader();
  assert.equal(h.styles.has('--mobile-project-panel-top'), false);
  h.cleanup();
  assert.equal(h.cleanedUp, true);
});
