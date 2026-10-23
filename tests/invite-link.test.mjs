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
  const source = read('../src/components/ControlCenterPage.tsx');
  const handler = source.slice(source.indexOf('  async function inviteFriend()'), source.indexOf('  async function handleSignOut()'));
  const exports = {}, copied = [], statuses = [];
  vm.runInNewContext(transpile(handler.replace('async function inviteFriend', 'export async function inviteFriend').replace('async function copyInvite', 'export async function copyInvite')), {
    exports, URL, DOMException, profileHref, PUBLIC_ORIGIN: 'https://portalink.example', buildPath: routes.buildPath,
    window: { location: { origin: 'http://127.0.0.1:5193' } },
    navigator: { share, clipboard: { async writeText(value) { if (clipboardFails) throw Error('Unavailable'); copied.push(value); } } },
    setInviteStatus(value) { statuses.push(value); },
  });
  return { run: exports.inviteFriend, copy: exports.copyInvite, copied, statuses };
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
    assert.deepEqual(h.statuses, ['idle', 'copied']);
  }
  const denied = invite({ clipboardFails: true }); await denied.run();
  assert.deepEqual(denied.statuses, ['idle', 'failed']);
});

test('cancelling native sharing does not copy or claim an invitation was sent', async () => {
  const h = invite({ share: async () => { throw new DOMException('Cancelled', 'AbortError'); } });
  await h.run(); assert.deepEqual(h.copied, []); assert.deepEqual(h.statuses, ['idle']);
});

test('the sidebar gear directly opens Settings without a menu in either sidebar size', () => {
  const source = read('../src/components/Sidebar.tsx');
  const ast = ts.createSourceFile('Sidebar.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'SettingsTrigger');
  const code = ts.transpileModule(`export ${component.getText(ast)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, React, InterfaceIcon: () => null, SettingsIcon: () => null });
  for (const collapsed of [true, false]) {
    let opened = 0;
    const button = exports.SettingsTrigger({ collapsed, onOpen: () => opened++ });
    assert.equal(button.props['aria-label'], 'Open settings');
    assert.equal(button.props['aria-haspopup'], undefined);
    button.props.onClick();
    assert.equal(opened, 1);
  }
  assert.doesNotMatch(source, /AccountMenuTrigger|account-menu-popover/);
});

 test('explicit copy invite works even when native sharing exists and reports clipboard failures', async () => {
  for (const clipboardFails of [false, true]) {
    const h = invite({ clipboardFails, share: async () => assert.fail('Copy must not open native sharing') });
    await h.copy();
    assert.deepEqual(h.copied, clipboardFails ? [] : ['https://portalink.example/?welcome=1']);
    assert.deepEqual(h.statuses, ['idle', clipboardFails ? 'failed' : 'copied']);
  }
});
test('invite entry holds Hello World on both presentations without requesting signup', () => {
  const source = read('../src/app/ApplicationBootstrap.tsx');
  assert.doesNotMatch(source, /invitePresented|auth.requestAuth\('signUp'\)/);
  const expression = source.match(/const holdLanding = (.*);/)[1];
  for (const presentation of ['mobile', 'web']) {
    for (const [isAuthenticated, isRecovery, isInitializing, expected] of [[false,false,false,true],[true,false,false,false],[false,true,false,false],[false,false,true,false]]) {
      assert.equal(vm.runInNewContext(expression, { Boolean, isSharedView:false, landingPath:'/', hasLeftLanding:false, presentation, isWelcomeInvite:true, isRecovery, auth:{isAuthenticated,isInitializing} }), expected);
    }
  }
});