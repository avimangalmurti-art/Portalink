import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {readFileSync} from 'node:fs';
import {sourceModule} from './helpers/source-module.mjs';
const {firstSignInStep}=sourceModule('src/features/auth/firstSignIn.ts');
const session=(extra={})=>({user:{id:'account',isEmailVerified:true,profileId:'',...extra}});
test('all newly verified identities begin with Appearance; persisted stages and returning creators do not restart it',()=>{
 assert.equal(firstSignInStep(null),null);assert.equal(firstSignInStep(session()),'appearance');assert.equal(firstSignInStep(session({onboardingStep:'project'})),'project');assert.equal(firstSignInStep(session({profileId:'profile',onboardingStep:'project'})),'project');assert.equal(firstSignInStep(session({profileId:'profile',onboardingStep:'complete'})),null);assert.equal(firstSignInStep(session({profileId:'legacy'})),null);assert.equal(firstSignInStep(session({isEmailVerified:false})),null);assert.equal(firstSignInStep({...session(),isPasswordRecovery:true}),null);
});
test('Appearance reuses the complete existing screen and profile editor keeps photo/city',()=>{
 const screen=readFileSync('src/features/profile/ProfileOnboardingDialog.tsx','utf8');assert.match(screen,/<MobileOnboardingAppearance \{\.\.\.props\}/);assert.match(screen,/Make it yours/);assert.match(screen,/data-onboarding-step=\{step/);assert.match(screen,/Skip for now/);assert.doesNotMatch(screen,/AvatarPicker|ProfileLocationPicker|readRegistrationAvatar|readRegistrationDraft/);
 const editor=readFileSync('src/features/profile/ProfileEditorDialog.tsx','utf8');assert.match(editor,/MobileProfileAvatarEditor/);assert.match(editor,/ProfileLocationPicker/);
});

function screenHarness(step='appearance',fail=false){
 const slots=[],effects=[];let cursor=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
 const react={...React,useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},useRef(initial){const index=cursor++;return slots[index]??={current:initial};},useEffect(fn,deps){const index=cursor++;if(!same(slots[index]?.deps,deps))effects.push(()=>{slots[index]?.cleanup?.();slots[index]={deps,cleanup:fn()};});}};
 const state={session:session({onboardingStep:step,displayName:'Avi',registration:{name:'Avi',handle:'avi'}}),writes:[],creates:[],exits:[]};
 const auth={get session(){return state.session;},get user(){return state.session.user;},get viewerProfileId(){return state.session.user.profileId;},isAuthenticated:true,refreshSession:async()=>true};
 const {ProfileOnboardingDialog}=sourceModule('src/features/profile/ProfileOnboardingDialog.tsx',{
 react,'../../contexts/AuthContext':{useAuth:()=>auth},'../../contexts/ServicesContext':{useServices:()=>({auth:{async updateOnboardingStep(next){if(fail)throw Error('Synthetic save failure');state.writes.push(next);state.session.user.onboardingStep=next;}},profiles:{checkPublicHandle:async()=> 'available'}})},'../../components/auth/AccountWelcomeSurface':{AccountWelcomeSurface:'surface'},'../../components/auth/MobileOnboarding':{MobileOnboardingAction:'continue',MobileOnboardingAppearance:'appearance'},'../../components/ui/Button':{Button:'add'},'../../presentation/usePresentation':{usePresentation:()=> 'mobile'},'./useProfileOnboarding':{useCreateProfile:()=>({error:null,reset(){},async run(input){state.creates.push(input);state.session.user.profileId='profile';}})},'../../utils/profileHandle':{createProfileHandle:()=> 'avi',prepareProfileHandle:async handle=>handle},'../../utils/publicAppearance':{DEFAULT_PUBLIC_APPEARANCE:{}},'../auth/firstSignIn':{firstSignInStep},'../auth/first-signin.css':{},
 });
 const nodes=tree=>!React.isValidElement(tree)?[]:[tree,...React.Children.toArray(tree.props.children).flatMap(nodes)];
 const render=()=>{cursor=0;const tree=ProfileOnboardingDialog({isOpen:true,accentColor:'#0A84FF',systemGray:'gray6',onDismiss(){},onComplete:id=>state.exits.push(['skip',id]),onAddProject:id=>state.exits.push(['add',id])});effects.splice(0).forEach(fn=>fn());return tree;};
 return{state,render,nodes,async flush(){for(let i=0;i<4;i++){render();await new Promise(resolve=>setImmediate(resolve));}return render();}};
}
test('Appearance Continue persists before advancing, and a save failure keeps the full appearance screen',async()=>{
 for(const fail of [false,true]){const h=screenHarness('appearance',fail);let tree=h.render();assert.equal(tree.props.title,'Make it yours');assert.equal(h.nodes(tree).filter(row=>row.type==='appearance').length,1);await h.nodes(tree).find(row=>row.type==='continue').props.onClick();tree=await h.flush();assert.equal(h.state.session.user.onboardingStep,fail?'appearance':'project');if(fail){assert.equal(h.state.creates.length,0);assert.ok(h.nodes(tree).find(row=>row.props.role==='alert'));}else assert.deepEqual(h.state.writes,['project']);}
});
test('after consent, automatic profile creation is reconciled once; Add and Skip persist completion before their destination',async()=>{
 for(const choice of ['skip','add']){const h=screenHarness('project');let tree=await h.flush();assert.equal(h.state.creates.length,1);assert.equal(h.state.creates[0].handle,'avi');assert.equal(h.state.creates[0].avatar,undefined);assert.equal(h.state.creates[0].location,undefined);const button=h.nodes(tree).find(row=>choice==='add'?row.type==='add':row.type==='button'&&row.props.children==='Skip for now');await button.props.onClick();await h.flush();assert.deepEqual(h.state.writes,['complete']);assert.deepEqual(h.state.exits,[[choice,'profile']]);assert.equal(h.state.creates.length,1);}
});
