import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function reader(row) {
 const exports={};
 const client={from(table){assert.equal(table,'projects');return {select(selection){return {eq(column,id){assert.equal(column,'id');assert.equal(id,'project');return {async maybeSingle(){
  // Live schema has both creator and profile start-here relationships.
  if(!selection.includes('profiles!projects_profile_id_fkey(name)'))return {data:null,error:{code:'PGRST201',message:'More than one relationship'}};
  return {data:row,error:null};
 }}}}}}}};
 const code=ts.transpileModule(readFileSync('src/features/citations/service.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:path=>path.endsWith('/client')?{requireSupabase:()=>client}:{}});
 return exports.citationProject;
}

test('Studio reference project lookup selects creator despite reverse start-here relationship',async()=>{
 const project=await reader({id:'project',title:'Real title',profile_id:'creator',category_id:'portal',profiles:{name:'Citing creator'}})('project');
 assert.equal(project.creator,'Citing creator');
 assert.equal(project.title,'Real title');
 assert.equal(project.profileId,'creator');
});

test('missing or inaccessible citing project remains unavailable',async()=>{
 assert.equal(await reader(null)('project'),null);
});
