import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
import {authReturnOriginFixture,officialAuthOrigin} from './helpers/auth-return-origin-fixture.mjs';
const share=sourceModule('src/features/sharing/shareModel.ts');
const validation=sourceModule('src/features/profile/validation.ts',{'../sharing/shareModel':share});
const registration=sourceModule('src/features/auth/registration.ts',{'../sharing/shareModel':share,'../profile/validation':validation});
const handles=sourceModule('src/utils/profileHandle.ts',{'../features/sharing/shareModel':share});
const {socialRegistration}=sourceModule('src/features/auth/socialRegistration.ts',{'./registration':registration,'../../utils/profileHandle':handles,'../../utils/publicAppearance':{DEFAULT_PUBLIC_APPEARANCE:{accentColor:'#0A84FF',systemGray:'gray'}}});
const user={id:'aeb6f918-a389-4b47-9f7f-a3694b5cb1e4',email:'creator@example.test',email_confirmed_at:'2026-10-15',app_metadata:{provider:'google'},user_metadata:{full_name:'New Creator',profileId:'not-an-owner'}};

test('verified social identities receive stable display defaults, never metadata ownership',()=>{
 const first=socialRegistration(user,'/share/creator?access_token=secret&page=2');
 assert.equal(first.name,'New Creator');assert.equal(first.location,'');assert.equal(first.hasAvatar,false);
 assert.equal(first.returnPath,'/share/creator?page=2');assert.equal(first.id,user.id);
 assert.equal(socialRegistration(user).handle,first.handle);assert.equal(share.validHandle(first.handle),true);
 assert.equal(first.profileId,undefined);
 assert.equal(socialRegistration({...user,email_confirmed_at:undefined}),undefined);
 assert.equal(socialRegistration({...user,app_metadata:{provider:'email'}}),undefined);
 assert.equal(socialRegistration({...user,app_metadata:{provider:'apple'},user_metadata:{}}).name,'creator');
});

test('OAuth uses the same project client and official callback with sanitized public destination',async()=>{
 const calls=[];
 const service=sourceModule('src/services/supabase/authService.ts',{
  '../../types/auth':sourceModule('src/types/auth.ts'),
  './client':{requireSupabase:()=>({auth:{signInWithOAuth:async input=>{calls.push(input);return {error:null};}}})},
  '../../utils/passwordRecoveryReturn':{},'../../features/auth/registration':registration,'../../features/auth/socialRegistration':{socialRegistration},
  '../../utils/authReturnOrigin':authReturnOriginFixture,
 },{window:{location:{origin:'https://portalink.example.test'}}}).supabaseAuthService;
 await service.signInWithOAuth('google','/share/creator?access_token=secret&page=2');
 assert.equal(calls[0].provider,'google');
 const url=new URL(calls[0].options.redirectTo);
 assert.equal(url.origin,officialAuthOrigin);assert.equal(url.pathname,'/');
 assert.equal(url.searchParams.get('onboarding_return'),'/share/creator?page=2');
 await service.signInWithOAuth('apple','https://outside.test/share/a');
 assert.equal(calls[1].options.redirectTo,officialAuthOrigin+'/?entry=oauth');
});

function agreementHarness(){
 const slots=[];let cursor=0;let controls;let disagreed=0;
 const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(){}};
 const {EntryAgreements}=sourceModule('src/components/auth/EntryAgreements.tsx',{react,'lucide-react':{ChevronLeftIcon:'chevron-left',ChevronRightIcon:'chevron-right'},'../ui/InterfaceIcon':{InterfaceIcon:'icon'},'../ui/ModalPortal':{ModalPortal:'portal'},'../../hooks/useModalFocus':{},'../../hooks/useDialogViewport':{},'./entryAgreements.css':{}});
 function render(){cursor=0;return EntryAgreements({onDisagree:()=>disagreed++,children:value=>{controls=value;return null;}});}
 function sheet(){const tree=render();return React.Children.toArray(tree.props.children).find(node=>node.props?.onAgree);}
 render();return{get controls(){return controls;},sheet,get disagreed(){return disagreed;}};
}

test('signup waits for Agree; nested requests cannot submit twice; Disagree cancels and returns to welcome',async()=>{
 const h=agreementHarness();let submissions=0;
 const pending=h.controls.request().then(yes=>{if(yes)submissions++;});
 assert.equal(submissions,0);assert.equal(await h.controls.request(),false);
 h.sheet().props.onDisagree();await pending;
 assert.equal(submissions,0);assert.equal(h.disagreed,1);
 const next=h.controls.request().then(yes=>{if(yes)submissions++;});h.sheet().props.onAgree();await next;
 assert.equal(submissions,1);h.sheet();assert.equal(await h.controls.request(),true);
});
