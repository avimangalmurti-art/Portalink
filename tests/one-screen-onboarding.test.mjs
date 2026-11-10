import assert from 'node:assert/strict';
import test from 'node:test';
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
