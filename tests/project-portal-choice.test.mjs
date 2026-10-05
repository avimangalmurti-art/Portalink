import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
test('closing the portal chooser cancels the create intent and restores the opener without navigation',()=>{
 const source=ts.createSourceFile('App.tsx',readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let handler;const visit=n=>{if(ts.isFunctionDeclaration(n)&&n.name?.text==='closePortalChoice')handler=n;ts.forEachChild(n,visit);};visit(source);assert.ok(handler);
 const state={};let focused=false;const context={mobilePublishOpener:{current:{isConnected:true,focus(){focused=true;}}},requestAnimationFrame:fn=>fn(),document:{querySelector:()=>null}};
 for(const key of ['GlobalCreateAccountId','PortalChoice','IsPublishOpen','PublishTargetCategoryId','PublishAccountId','FirstProjectPublisher','JourneyMadeIn'])context[`set${key}`]=value=>state[key]=value;
 vm.runInNewContext(ts.transpileModule(handler.getText(source)+';closePortalChoice();',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 assert.equal(state.GlobalCreateAccountId,null);assert.equal(state.PortalChoice,null);assert.equal(state.IsPublishOpen,false);assert.equal(state.PublishAccountId,null);assert.equal(state.JourneyMadeIn,null);assert.equal(focused,true);assert.equal(context.mobilePublishOpener.current,null);
});
function nodes(n){return React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];}
function harness(categories=[{id:'one',label:'Design'},{id:'two',label:'Music'}],create=async()=>({id:'new',label:'New'}),preferredId='two'){
 let cursor=0;const slots=[],chosen=[],created=[];
 const react={...React,useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=v];},useRef(v){const i=cursor++;return slots[i]??=( {current:v});}};
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/publishing/ProjectPortalChoice.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require(n){if(n==='react')return react;if(n.endsWith('useTouchTap'))return {useTouchTap:()=>({})};if(n.endsWith('useCategoryManagement'))return{MAX_CATEGORY_LABEL:40,validateCategoryLabel:(name,categories)=>!name.trim()?'Required':categories.some(c=>c.label.toLowerCase()===name.trim().toLowerCase())?'Duplicate':null};return new Proxy({},{get:(_,key)=>key});}});
 const render=()=>{cursor=0;return exports.ProjectPortalChoice({categories,preferredId,onChoose:id=>chosen.push(id),onCreate:async name=>{created.push(name);return create(name);},onClose(){}});};
 const submit=async()=>{nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setTimeout(r,0));};
 const newMode=()=>nodes(render()).filter(n=>n.props.role==='radio')[1].props.onClick();
 const name=value=>nodes(render()).find(n=>n.type==='ProfileField').props.onChange(value);
 return{render,submit,newMode,name,chosen,created};
}
test('existing portal choice keeps the preferred portal and allows a different destination',async()=>{const h=harness();assert.equal(nodes(h.render()).find(n=>n.type==='select').props.value,'two');nodes(h.render()).find(n=>n.type==='select').props.onChange({target:{value:'one'}});await h.submit();assert.deepEqual(h.chosen,['one']);assert.deepEqual(h.created,[]);});
test('new portal is explicitly created before the publisher receives its canonical ID',async()=>{const h=harness();h.newMode();h.name(' Photography ');await h.submit();assert.deepEqual(h.created,['Photography']);assert.deepEqual(h.chosen,['new']);});
test('accounts without portals start on creation without silently creating a Work portal',()=>{const h=harness([]);assert.ok(nodes(h.render()).some(n=>n.type==='ProfileField'));assert.equal(nodes(h.render()).find(n=>n.props.role==='radio').props.disabled,true);assert.deepEqual(h.created,[]);});
test('duplicate names and failed creation keep choice open and do not start a project',async()=>{const h=harness(undefined,async()=>null);h.newMode();h.name('Design');await h.submit();assert.deepEqual(h.created,[]);h.name('New');await h.submit();assert.deepEqual(h.chosen,[]);assert.ok(nodes(h.render()).some(n=>n.props.role==='alert'));});

test('a removed saved destination falls back to a valid portal rather than a dead Continue action',async()=>{const h=harness(undefined,undefined,'deleted');assert.equal(nodes(h.render()).find(n=>n.type==='select').props.value,'one');await h.submit();assert.deepEqual(h.chosen,['one']);});
test('creation pending prevents duplicate requests and failure preserves the typed name',async()=>{let reject;const wait=new Promise((_,no)=>reject=no);const h=harness(undefined,()=>wait);h.newMode();h.name('Keep this name');const first=h.submit();await h.submit();assert.equal(h.created.length,1);assert.equal(nodes(h.render()).find(n=>n.type==='fieldset').props.disabled,true);reject(Error('network'));await first;await new Promise(r=>setTimeout(r,0));assert.equal(nodes(h.render()).find(n=>n.type==='ProfileField').props.value,'Keep this name');assert.ok(nodes(h.render()).some(n=>n.props.role==='alert'));});
