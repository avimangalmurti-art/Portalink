import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sourceModule} from './helpers/source-module.mjs';
const model=sourceModule('src/features/studio/workbenchModel.ts');
const now=Date.parse('2026-10-03T12:00:00Z'),day=86400000;
const project=(id='p',patch={})=>({id,title:'Study',summary:'A study',coverThumbnail:'/cover.webp',publishedAt:'2026-08-01',creationDetails:{madeIn:'2026-08',answers:{what:'A study',did:'Designed',learned:'Iterated'}},...patch});
const rows=(p,activity=[],reach=[{projectId:'p',opened:1}],dismissed={})=>model.attentionRows({projects:Array.isArray(p)?p:[p]},reach,activity,dismissed,now);
test('cover, description, story and date gaps fire and clear from canonical data',()=>{
 assert.deepEqual(Array.from(rows(project(),[],[]),r=>r.action),[]);
 for(const [patch,action] of [[{coverThumbnail:undefined},'cover'],[{summary:''},'description'],[{creationDetails:{madeIn:'2026-08',answers:{what:'',did:'',learned:''}}},'description'],[{creationDetails:{madeIn:'',answers:{what:'A',did:'B',learned:'C'}}},'date']])assert.equal(rows(project('p',patch),[],[])[0].action,action);
});
const event=(kind,patch={})=>({projectId:'p',attachmentId:'a',pageIndex:2,page:2,kind,at:new Date(now-day).toISOString(),...patch});
test('reply and recent member activity are separate, deduplicated and clear when removed',()=>{
 assert.deepEqual(Array.from(rows(project(),[event('read'),event('read')]),r=>r.action),['read']);
 assert.deepEqual(Array.from(rows(project(),[event('reply'),event('read')]),r=>r.action),['reply','read']);
 assert.equal(rows(project(),[event('read',{at:new Date(now-8*day).toISOString()})]).length,0);
 assert.equal(rows(project(),[event('reply',{at:new Date(now-30*day).toISOString()})])[0].label,'Reply · page 3');
 assert.equal(rows(project(),[]).length,0);
});
test('stale share needs a measured zero and at least thirty days published',()=>{
 assert.equal(rows(project(),[],[{projectId:'p',opened:0}])[0].action,'share');
 assert.equal(rows(project(),[],undefined).length,0);
 assert.equal(rows(project('p',{publishedAt:new Date(now-day).toISOString()}),[],[{projectId:'p',opened:0}]).length,0);
});
test('global priority, eight-row cap and project-wide 30-day dismissal expiry',()=>{
 const ps=Array.from({length:4},(_,i)=>project(String(i),{coverThumbnail:undefined,summary:'',creationDetails:undefined}));
 const all=rows(ps,[],[]);
 assert.deepEqual(Array.from(all,r=>r.action),[...Array(4).fill('cover'),...Array(4).fill('description'),...Array(4).fill('date')]);
 assert.equal(model.visibleAttention(all).length,5);assert.equal(model.visibleAttention(all,true).length,12);
 assert.equal(rows(ps,[],[],{'0':now}).length,9);
 assert.equal(model.isDismissed(now-30*day,now),false);assert.equal(model.isDismissed(now-30*day+1,now),true);assert.equal(model.isDismissed(now+1,now),false);
});
test('Continue chooses latest edit and retains the exact saved step',()=>{
 const draft=(id,stage,updatedAt)=>({id,stage,updatedAt,createdAt:'2026-08-01',metadata:{title:''}});
 for(const step of ['files','details','review'])assert.equal(model.newestDraft([draft('old','files','2026-09-01'),draft('new',step,'2026-10-01')]).stage,step);
 assert.equal(model.newestDraft([]),null);
});
const View=sourceModule('src/features/studio/StudioWorkbenchView.tsx',{'../../presentation/mobile/MobileContextActions':{MobileContextButton:()=>null},'react':React,'lucide-react':{PlusIcon:()=>null,PauseIcon:()=>null},'../../components/media/ProjectCover':{ProjectCover:()=>null},'./StudioRow':{StudioRow:()=>null},'./StudioActionSheet':{StudioActionSheet:()=>null},'./workbenchModel':model,'./studio-workbench.css':{}}).StudioWorkbenchView;
const props={draft:null,draftCount:0,attention:[],week:null,publishedCount:0,material:[],partial:false,onContinue(){},onDrafts(){},onBookmarks(){},onReads(){},onMaterial(){},onAttention(){},onDismiss(){}};
test('all-done line, no invented sections and Reads hidden without published work',()=>{
 const empty=renderToStaticMarkup(React.createElement(View,props));assert.match(empty,/Nothing needs your attention/);assert.match(empty,/Portal popup on your profile/);assert.doesNotMatch(empty,/Needs attention|Reads this week|Material/);
 const active=renderToStaticMarkup(React.createElement(View,{...props,attention:rows(project('p',{summary:''}))}));assert.doesNotMatch(active,/Reads this week/);
 const reads=renderToStaticMarkup(React.createElement(View,{...props,publishedCount:1,week:model.weeklyReads([{projectId:'p',title:'Study',opened:4,finished:2}],3)}));assert.match(reads,/Reads this week/);assert.match(reads,/Top project/);
});
