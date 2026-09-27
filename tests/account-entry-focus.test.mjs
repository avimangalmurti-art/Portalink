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
    react, 'lucide-react': { ArrowLeftIcon: 'svg', ChevronLeftIcon: 'svg', XIcon: 'svg', CheckIcon: 'svg' },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    '../../hooks/useModalFocus': { useModalFocus() {} },
    '../../data/navButtonTokens': { findNavAccent: () => ({ id: 'pink' }), navAccents: [], isLightSurface: () => false },
    '../../utils/accentTokens': { resolveAccentTokens: () => ({}) },
    '../ui/Button': { Button: 'button' }, '../ui/AppearanceSwitch': { AppearanceSwitch: 'button' },
    '../ui/PortalinkSplashLoader': { PortalinkSplashLoader: 'welcome-media' }, './helloWorldSignIn.css': {},
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
    render(title = 'Sign in', changes = {}) {
      cursor = 0;
      const tree = exports.AccountWelcomeSurface({ title, signIn: title === 'Sign in', accentColor: '#ff2d55', onDismiss() {}, children: null, ...changes });
      attach(tree); return tree;
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

function nodes(tree) {
  return React.isValidElement(tree) ? [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
}

test('sign-in embeds Hello World media and the existing form on MOBILE and WEB without the static icon or appearance surface', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = welcomeHarness(presentation), actions = [];
    const form = React.createElement('form', { onSubmit: () => actions.push('submit') },
      React.createElement('input', { id: 'email', type: 'email', autoComplete: 'email' }),
      React.createElement('input', { id: 'password', type: 'password', autoComplete: 'current-password' }),
      React.createElement('button', { type: 'submit' }, 'Sign in'));
    const tree = h.render('Sign in', { signIn: true, showAppearance: true, children: form, onDismiss: () => actions.push('dismiss') });
    assert.equal(tree.props['data-account-signin'], true);
    const media = nodes(tree).filter(node => node.type === 'welcome-media');
    assert.equal(media.length, 1);
    assert.equal(media[0].props.welcomeMedia, true);
    assert.equal(media[0].props.landing, undefined, 'The sign-in form owns the actions; embedded media must not add landing controls');
    assert.equal(media[0].props.onComplete, undefined, 'Media readiness cannot dismiss the sign-in form');
    assert.equal(nodes(tree).some(node => node.type === 'img'), false, 'The old static app-icon is removed');
    assert.equal(nodes(tree).some(node => node.props.className?.includes('auth-signin-vanta')), false);
    assert.equal(nodes(tree).some(node => node.props.className?.includes('account-welcome-appearance')), false);
    assert.equal(nodes(tree).some(node => node.props.role === 'radiogroup'), false);
    assert.equal(nodes(tree).find(node => node.type === 'header').props.className, 'sr-only');
    assert.equal(nodes(tree).find(node => node.type === 'h2').props.children, 'Sign in');
    assert.equal(nodes(tree).find(node => node.props.role === 'dialog').props['aria-label'], 'Sign in');
    assert.equal(nodes(tree).find(node => node.type === 'form').props, form.props,
      'Embedding media preserves the supplied form inputs and handlers');
    nodes(tree).find(node => node.type === 'form').props.onSubmit();
    nodes(tree).find(node => node.props['aria-label'] === (presentation === 'mobile' ? 'Back' : 'Close')).props.onClick();
    assert.deepEqual(actions, ['submit', 'dismiss']);
    h.paint(); h.afterPaint(); h.unmount();
  }
});

test('signup and recovery retain their existing heading, frame and caller-controlled appearance options', () => {
  for (const presentation of ['mobile', 'web']) {
    for (const title of ['Create your account', 'Reset your password']) {
      const h = welcomeHarness(presentation);
      const mobileOnboarding = presentation === 'mobile' && title === 'Create your account';
      let tree = h.render(title, { mobileOnboarding, showAppearance: true });
      assert.equal(tree.props['data-account-signin'], undefined);
      assert.equal(tree.props['data-mobile-onboarding'], mobileOnboarding ? 'dark' : undefined);
      assert.equal(nodes(tree).some(node => node.type === 'welcome-media'), false);
      assert.ok(nodes(tree).find(node => node.props.role === 'dialog').props.className.includes('auth-signin-vanta'));
      assert.ok(nodes(tree).find(node => node.type === 'header').props.className.includes('account-welcome-heading'));
      assert.ok(nodes(tree).some(node => node.props.className?.includes('account-welcome-appearance')));
      tree = h.render(title, { mobileOnboarding, showAppearance: false });
      assert.equal(nodes(tree).some(node => node.props.className?.includes('account-welcome-appearance')), false);
      h.paint(); h.afterPaint(); h.unmount();
    }
  }
});
