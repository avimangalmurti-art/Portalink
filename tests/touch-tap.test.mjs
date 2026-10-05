import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function setup(enabled=true){
 const exports={};let count=0,prevented=0,stopped=0;
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/hooks/useTouchTap.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({useRef:v=>({current:v})})});
 const handlers=exports.useTouchTap(()=>count++,enabled);
 const event=(patch={})=>({pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:10,clientY:20,detail:1,preventDefault(){prevented++;},stopPropagation(){stopped++;},...patch});
 return {handlers,event,result:()=>({count,prevented,stopped})};
}
test('finger release activates once and independently consumes compatibility click',()=>{const h=setup();h.handlers.onPointerDown(h.event());h.handlers.onPointerUp(h.event());h.handlers.onPointerUp(h.event());h.handlers.onClickCapture(h.event());assert.deepEqual(h.result(),{count:1,prevented:1,stopped:2});});
test('tap works without cancelling passive touch events or viewport hit testing',()=>{const h=setup();h.handlers.onPointerDown(h.event());h.handlers.onPointerUp(h.event({cancelable:false}));assert.equal(h.result().count,1);assert.equal(h.result().prevented,0);});
test('scroll, pointer cancel and leaving the control never activate',()=>{for(const cancel of ['onPointerMove','onPointerCancel','onPointerLeave']){const h=setup();h.handlers.onPointerDown(h.event());h.handlers[cancel](h.event({clientX:40}));h.handlers.onPointerUp(h.event());assert.equal(h.result().count,0);}});
test('disabled, secondary touch, mismatched pointer and mouse retain native behavior',()=>{for(const patch of [{isPrimary:false},{pointerType:'mouse'},{button:1}]){const h=setup();h.handlers.onPointerDown(h.event(patch));h.handlers.onPointerUp(h.event(patch));assert.equal(h.result().count,0);}const h=setup(false);h.handlers.onPointerDown(h.event());h.handlers.onPointerUp(h.event());assert.equal(h.result().count,0);const m=setup();m.handlers.onPointerDown(m.event());m.handlers.onPointerUp(m.event({pointerId:2}));assert.equal(m.result().count,0);});
test('keyboard click remains usable after a touch; next genuine touch resets suppression',()=>{const h=setup();h.handlers.onPointerDown(h.event());h.handlers.onPointerUp(h.event());h.handlers.onClickCapture(h.event({detail:0}));assert.equal(h.result().prevented,0);h.handlers.onPointerDown(h.event());h.handlers.onPointerUp(h.event());assert.equal(h.result().count,2);});
