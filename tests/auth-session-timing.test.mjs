import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, URL, Error, ...globals, require(name) {
    if (name.endsWith('/socialRegistration')) return {socialRegistration: () => undefined};
    if (name.endsWith('/EntryChoices')) return {EntryChoices: 'EntryChoices'};
    if (name.endsWith('/EntryAgreements')) return {useEntryAgreements: () => ({request: async () => true})};
    if (name.endsWith('/ConfirmationDialog')) return {ConfirmationDialog: 'ConfirmationDialog'};

    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}

const authTypes = load('src/types/auth.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const outcome = promise => promise.then(value => ({ value }), error => ({ error }));
const futureJwt = (message = 'JWT issued at future') => ({ code: 'PGRST301', message, details: null, hint: null });
const profile = accountId => ({ id: `profile-${accountId}`, name: `Creator ${accountId}` });
const session = (accountId = 'account-a', token = `synthetic-access-${accountId}`) => ({
  access_token: token, refresh_token: `synthetic-refresh-${accountId}`,
  user: { id: accountId, email: `${accountId}@example.test`, email_confirmed_at: '2026-09-27T00:00:00Z',
    user_metadata: { profile_id: 'untrusted-profile', display_name: 'Untrusted name' } },
});

function fakeClock() {
  let now = 0, nextId = 0;
  const pending = new Map(), delays = [];
  return {
    delays, pending,
    setTimeout(fn, delay = 0) {
      const id = ++nextId;
      delays.push(delay); pending.set(id, { fn, at: now + delay }); return id;
    },
    clearTimeout(id) { pending.delete(id); },
    async advance(duration) {
      await tick();
      const end = now + duration;
      for (let count = 0; ; count++) {
        assert.ok(count < 30, 'Session work must not create an unbounded timer loop');
        const entry = [...pending].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [id, timer] = entry;
        now = timer.at; pending.delete(id); timer.fn(); await tick();
      }
      now = end; await tick();
    },
  };
}

function serviceHarness() {
  const clock = fakeClock();
  const state = {
    current: session(), callback: null, reads: [], signIns: [], signUps: [], getSessionReads: 0,
    writes: [], refreshes: 0, signOuts: 0, freshUserReads: 0, localDraftReads: 0,
    signInError: null, emitOnSignIn: false, readUser: null,
    read: accountId => ({ data: profile(accountId), error: null }),
  };
  const forbidWrite = operation => () => {
    state.writes.push(operation); assert.fail(`Session timing recovery must not perform ${operation}`);
  };
  const client = {
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select(columns) {
          assert.equal(columns, 'id,name');
          return { eq(column, accountId) {
            assert.equal(column, 'account_id');
            return { async maybeSingle() {
              state.reads.push({ accountId, token: state.current?.access_token });
              return state.read(accountId, state.reads.length);
            } };
          } };
        },
        insert: forbidWrite('profile insert'), update: forbidWrite('profile update'),
        upsert: forbidWrite('profile upsert'), delete: forbidWrite('profile delete'),
      };
    },
    storage: { from: forbidWrite('storage access') },
    auth: {
      async getSession() { state.getSessionReads++; return { data: { session: state.current }, error: null }; },
      async getUser() {
        state.freshUserReads++;
        return state.readUser ? state.readUser() : { data: { user: state.current?.user }, error: null };
      },
      async signInWithPassword(input) {
        state.signIns.push(input);
        if (state.signInError) return { data: { session: null }, error: state.signInError };
        if (state.emitOnSignIn) state.callback?.('SIGNED_IN', state.current);
        return { data: { session: state.current }, error: null };
      },
      async signUp(input) { state.signUps.push(input); return { data: { user: state.current?.user, session: state.current }, error: null }; },
      refreshSession() { state.refreshes++; assert.fail('A future-issued JWT must not mint another token'); },
      signOut() { state.signOuts++; assert.fail('A temporary profile-read rejection must not sign out'); },
      updateUser: forbidWrite('auth update'),
      onAuthStateChange(callback) {
        state.callback = callback;
        return { data: { subscription: { unsubscribe() { if (state.callback === callback) state.callback = null; } } } };
      },
    },
  };
  const auth = load('src/services/supabase/authService.ts', {
    '../../types/auth': authTypes,
    '../../features/auth/registration': {
      readRegistrationProfile: () => undefined,
      async readRegistrationDraft() { state.localDraftReads++; return null; },
    },
    './client': { requireSupabase: () => client, passwordRecovery: { read: () => null },
      recoveryCallbackFailed: false, accountDeletionEnabled: false },
    '../../utils/passwordRecoveryReturn': {},
  }, { window: { location: { origin: 'https://portalink.example.test' }, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout } }).supabaseAuthService;
  return { auth, state, clock,
    emit(event, next = state.current) { state.current = next; assert.ok(state.callback, 'Subscribe before emitting provider events'); state.callback(event, next); },
    assertReadOnly() {
      assert.deepEqual(state.writes, []); assert.equal(state.refreshes, 0); assert.equal(state.signOuts, 0);
    },
  };
}

