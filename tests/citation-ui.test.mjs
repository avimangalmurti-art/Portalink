import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const realRequire=createRequire(import.meta.url);
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:path=>path.includes('capabilities')?{likesCapability:false}:path.includes('InterfaceIcon')?{InterfaceIcon:()=>React.createElement('svg')}:path.endsWith('types/engagement')?load('src/types/engagement.ts'):realRequire(path)});return exports;}
const {EngagementBar}=load('src/features/engagement/EngagementBar.tsx');
const engagement={isEngaged:()=>false,isPending:()=>false,count:kind=>kind==='like'?99991:2,toggle:()=>{},resolveError:null,failure:null};
test('Like and its count are absent from every shared engagement presentation',()=>{
 for(const variant of ['inline','panel','rail','viewer']){
  const html=renderToStaticMarkup(React.createElement(EngagementBar,{engagement,projectTitle:'Existing work',showCounts:true,variant}));
  assert.doesNotMatch(html,/like|99991/i);
  assert.match(html,/save|bookmark/i);
 }
});
test('document citation preview is a lazy single-page renderer with labeled cover failure',()=>{
 const entry=readFileSync('src/citation/index.tsx','utf8'),preview=readFileSync('src/features/citations/CitationPagePreview.tsx','utf8');
 assert.match(entry,/CitationPagePreview=lazy/);
 assert.match(preview,/pageNumber=\{item.number\}/);
 assert.match(preview,/onRenderFailure/);
 assert.match(preview,/coverSourceUrl/);
 assert.doesNotMatch(preview,/Editor|\.map\(/);
});
