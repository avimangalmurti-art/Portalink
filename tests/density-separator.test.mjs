import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';

test('row slider coalesces previews and commits only the final value on release',()=>{
 const previews=[],commits=[],frames=new Map();let next=0;
 const api=sourceModule('src/components/ui/DensitySeparator.tsx',{
  react:{...React,useRef:current=>({current}),useEffect(){},startTransition:fn=>fn()},
  '../../utils/projectGridDensity':{MIN_PROJECT_GRID_COLUMNS:1,MAX_PROJECT_GRID_COLUMNS:13},'./density-separator.css':{},
  '../../presentation/usePresentation':{usePresentation:()=> 'web'},
 },{requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)});
 const slider=api.DensitySeparator({columns:2,label:'Home content per row',onPreview:value=>previews.push(value),onChange:value=>commits.push(value)});
 assert.equal(slider.props.value,undefined,'Native thumb is not held behind grid renders');
 slider.props.onPointerDown({stopPropagation(){}});
 for(const value of [3,5,8])slider.props.onChange({currentTarget:{value:String(value)}});
 assert.equal(frames.size,1);assert.deepEqual(commits,[]);
 const frame=[...frames.values()][0];frames.clear();frame();assert.deepEqual(previews,[8]);
 slider.props.onChange({currentTarget:{value:'10'}});
 slider.props.onPointerUp({stopPropagation(){}});
 assert.deepEqual(commits,[10]);assert.equal(frames.size,0);
 slider.props.onBlur();assert.deepEqual(commits,[10],'Blur must not save twice');
});

function touchSlider(presentation='mobile') {
 const frames=new Map(),previews=[],commits=[];let next=0;
 const {DensitySeparator}=sourceModule('src/components/ui/DensitySeparator.tsx',{
  react:{...React,useRef:current=>({current}),useEffect(){},startTransition:fn=>fn()},
  '../../utils/projectGridDensity':{MIN_PROJECT_GRID_COLUMNS:1,MAX_PROJECT_GRID_COLUMNS:13},
  '../../presentation/usePresentation':{usePresentation:()=>presentation},'./density-separator.css':{},
 },{requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)});
 const slider=DensitySeparator({columns:2,label:'Profile content per row',onPreview:value=>previews.push(value),onChange:value=>commits.push(value)});
 const input={value:'2',style:{setProperty(){}}};slider.ref.current=input;
 const event=(x=100,y=100)=>({pointerId:1,pointerType:'touch',clientX:x,clientY:y,currentTarget:input,stopPropagation(){},preventDefault(){assert.fail('Native scrolling must not be prevented');},setPointerCapture(){assert.fail('Native scrolling must not be captured');}});
 return {slider,input,frames,previews,commits,start:()=>slider.props.onPointerDown(event()),move:(x,y)=>slider.props.onPointerMove(event(x,y)),
  change(value){input.value=String(value);slider.props.onChange({currentTarget:input});},end:()=>slider.props.onPointerUp(event()),
  flush(){for(const [id,frame]of [...frames]){frames.delete(id);frame();}}};
}

test('mobile vertical swipes over the density track never preview or save an accidental native range change',()=>{
 for(const dy of [-40,40])for(const finish of ['onPointerCancel','onPointerUp','onBlur']){
  const h=touchSlider();h.start();h.change(11);
  assert.equal(h.frames.size,0,'Do not regroup cards before touch intent is known');
  h.move(102,100+dy);h.change(12);h.flush();
  if(finish==='onPointerUp')h.end();else h.slider.props[finish]();
  assert.equal(h.input.value,'2');assert.deepEqual(h.previews,[]);assert.deepEqual(h.commits,[]);
 }
 const cancelled=touchSlider();cancelled.start();cancelled.change(9);cancelled.slider.props.onPointerCancel();cancelled.flush();
 assert.equal(cancelled.input.value,'2');assert.deepEqual(cancelled.commits,[],'Native cancellation before the intent threshold must also keep density');
});

test('mobile horizontal range dragging coalesces live previews and saves once after release',()=>{
 const h=touchSlider();h.start();h.change(4);h.move(114,102);h.change(5);h.change(7);
 assert.equal(h.frames.size,1);h.flush();assert.deepEqual(h.previews,[7]);assert.deepEqual(h.commits,[]);
 h.end();h.slider.props.onBlur();assert.deepEqual(h.commits,[7]);assert.equal(h.input.value,'7');
});

test('interrupted mobile density dragging restores its preview without persisting a change',()=>{
 const h=touchSlider();h.start();h.change(6);h.move(120,101);h.flush();
 assert.deepEqual(h.previews,[6]);h.slider.props.onPointerCancel();h.flush();
 assert.equal(h.input.value,'2');assert.deepEqual(h.previews,[6,2]);assert.deepEqual(h.commits,[]);
});

test('mobile track taps and keyboard choices remain available while WEB keeps native range behavior',()=>{
 const h=touchSlider();h.start();h.change(4);h.end();assert.deepEqual(h.commits,[4]);
 h.change(5);h.slider.props.onKeyUp();assert.deepEqual(h.commits,[4,5]);
 const web=touchSlider('web');web.start();web.change(8);web.flush();assert.deepEqual(web.previews,[8]);
 web.slider.props.onPointerCancel();assert.deepEqual(web.commits,[8]);
});
