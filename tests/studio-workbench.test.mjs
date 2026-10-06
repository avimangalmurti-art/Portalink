import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sourceModule} from './helpers/source-module.mjs';
const model=sourceModule('src/features/studio/workbenchModel.ts');
const now=Date.parse('2026-10-03T12:00:00Z'),day=86400000;
const project=(id='p',patch={})=>({id,title:'Study',summary:'A study',coverThumbnail:'/cover.webp',publishedAt:'2026-08-01',creationDetails:{madeIn:'2026-08',answers:{what:'A study',did:'Designed',learned:'Iterated'}},...patch});
const rows=(p,activity=[],reach=[{projectId:'p',opened:1}],dismissed={})=>model.attentionRows({projects:Array.isArray(p)?p:[p]},reach,activity,dismissed,now);
test('description and date gaps fire and clear; absent automatic cover previews need no action',()=>{
 assert.deepEqual(Array.from(rows(project(),[],[]),r=>r.action),[]);
 assert.equal(rows(project('p',{coverThumbnail:undefined}),[],[]).length,0);
 for(const [patch,action] of [[{summary:''},'description'],[{creationDetails:{madeIn:'',answers:{what:'A',did:'B',learned:'C'}}},'date']])assert.equal(rows(project('p',patch),[],[])[0].action,action);
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
test('global priority, five-row preview and project-wide 30-day dismissal expiry',()=>{
 const ps=Array.from({length:4},(_,i)=>project(String(i),{coverThumbnail:undefined,summary:'',creationDetails:undefined}));
 const all=rows(ps,[],[]);
 assert.deepEqual(Array.from(all,r=>r.action),[...Array(4).fill('description'),...Array(4).fill('date')]);
 assert.equal(model.visibleAttention(all).length,5);assert.equal(model.visibleAttention(all,true).length,8);
 assert.equal(rows(ps,[],[],{'0':now}).length,6);
 assert.equal(model.isDismissed(now-30*day,now),false);assert.equal(model.isDismissed(now-30*day+1,now),true);assert.equal(model.isDismissed(now+1,now),false);
});
test('Continue chooses latest edit and retains the exact saved step',()=>{
 const draft=(id,stage,updatedAt)=>({id,stage,updatedAt,createdAt:'2026-08-01',metadata:{title:''}});
 for(const step of ['files','details','review'])assert.equal(model.newestDraft([draft('old','files','2026-09-01'),draft('new',step,'2026-10-01')]).stage,step);
 assert.equal(model.newestDraft([]),null);
});
const viewModule=sourceModule('src/features/studio/StudioWorkbenchView.tsx',{'../../presentation/mobile/MobileContextActions':{MobileContextButton:()=>null},'react':React,'lucide-react':{PlusIcon:()=>null,PauseIcon:()=>null},'../../components/media/ProjectCover':{ProjectCover:()=>null},'./StudioRow':{StudioRow:()=>null},'./StudioActionSheet':{StudioActionSheet:()=>null},'./workbenchModel':model,'./studio-workbench.css':{}});
const View=viewModule.StudioWorkbenchView;
const props={draft:null,draftCount:0,attention:[],week:null,publishedCount:0,material:[],partial:false,onContinue(){},onDrafts(){},onBookmarks(){},onReads(){},onMaterial(){},onAttention(){},onDismiss(){}};
test('Studio buttons remain label-only with no preview data',()=>{
 const empty=renderToStaticMarkup(React.createElement(View,props));assert.match(empty,/Nothing needs your attention/);assert.doesNotMatch(empty,/No drafts to continue|No published work yet/);assert.doesNotMatch(empty,/Reads this week/);assert.doesNotMatch(empty,/Needs attention|Material/);
 const active=renderToStaticMarkup(React.createElement(View,{...props,attention:rows(project('p',{summary:''}))}));assert.doesNotMatch(active,/Reads this week/);
 const reads=renderToStaticMarkup(React.createElement(View,{...props,publishedCount:1,week:model.weeklyReads([{projectId:'p',title:'Study',opened:4,finished:2}],3)}));assert.doesNotMatch(reads,/Reads this week/);assert.doesNotMatch(reads,/Top project|4 opened|2 finished|3 saved/);
});

test('Studio visibly offers labeled Bookmarks and Insights shortcuts before workspace content',()=>{
 const calls=[];
 const header=viewModule.StudioWorkbenchHeader({onBookmarks:()=>calls.push('bookmarks'),onReads:()=>calls.push('insights')});
 const nodes=e=>React.isValidElement(e)?[e,...React.Children.toArray(e.props.children).flatMap(nodes)]:[];
 const nav=nodes(header).find(e=>e.type==='nav');
 assert.equal(nav.props['aria-label'],'Studio sections');
 const buttons=nodes(nav).filter(e=>e.type==='button');
 assert.equal(buttons.length,2);buttons.forEach(b=>b.props.onClick());
 assert.deepEqual(calls,['bookmarks','insights']);
 const html=renderToStaticMarkup(header);
 assert.match(html,/Bookmarks/);assert.match(html,/Insights/);
 assert.doesNotMatch(html,/Saved projects, pages and creators|See how people engage/);
 assert.doesNotMatch(html,/Create portal|New project/);
});

test('Continue, Bookmarks and Insights offer distinct Studio destinations',()=>{
 const calls=[];
 const workspace={...props,draft:{id:'draft',stage:'details',createdAt:'2026-10-01',metadata:{title:'Study'}},onContinue:()=>calls.push('continue')};
 const header=viewModule.StudioWorkbenchHeader({workspace,onBookmarks:()=>calls.push('bookmarks'),onReads:()=>calls.push('reads')});
 const nodes=e=>React.isValidElement(e)?[e,...React.Children.toArray(e.props.children).flatMap(nodes)]:[];
 const buttons=nodes(nodes(header).find(e=>e.type==='nav')).filter(e=>e.type==='button');
 assert.ok(buttons.every(b=>nodes(b).filter(e=>e.type==='span').length===0));
 assert.deepEqual(buttons.map(b=>nodes(b).find(e=>e.type==='strong').props.children),['Continue','Bookmarks','Insights']);
 buttons.forEach(b=>b.props.onClick());assert.deepEqual(calls,['continue','bookmarks','reads']);
});



test('an existing description needs no story answers',()=>{ assert.equal(rows(project('p',{creationDetails:{madeIn:'2026-08',answers:{what:'',did:'',learned:''}}}),[],[]).length,0); });
