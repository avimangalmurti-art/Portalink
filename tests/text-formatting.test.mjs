import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
function load(path){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:n=>n==='react'?React:{}});return exports;}
const {formatSelection}=load('../src/components/text/textFormatting.ts');
const {FormattedText}=load('../src/components/text/FormattedText.tsx');
test('format selected text without changing surrounding words and retain selection',()=>{const result=formatSelection('My creative work',3,11,'bold');assert.equal(result.value,'My **creative** work');assert.equal(result.value.slice(result.start,result.end),'creative');});
test('format multiline lists, change headings and restore body or indentation',()=>{assert.equal(formatSelection('One\nTwo',0,7,'number').value,'1. One\n2. Two');assert.equal(formatSelection('## Title',0,8,'body').value,'Title');assert.equal(formatSelection('  Work',0,6,'outdent').value,'Work');assert.equal(formatSelection('\nWork',0,0,'title').value,'# \nWork');});
test('render stored styles, lists, colours and escape user HTML',()=>{const html=renderToStaticMarkup(React.createElement(FormattedText,{text:'# Bio\n**Strong** *Emphasis* ++Underlined++ ~~Old~~\n- First\n- Second\n{#0a84ff|Blue}\n<script>alert(1)</script>'}));for(const fragment of ['<h2>Bio</h2>','<strong>Strong</strong>','<em>Emphasis</em>','<u>Underlined</u>','<s>Old</s>','<ul','<li>Second</li>','color:#0a84ff','&lt;script&gt;'])assert.ok(html.includes(fragment),fragment);assert.ok(!html.includes('<script>'));});
