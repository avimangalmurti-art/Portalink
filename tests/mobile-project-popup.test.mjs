import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { sourceModule } from './helpers/source-module.mjs';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
const { isPublicSharePath }=sourceModule('src/features/sharing/shareModel.ts',{'../../components/text/textFormatting':{plainFormattedText:value=>value}});
function render(shared=false, owner=false, props={}, authenticated=!shared, projects, hooks) {
 const calls=[]; const exports={};
 const engagement={};
 const react={...React,useEffect(){},useMemo:create=>create(),useState(){return [undefined,()=>{}];},...hooks};
 const mocks={react,'../../features/citations/publicOrigin':{PUBLIC_ORIGIN:'https://portalinknetworks.com'},'react-router-dom':{useNavigate:()=>path=>calls.push(['navigate',path]),useLocation:()=>({pathname:typeof shared==='string'?shared:shared?'/share/creator':'/home',search:''})},
 '../../contexts/ServicesContext':{useServices:()=>({projects,profiles:{getProfile:()=>{throw Error('Supplied creator must not be fetched');}}})},
 '../../contexts/AuthContext':{useAuth:()=>({isAuthenticated:authenticated,viewerProfileId:owner?'creator':undefined,loginSession:hooks?.loginSession,requestAuthenticatedDestination:(...args)=>calls.push(['account',...args])})},
 '../../features/engagement/useProjectEngagement':{useProjectEngagement:id=>{calls.push(['engagement',id]);return engagement;}},
 './ProjectPopupEngagement':{ProjectPopupEngagement:'engagement'},'../profile/CreatorAvatar':{CreatorAvatar:'avatar'},
 './FollowContentInfoPopup':{FollowContentInfoPopup:'dialog'},'../../features/projects/ProjectPortalMembershipDialog':{ProjectPortalMembershipDialog:()=>null},
 '../../features/sharing/InternalContentShare':{useInternalContentShare:()=>target=>calls.push(['share',target])},
 '../../presentation/mobile/MobileContextActions':{useMobileActions:()=>({open(){calls.push(['obsolete-options-sheet']);}})},
 '../../presentation/mobile/contextActions':{contextActions:(kind,viewer,target)=>({primary:Object.entries(target.handlers).filter(([,run])=>run).map(([id,run])=>({id,run})),groups:[]})},
 '../../app/routes':{buildPath:(kind,ids)=>kind==='sharedProject'?`/share/${ids.profileId}/c/${ids.categoryId}/${ids.projectId}`:'/'+kind+'/'+ids.profileId},
 '../../features/sharing/shareModel':{isPublicSharePath}};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/media/MobileProjectPopup.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>mocks[n]??{},window:{location:{origin:'https://example.com'}},URL});
 const tree=exports.MobileProjectPopup({project:{id:'work',categoryId:'portal',title:'Work',summary:'Description'},creator:{id:'creator',name:'Artist',avatar:'avatar.png'},onClose:()=>calls.push(['close']),onOpenComments:()=>calls.push(['comments']),...props});
 return {tree,calls,engagement, OwnerActions: exports.ProjectPopupOwnerActions};
}
test('project popup preserves description, canonical engagement and creator order and navigation',()=>{
 const {tree,calls,engagement}=render();assert.equal(tree.props.description,'Description');
 const details=nodes(tree.props.engagementContent);const bar=details.find(n=>n.type==='engagement');
 const identity=nodes(tree.props.creatorHeader);const creator=identity.find(n=>n.props.className==='project-popup-creator');
 assert.equal(bar.props.engagement,engagement);assert.equal(bar.props.projectId,'work');
 assert.equal(bar.props.url,'https://portalinknetworks.com/share/creator/c/portal/work');
 assert.equal(tree.props.showEngagement,true);assert.deepEqual(calls.filter(call=>call[0]==='engagement'),[['engagement','work']]);
 assert.ok(creator);assert.equal(identity.find(n=>n.type==='avatar').props.shape,'squircle');assert.equal(tree.props.title,'Work');
 bar.props.onOpenComments();assert.deepEqual(calls.slice(-2),[['close'],['comments']]);
 creator.props.onClick();assert.deepEqual(calls.slice(-2),[['close'],['navigate','/profile/creator']]);
});
test('public catalogue and Timeline details omit engagement for guests and signed-in readers while preserving information',()=>{
 for(const path of ['/share/creator','/share/creator/c/portal/work','/portalite','/portalite/c/portal/work']) for(const authenticated of [false,true]) {
  const {tree,calls}=render(path,true,{},authenticated);
  assert.equal(tree.props.showEngagement,false);assert.equal(tree.props.engagementContent,undefined);
  assert.deepEqual(calls.filter(call=>call[0]==='engagement'),[['engagement',null]],'Public information does not resolve an engagement record.');
  assert.equal(tree.props.title,'Work');assert.equal(tree.props.description,'Description');assert.equal(tree.props.optionsContent,undefined);
  const identity=nodes(tree.props.creatorHeader);assert.ok(identity.some(node=>node.type==='avatar'));
  identity.find(node=>node.props.className==='project-popup-creator').props.onClick();
  assert.deepEqual(calls.slice(-2),[['close'],['navigate','/sharedProfile/creator']]);
  assert.equal(calls.some(call=>call[0]==='account'),false);
 }
});

