import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
const compiled=ts.transpileModule(readFileSync(new URL('../src/features/publishing/MobileCoverFiles.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const assetTypes={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/publishing/assetTypes.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:assetTypes});
const nodes=t=>!React.isValidElement(t)?[]:[t,...React.Children.toArray(t.props.children).flatMap(nodes)];
const text=t=>typeof t==='string'||typeof t==='number'?String(t):Array.isArray(t)?t.map(text).join(''):React.isValidElement(t)?text(t.props.children):'';
function harness(disabled=false,phase='idle',{presentation='mobile',count=2,onboarding=false,items,isFull=false}={}){
 let open=false;const calls=[];const media={items:[{id:'a',isCover:true,family:'image',capability:'native',displayTitle:'Artwork A',previewUrl:'a.jpg'},{id:'b',isCover:false,family:'image',capability:'native',displayTitle:'Artwork B',previewUrl:'b.jpg'}],select:files=>calls.push(files),setCover:id=>calls.push(id)};
 if(count!==2)media.items=Array.from({length:count},(_,index)=>({id:`file-${index+1}`,isCover:index===0,family:'image',capability:'native',displayTitle:`Artwork ${index+1}`,previewUrl:`image-${index+1}.png`}));
 if(items)media.items=items;media.isFull=isFull;
 const exports={};vm.runInNewContext(compiled,{exports,require(name){if(name==='react')return{...React,useRef:()=>({current:{click:()=>calls.push('picker')}}),useState:()=>[open,v=>{open=v;}]};if(name.endsWith('/usePresentation'))return{usePresentation:()=>presentation};if(name==='./assetTypes')return assetTypes;return new Proxy({},{get:(_,key)=>key});}});
 const render=()=>exports.MobileCoverFiles({media,upload:{phase},disabled,onboarding});return{render,calls,media};
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
 assert.equal(sheet.props.layout,'files');
 assert.equal(nodes(sheet).find(n=>n.type==='MediaPicker').props.media,h.media);
 assert.equal(nodes(sheet).find(n=>n.type==='MediaPicker').props.mobileFileManager,true);
 assert.equal(nodes(sheet).find(n=>n.type==='MediaPicker').props.reorderGrid,true);
 sheet.props.onClose();assert.equal(nodes(h.render()).find(n=>n.type==='MobileActionSheet'),undefined);
});

test('onboarding empty chooser accepts a file batch on both platforms without changing the draft contract',()=>{
 for(const presentation of ['mobile','web']){
  const h=harness(false,'idle',{presentation,count:0,onboarding:true}),all=nodes(h.render());
  assert.equal(all.find(n=>n.props['aria-label']==='Selected files'),undefined);
  assert.ok(all.find(n=>n.props.className==='onboarding-files-art'));
  const chooser=all.find(n=>n.type==='button'&&text(n)==='Choose files');assert.ok(chooser);chooser.props.onClick();
  assert.deepEqual(h.calls,['picker']);
  const files=[{name:'first.png'},{name:'notes.pdf'}],target={files,value:'selection'};
  const input=all.find(n=>n.type==='input');assert.equal(input.props.multiple,true);assert.equal(input.props['aria-label'],'Add project files');
  input.props.onChange({target});assert.equal(h.calls.at(-1),files);assert.equal(target.value,'');
 }
});

test('onboarding keeps every cover choice and reorders the original files on both platforms',()=>{
 for(const presentation of ['mobile','web']){
  const h=harness(false,'idle',{presentation,count:15,onboarding:true}),all=nodes(h.render());
  const intro=all.find(n=>n.props.className==='onboarding-files-brand');
  if(presentation==='mobile')assert.equal(intro,undefined);
  else assert.match(text(intro),/Choose your cover\./);
  const choices=all.filter(n=>n.type==='button'&&n.props['aria-label']?.startsWith('Use Artwork'));
  assert.equal(choices.length,15);choices[14].props.onClick();assert.equal(h.calls.at(-1),'file-15');
  assert.equal(all.find(n=>n.type==='CoverFilmstrip').props.media,h.media);
  all.find(n=>n.type==='button'&&text(n)==='Reorder').props.onClick();
  const sheet=nodes(h.render()).find(n=>n.type==='MobileActionSheet'),picker=nodes(sheet).find(n=>n.type==='MediaPicker');
  assert.equal(picker.props.media,h.media);assert.equal(picker.props.expanded,true);
  assert.equal(sheet.props.onboardingFiles,true);assert.equal(sheet.props.layout,'files');
  assert.equal(picker.props.onboardingFiles,true);
  assert.equal(picker.props.mobileFileManager,presentation==='mobile'?true:undefined);
  assert.equal(picker.props.reorderGrid,presentation==='mobile'?true:undefined);
  sheet.props.onClose();assert.equal(nodes(h.render()).some(n=>n.type==='MobileActionSheet'),false);
 }
});

test('onboarding file actions opt into the shared compact capsule scale while legacy controls retain their markers',()=>{
 for(const presentation of ['mobile','web']){
  for(const onboarding of [false,true]){
   const h=harness(false,'idle',{presentation,onboarding}),all=nodes(h.render());
   for(const label of ['Reorder','Add']){
    const button=all.find(node=>node.type==='button'&&text(node)===label);
    assert.equal(button.props['data-ui-control'],onboarding?'button':undefined);
    assert.equal(button.props['data-control-size'],onboarding?'lg':undefined);
   }
  }
 }
});

test('onboarding preserves non-cover PDF files and actual cover eligibility without losing selection',()=>{
 const items=[{id:'image',isCover:true,family:'image',capability:'native',displayTitle:'Image',previewUrl:'image.png'},
  {id:'pdf',isCover:false,family:'document',capability:'native',displayTitle:'Notes.pdf',previewUrl:'notes.pdf'},
  {id:'audio',isCover:false,family:'audio',capability:'native',displayTitle:'Audio.mp3',previewUrl:'audio.mp3'}];
 for(const presentation of ['mobile','web']){
  const h=harness(false,'idle',{presentation,onboarding:true,items}),all=nodes(h.render());
  const pdf=all.find(n=>n.props['aria-label']==='Use Notes.pdf as cover');assert.equal(pdf.props.disabled,false);
  assert.equal(all.find(n=>n.props['aria-label']==='Use Audio.mp3 as cover').props.disabled,true);
  pdf.props.onClick();assert.deepEqual(h.calls,['pdf']);assert.equal(h.media.items,items);
  assert.equal(all.find(n=>n.type==='CoverFilmstrip').props.media.items,items);
 }
});

test('onboarding non-cover files can add a cover and stale picker completion respects lock and capacity',()=>{
 for(const presentation of ['mobile','web']){
  const items=[{id:'pdf',isCover:false,family:'document',capability:'native',displayTitle:'Notes.pdf',previewUrl:'notes.pdf'}];
  const h=harness(false,'idle',{presentation,onboarding:true,items}),all=nodes(h.render());
  all.find(n=>n.type==='button'&&text(n)==='Add a cover file').props.onClick();assert.deepEqual(h.calls,['picker']);
  for(const state of [{disabled:true,phase:'idle',isFull:false},{disabled:false,phase:'uploaded',isFull:false},{disabled:false,phase:'idle',isFull:true}]){
   const locked=harness(state.disabled,state.phase,{presentation,onboarding:true,count:0,isFull:state.isFull}),tree=nodes(locked.render());
   assert.equal(tree.find(n=>n.type==='button'&&text(n)==='Choose files').props.disabled,true);
   const target={files:[{name:'late.png'}],value:'selection'};tree.find(n=>n.type==='input').props.onChange({target});
   assert.deepEqual(locked.calls,[]);assert.equal(target.value,'');
  }
 }
});

test('all fifteen MOBILE files remain selectable as cover while WEB keeps its existing summary',()=>{
 for(const presentation of ['mobile','web']){
  const h=harness(false,'idle',{presentation,count:15});
  const all=nodes(h.render()),thumbnails=all.filter(n=>n.type==='button'&&n.props['aria-label']?.startsWith('Use Artwork'));
  assert.equal(thumbnails.length,presentation==='mobile'?15:4);
  assert.equal(all.find(node=>node.type==='CoverFilmstrip').props.cropInstructions,presentation==='mobile'?'Drag to reposition. Use the slider to zoom.':undefined);
  if(presentation==='mobile'){thumbnails[14].props.onClick();assert.equal(h.calls.at(-1),'file-15');}
  all.find(n=>n.type==='button'&&text(n)==='Reorder').props.onClick();
  const sheet=nodes(h.render()).find(n=>n.type==='MobileActionSheet'),picker=nodes(sheet).find(n=>n.type==='MediaPicker');
  assert.equal(sheet.props.layout,presentation==='mobile'?'files':undefined);
  assert.equal(picker.props.mobileFileManager,presentation==='mobile'?true:undefined);
  assert.equal(picker.props.media,h.media);assert.equal(h.media.items.length,15);
 }
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

test('empty MOBILE Files has an explicit chooser before cover authoring and WEB keeps its original empty control',()=>{
 const mobile=harness(false,'idle',{count:0}),tree=mobile.render(),all=nodes(tree);
 const chooser=all.find(node=>node.props['aria-label']==='Choose project files');
 assert.ok(chooser);assert.match(text(chooser),/Choose files/);assert.match(text(chooser),/Choose a cover next/);
 assert.equal(all.find(node=>node.props['aria-label']==='Selected files'),undefined);
 chooser.props.onClick();assert.deepEqual(mobile.calls,['picker']);
 const target={files:[{name:'first.png'},{name:'second.pdf'}],value:'picked'};
 all.find(node=>node.type==='input').props.onChange({target});assert.equal(mobile.calls.at(-1),target.files);assert.equal(target.value,'');
 const web=nodes(harness(false,'idle',{count:0,presentation:'web'}).render());
 assert.ok(web.find(node=>node.props['aria-label']==='Choose an image'));
 assert.ok(web.find(node=>node.props['aria-label']==='Selected files'));
 assert.equal(web.some(node=>node.props.className==='mobile-cover-empty-copy'),false);
});

test('Word sources request a separate PDF or image cover while normal Add remains unrestricted on both platforms',()=>{
 for(const presentation of ['mobile','web']){
  const word={id:'word',isCover:true,family:'document',capability:'converted',displayTitle:'Work.docx',previewUrl:null};
  const h=harness(false,'idle',{presentation,onboarding:true,items:[word]}),all=nodes(h.render());
  assert.equal(all.find(n=>n.type==='CoverFilmstrip'),undefined);
  const intro=all.find(n=>n.props.className==='onboarding-files-brand');
  if(presentation==='mobile')assert.equal(intro,undefined);
  else assert.match(text(intro),/Add a PDF or image for your cover\./);
  const wordChoice=all.find(n=>n.props['aria-label']==='Use Work.docx as cover');assert.equal(wordChoice.props.disabled,true);assert.equal(wordChoice.props['aria-pressed'],false);
  const general=all.find(n=>n.props['aria-label']==='Add project files');
  const cover=all.find(n=>n.props['aria-label']==='Add PDF or image cover');
  assert.equal(general.props.accept,undefined);assert.equal(general.props.multiple,true);
  assert.equal(cover.props.accept,'.pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.svg');assert.equal(cover.props.multiple,undefined);
  all.find(n=>n.type==='button'&&text(n)==='Add PDF or image cover').props.onClick();assert.deepEqual(h.calls,['picker']);
  const files=[{name:'cover.pdf'}],target={files,value:'selected'};cover.props.onChange({target});
  assert.equal(h.calls.at(-1),files);assert.equal(target.value,'');assert.equal(h.media.items[0],word);
  const pdf={id:'pdf',isCover:true,family:'document',capability:'native',displayTitle:'Cover.pdf',previewUrl:'cover.pdf'};
  h.media.items=[{...word,isCover:false},pdf];const withCover=nodes(h.render());
  assert.equal(withCover.find(n=>n.props['aria-label']==='Add PDF or image cover'),undefined);
  assert.equal(withCover.find(n=>n.type==='CoverFilmstrip').props.media,h.media);
 }
});

test('separate document-cover picker completions respect upload locks and capacity',()=>{
 for(const presentation of ['mobile','web'])for(const state of [{disabled:true,phase:'idle',isFull:false},{disabled:false,phase:'uploaded',isFull:false},{disabled:false,phase:'idle',isFull:true}]){
  const items=[{id:'word',isCover:false,family:'document',capability:'converted',displayTitle:'Work.docx'}];
  const h=harness(state.disabled,state.phase,{presentation,onboarding:true,items,isFull:state.isFull}),all=nodes(h.render());
  const cover=all.find(n=>n.props['aria-label']==='Add PDF or image cover');assert.equal(cover.props.disabled,true);
  const target={files:[{name:'late.pdf'}],value:'selected'};cover.props.onChange({target});assert.deepEqual(h.calls,[]);assert.equal(target.value,'');
 }
});
