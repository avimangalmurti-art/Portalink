import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/services/supabase/documentPages.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function service(client, render) {
 const exports={};vm.runInNewContext(compiled,{exports,require(name){
  if(name==='./client')return{requireSupabase:()=>client};
  if(name==='../../features/media/documentPageRenderer')return{generateDocumentPages:render};
  throw Error('Unexpected import '+name);
 }});return exports.prepareProjectDocumentPages;
}
for(const enabled of [false,true])test(`publish page preparation capability ${enabled?'on':'off'} prevents unintended uploads`,async()=>{
 const calls=[];let uploads=0,renders=0;
 const client={rpc:async(name,args)=>{calls.push([name,args]);return{data:name==='document_page_prerender_enabled'?enabled:true,error:null};},from(table){
  const q={select:()=>q,eq:()=>q,single:async()=>({data:{profile_id:'owner',is_hidden:false},error:null}),then(resolve){return Promise.resolve({data:[{id:'doc',citation_id:'uuid',storage_path:'original'}],error:null}).then(resolve);}};
  assert.ok(['projects','project_attachments'].includes(table));return q;
 },storage:{from(bucket){return{createSignedUrl:async()=>({data:{signedUrl:'signed-original'},error:null}),upload:async()=>{assert.equal(bucket,'project-covers');uploads++;return{error:null};}};}}};
 const prepare=service(client,async(url,prefix,upload)=>{renders++;assert.equal(url,'signed-original');assert.equal(prefix,'owner/project/uuid');await upload('path',{});return{count:65,pages:[],failed:[2],backfillFrom:61};});
 const result=await prepare('project');
 assert.equal(renders,enabled?1:0);assert.equal(uploads,enabled?1:0);
 if(enabled){assert.deepEqual(JSON.parse(JSON.stringify(calls[1])),['is_citation_project_public',{p_id:'project'}]);assert.equal(calls[2][0],'set_document_page_previews');assert.equal(calls[2][1].p_backfill_from,61);assert.match(result,/need backfill/);}else assert.equal(result,undefined);
});

test('owner project visits prepare deferred private-to-public documents without visitor writes',()=>{
 const viewer=readFileSync(new URL('../src/components/media/ProjectMediaViewer.tsx',import.meta.url),'utf8');
 assert.match(viewer,/if \(isOwner && !readOnlyShare\) void prepareProjectDocumentPages\(projectId\)/);
 assert.match(source,/if \(project.data.is_hidden\) return undefined/);
 assert.match(source,/metadata.renderedPages.length >= preparedCount/);
});
