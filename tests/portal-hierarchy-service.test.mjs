import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';

const path = '../src/services/supabase/contentServices.ts';
const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const declaration = source.statements.flatMap(node => ts.isVariableStatement(node) ? [...node.declarationList.declarations] : [])
  .find(node => node.name.getText(source) === 'supabaseProfileService');
const methods = declaration.initializer.properties
  .filter(node => ['createCategory', 'getCategoryDeletionCapability', 'deleteCategory'].includes(node.name?.getText(source)))
  .map(node => node.getText(source)).join(',\n');

const category = { id: 'new-portal', label: 'Editorial', icon_name: 'FileIcon', format: 'gallery', blurb: 'Magazine work' };
const removed = 'Remove the subportals before deleting this Portal.';
const missingHierarchy = { code: 'PGRST205', message: 'Could not find the table public.portal_hierarchy in the schema cache' };

function fixture({ childRows = [], hierarchyError = null, projectCount = 0, deleteError = null, rpcError = null } = {}) {
  const calls = [], exports = {};
  const client = {
    from(table) {
      const call = { table, action: 'read', filters: [] };
      const builder = {
        select(columns) { call.columns = columns; return builder; },
        eq(column, value) { call.filters.push([column, value]); return builder; },
        limit(count) { call.limit = count; return builder; },
        order() { return builder; },
        insert(value) { call.action = 'insert'; call.value = value; return builder; },
        delete() { call.action = 'delete'; return builder; },
        single() { return builder; },
        then(resolve, reject) {
          calls.push(call);
          const response = table === 'portal_hierarchy' ? { data: childRows, error: hierarchyError }
            : table === 'projects' ? { count: projectCount, error: null }
            : call.action === 'insert' ? { data: category, error: null }
            : call.action === 'delete' ? { error: deleteError }
            : { data: [{ position: 7 }], error: null };
          return Promise.resolve(response).then(resolve, reject);
        },
      };
      return builder;
    },
    rpc(name, input) {
      calls.push({ name, input });
      return { single: async () => ({ data: rpcError ? null : category, error: rpcError }) };
    },
  };
  const hierarchy = sourceModule('src/services/supabase/portalHierarchy.ts', {
    './client': { requireSupabase: () => client },
  });
  const module = ts.transpileModule(`const SUBPORTALS_BLOCK_DELETION = ${JSON.stringify(removed)}; exports.service = {${methods}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(module.outputText, {
    exports, requireSupabase: () => client, ...hierarchy,
    CategoryMutationError: class extends Error {
      constructor(code, message, blockingProjectCount) {
        super(message);
        this.code = code;
        this.blockingProjectCount = blockingProjectCount;
      }
    },
  });
  return { service: exports.service, calls };
}

test('nested Portal creation uses the atomic RPC while root creation retains the normal insert', async () => {
  const h = fixture();
  const input = { label: ' Editorial ', iconName: 'FileIcon', format: 'gallery', blurb: ' Magazine work ' };
  const child = await h.service.createCategory('profile', { ...input, parentId: 'parent-portal' });
  assert.equal(child.parentId, 'parent-portal');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), [{
    name: 'create_sub_portal', input: { p_profile_id: 'profile', p_parent_category_id: 'parent-portal',
      p_label: 'Editorial', p_icon_name: 'FileIcon', p_format: 'gallery', p_blurb: 'Magazine work' },
  }]);
  const root = await h.service.createCategory('profile', input);
  assert.equal(root.parentId, undefined);
  assert.equal(h.calls.at(-1).action, 'insert');
  assert.equal(h.calls.at(-1).value.position, 8);
});

test('missing RPC errors do not silently create a top-level Portal', async () => {
  const h = fixture({ rpcError: { code: 'PGRST202', message: 'Could not find the function public.create_sub_portal in the schema cache' } });
  await assert.rejects(h.service.createCategory('profile', { label: 'Editorial', parentId: 'parent' }), /Subportals are not available yet/);
  assert.equal(h.calls.length, 1);
});

test('parents cannot be deleted and a stale check is handled by its foreign-key error', async () => {
  const h = fixture({ childRows: [{ child_category_id: 'child-portal' }] });
  const capability = await h.service.getCategoryDeletionCapability('profile', 'parent');
  assert.equal(capability.isAvailable, false);
  assert.equal(capability.blockingProjectCount, 0);
  assert.equal(capability.reason, removed);
  assert.deepEqual(h.calls.find(call => call.table === 'portal_hierarchy').filters,
    [['profile_id', 'profile'], ['parent_category_id', 'parent']]);
  await assert.rejects(h.service.deleteCategory('profile', 'parent'), { code: 'deletion_unavailable', message: removed });
  assert.ok(h.calls.every(call => call.action !== 'delete'));

  const stale = fixture({ deleteError: { code: '23503', message: 'violates foreign key constraint "portal_hierarchy_parent_fk"' } });
  await assert.rejects(stale.service.deleteCategory('profile', 'parent'), { code: 'deletion_unavailable', message: removed });
});

test('older deployments retain project guards and ordinary deletion', async () => {
  const busy = fixture({ hierarchyError: missingHierarchy, projectCount: 2 });
  const capability = await busy.service.getCategoryDeletionCapability('profile', 'portal');
  assert.equal(capability.isAvailable, false);
  assert.equal(capability.blockingProjectCount, 2);
  await assert.rejects(busy.service.deleteCategory('profile', 'portal'), { code: 'category_not_empty', blockingProjectCount: 2 });
  const empty = fixture({ hierarchyError: missingHierarchy });
  await empty.service.deleteCategory('profile', 'portal');
  assert.equal(empty.calls.at(-1).action, 'delete');
});
