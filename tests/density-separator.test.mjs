import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';

test('row slider coalesces previews and commits only the final value on release',()=>{
 const previews=[],commits=[],frames=new Map();let next=0;
 const api=sourceModule('src/components/ui/DensitySeparator.tsx',{
  react:{...React,useRef:current=>({current}),useEffect(){},startTransition:fn=>fn()},
  '../../utils/projectGridDensity':{MIN_PROJECT_GRID_COLUMNS:1,MAX_PROJECT_GRID_COLUMNS:13},'./density-separator.css':{},
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