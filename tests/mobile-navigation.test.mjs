import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import React from 'react';
import vm from 'node:vm';
import ts from 'typescript';
import postcss from 'postcss';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const nodes=tree=>React.isValidElement(tree)?[tree,...React.Children.toArray(tree.props.children).flatMap(nodes)]:[];
function dockHarness(pathname='/studio') {
 const exports={}; const calls=[], destinations=[];
 vm.runInNewContext(ts.transpileModule(read('../src/presentation/mobile/MobileNavigation.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require(name){
  if(name==='react')return {...React,useRef:()=>({current:null})};
  if(name==='react-router-dom')return {Link:'link',useLocation:()=>({pathname})};
  if(name.endsWith('/routes'))return{buildPath:kind=>kind==='home'?'/':kind==='portalSearch'?'/portal-search':`/${kind}`};
  if(name==='./MobileContextActions')return {MobileContextButton:'context-button',useMobileActions:()=>({opened:false})};
  if(name==='./useMobileDockScroll')return{useMobileDockScroll:(...args)=>calls.push(args)};
  if(name.endsWith('/PortalRingIcon'))return{PortalRingIcon:'portal-ring-icon'};
  return new Proxy({},{get:(_o,key)=>key});
 }});
 return { calls, destinations, render: (props={})=>exports.MobileNavigation({onMessages(...args){destinations.push(['messages',args]);},onProfile(...args){destinations.push(['profile',args]);},isProfileActive:false,...props}) };
}

test('dock orders Explore, Messages, Portal search, Studio and Profile, with no rail or separate compose',()=>{
 const fixture=dockHarness();
 const tree=fixture.render();
 const dock=nodes(tree).find(n=>n.props.className==='mobile-navigation-dock');
 const items=React.Children.toArray(dock.props.children);
 assert.deepEqual(items.map(n=>n.type==='context-button'?'Actions':n.props.item.label),['Explore','Messages','Portal search','Studio','Profile']);
 const center=items[2].type(items[2].props);
 assert.equal(center.type,'link');assert.equal(center.props.to,'/portal-search');
 assert.equal(center.props['aria-label'],'Portal search');assert.equal(center.props.title,'Portal search');
 assert.equal(center.props.children.props.icon,'portal-ring-icon');
 assert.equal(center.props.children.props.weight,'medium');
 assert.equal(center.props.onClick,undefined);assert.equal(center.props.state,undefined,'Portal search retains ordinary Router history and modified-click behavior');
 assert.equal(nodes(tree).some(n=>n.type==='aside'),false);assert.equal(fixture.calls[0][0],true);
 for(const label of ['Messages','Profile']){
  const destination=nodes(tree).find(n=>n.props.item?.label===label);
  destination.type(destination.props).props.onClick({type:'click',target:{}});
 }
 assert.deepEqual(fixture.destinations,[['messages',[true]],['profile',[]]],'Navigation taps must not become recipient or profile arguments');
 const linkedTree=fixture.render({profileHref:'/p/me',isProfileActive:true});
 const linkedProfile=nodes(linkedTree).find(n=>n.props.item?.label==='Profile');
 assert.equal(linkedProfile.type(linkedProfile.props).props.state.profileFromDock,true,'Dock profile navigation identifies its root destination');
 assert.equal(linkedProfile.type(linkedProfile.props).props.state.dockEntry,'profile');
 const linkedStudio=nodes(linkedTree).find(n=>n.props.item?.label==='Studio');
 assert.equal(linkedStudio.type(linkedStudio.props).props.state.dockEntry,'studio');
 const linkedHome=nodes(linkedTree).find(n=>n.props.item?.label==='Explore');
 assert.equal(linkedHome.type(linkedHome.props).props.state,undefined);
 const source=read('../src/presentation/mobile/MobileNavigation.tsx');assert.doesNotMatch(source,/useNavigationSwipe|useNavigationOutsideTap|onCreateProject|mobile-navigation-opener|Videos|appearance/);
});
test('Portal search owns the center selection without also selecting Explore and preserves other destinations',()=>{
 for(const [pathname,selected] of [['/','Explore'],['/portal-search','Portal search'],['/messages','Messages'],['/studio','Studio'],['/saved','Studio'],['/p/me','Profile'],['/p/other',null]]){
  const fixture=dockHarness(pathname);
  const tree=fixture.render({profileHref:'/p/me',isProfileActive:selected==='Profile'});
  const items=nodes(tree).filter(node=>node.props.item).map(node=>node.type(node.props));
  assert.equal(items.length,5,'Portal search occupies the existing center destination');
  assert.deepEqual(items.filter(node=>node.props['aria-current']==='page').map(node=>node.props['aria-label']),selected?[selected]:[],pathname);
  assert.equal(items.find(node=>node.props['aria-label']==='Explore').props.to,'/');
  assert.equal(items.find(node=>node.props['aria-label']==='Portal search').props.to,'/portal-search');
  assert.equal(items.find(node=>node.props['aria-label']==='Studio').props.to,'/studio');
  assert.equal(items.find(node=>node.props['aria-label']==='Profile').props.to,'/p/me');
  assert.equal(fixture.calls.at(-1)[1],pathname,'Every destination retains the existing route-scoped dock scrolling owner');
 }
});

