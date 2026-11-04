const shareModel = sourceModule('src/features/sharing/shareModel.ts');
import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { authReturnOriginFixture, officialAuthOrigin } from './helpers/auth-return-origin-fixture.mjs';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, URL, URLSearchParams, atob, ...globals, require: (name) => {
    if (name.endsWith('/socialRegistration')) return {socialRegistration: () => undefined};
    if (name.endsWith('/EntryChoices')) return {EntryChoices: 'EntryChoices'};
    if (name.endsWith('/ConfirmationDialog')) return {ConfirmationDialog: 'ConfirmationDialog'};

    assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name];
  } });
  return exports;
}
const authTypes = load('../src/types/auth.ts');
const registration = load('../src/features/auth/registration.ts', { '../profile/validation': load('../src/features/profile/validation.ts', { '../sharing/shareModel': shareModel }), '../sharing/shareModel': shareModel });
const { createPasswordRecoveryTracker } = load('../src/services/supabase/passwordRecovery.ts');
const returns = load('../src/utils/passwordRecoveryReturn.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values };
}
function session(account = 'account-a', id = 'session-a') {
  return { access_token: `header.${Buffer.from(JSON.stringify({ session_id: id })).toString('base64url')}.signature`, refresh_token: `synthetic-refresh-${id}`, user: { id: account, email: `${account}@example.test`, user_metadata: {}, email_confirmed_at: '2026-09-01T00:00:00Z' } };
}

test('only a provider recovery event enables the form; ordinary sign-in and URL markers do not', () => {
  const tracker = createPasswordRecoveryTracker(storage(), 'recovery');
  tracker.record('SIGNED_IN', session());
  assert.equal(tracker.read(session()), null);
  assert.equal(returns.isPasswordRecoveryReturn('https://portalink.test/?auth=reset-password'), true);
  assert.equal(tracker.read(session()), null);
  tracker.record('PASSWORD_RECOVERY', session());
  assert.equal(tracker.read(session()).email, 'account-a@example.test');
});

test('recovery resumes after refresh and token refresh without storing credentials', () => {
  const saved = storage();
  const tracker = createPasswordRecoveryTracker(saved, 'recovery', () => 1000);
  tracker.record('PASSWORD_RECOVERY', session());
  const serialized = saved.getItem('recovery');
  assert.equal(serialized.includes('access_token'), false);
  assert.equal(serialized.includes('signature'), false);
  const reloaded = createPasswordRecoveryTracker(saved, 'recovery', () => 2000);
  reloaded.record('INITIAL_SESSION', session());
  reloaded.record('TOKEN_REFRESHED', session());
  assert.equal(reloaded.read(session()).email, 'account-a@example.test');
});

test('logout, account changes, new sessions and elapsed recovery windows invalidate recovery', () => {
  for (const [event, next] of [['SIGNED_OUT', null], ['SIGNED_IN', session('account-b', 'session-b')], ['SIGNED_IN', session('account-a', 'new-session')]]) {
    const tracker = createPasswordRecoveryTracker(storage(), 'recovery');
    tracker.record('PASSWORD_RECOVERY', session());
    tracker.record(event, next);
    assert.equal(tracker.read(session()), null);
    assert.equal(tracker.read(next), null);
  }
  let now = 0;
  const tracker = createPasswordRecoveryTracker(storage(), 'recovery', () => now);
  tracker.record('PASSWORD_RECOVERY', session());
  now = 3600001;
  assert.equal(tracker.read(session()), null);
});

test('a delayed session lookup cannot erase a newer recovery session', () => {
  const tracker = createPasswordRecoveryTracker(storage(), 'recovery');
  const newer = session('account-b', 'session-b');
  tracker.record('PASSWORD_RECOVERY', newer);
  assert.equal(tracker.read(session()), null);
  assert.equal(tracker.read(newer).email, 'account-b@example.test');
});

test('blocked session storage still permits the current recovery flow', () => {
  const denied = () => { throw new Error('Storage denied'); };
  const tracker = createPasswordRecoveryTracker({ getItem: denied, setItem: denied, removeItem: denied }, 'recovery');
  tracker.record('PASSWORD_RECOVERY', session());
  assert.ok(tracker.read(session()));
  tracker.clear();
  assert.equal(tracker.read(session()), null);
});

