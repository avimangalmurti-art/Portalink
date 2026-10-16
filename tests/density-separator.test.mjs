import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
test('separator uses native keyboard/touch range and emits numeric values without visible count',()=>{
 const changes=[];const {DensitySeparator}=sourceModule('src/components/ui/DensitySeparator.tsx',{react:React,'../../utils/projectGridDensity':{MIN_PROJECT_GRID_COLUMNS:1,MAX_PROJECT_GRID_COLUMNS:13},'./density-separator.css':{}});
 const range=DensitySeparator({columns:3,onChange:v=>changes.push(v),label:'Home content per row'});
 assert.equal(range.type,'input');assert.equal(range.props.type,'range');assert.equal(range.props.min,1);assert.equal(range.props.max,13);assert.equal(range.props.step,1);assert.equal(range.props.value,3);assert.equal(range.props.children,undefined);assert.equal(range.props['aria-label'],'Home content per row');
 range.props.onChange({currentTarget:{value:'9'}});assert.deepEqual(changes,[9]);let stopped=0;range.props.onPointerDown({stopPropagation(){stopped++;}});range.props.onClick({stopPropagation(){stopped++;}});assert.equal(stopped,2);
});
