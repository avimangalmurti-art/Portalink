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
const header={style:{position:'sticky',top:'0px'},getBoundingClientRect:()=>bounds(0,60)};
const scope={contains:n=>n.related};
const scroller={related:true,scrollTop:0,scrollLeft:100,contains:n=>n===header,getBoundingClientRect:()=>bounds(0,912)};
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
