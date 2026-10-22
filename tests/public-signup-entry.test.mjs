import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';

const nodes=tree=>!React.isValidElement(tree)?[]:[tree,...React.Children.toArray(tree.props.children).flatMap(nodes)];

function signupParent(presentation,initialSignupStep){
 const source=readFileSync(new URL('../src/features/auth/AuthDialog.tsx',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('export function AuthDialog'),source.indexOf('function useFormActivity'));
 const states=[];let cursor=0;
 const exports={};
 vm.runInNewContext(ts.transpileModule(block,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{
  exports,React,useAuth:()=>({pendingView:'signUp',closeAuth(){},requestAuth(){}}),usePresentation:()=>presentation,
  useState:initial=>{const index=cursor++;if(!(index in states))states[index]=initial;return[states[index],next=>{states[index]=typeof next==='function'?next(states[index]):next;}];},
  useRef:()=>({current:null}),useEffect:()=>{},PortalinkSplashLoader:'welcome',EntryChoices:'choices',SignUpForm:'signup',
 });
 return()=>{cursor=0;const welcome=nodes(exports.AuthDialog({initialSignupStep})).find(node=>node.type==='welcome'),choices=welcome.props.landing.content;return {choices,form:nodes(choices).find(node=>node.type==='signup')};};
}
test('both presentations open one inline account form instead of required appearance/profile steps', () => {
 const source=readFileSync(new URL('../src/features/auth/AuthDialog.tsx',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('export function AuthDialog'),source.indexOf('function useFormActivity'));
 for(const presentation of ['mobile','web']){
  let closed=0;
  const exports={};
  vm.runInNewContext(ts.transpileModule(block,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{
   exports,React,useAuth:()=>({pendingView:'signUp',closeAuth:()=>closed++,requestAuth:()=>{}}),usePresentation:()=>presentation,
   useState:initial=>[initial,()=>{}],useRef:()=>({current:null}),useEffect:()=>{},PortalinkSplashLoader:'welcome',EntryChoices:'choices',SignUpForm:'signup',
  });
  const fragment=exports.AuthDialog({});
  const welcome=React.Children.toArray(fragment.props.children)[0];
  assert.equal(welcome.type,'welcome');
  const content=welcome.props.landing.content;
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

test('only MOBILE email verification hides providers, including restored verification and returning to account entry',()=>{
 for(const presentation of ['mobile','web']){
  const render=signupParent(presentation,'account');let entry=render();assert.equal(entry.choices.props.hideProviders,false);
  entry.form.props.onStepChange('verification');entry=render();assert.equal(entry.choices.props.hideProviders,presentation==='mobile');
  assert.equal(entry.form.props.compactEntry,true);assert.equal(entry.form.props.step,'account','The existing compact form still owns its verification content');
  entry.form.props.onStepChange('account');assert.equal(render().choices.props.hideProviders,false,'Using a different email restores the entry choices');
  assert.equal(signupParent(presentation,'verification')().choices.props.hideProviders,presentation==='mobile','A restored verification stage uses the same presentation boundary');
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
