import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';

const nodes=tree=>!React.isValidElement(tree)?[]:[tree,...React.Children.toArray(tree.props.children).flatMap(nodes)];

function signupParent(presentation,initialSignupStep){
 const source=readFileSync(new URL('../src/features/auth/AuthDialog.tsx',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('export function AuthDialog'),source.indexOf('function useFormActivity'));
 const states=[];let cursor=0;
 const exports={};
 vm.runInNewContext(ts.transpileModule(block,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{
  exports,React,hasEnteredCatalogWelcome:()=>true,CatalogWelcome:'catalog-welcome',useAuth:()=>({pendingView:'signUp',closeAuth(){},requestAuth(){}}),usePresentation:()=>presentation,
  useState:initial=>{const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],next=>{states[index]=typeof next==='function'?next(states[index]):next;}];},
  useRef:()=>({current:null}),useEffect:()=>{},PortalinkSplashLoader:'welcome',EntryChoices:'choices',SignUpForm:'signup',
 });
 return()=>{cursor=0;const welcome=nodes(exports.AuthDialog({initialSignupStep})).find(node=>node.type==='welcome'),choices=welcome.props.landing.content;return {landing:welcome.props.landing,choices,form:nodes(choices).find(node=>node.type==='signup')};};
}
test('both presentations open one inline account form instead of required appearance/profile steps', () => {
 const source=readFileSync(new URL('../src/features/auth/AuthDialog.tsx',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('export function AuthDialog'),source.indexOf('function useFormActivity'));
 for(const presentation of ['mobile','web']){
  let closed=0;
  const exports={};
  vm.runInNewContext(ts.transpileModule(block,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{
   exports,React,hasEnteredCatalogWelcome:()=>true,CatalogWelcome:'catalog-welcome',useAuth:()=>({pendingView:'signUp',closeAuth:()=>closed++,requestAuth:()=>{}}),usePresentation:()=>presentation,
   useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:()=>({current:null}),useEffect:()=>{},PortalinkSplashLoader:'welcome',EntryChoices:'choices',SignUpForm:'signup',
  });
  const fragment=exports.AuthDialog({});
  const welcome=React.Children.toArray(fragment.props.children)[0];
  assert.equal(welcome.type,'welcome');
  const content=welcome.props.landing.content;
  assert.equal(welcome.props.landing.hideMedia,true,'The email form has no Hello World header');
  assert.equal(content.props.hideProviders,true,'The email form has no provider strip');
  const form=React.Children.toArray(content.props.children.props.children).find(node=>node.type==='signup');
  assert.equal(form.props.compactEntry,true); assert.equal(form.props.step,'account');
  welcome.props.landing.onContinue();assert.equal(closed,1);
 }
});

test('restoring unfinished signup values does not skip appearance; verification still resumes', () => {
 const source=readFileSync(new URL('../src/features/auth/AuthDialog.tsx',import.meta.url),'utf8');
 const restore=source.slice(source.indexOf('void readRegistrationDraft'),source.indexOf('}, [restoreAttempt]'));
 assert.doesNotMatch(restore,/onStepChange\('account'\)/);
 assert.match(restore,/setName\(saved.registration.name\)/);
 assert.match(restore,/saved.requiresEmailVerification\) setRestoredResult/);
});

test('both presentations omit the hero and providers throughout account entry, verification and restoration',()=>{
 for(const presentation of ['mobile','web']){
  const render=signupParent(presentation,'account');let entry=render();assert.equal(entry.choices.props.hideProviders,true);assert.equal(entry.landing.hideMedia,true);
  entry.form.props.onStepChange('verification');entry=render();assert.equal(entry.choices.props.hideProviders,true);assert.equal(entry.landing.hideMedia,true);
  assert.equal(entry.form.props.compactEntry,true);assert.equal(entry.form.props.step,'account','The existing compact form still owns its verification content');
  entry.form.props.onStepChange('account');entry=render();assert.equal(entry.choices.props.hideProviders,true,'Using a different email keeps the cleaner account screen');assert.equal(entry.landing.hideMedia,true);
  const restored=signupParent(presentation,'verification')();assert.equal(restored.choices.props.hideProviders,true);assert.equal(restored.landing.hideMedia,true);
 }
});

test('verification success retains its live status and complete copy without marking ordinary success notices',()=>{
 const source=readFileSync(new URL('../src/features/auth/AuthDialog.tsx',import.meta.url),'utf8');
 const start=source.indexOf('function FormSuccess'),end=source.indexOf('/** A quiet control',start),exports={};
 vm.runInNewContext(ts.transpileModule('export '+source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{exports,React,InterfaceIcon:'icon',CheckCircle2Icon:'check'});
 for(const emailVerification of [true,false]){
  const tree=exports.FormSuccess({title:'Check your email',description:'Check creator@example.test for a confirmation link.',emailVerification}),all=nodes(tree);
  assert.equal(tree.props.role,'status');assert.equal(tree.props['data-auth-email-verification'],emailVerification||undefined);
  assert.equal(all.find(node=>'data-auth-success-title' in node.props).props.children,'Check your email');
  assert.equal(all.find(node=>'data-auth-success-description' in node.props).props.children,'Check creator@example.test for a confirmation link.');
 }
});

/** Execute the actual auth parent without mounting or calling any auth service. */
function catalogAuthParent({ presentation = 'mobile', view = 'signUp', search = '', hash = '', authenticated = false, recovery = false, state: existingState } = {}) {
 const source=readFileSync(new URL('../src/features/auth/AuthDialog.tsx',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('export function AuthDialog'),source.indexOf('function useFormActivity'));
 const state=existingState??sourceModule('src/components/auth/catalogWelcomeState.ts',{}, {window:{localStorage:{getItem:()=>null,setItem(){}}}});
 const slots=[],calls=[];let cursor=0;
 const auth={pendingView:view,isAuthenticated:authenticated,isInitializing:false,phase:authenticated?'authenticated':'guest',session:recovery?{isPasswordRecovery:true}:null,closeAuth:()=>calls.push(['close']),requestAuth:next=>calls.push(['request',next])};
 const exports={};
 vm.runInNewContext(ts.transpileModule(block,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{
  exports,React,window:{location:{search,hash}},...state,CatalogWelcome:'catalog-welcome',useAuth:()=>auth,usePresentation:()=>presentation,
  useState(initial){const index=cursor++;slots[index]??={value:typeof initial==='function'?initial():initial};return[slots[index].value,next=>{slots[index].value=typeof next==='function'?next(slots[index].value):next;}];},
  useRef:initial=>({current:initial}),useEffect(){},PortalinkSplashLoader:'welcome',EntryChoices:'choices',SignUpForm:'signup',SignInForm:'signin',ForgotPasswordForm:'forgot',ResetPasswordForm:'reset',AccountWelcomeSurface:'surface',
  titles:{signIn:'Sign in',signUp:'Create your account',forgotPassword:'Reset your password',resetPassword:'Set a new password'},mobileSignupTitles:{appearance:'Choose appearance',account:'Create account',profile:'Create your profile',verification:'Check your email'},
 });
 const props={registrationReturnPath:'/share/creator/c/work/project?page=2',showWelcomeMedia:false,accentColor:'#ff2d55'};
 return {state,auth,calls,props,render(){cursor=0;return exports.AuthDialog(props);}};
}

test('direct sign-in and signup mount their original forms immediately on both presentations',()=>{
 for(const presentation of ['mobile','web'])for(const view of ['signIn','signUp']){
  const h=catalogAuthParent({presentation,view}),entry=h.render();assert.notEqual(entry.type,'catalog-welcome');
  assert.equal(h.auth.pendingView,view);assert.deepEqual(h.calls,[]);
  if(view==='signIn'){assert.equal(entry.type,'surface');assert.equal(entry.props.title,'Sign in');assert.equal(entry.props.registrationReturnPath,h.props.registrationReturnPath);}
  else{const welcome=nodes(entry).find(node=>node.type==='welcome');assert.ok(welcome);assert.equal(welcome.props.landing.content.props.returnPath,h.props.registrationReturnPath);assert.equal(nodes(welcome.props.landing.content).some(node=>node.type==='signup'),true);}
 }
});

test('auth recovery, callbacks and signed-in forms bypass the catalog gate without changing their requested view',()=>{
 for(const presentation of ['mobile','web'])for(const change of [{view:'resetPassword'},{view:'forgotPassword'},{view:'signIn',recovery:true},{view:'signIn',authenticated:true},{view:'signUp',search:'?code=callback'},{view:'signUp',hash:'#access_token=callback'},{view:'signIn',search:'?%63ode=callback'}]){
  const h=catalogAuthParent({presentation,...change}),entry=h.render();assert.notEqual(entry.type,'catalog-welcome',`${presentation}/${JSON.stringify(change)}`);assert.equal(h.auth.pendingView,change.view);assert.deepEqual(h.calls,[]);
 }
});

test('form cancellation retains the original close action independently of optional film state',()=>{
 const first=catalogAuthParent({view:'signIn'}),entry=first.render();assert.equal(entry.type,'surface');entry.props.onDismiss();assert.deepEqual(first.calls,[['close']]);
 first.state.rememberCatalogWelcomeEntry();const second=catalogAuthParent({view:'signUp',state:first.state});assert.notEqual(second.render().type,'catalog-welcome');assert.deepEqual(second.calls,[]);
});
