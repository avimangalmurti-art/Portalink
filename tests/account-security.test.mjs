import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true }
  }).outputText, { exports, Error, URL, ...globals, require(name) {
    if (name.endsWith('/socialRegistration')) return {socialRegistration: () => undefined};
    if (name.endsWith('/EntryChoices')) return {EntryChoices: 'EntryChoices'};
    if (name.endsWith('/EntryAgreements')) return {useEntryAgreements: () => ({request: async () => true})};
    if (name.endsWith('/ConfirmationDialog')) return {ConfirmationDialog: 'ConfirmationDialog'};

    assert.ok(name in imports, `Unexpected import ${name}`); return imports[name];
  } });
  return exports;
}
const types = load('../src/types/auth.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
function serviceHarness() {
  const user = { id: 'a', email: 'old@example.test', email_confirmed_at: '2026-10-12' };
  const state = { user, current: { user, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' }, writes: [], revocations: [], verifies: [], events: null, verifyError: null, writeError: null, switchOnVerify: false, switchOnBind: false, rpcCalls: [], rpcRows: [], rpcResult: true, rpcError: null, switchOnRpc: false };
  const client = { async rpc(name, input) {
    state.rpcCalls.push({ name, input });
    if (state.switchOnRpc) state.current = { ...state.current, user: { id: 'b' } };
    return { data: name === 'list_my_account_sessions' ? state.rpcRows : state.rpcResult, error: state.rpcError };
  }, auth: {
    getUser: async () => ({ data: { user: state.user }, error: null }),
    getSession: async () => ({ data: { session: state.current }, error: null }),
    onAuthStateChange(callback) { state.events = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async options => { state.revocations.push(['main', options.scope]); return { error: null }; },
    updateUser() { assert.fail('Credential writes must use an account-bound client'); },
    signInWithPassword() { assert.fail('Password verification must not replace the main session'); }
  } };
  function boundClient() {
    let boundUser;
    return {
      async signInWithPassword(input) {
        state.verifies.push(input); boundUser = state.user;
        if (state.switchOnVerify) state.current = { ...state.current, user: { id: 'b' } };
        return { data: { user: boundUser }, error: state.verifyError };
      },
      async setSession(input) {
        assert.equal(input.access_token, 'synthetic-access'); boundUser = state.user;
        if (state.switchOnBind) state.current = { ...state.current, user: { id: 'b' } };
        return { data: { session: { user: boundUser } }, error: null };
      },
      async updateUser(input, options) { state.writes.push({ user: boundUser.id, input, options }); return { data: { user: boundUser }, error: state.writeError }; },
      async signOut(options) { state.revocations.push(['bound', options.scope]); return { error: null }; }
    };
  }
  const auth = load('../src/services/supabase/authService.ts', {
    '../../types/auth': types,
    './client': { requireSupabase: () => client, createPasswordRecoveryClient: boundClient, passwordRecovery: { read: () => null }, accountDeletionEnabled: false },
    '../../utils/passwordRecoveryReturn': {}, '../../features/auth/registration': {}
  }, { window: { location: { origin: 'https://example.test' } } }).supabaseAuthService;
  return { auth, state };
}
const password = { accountId: 'a', currentPassword: 'synthetic-current', newPassword: 'synthetic-new' };

test('password change verifies independently and cleans up only the temporary session', async () => {
  const { auth, state } = serviceHarness();
  const result = await auth.changePassword(password);
  assert.equal(result.isChanged, true);
  assert.equal(state.writes[0].user, 'a');
  assert.equal(state.writes[0].input.password, password.newPassword);
  assert.deepEqual(state.revocations, [['bound', 'local']]);
  assert.equal(state.current.user.id, 'a');
});
test('wrong current password never writes credentials', async () => {
  const { auth, state } = serviceHarness();
  state.verifyError = { code: 'invalid_credentials', message: 'Invalid login credentials' };
  await assert.rejects(auth.changePassword(password), error => error.code === 'invalid_credentials');
  assert.equal(state.writes.length, 0);
});
test('identity changing during password verification prevents the write and cleans up', async () => {
  const { auth, state } = serviceHarness(); state.switchOnVerify = true;
  await assert.rejects(auth.changePassword(password), error => error.code === 'reauthentication_required');
  assert.equal(state.writes.length, 0); assert.deepEqual(state.revocations, [['bound', 'local']]);
});
test('email change is pending, leaves confirmed address intact, and uses the existing origin', async () => {
  const { auth, state } = serviceHarness();
  const result = await auth.requestEmailChange({ accountId: 'a', newEmail: ' NEW@example.test ' });
  assert.equal(result.status, 'pending'); assert.equal(result.email, 'new@example.test');
  assert.equal(state.user.email, 'old@example.test');
  assert.equal(state.writes[0].input.email, 'new@example.test');
  assert.equal(state.writes[0].options.emailRedirectTo, 'https://example.test');
  assert.deepEqual(state.revocations, []);
});
test('email write is blocked when identity changes during binding', async () => {
  const { auth, state } = serviceHarness(); state.switchOnBind = true;
  await assert.rejects(auth.requestEmailChange({ accountId: 'a', newEmail: 'new@example.test' }), error => error.code === 'reauthentication_required');
  assert.equal(state.writes.length, 0);
});
test('same email and failed email requests do not report success', async () => {
  const { auth, state } = serviceHarness();
  await assert.rejects(auth.requestEmailChange({ accountId: 'a', newEmail: 'OLD@example.test' }), error => error.code === 'invalid_email');
  state.writeError = { message: 'Network request failed' };
  await assert.rejects(auth.requestEmailChange({ accountId: 'a', newEmail: 'new@example.test' }));
});
test('other-session sign out retains this session and uses the others scope', async () => {
  const { auth, state } = serviceHarness(); await auth.signOutOtherSessions('a');
  assert.deepEqual(state.revocations, [['bound', 'others']]); assert.equal(state.current.user.id, 'a');
});
test('other-session sign out rejects account mismatch and identity changes', async () => {
  const { auth, state } = serviceHarness();
  await assert.rejects(auth.signOutOtherSessions('b'), error => error.code === 'reauthentication_required');
  state.switchOnBind = true;
  await assert.rejects(auth.signOutOtherSessions('a'), error => error.code === 'reauthentication_required');
  assert.equal(state.revocations.length, 0);
});
test('local and global sign out use their explicit scopes; legacy default stays global', async () => {
  const { auth, state } = serviceHarness(); await auth.signOut('local'); await auth.signOut('global'); await auth.signOut();
  assert.deepEqual(state.revocations, [['main', 'local'], ['main', 'global'], ['main', 'global']]);
});

test('device list maps only display fields and paginates with an opaque server cursor', async () => {
  const {auth,state}=serviceHarness();
  state.rpcRows=Array.from({length:51},(_,i)=>({id:`s-${i}`,user_agent:'Safari iPhone',created_at:'2026-10-12T00:00:00Z',refreshed_at:null,is_current:i===0}));
  const page=await auth.listAccountSessions('a');assert.equal(page.sessions.length,50);assert.equal(page.sessions[0].isCurrent,true);assert.equal(page.nextCursor.id,'s-49');
  await auth.listAccountSessions('a',page.nextCursor);
  assert.equal(state.rpcCalls[1].input.p_before_id,'s-49');assert.equal('accountId' in state.rpcCalls[1].input,false);
});
test('device list rejects stale identity and missing migration without claiming an empty list', async () => {
  const {auth,state}=serviceHarness();state.rpcError={code:'PGRST202',message:'Missing function'};
  await assert.rejects(auth.listAccountSessions('a'),error=>error.code==='unsupported');
  state.rpcError=null;state.switchOnRpc=true;
  await assert.rejects(auth.listAccountSessions('a'),error=>error.code==='reauthentication_required');
});
test('individual revocation confirms boolean outcome and does not accept guessed success', async () => {
  const {auth,state}=serviceHarness();assert.equal(await auth.revokeAccountSession('a','target'),true);
  assert.equal(state.rpcCalls[0].input.p_session_id,'target');state.rpcResult=false;
  assert.equal(await auth.revokeAccountSession('a','target'),false);state.rpcResult=null;
  await assert.rejects(auth.revokeAccountSession('a','target'));state.rpcResult=true;state.switchOnRpc=true;
  await assert.rejects(auth.revokeAccountSession('a','target'),error=>error.code==='reauthentication_required');
});

function hookRuntime() {
  const slots = [], effects = []; let cursor = 0;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = { ...React,
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (!equal(slots[i]?.deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!equal(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); }
  };
  return { react, render(fn) { cursor = 0; const value = fn(); effects.splice(0).forEach(fn => fn()); return value; } };
}
function hookHarness() {
  const runtime = hookRuntime();
  const calls = [];
  let securityState = { email: 'old@example.test', isEmailVerified: true, hasPassword: true, pendingEmailChange: null };
  const service = {
    async getAccountSecurityCapability() { return { canChangePassword: true, canChangeEmail: true, canSendVerificationEmail: true }; },
    async getAccountSecurityState() { return securityState; },
    async changePassword(input) { calls.push(input); return { isChanged: true, message: 'Changed' }; },
    async requestEmailChange(input) { calls.push(input); securityState = { ...securityState, pendingEmailChange: { newEmail: input.newEmail } }; return { status: 'pending', message: 'Confirm the new address', email: input.newEmail }; },
    async resendVerification() { return { status: 'rate-limited', message: 'Try again later.' }; }
  };
  const hook = load('../src/features/auth/useAccountSecurity.ts', { react: runtime.react, '../../contexts/ServicesContext': { useServices: () => ({ auth: service }) }, '../../contexts/AuthContext': { useAuth: () => ({ user: { id: 'a' }, isAuthenticated: true }) }, '../../types/auth': types, './validation': load('../src/features/auth/validation.ts') }).useAccountSecurity;
  return { calls, render: () => runtime.render(hook) };
}
test('password validation blocks mismatches and clears credentials only on success', async () => {
  const h = hookHarness(); h.render(); await tick();
  h.render().password.setField('currentPassword', 'current-password');
  h.render().password.setField('newPassword', 'new-password');
  h.render().password.setField('confirmPassword', 'different');
  assert.equal(await h.render().password.submit(), 'confirmPassword'); assert.equal(h.calls.length, 0);
  h.render().password.setField('confirmPassword', 'new-password'); await h.render().password.submit();
  assert.equal(h.render().password.phase, 'succeeded'); assert.equal(h.render().password.form.newPassword, '');
});
test('pending email remains distinct from confirmed address and resend throttling is truthful', async () => {
  const h = hookHarness(); h.render(); await tick();
  h.render().email.setDraft('invalid'); assert.equal(await h.render().email.submit(), false); assert.equal(h.calls.length, 0);
  h.render().email.setDraft('new@example.test'); assert.equal(await h.render().email.submit(), true);
  assert.equal(h.render().state.email, 'old@example.test'); assert.equal(h.render().state.pendingEmailChange.newEmail, 'new@example.test');
  await h.render().verification.resend('pending-email'); assert.equal(h.render().verification.phase, 'rate-limited');
});
