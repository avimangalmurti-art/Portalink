import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import React from 'react';
import vm from 'node:vm';
import ts from 'typescript';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const nodes=tree=>React.isValidElement(tree)?[tree,...React.Children.toArray(tree.props.children).flatMap(nodes)]:[];
test('dock has one context slot and the five stable destinations, with no rail or separate compose',()=>{
 const exports={}; const calls=[];
 vm.runInNewContext(ts.transpileModule(read('../src/presentation/mobile/MobileNavigation.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require(name){
  if(name==='react')return {...React,useRef:()=>({current:null})};
  if(name==='react-router-dom')return {Link:'link',useLocation:()=>({pathname:'/studio'})};
  if(name.endsWith('/routes'))return{buildPath:kind=>kind==='home'?'/':`/${kind}`};
  if(name==='./MobileContextActions')return {MobileContextButton:'context-button',useMobileActions:()=>({opened:false})};
  if(name==='./useMobileDockScroll')return{useMobileDockScroll:(...args)=>calls.push(args)};
  return new Proxy({},{get:(_o,key)=>key});
 }});
 const tree=exports.MobileNavigation({onPortalink(){},onMessages(){},onProfile(){},isProfileActive:false});
 const dock=nodes(tree).find(n=>n.props.className==='mobile-navigation-dock');
 assert.deepEqual(React.Children.toArray(dock.props.children).map(n=>n.type==='context-button'?'Context':n.props.item.label),['Context','Messages','Studio','Home','Profile','Explore']);
 assert.equal(nodes(tree).some(n=>n.type==='aside'),false);assert.equal(calls[0][0],true);
 const source=read('../src/presentation/mobile/MobileNavigation.tsx');assert.doesNotMatch(source,/useNavigationSwipe|useNavigationOutsideTap|onCreateProject|mobile-navigation-opener|Videos|appearance/);
});
test('dock width reserves six touch targets and the shared mobile sidebar becomes one floating button',()=>{
 const css=read('../src/presentation/mobile/mobile.css');
 assert.match(css,/repeat\(6, minmax\(var\(--mobile-control-target\), 1fr\)\)/);
 assert.match(css,/min-width: calc\(6 \* var\(--mobile-control-target\)/);
 assert.doesNotMatch(css,/\.mobile-navigation-scroll|\.mobile-navigation\s*\{|\.mobile-shared-drawer/);
 assert.match(read('../src/components/profile/SharedProfileSidebar.tsx'),/isMobile \? <MobileContextButton floating \/> : renderSidebar\(\)/);
 assert.equal(fs.existsSync(new URL('../src/presentation/mobile/MobileSharedProfileDrawer.tsx',import.meta.url)),false);
});
