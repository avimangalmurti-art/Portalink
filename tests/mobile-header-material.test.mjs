import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/presentation/mobile/useMobileHeaderMaterial.ts',import.meta.url),'utf8');
let effect;
const exports={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:()=>({useLayoutEffect:fn=>{effect=fn;}}),getComputedStyle:n=>n.style});
const bounds=(top,bottom)=>({top,bottom,left:0,right:420,width:420,height:bottom-top});
const header={contains:()=>false,style:{position:'sticky',top:'0px'},getBoundingClientRect:()=>bounds(0,60)};
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
test('an unpinned scrolling title cannot trigger glass and desktop installs no observers',()=>{
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
 const css=readFileSync(new URL('../src/presentation/mobile/header-material-mobile.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/\bopacity\s*:/);
 assert.match(css,/\[data-mobile-header-underlap\]::before/);
 assert.match(css,/z-index:\s*-1/);
 assert.match(css,/pointer-events:\s*none/);
 assert.match(css,/\[data-mobile-header-underlap='true'\]::before/);
 assert.match(css,/prefers-reduced-transparency/);
 assert.match(css,/prefers-reduced-motion/);
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
 const profileHeader={contains:()=>false,style:{position:'sticky',top:'0px'},getBoundingClientRect:()=>bounds(0,100)};
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

test('a profile-only observer can opt into its ancestor scroller and clear glass on window-captured scroll',()=>{
 let installedEffect;
 const localExports={},frames=[],windowListeners=new Map();
 const ancestor={style:{overflowY:'auto',overflowX:'visible'},dataset:{},scrollTop:80,contains:()=>true,getBoundingClientRect:()=>bounds(0,912)};
 const row={closest:()=>null,getBoundingClientRect:()=>bounds(40,180)};
 const profileRoot={parentElement:ancestor,contains:()=>true,querySelectorAll:selector=>selector.startsWith('header, ')?[profileHeader]:selector.startsWith('li, ')?[row]:[],addEventListener:()=>{},removeEventListener:()=>{}};
 const profileHeader={style:{position:'sticky',top:'0px'},dataset:{},contains:()=>false,matches:()=>true,closest:selector=>selector.startsWith('[data-profile-page]')?profileRoot:null,getBoundingClientRect:()=>bounds(0,100)};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:localExports,require:()=>({useLayoutEffect:fn=>{installedEffect=fn;}}),getComputedStyle:node=>node.style,
  document:{scrollingElement:null},window:{addEventListener:(event,callback)=>windowListeners.set(event,callback),removeEventListener:event=>windowListeners.delete(event)},
  requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},cancelAnimationFrame:()=>{},MutationObserver:class{observe(){}disconnect(){}},
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
