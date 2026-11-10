import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const path = 'src/services/supabase/contentReaders.ts';
const source = ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const declaration = source.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
  .find(node => node.name.getText(source) === 'supabaseProfileReadService');
const selected = ['listProfiles', 'getProfile', 'getProfileOverview', 'getSharedProfile'];
const methods = declaration.initializer.properties.filter(node => selected.includes(node.name?.getText(source))).map(node => node.getText(source)).join(',\n');

function fixture({ user = null, error = null, thrown = null } = {}) {
  const calls = [];
  const profile = { id: 'public-profile', name: 'Public Creator' };
  const client = {
    auth: { async getUser() {
      calls.push('getUser');
      if (thrown) throw thrown;
      return { data: { user }, error };
    } },
    from(table) { calls.push(['from', table]); return [profile]; },
  };
  const { requireDirectoryAccount } = sourceModule('src/services/supabase/requireDirectoryAccount.ts', {
    './client': { requireSupabase: () => client },
  });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`exports.service = {${methods}}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, requireDirectoryAccount, requireSupabase: () => client,
    async loadProfiles(...args) { calls.push(['loadProfiles', ...args]); return client.from('profiles'); },
    async readSharedProfileBundle(received, profileId) {
      assert.equal(received, client);
      calls.push(['sharedBundle', profileId]);
      return { status: 'unsupported' };
    },
    ProfileServiceError: class extends Error {},
  });
  return { service: exports.service, calls, profile };
}

test('profile directory denies missing, anonymous and failed identities before reading profiles', async () => {
  for (const identity of [
    {},
    { user: { id: 'anonymous', is_anonymous: true } },
    { user: { id: 'account' }, error: { message: 'Identity could not be checked' } },
    { thrown: new Error('Identity check unavailable') },
  ]) {
    const h = fixture(identity);
    await assert.rejects(h.service.listProfiles(), /account or sign in|Identity check unavailable/);
    assert.deepEqual(h.calls, ['getUser']);
  }
});

test('profile directory validates a real account before loading profiles', async () => {
  const h = fixture({ user: { id: 'account', is_anonymous: false } });
  assert.deepEqual(await h.service.listProfiles(), [h.profile]);
  assert.deepEqual(h.calls, ['getUser', ['loadProfiles'], ['from', 'profiles']]);
});

test('explicit public catalogue fallback remains readable without a directory account', async () => {
  const h = fixture();
  assert.equal(await h.service.getSharedProfile('public-profile'), h.profile);
  assert.deepEqual(h.calls, [
    ['sharedBundle', 'public-profile'], ['loadProfiles', 'public-profile', true], ['from', 'profiles'],
  ]);
});

test('targeted profile readers retain their existing public-reader boundary', async () => {
  const h = fixture();
  assert.equal(await h.service.getProfile('public-profile'), h.profile);
  assert.equal(await h.service.getProfileOverview('public-profile'), h.profile);
  assert.deepEqual(h.calls, [
    ['loadProfiles', 'public-profile'], ['from', 'profiles'],
    ['loadProfiles', 'public-profile', false, 'overview'], ['from', 'profiles'],
  ]);
});
