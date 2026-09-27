import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const routes = {};
vm.runInNewContext(transpile(read('../src/app/routes.ts')), { exports: routes, require: () => ({ navigationDestinations: [] }) });

// Exercise the actual account-menu handler without sending a real invitation.
function invite({ profileHref, share, clipboardFails = false } = {}) {
  const source = read('../src/components/Sidebar.tsx');
  const handler = source.slice(source.indexOf('  async function inviteFriend()'), source.indexOf('  async function handleAuthAction()'));
  const exports = {}, copied = [], statuses = [];
  vm.runInNewContext(transpile(handler.replace('async function inviteFriend', 'export async function inviteFriend')), {
    exports, URL, DOMException, profileHref, buildPath: routes.buildPath,
    window: { location: { origin: 'https://portalink.example' } },
    navigator: { share, clipboard: { async writeText(value) { if (clipboardFails) throw Error('Unavailable'); copied.push(value); } } },
    setInviteStatus(value) { statuses.push(value); },
  });
  return { run: exports.inviteFriend, copied, statuses };
}

test('native invitations always share welcome, regardless of the sender or viewed profile', async () => {
  for (const profileHref of ['/p/sender', '/share/another-creator/c/portal/project?page=3', undefined]) {
    const payloads = [];
    const h = invite({ profileHref, share: async payload => payloads.push(payload) });
    await h.run();
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].url, 'https://portalink.example/?welcome=1');
    assert.equal(payloads[0].text, 'Join me on the Portalink Network.');
    assert.deepEqual(h.copied, []);
  }
});

test('clipboard fallback copies the same invitation URL and only confirms successful copying', async () => {
  for (const share of [undefined, async () => { throw Error('Sharing unavailable'); }]) {
    const h = invite({ profileHref: '/p/sender', share }); await h.run();
    assert.deepEqual(h.copied, ['https://portalink.example/?welcome=1']);
    assert.deepEqual(h.statuses, ['copied']);
  }
  const denied = invite({ clipboardFails: true }); await denied.run();
  assert.deepEqual(denied.statuses, []);
});

test('cancelling native sharing does not copy or claim an invitation was sent', async () => {
  const h = invite({ share: async () => { throw new DOMException('Cancelled', 'AbortError'); } });
  await h.run(); assert.deepEqual(h.copied, []); assert.deepEqual(h.statuses, []);
});

test('account menu keeps its actions and fixed placement while inheriting shell appearance on WEB and MOBILE', () => {
  const source = read('../src/components/Sidebar.tsx');
  const ast = ts.createSourceFile('Sidebar.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'AccountMenuTrigger');
  const code = ts.transpileModule(`export ${component.getText(ast)}`, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } }).outputText;
  const all = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(all)] : [];
  const label = node => React.isValidElement(node) ? React.Children.toArray(node.props.children).map(label).join('') : String(node ?? '');
  for (const presentation of ['web', 'mobile']) for (const appShell of [{}, null]) {
    let cursor = 0;
    const state = [], portalTargets = [], calls = [], body = {}, exports = {};
    const context = { React, exports,
      useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
      useRef: () => ({ current: null }), useCallback: fn => fn, useEffect() {}, useLayoutEffect() {},
      usePresentation: () => presentation, useMenuFocus: () => ({ onTriggerKeyDown() {} }),
      document: { body, querySelector: selector => { assert.equal(selector, '.app-shell'); return appShell; } },
      createPortal: (child, target) => { portalTargets.push(target); return child; },
      InterfaceIcon: () => null, SettingsIcon: () => null, CircleUserRoundIcon: () => null,
      SendIcon: () => null, LogInIcon: () => null, LogOutIcon: () => null,
    };
    vm.runInNewContext(code, context);
    const props = { collapsed: false, accentColor: '#FF375F', theme: 'dark', isAuthenticated: false,
      isAuthActionPending: false, onSettingsOpen: () => calls.push('settings'), onSignIn() {}, onSignOut: async () => true };
    const render = () => { cursor = 0; return exports.AccountMenuTrigger(props); };
    all(render()).find(node => node.props['aria-haspopup'] === 'menu').props.onClick();
    const menu = all(render()).find(node => node.props.role === 'menu');
    assert.equal(portalTargets.at(-1), appShell ?? body);
    assert.equal(menu.props['data-presentation'], presentation);
    assert.equal(menu.props.style.position, 'fixed');
    assert.equal(menu.props.style.zIndex, 10000);
    assert.doesNotMatch(menu.props.className, /theme-(dark|light)|accent-theme/);
    assert.deepEqual(Object.keys(menu.props.style).filter(name => name.startsWith('--')), []);
    all(menu).find(node => node.props.role === 'menuitem' && label(node) === 'Settings').props.onClick();
    assert.deepEqual(calls, ['settings']);
    assert.equal(all(render()).some(node => node.props.role === 'menu'), false);
  }
});
