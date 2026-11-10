import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';

const gridDensity=sourceModule('src/utils/projectGridDensity.ts');
const rangeOf=tree=>React.Children.toArray(tree.props.children).find(node=>node.type==='input');

test('row slider coalesces previews and commits only the final value on release',()=>{
 const previews=[],commits=[],frames=new Map();let next=0;
 const api=sourceModule('src/components/ui/DensitySeparator.tsx',{
  react:{...React,useRef:current=>({current}),useEffect(){},useLayoutEffect(){},startTransition:fn=>fn()},
  '../../utils/projectGridDensity':gridDensity,'./density-separator.css':{},
  '../../presentation/usePresentation':{usePresentation:()=> 'web'},
 },{getComputedStyle:()=>({direction:'ltr'}),requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)});
 const slider=rangeOf(api.DensitySeparator({columns:2,label:'Home content per row',onPreview:value=>previews.push(value),onChange:value=>commits.push(value)}));
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

function touchSlider(presentation='mobile',columns=2,direction='ltr',maxColumns) {
 const frames=new Map(),previews=[],commits=[];let next=0;
 const {DensitySeparator}=sourceModule('src/components/ui/DensitySeparator.tsx',{
  react:{...React,useRef:current=>({current}),useEffect(){},useLayoutEffect(){},startTransition:fn=>fn()},
  '../../utils/projectGridDensity':gridDensity,
  '../../presentation/usePresentation':{usePresentation:()=>presentation},'./density-separator.css':{},
 },{getComputedStyle:()=>({direction}),requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)});
 const tree=DensitySeparator({columns,maxColumns,label:'Profile content per row',onPreview:value=>previews.push(value),onChange:value=>commits.push(value)}),slider=rangeOf(tree);
 const styles=new Map(),input={value:String(columns),style:{setProperty(key,value){styles.set(key,value);}}};slider.ref.current=input;
 const event=(x=100,y=100)=>({pointerId:1,pointerType:presentation==='mobile'?'touch':'mouse',clientX:x,clientY:y,currentTarget:input,stopPropagation(){},preventDefault(){assert.fail('Native scrolling must not be prevented');},setPointerCapture(){assert.fail('Native scrolling must not be captured');}});
 return {tree,slider,input,styles,frames,previews,commits,start:()=>slider.props.onPointerDown(event()),move:(x,y)=>slider.props.onPointerMove(event(x,y)),
  change(value){input.value=String(value);slider.props.onChange({currentTarget:input});},end:()=>slider.props.onPointerUp(event()),
  keyDown(key){let prevented=false;slider.props.onKeyDown?.({key,currentTarget:input,preventDefault(){prevented=true;}});return prevented;},keyUp:()=>slider.props.onKeyUp({currentTarget:input}),
  flush(){for(const [id,frame]of [...frames]){frames.delete(id);frame();}}};
}

