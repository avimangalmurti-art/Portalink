import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
test('public mobile signup starts at profile and Back dismisses to content; ordinary signup retains appearance', () => {
 const source=readFileSync(new URL('../src/features/auth/AuthDialog.tsx',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('export function AuthDialog'),source.indexOf('function useFormActivity'));
 for(const initialSignupStep of ['profile',undefined]){
  let closed=0;
  const exports={};
  vm.runInNewContext(ts.transpileModule(block,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{
   exports,React,useAuth:()=>({pendingView:'signUp',closeAuth:()=>closed++}),usePresentation:()=> 'mobile',
   useState:initial=>[initial,()=>{}],useRef:()=>({current:null}),useEffect:()=>{},
   AccountWelcomeSurface:'surface',mobileSignupTitles:{profile:'Create your profile',appearance:'Choose appearance'}
  });
  const tree=exports.AuthDialog({initialSignupStep});
  assert.equal(tree.props.title,initialSignupStep==='profile'?'Create your profile':'Choose appearance');
  assert.equal(tree.props.onStepBack,undefined);
  tree.props.onDismiss();assert.equal(closed,1);
 }
});

test('restoring unfinished signup values does not skip appearance; verification still resumes', () => {
 const source=readFileSync(new URL('../src/features/auth/AuthDialog.tsx',import.meta.url),'utf8');
 const restore=source.slice(source.indexOf('void readRegistrationDraft'),source.indexOf('}, [restoreAttempt]'));
 assert.doesNotMatch(restore,/onStepChange\('account'\)/);
 assert.match(restore,/setName\(saved.registration.name\)/);
 assert.match(restore,/saved.requiresEmailVerification\) setRestoredResult/);
});
