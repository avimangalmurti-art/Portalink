import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {sourceModule} from './helpers/source-module.mjs';
const source=readFileSync(new URL('../src/presentation/mobile/useMobileHeaderMaterial.ts',import.meta.url),'utf8');
let effect;
const exports={};
const underlap=sourceModule('src/presentation/headerScrollUnderlap.ts',{}, {getComputedStyle:n=>({display:'block',...n.style})});
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>name==='react'?({useLayoutEffect:fn=>{effect=fn;}}):underlap,getComputedStyle:n=>n.style});
const bounds=(top,bottom)=>({top,bottom,left:0,right:420,width:420,height:bottom-top});
const header={closest:()=>null,contains:()=>false,style:{position:'sticky',top:'0px'},getBoundingClientRect:()=>bounds(0,60)};
const scope={contains:n=>n.related};
const content={closest:()=>null,getBoundingClientRect:()=>bounds(0,912)};
const scroller={querySelectorAll:()=>[content],related:true,scrollTop:0,scrollLeft:100,contains:n=>n===header,getBoundingClientRect:()=>bounds(0,912)};
test('header stays solid at rest and horizontal tab scrolling never triggers underlap',()=>{
 assert.equal(exports.headerHasUnderlap(header,scroller,scope),false);
 scroller.scrollLeft=300;assert.equal(exports.headerHasUnderlap(header,scroller,scope),false);
});
test('vertical content under a pinned header triggers material and returning to top clears it',()=>{
 scroller.scrollTop=100;assert.equal(exports.headerHasUnderlap(header,scroller,scope),true);
 scroller.scrollTop=0;assert.equal(exports.headerHasUnderlap(header,scroller,scope),false);
});
test('a scrolled list below the header and unrelated nested scrolling do not trigger it',()=>{
 const sibling={...scroller,scrollTop:80,contains:()=>false,getBoundingClientRect:()=>bounds(60,912)};
 assert.equal(exports.headerHasUnderlap(header,sibling,scope),false);
 sibling.getBoundingClientRect=()=>bounds(40,912);assert.equal(exports.headerHasUnderlap(header,sibling,scope),true);
 sibling.related=false;assert.equal(exports.headerHasUnderlap(header,sibling,scope),false);
});
test('an unpinned scrolling title cannot trigger underlap and a disabled owner installs no observers',()=>{
 scroller.scrollTop=80;header.style.position='static';assert.equal(exports.headerHasUnderlap(header,scroller,scope),false);
 exports.useMobileHeaderMaterial(false,'/',{current:{}});assert.equal(effect(),undefined);
});

test('document scroll uses the visible viewport instead of the displaced html bounds',()=>{
 header.style.position='sticky';scroller.scrollTop=100;
 scroller.getBoundingClientRect=()=>bounds(-100,812);
 assert.equal(exports.headerHasUnderlap(header,scroller,scope,bounds(0,912)),true);
 scroller.scrollTop=0;
 assert.equal(exports.headerHasUnderlap(header,scroller,scope,bounds(0,912)),false);
});

test('content clipped below a header is not underlap, even if the inner box extends behind it',()=>{
 header.style.position='sticky';
 const sibling={querySelectorAll:()=>[content],related:true,scrollTop:80,contains:()=>false,getBoundingClientRect:()=>bounds(40,912),parentElement:{style:{overflowY:'hidden',overflowX:'visible'},getBoundingClientRect:()=>bounds(60,912)}};
 assert.equal(exports.headerHasUnderlap(header,sibling,scope),false);
 sibling.parentElement.getBoundingClientRect=()=>bounds(30,912);
 assert.equal(exports.headerHasUnderlap(header,sibling,scope),true);
});

