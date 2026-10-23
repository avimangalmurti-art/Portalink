import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
const nodes=node=>React.isValidElement(node)?[node,...React.Children.toArray(node.props.children).flatMap(nodes)]:[];
test('category previews search locally, announce unavailable for every card and return without data writes',()=>{
 const slots=[];let cursor=0,backs=0;
 const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>slots[i]=value];}};
 const {ExploreCategories}=sourceModule('src/components/home/ExploreCategories.tsx',{
 'react':react,'lucide-react':new Proxy({},{get:(_,key)=>key}),
 '../ui/InterfaceIcon':{InterfaceIcon:'icon'},'../../presentation/mobile/MobileBackNavigation':{ScreenBack:'back'},'./exploreCategories.css':{},
 });
 const render=()=>{cursor=0;return nodes(ExploreCategories({onBack:()=>backs++}));};
 const cards=()=>render().filter(n=>n.props.className==='explore-category-card');
 assert.equal(cards().length,10);
 for(const card of cards()){card.props.onClick();assert.match(render().find(n=>n.props.role==='status').props.children,/Not available yet/);}
 render().find(n=>n.type==='input').props.onChange({target:{value:'photo'}});assert.equal(cards().length,1);assert.equal(cards()[0].props.children[0].props.children,'Photography');
 render().find(n=>n.type==='input').props.onChange({target:{value:'no match'}});assert.equal(cards().length,0);assert.ok(render().some(n=>n.props.className==='explore-categories-empty'));
 render().find(n=>n.props['aria-label']==='Back to Explore').props.onClick();assert.equal(backs,1);
});
