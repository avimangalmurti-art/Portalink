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
