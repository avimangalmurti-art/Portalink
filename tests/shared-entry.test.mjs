import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
function load(path, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, URL, URLSearchParams, ...globals, require(name) {
    assert.ok(name in imports, `Missing test import: ${name}`);
    return imports[name];
  } });
  return exports;
}
const nodes = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
const registration = load('../src/features/auth/registration.ts', { '../profile/validation': {} });

function signInBar({ path = '/share/creator/c/art/project', search = '?view=projects&page=2&media=image-a', initializing = false, signedIn = false, phase = 'idle' } = {}) {
  const requested = [];
  const auth = { isInitializing: initializing, isAuthenticated: signedIn, phase,
    requestAuthenticatedDestination: (intent, view) => requested.push({ intent, view }),
    requestAuth() { throw Error('Shared entry must not open authentication automatically.'); },
  };
  const { SharedSignInBar } = load('../src/components/profile/SharedSignInBar.tsx', {
    react: React, 'react-router-dom': { useLocation: () => ({ pathname: path, search }) },
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../features/auth/registration': registration, './shared-sign-in-bar.css': {},
  });
  return { auth, requested, render: () => SharedSignInBar() };
}

test('public sign-in bar is an optional action and only appears for a verified guest on a shared route', () => {
  const visitor = signInBar();
  const tree = visitor.render();
  assert.equal(tree.type, 'aside');
  assert.equal(tree.props['data-shared-sign-in-bar'], '');
  assert.equal(nodes(tree).some(node => node.props.role === 'dialog' || node.props['aria-modal']), false);
  const buttons = nodes(tree).filter(node => node.type === 'button');
  assert.equal(buttons.length, 1); assert.equal(buttons[0].props.children, 'Sign in');
  assert.equal(visitor.requested.length, 0);
  for (const options of [{ initializing: true }, { signedIn: true }, { initializing: true, signedIn: true }, { path: '/' }, { path: '/studio' }, { path: '/profile/creator' }, { path: '/share' }, { path: '/shared/creator' }]) {
    const h = signInBar(options);
    assert.equal(h.render(), null); assert.equal(h.requested.length, 0);
  }
});

test('explicit shared sign-in preserves the exact safe destination without copying callback tokens', () => {
  const h = signInBar({ search: '?view=portals&page=12&media=image-a&code=secret&access_token=secret&next=https%3A%2F%2Fevil.test' });
  const button = nodes(h.render()).find(node => node.type === 'button');
  assert.equal(h.requested.length, 0);
  button.props.onClick();
  assert.equal(h.requested.length, 1);
  assert.equal(h.requested[0].view, 'signIn');
  assert.equal(h.requested[0].intent.kind, 'route');
  assert.equal(h.requested[0].intent.path, '/share/creator/c/art/project?view=portals&page=12&media=image-a');
  assert.doesNotMatch(h.requested[0].intent.path, /secret|next=|access_token|code=/);
  h.auth.isAuthenticated = true; assert.equal(h.render(), null);
  const busy = signInBar({ phase: 'authenticating' });
  assert.equal(nodes(busy.render()).find(node => node.type === 'button').props.disabled, true);
});

test('shared profile and category sign-in actions retain their actual reading destination', () => {
  for (const [path, search] of [['/share/creator', '?view=portals'], ['/share/creator/c/art', '?view=projects'], ['/share/creator/c/art/project', '?page=5&media=page-a']]) {
    const h = signInBar({ path, search });
    nodes(h.render()).find(node => node.type === 'button').props.onClick();
    assert.equal(h.requested[0].intent.path, path + search);
  }
});

const inertReact = { ...React, useRef: value => ({ current: value }), useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect() {}, useLayoutEffect() {} };
function accountSurface(presentation) {
  return load('../src/components/auth/AccountWelcomeSurface.tsx', {
    react: inertReact, 'lucide-react': { ArrowLeftIcon: 'svg', ChevronLeftIcon: 'svg', XIcon: 'svg', CheckIcon: 'svg' },
    '../../utils/radioGroupKeyboard': { handleRadioGroupKeyDown() {} },
    '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    '../../hooks/useModalFocus': { useModalFocus() {} },
    '../../data/navButtonTokens': { findNavAccent: () => ({ id: 'blue' }), isLightSurface: () => true, navAccents: [] },
    '../../utils/accentTokens': { resolveAccentTokens: () => ({}) },
    '../ui/Button': { Button: 'button' }, '../ui/AppearanceSwitch': { AppearanceSwitch: 'button' },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../ui/PortalinkSplashLoader': { PortalinkSplashLoader: 'welcome-media' }, './helloWorldSignIn.css': {},
  }).AccountWelcomeSurface;
}

