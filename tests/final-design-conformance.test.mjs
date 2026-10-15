import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {sourceModule} from './helpers/source-module.mjs';
const {StudioReferenceChip}=sourceModule('src/features/studio/StudioReferenceChip.tsx',{react:React});
test('reference metadata hides zero/unresolved counts and renders a small neutral chip with its link action',()=>{
 for(const count of [0,-1,NaN])assert.equal(StudioReferenceChip({count,onOpen(){}}),null);
 let opens=0;const chip=StudioReferenceChip({count:2,onOpen:()=>opens++});assert.equal(chip.props['aria-label'],'Open 2 references');assert.equal(chip.props.children.props.children[0],2);assert.match(chip.props.className,/text-\[11px\]/);assert.doesNotMatch(renderToStaticMarkup(chip),/accent|rounded-full/);chip.props.onClick();assert.equal(opens,1);
});
test('Studio row omits all chip markup and zero text when references are zero',()=>{
 const react={...React,useId:()=> 'row',useRef:()=>({current:null})};
 const {StudioRow}=sourceModule('src/features/studio/StudioRow.tsx',{react,'./StudioReferenceChip':{StudioReferenceChip},'../../components/text/FormattedText':{FormattedText:()=>null},'lucide-react':{ChevronRightIcon:'right',MoreHorizontalIcon:'more'},'../../components/ui/InterfaceIcon':{InterfaceIcon:()=>null},'./useStudioRowGesture':{useStudioRowGesture:()=>({offset:0,dragging:false,close(){},handlers:{}})}});
 const row=StudioRow({id:'item',title:'Project',date:'12 Oct',referenceCount:0,onOpenReferences(){},selecting:false,selected:false,onSelect(){},onOpen(){},actions:[],onMenu(){}});
 const html=renderToStaticMarkup(row);assert.doesNotMatch(html,/references|>0</);assert.match(html,/12 Oct/);
});

test('Appearance settings contains only routed rows and no accordion toggles',()=>{
 const source=readFileSync(new URL('../src/components/settings/NavigationButtonsPanel.tsx',import.meta.url),'utf8');assert.doesNotMatch(source,/aria-expanded|aria-controls|ChevronDownIcon|AccordionSection/);assert.match(source,/onSectionOpen\?\.\('system-grey'\)/);assert.match(source,/onSectionOpen\?\.\('appearance'\)/);assert.match(source,/icon=\{ChevronRightIcon\}/);
});
