import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ts from 'typescript';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function harness(mode){
  const frames=new Map(),updates=[];let id=0;
  const react={...React,useEffect(){},useMemo:f=>f(),useRef:v=>({current:v}),useState:v=>[typeof v==='function'?v():v,next=>updates.push(next)]};
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/PortalinkPage.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,document:{querySelector:()=>null},window:{requestAnimationFrame:f=>{frames.set(++id,f);return id;},cancelAnimationFrame:i=>frames.delete(i)},require:n=>n==='react'?react:n.endsWith('/usePresentation')?{usePresentation:()=>mode}:n.endsWith('/ServicesContext')?{useServices:()=>({geography:{readLocalGeography:()=>[]}})}:new Proxy({},{get:(_,key)=>key==='__esModule'?false:()=>[]})});
  const tree=exports.PortalinkPage({onBack(){},onSelectCity(){},live:{}});
  const globe=nodes(tree).find(n=>n.props.role==='group');
  const target={setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}};
  const event=(x,id=1)=>({pointerId:id,isPrimary:true,button:0,clientX:x,clientY:0,currentTarget:target});
  return{globe,frames,updates,event};
}
test('mobile drag coalesces latest position per frame and ignores another touch',()=>{
 const h=harness('mobile');h.globe.props.onPointerDown(h.event(0));h.updates.length=0;
 h.globe.props.onPointerMove(h.event(10));h.globe.props.onPointerMove(h.event(20));
 assert.equal(h.frames.size,1);assert.equal(h.updates.length,0);
 h.globe.props.onPointerMove(h.event(100,2));
 const [id,frame]=[...h.frames][0];h.frames.delete(id);frame();
 assert.deepEqual(h.updates,[-27,18]);
 h.globe.props.onPointerMove(h.event(30));h.globe.props.onPointerUp(h.event(30));
 assert.equal(h.frames.size,0);assert.equal(h.updates.at(-3),-30.5);
 h.globe.props.onPointerMove(h.event(40));assert.equal(h.frames.size,0);
});
test('desktop drag retains immediate updates',()=>{
 const h=harness('web');h.globe.props.onPointerDown(h.event(0));h.updates.length=0;h.globe.props.onPointerMove(h.event(20));
 assert.deepEqual(h.updates,[-27,18]);assert.equal(h.frames.size,0);
});