test('shared sign-in explicitly suppresses welcome media but preserves its accessible dialog and dismissal', () => {
  for (const presentation of ['mobile', 'web']) {
    const Surface = accountSurface(presentation); let closed = 0;
    const props = { title: 'Sign in', signIn: true, accentColor: '#0A84FF', showAppearance: false, onDismiss: () => closed++, children: React.createElement('form', { 'aria-label': 'Sign-in form' }) };
    const regular = Surface(props);
    assert.equal(nodes(regular).filter(node => node.type === 'welcome-media').length, 1, 'normal sign-in retains its existing welcome scene');
    const shared = Surface({ ...props, showWelcomeMedia: false });
    assert.equal(nodes(shared).filter(node => node.type === 'welcome-media').length, 0);
    assert.equal(nodes(shared).find(node => node.props.role === 'dialog').props['aria-label'], 'Sign in');
    const header = nodes(shared).find(node => node.type === 'header');
    assert.ok(header); assert.doesNotMatch(header.props.className, /sr-only/);
    assert.equal(nodes(shared).filter(node => node.type === 'form').length, 1);
    const close = nodes(shared).find(node => node.type === 'button' && node.props['aria-label'] === (presentation === 'mobile' ? 'Back' : 'Close'));
    close.props.onClick(); assert.equal(closed, 1);
  }
});

test('shared-entry media preference reaches the existing auth surface only when an auth view was requested', () => {
  for (const presentation of ['mobile', 'web']) {
    const auth = { pendingView: null, phase: 'anonymous', closeAuth() {} };
    const { AuthDialog } = load('../src/features/auth/AuthDialog.tsx', {
      react: inertReact, 'lucide-react': {}, '../../contexts/AuthContext': { useAuth: () => auth },
      '../../components/auth/AuthField': {}, '../../components/ui/Button': {}, '../../components/ui/InterfaceIcon': {},
      '../../components/profile/AvatarPicker': {}, '../../components/profile/ProfileField': {}, '../../components/profile/ProfileVisibilityField': {},
      '../../components/profile/ProfileLocationPicker': {}, '../profile/useProfileOnboarding': {}, '../profile/validation': {},
      '../../components/auth/AccountWelcomeSurface': { AccountWelcomeSurface: 'account-surface' },
      './useAuthFlows': {}, './validation': {}, '../../components/auth/MobileOnboarding': {},
      '../../presentation/usePresentation': { usePresentation: () => presentation }, './registration': registration,
    });
    assert.equal(AuthDialog({ showWelcomeMedia: false }), null);
    auth.pendingView = 'signIn';
    const requested = AuthDialog({ showWelcomeMedia: false });
    assert.equal(requested.type, 'account-surface'); assert.equal(requested.props.showWelcomeMedia, false); assert.equal(requested.props.title, 'Sign in');
  }
});

test('App supplies shared registration destinations on both platforms and keeps Settings return mobile-only', () => {
  const file = ts.createSourceFile('App.tsx', read('../src/App.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'AuthDialog') {
      const attribute = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(file) === 'registrationReturnPath');
      expression = attribute?.initializer?.expression;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(expression);
  const evaluate = values => vm.runInNewContext(`(${expression.getText(file)})`, {
    readSharedReturnPath: registration.readSharedReturnPath,
    pathname: '/share/creator/c/art/project', search: '?page=3&code=secret&media=image-a',
    settingsReturnPath: '/share/from-settings?view=portals', ...values,
  });
  for (const presentation of ['mobile', 'web']) {
    assert.equal(evaluate({ presentation, isSharedRoute: true }), '/share/creator/c/art/project?page=3&media=image-a');
  }
  assert.equal(evaluate({ presentation: 'web', isSharedRoute: false }), undefined);
  assert.equal(evaluate({ presentation: 'mobile', isSharedRoute: false }), '/share/from-settings?view=portals');
});

test('shared preboot chooses neutral first paint before the body and leaves other routes unmarked', () => {
  const html = read('../index.html');
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script); assert.ok(html.indexOf(script) < html.indexOf('<body>'));
  for (const [pathname, expected] of [['/share/a', true], ['/share/a/c/b/c', true], ['/share', true], ['/', false], ['/settings', false], ['/shared/a', false]]) for (const presentation of ['mobile', 'web']) {
    const attributes = new Map();
    const root = { dataset: {}, style: {}, toggleAttribute(name, enabled) { if (enabled) attributes.set(name, ''); else attributes.delete(name); } };
    vm.runInNewContext(script, {
      document: { documentElement: root },
      window: { location: { pathname }, navigator: {}, localStorage: { getItem: () => null },
        matchMedia: query => ({ matches: query.includes('max-width') ? presentation === 'mobile' : false }),
      },
    });
    assert.equal(attributes.has('data-shared-view'), expected);
    assert.equal(root.dataset.appearance, 'light');
  }
  assert.match(html, /html\[data-shared-view\] #portalink-preboot picture\s*\{\s*display:\s*none;/);
  assert.match(html, /html\[data-shared-view\] #portalink-preboot::after\s*\{[^}]*Opening shared content/);
  const app = read('../src/App.tsx');
  assert.match(app, /isSharedRoute && <SharedSignInBar/);
  assert.match(app, /<AuthDialog showWelcomeMedia=\{!isSharedRoute\}/);
});
