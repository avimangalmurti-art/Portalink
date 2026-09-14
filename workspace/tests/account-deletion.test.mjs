import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const compile = (path) => ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

test('production endpoint is unconditionally disabled without constructing clients or touching data', async () => {
  let handler;
  vm.runInNewContext(compile('supabase/functions/delete-account/index.ts'), {
    exports: {}, Response, Deno: { serve: fn => { handler = fn; } },
    require: () => { throw new Error('Disabled endpoint must not import a client'); },
  });
  for (const body of [{}, { action: 'request', confirmation: 'owner@example.test' }]) {
    const result=await handler(new Request('https://example.test/delete-account',{method:'POST',body:JSON.stringify(body)}));
    assert.equal(result.status,503); assert.equal((await result.json()).isDeleted,false);
  }
  assert.equal((await handler(new Request('https://example.test/delete-account',{method:'OPTIONS'}))).status,200);
});

function authService(client, enabled = true) {
  const authTypes = {};
  vm.runInNewContext(compile('src/types/auth.ts'), { exports: authTypes });
  const exports = {};
  vm.runInNewContext(compile('src/services/supabase/authService.ts'), { exports, Response, require(name) {
    if (name === './client') return { accountDeletionEnabled: enabled, requireSupabase: () => client, clearDeletedAccountStorage: () => client.clearStorage?.() };
    if (name.endsWith('/features/auth/registration')) return { readRegistrationProfile: () => undefined };
    if (name.endsWith('/types/auth')) return authTypes;
    if (name.endsWith('/utils/passwordRecoveryReturn')) return {};
    throw new Error(name);
  } });
  return exports.supabaseAuthService;
}
test('client schedules only its verified account and keeps the session for cancellation', async () => {
 const calls=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'a',email:'owner@example.test'}}}),signOut:async()=>{throw Error('Must keep session');}},functions:{invoke:async(name,options)=>{calls.push(options.body);return {data:{status:'pending',deleteAfter:'2030-01-03T00:00:00Z'}};}}};
 await assert.rejects(authService(client).deleteAccount({accountId:'other',confirmation:'owner@example.test'}));
 assert.equal(calls.length,0);
 const result=await authService(client).deleteAccount({accountId:'a',confirmation:'owner@example.test'});
 assert.equal(result.isDeleted,false);assert.equal(result.status,'pending');assert.equal(calls[0].action,'request');
 await assert.rejects(authService(client,false).deleteAccount({accountId:'a',confirmation:'owner@example.test'}));
 assert.equal(calls.length,1);
});

test('client keeps server error details and does not sign out on a failed deletion', async () => {
  let signedOut = false;
  const service = authService({ auth: {
    getUser: async () => ({ data: { user: { id: 'a', email: 'owner@example.com' } } }),
    signOut: async () => { signedOut = true; },
  }, functions: { invoke: async () => ({ error: { context: Response.json({ message: 'Sign in again.' }, { status: 401 }) } }) } });
  await assert.rejects(service.deleteAccount({ accountId: 'a', confirmation: 'owner@example.com' }), (error) => error.code === 'reauthentication_required' && error.message === 'Sign in again.');
  assert.equal(signedOut, false);
});

test('confirmation cannot bypass unavailable capability or submit the deletion twice', async () => {
  const capability = deferred();
  const deletion = deferred();
  let calls = 0;
  const h = hookHarness(new URL('../src/features/auth/useAccountDeletion.ts', import.meta.url), 'useAccountDeletion', { auth: {
    getAccountDeletionCapability: () => capability.promise,
    deleteAccount: () => { calls++; return deletion.promise; },
  } }, {}, { accountId: 'a', accountEmail: 'owner@example.com' });
  await h.flush();
  h.value.setConfirmation('owner@example.com');
  assert.equal(h.value.submit(), false);
  capability.resolve({ isAvailable: true, removes: [] });
  await h.flush();
  assert.equal(h.value.submit(), true);
  assert.equal(h.value.submit(), false);
  assert.equal(calls, 1);
  deletion.resolve({ isDeleted: true, message: 'Deleted.' });
  await h.flush();
  assert.equal(h.value.submit(), false);
  assert.equal(calls, 1);
  h.dispose();
});

