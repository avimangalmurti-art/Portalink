import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const target = { projectId: 'project', attachmentId: 'attachment', pageIndex: 0, label: 'Page one' };
const comment = { id: 'comment', body: 'A comment', authorName: 'Alice', authorAvatarUrl: null, createdAt: '2026-09-28T00:00:00Z', canDelete: true };
const record = (changes = {}) => ({
  engaged: { like: false, save: false, repost: false },
  counts: { like: 0, save: 0, repost: 0 },
  comments: [comment],
  ...changes,
});

function setup({ enabled = true } = {}) {
  const reads = [], writes = [];
  const auth = { isAuthenticated: true, user: { id: 'alice' } };
  const hook = hookHarness(new URL('../src/features/media-interactions/useMediaInteractions.ts', import.meta.url),
    'useMediaInteractions', {}, auth, [target, enabled], undefined, {
      './mediaInteractionBatch': { readMediaInteraction(value, account) {
        const response = deferred(); reads.push({ value, account, ...response }); return response.promise;
      } },
      './mediaInteractionRequest': { mediaInteractionRequest(path, init, required) {
        const response = deferred(); writes.push({ path, init, required, ...response }); return response.promise;
      } },
    });
  return { hook, reads, writes, auth };
}

for (const succeeds of [true, false]) {
  test(`deleting a comment ${succeeds ? 'successfully' : 'unsuccessfully'} during a pending retry clears loading and ignores the stale read`, async () => {
    const s = setup();
    try {
      await s.hook.flush();
      s.reads[0].resolve(record()); await s.hook.flush();
      const retry = s.hook.value.retry(); await s.hook.flush();
      assert.equal(s.hook.value.isLoading, true);

      const deletion = s.hook.value.deleteComment(comment.id); await s.hook.flush();
      assert.equal(s.hook.value.record.comments.length, 0);
      assert.equal(s.writes[0].path, '/api/media-interactions/comments/comment');
      assert.equal(s.writes[0].init.method, 'DELETE');
      assert.equal(s.writes[0].required, true);
      if (succeeds) s.writes[0].resolve(record({ comments: [] }));
      else s.writes[0].reject(new Error('Deletion failed'));
      await deletion; await s.hook.flush();

      assert.equal(s.hook.value.isLoading, false);
      assert.equal(s.hook.value.isResolvingEngagement, false);
      assert.equal(s.hook.value.record.comments.length, succeeds ? 0 : 1);
      assert.equal(s.hook.value.failure, succeeds ? null : 'Deletion failed');

      // The retry started before the write and must not resurrect the comment,
      // remove the failure message, or overwrite the current counts afterward.
      s.reads[1].resolve(record({ counts: { like: 99, save: 99, repost: 99 } }));
      await retry; await s.hook.flush();
      assert.equal(s.hook.value.isLoading, false);
      assert.equal(s.hook.value.record.comments.length, succeeds ? 0 : 1);
      assert.equal(s.hook.value.record.counts.like, 0);
      assert.equal(s.hook.value.failure, succeeds ? null : 'Deletion failed');
    } finally { s.hook.dispose(); }
  });
}

test('engagement waits for the initial account read and an earlier retry cannot overwrite its optimistic or confirmed state', async () => {
  const s = setup();
  try {
    await s.hook.flush();
    assert.equal(s.hook.value.isResolvingEngagement, true);
    s.hook.value.toggle('like'); await s.hook.flush();
    assert.equal(s.writes.length, 0);
    s.reads[0].resolve(record()); await s.hook.flush();
    assert.equal(s.hook.value.isResolvingEngagement, false);

    const retry = s.hook.value.retry(); await s.hook.flush();
    s.hook.value.toggle('like'); await s.hook.flush();
    assert.equal(s.writes.length, 1);
    assert.equal(s.hook.value.record.engaged.like, true);
    assert.equal(s.hook.value.record.counts.like, 1);
    assert.deepEqual(JSON.parse(s.writes[0].init.body), { ...target, kind: 'like', engaged: true });

    s.reads[1].resolve(record()); await retry; await s.hook.flush();
    assert.equal(s.hook.value.record.engaged.like, true);
    assert.equal(s.hook.value.record.counts.like, 1);
    assert.equal(s.hook.value.pendingKind, 'like');
    s.writes[0].resolve(record({ engaged: { like: true, save: false, repost: false }, counts: { like: 7, save: 0, repost: 0 } }));
    await s.hook.flush();
    assert.equal(s.hook.value.record.engaged.like, true);
    assert.equal(s.hook.value.record.counts.like, 7);
    assert.equal(s.hook.value.pendingKind, null);
    assert.equal(s.hook.value.isLoading, false);
    assert.equal(s.hook.value.isResolvingEngagement, false);
  } finally { s.hook.dispose(); }
});

test('a failed initial read keeps engagement blocked until an explicit retry establishes account state', async () => {
  const s = setup();
  try {
    await s.hook.flush();
    s.reads[0].reject(new Error('Offline')); await s.hook.flush();
    assert.equal(s.hook.value.isLoading, false);
    assert.equal(s.hook.value.isResolvingEngagement, true);
    assert.equal(s.hook.value.failure, 'Offline');
    s.hook.value.toggle('save'); await s.hook.flush();
    assert.equal(s.writes.length, 0);

    const retry = s.hook.value.retry(); await s.hook.flush();
    s.reads[1].resolve(record({ engaged: { like: false, save: true, repost: false }, counts: { like: 0, save: 1, repost: 0 } }));
    await retry; await s.hook.flush();
    assert.equal(s.hook.value.isResolvingEngagement, false);
    assert.equal(s.hook.value.failure, null);
    s.hook.value.toggle('save'); await s.hook.flush();
    assert.equal(JSON.parse(s.writes[0].init.body).engaged, false);
    s.writes[0].resolve(record()); await s.hook.flush();
  } finally { s.hook.dispose(); }
});

test('deferred page activity starts on visibility and an account change invalidates the older account read', async () => {
  const s = setup({ enabled: false });
  try {
    await s.hook.flush(); assert.equal(s.reads.length, 0);
    s.hook.options([target, true]); await s.hook.flush();
    assert.equal(s.reads.length, 1);
    assert.equal(s.reads[0].account, 'alice');
    s.auth.user = { id: 'bob' }; s.hook.rerender(); await s.hook.flush();
    assert.equal(s.reads.length, 2);
    assert.equal(s.reads[1].account, 'bob');
    s.reads[0].resolve(record({ engaged: { like: false, save: true, repost: false } })); await s.hook.flush();
    assert.equal(s.hook.value.isResolvingEngagement, true);
    assert.equal(s.hook.value.record.engaged.save, false);
    s.reads[1].resolve(record()); await s.hook.flush();
    assert.equal(s.hook.value.isResolvingEngagement, false);
    assert.equal(s.hook.value.record.engaged.save, false);
    assert.equal(s.hook.value.isLoading, false);
  } finally { s.hook.dispose(); }
});
