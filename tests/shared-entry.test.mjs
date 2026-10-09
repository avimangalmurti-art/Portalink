const shareModel = sourceModule('src/features/sharing/shareModel.ts');
import { sourceModule } from './helpers/source-module.mjs';
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
    if(name==='../../contexts/ServicesContext' && !(name in imports))return {useServices:()=>({profiles:{checkPublicHandle:async()=> 'available'}})};
    if(name==='../../utils/profileHandle')return sourceModule('src/utils/profileHandle.ts',{'../features/sharing/shareModel':shareModel});
    assert.ok(name in imports, `Missing test import: ${name}`);
    return imports[name];
  } });
  return exports;
}
const nodes = tree => !React.isValidElement(tree) ? [] : [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
const registration = load('../src/features/auth/registration.ts', { '../profile/validation': sourceModule('src/features/profile/validation.ts', { '../sharing/shareModel': shareModel }), '../sharing/shareModel': shareModel });

test('shared collaboration preserves guest entry and its optional auth return destination', () => {
  const path = '/share/creator/collaboration';
  assert.equal(registration.readSharedReturnPath(`${path}?code=secret`), path);
  assert.equal(registration.readSharedReturnPath(`${path}/extra`), undefined);
  const h = signInBar({ path, search: '' });
  const tree = h.render();
  assert.equal(tree.type, 'aside');
  const signIn = nodes(tree).find(node => node.type === 'button' && node.props.children === 'Sign in');
  signIn.props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(h.requested[0])), { intent: { kind: 'my-profile' }, view: 'signIn' });
});

