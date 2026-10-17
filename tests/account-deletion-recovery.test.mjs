import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const file=new URL('../src/features/auth/useDeletionRecovery.ts',import.meta.url);
test('a fresh signed-out page restores minimal progress; closing only hides the surface',async()=>{
 const calls=[];const service={getAccountDeletionRecovery:async()=>({accountId:'old-private-account'}),getAccountDeletionStatus:async id=>{calls.push(id);return {status:'processing',isDeleted:false,message:'private metadata must not be rendered'};}};
 const h=hookHarness(file,'useDeletionRecovery',{auth:service},{},{enabled:true,viewerAccountId:null,initializing:false});
 await h.flush();assert.equal(h.value.isOpen,true);assert.equal(h.value.result.status,'processing');assert.deepEqual(calls,['old-private-account']);
 h.value.close();await h.flush();assert.equal(h.value.isOpen,false);assert.deepEqual(calls,['old-private-account']);
 h.dispose();
});

test('initialization and the hard lock defer receipt reads; a different account suppresses late old progress',async()=>{
 let reads=0;const pending=deferred();
 const service={getAccountDeletionRecovery:async()=>{reads++;return {accountId:'old'};},getAccountDeletionStatus:()=>pending.promise};
 const h=hookHarness(file,'useDeletionRecovery',{auth:service},{},{enabled:false,viewerAccountId:null,initializing:false});
 await h.flush();assert.equal(reads,0);
 h.options({enabled:true,viewerAccountId:null,initializing:true});await h.flush();assert.equal(reads,0);
 h.options({enabled:true,viewerAccountId:null,initializing:false});await h.flush();assert.equal(h.value.isOpen,true);
 h.options({enabled:true,viewerAccountId:'new',initializing:false});await h.flush();assert.equal(h.value.isOpen,false);
 pending.resolve({status:'completed',isDeleted:true,message:'Completed'});await h.flush();assert.equal(h.value.isOpen,false);assert.equal(h.value.result,null);
 h.dispose();
});

test('unavailable or expired status preserves progress and permits checking again',async()=>{
 let fail=false;
 const service={getAccountDeletionRecovery:async()=>({accountId:'old'}),getAccountDeletionStatus:async()=>{if(fail)throw Error('expired private receipt');return {status:'processing',isDeleted:false,message:'Processing'};}};
 const h=hookHarness(file,'useDeletionRecovery',{auth:service},{},{enabled:true,viewerAccountId:null,initializing:false});
 await h.flush();fail=true;await h.value.refresh();await h.flush();assert.equal(h.value.unavailable,true);assert.equal(h.value.result.status,'processing');assert.equal(h.value.isOpen,true);
 fail=false;await h.value.refresh();await h.flush();assert.equal(h.value.unavailable,false);h.dispose();
});

function component(enabled,state){
 const exports={};const auth={user:null,isInitializing:false};
 const react={...React,useRef:()=>({current:null}),useEffect(){ /* Static component tree; async lifecycle is exercised above. */ }};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/auth/AccountDeletionRecovery.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require(name){
  if(name==='react')return react;if(name==='react/jsx-runtime')return jsxRuntime;
  if(name.endsWith('/client'))return {accountDeletionEnabled:enabled};
  if(name.endsWith('/AuthContext'))return {useAuth:()=>auth};
  if(name.endsWith('/useDeletionRecovery'))return {useDeletionRecovery:()=>state};
  if(name.endsWith('/deletionRecoverySignal'))return {DELETION_RECOVERY_OPEN_EVENT:'portalink:deletion-recovery-open'};
  if(name.endsWith('/useModalFocus'))return {useModalFocus(){ /* No DOM in this semantic render fixture. */ }};
  if(name.endsWith('/ModalPortal'))return {ModalPortal:'Portal'};if(name.endsWith('/Button'))return {Button:'Button'};
  throw Error(name);
 }});
 const entry=exports.AccountDeletionRecovery();return entry?.type(entry.props)??null;
}
const nodes=value=>{if(!value||typeof value!=='object')return [];return [value,...React.Children.toArray(value.props?.children).flatMap(nodes)];};
const text=tree=>nodes(tree).flatMap(node=>React.Children.toArray(node.props?.children).filter(value=>typeof value==='string')).join(' ');
test('recovery copy requires both completion markers, hides private result details, and Close never cancels a job',()=>{
 let closed=0,checked=0;const state={isOpen:true,checking:false,none:false,unavailable:false,result:{status:'processing',isDeleted:false,message:'old-account-id old@email.test secret-receipt'},close:()=>closed++,refresh:()=>checked++};
 assert.equal(component(false,state),null);
 let tree=component(true,state);assert.match(text(tree),/Deletion is in progress/);assert.doesNotMatch(text(tree),/old-account|old@email|secret-receipt/);
 nodes(tree).find(node=>node.type==='Button'&&node.props.children==='Close').props.onClick();assert.equal(closed,1);assert.equal(checked,0);
 state.result={status:'completed',isDeleted:false,message:'Bad marker'};tree=component(true,state);assert.doesNotMatch(text(tree),/Account deletion is complete/);
 state.result={status:'completed',isDeleted:true,message:'old@email.test'};tree=component(true,state);assert.match(text(tree),/Account deletion is complete/);assert.doesNotMatch(text(tree),/old@email/);
 state.result=null;state.unavailable=true;tree=component(true,state);assert.match(text(tree),/does not confirm completion or cancel deletion/);assert.ok(nodes(tree).some(node=>node.type==='a'&&node.props.children==='Contact support'));
});
