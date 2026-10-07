import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import test from 'node:test';import vm from 'node:vm';import React from 'react';import ts from 'typescript';
test('closing unpublished work discards instead of saving, and cleanup failure keeps it open',async()=>{
 for(const success of [true,false]){
 const calls=[],exports={};const flow={step:'metadata',state:'editing',draft:{id:'draft'},metadata:{title:'Project',summary:'Description'},fieldErrors:{},media:{items:[{}],state:'ready'},upload:{},publish:{status:'idle'},discard:async()=>{calls.push('discard');return success;}};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/publishing/PublishProjectDialog.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require(name){if(name==='react')return{...React,useState:()=>[false,()=>{}],useRef:()=>({current:null}),useEffect:()=>{}};if(name==='./usePublishProject')return{usePublishProject:(...args)=>{assert.equal(args[5],false);assert.equal(args[7].persist,false);return flow;}};if(name.endsWith('/usePresentation'))return{usePresentation:()=> 'mobile'};return new Proxy({},{get:(_,key)=>key});}});
 const tree=exports.PublishProjectDialog({isOpen:true,profileId:'owner',categoryId:'portal',categoryLabel:'Work',onClose:()=>calls.push('close'),onPublished:()=>{}});await tree.props.onClose();assert.deepEqual(calls,success?['discard','close']:['discard']);
 }
});

