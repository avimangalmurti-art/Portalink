import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const compiled=ts.transpileModule(readFileSync(new URL('../src/features/publishing/PublishProjectDialog.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const nodes=tree=>React.isValidElement(tree)?[tree,...React.Children.toArray(tree.props.children).flatMap(nodes)]:[];
function harness(presentation='mobile',changes={}) {
 const calls=[],states=[],refs=[],hookCalls=[];let stateIndex=0,refIndex=0;
 const flow={step:'metadata',state:'editing',isDirty:true,isOwner:true,location:'',inferredRelevance:{},draft:{id:'draft'},metadata:{title:'Project',summary:'Description'},fieldErrors:{},media:{items:[{}],state:'ready'},upload:{},publish:{status:'idle'},saveLocalDraft:async()=>{calls.push('save');},discard:async()=>{calls.push('discard');return true;},...changes};
 const exports={};
 vm.runInNewContext(compiled,{exports,require(name){
  if(name==='react')return {...React,useState:value=>{const i=stateIndex++;if(!(i in states))states[i]=value;return[states[i],next=>{states[i]=next;}];},useRef:value=>refs[refIndex++]??(refs[refIndex-1]={current:value}),useEffect(){}};
  if(name==='./usePublishProject')return {usePublishProject:(...args)=>{hookCalls.push(args);return flow;}};
  if(name.endsWith('/usePresentation'))return {usePresentation:()=>presentation};
  return new Proxy({},{get:(_,key)=>key});
 }});
 const render=(props={})=>{stateIndex=0;refIndex=0;return exports.PublishProjectDialog({isOpen:true,profileId:'owner',categoryId:'portal',categoryLabel:'Work',onClose:()=>calls.push('close'),onPublished(){},...props});};
 return {calls,hookCalls,render};
}

test('mobile close awaits its local checkpoint and retains work when saving fails',async()=>{
 const saved=harness();await saved.render().props.onClose();assert.deepEqual(saved.calls,['save','close']);
 const failed=harness('mobile',{saveLocalDraft:async()=>{throw Error('Storage full');}});
 await failed.render().props.onClose();assert.deepEqual(failed.calls,[]);
});

test('desktop saves dirty work on close and retains the editor if saving fails',async()=>{
 const saved=harness('web');await saved.render().props.onClose();assert.deepEqual(saved.calls,['save','close']);
 assert.equal(saved.hookCalls[0][5],false);assert.equal(saved.hookCalls[0][7].persist,true);
 const failed=harness('web',{saveLocalDraft:async()=>{throw Error('Storage full');}});
 await failed.render().props.onClose();assert.deepEqual(failed.calls,[]);
 const clean=harness('web',{isDirty:false});
 await clean.render().props.onClose();assert.deepEqual(clean.calls,['discard','close']);
});

test('mobile Details explicitly confirms discard separately from saving and closing',async()=>{
 const h=harness('mobile',{firstProjectStage:'details'}),tree=h.render();
 const guided=nodes(tree).find(node=>node.type==='MobilePublishFlow');
 const discard=nodes(guided.props.notices).find(node=>node.type==='button'&&node.props.children==='Discard draft');
 discard.props.onClick();
 const confirmation=h.render().props.confirmation;
 assert.equal(confirmation.props.title,'Discard this draft?');
 await confirmation.props.onDiscard();assert.deepEqual(h.calls,['discard','close']);
});

test('mobile and desktop forward the exact saved-draft identity',()=>{
 const resume={id:'saved',profileId:'owner',categoryId:'portal'};
 for(const presentation of ['mobile','web']){
  const h=harness(presentation);h.render({resumeDraft:resume});
  assert.equal(h.hookCalls[0][7].persist,true);
  assert.equal(h.hookCalls[0][7].resume,resume);
 }
});
