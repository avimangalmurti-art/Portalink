import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function setup({ failure = null } = {}) {
  const calls = []; let account = 'viewer'; let rowsRead = 0;
  const client = {
    auth: { getSession: async () => ({ data: { session: account ? { user: { id: account } } : null } }) },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'project_engagement_summaries') return failure ? { error: failure } : { data: args.p_project_ids.map(project_id => ({ project_id, viewer_liked: true, viewer_saved: false, viewer_reposted: false, like_count: 9, save_count: 3, repost_count: 2 })) };
      assert.equal(name, 'project_engagement_summary'); return { data: { like_count: 7, save_count: 0, repost_count: 0 } };
    },
    from() {
      const query = { select() { return query; }, eq() { return query; }, then(resolve) { rowsRead++; return Promise.resolve({ data: [{ kind: 'like' }] }).then(resolve); } };
      return query;
    },
  };
  class ServiceError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/services/supabase/communityServices.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, setTimeout, require(name) {
      if (name === './client') return { requireSupabase: () => client };
      if (name.endsWith('comments')) return { CommentServiceError: ServiceError };
      if (name.endsWith('engagement')) return { EngagementServiceError: ServiceError };
      if (name.endsWith('social')) return { SocialServiceError: ServiceError };
      throw Error(name);
    },
  });
  return { service: exports.supabaseEngagementService, calls, get rowsRead() { return rowsRead; }, switchAccount(next) { account = next; } };
}

test('twenty simultaneous card reads use one bounded engagement summary call', async () => {
  const h = setup();
  const rows = await Promise.all(Array.from({ length: 20 }, (_, i) => h.service.getProjectEngagement(`p${i}`)));
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].args.p_project_ids.length, 20); assert.equal(h.rowsRead, 0);
  assert.equal(rows[19].projectId, 'p19'); assert.equal(rows[19].likeCount, 9); assert.equal(rows[19].isLiked, true);
});

test('large summary lists are deduplicated and divided into at most 200 IDs', async () => {
  const h = setup();
  const rows = await h.service.getProjectEngagements([...Array.from({ length: 405 }, (_, i) => `p${i}`), 'p0']);
  assert.equal(rows.length, 405); assert.deepEqual(h.calls.map(call => call.args.p_project_ids.length), [200, 200, 5]);
});

test('only a missing RPC uses the compatibility path, not permissions or network failures', async () => {
  for (const code of ['PGRST202', '42883']) {
    const h = setup({ failure: { code } });
    const [row] = await h.service.getProjectEngagements(['p']);
    assert.equal(row.likeCount, 7); assert.equal(row.isLiked, true); assert.equal(h.rowsRead, 1);
  }
  for (const code of ['42501', '500']) {
    const h = setup({ failure: { code, message: 'Rejected' } });
    await assert.rejects(h.service.getProjectEngagements(['p']), /Rejected/);
    assert.equal(h.calls.length, 1); assert.equal(h.rowsRead, 0);
  }
});

test('an account switch cancels queued reads instead of resolving new-account flags into old consumers', async () => {
  const h = setup();
  const pending = h.service.getProjectEngagement('p');
  for (let i = 0; i < 5; i++) await Promise.resolve();
  h.switchAccount('other');
  await assert.rejects(pending, /account changed/); assert.equal(h.calls.length, 0);
});
