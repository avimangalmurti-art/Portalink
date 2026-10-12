import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
test('all signup entries start at the single account form and Back dismisses to content', () => {
 const source=readFileSync(new URL('../src/features/auth/AuthDialog.tsx',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('export function AuthDialog'),source.indexOf('function useFormActivity'));
 for(const initialSignupStep of ['profile',undefined]){
  let closed=0;
  const exports={};
  vm.runInNewContext(ts.transpileModule(block,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,{
   exports,React,useServices:()=>({auth:{}}),useAuth:()=>({pendingView:'signUp',closeAuth:()=>closed++}),usePresentation:()=> 'mobile',
   useState:initial=>[initial,()=>{}],useRef:()=>({current:null}),useEffect:()=>{},
   AccountWelcomeSurface:'surface',mobileSignupTitles:{account:'Create account'}
  });
  const tree=exports.AuthDialog({initialSignupStep});
  assert.equal(tree.props.title,'Create account');
  assert.equal(tree.props.onStepBack,undefined);
  tree.props.onDismiss();assert.equal(closed,1);
 }
});

test('signup has no browser draft restoration and reserves Appearance for verified first sign-in',()=>{
 const source=readFileSync(new URL('../src/features/auth/AuthDialog.tsx',import.meta.url),'utf8');assert.doesNotMatch(source,/readRegistrationDraft|setRestoredResult|Restoring signup/);assert.match(source,/useState<MobileSignupStep>\('account'\)/);assert.match(source,/result\?\.requiresEmailVerification/);
});