test('owner actions invoke the existing editor and confirmation callbacks after dismissing the popup', () => {
 const { OwnerActions } = render();
 for (const label of ['Edit project','Delete project']) {
  const calls=[];
  const tree=OwnerActions({onClose:()=>calls.push('close'),onOptions:()=>assert.fail('The alternate options command must not run'),onEditTitle:()=>calls.push('Edit project'),onEditDescription:()=>assert.fail('The description shortcut must not run'),onDelete:()=>calls.push('Delete project')});
  const buttons=nodes(tree).filter(n=>n.type==='button');
  assert.deepEqual(buttons.map(n=>n.props.children),['Edit project','Delete project']);
  assert.equal(buttons[0].props['data-destructive'],undefined);
  assert.equal(buttons[1].props['data-destructive'],true);
  buttons.find(n=>n.props.children===label).props.onClick();
  assert.deepEqual(calls,['close',label]);
 }
 const unavailable=OwnerActions({onClose(){}});
 assert.equal(nodes(unavailable).filter(n=>n.type==='button').length,0);
});

test('cover details retain their description card without a generic project-options opener', () => {
 for (const shared of [false,true]) {
  const {tree,calls}=render(shared,false,{contextHandlers:{share(){},copy(){},saveProject(){}}});
  assert.equal(tree.type,'dialog');assert.equal(tree.props.title,'Work');assert.equal(tree.props.description,'Description');
  assert.equal(tree.props.onOptions,undefined);assert.equal(tree.props.optionsContent,undefined);
  assert.equal(calls.some(call=>call[0]==='obsolete-options-sheet'),false);
 }
});
test('owner commands stay available through the reader card options slot',()=>{
 const {tree,OwnerActions}=render(false,true,{onEditDescription(){}});
 assert.equal(tree.props.optionsContent.type,OwnerActions);
 assert.equal(tree.props.engagementContent.type,React.Fragment);
});
test('owner with no handlers or an empty context has no options content or callback',()=>{for(const props of [{},{contextHandlers:{}}]){const {tree}=render(false,true,props);assert.equal(tree.props.optionsContent,undefined);assert.equal(tree.props.onOptions,undefined);}});
test('owner with one edit command retains a usable Edit project menu',()=>{
 const commands=[];
 const {tree,OwnerActions,calls}=render(false,true,{onEditDescription:()=>commands.push('edit')});
 assert.ok(tree.props.optionsContent);
 const buttons=nodes(OwnerActions(tree.props.optionsContent.props)).filter(n=>n.type==='button');
 assert.deepEqual(buttons.map(n=>n.props.children),['Edit project']);
 buttons[0].props.onClick();assert.deepEqual(calls.at(-1),['close']);assert.deepEqual(commands,['edit']);
});

