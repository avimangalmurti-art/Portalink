import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './helpers/source-module.mjs';
import { authReturnOriginFixture, officialAuthOrigin } from './helpers/auth-return-origin-fixture.mjs';

const { authReturnOrigin } = authReturnOriginFixture;
const legacy = 'https://portalinknetworksinc.avimangalmurti566055.chatgpt.site';
const userAccount = 'account-a';

test('new Auth returns use the official domain for production, hosting aliases and untrusted addresses', () => {
  for (const origin of [officialAuthOrigin, legacy, 'https://preview.example',
    'https://www.portalinknetworks.com', 'https://portalinknetworks.com.attacker.test',
    'http://localhost.attacker.test:5173', 'https://127.0.0.1.attacker.test',
    'http://192.168.1.12:5173', 'http://0.0.0.0:5173', 'http://127.0.0.2:5173',
    'ftp://localhost:5173', 'file:///localhost', 'null', '', 'not a URL', '//localhost:5173',
    'http://user:synthetic@localhost:5173']) {
    assert.equal(authReturnOrigin(origin), officialAuthOrigin, origin);
  }
});

test('HTTP and HTTPS loopback development retain their exact origin and port only', () => {
  for (const origin of ['http://localhost:5173', 'https://localhost:4443',
    'http://127.0.0.1:4238', 'https://127.0.0.1:4443',
    'http://[::1]:5173', 'https://[::1]:4443']) {
    assert.equal(authReturnOrigin(origin), origin);
    assert.equal(authReturnOrigin(origin + '/ignored?code=synthetic#access_token=synthetic'), origin);
  }
});

const shareModel = sourceModule('src/features/sharing/shareModel.ts');
const validation = sourceModule('src/features/profile/validation.ts', { '../sharing/shareModel': shareModel });
const registration = sourceModule('src/features/auth/registration.ts', {
  '../sharing/shareModel': shareModel, '../profile/validation': validation,
});
const returnHelpers = sourceModule('src/utils/passwordRecoveryReturn.ts');

function callbackHarness(origin) {
  const calls = { oauth: [], signup: [], reset: [], email: [], resend: [] };
  const user = { id: 'account-a', email: 'old@example.test', new_email: 'pending@example.test' };
  const session = { user, access_token: 'synthetic-access', refresh_token: 'synthetic-refresh' };
  const client = { auth: {
    async signInWithOAuth(input) { calls.oauth.push(input); return { error: null }; },
    async signUp(input) { calls.signup.push(input); return { data: { session: null }, error: null }; },
    async resetPasswordForEmail(email, options) { calls.reset.push({ email, options }); return { error: null }; },
    async getUser() { return { data: { user }, error: null }; },
    async getSession() { return { data: { session }, error: null }; },
    async resend(input) { calls.resend.push(input); return { error: null }; },
    updateUser() { assert.fail('Email changes must retain the existing account-bound client'); },
  } };
  const auth = sourceModule('src/services/supabase/authService.ts', {
    '../../types/auth': sourceModule('src/types/auth.ts'),
    '../../utils/authReturnOrigin': authReturnOriginFixture,
    '../../utils/passwordRecoveryReturn': returnHelpers,
    '../../features/auth/registration': registration,
    '../../features/auth/socialRegistration': { socialRegistration: () => undefined },
    './client': {
      requireSupabase: () => client,
      createPasswordRecoveryClient: () => ({
        async setSession(tokens) {
          assert.equal(tokens.access_token, session.access_token);
          return { data: { session }, error: null };
        },
        async updateUser(input, options) { calls.email.push({ input, options }); return { error: null }; },
      }),
    },
  }, { window: { location: { origin } } }).supabaseAuthService;
  return { auth, calls };
}

for (const [origin, expected] of [[legacy, officialAuthOrigin], [officialAuthOrigin, officialAuthOrigin],
  ['https://unknown-host.test', officialAuthOrigin], ['http://localhost:5173', 'http://localhost:5173'],
  ['http://127.0.0.1:4238', 'http://127.0.0.1:4238'], ['https://[::1]:4443', 'https://[::1]:4443']]) {
  test('all five Auth link producers share the safe return origin from ' + origin, async () => {
    const { auth, calls } = callbackHarness(origin);
    await auth.signInWithOAuth('google', '/share/creator/c/design/work?page=2&media=file&access_token=synthetic#refresh_token=synthetic');
    const oauth = new URL(calls.oauth[0].options.redirectTo);
    assert.equal(oauth.origin, expected); assert.equal(oauth.pathname, '/');
    assert.equal(oauth.searchParams.get('entry'), 'oauth');
    assert.equal(oauth.searchParams.get('onboarding_return'), '/share/creator/c/design/work?page=2&media=file');
    assert.equal(oauth.hash, ''); assert.equal(oauth.href.includes('synthetic'), false);
    await auth.signInWithOAuth('apple', 'https://attacker.test/share/creator');
    assert.equal(calls.oauth[1].options.redirectTo, expected + '/?entry=oauth');

    await auth.signUp({ email: ' NEW@EXAMPLE.TEST ', password: 'synthetic-password' });
    assert.equal(calls.signup[0].options.emailRedirectTo, expected);
    assert.equal(calls.signup[0].email, 'new@example.test');

    await auth.requestPasswordReset({ email: ' OLD@EXAMPLE.TEST ' });
    assert.equal(calls.reset[0].options.redirectTo, expected + '/?auth=reset-password');

    await auth.requestEmailChange({ accountId: userAccount, newEmail: ' NEW@EXAMPLE.TEST ' });
    assert.equal(calls.email[0].options.emailRedirectTo, expected);
    assert.equal(calls.email[0].input.email, 'new@example.test');

    for (const target of ['account', 'pending-email']) await auth.resendVerification({ accountId: userAccount, target });
    assert.deepEqual(calls.resend.map(call => call.options.emailRedirectTo), [expected, expected]);
    assert.deepEqual(calls.resend.map(call => [call.type, call.email]), [
      ['signup', 'old@example.test'], ['email_change', 'pending@example.test'],
    ]);
  });
}
