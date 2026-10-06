import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function render(shared=false) {
 const calls=[]; const exports={};
 const engagement={};
 const react={...React,useEffect(){},useState(){return [undefined,()=>{}];}};
 const mocks={react,'react-router-dom':{useNavigate:()=>path=>calls.push(['navigate',path]),useLocation:()=>({pathname:shared?'/share/creator':'/home',search:''})},
 '../../contexts/ServicesContext':{useServices:()=>({profiles:{getProfile:()=>{throw Error('Supplied creator must not be fetched');}}})},
 '../../contexts/AuthContext':{useAuth:()=>({isAuthenticated:!shared,requestAuthenticatedDestination:(...args)=>calls.push(['account',...args])})},
 '../../features/engagement/useProjectEngagement':{useProjectEngagement:id=>{calls.push(['engagement',id]);return engagement;}},
 '../../features/engagement/EngagementBar':{EngagementBar:'engagement'},'../profile/CreatorAvatar':{CreatorAvatar:'avatar'},
 './MobileProjectDescriptionSheet':{MobileProjectDescriptionSheet:'dialog'},
 '../../features/sharing/InternalContentShare':{useInternalContentShare:()=>target=>calls.push(['share',target])},
 '../../presentation/mobile/MobileContextActions':{useMobileActions:()=>({open(){}})},
 '../../presentation/mobile/contextActions':{contextActions:()=>({})},
 '../../app/routes':{buildPath:(kind,ids)=>'/'+kind+'/'+ids.profileId},
 '../../features/sharing/shareModel':{isPublicSharePath:()=>shared}};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobileProjectPopup.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>mocks[n]??{},window:{location:{origin:'https://example.com'}},URL});
 const tree=exports.MobileProjectPopup({project:{id:'work',categoryId:'portal',title:'Work',summary:'Description'},creator:{id:'creator',name:'Artist',avatar:'avatar.png'},onClose:()=>calls.push(['close']),onOpenComments:()=>calls.push(['comments'])});
 return {tree,calls,engagement};
}
test('project popup preserves description, canonical engagement and creator order and navigation',()=>{
 const {tree,calls,engagement}=render();assert.equal(tree.props.description,'Description');
 const details=nodes(tree.props.details);const bar=details.find(n=>n.type==='engagement');
 const creator=details.find(n=>n.props.className==='project-popup-creator');
 assert.equal(bar.props.engagement,engagement);assert.equal(bar.props.showCounts,true);
 assert.ok(details.indexOf(bar)<details.indexOf(creator));assert.equal(details.find(n=>n.type==='avatar').props.shape,'squircle');
 creator.props.onClick();assert.deepEqual(calls.slice(-2),[['close'],['navigate','/profile/creator']]);
});
test('shared project popup gates guest engagement without inventing counts',()=>{
 const {tree,calls}=render(true);const bar=nodes(tree.props.details).find(n=>n.type==='engagement');
 bar.props.onRequireAccount();assert.equal(calls.at(-1)[0],'account');assert.equal(bar.props.showCounts,true);
});