test('Timeline owner Edit project retains its original full editor fallback without duplicate rows',()=>{
 const commands=[];
 const {tree,OwnerActions,calls}=render(false,true,{onOptions:()=>commands.push('full-project-editor'),onEditDescription:()=>assert.fail('The description shortcut must not replace the full editor'),contextHandlers:{delete:()=>commands.push('delete')}});
 assert.equal(tree.props.onOptions,undefined,'The information surface does not receive a generic options callback');
 const buttons=nodes(OwnerActions(tree.props.optionsContent.props)).filter(node=>node.type==='button');
 assert.deepEqual(buttons.map(node=>node.props.children),['Edit project','Delete project']);
 buttons.find(node=>node.props.children==='Edit project').props.onClick();
 assert.deepEqual(calls.at(-1),['close']);assert.deepEqual(commands,['full-project-editor']);
 assert.equal(calls.some(call=>call[0]==='obsolete-options-sheet'),false);
});

test('index owner Edit project prioritizes the full editor over anchored options and description shortcuts',()=>{
 const commands=[];
 const {tree,OwnerActions,calls}=render(false,true,{onOptions:()=>assert.fail('The old Project options row must not open its anchored menu'),onEditDescription:()=>assert.fail('The separate description command must not run'),contextHandlers:{edit:()=>commands.push('full-project-editor'),delete:()=>commands.push('delete')}});
 assert.equal(tree.props.onOptions,undefined);
 const buttons=nodes(OwnerActions(tree.props.optionsContent.props)).filter(node=>node.type==='button');
 assert.deepEqual(buttons.map(node=>node.props.children),['Edit project','Delete project']);
 buttons.find(node=>node.props.children==='Edit project').props.onClick();
 assert.deepEqual(calls.at(-1),['close']);assert.deepEqual(commands,['full-project-editor']);
});

test('owner context callbacks keep confirmed deletion without generic curation options',()=>{
 const commands=[];
 const {tree,OwnerActions,calls}=render(false,true,{contextHandlers:{edit:()=>commands.push('edit'),delete:()=>commands.push('delete'),cover(){throw Error('Obsolete cover menu should not run');},startHere(){},thenNow(){},reads(){}}});
 assert.equal(tree.props.onOptions,undefined);
 const buttons=nodes(OwnerActions(tree.props.optionsContent.props)).filter(node=>node.type==='button');
 assert.deepEqual(buttons.map(node=>node.props.children),['Edit project','Delete project']);
 const deletion=buttons.find(node=>node.props.children==='Delete project');assert.equal(deletion.props['data-destructive'],true);
 deletion.props.onClick();assert.deepEqual(commands,['delete']);assert.deepEqual(calls.at(-1),['close']);
});

test('visitor and shared details never expose owner commands even if callbacks were supplied',()=>{
 for(const [shared,owner] of [[false,false],[true,false],[true,true]]){
  const unavailable=()=>assert.fail('A visitor must not invoke owner commands');
  const {tree,calls}=render(shared,owner,{onOptions:unavailable,onEditDescription:unavailable,contextHandlers:{edit:unavailable,delete:unavailable}});
  assert.equal(tree.props.optionsContent,undefined);assert.equal(tree.props.onOptions,undefined);
  assert.equal(calls.some(call=>call[0]==='obsolete-options-sheet'),false);
 }
});

