import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const load = (file, imports={}, globals={}) => {
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,Date,crypto,...globals,require:name=>{assert.ok(name in imports,'Unexpected import '+name);return imports[name];}});
  return exports;
};
const first=load('src/features/publishing/firstProject.ts');
const details={madeIn:'2024-05',field:'Architecture',answers:{what:'  A study. ',did:' I designed it. ',learned:' Light matters. '}};
test('only mobile zero-project onboarding selects first-project landing and explicit destinations survive',()=>{
  assert.equal(first.shouldStartFirstProject(true,0),true);
  assert.equal(first.shouldStartFirstProject(true,0,'create-project'),true);
  for(const intent of ['route','messages','studio','view-profile']) assert.equal(first.shouldStartFirstProject(true,0,intent),false);
  assert.equal(first.shouldStartFirstProject(false,0),false);assert.equal(first.shouldStartFirstProject(true,1),false);
});
test('title uses PDF metadata then filename without its final extension',()=>{
  assert.equal(first.firstProjectTitle('study.final.pdf','  Quiet  Rooms '),'Quiet Rooms');
  assert.equal(first.firstProjectTitle('study.final.pdf','   '),'study.final');
  assert.equal(first.firstProjectTitle('image.jpg',null),'image');
  assert.equal(first.firstProjectTitle('x.pdf','x'.repeat(100)).length,80);
});
test('made in prefers PDF creation month, then file modification month, without inventing a date',()=>{
  assert.equal(first.firstProjectMonth(new Date(2023,1,3).getTime(),new Date(2024,4,17)),'2024-05');
  assert.equal(first.firstProjectMonth(new Date(2023,1,3).getTime(),new Date('invalid')),'2023-02');
  assert.equal(first.firstProjectMonth(NaN),'');
});
test('three optional prompts compose in order, skipping empty answers',()=>{
  assert.equal(first.composeProjectDescription(details.answers),'A study.\n\nI designed it.\n\nLight matters.');
  assert.equal(first.composeProjectDescription({what:'',did:'  ',learned:'Learned'}),'Learned');
  assert.equal(first.composeProjectDescription({what:'',did:'',learned:''}),'');
});
test('live share card dismissal is once per profile across remounts and later publications',()=>{
  const values=new Map(),store={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  assert.equal(first.rememberLivePortfolio('a','project',store),true);
  assert.equal(first.readLivePortfolio('a',store),'project');
  first.dismissLivePortfolio('a',store);
  assert.equal(first.livePortfolioDismissed('a',store),true);
  assert.equal(first.readLivePortfolio('a',store),null);
  assert.equal(first.rememberLivePortfolio('a','another',store),false);
  assert.equal(first.rememberLivePortfolio('b','another',store),true);
});
test('column reader uses canonical fields and safely reads legacy project JSON when absent',()=>{
  const legacy=first.readCreationDetails({design:{typefaceId:'inter',projectContext:details}});
  assert.equal(legacy.answers.learned,details.answers.learned);
  assert.equal(first.readCreationDetails({made_in:'2025-01',field:'Design',story_answers:{learned:'New'},design:{projectContext:details}}).madeIn,'2025-01');
  assert.equal(first.readCreationDetails({design:{typefaceId:'inter'}}),undefined);
});
function clientFixture(error){
 const calls=[];let row={design:{typefaceId:'inter',pagesPerRow:2,other:'keep'},revision:crypto.randomUUID()};
 const client={from(){let update=null;const query={select:()=>query,eq:()=>query,update:value=>{update=value;return query;},single:async()=>{
  if(update){calls.push(update);return {error};}return {data:row,error:null};},maybeSingle:async()=>{calls.push(update);row={...row,...update};return {data:{id:'project'},error:null};}};return query;}};
 return {client,calls,get row(){return row;}};
}
test('absent columns preserve authored context and all existing design keys with revision protection',async()=>{
 const f=clientFixture({code:'PGRST204',message:"Could not find the 'made_in' column in the schema cache"});
 const service=load('src/services/supabase/projectCreationDetails.ts',{'./client':{requireSupabase:()=>f.client},'../../features/publishing/firstProject':first});
 await service.saveProjectCreationDetails('project',details);
 assert.equal(f.calls.length,2);assert.equal(f.row.design.typefaceId,'inter');assert.equal(f.row.design.pagesPerRow,2);assert.equal(f.row.design.other,'keep');
 assert.equal(f.row.design.projectContext.answers.learned,details.answers.learned);
});
test('native columns need one write and real permissions/network failures never fall back',async()=>{
 for(const error of [null,{code:'42501',message:'permission denied'},{code:'PGRST204',message:"Could not find the 'unrelated' column"}]){
  const f=clientFixture(error),service=load('src/services/supabase/projectCreationDetails.ts',{'./client':{requireSupabase:()=>f.client},'../../features/publishing/firstProject':first});
  if(error)await assert.rejects(service.saveProjectCreationDetails('project',details));else await service.saveProjectCreationDetails('project',details);
  assert.equal(f.calls.length,1);
 }
});
