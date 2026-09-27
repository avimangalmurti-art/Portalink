import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setTimeout } from 'node:timers';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, ...globals, require(name) {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}

const validation = load('src/features/profile/validation.ts');
const registration = load('src/features/auth/registration.ts', { '../profile/validation': validation });
const authTypes = load('src/types/auth.ts');
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const registrationId = 'ae6041e8-2e19-4ce7-a2ab-986985c81234';
const draft = extra => ({ version: 1, id: registrationId, name: '  Example Creator  ', location: '  London, GB  ',
  isPrivate: true, accentColor: '#AF52DE', systemGray: 'gray4', hasAvatar: false,
  returnPath: '/share/example?view=portals&access_token=not-a-real-token', ...extra });
const user = (id = 'account-a', metadata = {}) => ({ id, email: `${id}@example.test`, email_confirmed_at: '2026-09-27T00:00:00Z', user_metadata: metadata });
const session = value => ({ user: value, access_token: 'synthetic-test-access-token', refresh_token: 'synthetic-test-refresh-token' });

function serviceHarness() {
  const state = {
    current: session(user()), fresh: user(), profile: null, recovery: false, getUserError: null, draftError: null,
    signup: [], profileReads: [], localReads: [], freshReads: 0, profileWrites: 0, savedByEmail: new Map(), callback: null,
  };
  const client = {
    from(table) {
      assert.equal(table, 'profiles');
      const forbidWrite = () => { state.profileWrites++; throw new Error('Session restoration must not write profiles'); };
      return {
        select(columns) { assert.equal(columns, 'id,name'); return {
          eq(column, accountId) { assert.equal(column, 'account_id'); return {
            async maybeSingle() { state.profileReads.push(accountId); return { data: copy(state.profile), error: null }; },
          }; },
        }; },
        insert: forbidWrite, update: forbidWrite, upsert: forbidWrite, delete: forbidWrite,
      };
    },
    auth: {
      async getSession() { return { data: { session: copy(state.current) }, error: null }; },
      async getUser() {
        state.freshReads++;
        if (state.getUserError) throw state.getUserError;
        return { data: { user: copy(state.fresh) }, error: null };
      },
      async signUp(input) {
        state.signup.push(copy(input));
        state.fresh = { ...user(), email: input.email, email_confirmed_at: null, user_metadata: copy(input.options.data ?? {}) };
        return { data: { user: copy(state.fresh), session: null }, error: null };
      },
      onAuthStateChange(callback) {
        state.callback = callback;
        return { data: { subscription: { unsubscribe() { state.callback = null; } } } };
      },
    },
  };
  function newService() {
    return load('src/services/supabase/authService.ts', {
      '../../types/auth': authTypes,
      '../../features/auth/registration': { ...registration, async readRegistrationDraft(email) {
        state.localReads.push(email);
        if (state.draftError) throw state.draftError;
        return copy(state.savedByEmail.get(email.trim().toLowerCase()) ?? null);
      } },
      './client': { requireSupabase: () => client, passwordRecovery: { read: () => state.recovery ? { accountId: state.current?.user.id } : null },
        recoveryCallbackFailed: false, accountDeletionEnabled: false },
      '../../utils/passwordRecoveryReturn': {},
    }, { window: { location: { origin: 'https://portalink.example.test' }, setTimeout } }).supabaseAuthService;
  }
  return { state, newService, auth: newService(), saveLocal(email, value = draft()) {
    state.savedByEmail.set(email.toLowerCase(), { registration: registration.readRegistrationProfile(value), email, requiresEmailVerification: true, expiresAt: Date.now() + 60000, avatar: null });
  } };
}

test('signup metadata survives email confirmation in a fresh service without a local draft', async () => {
  const h = serviceHarness();
  const result = await h.auth.signUp({ email: '  Creator@Example.TEST ', password: 'synthetic-test-password', registration: draft({ profileId: 'not-an-ownership-claim' }) });
  assert.equal(result.requiresEmailVerification, true); assert.equal(result.session, null);
  const submitted = h.state.signup[0];
  assert.equal(submitted.email, 'creator@example.test');
  assert.equal(submitted.options.emailRedirectTo, 'https://portalink.example.test');
  const saved = submitted.options.data.portalink_registration;
  assert.equal(saved.name, 'Example Creator'); assert.equal(saved.location, 'London, GB');
  assert.equal(saved.isPrivate, true); assert.equal(saved.systemGray, 'gray4'); assert.equal(saved.accentColor, '#AF52DE');
  assert.equal(saved.id, registrationId); assert.equal(saved.profileId, undefined);
  assert.equal(saved.returnPath, '/share/example?view=portals');
  h.state.fresh.email_confirmed_at = '2026-09-27T00:00:00Z';
  h.state.current = session(copy(h.state.fresh));
  const confirmed = await h.newService().getSession();
  assert.deepEqual(copy(confirmed.user.registration), saved);
  assert.equal(confirmed.user.isEmailVerified, true); assert.equal(confirmed.user.profileId, '');
  assert.equal(h.state.freshReads, 0); assert.deepEqual(h.state.localReads, []);
  assert.equal(h.state.profileWrites, 0);
});

