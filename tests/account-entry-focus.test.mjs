import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function welcomeHarness(mode = 'mobile') {
  const slots = [], layout = [], passive = [], listeners = new Map();
  let cursor = 0;
  const document = { activeElement: null };
  class Element {
    constructor(type) { this.type = type; this.scrollTop = 200; this.blurs = 0; }
    matches() { return this.type === 'input'; }
    blur() { this.blurs++; document.activeElement = null; }
    focus() { document.activeElement = this; }
  }
  const hook = queue => (effect, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((value, i) => value !== slots[index].deps[i])) {
      slots[index]?.cleanup?.();
      slots[index] = { deps };
      queue.push(() => { slots[index].cleanup = effect(); });
    }
  };
  const react = { ...React,
    useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; },
    useState: initial => { cursor++; return [initial, () => {}]; },
    useLayoutEffect: hook(layout), useEffect: hook(passive),
  };
  const imports = {
    '../../utils/radioGroupKeyboard': { handleRadioGroupKeyDown() {} },
    react, 'lucide-react': { ArrowLeftIcon: 'svg', XIcon: 'svg', CheckIcon: 'svg' },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    '../../hooks/useModalFocus': { useModalFocus() {} },
    '../../data/navButtonTokens': { findNavAccent: () => ({ id: 'pink' }), navAccents: [], isLightSurface: () => false },
    '../../utils/accentTokens': { resolveAccentTokens: () => ({}) },
    '../ui/Button': { Button: 'button' }, '../ui/AppearanceSwitch': { AppearanceSwitch: 'button' },
    '../../presentation/usePresentation': { usePresentation: () => mode },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/auth/AccountWelcomeSurface.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, document, HTMLElement: Element, window: {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  }, require(name) { assert.ok(name in imports, name); return imports[name]; } });
  const attach = node => {
    if (!React.isValidElement(node)) return;
    if (node.ref && typeof node.ref === 'object') node.ref.current ??= new Element(node.type);
    React.Children.forEach(node.props.children, attach);
  };
  return {
    document, listeners,
    input() { const input = new Element('input'); input.focus(); return input; },
    render(title = 'Sign in') {
      cursor = 0;
      attach(exports.AccountWelcomeSurface({ title, accentColor: '#ff2d55', onDismiss() {}, children: null }));
    },
    paint() { layout.splice(0).forEach(fn => fn()); },
    afterPaint() { passive.splice(0).forEach(fn => fn()); },
    pageShow(persisted) { listeners.get('pageshow')?.({ persisted }); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('mobile account arrival clears restored input focus before paint', () => {
  const h = welcomeHarness();
  const input = h.input();
  h.render(); h.paint();
  assert.equal(input.blurs, 1);
  assert.equal(h.document.activeElement.type, 'h2');
  h.afterPaint();
  assert.equal(h.document.activeElement.type, 'h2');
  h.unmount();
  assert.equal(h.listeners.size, 0);
});

test('mobile typing survives rerenders and keyboard resizing; a new account step returns to its heading', () => {
  const h = welcomeHarness();
  h.render(); h.paint(); h.afterPaint();
  const input = h.input();
  h.render(); h.paint(); h.afterPaint();
  h.listeners.get('resize')?.();
  h.pageShow(false);
  assert.equal(h.document.activeElement, input);
  assert.equal(input.blurs, 0);
  h.render('Create your account'); h.paint(); h.afterPaint();
  assert.equal(h.document.activeElement.type, 'h2');
  assert.equal(input.blurs, 1);
  h.unmount();
});

test('restoring a mobile account page from back-forward cache returns to the welcome screen', () => {
  const h = welcomeHarness();
  h.render(); h.paint(); h.afterPaint();
  const input = h.input();
  h.pageShow(true);
  assert.equal(input.blurs, 1);
  assert.equal(h.document.activeElement.type, 'h2');
  h.unmount();
});

test('desktop keeps its existing after-paint heading focus without mobile restoration handling', () => {
  const h = welcomeHarness('web');
  const input = h.input();
  h.render(); h.paint();
  assert.equal(h.document.activeElement, input);
  assert.equal(input.blurs, 0);
  h.afterPaint();
  assert.equal(h.document.activeElement.type, 'h2');
  assert.equal(h.listeners.size, 0);
  h.unmount();
});
