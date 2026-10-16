import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function render(shared=false, owner=false, props={}) {
 const calls=[]; const exports={};
 const engagement={};
 const react={...React,useEffect(){},useState(){return [undefined,()=>{}];}};
 const mocks={react,'react-router-dom':{useNavigate:()=>path=>calls.push(['navigate',path]),useLocation:()=>({pathname:shared?'/share/creator':'/home',search:''})},
 '../../contexts/ServicesContext':{useServices:()=>({profiles:{getProfile:()=>{throw Error('Supplied creator must not be fetched');}}})},
 '../../contexts/AuthContext':{useAuth:()=>({isAuthenticated:!shared,viewerProfileId:owner?'creator':undefined,requestAuthenticatedDestination:(...args)=>calls.push(['account',...args])})},
 '../../features/engagement/useProjectEngagement':{useProjectEngagement:id=>{calls.push(['engagement',id]);return engagement;}},
 './ProjectPopupEngagement':{ProjectPopupEngagement:'engagement'},'../profile/CreatorAvatar':{CreatorAvatar:'avatar'},
 './FollowContentInfoPopup':{FollowContentInfoPopup:'dialog'},
 '../../features/sharing/InternalContentShare':{useInternalContentShare:()=>target=>calls.push(['share',target])},
 '../../presentation/mobile/MobileContextActions':{useMobileActions:()=>({open(){}})},
 '../../presentation/mobile/contextActions':{contextActions:(kind,viewer,target)=>({primary:Object.entries(target.handlers).filter(([,run])=>run).map(([id,run])=>({id,run})),groups:[]})},
 '../../app/routes':{buildPath:(kind,ids)=>'/'+kind+'/'+ids.profileId},
 '../../features/sharing/shareModel':{isPublicSharePath:()=>shared}};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobileProjectPopup.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>mocks[n]??{},window:{location:{origin:'https://example.com'}},URL});
 const tree=exports.MobileProjectPopup({project:{id:'work',categoryId:'portal',title:'Work',summary:'Description'},creator:{id:'creator',name:'Artist',avatar:'avatar.png'},onClose:()=>calls.push(['close']),onOpenComments:()=>calls.push(['comments']),...props});
 return {tree,calls,engagement, OwnerActions: exports.ProjectPopupOwnerActions};
}
test('project popup preserves description, canonical engagement and creator order and navigation',()=>{
 const {tree,calls,engagement}=render();assert.equal(tree.props.description,'Description');
 const details=nodes(tree.props.engagementContent);const bar=details.find(n=>n.type==='engagement');
 const identity=nodes(tree.props.creatorHeader);const creator=identity.find(n=>n.props.className==='project-popup-creator');
 assert.equal(bar.props.engagement,engagement);assert.equal(bar.props.projectId,'work');
 assert.ok(creator);assert.equal(identity.find(n=>n.type==='avatar').props.shape,'squircle');assert.equal(tree.props.title,'Work');
 bar.props.onOpenComments();assert.deepEqual(calls.slice(-2),[['close'],['comments']]);
 creator.props.onClick();assert.deepEqual(calls.slice(-2),[['close'],['navigate','/profile/creator']]);
});
test('shared project popup gates guest engagement without inventing counts',()=>{
 const {tree,calls}=render(true);const bar=nodes(tree.props.engagementContent).find(n=>n.type==='engagement');
 bar.props.onRequireAccount();assert.equal(calls.at(-1)[0],'account');assert.equal(bar.props.projectId,'work');
});

test('owner actions invoke the existing editor and confirmation callbacks after dismissing the popup', () => {
 const { OwnerActions } = render();
 for (const label of ['Project options','Edit title','Edit description','Delete project']) {
  const calls=[];
  const tree=OwnerActions({onOptions:()=>calls.push('Project options'),onClose:()=>calls.push('close'),onEditTitle:()=>calls.push('Edit title'),onEditDescription:()=>calls.push('Edit description'),onDelete:()=>calls.push('Delete project')});
  nodes(tree).find(n=>n.type==='button'&&n.props.children===label).props.onClick();
  assert.deepEqual(calls,['close',label]);
 }
 const unavailable=OwnerActions({onClose(){}});
 assert.equal(nodes(unavailable).filter(n=>n.type==='button').length,0);
});

test('cover details use the reader card without the old sheet', () => {
 for (const shared of [false,true]) assert.equal(render(shared).tree.type,'dialog');
 const source=readFileSync(new URL('../src/components/media/MobileProjectPopup.tsx',import.meta.url),'utf8');
 assert.ok(source.includes('FollowContentInfoPopup'));
 assert.ok(!source.includes('MobileProjectDescriptionSheet'));
});
test('owner commands stay available through the reader card options slot',()=>{
 const {tree,OwnerActions}=render(false,true,{onEditDescription(){}});
 assert.equal(tree.props.optionsContent.type,OwnerActions);
 assert.equal(tree.props.engagementContent.type,React.Fragment);
});
test('owner with no handlers or an empty context has no options content or callback',()=>{for(const props of [{},{contextHandlers:{}}]){const {tree}=render(false,true,props);assert.equal(tree.props.optionsContent,undefined);assert.equal(tree.props.onOptions,undefined);}});
test('owner with one edit command retains a usable menu',()=>{const {tree,OwnerActions}=render(false,true,{onEditDescription(){}});assert.ok(tree.props.optionsContent);assert.equal(nodes(OwnerActions(tree.props.optionsContent.props)).filter(n=>n.type==='button').length,1);});
