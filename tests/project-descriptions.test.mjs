import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const parse = (path) => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function execute(source, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText, { exports, ...globals });
  return exports;
}
function find(file, predicate) {
  let result;
  const visit = (node) => { if (predicate(node)) result = node; else ts.forEachChild(node, visit); };
  visit(file);
  assert.ok(result, 'Expected source boundary exists');
  return result;
}
const longDescription = 'First paragraph — café 🌍\n\nSecond paragraph with details.\n'.repeat(2500);

test('publish validation accepts long prose and still enforces the title rules', () => {
  const file = parse('../src/features/publishing/usePublishProject.ts');
  const validate = find(file, (n) => ts.isVariableDeclaration(n) && n.name.getText(file) === 'validate');
  const callback = validate.initializer.arguments[0].getText(file);
  const validators = execute(read('../src/features/publishing/validation.ts'));
  for (const summary of ['Brief description', longDescription]) {
    let errors;
    const { run } = execute(`exports.run = ${callback}`, {
      metadata: { title: 'My project', summary }, validateTitle: validators.validateTitle,
      FIELD_ORDER: ['title', 'summary'], setFieldErrors: (value) => { errors = value; }, setInvalidField() {},
    });
    assert.equal(run(), true);
    assert.equal(errors.summary, null);
  }
  assert.ok(validators.validateTitle(''));
  assert.ok(validators.validateTitle('x'.repeat(81)));
  assert.equal(validators.validateTitle('x'.repeat(80)), null);
});

test('both create and edit description fields have no maximum length', () => {
  for (const [path, id] of [
    ['../src/features/publishing/PublishProjectDialog.tsx', 'publish-summary'],
    ['../src/features/projects/ProjectEditorDialog.tsx', 'project-summary'],
  ]) {
    const file = parse(path);
    const field = find(file, (n) => ts.isJsxSelfClosingElement(n) && n.attributes.properties.some((p) =>
      ts.isJsxAttribute(p) && p.name.getText(file) === 'id' && p.initializer?.text === id));
    assert.ok(!field.attributes.properties.some((p) => p.name?.getText(file) === 'maxLength'));
    assert.ok(field.attributes.properties.some((p) => p.name?.getText(file) === 'required'), 'Description labels must agree with the existing save/publish requirement');
  }
});

test('draft, publish (including fallback), and edit services pass the entire description', async () => {
  const file = parse('../src/services/supabase/contentServices.ts');
  const declaration = find(file, (n) => ts.isVariableDeclaration(n) && n.name.getText(file) === 'supabaseProjectService');
  const methods = ['updateDraft', 'publishProject', 'updateProject'].map((name) =>
    declaration.initializer.properties.find((p) => p.name?.getText(file) === name).getText(file)).join(',');
  const calls = [];
  const chain = {
    update: (data) => { calls.push(['draft', data]); return chain; },
    eq: () => chain, select: () => chain,
    single: async () => ({ data: { label: 'Design' }, error: null }),
  };
  let useFallback = false;
  const { service } = execute(`exports.service = {${methods}}`, {
    PublishServiceError: Error, ProjectMutationError: Error, draftFromRow: (row) => row,
    removeStoredMedia: async () => undefined,
    requireSupabase: () => ({
      from: () => chain,
      rpc: async (name, data) => {
        calls.push([name, data]);
        return useFallback && data.p_topic_keys
          ? { error: { code: 'PGRST202', message: 'function not found' } }
          : { data: name === 'publish_project' ? 'new-project' : {}, error: null };
      },
    }),
  });
  service.getProject = async () => ({ summary: longDescription });
  const metadata = { title: 'Long-form project', summary: longDescription };
  const input = { profileId: 'owner', categoryId: 'category', projectId: 'project', draftId: 'draft', metadata,
    attachments: [{ id: 'media' }], relevance: { topicKeys: ['design'], geographicScope: 'global', geographyConfidence: 0 } };
  await service.updateDraft('draft', metadata);
  await service.publishProject(input);
  useFallback = true;
  await service.publishProject(input);
  await service.updateProject(input);
  assert.equal(calls.length, 5);
  for (const [kind, data] of calls) assert.equal(kind === 'draft' ? data.summary : data.p_summary, longDescription.trim());
});

test('hover descriptions preserve paragraphs and scroll rather than truncate', () => {
  const { ProjectHoverDetails } = execute(read('../src/components/profile/ProjectHoverDetails.tsx'), {
    require: (name) => {
      if (name === 'react') return React;
      if (name.endsWith('/useProjectEngagement')) return { useProjectEngagement: () => ({ count: () => 0 }) };
      if (name.endsWith('/useProjectComments')) return { useProjectComments: () => ({ phase: 'ready', totalCount: 0 }) };
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  const tree = ProjectHoverDetails({ projectId: 'project', summary: longDescription });
  const description = React.Children.toArray(tree.props.children).find((child) => child.props?.['data-project-hover-description'] !== undefined);
  assert.equal(description.props.children, longDescription);
  for (const name of ['whitespace-pre-wrap', 'break-words', 'overflow-y-auto', 'overscroll-y-auto']) {
    assert.ok(description.props.className.split(/\s+/).includes(name));
  }
});

test('SQL change removes only the summary cap and retains publishing safeguards', () => {
  const previous = read('../supabase/migrations/202608240001_expand_project_media_limits.sql');
  const current = read('../supabase/migrations/202609030004_unbounded_publishing_descriptions.sql');
  const body = (sql) => sql.slice(sql.indexOf('create or replace function public.publish_project('), sql.lastIndexOf('$$;') + 3);
  assert.equal(body(current), body(previous).replace(" or char_length(trim(coalesce(p_summary, ''))) > 220", ''));
  assert.match(current, /drop constraint if exists projects_summary_check/);
  assert.match(current, /revoke all on function public\.publish_project\(uuid,uuid,uuid,text,text,jsonb\) from public/);
});
