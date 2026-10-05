import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function setup(enabled=true){
 const exports={};let count=0,prevented=0;const target={},owner={contains:hit=>hit===target};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/hooks/useTouchTap.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:()=>({useRef:v=>({current:v})}),document:{elementFromPoint:()=>target}});
 const handlers=exports.useTouchTap(()=>count++,enabled);
 const touch=(x=10,y=20)=>({identifier:1,clientX:x,clientY:y});
 const event=(touches,changedTouches=[])=>({touches,changedTouches,currentTarget:owner,cancelable:true,preventDefault(){prevented++;},stopPropagation(){}});
 return {handlers,touch,event,result:()=>({count,prevented})};
}
test('finger tap activates without a compatibility click and suppresses duplicate click',()=>{const h=setup();h.handlers.onTouchStart(h.event([h.touch()]));h.handlers.onTouchEnd(h.event([],[h.touch()]));h.handlers.onTouchEnd(h.event([],[h.touch()]));assert.deepEqual(h.result(),{count:1,prevented:1});});
test('scroll and cancelled touches do not activate or prevent native scrolling',()=>{for(const cancelled of [false,true]){const h=setup();h.handlers.onTouchStart(h.event([h.touch()]));if(cancelled)h.handlers.onTouchCancel();else h.handlers.onTouchMove(h.event([h.touch(40,20)]));h.handlers.onTouchEnd(h.event([],[h.touch(40,20)]));assert.deepEqual(h.result(),{count:0,prevented:0});}});
test('disabled and multi-touch controls do not activate',()=>{for(const enabled of [false,true]){const h=setup(enabled);h.handlers.onTouchStart(h.event(enabled?[h.touch(),h.touch()]:[h.touch()]));h.handlers.onTouchEnd(h.event([],[h.touch()]));assert.deepEqual(h.result(),{count:0,prevented:0});}});
