import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
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