function serviceHarness({ callbackFailed = false } = {}) {
  const tracker = createPasswordRecoveryTracker(storage(), 'recovery');
  let current = session(), userError = null, updateError = null, verificationUser = null, requested;
  let beforeWrite = () => {};
  const updates = [];
  const browser = { location: { origin: 'https://portalink.test', href: 'https://portalink.test/?auth=reset-password' }, history: { state: null, replaceState(_state, _unused, path) { browser.location.href = new URL(path, browser.location.origin).href; } }, setTimeout };
  const returnHelpers = load('../src/utils/passwordRecoveryReturn.ts', {}, { window: browser });
  const provider = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'profile-a', name: 'Creator' }, error: null }) }) }) }),
    auth: {
      getSession: async () => ({ data: { session: current }, error: null }),
      getUser: async () => ({ data: { user: verificationUser ?? current?.user }, error: userError }),
      resetPasswordForEmail: async (email, options) => { requested = { email, options }; return { error: null }; },
      updateUser: async () => { throw new Error('Recovery must not write through the mutable global session'); },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  };
  const { supabaseAuthService: auth } = load('../src/services/supabase/authService.ts', {
    '../../types/auth': authTypes, '../../features/auth/registration': registration,
    './client': { requireSupabase: () => provider, passwordRecovery: tracker, recoveryCallbackFailed: callbackFailed, accountDeletionEnabled: false,
      createPasswordRecoveryClient: () => {
        let bound;
        return {
          async setSession(tokens) {
            bound = [session(), session('account-b', 'session-b')].find((item) => item.access_token === tokens.access_token);
            beforeWrite();
            return { data: { session: bound }, error: null };
          },
          async updateUser(input) { updates.push({ ...input, accountId: bound.user.id }); return { error: updateError }; },
        };
      },
    },
    '../../utils/passwordRecoveryReturn': returnHelpers,
    '../../utils/authReturnOrigin': authReturnOriginFixture,
  }, { window: browser });
  return { auth, tracker, updates, browser, get requested() { return requested; },
    recover() { tracker.record('PASSWORD_RECOVERY', current); },
    switchAccount() { current = session('account-b', 'session-b'); tracker.record('SIGNED_IN', current); },
    failVerification(error) { userError = error; },
    verifiedUser(user) { verificationUser = user; },
    failUpdate(error) { updateError = error; },
    beforeWrite(fn) { beforeWrite = fn; },
  };
}

test('email requests use the reset form return URL and do not authorize a password change', async () => {
  const env = serviceHarness();
  const result = await env.auth.requestPasswordReset({ email: ' Person@Example.test ' });
  assert.equal(env.requested.email, 'person@example.test');
  assert.equal(env.requested.options.redirectTo, officialAuthOrigin + '/?auth=reset-password');
  assert.equal(result.deliveryConfirmed, true);
  assert.equal(await env.auth.getRecoverySession(), null);
  await assert.rejects(env.auth.updatePassword({ password: 'new-password-example' }), { code: 'recovery_session_invalid' });
  assert.equal(env.updates.length, 0);
});

test('verified recovery survives late UI startup, saves the password once and consumes the checkpoint', async () => {
  const env = serviceHarness();
  env.recover();
  assert.equal((await env.auth.getSession()).isPasswordRecovery, true);
  assert.equal((await env.auth.getRecoverySession()).email, 'account-a@example.test');
  await env.auth.updatePassword({ password: 'new-password-example' });
  assert.equal(env.updates.length, 1);
  assert.equal(env.updates[0].password, 'new-password-example');
  assert.equal(env.browser.location.href, 'https://portalink.test/');
  assert.equal(await env.auth.getRecoverySession(), null);
  await assert.rejects(env.auth.updatePassword({ password: 'another-password-example' }), { code: 'recovery_session_invalid' });
  assert.equal(env.updates.length, 1);
});

test('expired callback, revoked session and changed accounts cannot save a password', async () => {
  for (const mode of ['callback', 'revoked', 'account', 'identity']) {
    const env = serviceHarness({ callbackFailed: mode === 'callback' });
    env.recover();
    if (mode === 'revoked') env.failVerification({ status: 401, message: 'JWT expired' });
    if (mode === 'account') env.switchAccount();
    if (mode === 'identity') env.verifiedUser({ id: 'account-b' });
    await assert.rejects(env.auth.updatePassword({ password: 'new-password-example' }), { code: 'recovery_session_invalid' });
    assert.equal(env.updates.length, 0, mode);
  }
});

test('a temporary verification error is retryable instead of consuming the link', async () => {
  const env = serviceHarness(); env.recover();
  env.failVerification({ status: 503, message: 'Temporarily unavailable' });
  await assert.rejects(env.auth.getRecoverySession(), { code: 'network' });
  env.failVerification(null);
  assert.ok(await env.auth.getRecoverySession());
});

test('a concurrent sign-in cannot redirect the password write to another account', async () => {
  const env = serviceHarness(); env.recover();
  env.beforeWrite(() => { env.switchAccount(); env.recover(); });
  await env.auth.updatePassword({ password: 'new-password-example' });
  assert.equal(env.updates.length, 1);
  assert.equal(env.updates[0].accountId, 'account-a');
  // Completing A must not consume the new recovery flow for B.
  assert.equal((await env.auth.getRecoverySession()).email, 'account-b@example.test');
});