test('shared material isolates the background, preserves foreground and honors preferences',()=>{
 const css=readFileSync(new URL('../src/presentation/header-material.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/\bopacity\s*:/);
 assert.match(css,/\[data-mobile-header-underlap\]::before/);
 assert.match(css,/z-index:\s*-1/);
 assert.match(css,/pointer-events:\s*none/);
 assert.match(css,/prefers-reduced-transparency/);
 assert.match(css,/backdrop-filter:\s*var\(--navigation-blur/);
 assert.match(css,/@layer portalink-accessibility, portalink-header-material/);
 assert.doesNotMatch(css,/\[data-presentation='mobile'\]/,'The material covers both presentations');
 assert.doesNotMatch(css,/(?:-webkit-)?mask-image\s*:\s*linear-gradient/);
 assert.match(source,/\.studio-citation-pills/,'Studio pills use the common header owner');
 assert.match(source,/\[data-mobile-safe-header\]/);
 assert.match(source,/candidates\.filter.*parent\.contains\(node\)/);
});

test('scrolling the blank leading gap does not activate material before content arrives',()=>{
 header.style.position='sticky';
 const row={closest:()=>null,getBoundingClientRect:()=>bounds(100,200)};
 const nested={...scroller,scrollTop:2,querySelectorAll:()=>[row],getBoundingClientRect:()=>bounds(0,912)};
 assert.equal(exports.headerHasUnderlap(header,nested,scope),false);
 row.getBoundingClientRect=()=>bounds(59,159);
 assert.equal(exports.headerHasUnderlap(header,nested,scope),true);
 row.getBoundingClientRect=()=>bounds(-100,0);
 assert.equal(exports.headerHasUnderlap(header,nested,scope),true,'Later rows keep the material steady');
 nested.querySelectorAll=()=>[];
 assert.equal(exports.headerHasUnderlap(header,nested,scope),false,'Empty spacing is not content');
});

test('Journey calendar foreground does not hide agenda underlap from the profile header',()=>{
 const profileHeader={closest:()=>null,contains:()=>false,style:{position:'sticky',top:'0px'},getBoundingClientRect:()=>bounds(0,100)};
 const calendarInput={closest:selector=>selector.includes('.journey-calendar-header')?{}:null,getBoundingClientRect:()=>bounds(100,156)};
 const agendaRow={closest:()=>null,getBoundingClientRect:()=>bounds(270,330)};
 const profileScope={contains:()=>true,querySelectorAll:()=>[calendarInput,agendaRow]};
 const documentScroller={scrollTop:20,contains:()=>true,getBoundingClientRect:()=>bounds(0,912)};
 assert.equal(exports.headerHasUnderlap(profileHeader,documentScroller,profileScope),false,'Pinned calendar alone is not content under the identity');
 agendaRow.getBoundingClientRect=()=>bounds(99,159);
 assert.equal(exports.headerHasUnderlap(profileHeader,documentScroller,profileScope),true,'Agenda crossing the profile edge activates glass despite the pinned calendar');
 documentScroller.scrollTop=0;
 assert.equal(exports.headerHasUnderlap(profileHeader,documentScroller,profileScope),false,'Returning to the top restores the solid header');
});

test('a floating status label does not hide interactive content crossing a dialog header',()=>{
 const status={closest:selector=>selector.includes('[role="status"]')?{}:null,getBoundingClientRect:()=>bounds(270,302)};
 const row={closest:()=>null,getBoundingClientRect:()=>bounds(-20,70)};
 const list={...scroller,scrollTop:200,querySelectorAll:()=>[status,row],getBoundingClientRect:()=>bounds(0,912)};
 assert.equal(exports.headerHasUnderlap(header,list,scope),true);
});

test('a profile-only observer can opt into its ancestor scroller and clear glass on window-captured scroll',()=>{
 let installedEffect;
 const localExports={},frames=[],windowListeners=new Map();
 const ancestor={closest:()=>null,style:{overflowY:'auto',overflowX:'visible'},dataset:{},scrollTop:80,contains:()=>true,getBoundingClientRect:()=>bounds(0,912)};
 const row={closest:()=>null,getBoundingClientRect:()=>bounds(40,180)};
 const profileRoot={parentElement:ancestor,contains:()=>true,querySelectorAll:selector=>selector.startsWith('header, ')?[profileHeader]:selector.startsWith('li, ')?[row]:[],addEventListener:()=>{},removeEventListener:()=>{}};
 const profileHeader={style:{position:'sticky',top:'0px'},dataset:{},contains:()=>false,matches:()=>true,closest:selector=>selector.startsWith('[data-profile-page]')?profileRoot:null,getBoundingClientRect:()=>bounds(0,100)};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:localExports,require:name=>name==='react'?({useLayoutEffect:fn=>{installedEffect=fn;}}):underlap,getComputedStyle:node=>node.style,
  document:{scrollingElement:null},window:{addEventListener:(event,callback)=>windowListeners.set(event,callback),removeEventListener:event=>windowListeners.delete(event)},
  requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},cancelAnimationFrame:()=>{},MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},
 });
 localExports.useMobileHeaderMaterial(true,'/profile',{current:profileRoot});
 const defaultCleanup=installedEffect();
 assert.equal(profileHeader.dataset.mobileHeaderUnderlap,'false','Mobile default does not include ancestors');
 defaultCleanup();
 localExports.useMobileHeaderMaterial(true,'/profile',{current:profileRoot},true);
 const cleanup=installedEffect();
 assert.equal(profileHeader.dataset.mobileHeaderUnderlap,'true','Opt-in finds the existing page scroller');
 assert.equal(ancestor.dataset.mobileScrollUnderlap,'true');
 ancestor.scrollTop=0;
 windowListeners.get('scroll')();frames.shift()();
 assert.equal(profileHeader.dataset.mobileHeaderUnderlap,'false','Ancestor scroll events reset the material');
 cleanup();
 assert.equal(profileHeader.dataset.mobileHeaderUnderlap,undefined);
 assert.equal(ancestor.dataset.mobileScrollUnderlap,undefined);
});