test('dock width reserves five columns and public mobile navigation stays separate',()=>{
 const css=read('../src/presentation/mobile/mobile.css');
 assert.match(css,/repeat\(5, minmax\(var\(--mobile-control-target\), 1fr\)\)/);
 assert.match(css,/min-width: calc\(5 \* var\(--mobile-control-target\) \+ 4 \* var\(--mobile-control-gap\) \+ 2 \* var\(--mobile-control-inset\)\)/);
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

test('only installed focused platform readers use the settled visible viewport bound',()=>{
 const css=postcss.parse(read('../src/presentation/mobile/mobile.css'));
 const reader="#root .codex-shell[data-presentation='mobile'] [data-mobile-project-view]";
 const installedFocused=`${reader}:has([data-mobile-focused-view]):where(html[data-standalone] *)`;
 const readerBounds=[];
 css.walkRules(rule=>{
  if(rule.selector.includes('[data-mobile-project-view]')&&rule.nodes.some(node=>node.type==='decl'&&node.value.includes('--mobile-dock-viewport-height'))) readerBounds.push(rule);
 });
 assert.equal(readerBounds.length,1,'the measured bound must not spread to the overview or other reader states');
 const bound=readerBounds[0];
 assert.equal(bound.selector,installedFocused,'Safari, WEB and unfocused readers retain their existing sizing');
 assert.deepEqual(bound.nodes.filter(node=>node.type==='decl').map(({prop,value,important})=>({prop,value,important:Boolean(important)})),[
  {prop:'height',value:'min(100dvh, var(--mobile-dock-viewport-height, 100dvh))',important:false},
 ],'bound the focused stage without changing inherited launch sizing, safe insets or positioning');
 const baseline=css.nodes.find(node=>node.type==='rule'&&node.selector===reader&&node.nodes.some(decl=>decl.prop==='height'));
 assert.ok(baseline);
 assert.equal(baseline.nodes.find(node=>node.prop==='height').value,'var(--mobile-viewport-height, 100dvh)');
 assert.ok(css.nodes.indexOf(bound)>css.nodes.indexOf(baseline),'the focused bound must win the base reader height');
 const overview=css.nodes.find(node=>node.type==='rule'&&node.selector.includes(`${reader}:has([data-mobile-page-reader]):not(:has([data-mobile-focused-view]))`));
 assert.equal(overview?.nodes.find(node=>node.prop==='height')?.value,'auto','continuous overview scrolling stays independent of the focused stage');
 assert.doesNotMatch(read('../src/visitor/mobile/public-mobile.css'),/--mobile-dock-viewport-height/);
 assert.doesNotMatch(read('../src/presentation/web/web.css'),/--mobile-dock-viewport-height/);
});