test('only the signed-in owner can open Portal placement from between Edit and Delete', () => {
 const projects = {
  getPortalMemberships() { assert.fail('Opening project options must not fetch memberships.'); },
  setPortalMemberships() { assert.fail('Opening project options must not save memberships.'); },
 };
 const props = { contextHandlers: { edit() {}, delete() {} } };
 const { tree, OwnerActions } = render(false, true, props, true, projects);
 const menu = OwnerActions(tree.props.optionsContent.props);
 const [edit, feature, deleteProject] = React.Children.toArray(menu.props.children);
 assert.equal(edit.props.children, 'Edit project');
 assert.equal(feature.type(feature.props).props.children[0].props.children, 'Feature in Portals');
 assert.equal(feature.props.project.id, 'work');
 assert.equal(deleteProject.props.children, 'Delete project');
 for (const [shared, owner] of [[true, true], [false, false]]) {
  assert.equal(render(shared, owner, props, true, projects).tree.props.optionsContent, undefined);
 }
});

function membershipHarness(probe) {
 const states = [], effects = [], memos = [];
 let stateIndex, effectIndex, memoIndex;
 const same = (previous, current) => previous?.every((value, index) => Object.is(value, current[index]));
 const hooks = {
  loginSession: {},
  useState() {
   const index = stateIndex++;
   return [states[index], value => { states[index] = value; }];
  },
  useMemo(create, deps) {
   const index = memoIndex++;
   if (!same(memos[index]?.deps, deps)) memos[index] = { deps, value: create() };
   return memos[index].value;
  },
  useEffect(create, deps) {
   const index = effectIndex++;
   if (same(effects[index]?.deps, deps)) return;
   effects[index]?.dispose?.();
   effects[index] = { deps, dispose: create() };
  },
 };
 const projects = {
  getPortalMemberships() { assert.fail('The options menu must not read Portal placements.'); },
  setPortalMemberships() { assert.fail('The options menu must not change Portal placements.'); },
  isPortalMembershipAvailable: probe,
 };
 const { tree, OwnerActions } = render(false, true, { contextHandlers: { edit() {}, delete() {} } }, true, projects, hooks);
 const feature = React.Children.toArray(OwnerActions(tree.props.optionsContent.props).props.children)[1];
 return {
  render(project = feature.props.project) {
   stateIndex = effectIndex = memoIndex = 0;
   return feature.type({ project });
  },
  newLogin() { hooks.loginSession = {}; },
  unmount() { effects.forEach(effect => effect.dispose?.()); },
 };
}

test('the owner menu hides Portal placement while checking and while the membership table is absent', async () => {
 let tested = 0;
 const menu = membershipHarness(async () => { tested++; return false; });
 assert.equal(tested, 0, 'A closed owner menu does not probe Supabase.');
 assert.equal(menu.render(), null);
 await Promise.resolve();
 assert.equal(menu.render(), null);
 assert.equal(tested, 1);
 menu.unmount();

 const reopened = membershipHarness(async () => true);
 assert.equal(reopened.render(), null);
 await Promise.resolve();
 assert.equal(reopened.render().props.children[0].props.children, 'Feature in Portals');
 reopened.unmount();
});

test('stale availability for an old project or login does not reach the owner menu', async () => {
 const polls = [];
 const menu = membershipHarness(() => new Promise(resolve => polls.push(resolve)));
 const another = { id: 'another', title: 'Another', profileId: 'creator' };
 assert.equal(menu.render(), null);
 assert.equal(menu.render(another), null);
 polls[0](true);
 await Promise.resolve();
 assert.equal(menu.render(another), null);
 polls[1](true);
 await Promise.resolve();
 const feature = menu.render(another).props.children[0];
 feature.props.onClick();
 assert.ok(menu.render(another).props.children[1]);
 menu.newLogin();
 assert.equal(menu.render(another), null);
 polls[2](true);
 await Promise.resolve();
 assert.equal(menu.render(another).props.children[1], false);
 menu.unmount();
});

test('a transient availability error leaves the Portal placement action available for normal retry', async () => {
 const menu = membershipHarness(async () => { throw Error('Temporary network failure'); });
 assert.equal(menu.render(), null);
 await Promise.resolve();
 assert.equal(menu.render().props.children[0].props.children, 'Feature in Portals');
 menu.unmount();
});
