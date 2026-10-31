import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';

const gridDensity=sourceModule('src/utils/projectGridDensity.ts');

test('row slider coalesces previews and commits only the final value on release',()=>{
 const previews=[],commits=[],frames=new Map();let next=0;
 const api=sourceModule('src/components/ui/DensitySeparator.tsx',{
  react:{...React,useRef:current=>({current}),useEffect(){},startTransition:fn=>fn()},
  '../../utils/projectGridDensity':gridDensity,'./density-separator.css':{},
  '../../presentation/usePresentation':{usePresentation:()=> 'web'},
 },{getComputedStyle:()=>({direction:'ltr'}),requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)});
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

function touchSlider(presentation='mobile',columns=2,direction='ltr') {
 const frames=new Map(),previews=[],commits=[];let next=0;
 const {DensitySeparator}=sourceModule('src/components/ui/DensitySeparator.tsx',{
  react:{...React,useRef:current=>({current}),useEffect(){},startTransition:fn=>fn()},
  '../../utils/projectGridDensity':gridDensity,
  '../../presentation/usePresentation':{usePresentation:()=>presentation},'./density-separator.css':{},
 },{getComputedStyle:()=>({direction}),requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)});
 const slider=DensitySeparator({columns,label:'Profile content per row',onPreview:value=>previews.push(value),onChange:value=>commits.push(value)});
 const input={value:String(columns),style:{setProperty(){}}};slider.ref.current=input;
 const event=(x=100,y=100)=>({pointerId:1,pointerType:presentation==='mobile'?'touch':'mouse',clientX:x,clientY:y,currentTarget:input,stopPropagation(){},preventDefault(){assert.fail('Native scrolling must not be prevented');},setPointerCapture(){assert.fail('Native scrolling must not be captured');}});
 return {slider,input,frames,previews,commits,start:()=>slider.props.onPointerDown(event()),move:(x,y)=>slider.props.onPointerMove(event(x,y)),
  change(value){input.value=String(value);slider.props.onChange({currentTarget:input});},end:()=>slider.props.onPointerUp(event()),
  keyDown(key){let prevented=false;slider.props.onKeyDown?.({key,currentTarget:input,preventDefault(){prevented=true;}});return prevented;},keyUp:()=>slider.props.onKeyUp({currentTarget:input}),
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

test('mobile track taps and keyboard choices remain available while WEB cancellation commits its current choice',()=>{
 const h=touchSlider();h.start();h.change(4);h.end();assert.deepEqual(h.commits,[4]);
 h.change(5);h.slider.props.onKeyUp();assert.deepEqual(h.commits,[4,5]);
 const web=touchSlider('web');web.start();web.change(8);web.flush();assert.deepEqual(web.previews,[8]);
 web.slider.props.onPointerCancel();assert.deepEqual(web.commits,[8]);
});


test('WEB native thumb stays fractional while integer previews coalesce and dedupe before release',()=>{
 const h=touchSlider('web');
 assert.equal(h.slider.props.step,'any');
 assert.equal(h.slider.props.value,undefined,'The native thumb must not become React-controlled');
 h.start();
 for(const value of [3.05,3.2,3.4])h.change(value);
 assert.equal(h.frames.size,1);assert.equal(h.input.value,'3.4');assert.deepEqual(h.commits,[]);
 h.flush();assert.deepEqual(h.previews,[3]);
 for(const value of [3.1,3.3,3.49]){h.change(value);h.flush();}
 assert.deepEqual(h.previews,[3],'Fractional movement in the same column cannot repeat a grid preview');
 h.change(3.6);h.change(4.4);
 assert.equal(h.frames.size,1);assert.equal(h.input.value,'4.4');
 h.flush();assert.deepEqual(h.previews,[3,4]);assert.deepEqual(h.commits,[]);
 h.change(4.49);h.end();
 assert.equal(h.input.value,'4','Release snaps only the thumb to its whole-column choice');
 assert.deepEqual(h.commits,[4]);assert.equal(h.frames.size,0);
 h.slider.props.onBlur();h.keyUp();assert.deepEqual(h.commits,[4],'Blur and key-up cannot save the same drag twice');
 assert.ok([...h.previews,...h.commits].every(Number.isInteger));
});

test('WEB release cancels an unpainted preview and commits the latest rounded bounded density once',()=>{
 for(const [raw,expected] of [[5.7,6],[0.2,gridDensity.MIN_PROJECT_GRID_COLUMNS],[99.8,gridDensity.MAX_PROJECT_GRID_COLUMNS]]){
  const h=touchSlider('web');h.start();h.change(raw);
  assert.equal(h.input.value,String(raw));assert.equal(h.frames.size,1);
  assert.deepEqual(h.previews,[]);assert.deepEqual(h.commits,[]);
  h.end();h.flush();h.slider.props.onBlur();
  assert.equal(h.input.value,String(expected));assert.deepEqual(h.previews,[]);assert.deepEqual(h.commits,[expected]);
 }
});

test('WEB fractional motion that stays in the starting column still snaps and commits only on release',()=>{
 const h=touchSlider('web',2);h.start();
 for(const value of [2.1,2.25,2.49]){h.change(value);h.flush();}
 assert.deepEqual(h.previews,[2],'The established native preview contract accepts the whole starting column once');
 assert.equal(h.input.value,'2.49');assert.deepEqual(h.commits,[]);
 h.end();h.slider.props.onBlur();
 assert.equal(h.input.value,'2');assert.deepEqual(h.commits,[2]);
});

test('WEB arrows use whole columns and bounds while Home and End retain native input handling',()=>{
 for(const [key,expected] of [['ArrowRight',3],['ArrowUp',3],['ArrowLeft',1],['ArrowDown',1]]){
  const h=touchSlider('web');assert.equal(h.keyDown(key),true);
  assert.equal(h.input.value,String(expected));assert.deepEqual(h.commits,[]);
  h.flush();assert.deepEqual(h.previews,[expected]);h.keyUp();h.keyUp();
  assert.deepEqual(h.commits,[expected]);
 }
 const fractional=touchSlider('web');fractional.change(4.4);fractional.flush();
 fractional.keyDown('ArrowRight');assert.equal(fractional.input.value,'5','Arrows advance from the nearest whole column, not a fractional step');
 fractional.keyUp();assert.deepEqual(fractional.commits,[5]);
 const repeated=touchSlider('web');repeated.keyDown('ArrowRight');repeated.keyDown('ArrowRight');
 assert.equal(repeated.input.value,'4');assert.equal(repeated.frames.size,1);
 repeated.flush();repeated.keyUp();assert.deepEqual(repeated.previews,[4]);assert.deepEqual(repeated.commits,[4]);
 for(const [columns,key] of [[gridDensity.MIN_PROJECT_GRID_COLUMNS,'ArrowLeft'],[gridDensity.MAX_PROJECT_GRID_COLUMNS,'ArrowRight']]){
  const h=touchSlider('web',columns);assert.equal(h.keyDown(key),true);h.flush();h.keyUp();
  assert.equal(h.input.value,String(columns));assert.deepEqual(h.previews,[]);assert.deepEqual(h.commits,[]);
 }
 for(const [key,expected] of [['Home',gridDensity.MIN_PROJECT_GRID_COLUMNS],['End',gridDensity.MAX_PROJECT_GRID_COLUMNS]]){
  const h=touchSlider('web',4);assert.equal(h.keyDown(key),false,'Native endpoint handling is not prevented');
  h.change(expected);h.keyUp();assert.deepEqual(h.commits,[expected]);assert.equal(h.input.value,String(expected));
 }
 const mobile=touchSlider();assert.equal(mobile.slider.props.step,1);
 assert.equal(mobile.keyDown('ArrowRight'),false,'MOBILE keeps its native integer keyboard behavior');
 mobile.change(3);mobile.keyUp();assert.deepEqual(mobile.commits,[3]);
});


test('WEB RTL horizontal arrows follow native direction while vertical arrows and endpoint handling stay unchanged',()=>{
 for(const [key,expected] of [['ArrowRight',4],['ArrowLeft',6],['ArrowUp',6],['ArrowDown',4]]){
  const h=touchSlider('web',5,'rtl');assert.equal(h.keyDown(key),true);
  assert.equal(h.input.value,String(expected));assert.deepEqual(h.commits,[]);
  h.flush();assert.deepEqual(h.previews,[expected]);h.keyUp();
  assert.deepEqual(h.commits,[expected]);
 }
 for(const [columns,key] of [[gridDensity.MIN_PROJECT_GRID_COLUMNS,'ArrowRight'],[gridDensity.MAX_PROJECT_GRID_COLUMNS,'ArrowLeft']]){
  const h=touchSlider('web',columns,'rtl');assert.equal(h.keyDown(key),true);h.flush();h.keyUp();
  assert.equal(h.input.value,String(columns));assert.deepEqual(h.previews,[]);assert.deepEqual(h.commits,[]);
 }
 for(const [key,expected] of [['Home',gridDensity.MIN_PROJECT_GRID_COLUMNS],['End',gridDensity.MAX_PROJECT_GRID_COLUMNS]]){
  const h=touchSlider('web',5,'rtl');assert.equal(h.keyDown(key),false);
  h.change(expected);h.keyUp();assert.deepEqual(h.commits,[expected]);
 }
 const mobile=touchSlider('mobile',5,'rtl');assert.equal(mobile.keyDown('ArrowRight'),false,'MOBILE delegates RTL arrows to the native range');
});