test('invalid registration rejects before calling signup instead of silently dropping metadata', async () => {
  const h = serviceHarness();
  for (const change of [{ version: 2 }, { id: 'bad' }, { name: '' }, { location: 42 }, { accentColor: 'invalid' }, { hasAvatar: 'yes' }, { isPrivate: 'private' }]) {
    await assert.rejects(h.auth.signUp({ email: 'creator@example.test', password: 'synthetic-test-password', registration: draft(change) }), /profile details could not be saved/i);
  }
  assert.equal(h.state.signup.length, 0);
  await h.auth.signUp({ email: 'creator@example.test', password: 'synthetic-test-password', registration: draft({ systemGray: 'invalid' }) });
  assert.equal(h.state.signup.length, 1);
  assert.equal(h.state.signup[0].options.data.portalink_registration.systemGray, undefined);
  assert.equal(h.state.signup[0].options.data.portalink_registration.name, 'Example Creator');
});

test('a stale session obtains current registration only from the same provider account', async () => {
  const h = serviceHarness();
  h.state.current = session({ ...user(), email_confirmed_at: null });
  h.state.fresh = user('account-a', { portalink_registration: draft() });
  h.saveLocal('account-a@example.test', draft({ name: 'Older local name' }));
  const resolved = await h.auth.getSession();
  assert.equal(resolved.user.id, 'account-a'); assert.equal(resolved.user.registration.name, 'Example Creator');
  assert.equal(resolved.user.isEmailVerified, true);
  assert.equal(h.state.freshReads, 1); assert.deepEqual(h.state.localReads, []);

  h.state.fresh = user('account-b', { portalink_registration: draft({ name: 'Other account' }) });
  const switched = await h.newService().getSession();
  assert.equal(switched.user.id, 'account-a'); assert.equal(switched.user.email, 'account-a@example.test');
  assert.equal(switched.user.registration.name, 'Older local name');
  assert.equal(switched.user.isEmailVerified, false, 'A different provider user cannot verify the original account.');
  assert.deepEqual(h.state.localReads, ['account-a@example.test']);
  assert.equal(h.state.profileWrites, 0);
});

test('local fallback is bound to session email and requires missing profile, metadata and recovery state', async () => {
  for (const mode of ['missing', 'other-email', 'profile', 'metadata', 'recovery']) {
    const h = serviceHarness();
    h.saveLocal(mode === 'other-email' ? 'account-b@example.test' : 'account-a@example.test', draft({ name: 'Local draft' }));
    if (mode === 'profile') h.state.profile = { id: 'existing-profile', name: 'Existing profile' };
    if (mode === 'metadata') h.state.current.user.user_metadata.portalink_registration = draft({ name: 'Provider draft' });
    if (mode === 'recovery') {
      h.state.recovery = true;
      h.state.current.user.user_metadata.portalink_registration = draft({ name: 'Recovery must ignore metadata too' });
    }
    const mapped = await h.auth.getSession();
    if (mode === 'missing') assert.equal(mapped.user.registration.name, 'Local draft');
    else if (mode === 'metadata') assert.equal(mapped.user.registration.name, 'Provider draft');
    else assert.equal(mapped.user.registration, undefined, mode);
    assert.deepEqual(h.state.localReads, mode === 'missing' || mode === 'other-email' ? ['account-a@example.test'] : [], mode);
    assert.equal(h.state.freshReads, mode === 'missing' || mode === 'other-email' ? 1 : 0, mode);
    if (mode === 'profile') {
      assert.equal(mapped.user.profileId, 'existing-profile'); assert.equal(mapped.user.displayName, 'Existing profile');
    }
    assert.equal(h.state.profileWrites, 0, mode);
  }
});

test('existing profiles suppress both saved metadata and local drafts during repeated session events', async () => {
  const h = serviceHarness();
  h.state.profile = { id: 'existing-profile', name: 'Established name' };
  h.state.current.user.user_metadata.portalink_registration = draft({ name: 'Stale signup name' });
  h.saveLocal('account-a@example.test', draft({ name: 'Local replacement' }));
  const events = [];
  const unsubscribe = h.auth.onAuthStateChange(value => events.push(value));
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await h.newService().getSession();
    assert.equal(current.user.displayName, 'Established name'); assert.equal(current.user.registration, undefined);
    h.state.callback('SIGNED_IN', copy(h.state.current));
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  unsubscribe();
  assert.equal(events.length, 3);
  for (const event of events) {
    assert.equal(event.user.profileId, 'existing-profile'); assert.equal(event.user.registration, undefined);
  }
  assert.equal(h.state.profileReads.length, 6);
  assert.equal(h.state.freshReads, 0); assert.deepEqual(h.state.localReads, []); assert.equal(h.state.profileWrites, 0);
});

test('unavailable fresh-user or local storage reads do not discard an otherwise valid session', async () => {
  const h = serviceHarness();
  h.state.getUserError = new Error('Synthetic offline response');
  h.saveLocal('account-a@example.test');
  assert.equal((await h.auth.getSession()).user.registration.id, registrationId);
  h.state.draftError = new Error('Synthetic unavailable storage');
  const mapped = await h.auth.getSession();
  assert.equal(mapped.user.id, 'account-a'); assert.equal(mapped.user.registration, undefined);
  h.state.current = null;
  const reads = h.state.profileReads.length;
  assert.equal(await h.auth.getSession(), null);
  assert.equal(h.state.profileReads.length, reads);
  assert.equal(h.state.profileWrites, 0);
});
