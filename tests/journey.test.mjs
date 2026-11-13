import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const load=(path,imports={},globals={})=>{const exports={};vm.runInNewContext(ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Date,crypto,...globals,require:name=>{assert.ok(name in imports,'Unexpected '+name);return imports[name];}});return exports;};
const storage=new Map();
const j=load('src/features/journey/journey.ts',{}, {localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
const first=load('src/features/publishing/firstProject.ts');
const project=(id,month,published='2026-01-02T12:00:00Z',extra={})=>({id,title:id,summary:'First description line.\nSecond.',publishedAt:published,isPubliclyVisible:true,creationDetails:{madeIn:month,field:'Design',answers:{what:'',did:'',learned:''}},...extra});
const plain=value=>JSON.parse(JSON.stringify(value));
test('years and months sort newest first, with publication timestamp as a stable tie-break',()=>{
 const groups=j.journeyGroups([project('old','2021-03'),project('b','2025-04','2025-04-02'),project('a','2025-04','2025-04-03'),project('aug','2025-08')],false,2026);
 assert.deepEqual(plain(groups.map(g=>[g.year,g.projects.map(p=>p.id)])),[[2025,['aug','a','b']],[2021,['old']]]);
});
test('made_in falls back to published_at without inventing a date for invalid records',()=>{
 assert.equal(j.projectMonth(project('x','2020-12')),'2020-12');
 for(const month of ['',undefined,'2022-13','0000-01']) assert.equal(j.projectMonth(project('x',month)),'2026-01');
 assert.equal(j.projectMonth(project('x','','bad')),null);
});
test('learned line prefers the structured answer, otherwise the first nonempty description line',()=>{
 const p=project('x','');p.creationDetails.answers.learned=' A\n lesson. ';assert.equal(j.learnedLine(p),'A lesson.');
 p.creationDetails.answers.learned=' ';p.summary='\n First.\n Second.';assert.equal(j.learnedLine(p),'First.');
 p.summary='';assert.equal(j.learnedLine(p),'');
});
test('gaps stop at earliest work, include current year, and never appear for visitors or an empty Journey',()=>{
 const items=[project('a','2021-01'),project('b','2023-01'),project('c','2025-01')];
 assert.deepEqual(plain(j.journeyGroups(items,true,2026).filter(g=>g.gap).map(g=>g.year)),[2026,2024,2022]);
 assert.equal(j.journeyGroups(items,false,2026).some(g=>g.gap),false);
 assert.equal(j.journeyGroups([],true,2026).length,0);
 assert.deepEqual(plain(j.journeyGroups([project('future','2028-01')],true,2026).map(g=>g.year)),[2028]);
});
test('owner sees hidden published entries; drafts/session-only previews and hidden visitor work stay out',()=>{
 const items=[project('a','2021-01'),project('hidden','2022-01',undefined,{isPubliclyVisible:false}),project('draft','2023-01',undefined,{sessionOnly:true})];
 assert.deepEqual(plain(j.journeyProjects(items,true).map(p=>p.id)),['a','hidden']);
 assert.deepEqual(plain(j.journeyProjects(items,false).map(p=>p.id)),['a']);
});
test('Journey gates owner/member/share access and pair requires two different visible projects',()=>{
 const profile={showJourney:false,projects:[project('a','2020-01'),project('b','2025-01')],thenNow:{then:'a',now:'b'}};
 assert.equal(j.journeyAllowed(profile,true),true);assert.equal(j.journeyAllowed(profile,false),false);
 assert.ok(j.visiblePair(profile,true));assert.equal(j.visiblePair(profile,false),null);
 profile.showJourney=true;assert.ok(j.visiblePair(profile,false));
 profile.projects[1].isPubliclyVisible=false;assert.equal(j.visiblePair(profile,true),null);assert.equal(j.visiblePair(profile,false),null);
 for(const pair of [{then:'a',now:'a'},{then:'a'},null,[]])assert.equal(j.readThenNow(pair),null);
});
test('device view preference is isolated per viewer and creator and survives a remount',()=>{
 const own=j.journeyPreferenceKey('me','creator'),guest=j.journeyPreferenceKey(null,'creator');
 assert.equal(j.readJourneyPreference(own),'portfolio');j.rememberJourneyPreference(own,'journey');assert.equal(j.readJourneyPreference(own),'journey');
 assert.equal(j.readJourneyPreference(guest),'portfolio');assert.equal(j.readJourneyPreference(j.journeyPreferenceKey('me','another')),'portfolio');
});
test('native null caption clears legacy text; absent column reads the compatibility caption',()=>{
 const design={journeyCaption:'Legacy'};assert.equal(j.readJourneyCaption({design}),'Legacy');assert.equal(j.readJourneyCaption({design,then_now_caption:null}),'');assert.equal(j.readJourneyCaption({design,then_now_caption:'New'}),'New');
});
function fixture(errors={}) {
 const calls=[];let row={design:{pagesPerRow:2,unrelated:'keep'},revision:'r1',...(['42703','PGRST204'].includes(errors.details?.code)?{}:{made_in:null,field:null,story_answers:null}),...(['42703','PGRST204'].includes(errors.caption?.code)?{}:{then_now_caption:null})};
 const client={from(){let update;const q={select:()=>q,eq:()=>q,update:value=>{update=value;return q;},single:async()=>{if(!update)return{data:row};calls.push(update);return{data:{id:'x'},error:'then_now_caption'in update?errors.caption:errors.details};},maybeSingle:async()=>{calls.push(update);const error=errors.details?.code==='42501'?errors.details:null;if(error)return{data:null,error};row={...row,...update};return{data:{id:'x'}};}};return q;}};
 const service=load('src/services/supabase/projectCreationDetails.ts',{'./client':{requireSupabase:()=>client},'../../features/publishing/firstProject':first});
 return{calls,service,get row(){return row;}};
}
test('Journey saves use existing context plus caption, without any media operations',async()=>{
 const f=fixture();await f.service.saveProjectJourneyDetails('x',project('x','2021-03').creationDetails,' Caption ');
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].made_in,'2021-03');assert.equal(f.calls[0].then_now_caption,'Caption');
});
test('absent native columns fall back without erasing existing design keys',async()=>{
 const f=fixture({details:{code:'42703',message:'column made_in does not exist'},caption:{code:'PGRST204',message:"Could not find the 'then_now_caption' column"}});
 await f.service.saveProjectJourneyDetails('x',project('x','2021-03').creationDetails,'Earlier work');
 assert.equal(f.calls.length,1);assert.equal(f.row.design.pagesPerRow,2);assert.equal(f.row.design.unrelated,'keep');assert.equal(f.row.design.projectContext.madeIn,'2021-03');assert.equal(f.row.design.journeyCaption,'Earlier work');
});
test('permission errors and invalid dates/captions never trigger compatibility writes',async()=>{
 const f=fixture({details:{code:'42501',message:'denied'}});await assert.rejects(f.service.saveProjectJourneyDetails('x',project('x','2021-03').creationDetails,''),/denied/);assert.equal(f.calls.length,1);
 const valid=fixture();await assert.rejects(valid.service.saveProjectJourneyDetails('x',project('x','2021-19').creationDetails,''),/valid month/);await assert.rejects(valid.service.saveProjectJourneyDetails('x',project('x','2021-03').creationDetails,'a'.repeat(181)),/180/);assert.equal(valid.calls.length,0);
});
test('source integration keeps Portfolio separate, restores drafts and protects a gap preset from PDF metadata',()=>{
 const profile=read('src/components/UserProfilePage.tsx'),visitor=read('src/visitor/VisitorProfileGrid.tsx'),app=read('src/App.tsx'),flow=read('src/features/publishing/usePublishProject.ts');
 assert.match(profile,/const showsMobileReorder = !isJourney/);assert.match(profile,/JourneyView[^>]*profile=\{profile\}/);assert.match(profile,/mode !== 'description'/);
 assert.match(visitor,/profile.showJourney === true/);assert.match(visitor,/owner=\{false\}/);
 assert.match(app,/setJourneyMadeIn\(year \? `\$\{year\}-01`/);assert.match(app,/publishedProjectId=\{firstProjectPublisher && isFirstProjectPublish/);
 assert.ok(flow.indexOf('if (saved)')<flow.indexOf('madeIn: presetMadeIn'));assert.match(flow,/setMetadata\(saved.metadata\)/);
 assert.match(read('src/features/publishing/FirstProjectFiles.tsx'),/monthTouched = useRef\(Boolean\(flow.presetMadeIn/);
});
test('pending schema enforces pair ownership, shape, visibility and cleanup without adding a second learned field',()=>{
 const sql=read('supabase/migrations/202609300005_profile_journey.sql'),bundle=read('supabase/pending/shared_profile_bundle.sql');
 for(const pattern of [/show_journey boolean not null default false/,/then_now jsonb/,/then_now_caption text/,/story_answers jsonb/,/then_id=now_id/,/p.profile_id=new.id/,/not p.is_hidden and not c.is_hidden/,/for share of p,c/,/after update of is_hidden,category_id,profile_id,id or delete/,/revoke all on function public.clear_project_journey_pair/])assert.match(sql,pattern);
 assert.doesNotMatch(sql,/add column.*learned/);assert.match(bundle,/show_journey/);assert.match(bundle,/exists \(select 1 from visible_projects p/);assert.match(bundle,/to_jsonb\(p\) \? 'then_now_caption'/);
});
