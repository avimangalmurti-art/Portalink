import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sourceModule} from './helpers/source-module.mjs';
const model=sourceModule('src/features/record/model.ts'),id='00000000-0000-0000-0000-000000000001';
const fresh={profileId:id,generatedAt:new Date().toISOString(),steps:Array.from({length:10},(_,index)=>({key:'step-'+index,label:'Step '+index,field:'headline',done:false})),tidyups:[],events:[],lastSeen:null,linkChecksReady:true};
function ui(record){return sourceModule('src/features/record/RecordBlock.tsx',{'react':React,'./OwnerRecordProvider':{useOwnerRecord:()=>record},'./model':model,'./record.css':{}});}
const view=(Component,props={})=>renderToStaticMarkup(React.createElement(Component,props));
test('fresh Overview has ten undone steps, exact intro, no school or AI, and no tidy-ups',()=>{
 const record={status:fresh,error:'',open(){},remember(){}},html=view(ui(record).RecordBlock);assert.match(html,/0 of 10 done/);assert.match(html,/This is what someone sees when they open your link/);assert.equal((html.match(/class="record-target"/g)||[]).length,10);assert.doesNotMatch(html,/Tidy-ups<|school|Connect your AI/);
});
test('done rows have a check, snoozed rows move to the bottom, Never rows disappear, and completed state collapses',()=>{
 const status={...fresh,steps:fresh.steps.map((row,index)=>({...row,done:index===0})),events:[{event:'snooze',key:'step-1',expiresAt:new Date(Date.now()+10000).toISOString()},{event:'never',key:'step-2'}]};const html=view(ui({status,error:'',open(){}}).RecordBlock);assert.match(html,/✓ Step 0/);assert.ok(html.indexOf('Step 1')>html.indexOf('Step 9'));assert.doesNotMatch(html,/Step 2/);const complete={...fresh,steps:fresh.steps.map(row=>({...row,done:true}))};const result=view(ui({status:complete}).RecordBlock);assert.match(result,/Your record is complete/);assert.doesNotMatch(result,/record-target/);
});
test('each secondary surface chooses one applicable active step and Home requires the three-day gate',()=>{
 const status={...fresh,steps:[{key:'dates',label:'Set the dates you made these',field:'date',projectId:id},{key:'citable',label:'Make one project citable',field:'citable',projectId:id}]};assert.equal(view(ui({status,away:false}).RecordSingleLine,{scope:'home'}),'');const home=view(ui({status,away:true}).RecordSingleLine,{scope:'home'});assert.match(home,/Set the dates/);assert.doesNotMatch(home,/Make one project/);const publish=view(ui({status,away:true}).RecordSingleLine,{scope:'publish',projectId:id});assert.match(publish,/Set the dates/);assert.doesNotMatch(publish,/Make one project/);assert.equal(view(ui(null).RecordSingleLine,{scope:'home'}),'');
});
test('owner actions prepend exactly one project step; other accounts keep their existing actions',()=>{
 const calls=[],record={status:{...fresh,tidyups:[{key:'summary:'+id,label:'Add a summary to Wet Paint',field:'summary',projectId:id}]},open:row=>calls.push(row.key)};
 const module=sourceModule('src/features/record/RecordActionSheet.tsx',{'react':React,'react-router-dom':{useLocation:()=>({pathname:`/p/${id}/c/${id}/${id}`,search:''})},'lucide-react':{PencilIcon:'icon'},'../../components/messages/MobileActionSheet':{MobileActionSheet:'sheet'},'./OwnerRecordProvider':{useOwnerRecord:()=>record},'./RecordBlock':{RecordRowControls:'row-memory'},'./model':model});
 const props={model:{primary:[{id:'edit',label:'Edit'}],groups:[],viewer:{owner:true}},onClose:()=>calls.push('close'),onAction:()=>calls.push('original')};const result=module.RecordActionSheet(props);assert.equal(result.props.model.primary.length,2);assert.equal(result.props.model.primary[0].label,'Add a summary to Wet Paint');result.props.onAction(result.props.model.primary[0]);assert.deepEqual(calls,['close','summary:'+id]);assert.deepEqual(module.RecordActionSheet({...props,model:{...props.model,viewer:{owner:false}}}).props.model.primary,props.model.primary);
});
