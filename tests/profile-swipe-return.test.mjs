import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(enabled=true) {
  const handlers=new Map(); let returns=0, cleanup, modal=false;
  class Target { constructor({header=false,control=false,handle=false,scroll=0}={}) {this.header=header;this.control=control;this.handle=handle;this.scrollTop=scroll;this.parentElement=null;} closest(selector){if(selector==='.profile-header-region')return this.header?this:null;if(selector==='.profile-return-handle')return this.handle?this:null;return this.control?this:null;} }
  const root={setAttribute(){},removeAttribute(){},style:{setProperty(){},removeProperty(){}},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/presentation/mobile/useProfileSwipeReturn.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:()=>({useRef:current=>({current}),useEffect:fn=>{cleanup=fn();}}),Element:Target,window:{scrollY:0,innerHeight:912},document:{querySelector:()=>modal?{}:null}});
  exports.useProfileSwipeReturn({current:root},enabled,()=>returns++);
  const swipe=(options={},dx=0,dy=90)=>{const target=new Target(options);handlers.get('touchstart')?.({target,touches:[{clientX:0,clientY:0}]});let prevented=false;handlers.get('touchmove')?.({touches:[{clientX:dx,clientY:dy}],cancelable:true,preventDefault(){prevented=true;}});handlers.get('touchend')?.();return prevented;};
  return {handlers,swipe,get returns(){return returns;},setModal:()=>modal=true,cleanup:()=>cleanup?.()};
}
test('profile pull returns in one gesture and claims browser overscroll',()=>{const h=harness();assert.equal(h.swipe(),true);assert.equal(h.returns,1);h.cleanup();assert.equal(h.handlers.size,0);});
test('profile handle works even with scrolled content; horizontal and short pulls do not return',()=>{const h=harness();h.swipe({header:true,control:true,handle:true,scroll:120});assert.equal(h.returns,1);h.swipe({},50,90);h.swipe({},0,30);assert.equal(h.returns,1);});
test('scrolling content, controls, dialogs and dock profile do not dismiss',()=>{const h=harness();h.swipe({scroll:10});h.swipe({control:true});h.setModal();h.swipe();assert.equal(h.returns,0);assert.equal(harness(false).handlers.size,0);});
