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
  for (const summary of ['', '   ', 'Brief description', longDescription]) {
    let errors;
    const { run } = execute(`exports.run = ${callback}`, {
      firstProject:false, metadata: { title: 'My project', summary }, validateTitle: validators.validateTitle,
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
    assert.equal(field.attributes.properties.some((p) => p.name?.getText(file) === 'required'), false, 'Descriptions are optional when creating and editing');
  }
});

test('draft, atomic publish, and edit preserve descriptions; missing citation RPC fails closed', async () => {
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
  let useFallback = false, rpcError = null;
  const { service } = execute(`exports.service = {${methods}}`, {
    PublishServiceError: class extends Error { constructor(code, message) { super(message); this.code = code; } }, ProjectMutationError: class extends Error { constructor(code,message){super(message);this.code=code;} }, draftFromRow: (row) => row,
    withProjectLocation: (relevance) => relevance,
    removeStoredMedia: async () => undefined,
    requireSupabase: () => ({
      from: () => chain,
      rpc: async (name, data) => {
        calls.push([name, data]);
        if(rpcError)return {error:{message:rpcError}};
        return useFallback && data.p_topic_keys
          ? { error: { code: 'PGRST202', message: 'function not found' } }
          : { data: name === 'publish_project_citation_fields' ? 'new-project' : {}, error: null };
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
  await assert.rejects(service.publishProject(input), /access and date could not be saved/);
  useFallback = false;
  await service.updateProject(input);
  assert.equal(calls.length, 4);
  for (const [kind, data] of calls) assert.equal(kind === 'draft' ? data.summary : data.p_summary, longDescription.trim());
  await service.publishProject({...input,metadata:{title:'Without description',summary:'   '}});
  assert.equal(calls.at(-1)[1].p_summary,'');
  const titleOnly={...input,metadata:{title:'Title only',summary:'   '},attachments:[{id:'keep',order:0,isCover:true,coverFrame:{x:.2,y:.8,zoom:2}}],addedAttachments:[{id:'added',storagePath:'owner/project/added.png'}],expectedRevision:'original-revision'};
  await service.updateProject(titleOnly);
  const [name,payload]=calls.at(-1);assert.equal(name,'update_project_citation_fields');assert.equal(payload.p_summary,'');
  assert.equal(payload.p_kept,titleOnly.attachments);assert.equal(payload.p_added,titleOnly.addedAttachments);assert.equal(payload.p_expected_revision,'original-revision');assert.equal(payload.p_profile_id,'owner');
  const before=calls.length;
  for(const title of ['', '   '])await assert.rejects(service.updateProject({...titleOnly,metadata:{title,summary:''}}),error=>error.code==='invalid_metadata');
  assert.equal(calls.length,before,'A missing title is rejected before transport');
  for(const [message,code] of [['not owner','permission_denied'],['revision conflict','conflict'],['invalid media','invalid_media']]){
    rpcError=message;await assert.rejects(service.updateProject(titleOnly),error=>error.code===code);
  }
});

test('prototype edits accept an empty description with reordered cover and added files while retaining metadata and media guards',async()=>{
 const file=parse('../src/services/mocks/index.ts');
 const declaration=find(file,node=>ts.isVariableDeclaration(node)&&node.name.getText(file)==='mockProjectService');
 const method=declaration.initializer.properties.find(node=>node.name?.getText(file)==='updateProject').getText(file);
 const original={id:'project',title:'Existing title',summary:'Existing description',attachments:[{id:'first',displayName:'First',order:0,isCover:true,sourceUrl:'blob:first',storagePath:null,kind:'image'},{id:'second',displayName:'Second',order:1,isCover:false,sourceUrl:'blob:second',storagePath:null,kind:'image'}]};
 const profile={id:'owner',projects:[original]},writes=[];
 const {service}=execute(`exports.service={${method}}`,{resolve:async()=>{},findProfileById:id=>id==='owner'?profile:null,PROTOTYPE_PUBLISH_FAILURE_TITLE:'synthetic failure',ProjectMutationError:class extends Error{constructor(code,message){super(message);this.code=code;}},updatePrototypeProject:(id,project)=>writes.push([id,project])});
 const frame={x:.2,y:.8,zoom:2},input={profileId:'owner',projectId:'project',metadata:{title:'Title only',summary:'   '},attachments:[{id:'second',displayName:'Second renamed',order:0,isCover:true,coverFrame:frame},{id:'first',displayName:'First',order:1,isCover:false}],addedAttachments:[{id:'added',displayName:'Added',kind:'image',sourceUrl:'blob:added',storagePath:null,isCover:false}]};
 const result=await service.updateProject(input);
 assert.equal(result.project.summary,'');assert.deepEqual(Array.from(result.project.attachments,item=>item.id),['second','first','added']);
 assert.equal(result.project.attachments[0].metadata.coverFrame,frame);assert.equal(result.project.attachments[0].displayName,'Second renamed');
 assert.equal(original.summary,'Existing description');assert.equal(original.attachments[0].isCover,true);assert.equal(writes.length,1);
 for(const metadata of [{title:'',summary:''},{title:'   ',summary:'Description'}])await assert.rejects(service.updateProject({...input,metadata}),error=>error.code==='invalid_metadata');
 await assert.rejects(service.updateProject({...input,attachments:[{id:'foreign',order:0}]}),error=>error.code==='invalid_media');
 await assert.rejects(service.updateProject({...input,attachments:[],addedAttachments:[]}),error=>error.code==='invalid_media');
 assert.equal(writes.length,1,'Invalid edits never change the canonical record');
});

test('hover descriptions preserve paragraphs and scroll rather than truncate', () => {
  const { ProjectHoverDetails } = execute(read('../src/components/profile/ProjectHoverDetails.tsx'), {
    require: (name) => {
      if (name === 'react') return { ...React, useRef: current => ({ current }), useLayoutEffect() {} };
      if (name.endsWith('/usePresentation')) return { usePresentation: () => 'web' };
      if (name.endsWith('/useProjectEngagement')) return { useProjectEngagement: () => ({ count: () => 0 }) };
      if (name.endsWith('/useProjectComments')) return { useProjectComments: () => ({ phase: 'ready', totalCount: 0 }) };
      return new Proxy({}, { get: (_, key) => key });
    },
  });
  const tree = ProjectHoverDetails({ projectId: 'project', summary: longDescription });
  const description = React.Children.toArray(tree.props.children).find((child) => child.props?.['data-project-hover-description'] !== undefined);
  assert.equal(description.props.children.props.text, longDescription);
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