for (const presentation of ['mobile','web']) test(`a static ${presentation} dialog toolbar keeps its material and reading offset across scrolling, resize and cleanup`,()=>{
 let mount;
 let discoveryCount=0, contentSearches=0, mutate;
 const frames=[],listeners=new Map(),windowListeners=new Map(),localExports={};
 const style=()=>{const values=new Map();return {getPropertyValue:key=>values.get(key)??'',setProperty:(key,value)=>values.set(key,value),removeProperty:key=>values.delete(key)}};
 const row={closest:()=>null,getBoundingClientRect:()=>bounds(60-body.scrollTop,180-body.scrollTop)};
 const root={dataset:{presentation},parentElement:null,children:[],getBoundingClientRect:()=>bounds(0,912),contains:node=>node===root||node===toolbar||node===body||node===contents,computed:{display:'flex',flexDirection:'column',overflowY:'visible',overflowX:'visible'},querySelectorAll:selector=>{if(selector.startsWith('header,')){discoveryCount++;return [toolbar];}return selector.startsWith('[data-screen-scroll]')?[body,contents]:[];},addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:event=>listeners.delete(event)};
 const toolbar={parentElement:root,children:[],dataset:{},style:style(),computed:{position:'static',display:'block',overflowY:'visible',overflowX:'visible'},contains:node=>node===toolbar,closest:()=>null,matches:()=>false,getBoundingClientRect:()=>bounds(0,60)};
 const body={parentElement:root,children:[],dataset:{},style:style(),scrollTop:0,computed:{display:'block',position:'static',overflowY:'auto',overflowX:'visible',marginTop:'0px',paddingTop:'12px',scrollPaddingTop:'auto'},contains:node=>node===body||node===row,closest:()=>null,matches:()=>false,querySelectorAll:()=>{contentSearches++;return [row];},getBoundingClientRect:()=>bounds(body.dataset.fixedHeaderUnderlap!==undefined?0:60,912)};
 const contents={...body,parentElement:body,dataset:{},style:style(),computed:{...body.computed,display:'contents'},getBoundingClientRect:()=>bounds(0,0)};
 root.children=[toolbar,body];
 const computed=node=>({...node.computed,...(node.dataset?.headerMaterialStatic!==undefined?{position:'relative'}:{})});
 const layout=sourceModule('src/presentation/headerScrollUnderlap.ts',{}, {getComputedStyle:computed});
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:localExports,require:name=>name==='react'?{useLayoutEffect:fn=>{mount=fn}}:layout,getComputedStyle:computed,
  document:{scrollingElement:null},window:{addEventListener:(event,fn)=>windowListeners.set(event,fn),removeEventListener:event=>windowListeners.delete(event)},
  requestAnimationFrame:fn=>{frames.push(fn);return frames.length},cancelAnimationFrame(){},MutationObserver:class{constructor(callback){mutate=callback;}observe(){}disconnect(){}},ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},
 });
 localExports.useMobileHeaderMaterial(true,'/dialog',{current:root});
 const cleanup=mount();
 assert.equal(toolbar.dataset.headerMaterialStatic,'');
 assert.equal(body.dataset.fixedHeaderUnderlap,'');
 assert.equal(contents.dataset.fixedHeaderContent,undefined,'A zero-size contents wrapper never owns scroll padding');
 body.scrollTop=80;listeners.get('scroll')();frames.shift()();
 assert.equal(toolbar.dataset.mobileHeaderUnderlap,'true','The generic toolbar survives the first actual scroll');
 assert.equal(toolbar.dataset.headerMaterialStatic,'');
 body.scrollTop=90;listeners.get('scroll')();frames.shift()();
 assert.equal(discoveryCount,presentation==='web'?1:3,'Desktop reuses the header and scroller discovery on stable scroll');
 assert.equal(contentSearches,presentation==='web'?1:2,'Desktop reuses the first content node');
 mutate();frames.shift()();
 assert.equal(discoveryCount,presentation==='web'?2:4,'A changed layout invalidates header discovery');
 assert.equal(contentSearches,presentation==='web'?2:3,'A changed layout invalidates content discovery');
 windowListeners.get('resize')();frames.shift()();
 assert.equal(body.scrollTop,90);
 assert.equal(toolbar.dataset.mobileHeaderUnderlap,'true');
 cleanup();
 assert.equal(toolbar.dataset.mobileHeaderUnderlap,undefined);
 assert.equal(toolbar.dataset.headerMaterialStatic,undefined);
 assert.equal(body.dataset.fixedHeaderUnderlap,undefined);
 assert.equal(listeners.size,0);
 assert.equal(windowListeners.size,0);
});