test('mobile vertical swipes over the density track never preview or save an accidental fractional range change',()=>{
 for(const dy of [-40,40])for(const finish of ['onPointerCancel','onPointerUp','onBlur']){
  const h=touchSlider();h.start();h.change(11.37);
  assert.equal(h.frames.size,0,'Do not regroup cards before touch intent is known');
  h.move(102,100+dy);h.change(12.46);h.flush();
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

test('interrupted mobile fractional dragging restores its integer preview and thumb without persisting',()=>{
 const h=touchSlider();h.start();h.change(6.25);h.move(120,101);h.flush();
 assert.deepEqual(h.previews,[6]);h.slider.props.onPointerCancel();h.flush();
 assert.equal(h.input.value,'2');assert.deepEqual(h.previews,[6,2]);assert.deepEqual(h.commits,[]);
 assert.equal(Number(h.styles.get('--density-position')),1/12);
});

test('mobile track taps and keyboard choices remain available while WEB cancellation commits its current choice',()=>{
 const h=touchSlider();h.start();h.change(4);h.end();assert.deepEqual(h.commits,[4]);
 h.change(5);h.slider.props.onKeyUp();assert.deepEqual(h.commits,[4,5]);
 const web=touchSlider('web');web.start();web.change(8);web.flush();assert.deepEqual(web.previews,[8]);
 web.slider.props.onPointerCancel();assert.deepEqual(web.commits,[8]);
});


test('both native thumbs stay fractional while integer previews coalesce and dedupe before release',()=>{
 for(const presentation of ['web','mobile']){
 const h=touchSlider(presentation);
 assert.equal(h.slider.props.step,'any');
 assert.equal(h.slider.props.value,undefined,'The native thumb must not become React-controlled');
 h.start();h.move(120,101);
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
 }
});

test('release cancels an unpainted preview and commits the latest rounded bounded density once on both presentations',()=>{
 for(const presentation of ['web','mobile']){
 for(const [raw,expected] of [[5.7,6],[0.2,gridDensity.MIN_PROJECT_GRID_COLUMNS],[99.8,gridDensity.MAX_PROJECT_GRID_COLUMNS]]){
  const h=touchSlider(presentation);h.start();h.move(120,101);h.change(raw);
  assert.equal(Number(h.input.value),Math.max(gridDensity.MIN_PROJECT_GRID_COLUMNS,Math.min(gridDensity.MAX_PROJECT_GRID_COLUMNS,raw)));assert.equal(h.frames.size,1);
  assert.deepEqual(h.previews,[]);assert.deepEqual(h.commits,[]);
  h.end();h.flush();h.slider.props.onBlur();
  assert.equal(h.input.value,String(expected));assert.deepEqual(h.previews,[]);assert.deepEqual(h.commits,[expected]);
 }
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

test('arrows use whole columns and bounds on both presentations while Home and End retain native input handling',()=>{
 for(const presentation of ['web','mobile']){
 for(const [key,expected] of [['ArrowRight',3],['ArrowUp',3],['ArrowLeft',1],['ArrowDown',1]]){
  const h=touchSlider(presentation);assert.equal(h.keyDown(key),true);
  assert.equal(h.input.value,String(expected));assert.deepEqual(h.commits,[]);
  h.flush();assert.deepEqual(h.previews,[expected]);h.keyUp();h.keyUp();
  assert.deepEqual(h.commits,[expected]);
 }
 const fractional=touchSlider(presentation);fractional.change(4.4);fractional.flush();
 fractional.keyDown('ArrowRight');assert.equal(fractional.input.value,'5','Arrows advance from the nearest whole column, not a fractional step');
 fractional.keyUp();assert.deepEqual(fractional.commits,[5]);
 const repeated=touchSlider(presentation);repeated.keyDown('ArrowRight');repeated.keyDown('ArrowRight');
 assert.equal(repeated.input.value,'4');assert.equal(repeated.frames.size,1);
 repeated.flush();repeated.keyUp();assert.deepEqual(repeated.previews,[4]);assert.deepEqual(repeated.commits,[4]);
 for(const [columns,key] of [[gridDensity.MIN_PROJECT_GRID_COLUMNS,'ArrowLeft'],[gridDensity.MAX_PROJECT_GRID_COLUMNS,'ArrowRight']]){
  const h=touchSlider(presentation,columns);assert.equal(h.keyDown(key),true);h.flush();h.keyUp();
  assert.equal(h.input.value,String(columns));assert.deepEqual(h.previews,[]);assert.deepEqual(h.commits,[]);
 }
 for(const [key,expected] of [['Home',gridDensity.MIN_PROJECT_GRID_COLUMNS],['End',gridDensity.MAX_PROJECT_GRID_COLUMNS]]){
  const h=touchSlider(presentation,4);assert.equal(h.keyDown(key),false,'Native endpoint handling is not prevented');
  h.change(expected);h.keyUp();assert.deepEqual(h.commits,[expected]);assert.equal(h.input.value,String(expected));
 }
 assert.equal(touchSlider(presentation).slider.props.step,'any');
 }
});


test('RTL horizontal arrows follow native direction on both presentations while vertical arrows and endpoints stay unchanged',()=>{
 for(const presentation of ['web','mobile']){
 for(const [key,expected] of [['ArrowRight',4],['ArrowLeft',6],['ArrowUp',6],['ArrowDown',4]]){
  const h=touchSlider(presentation,5,'rtl');assert.equal(h.keyDown(key),true);
  assert.equal(h.input.value,String(expected));assert.deepEqual(h.commits,[]);
  h.flush();assert.deepEqual(h.previews,[expected]);h.keyUp();
  assert.deepEqual(h.commits,[expected]);
 }
 for(const [columns,key] of [[gridDensity.MIN_PROJECT_GRID_COLUMNS,'ArrowRight'],[gridDensity.MAX_PROJECT_GRID_COLUMNS,'ArrowLeft']]){
  const h=touchSlider(presentation,columns,'rtl');assert.equal(h.keyDown(key),true);h.flush();h.keyUp();
  assert.equal(h.input.value,String(columns));assert.deepEqual(h.previews,[]);assert.deepEqual(h.commits,[]);
 }
 for(const [key,expected] of [['Home',gridDensity.MIN_PROJECT_GRID_COLUMNS],['End',gridDensity.MAX_PROJECT_GRID_COLUMNS]]){
  const h=touchSlider(presentation,5,'rtl');assert.equal(h.keyDown(key),false);
  h.change(expected);h.keyUp();assert.deepEqual(h.commits,[expected]);
 }
 }
});

function switchingSlider(initialPresentation) {
 const slots=[],frames=new Map(),previews={web:[],mobile:[]},commits={web:[],mobile:[]},columns={web:2,mobile:2};
 let presentation=initialPresentation,cursor=0,frameId=0,tree,layouts=[],effects=[];
 const equal=(left,right)=>left&&right&&left.length===right.length&&left.every((value,index)=>Object.is(value,right[index]));
 const effect=(callback,deps,queue)=>{
  const index=cursor++,prior=slots[index];
  if(!equal(prior?.deps,deps)){slots[index]={deps};queue.push(()=>{prior?.cleanup?.();slots[index].cleanup=callback();});}
 };
 const {DensitySeparator}=sourceModule('src/components/ui/DensitySeparator.tsx',{
  react:{...React,useRef:current=>slots[cursor++]??=({current}),useLayoutEffect:(fn,deps)=>effect(fn,deps,layouts),
   useEffect:(fn,deps)=>effect(fn,deps,effects),startTransition:fn=>fn()},
  '../../utils/projectGridDensity':gridDensity,'./density-separator.css':{},
  '../../presentation/usePresentation':{usePresentation:()=>presentation},
 },{getComputedStyle:()=>({direction:'ltr'}),requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)});
 const styles=new Map(),input={value:'2',style:{setProperty(key,value){styles.set(key,value);}}};
 const callbacks=Object.fromEntries(['web','mobile'].map(scope=>[scope,{
  onPreview:value=>{previews[scope].push(value);columns[scope]=value;},onChange:value=>{commits[scope].push(value);columns[scope]=value;},
 }]));
 const render=()=>{cursor=0;tree=rangeOf(DensitySeparator({columns:columns[presentation],label:'Projects per row',...callbacks[presentation]}));
  tree.ref.current=input;layouts.splice(0).forEach(fn=>fn());effects.splice(0).forEach(fn=>fn());return tree;};
 const event=(x=100,y=100)=>({pointerId:1,pointerType:presentation==='mobile'?'touch':'mouse',clientX:x,clientY:y,currentTarget:input,stopPropagation(){}});
 render();
 return {input,styles,frames,previews,commits,columns,get tree(){return tree;},render,
  start(){tree.props.onPointerDown(event());},
  change(value){input.value=String(value);tree.props.onChange({currentTarget:input});},
  move(){tree.props.onPointerMove(event(130,101));},end(){tree.props.onPointerUp(event());},
  switch(){presentation=presentation==='mobile'?'web':'mobile';return render();},
  flush(){for(const[id,fn]of [...frames]){frames.delete(id);fn();}},
  dispose(){slots.forEach(slot=>slot?.cleanup?.());},
 };
}

test('mobile raw clip position follows fractional movement outside the magnetic zone and survives rounded preview renders',()=>{
 const h=switchingSlider('mobile');h.start();h.change(3.25);h.move();h.flush();h.render();
 assert.equal(h.input.value,'3.25');assert.deepEqual(h.previews.mobile,[3]);assert.deepEqual(h.commits.mobile,[]);
 assert.equal(Number(h.styles.get('--density-position')),(3.25-1)/12);
 assert.equal(h.tree.props.style['--density-position'],(3.25-1)/12,'A rounded wall render must not snap the clipping window.');
 h.change(3.3);h.flush();h.render();
 assert.deepEqual(h.previews.mobile,[3],'The same whole column is not rendered again.');
 assert.equal(Number(h.styles.get('--density-position')),(3.3-1)/12,'Raw thumb alignment updates before preview deduplication.');
 assert.equal(h.tree.props.style['--density-position'],(3.3-1)/12);
 h.change(3.6);h.flush();h.render();assert.deepEqual(h.previews.mobile,[3,4]);
 assert.equal(h.tree.props.style['--density-position'],(3.6-1)/12);
 h.end();h.tree.props.onBlur();assert.equal(h.input.value,'4');
 assert.equal(Number(h.styles.get('--density-position')),(4-1)/12);assert.deepEqual(h.commits.mobile,[4]);
 h.dispose();
});

test('both sliders capture nearby stops, hold through small jitter and release into continuous movement',()=>{
 for(const presentation of ['web','mobile']){
  const h=touchSlider(presentation);h.start();h.move(120,101);
  h.change(2.6);h.flush();assert.equal(h.input.value,'2.6');assert.deepEqual(h.previews,[3]);
  h.change(2.91);h.flush();assert.equal(h.input.value,'3');
  if(presentation==='mobile')assert.equal(Number(h.styles.get('--density-position')),2/12,'Hit area follows the snapped thumb before integer preview deduplication');
  for(const value of [2.85,3.12,3.2]){h.change(value);h.flush();assert.equal(h.input.value,'3');}
  assert.deepEqual(h.previews,[3]);assert.deepEqual(h.commits,[]);
  h.change(3.21);h.flush();assert.equal(h.input.value,'3.21','Moving beyond the wider release distance unlocks the thumb');
  h.change(3.19);h.flush();assert.equal(h.input.value,'3.19','Returning only to the release zone does not immediately relock');
  h.change(3.12);h.flush();assert.equal(h.input.value,'3','Capture works from the other side at the boundary');
  h.change(5.06);h.flush();assert.equal(h.input.value,'5','Fast movement can skip stops and acquire the new nearest stop');
  assert.deepEqual(h.previews,[3,5]);assert.deepEqual(h.commits,[]);
  h.end();h.slider.props.onBlur();assert.deepEqual(h.commits,[5]);
 }
});

test('magnetic stops reset after release or cancellation and never capture non-pointer input',()=>{
 for(const presentation of ['web','mobile']){
  const h=touchSlider(presentation);h.start();h.move(120,101);h.change(3.08);h.flush();assert.equal(h.input.value,'3');
  h.end();assert.deepEqual(h.commits,[3]);
  h.start();h.move(120,101);h.change(3.18);h.flush();assert.equal(h.input.value,'3.18','A new drag cannot inherit the last stop');
  h.change(5.08);h.flush();assert.equal(h.input.value,'5');h.slider.props.onPointerCancel();
  h.start();h.move(120,101);h.change(5.18);h.flush();assert.equal(h.input.value,'5.18','Cancellation also clears the magnetic lock');
  h.end();
  const keyboard=touchSlider(presentation);keyboard.change(4.08);assert.equal(keyboard.input.value,'4.08','Native non-pointer changes remain free');
  keyboard.keyDown('ArrowRight');keyboard.keyUp();assert.equal(keyboard.input.value,'5');assert.deepEqual(keyboard.commits,[5]);
 }
});

test('mobile snapping does not turn a vertical scroll gesture into a density save',()=>{
 for(const finish of ['onPointerUp','onPointerCancel','onBlur']){
  const h=touchSlider();h.start();h.change(5.08);assert.equal(h.input.value,'5');assert.equal(h.frames.size,0);
  h.move(101,130);h.change(6.04);h.slider.props[finish]({stopPropagation(){}});h.flush();
  assert.equal(h.input.value,'2');assert.deepEqual(h.previews,[]);assert.deepEqual(h.commits,[]);
 }
});

test('tick marks are a separate noninteractive decoration and retain the direct native input',()=>{
 for(const presentation of ['web','mobile']){
  const h=touchSlider(presentation),children=React.Children.toArray(h.tree.props.children);
  assert.equal(h.tree.type,React.Fragment);assert.equal(children.length,2);assert.equal(children[0].type,'input');
  const rail=children[1];assert.equal(rail.type,'span');assert.equal(rail.props.className,'density-separator-ticks');assert.equal(rail.props['aria-hidden'],'true');
  const ticks=React.Children.toArray(rail.props.children);assert.equal(ticks.length,13);
  assert.deepEqual(ticks.map(tick=>tick.props['data-density-tick']),Array.from({length:13},(_,index)=>index+1));
  assert.deepEqual(ticks.map(tick=>tick.props.style['--density-tick-position']),Array.from({length:13},(_,index)=>index/12));
  for(const tick of [rail,...ticks]){assert.equal(tick.type,'span');assert.equal(tick.props.tabIndex,undefined);assert.equal(tick.props.onClick,undefined);assert.equal(tick.props.onPointerDown,undefined);}
 }
});

test('a custom five-column range keeps the tick, hit area, preview and keyboard bounds in sync',()=>{
 const h=touchSlider('mobile',3,'ltr',5);
 assert.equal(h.slider.props.min,1);
 assert.equal(h.slider.props.max,5);
 assert.equal(h.slider.props.style['--density-position'],.5);
 const ticks=React.Children.toArray(React.Children.toArray(h.tree.props.children)[1].props.children);
 assert.deepEqual(ticks.map(tick=>tick.props['data-density-tick']),[1,2,3,4,5]);
 assert.deepEqual(ticks.map(tick=>tick.props.style['--density-tick-position']),[0,.25,.5,.75,1]);

 h.start();h.move(120,101);h.change(5.6);h.flush();
 assert.equal(h.input.value,'5');
 assert.equal(Number(h.styles.get('--density-position')),1);
 assert.deepEqual(h.previews,[5]);
 h.end();
 assert.deepEqual(h.commits,[5]);
 h.keyDown('ArrowRight');h.flush();h.keyUp();
 assert.equal(h.input.value,'5');
 assert.deepEqual(h.commits,[5]);
 h.keyDown('ArrowLeft');h.flush();h.keyUp();
 assert.equal(h.input.value,'4');
 assert.deepEqual(h.previews,[5,4]);
 assert.deepEqual(h.commits,[5,4]);
});

test('presentation changes cancel an unpainted range preview before RAF and ignore its later release at equal densities',()=>{
 for(const origin of ['web','mobile'])for(const raw of [7.35,7.05]){
  const h=switchingSlider(origin),other=origin==='web'?'mobile':'web';
  h.start();h.change(raw);h.move();
  assert.equal(h.frames.size,1);
  const staleFrame=[...h.frames.values()][0],oldTree=h.tree;
  h.switch();assert.equal(h.input.value,'2');assert.equal(h.frames.size,0);
  staleFrame();oldTree.props.onPointerUp({stopPropagation(){}});
  h.change(9);assert.equal(h.input.value,'2','Late native changes from the interrupted drag keep the new thumb at its own density.');
  h.end();h.tree.props.onBlur();h.flush();
  assert.deepEqual(h.previews[origin],[]);assert.deepEqual(h.previews[other],[]);
  assert.deepEqual(h.commits[origin],[]);assert.deepEqual(h.commits[other],[]);
  h.start();h.change(4);h.move();h.end();
  assert.deepEqual(h.commits[other],[4],'A deliberate new-platform drag is still available.');
  h.dispose();
 }
});

test('presentation changes restore an already painted preview through its original callback without committing either slot',()=>{
 for(const origin of ['web','mobile']){
  const h=switchingSlider(origin),other=origin==='web'?'mobile':'web';
  h.start();h.change(7.35);h.move();h.flush();h.render();
  assert.deepEqual(h.previews[origin],[7]);assert.equal(h.columns[other],2);
  h.switch();
  assert.deepEqual(h.previews[origin],[7,2]);assert.deepEqual(h.previews[other],[]);
  assert.equal(h.input.value,'2');assert.equal(h.columns[origin],2);assert.equal(h.columns[other],2);
  h.end();h.tree.props.onBlur();h.flush();
  assert.deepEqual(h.commits[origin],[]);assert.deepEqual(h.commits[other],[]);
  h.switch();assert.equal(h.input.value,'2');h.dispose();
 }
});