test('a rejected new password keeps recovery available for correction', async () => {
  const env = serviceHarness(); env.recover();
  env.failUpdate({ code: 'same_password', status: 422, message: 'New password should be different from the old password.' });
  await assert.rejects(env.auth.updatePassword({ password: 'old-password-example' }), { code: 'same_password' });
  assert.ok(await env.auth.getRecoverySession());
  env.failUpdate(null);
  await env.auth.updatePassword({ password: 'different-password-example' });
  assert.equal(await env.auth.getRecoverySession(), null);
});

function hookRuntime() {
  const slots = []; let cursor = 0; const effects = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = { ...React,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(factory, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() }; return slots[index].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const index = cursor++; if (!equal(slots[index]?.deps, deps)) { effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; }); } },
  };
  return { react, render(fn) { cursor = 0; const result = fn(); effects.splice(0).forEach((effect) => effect()); return result; } };
}

test('recovery lookup runs once across rerenders, settles, and allows a new password to save', async () => {
  const hooks = hookRuntime(); let resolve, lookups = 0, updates = 0, refreshes = 0;
  const auth = { getRecoverySession() { lookups++; return new Promise((done) => { resolve = done; }); }, async updatePassword() { updates++; } };
  const asyncAction = load('../src/hooks/useAsyncAction.ts', { react: hooks.react });
  const { usePasswordUpdate } = load('../src/features/auth/useAuthFlows.ts', {
    './registration': { saveRegistrationAvatar() { throw new Error('Recovery must not save registration data'); } },
    '../../contexts/AuthContext': { useAuth: () => ({ refreshSession: async () => { refreshes++; return false; } }) },
    react: hooks.react, '../../contexts/ServicesContext': { useServices: () => ({ auth }) }, '../../hooks/useAsyncAction': asyncAction, '../../types/auth': authTypes,
  });
  const render = () => hooks.render(() => {
    const update = usePasswordUpdate();
    hooks.react.useEffect(() => { void update.loadRecovery(); }, [update.loadRecovery]);
    return update;
  });
  render();
  for (let n = 0; n < 8; n++) render();
  assert.equal(lookups, 1);
  resolve({ email: 'creator@example.test', isPrototype: false }); await tick();
  let update = render();
  assert.equal(update.recoveryStatus, 'success');
  assert.equal(update.recovery.email, 'creator@example.test');
  await update.submit('new-password-example');
  update = render();
  assert.equal(update.isComplete, true);
  assert.equal(updates, 1);
  assert.equal(lookups, 1);
  assert.equal(refreshes, 1); // A failed identity refresh never retries the successful password mutation.
});

test('auth startup opens verified recovery and preserves expired-link UI instead of sign-in', async () => {
  for (const mode of ['recovery', 'expired', 'ordinary']) {
    const hooks = hookRuntime();
    const next = mode === 'recovery' ? { user: { id: 'a', profileId: 'p' }, isPrototype: false, isPasswordRecovery: true } : null;
    const auth = { onAuthStateChange: () => () => {}, getSession: async () => next };
    const browser = { location: { href: mode === 'expired' ? 'https://portalink.test/?auth=reset-password#error_code=otp_expired' : 'https://portalink.test/' } };
    const { AuthProvider } = load('../src/contexts/AuthContext.tsx', {
      react: hooks.react, './ServicesContext': { useServices: () => ({ auth }) }, '../types/auth': authTypes, '../utils/passwordRecoveryReturn': returns,
    }, { window: browser });
    const render = () => hooks.render(() => AuthProvider({ children: null })).props.value;
    render(); await tick(); render();
    const context = render();
    assert.equal(context.pendingView, mode === 'ordinary' ? null : 'resetPassword');
    assert.equal(context.isAuthenticated, mode === 'recovery');
  }
});

test('a late startup lookup cannot overwrite a newer authenticated recovery event', async () => {
  const hooks = hookRuntime(); let emit, restore;
  const auth = {
    onAuthStateChange: (listener) => { emit = listener; return () => {}; },
    getSession: () => new Promise((resolve) => { restore = resolve; }),
  };
  const { AuthProvider } = load('../src/contexts/AuthContext.tsx', {
    react: hooks.react, './ServicesContext': { useServices: () => ({ auth }) }, '../types/auth': authTypes, '../utils/passwordRecoveryReturn': returns,
  }, { window: { location: { href: 'https://portalink.test/' } } });
  const render = () => hooks.render(() => AuthProvider({ children: null })).props.value;
  render();
  emit({ user: { id: 'a', profileId: 'p' }, isPrototype: false, isPasswordRecovery: true });
  restore(null); await tick();
  const context = render();
  assert.equal(context.pendingView, 'resetPassword');
  assert.equal(context.isAuthenticated, true);
});
