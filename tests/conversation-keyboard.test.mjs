import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(enabled=true, top=100) {
  const target = () => { const listeners=new Map(); return {addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},removeEventListener(k,fn){listeners.get(k)?.delete(fn);},emit(k){listeners.get(k)?.forEach(fn=>fn());},count(){return [...listeners.values()].reduce((n,s)=>n+s.size,0);}}; };
  const viewport={...target(),height:900,offsetTop:0};
  const frames=new Map(),timers=new Map();let id=0,cleanup,resize;
  const win={...target(),visualViewport:viewport,innerHeight:900,setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(key){timers.delete(key);}};
  const doc={...target(),activeElement:null};
  const attrs=new Set();const frame={setAttribute:k=>attrs.add(k),removeAttribute:k=>attrs.delete(k)};
  const scroller={scrollTop:top,scrollHeight:1500,clientHeight:700};const composer={};
  const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/messages/useConversationKeyboard.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,window:win,document:doc,ResizeObserver:class {constructor(fn){resize=fn;}observe(){}disconnect(){resize=null;}},requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(key){frames.delete(key);},require(){return {useEffect(fn){cleanup=fn();}};}});
  exports.useConversationKeyboard(enabled,'thread',{current:frame},{current:scroller},{current:composer});
  return {viewport,win,doc,scroller,attrs,focus(){doc.activeElement=composer;doc.emit('focusin');},blur(){doc.activeElement=null;doc.emit('focusout');},flush(){const f=[...frames.values()];frames.clear();f.forEach(fn=>fn());},settle(){const t=[...timers.values()];timers.clear();t.forEach(fn=>fn());},resize:()=>resize?.(),cleanup:()=>cleanup?.(),pending:()=>frames.size+timers.size};
}
test('typing follows shrink even when Safari innerHeight shrinks, pins latest and restores history after close',()=>{
 const h=harness();h.focus();assert.equal(h.scroller.scrollTop,100);
 h.viewport.height=420;h.win.innerHeight=420;h.scroller.clientHeight=220;h.viewport.emit('resize');h.flush();
 assert.equal(h.attrs.has('data-conversation-keyboard'),true);assert.equal(h.scroller.scrollTop,1280);
 h.blur();h.settle();h.flush();assert.equal(h.attrs.has('data-conversation-keyboard'),true,'Blur alone is not keyboard closure');
 h.viewport.height=900;h.win.innerHeight=900;h.scroller.clientHeight=700;h.viewport.emit('resize');h.settle();h.flush();
 assert.equal(h.attrs.has('data-conversation-keyboard'),false);assert.equal(h.scroller.scrollTop,100);
});
test('a conversation already at the bottom stays at the latest message through keyboard close',()=>{
 const h=harness(true,800);h.focus();h.viewport.height=420;h.scroller.clientHeight=220;h.viewport.emit('resize');h.flush();
 h.scroller.scrollHeight=1600;h.viewport.height=900;h.scroller.clientHeight=700;h.viewport.emit('resize');h.settle();h.flush();assert.equal(h.scroller.scrollTop,900);
});
test('ordinary focus, browser chrome resize and disabled desktop never change transcript position',()=>{
 const h=harness();h.focus();h.viewport.height=850;h.viewport.emit('resize');h.flush();assert.equal(h.scroller.scrollTop,100);assert.equal(h.attrs.size,0);
 const desktop=harness(false);desktop.focus();desktop.viewport.height=400;desktop.viewport.emit('resize');desktop.flush();assert.equal(desktop.scroller.scrollTop,100);
});
test('conversation teardown cancels pending work and removes listeners and keyboard state',()=>{
 const h=harness();h.focus();h.viewport.height=420;h.viewport.emit('resize');h.cleanup();assert.equal(h.pending(),0);assert.equal(h.viewport.count(),0);assert.equal(h.doc.count(),0);assert.equal(h.win.count(),0);assert.equal(h.attrs.size,0);
});

test('multiline composer growth keeps the latest content visible only while the keyboard is open',()=>{
 const h=harness();h.focus();h.viewport.height=420;h.scroller.clientHeight=220;h.viewport.emit('resize');h.flush();
 h.scroller.clientHeight=150;h.resize();h.flush();assert.equal(h.scroller.scrollTop,1350);
 const closed=harness();closed.scroller.clientHeight=650;closed.resize();closed.flush();assert.equal(closed.scroller.scrollTop,100);
});