test('retry revalidates confirmation, and reset clears previously typed consent', async () => {
  let calls = 0;
  const h = hookHarness(new URL('../src/features/auth/useAccountDeletion.ts', import.meta.url), 'useAccountDeletion', { auth: {
    getAccountDeletionCapability: async () => ({ isAvailable: true, removes: [] }),
    deleteAccount: async () => { calls++; throw new Error('offline'); },
  } }, {}, { accountId: 'a', accountEmail: 'owner@example.com' });
  await h.flush();
  h.value.setConfirmation('owner@example.com');
  h.value.submit();
  await h.flush();
  h.value.setConfirmation('other@example.com');
  assert.equal(h.value.retry(), false);
  assert.equal(calls, 1);
  h.value.setConfirmation('owner@example.com');
  h.value.reset();
  assert.equal(h.value.confirmation, '');
  assert.equal(h.value.canSubmit, false);
  h.dispose();
});

test('pending deletion survives closing the dialog and can be cancelled with new requests disabled', async () => {
  const h=hookHarness(new URL('../src/features/auth/useAccountDeletion.ts',import.meta.url),'useAccountDeletion',{auth:{
    getAccountDeletionCapability:async()=>({isAvailable:false,removes:[]}),
    getAccountDeletionStatus:async()=>({isDeleted:false,status:'pending',deleteAfter:'2030-01-03',message:'Scheduled'}),
    cancelAccountDeletion:async()=>({isDeleted:false,status:'cancelled',message:'Restored'}),
  }},{},{accountId:'a',accountEmail:'owner@example.test'});
  await h.flush();await h.value.refreshStatus();await h.flush();
  h.value.reset();await h.flush();assert.equal(h.value.result.status,'pending');assert.equal(h.value.canSubmit,false);
  await h.value.cancel();await h.flush();assert.equal(h.value.result.status,'cancelled');assert.equal(h.value.result.isDeleted,false);
  h.dispose();
});

function component(file, name, props) {
  let cursor = 0;
  const state = [];
  const exports = {};
  vm.runInNewContext(compile(file), { exports, require(dependency) {
    if (dependency === 'react/jsx-runtime') return jsxRuntime;
    if (dependency === 'react') return { ...React, useEffect() {}, useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    } };
    if (dependency.endsWith('navButtonTokens')) return {
      findNavAccent: () => ({ label: 'Pink', dark: '#ff375f', light: '#ff375f' }),
      findSystemGray: () => ({ label: 'System Gray 6' }), navAccents: [], systemGrays: [],
    };
    if (dependency === 'framer-motion') return { useReducedMotion: () => true };
    return new Proxy({}, { get: (_, key) => key });
  } });
  return () => { cursor = 0; return exports[name](props); };
}
function nodes(tree) {
  return !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}
test('Appearance starts fully collapsed, opens manually and resets on a fresh visit', () => {
  const visit = () => component('src/components/settings/NavigationButtonsPanel.tsx', 'NavigationButtonsPanel', { theme: 'dark', appearanceMode: 'dark', accentColor: '#ff375f' });
  const render = visit();
  const accordions = () => nodes(render()).filter((node) => node.props?.onToggle && 'isOpen' in node.props);
  assert.equal(accordions().length, 2);
  assert.ok(accordions().every((node) => node.props.isOpen === false));
  accordions()[1].props.onToggle();
  assert.equal(accordions()[1].props.isOpen, true);
  accordions()[1].props.onToggle();
  assert.ok(accordions().every((node) => node.props.isOpen === false));
  assert.ok(nodes(visit()()).filter((node) => node.props?.onToggle && 'isOpen' in node.props).every((node) => node.props.isOpen === false));
});
