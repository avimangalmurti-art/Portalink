import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';

function fixture(download, options={}) {
 const slots=[];let cursor=0, timer, saves=0;const filenames=[];
 const hooks={...React,useEffect:()=>{},useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});}};
 const sheet=sourceModule('src/features/references/ExportSheet.tsx',{
  react:hooks,'../../presentation/motion/useSheetMotion':{useSheetMotion:()=>({closing:false,close:()=>{}})},
  '../../components/ui/ModalPortal':{ModalPortal:'portal'},'../../hooks/useModalFocus':{useModalFocus:()=>{}},
  './useReferences':{useReferences:()=>({exportBibliography:options.bibliography??(async()=>({bibtex:'bib',plain:'plain'}))})},
  '../citations/citations.css':{},'./references.css':{},'../../components/ui/Button':{Button:'button'},'./downloadPortfolio':{downloadPortfolio:download},
 },{Error,AbortController,Blob,document:{createElement:()=>({click(){saves++;filenames.push(this.download);}})},navigator:{clipboard:{writeText:options.copy??(async()=>{})}},URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:()=>{}},setTimeout:()=>0,
 window:{setTimeout:(callback,ms)=>{assert.equal(ms,30000);timer=callback;return 1;},clearTimeout:()=>{timer=undefined;}}});
 const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];
 const render=()=>{cursor=0;return nodes(sheet.ExportSheet({profileId:'synthetic',initial:options.initial??'portfolio',onClose:()=>{}}));};
 return {render,button:(name)=>render().find(n=>n.type==='button'&&n.props.children===name),timeout:()=>timer(),saves:()=>saves,filenames};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('actual export handlers retain retry action, prevent double activation, and clear the error after success',async()=>{
 let reject, calls=0;
 const ui=fixture(async()=>{calls++;if(calls===1)return new Promise((_resolve,r)=>reject=r);return new Blob(['%PDF']);});
 const start=ui.button('Download Catalogue PDF');start.props.onClick();start.props.onClick();
 assert.equal(calls,1);assert.equal(ui.button('Preparing PDF...').props.isLoading,true);
 reject(new Error('Offline'));await settle();
 assert.ok(ui.render().some(n=>n.props.role==='alert'&&n.props.children==='Offline'));
 ui.button('Retry download').props.onClick();await settle();
 assert.equal(calls,2);assert.equal(ui.saves(),1);assert.equal(ui.button('Retry download'),undefined);
 assert.ok(ui.render().some(n=>n.props.role==='status'&&/download requested/.test(n.props.children)));
});

test('actual export timeout releases the busy state and offers another attempt without saving partial output',async()=>{
 const ui=fixture((_id,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))));
 ui.button('Download Catalogue PDF').props.onClick();ui.timeout();await settle();
 assert.equal(ui.saves(),0);assert.ok(ui.button('Retry download'));
 assert.ok(ui.render().some(n=>n.props.role==='alert'&&/took too long/.test(n.props.children)));
 assert.equal(ui.button('Download Catalogue PDF').props.isLoading,false);
});

test('bibliography retry retains the chosen format and copy has its own retry label',async()=>{
 for(const format of ['BibTeX','Plain text','Copy']){
  let calls=0,copies=0;
  const ui=fixture(()=>assert.fail('No PDF fetch for bibliography'),{initial:'bibliography',bibliography:async()=>{calls++;if(calls===1)throw new Error('Offline');return{bibtex:'bib',plain:'plain'};},copy:async()=>copies++});
  ui.button(format).props.onClick();await settle();
  ui.button(format==='Copy'?'Try copying again':'Retry download').props.onClick();await settle();
  assert.equal(calls,2);
  if(format==='Copy'){assert.equal(copies,1);assert.equal(ui.saves(),0);}else{assert.deepEqual(ui.filenames,[format==='BibTeX'?'portalink-bibliography.bib':'portalink-bibliography.txt']);}
 }
});
