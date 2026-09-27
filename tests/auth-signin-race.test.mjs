import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, ...globals, require(name) {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}
const authTypes = load('../src/types/auth.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const session = (id = 'account-a', extra = {}) => ({
  user: { id, email: `${id}@example.test`, profileId: `profile-${id}`, displayName: id, initials: 'A', isEmailVerified: true },
  isPrototype: false,
  ...extra,
});
const input = { email: 'account-a@example.test', password: 'synthetic-test-password' };
const intent = { kind: 'route', path: '/share/creator/c/photos', label: 'view shared content' };

function harness() {
  const slots = [], effects = [], listeners = new Set(), restores = [], signIns = [], signOuts = [];
  let cursor = 0, stateWrites = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { stateWrites++; slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: callback() };
      });
    },
  };
  const auth = {
    getSession() { const request = deferred(); restores.push(request); return request.promise; },
    onAuthStateChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    signIn(value) { const request = { ...deferred(), input: value }; signIns.push(request); return request.promise; },
    signOut() { const request = deferred(); signOuts.push(request); return request.promise; },
  };
  const { AuthProvider } = load('../src/contexts/AuthContext.tsx', {
    react, './ServicesContext': { useServices: () => ({ auth }) }, '../types/auth': authTypes,
    '../utils/passwordRecoveryReturn': { isPasswordRecoveryReturn: () => false, clearPasswordRecoveryReturn() {} },
  }, { window: { location: { href: 'https://example.test/' } }, document: { activeElement: null }, HTMLElement: class {} });
  const render = () => {
    cursor = 0;
    const context = AuthProvider({ children: null }).props.value;
    effects.splice(0).forEach(effect => effect());
    return context;
  };
  render();
  return {
    render, restores, signIns, signOuts, listeners,
    get stateWrites() { return stateWrites; },
    async initialize(value = null) { restores[0].resolve(value); await tick(); return render(); },
    emit(value, failure) { for (const listener of listeners) listener(value, failure); },
    begin() {
      render().requestAuthenticatedDestination(intent);
      return render().signIn(input);
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('an ordinary sign-in closes the form and preserves its destination for one consumption', async () => {
  const h = harness(); await h.initialize();
  const pending = h.begin();
  assert.equal(h.render().phase, 'authenticating');
  const next = session(); h.signIns[0].resolve(next);
  assert.equal(await pending, next);
  const context = h.render();
  assert.equal(context.session, next);
  assert.equal(context.phase, 'authenticated');
  assert.equal(context.pendingView, null);
  assert.equal(context.error, null);
  assert.equal(context.consumePendingIntent(), intent);
  assert.equal(context.consumePendingIntent(), null);
  assert.equal(h.signIns.length, 1);
  assert.equal(h.signOuts.length, 0);
  h.unmount();
});

test('same-account SIGNED_IN can complete the form without replacing its newer profile details', async () => {
  const h = harness(); await h.initialize();
  const pending = h.begin();
  const older = session(), newer = session();
  newer.user = { ...newer.user, profileId: 'newer-profile', displayName: 'Updated name' };
  h.emit(newer);
  // No render is needed for the accepted event to invalidate an old snapshot.
  h.signIns[0].resolve(older);
  assert.equal(await pending, newer);
  const context = h.render();
  assert.equal(context.session, newer);
  assert.equal(context.viewerProfileId, 'newer-profile');
  assert.equal(context.pendingView, null);
  assert.equal(context.peekPendingIntent(), intent);
  assert.equal(context.phase, 'authenticated');
  h.unmount();
});

test('a late sign-in failure cannot demote or add an error to a newer authenticated session', async () => {
  for (const account of ['account-a', 'account-b']) {
    const h = harness(); await h.initialize();
    const pending = h.begin(), newer = session(account);
    h.emit(newer);
    h.signIns[0].reject(new authTypes.AuthServiceError('network', 'Profile lookup temporarily unavailable.'));
    assert.equal(await pending, null);
    const context = h.render();
    assert.equal(context.session, newer);
    assert.equal(context.phase, 'authenticated');
    assert.equal(context.isAuthenticated, true);
    assert.equal(context.error, null);
    assert.equal(context.peekPendingIntent(), intent);
    h.unmount();
  }
});

test('a late successful sign-in cannot replace another account or close its account form', async () => {
  const h = harness(); await h.initialize();
  const pending = h.begin(), newer = session('account-b');
  h.emit(newer);
  h.signIns[0].resolve(session());
  assert.equal(await pending, null);
  const context = h.render();
  assert.equal(context.session, newer);
  assert.equal(context.phase, 'authenticated');
  assert.equal(context.pendingView, 'signIn');
  assert.equal(context.peekPendingIntent(), intent);
  assert.equal(context.error, null);
  h.unmount();
});

test('a newer null session wins even when sign-in began with the same null session', async () => {
  for (const fail of [false, true]) {
    const h = harness(); await h.initialize();
    const pending = h.begin();
    h.emit(null);
    if (fail) h.signIns[0].reject(new authTypes.AuthServiceError('network', 'Late lookup failure.'));
    else h.signIns[0].resolve(session());
    assert.equal(await pending, null);
    const context = h.render();
    assert.equal(context.session, null);
    assert.equal(context.phase, 'unauthenticated');
    assert.equal(context.error, null);
    assert.equal(context.pendingView, 'signIn');
    h.unmount();
  }
});

test('starting explicit sign-out invalidates an older sign-in before sign-out completes', async () => {
  for (const fail of [false, true]) {
    const h = harness(); await h.initialize(session());
    const pending = h.begin();
    const signingOut = h.render().signOut();
    assert.equal(h.render().phase, 'signing-out');
    if (fail) h.signIns[0].reject(new authTypes.AuthServiceError('network', 'Late lookup failure.'));
    else h.signIns[0].resolve(session());
    assert.equal(await pending, null);
    assert.equal(h.render().phase, 'signing-out');
    assert.equal(h.render().error, null);
    h.signOuts[0].resolve();
    assert.equal(await signingOut, true);
    assert.equal(h.render().session, null);
    assert.equal(h.render().phase, 'unauthenticated');
    assert.equal(h.signOuts.length, 1);
    h.unmount();
  }
});

test('an accepted recovery session keeps its password form despite older sign-in completion', async () => {
  for (const fail of [false, true]) {
    const h = harness(); await h.initialize();
    const pending = h.begin(), recovery = session('account-a', { isPasswordRecovery: true });
    h.emit(recovery);
    if (fail) h.signIns[0].reject(new authTypes.AuthServiceError('network', 'Late lookup failure.'));
    else h.signIns[0].resolve(session());
    assert.equal(await pending, null);
    const context = h.render();
    assert.equal(context.session, recovery);
    assert.equal(context.phase, 'authenticated');
    assert.equal(context.pendingView, 'resetPassword');
    assert.equal(context.error, null);
    assert.equal(context.peekPendingIntent(), intent);
    h.unmount();
  }
});

test('ordinary failure remains visible, duplicate submissions stay guarded, and a later retry can succeed', async () => {
  const h = harness(); await h.initialize();
  const pending = h.begin();
  assert.equal(await h.render().signIn(input), null);
  assert.equal(h.signIns.length, 1);
  h.signIns[0].reject(new authTypes.AuthServiceError('invalid_credentials', 'That email and password do not match an account.'));
  assert.equal(await pending, null);
  let context = h.render();
  assert.equal(context.phase, 'unauthenticated');
  assert.equal(context.error.code, 'invalid_credentials');
  assert.equal(context.pendingView, 'signIn');
  assert.equal(context.peekPendingIntent(), intent);
  const retry = context.signIn(input);
  h.signIns[1].resolve(session());
  await retry;
  context = h.render();
  assert.equal(context.phase, 'authenticated');
  assert.equal(context.error, null);
  assert.equal(context.pendingView, null);
  assert.equal(h.signIns.length, 2);
  h.unmount();
});

test('an account-switch lookup failure clears the old identity and keeps its actionable error through a late rejection', async () => {
  const h = harness(); await h.initialize(session('account-b'));
  const pending = h.begin();
  const failure = { code: 'session_not_ready', message: authTypes.SESSION_NOT_READY_MESSAGE };
  h.emit(null, failure);
  h.signIns[0].reject(new authTypes.AuthServiceError(failure.code, failure.message));
  assert.equal(await pending, null);
  let context = h.render();
  assert.equal(context.session, null);
  assert.equal(context.phase, 'failed');
  assert.equal(context.error, failure);
  assert.equal(context.pendingView, 'signIn');
  const retry = context.signIn(input);
  h.signIns[1].resolve(session());
  await retry;
  context = h.render();
  assert.equal(context.phase, 'authenticated');
  assert.equal(context.error, null);
  assert.equal(context.pendingView, null);
  h.unmount();
});

test('provider cleanup prevents pending sign-in completions from writing state', async () => {
  for (const fail of [false, true]) {
    const h = harness(); await h.initialize();
    const pending = h.begin();
    h.unmount();
    const before = h.stateWrites;
    assert.equal(h.listeners.size, 0);
    if (fail) h.signIns[0].reject(new authTypes.AuthServiceError('network', 'Late lookup failure.'));
    else h.signIns[0].resolve(session());
    assert.equal(await pending, null);
    assert.equal(h.stateWrites, before);
  }
});

test('retrying initialization invalidates a pending sign-in without blocking the new restore', async () => {
  const h = harness(); await h.initialize();
  const pending = h.begin();
  h.render().retryInitialize(); h.render();
  assert.equal(h.render().phase, 'initializing');
  h.signIns[0].resolve(session());
  assert.equal(await pending, null);
  assert.equal(h.render().phase, 'initializing');
  const next = session('account-b');
  h.restores[1].resolve(next); await tick();
  assert.equal(h.render().session, next);
  assert.equal(h.render().phase, 'authenticated');
  h.unmount();
});

test('a newer auth event still wins over the initial restoration request', async () => {
  const h = harness(), recovery = session('account-b', { isPasswordRecovery: true });
  h.emit(recovery);
  await h.initialize(session('account-a'));
  const context = h.render();
  assert.equal(context.session, recovery);
  assert.equal(context.pendingView, 'resetPassword');
  assert.equal(context.phase, 'authenticated');
  h.unmount();
});

test('completed deletion cannot be undone by a sign-in already in flight', async () => {
  const h = harness(); await h.initialize(session());
  const pending = h.begin();
  h.render().completeAccountDeletion();
  h.signIns[0].resolve(session());
  assert.equal(await pending, null);
  const context = h.render();
  assert.equal(context.session, null);
  assert.equal(context.phase, 'unauthenticated');
  assert.equal(context.pendingView, null);
  assert.equal(context.peekPendingIntent(), null);
  h.unmount();
});
