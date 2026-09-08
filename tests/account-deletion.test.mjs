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

function endpoint(options = {}) {
  const events = [];
  const files = options.files ?? {
    'project-media/profile-a': [{ id: 'original', name: 'original.pdf' }],
    'project-media/posts/project-a': [{ id: null, name: 'pages' }],
    'project-media/posts/project-a/pages': [{ id: 'render', name: 'page_1.webp' }],
    'message-media/profile-a': [{ id: 'upload', name: 'unsent.png' }],
    'avatars/account-a': [{ id: 'avatar', name: 'avatar.webp' }],
  };
  const tables = {
    projects: [{ id: 'project-a' }],
    direct_conversations: [{ id: 'chat-a' }],
    direct_message_attachments: [{ storage_path: 'profile-b/chat-a/received.png' }],
  };
  const admin = {
    auth: {
      getUser: async (token) => {
        events.push(['verify', token]);
        return { data: { user: options.invalidUser ? null : { id: 'account-a', email: options.noEmail ? '' : 'owner@example.com' } }, error: null };
      },
      admin: { deleteUser: async (id) => { events.push(['deleteUser', id]); return { error: options.deleteError }; } },
    },
    from(table) {
      let deleting = false;
      const query = {
        delete() { deleting = true; return query; },
        select() { return query; },
        eq(key, value) { events.push(['eq', table, key, value]); return query; },
        or(value) { events.push(['or', table, value]); return query; },
        in(key, value) { events.push(['in', table, key, Array.from(value)]); return query; },
        order() { return query; },
        then(resolve) { if (deleting) events.push(['cancelJobs', table]); return Promise.resolve({ error: options.cancelError ? { message: 'unavailable' } : null }).then(resolve); },
        async range(start, end) { return { data: (tables[table] ?? []).slice(start, end + 1), error: options.queryError === table ? { message: 'unavailable' } : null }; },
        async maybeSingle() { return { data: options.noProfile ? null : { id: 'profile-a' }, error: options.queryError === table ? { message: 'unavailable' } : null }; },
      };
      return query;
    },
    storage: { from: (bucket) => ({
      async list(prefix, { offset, limit }) {
        events.push(['list', bucket, prefix, offset]);
        return { data: (files[`${bucket}/${prefix}`] ?? []).slice(offset, offset + limit), error: options.listError ? { message: 'unavailable' } : null };
      },
      async remove(paths) { events.push(['remove', bucket, Array.from(paths)]); return { error: options.removeError ? { message: 'unavailable' } : null }; },
    }) },
  };
  let handler;
  vm.runInNewContext(compile('supabase/functions/delete-account/index.ts'), {
    exports: {}, Response, Deno: { env: { get: () => 'configured' }, serve: (fn) => { handler = fn; } },
    require: () => ({ createClient: () => admin }),
  });
  return {
    events,
    request: (body = { confirmation: 'owner@example.com', accountId: 'someone-else' }, method = 'POST', auth = 'Bearer valid-user-token') => handler(new Request('https://example.test/delete-account', {
      method, headers: auth ? { Authorization: auth } : {},
      ...(['GET', 'OPTIONS'].includes(method) ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    })),
  };
}
const mutations = (h) => h.events.filter(([event]) => ['remove', 'deleteUser', 'cancelJobs'].includes(event));

test('deletion refuses unsupported methods, absent/invalid identity and malformed confirmation without mutations', async () => {
  for (const [options, body, method, auth, status] of [
    [{}, {}, 'GET', undefined, 405], [{}, {}, 'POST', '', 401],
    [{ invalidUser: true }, {}, 'POST', undefined, 401],
    [{}, '{bad-json', 'POST', undefined, 400], [{}, null, 'POST', undefined, 400],
    [{}, { confirmation: 123 }, 'POST', undefined, 400],
    [{}, { confirmation: 'other@example.com' }, 'POST', undefined, 400],
    [{ noEmail: true }, { confirmation: '' }, 'POST', undefined, 400],
  ]) {
    const h = endpoint(options);
    assert.equal((await h.request(body, method, auth)).status, status);
    assert.equal(mutations(h).length, 0);
  }
});

test('ownership or asset-discovery errors stop before any destructive operation', async () => {
  for (const options of [{ queryError: 'profiles' }, { queryError: 'projects' }, { queryError: 'direct_conversations' }, { queryError: 'direct_message_attachments' }, { listError: true }]) {
    const h = endpoint(options);
    const result = await h.request();
    assert.equal(result.status, 500);
    assert.equal((await result.json()).isDeleted, false);
    assert.equal(mutations(h).length, 0);
  }
});

test('server uses verified identity and cleans originals, PDF pages, avatars and both sides of removed chats', async () => {
  const h = endpoint();
  const result = await h.request({ confirmation: ' OWNER@EXAMPLE.COM ', accountId: 'someone-else' });
  assert.equal((await result.json()).isDeleted, true);
  assert.deepEqual(h.events.at(-1), ['deleteUser', 'account-a']);
  assert.ok(h.events.some((event) => JSON.stringify(event) === JSON.stringify(['eq', 'profiles', 'account_id', 'account-a'])));
  const removed = h.events.filter(([event]) => event === 'remove').flatMap(([, bucket, paths]) => paths.map((path) => `${bucket}/${path}`));
  assert.deepEqual(removed.sort(), [
    'avatars/account-a/avatar.webp', 'message-media/profile-a/unsent.png',
    'message-media/profile-b/chat-a/received.png', 'project-media/posts/project-a/pages/page_1.webp',
    'project-media/profile-a/original.pdf',
  ].sort());
});

test('storage pagination covers more than 1000 files and removals stay in bounded batches', async () => {
  const h = endpoint({ files: { 'project-media/profile-a': Array.from({ length: 1103 }, (_, i) => ({ id: String(i), name: `file-${i}.png` })) } });
  assert.equal((await h.request()).status, 200);
  const removed = h.events.filter(([event, bucket]) => event === 'remove' && bucket === 'project-media');
  assert.equal(new Set(removed.flatMap(([, , paths]) => paths)).size, 1103);
  assert.ok(removed.every(([, , paths]) => paths.length <= 100));
});

test('storage failure prevents Auth deletion and truthfully reports potentially partial cleanup', async () => {
  const h = endpoint({ removeError: true });
  const result = await h.request();
  assert.equal(result.status, 500);
  assert.match((await result.json()).message, /Some files may already/);
  assert.equal(h.events.some(([event]) => event === 'deleteUser'), false);
});

test('PDF jobs stop before the final scan, and their cancellation failure stops account deletion', async () => {
  const h = endpoint();
  await h.request();
  const cancelledAt = h.events.findIndex(([event]) => event === 'cancelJobs');
  const finalScanAt = h.events.findLastIndex(([event, bucket, prefix]) => event === 'list' && bucket === 'project-media' && prefix === 'posts/project-a');
  assert.ok(cancelledAt > 0 && finalScanAt > cancelledAt);
  assert.ok(h.events.findIndex(([event]) => event === 'remove') > finalScanAt);
  const failed = endpoint({ cancelError: true });
  assert.equal((await failed.request()).status, 500);
  assert.equal(failed.events.some(([event]) => event === 'deleteUser' || event === 'remove'), false);
});

test('an account without a creator profile can still delete its avatar and login', async () => {
  const h = endpoint({ noProfile: true });
  assert.equal((await h.request()).status, 200);
  assert.deepEqual(mutations(h), [['remove', 'avatars', ['account-a/avatar.webp']], ['deleteUser', 'account-a']]);
});

function authService(client, enabled = true) {
  const authTypes = {};
  vm.runInNewContext(compile('src/types/auth.ts'), { exports: authTypes });
  const exports = {};
  vm.runInNewContext(compile('src/services/supabase/authService.ts'), { exports, Response, require(name) {
    if (name === './client') return { accountDeletionEnabled: enabled, requireSupabase: () => client, clearDeletedAccountStorage: () => client.clearStorage?.() };
    if (name.endsWith('/types/auth')) return authTypes;
    throw new Error(name);
  } });
  return exports.supabaseAuthService;
}
test('client rejects mismatched accounts and clears the local session only after confirmed deletion', async () => {
  const calls = [];
  const client = { auth: {
    getUser: async () => ({ data: { user: { id: 'account-a', email: 'owner@example.com' } }, error: null }),
    signOut: async ({ scope }) => { calls.push(scope); return { error: null }; },
  }, functions: { invoke: async () => { calls.push('delete'); return { data: { isDeleted: true }, error: null }; } } };
  const service = authService(client);
  await assert.rejects(service.deleteAccount({ accountId: 'someone-else', confirmation: 'owner@example.com' }));
  assert.deepEqual(calls, []);
  assert.equal((await service.deleteAccount({ accountId: 'account-a', confirmation: 'owner@example.com' })).isDeleted, true);
  assert.deepEqual(calls, ['delete', 'local']);
  calls.length = 0;
  await assert.rejects(authService(client, false).deleteAccount({ accountId: 'account-a', confirmation: 'owner@example.com' }));
  assert.deepEqual(calls, []);
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

test('logout errors clear app-owned storage without misreporting a committed deletion as failed', async () => {
  for (const thrown of [true, false]) {
    let cleared = false;
    const service = authService({ auth: {
      getUser: async () => ({ data: { user: { id: 'a', email: 'owner@example.com' } } }),
      signOut: async () => { if (thrown) throw new Error('offline'); return { error: new Error('offline') }; },
    }, clearStorage: () => { cleared = true; }, functions: { invoke: async () => ({ data: { isDeleted: true } }) } });
    assert.equal((await service.deleteAccount({ accountId: 'a', confirmation: 'owner@example.com' })).isDeleted, true);
    assert.equal(cleared, true);
  }
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
