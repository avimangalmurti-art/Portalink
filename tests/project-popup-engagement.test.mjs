import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
test('engagement selection stays inline and project Share is absent',()=>{
 let cursor=0; const state=[]; const exports={};
 const react={...React,useEffect(){},useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];}};
 const mocks={'react':react,'../../features/engagement/EngagementBar':{EngagementBar:'engagement'},'../../features/comments/useProjectComments': {useProjectComments:()=>({phase:'ready',totalCount:3})}, '../../contexts/ServicesContext':{useServices:()=>({engagement:{}})},'../../features/sharing/InternalContentShare':{InternalContentShareDialog:'sender'},'../profile/CreatorAvatar':{CreatorAvatar:'avatar'}};
 const source=readFileSync(new URL('../src/components/media/ProjectPopupEngagement.tsx',import.meta.url),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:name=>mocks[name]??{}});
 const render=()=>{cursor=0;return exports.ProjectPopupEngagement({projectId:'work',projectTitle:'Work',url:'/share/work',engagement:{isPending:()=>false,count:()=>2}});};
 let tree=render();nodes(tree).find(n=>n.type==='engagement').props.onSelectAction('like');
 tree=render();assert.equal(nodes(tree).find(n=>n.type==='section').props['aria-label'],'Likes');
 assert.equal(nodes(tree).find(n=>n.type==='engagement').props.onShare, undefined);
 assert.equal(nodes(tree).some(n=>n.type==='sender'), false);
});
