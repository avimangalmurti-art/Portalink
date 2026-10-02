import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
function nodes(n){return React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];}
function harness(categories=[{id:'one',label:'Design'},{id:'two',label:'Music'}],create=async()=>({id:'new',label:'New'})){
 let cursor=0;const slots=[],chosen=[],created=[];
 const react={...React,useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=v];},useRef(v){const i=cursor++;return slots[i]??=( {current:v});}};
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/publishing/ProjectPortalChoice.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require(n){if(n==='react')return react;if(n.endsWith('useCategoryManagement'))return{MAX_CATEGORY_LABEL:40,validateCategoryLabel:(name,categories)=>!name.trim()?'Required':categories.some(c=>c.label.toLowerCase()===name.trim().toLowerCase())?'Duplicate':null};return new Proxy({},{get:(_,key)=>key});}});
 const render=()=>{cursor=0;return exports.ProjectPortalChoice({categories,preferredId:'two',onChoose:id=>chosen.push(id),onCreate:async name=>{created.push(name);return create(name);},onClose(){}});};
 const submit=async()=>{nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setTimeout(r,0));};
 const newMode=()=>nodes(render()).filter(n=>n.type==='input')[1].props.onChange();
 const name=value=>nodes(render()).find(n=>n.type==='ProfileField').props.onChange(value);
 return{render,submit,newMode,name,chosen,created};
}
test('existing portal choice keeps the preferred portal and allows a different destination',async()=>{const h=harness();assert.equal(nodes(h.render()).find(n=>n.type==='select').props.value,'two');nodes(h.render()).find(n=>n.type==='select').props.onChange({target:{value:'one'}});await h.submit();assert.deepEqual(h.chosen,['one']);assert.deepEqual(h.created,[]);});
test('new portal is explicitly created before the publisher receives its canonical ID',async()=>{const h=harness();h.newMode();h.name(' Photography ');await h.submit();assert.deepEqual(h.created,['Photography']);assert.deepEqual(h.chosen,['new']);});
test('accounts without portals start on creation without silently creating a Work portal',()=>{const h=harness([]);assert.ok(nodes(h.render()).some(n=>n.type==='ProfileField'));assert.equal(nodes(h.render()).find(n=>n.type==='input').props.disabled,true);assert.deepEqual(h.created,[]);});
test('duplicate names and failed creation keep choice open and do not start a project',async()=>{const h=harness(undefined,async()=>null);h.newMode();h.name('Design');await h.submit();assert.deepEqual(h.created,[]);h.name('New');await h.submit();assert.deepEqual(h.chosen,[]);assert.ok(nodes(h.render()).some(n=>n.props.role==='alert'));});
