import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
function load(path){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:n=>n==='react'?React:n.endsWith('/textFormatting')?load('../src/components/text/textFormatting.ts'):{}});return exports;}
const {formatSelection}=load('../src/components/text/textFormatting.ts');
const {FormattedText}=load('../src/components/text/FormattedText.tsx');
test('format selected text without changing surrounding words and retain selection',()=>{const result=formatSelection('My creative work',3,11,'bold');assert.equal(result.value,'My **creative** work');assert.equal(result.value.slice(result.start,result.end),'creative');});
test('format multiline lists, change headings and restore body or indentation',()=>{assert.equal(formatSelection('One\nTwo',0,7,'number').value,'1. One\n2. Two');assert.equal(formatSelection('## Title',0,8,'body').value,'Title');assert.equal(formatSelection('  Work',0,6,'outdent').value,'Work');assert.equal(formatSelection('\nWork',0,0,'title').value,'# \nWork');});
test('render stored styles, lists, colours and escape user HTML',()=>{const html=renderToStaticMarkup(React.createElement(FormattedText,{text:'# Bio\n**Strong** *Emphasis* ++Underlined++ ~~Old~~\n- First\n- Second\n{#0a84ff|Blue}\n<script>alert(1)</script>'}));for(const fragment of ['<h2>Bio</h2>','<strong>Strong</strong>','<em>Emphasis</em>','<u>Underlined</u>','<s>Old</s>','<ul','<li>Second</li>','color:#0a84ff','&lt;script&gt;'])assert.ok(html.includes(fragment),fragment);assert.ok(!html.includes('<script>'));});

test('header format dropdown applies a selection, restores focus, and respects disabled and length limits', () => {
 const exports = {}, writes = [], selection = [];
 let focused = 0;
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/text/TextFormattingToolbar.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText, {
  exports, requestAnimationFrame: fn=>fn(), require: name=>name==='react'?{...React,useState: initial=>[initial,()=>{}]}:name.endsWith('/textFormatting')?{formatSelection}:new Proxy({}, {get:()=>()=>null}),
 });
 const inputRef={current:{selectionStart:3,selectionEnd:11,focus(){focused++;},setSelectionRange(...args){selection.push(args);}}};
 const nodes=node=>React.isValidElement(node)?[node,...React.Children.toArray(node.props.children).flatMap(nodes)]:[];
 const render=extra=>nodes(exports.TextFormattingToolbar({variant:'dropdown',inputRef,value:'My creative work',onChange:value=>writes.push(value),...extra}));
 const select=render().find(n=>n.type==='select');
 assert.equal(select.props['aria-label'],'Format text');
 select.props.onChange({target:{value:'bold'}});
 assert.deepEqual(writes,['My **creative** work']); assert.equal(focused,1); assert.deepEqual(selection,[[5,13]]);
 render({disabled:true}).find(n=>n.type==='select').props.onChange({target:{value:'italic'}});
 render({maxLength:16}).find(n=>n.type==='select').props.onChange({target:{value:'italic'}});
 assert.equal(writes.length,1);
 assert.ok(render().some(n=>n.type==='option'&&n.props.value==='bullet'));
 assert.ok(render().some(n=>n.type==='option'&&n.props.value==='#0a84ff'));
});

test('nested emphasis and inline colour from the live project render and strip consistently',()=>{
 const raw='***{#34c759|Some of these posters are the faces of my dear friends. }***';
 const {plainFormattedText}=load('../src/components/text/textFormatting.ts');
 assert.equal(plainFormattedText(raw),'Some of these posters are the faces of my dear friends. ');
 const html=renderToStaticMarkup(React.createElement(FormattedText,{text:raw}));
 assert.match(html,/<strong><em><span style="color:#34c759">Some of these posters/);
 assert.doesNotMatch(html,/\*\*\*|\{#34c759\|/);
});

test('MOBILE omits every formatting control while WEB retains its precise controls', () => {
 const exports = {}; let presentation = 'mobile';
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/text/TextFormattingToolbar.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText, {
  exports, require: name => name === 'react' ? {...React,useState: value=>[value,()=>{}]} : name.endsWith('/usePresentation') ? {usePresentation:()=>presentation} : name.endsWith('/textFormatting') ? {formatSelection} : new Proxy({}, {get:()=>()=>null}),
 });
 const props = {inputRef:{current:null},value:'**Existing**',onChange(){}};
 for (const variant of ['panel','workspace','dropdown']) assert.equal(exports.TextFormattingToolbar({...props,variant}),null);
 presentation = 'web'; assert.ok(exports.TextFormattingToolbar({...props,variant:'dropdown'}));
});
