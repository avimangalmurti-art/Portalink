import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
test('active tab centres after layout at 375 and 430, without vertical scrolling',()=>{
 for(const width of [375,430]){
  const selected={offsetLeft:460,offsetWidth:82},rail={clientWidth:width-120,style:{setProperty(){}},querySelector:()=>selected};
  let effects=[],active=true;
  const react={...React,useRef:()=>({current:rail}),useLayoutEffect:f=>effects.push(f)};
  const {MobilePillHeader}=sourceModule('src/presentation/mobile/MobilePillHeader.tsx',{
   react,'react-dom':{createPortal:n=>n},'./MobileBackNavigation':{useMobileScreenActive:()=>active},
   'lucide-react':{},'../../components/ui/InterfaceIcon':{InterfaceIcon:'icon'},'./mobile-pill-header.css':{}
  });
  const props={label:'Studio',tabs:[{id:'published',label:'Published'}],active:'published',onChange(){}};
  const tree=MobilePillHeader(props);effects.forEach(f=>f());
  assert.equal(rail.scrollLeft,selected.offsetLeft+selected.offsetWidth/2-rail.clientWidth/2);
  assert.equal(tree.props['data-mobile-pill-header'],'Studio');
  active=false;assert.equal(MobilePillHeader(props),null);
 }
});
test('five Studio empty states retain exact requested copy and a single optional pill',()=>{
 const {StudioEmptyState}=sourceModule('src/features/studio/StudioEmptyState.tsx',{react:React});
 const copy={drafts:'Start something and it will wait here.',published:'Nothing published yet.',bookmarks:'Use Save on any page or project.',references:'References you add appear here.',cited:'When someone builds on your work, it appears here.'};
 for(const [kind,text] of Object.entries(copy)){
  const tree=StudioEmptyState({kind});const children=React.Children.toArray(tree.props.children);
  assert.ok(children.some(c=>c.props.children===text));assert.equal(children.some(c=>c.type==='button'),false);
 }
 const tree=StudioEmptyState({kind:'drafts',action:{label:'Add work',onClick(){}}});
 assert.equal(React.Children.toArray(tree.props.children).filter(c=>c.type==='button').length,1);
});