function signInBar({ path = '/share/creator/c/art/project', search = '?view=projects&page=2&media=image-a', name = 'Creator Name', initializing = false, signedIn = false, phase = 'idle', storage = new Map(), blockedStorage = false } = {}) {
  const requested = [], focusCalls = [], slots = [], pendingEffects = [], observers = [];
  const styles = new Map(); let cursor = 0, height = 56, barRef;
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; barRef = slots[i] ??= { current: initial }; return barRef; },
    useLayoutEffect(effect, deps) { const i = cursor++; if (!slots[i] || deps.some((value, index) => value !== slots[i].deps[index])) {
      pendingEffects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
    } },
  };
  const shell = { style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) } };
  const bar = { closest: () => shell, getBoundingClientRect: () => ({ height }) };
  const auth = { isInitializing: initializing, isAuthenticated: signedIn, phase,
    requestAuthenticatedDestination: (intent, view) => requested.push({ intent, view }),
    requestAuth() { throw Error('Shared entry must not open authentication automatically.'); },
  };
  const { SharedSignInBar } = load('../src/components/profile/SharedSignInBar.tsx', {
    react, 'react-router-dom': { useLocation: () => ({ pathname: path, search }) },
    '../../contexts/AuthContext': { useAuth: () => auth },
    '../../features/auth/registration': registration, './shared-sign-in-bar.css': {},
  }, { window: { sessionStorage: {
    getItem(key) { if (blockedStorage) throw Error('Storage unavailable'); return storage.get(key) ?? null; },
    setItem(key, value) { if (blockedStorage) throw Error('Storage unavailable'); storage.set(key, value); },
  } }, document: { querySelector(selector) { assert.equal(selector, '#app-viewport .app-screen-layer:not([aria-hidden="true"]) > main', 'Focus must skip the outgoing, inert screen during navigation.'); return { focus: options => focusCalls.push(options) }; } },
  ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe(element) { assert.equal(element, bar); } disconnect() { this.disconnected = true; } },
  });
  return { auth, requested, storage, styles, focusCalls, observers,
    resize(value) { height = value; observers.at(-1)?.callback(); },
    render() { cursor = 0; const tree = SharedSignInBar({ name }); barRef.current = tree ? bar : null;
      pendingEffects.splice(0).forEach(effect => effect()); return tree; },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('public sign-in bar offers optional account actions only for a verified guest and readable creator', () => {
  const visitor = signInBar();
  const tree = visitor.render();
  assert.equal(tree.type, 'aside');
  assert.equal(tree.props['data-shared-sign-in-bar'], '');
  assert.equal(nodes(tree).some(node => node.props.role === 'dialog' || node.props['aria-modal']), false);
  const buttons = nodes(tree).filter(node => node.type === 'button');
  assert.equal(buttons.length, 3); assert.equal(buttons[0].props.children, 'Sign in');
  assert.equal(buttons[1].props.children, 'Create account'); assert.equal(buttons[2].props['aria-label'], 'Dismiss sign-in bar');
  assert.ok(nodes(tree).some(node => node.props.className === 'shared-sign-in-identity' && React.Children.toArray(node.props.children).join('') === "Viewing Creator Name's portfolio"));
  assert.equal(visitor.requested.length, 0);
  for (const options of [{ name: '' }, { name: null }, { initializing: true }, { signedIn: true }, { initializing: true, signedIn: true }, { path: '/' }, { path: '/studio' }, { path: '/profile/creator' }, { path: '/share' }, { path: '/shared/creator' }]) {
    const h = signInBar(options);
    assert.equal(h.render(), null); assert.equal(h.requested.length, 0);
  }
});

test('shared Sign in targets the account and Create account preserves a safe shared destination', () => {
  for (const [label, view] of [['Sign in', 'signIn'], ['Create account', 'signUp']]) {
  const h = signInBar({ search: '?view=portals&page=12&media=image-a&code=secret&access_token=secret&next=https%3A%2F%2Fevil.test' });
  const button = nodes(h.render()).find(node => node.type === 'button' && node.props.children === label);
  assert.equal(h.requested.length, 0);
  button.props.onClick();
  assert.equal(h.requested.length, 1);
  assert.equal(h.requested[0].view, view);
  if (view === 'signIn') { assert.deepEqual(JSON.parse(JSON.stringify(h.requested[0])), { intent: { kind: 'my-profile' }, view: 'signIn' }); continue; }
  assert.equal(h.requested[0].intent.kind, 'route');
  assert.equal(h.requested[0].intent.path, '/share/creator/c/art/project?view=portals&page=12&media=image-a');
  assert.doesNotMatch(h.requested[0].intent.path, /secret|next=|access_token|code=/);
  h.auth.isAuthenticated = true; assert.equal(h.render(), null);
  const busy = signInBar({ phase: 'authenticating' });
  assert.equal(nodes(busy.render()).find(node => node.type === 'button' && node.props.children === label).props.disabled, true);
  }
});

test('shared profile, category and project account actions choose the correct destination', () => {
  for (const [path, search] of [['/share/creator', '?view=portals'], ['/share/creator/c/art', '?view=projects'], ['/share/creator/c/art/project', '?page=5&media=page-a']]) for (const label of ['Sign in', 'Create account']) {
    const h = signInBar({ path, search });
    nodes(h.render()).find(node => node.type === 'button' && node.props.children === label).props.onClick();
    if (label === 'Sign in') assert.deepEqual(JSON.parse(JSON.stringify(h.requested[0])), { intent: { kind: 'my-profile' }, view: 'signIn' });
    else assert.equal(h.requested[0].intent.path, path + search);
  }
});

test('dismissal persists across shared-route remounts and returns focus to the active content layer', () => {
  const h = signInBar();
  nodes(h.render()).find(node => node.props['aria-label'] === 'Dismiss sign-in bar').props.onClick();
  assert.equal(h.render(), null); assert.equal(h.requested.length, 0);
  assert.equal(h.focusCalls.length, 1); assert.equal(h.focusCalls[0].preventScroll, true);
  h.unmount();
  assert.equal(signInBar({ path: '/share/another-creator', storage: h.storage }).render(), null);
  assert.ok(signInBar().render(), 'A new session shows the available account actions again.');
});

test('blocked session storage still permits local dismissal without losing the reading page', () => {
  const h = signInBar({ blockedStorage: true });
  const tree = h.render(); assert.ok(tree);
  nodes(tree).find(node => node.props['aria-label'] === 'Dismiss sign-in bar').props.onClick();
  assert.equal(h.render(), null); assert.equal(h.focusCalls.length, 1); assert.equal(h.requested.length, 0);
});

test('bar geometry follows wrapping and clears its reserved height after dismissal or unmount', () => {
  for (const finish of ['dismiss', 'unmount']) {
    const h = signInBar(); const tree = h.render();
    assert.equal(h.styles.get('--shared-sign-in-height'), '56px');
    h.resize(88); assert.equal(h.styles.get('--shared-sign-in-height'), '88px');
    if (finish === 'dismiss') { nodes(tree).find(node => node.props['aria-label'] === 'Dismiss sign-in bar').props.onClick(); h.render(); }
    else h.unmount();
    assert.equal(h.styles.has('--shared-sign-in-height'), false); assert.equal(h.observers[0].disconnected, true);
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
    '../ui/ConfirmationDialog': { ConfirmationDialog: 'discard-confirmation' },
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
  // The independent RUM clock now precedes the appearance/bootstrap script.
  // Execute the actual shared-view initializer, not whichever script is first.
  const script = [...html.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(source => source.includes("toggleAttribute('data-shared-view'"));
  assert.ok(script); assert.ok(html.indexOf(script) < html.indexOf('<body>'));
  for (const [pathname, expected] of [['/share/a', true], ['/share/a/c/b/c', true], ['/share', true], ['/', false], ['/settings', false], ['/shared/a', false]]) for (const presentation of ['mobile', 'web']) {
    const attributes = new Map();
    const root = { dataset: {}, style: {}, toggleAttribute(name, enabled) { if (enabled) attributes.set(name, ''); else attributes.delete(name); } };
    const themeTags = ['#ffffff', '#000000'].map(content => {
      const attributes = new Map([['content', content]]);
      return { getAttribute: name => attributes.get(name) ?? null, setAttribute: (name, value) => attributes.set(name, value) };
    });
    vm.runInNewContext(script, {
      document: { documentElement: root, querySelectorAll(selector) {
        assert.equal(selector, 'meta[name="theme-color"]');
        return themeTags;
      } },
      window: { location: { pathname }, navigator: {}, localStorage: { getItem: () => null },
        matchMedia: query => ({ matches: query.includes('max-width') ? presentation === 'mobile' : false }),
      },
    });
    assert.equal(attributes.has('data-shared-view'), expected);
    assert.equal(root.dataset.appearance, 'light');
    assert.deepEqual(themeTags.map(tag => tag.getAttribute('content')), presentation === 'mobile' ? ['#ffffff', '#ffffff'] : ['#ffffff', '#000000']);
    assert.deepEqual(themeTags.map(tag => tag.getAttribute('data-portalink-theme-original')), presentation === 'mobile' ? ['#ffffff', '#000000'] : [null, null]);
  }
  assert.match(html, /html\[data-shared-view\] #portalink-preboot picture\s*\{\s*display:\s*none;/);
  assert.match(html, /html\[data-shared-view\] #portalink-preboot \.portalink-preboot-media,\s*html\[data-shared-view\] #portalink-preboot picture\s*\{\s*display:\s*none;/,
    'hide the sized media wrapper too, so the shared loading label stays centered');
  assert.match(html, /html\[data-shared-view\] #portalink-preboot::after\s*\{[^}]*Opening shared content/);
  const app = read('../src/App.tsx');
  assert.doesNotMatch(app, /isSharedRoute && <SharedSignInBar/);
  assert.match(app, /<AuthDialog[^>]*showWelcomeMedia=\{!isSharedRoute\}/);
});
