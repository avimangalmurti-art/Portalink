import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../src/features/publishing/MobileCoverFiles.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const nodes=t=>!React.isValidElement(t)?[]:[t,...React.Children.toArray(t.props.children).flatMap(nodes)];
const text=t=>typeof t==='string'||typeof t==='number'?String(t):Array.isArray(t)?t.map(text).join(''):React.isValidElement(t)?text(t.props.children):'';
function harness(disabled=false,phase='idle'){
 let open=false;const calls=[];const media={items:[{id:'a',isCover:true,family:'image',capability:'native',displayTitle:'Artwork A',previewUrl:'a.jpg'},{id:'b',isCover:false,family:'image',capability:'native',displayTitle:'Artwork B',previewUrl:'b.jpg'}],select:files=>calls.push(files),setCover:id=>calls.push(id)};
 const exports={};vm.runInNewContext(compiled,{exports,require(name){if(name==='react')return{...React,useRef:()=>({current:{click:()=>calls.push('picker')}}),useState:()=>[open,v=>{open=v;}]};if(name==='./assetTypes')return{canBeCover:()=>true};return new Proxy({},{get:(_,key)=>key});}});
 const render=()=>exports.MobileCoverFiles({media,upload:{phase},disabled});return{render,calls,media};
}
test('default cover workspace keeps file management behind Reorder and passes the original draft through',()=>{
 const h=harness(),tree=h.render(),all=nodes(tree);
 assert.equal(all.find(n=>n.type==='MediaPicker'),undefined);
 assert.equal(all.find(n=>n.type==='CoverFilmstrip').props.focused,true);
 assert.equal(all.find(n=>n.type==='CoverFilmstrip').props.media,h.media);
 assert.match(text(tree),/2 files selected/);
 assert.doesNotMatch(text(tree),/Artwork A|Artwork B/);
 all.find(n=>n.type==='button'&&text(n)==='Reorder').props.onClick();
 const sheet=nodes(h.render()).find(n=>n.type==='MobileActionSheet');
 assert.equal(sheet.props.model.title,'Reorder');
 assert.equal(nodes(sheet).find(n=>n.type==='MediaPicker').props.media,h.media);
 sheet.props.onClose();assert.equal(nodes(h.render()).find(n=>n.type==='MobileActionSheet'),undefined);
});
test('Add accepts a batch and thumbnail selection updates the same draft',()=>{
 const h=harness(),all=nodes(h.render()),input=all.find(n=>n.type==='input');assert.equal(input.props.multiple,true);
 const files=[{name:'a.jpg'},{name:'b.jpg'}],target={files,value:'selection'};input.props.onChange({target});assert.equal(h.calls[0],files);assert.equal(target.value,'');
 all.find(n=>n.type==='button'&&text(n)==='Add').props.onClick();assert.equal(h.calls[1],'picker');
 all.find(n=>n.props['aria-label']==='Use Artwork B as cover').props.onClick();assert.equal(h.calls[2],'b');
});
test('busy or already uploaded files cannot be changed through cover or file controls',()=>{
 for(const h of[harness(true),harness(false,'uploaded')]){const all=nodes(h.render());assert.equal(all.find(n=>n.type==='CoverFilmstrip').props.disabled,true);for(const n of all.filter(n=>n.type==='button'||n.type==='input'))assert.equal(n.props.disabled,true);}
});