function hookRuntime() {
  const slots = [], effects = []; let cursor = 0;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = { ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(factory, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; }); },
  };
  return { react, render(fn) { cursor = 0; const result = fn(); effects.splice(0).forEach(effect => effect()); return result; },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); } };
}

function providerHarness(auth) {
  const hooks = hookRuntime();
  const { AuthProvider } = load('src/contexts/AuthContext.tsx', {
    react: hooks.react, './ServicesContext': { useServices: () => ({ auth }) }, '../types/auth': authTypes,
    '../utils/passwordRecoveryReturn': { isPasswordRecoveryReturn: () => false, clearPasswordRecoveryReturn() {} },
  }, { window: { location: { href: 'https://portalink.example.test/' } }, document: { activeElement: null }, HTMLElement: class {} });
  return { render: () => hooks.render(() => AuthProvider({ children: null })).props.value, unmount: hooks.unmount };
}

test('only future-issued JWT errors become the actionable temporary sign-in message', () => {
  for (const message of ['JWT issued at future', 'JWT issued in the future', '{"code":"PGRST301","message":"JWT issued at future"}', 'JWT ISSUED AT FUTURE']) {
    const error = { message };
    assert.equal(authTypes.isFutureIssuedJwtError(error), true);
    assert.equal(authTypes.toAuthError(error).code, 'session_not_ready');
    assert.equal(authTypes.toAuthError(error).message, authTypes.SESSION_NOT_READY_MESSAGE);
    assert.doesNotMatch(authTypes.toAuthError(error).message, /JWT|PGRST|\{"/);
  }
  for (const value of [null, 'JWT issued at future', {}, { message: 1 }, { message: 'JWT expired' },
    { message: 'Invalid JWT signature' }, { message: 'Invalid login credentials' }, { message: 'Network request failed' }]) {
    assert.equal(authTypes.isFutureIssuedJwtError(value), false);
    assert.notEqual(authTypes.toAuthError(value).code, 'session_not_ready');
  }
});

test('future JWT profile reads retry after 500, 1000 and 2000ms without replaying sign-in or trusting metadata', async () => {
  for (const failures of [1, 2, 3]) {
    const h = serviceHarness();
    h.state.read = (accountId, count) => count <= failures ? { data: null, error: futureJwt() } : { data: profile(accountId), error: null };
    const pending = outcome(h.auth.signIn({ email: '  CREATOR@EXAMPLE.TEST ', password: 'synthetic-test-password' }));
    await tick();
    assert.equal(h.state.reads.length, 1);
    for (const [index, delay] of [500, 1000, 2000].slice(0, failures).entries()) {
      await h.clock.advance(delay - 1);
      assert.equal(h.state.reads.length, index + 1, 'No read may run before its backoff expires');
      await h.clock.advance(1);
      assert.equal(h.state.reads.length, index + 2);
    }
    const result = await pending;
    assert.equal(result.error, undefined);
    assert.equal(result.value.user.profileId, 'profile-account-a');
    assert.equal(result.value.user.displayName, 'Creator account-a');
    assert.deepEqual(h.clock.delays, [500, 1000, 2000].slice(0, failures));
    assert.equal(h.clock.pending.size, 0);
    assert.equal(h.state.signIns.length, 1);
    assert.equal(h.state.signIns[0].email, 'creator@example.test');
    assert.equal(h.state.signUps.length, 0);
    assert.equal(h.state.freshUserReads, 0); assert.equal(h.state.localDraftReads, 0);
    assert.ok(h.state.reads.every(read => read.accountId === 'account-a' && read.token === 'synthetic-access-account-a'));
    h.assertReadOnly();
  }
});

test('persistent future JWT rejection stops after four reads and never becomes an empty profile', async () => {
  const h = serviceHarness(); h.state.read = () => ({ data: null, error: futureJwt() });
  const pending = outcome(h.auth.getSession());
  await h.clock.advance(3500);
  const result = await pending;
  assert.equal(result.value, undefined);
  assert.equal(result.error.code, 'session_not_ready');
  assert.equal(result.error.message, authTypes.SESSION_NOT_READY_MESSAGE);
  assert.deepEqual(h.clock.delays, [500, 1000, 2000]);
  assert.equal(h.clock.pending.size, 0); assert.equal(h.state.reads.length, 4);
  assert.equal(h.state.freshUserReads, 0); assert.equal(h.state.localDraftReads, 0);
  assert.equal(h.state.signIns.length, 0); assert.equal(h.state.signUps.length, 0);
  h.assertReadOnly();
});

test('invalid credentials, invalid or expired tokens and unrelated failures are not timing retries', async () => {
  for (const [error, code] of [
    [{ code: 'PGRST301', message: 'JWT expired' }, 'reauthentication_required'],
    [{ code: 'PGRST301', message: 'Invalid JWT signature' }, 'reauthentication_required'],
    [{ code: '42501', message: 'Permission denied for profiles' }, 'network'],
    [{ message: 'Network request failed' }, 'network'],
  ]) {
    const h = serviceHarness(); h.state.read = () => ({ data: null, error });
    await assert.rejects(h.auth.getSession(), caught => caught.code === code);
    assert.equal(h.state.reads.length, 1); assert.deepEqual(h.clock.delays, []); h.assertReadOnly();
  }
  for (const [error, code, message] of [
    [{ message: 'Invalid login credentials', status: 400 }, 'invalid_credentials', 'That email and password do not match an account.'],
    [futureJwt(), 'session_not_ready', authTypes.SESSION_NOT_READY_MESSAGE],
  ]) {
    const h = serviceHarness(); h.state.signInError = error;
    await assert.rejects(h.auth.signIn({ email: 'creator@example.test', password: 'synthetic-test-password' }), caught => caught.code === code && caught.message === message);
    assert.equal(h.state.signIns.length, 1); assert.equal(h.state.reads.length, 0);
    assert.deepEqual(h.clock.delays, []); h.assertReadOnly();
  }
});

test('an accepted signup retries only its profile read, never the account creation request', async () => {
  const h = serviceHarness();
  h.state.read = (accountId, count) => count === 1 ? { data: null, error: futureJwt() } : { data: profile(accountId), error: null };
  const pending = outcome(h.auth.signUp({ email: 'creator@example.test', password: 'synthetic-test-password' }));
  await h.clock.advance(500);
  const result = await pending;
  assert.equal(result.error, undefined); assert.equal(result.value.requiresEmailVerification, false);
  assert.equal(result.value.session.user.profileId, 'profile-account-a');
  assert.equal(h.state.signUps.length, 1); assert.equal(h.state.signIns.length, 0);
  assert.equal(h.state.reads.length, 2); h.assertReadOnly();
});

test('direct sign-in and its same-token auth event share in-flight mapping but never cache a completed identity', async () => {
  const h = serviceHarness(), events = [];
  const unsubscribe = h.auth.onAuthStateChange((...args) => events.push(args));
  h.state.emitOnSignIn = true;
  h.state.read = (accountId, count) => count === 1 ? { data: null, error: futureJwt() } : { data: profile(accountId), error: null };
  const pending = outcome(h.auth.signIn({ email: 'creator@example.test', password: 'synthetic-test-password' }));
  await h.clock.advance(0);
  assert.equal(h.state.reads.length, 1); assert.equal(events.length, 0);
  await h.clock.advance(500);
  const result = await pending;
  assert.equal(result.error, undefined); assert.equal(h.state.reads.length, 2);
  assert.equal(events.length, 1); assert.equal(events[0][0], result.value);
  assert.equal(events[0][1], undefined); assert.equal(h.state.signIns.length, 1);
  assert.deepEqual(h.clock.delays.filter(delay => delay > 0), [500]);
  h.state.read = () => ({ data: { id: 'profile-account-a', name: 'Updated profile name' }, error: null });
  assert.equal((await h.auth.getSession()).user.displayName, 'Updated profile name');
  assert.equal(h.state.reads.length, 3, 'A later lookup must re-read authoritative profile data');
  unsubscribe(); h.assertReadOnly();
});

test('timing-only event failures never publish a false logout for a first or already mapped same-account session', async () => {
  for (const established of [false, true]) {
    const h = serviceHarness(), events = [];
    if (established) await h.auth.getSession();
    const initialReads = h.state.reads.length;
    const unsubscribe = h.auth.onAuthStateChange((...args) => events.push(args));
    h.state.read = () => ({ data: null, error: futureJwt() });
    h.emit('TOKEN_REFRESHED', session('account-a', 'synthetic-new-token'));
    const pending = outcome(h.auth.getSession());
    await h.clock.advance(3500);
    assert.equal((await pending).error.code, 'session_not_ready');
    assert.deepEqual(events, [], 'The initiating read owns its error; the event must not masquerade as SIGNED_OUT');
    assert.equal(h.state.reads.length, initialReads + 4);
    assert.deepEqual(h.clock.delays.filter(delay => delay > 0), [500, 1000, 2000]);
    unsubscribe(); h.assertReadOnly();
  }
});

test('sign-out and account changes during backoff stop the old read and publish only the new session', async () => {
  for (const next of [null, session('account-b')]) {
    const h = serviceHarness(), events = [];
    const unsubscribe = h.auth.onAuthStateChange((...args) => events.push(args));
    h.state.read = accountId => accountId === 'account-a' ? { data: null, error: futureJwt() } : { data: profile(accountId), error: null };
    const pending = outcome(h.auth.getSession());
    await tick(); assert.equal(h.state.reads.length, 1);
    h.emit(next ? 'SIGNED_IN' : 'SIGNED_OUT', next);
    await h.clock.advance(500);
    assert.equal((await pending).error.code, 'reauthentication_required');
    assert.equal(h.state.reads.filter(read => read.accountId === 'account-a').length, 1);
    assert.equal(events.length, 1); assert.equal(events[0][0]?.user.id ?? null, next?.user.id ?? null);
    assert.equal(events[0][1], undefined); assert.equal(h.clock.pending.size, 0);
    unsubscribe(); h.assertReadOnly();
  }
});

test('immediate sign-out then sign-in with the same account and token cannot rejoin the prior pending mapping', async () => {
  const h = serviceHarness(), events = [];
  const unsubscribe = h.auth.onAuthStateChange((...args) => events.push(args));
  const original = h.state.current;
  original.user.email = 'earlier@example.test';
  let finishEarlierRead, finishCurrentRead;
  h.state.read = (_accountId, count) => new Promise(resolve => {
    if (count === 1) finishEarlierRead = resolve;
    else finishCurrentRead = resolve;
  });
  const earlier = outcome(h.auth.getSession());
  await tick();
  assert.equal(h.state.reads.length, 1);
  assert.equal(typeof finishEarlierRead, 'function');

  const current = session(original.user.id, original.access_token);
  current.user.email = 'current@example.test';
  // Both notifications arrive before either deferred auth callback can run.
  h.emit('SIGNED_OUT', null);
  h.emit('SIGNED_IN', current);
  let currentResult;
  const latest = outcome(h.auth.getSession()).then(result => { currentResult = result; return result; });
  await h.clock.advance(0);
  assert.equal(h.state.reads.length, 2, 'The new lifetime needs its own read even when the account and token match');
  finishCurrentRead({ data: { ...profile('account-a'), name: 'Current profile name' }, error: null });
  await tick();
  assert.ok(currentResult?.value, 'The current session must resolve without waiting for the previous lifetime');
  assert.equal(currentResult.value.user.email, 'current@example.test');
  assert.equal(currentResult.value.user.displayName, 'Current profile name');
  assert.equal(events.length, 1);
  assert.equal(events[0][0], currentResult.value);
  assert.equal(events[0][1], undefined);

  finishEarlierRead({ data: { ...profile('account-a'), name: 'Stale profile name' }, error: null });
  const stale = await earlier;
  assert.equal(stale.value, undefined);
  assert.equal(stale.error.code, 'reauthentication_required');
  await latest; await tick();
  assert.equal(events.length, 1, 'Completing the old lookup cannot republish identity or a false logout');
  assert.equal(h.state.reads.length, 2);
  assert.equal(h.state.signIns.length, 0); assert.equal(h.state.signUps.length, 0);
  assert.equal(h.clock.pending.size, 0);
  unsubscribe(); h.assertReadOnly();
});

test('an account A to B to A lifetime change rejects old user metadata still arriving for A', async () => {
  const h = serviceHarness(), events = [];
  const unsubscribe = h.auth.onAuthStateChange((...args) => events.push(args));
  const original = h.state.current;
  const oldUser = { ...original.user, email: 'stale-a@example.test', user_metadata: { display_name: 'Stale A metadata' } };
  let finishEarlierUser, finishCurrentUser;
  h.state.read = () => ({ data: null, error: null });
  h.state.readUser = () => new Promise(resolve => {
    if (h.state.freshUserReads === 1) finishEarlierUser = resolve;
    else finishCurrentUser = resolve;
  });
  const earlier = outcome(h.auth.getSession());
  await tick();
  assert.equal(h.state.reads.length, 1);
  assert.equal(h.state.freshUserReads, 1);
  assert.equal(typeof finishEarlierUser, 'function', 'The earlier mapping has moved past its profile read and is waiting on metadata');

  const returned = session('account-a', original.access_token);
  returned.user.email = 'current-a@example.test';
  returned.user.user_metadata = { display_name: 'Current A metadata' };
  // B can be superseded before its timer runs; observing that event must still invalidate old A work.
  h.emit('SIGNED_IN', session('account-b'));
  h.emit('SIGNED_IN', returned);
  let currentResult;
  const latest = outcome(h.auth.getSession()).then(result => { currentResult = result; return result; });
  await h.clock.advance(0);
  assert.deepEqual(h.state.reads.map(read => read.accountId), ['account-a', 'account-a']);
  assert.equal(h.state.freshUserReads, 2);
  finishCurrentUser({ data: { user: returned.user }, error: null });
  await tick();
  assert.ok(currentResult?.value, 'Returning to A must map its new metadata independently');
  assert.equal(currentResult.value.user.id, 'account-a');
  assert.equal(currentResult.value.user.email, 'current-a@example.test');
  assert.equal(currentResult.value.user.displayName, 'Current A metadata');
  assert.equal(currentResult.value.user.profileId, '');
  assert.equal(events.length, 1); assert.equal(events[0][0], currentResult.value);

  finishEarlierUser({ data: { user: oldUser }, error: null });
  const stale = await earlier;
  assert.equal(stale.value, undefined);
  assert.equal(stale.error.code, 'reauthentication_required', 'Checking only the current account ID would incorrectly accept this stale A response');
  await latest; await tick();
  assert.equal(events.length, 1); assert.equal(events[0][1], undefined);
  assert.equal(events[0][0].user.displayName, 'Current A metadata');
  assert.equal(h.state.signIns.length, 0); assert.equal(h.state.signUps.length, 0);
  assert.equal(h.clock.pending.size, 0);
  unsubscribe(); h.assertReadOnly();
});

test('startup timing exhaustion remains retryable and a successful retry clears the friendly error', async () => {
  const h = serviceHarness(), provider = providerHarness(h.auth);
  h.state.read = () => ({ data: null, error: futureJwt() });
  provider.render(); await h.clock.advance(3500);
  let context = provider.render();
  assert.equal(context.phase, 'failed'); assert.equal(context.isSessionUnavailable, true);
  assert.equal(context.user, null); assert.equal(context.error.code, 'session_not_ready');
  assert.equal(context.error.message, authTypes.SESSION_NOT_READY_MESSAGE);
  h.state.read = accountId => ({ data: profile(accountId), error: null });
  context.retryInitialize(); provider.render(); await tick();
  context = provider.render();
  assert.equal(context.phase, 'authenticated'); assert.equal(context.user.profileId, 'profile-account-a');
  assert.equal(context.isSessionUnavailable, false); assert.equal(context.error, null);
  assert.equal(h.state.reads.length, 5); assert.equal(h.state.signIns.length, 0);
  provider.unmount(); h.assertReadOnly();
});

test('a different account mapping failure reports its optional auth error and clears the previous UI identity', async () => {
  const h = serviceHarness(), provider = providerHarness(h.auth);
  provider.render(); await tick();
  assert.equal(provider.render().user.id, 'account-a');
  h.state.read = () => ({ data: null, error: futureJwt() });
  h.emit('SIGNED_IN', session('account-b'));
  await h.clock.advance(3500);
  let context = provider.render();
  assert.equal(context.user, null); assert.equal(context.viewerProfileId, null); assert.equal(context.isAuthenticated, false);
  assert.equal(context.phase, 'failed'); assert.equal(context.error.code, 'session_not_ready');
  assert.equal(context.error.message, authTypes.SESSION_NOT_READY_MESSAGE);
  h.state.read = accountId => ({ data: profile(accountId), error: null });
  h.emit('TOKEN_REFRESHED', session('account-b', 'synthetic-later-token'));
  await h.clock.advance(0);
  context = provider.render();
  assert.equal(context.user.id, 'account-b'); assert.equal(context.viewerProfileId, 'profile-account-b');
  assert.equal(context.phase, 'authenticated'); assert.equal(context.error, null);
  provider.unmount(); h.assertReadOnly();
});
