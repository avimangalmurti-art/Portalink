import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const person = (id) => ({ id, name: id, handle: `@${id}`, avatar: '' });
const ids = (hook) => Array.from(hook.value.people, ({ id }) => id);

function setup(searchRecipients, query = '') {
  return hookHarness(new URL('../src/features/messages/useDirectory.ts', import.meta.url), 'useDirectory', { messaging: { searchRecipients } }, {}, query);
}

test('clearing search immediately hides unrelated profiles and reloads followed people', async () => {
  const followed = deferred();
  const terms = [];
  const hook = setup((query) => {
    terms.push(query);
    return query ? Promise.resolve([person('manjula')]) : followed.promise;
  }, 'manjula');
  await hook.flush();
  hook.runTimeouts();
  await hook.flush();
  assert.deepEqual(ids(hook), ['manjula']);

  hook.options('');
  assert.deepEqual(ids(hook), []);
  assert.equal(hook.value.status, 'loading');
  hook.runTimeouts();
  followed.resolve([person('followed-creator')]);
  await hook.flush();
  assert.deepEqual(terms, ['manjula', '']);
  assert.deepEqual(ids(hook), ['followed-creator']);
  hook.dispose();
});

test('an old search page cannot append strangers after returning to followed people', async () => {
  const oldPage = deferred();
  const hook = setup((query, options) => {
    if (!query) return Promise.resolve([]);
    if (options.offset) return oldPage.promise;
    return Promise.resolve(Array.from({ length: 30 }, (_, index) => person(`match-${index}`)));
  }, 'match');
  await hook.flush();
  hook.runTimeouts();
  await hook.flush();
  assert.equal(hook.value.hasMore, true);
  const loading = hook.value.loadMore();

  hook.options('');
  await hook.flush();
  hook.runTimeouts();
  await hook.flush();
  oldPage.resolve([person('unrelated-late-result')]);
  await loading;
  await hook.flush();
  assert.deepEqual(ids(hook), []);
  assert.equal(hook.value.hasMore, false);
  assert.equal(hook.value.status, 'success');
  hook.dispose();
});
