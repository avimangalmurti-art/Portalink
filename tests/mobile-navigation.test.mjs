import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import React from 'react';
import vm from 'node:vm';
import ts from 'typescript';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const nodes=tree=>React.isValidElement(tree)?[tree,...React.Children.toArray(tree.props.children).flatMap(nodes)]:[];
test('dock orders Explore, Messages, Studio and Profile, with no rail or separate compose',()=>{
 const exports={}; const calls=[];
 vm.runInNewContext(ts.transpileModule(read('../src/presentation/mobile/MobileNavigation.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require(name){
  if(name==='react')return {...React,useRef:()=>({current:null})};
  if(name==='react-router-dom')return {Link:'link',useLocation:()=>({pathname:'/studio'})};
  if(name.endsWith('/routes'))return{buildPath:kind=>kind==='home'?'/':`/${kind}`};
  if(name==='./MobileContextActions')return {MobileContextButton:'context-button',useMobileActions:()=>({opened:false})};
  if(name==='./useMobileDockScroll')return{useMobileDockScroll:(...args)=>calls.push(args)};
  return new Proxy({},{get:(_o,key)=>key});
 }});
 const destinations=[];
 const tree=exports.MobileNavigation({onMessages(...args){destinations.push(['messages',args]);},onProfile(...args){destinations.push(['profile',args]);},isProfileActive:false});
 const dock=nodes(tree).find(n=>n.props.className==='mobile-navigation-dock');
 assert.deepEqual(React.Children.toArray(dock.props.children).map(n=>n.type==='context-button'?'Actions':n.props.item.label),['Explore','Messages','Studio','Profile']);
 assert.equal(nodes(tree).some(n=>n.type==='aside'),false);assert.equal(calls[0][0],true);
 for(const label of ['Messages','Profile']){
  const destination=nodes(tree).find(n=>n.props.item?.label===label);
  destination.type(destination.props).props.onClick({type:'click',target:{}});
 }
 assert.deepEqual(destinations,[['messages',[]],['profile',[]]],'Navigation taps must not become recipient/profile arguments');
 const linkedTree=exports.MobileNavigation({onMessages(){},onProfile(){},profileHref:'/p/me',isProfileActive:true});
 const linkedProfile=nodes(linkedTree).find(n=>n.props.item?.label==='Profile');
 assert.equal(linkedProfile.type(linkedProfile.props).props.state.profileFromDock,true,'Dock profile navigation identifies its root destination');
 const linkedHome=nodes(linkedTree).find(n=>n.props.item?.label==='Explore');
 assert.equal(linkedHome.type(linkedHome.props).props.state,undefined);
 const source=read('../src/presentation/mobile/MobileNavigation.tsx');assert.doesNotMatch(source,/useNavigationSwipe|useNavigationOutsideTap|onCreateProject|mobile-navigation-opener|Videos|appearance/);
});
test('dock width reserves four touch targets and public mobile navigation stays separate',()=>{
 const css=read('../src/presentation/mobile/mobile.css');
 assert.match(css,/repeat\(4, minmax\(var\(--mobile-control-target\), 1fr\)\)/);
 assert.match(css,/min-width: calc\(4 \* var\(--mobile-control-target\)/);
 assert.doesNotMatch(css,/\.mobile-navigation-scroll|\.mobile-navigation\s*\{|\.mobile-shared-drawer/);
 assert.match(read('../src/components/profile/SharedProfileSidebar.tsx'),/isMobile \? <PublicProfileDrawer/);
 assert.equal(fs.existsSync(new URL('../src/presentation/mobile/MobileSharedProfileDrawer.tsx',import.meta.url)),false);
});

test('installed dock is bounded to the visible viewport and keeps its safe-area gap',()=>{
 const css=read('../src/presentation/mobile/mobile.css');
 const layer=css.match(/\.mobile-navigation-layer:where\(html\[data-standalone\] \*\)\s*\{([^}]+)\}/)[1];
 const dock=css.match(/\.mobile-floating-navigation:where\(html\[data-standalone\] \*\)\s*\{([^}]+)\}/)[1];
 assert.match(layer,/height: min\(100dvh, var\(--mobile-dock-viewport-height, 100dvh\)\)/);
 assert.doesNotMatch(layer,/100vh/);
 assert.match(layer,/top: 0/);
 assert.match(dock,/position: absolute/);
 assert.match(dock,/bottom: max\(8px, var\(--safe-area-bottom\)\)/);
 assert.doesNotMatch(read('../src/visitor/mobile/public-mobile.css'),/--mobile-dock-viewport-height/);
});
