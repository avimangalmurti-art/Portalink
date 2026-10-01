import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
const load = (file, dependencies = {}, globals = {}) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../'+file, import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,
    { exports, require: name => dependencies[name] ?? new Proxy({}, {get:(_,key)=>key}), ...globals });
  return exports;
};
test('completion is explicit and survives return visits, including blocked storage in the same tab', () => {
  const values = new Map();
  const window = {localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}};
  const first = load('src/visitor/mobile/publicWelcome.ts', {}, {window});
  assert.equal(first.publicWelcomeCompleted(), false);
  first.completePublicWelcome(); assert.equal(first.publicWelcomeCompleted(), true);
  assert.equal(load('src/visitor/mobile/publicWelcome.ts', {}, {window}).publicWelcomeCompleted(), true);
  const blocked = load('src/visitor/mobile/publicWelcome.ts', {}, {window:{localStorage:{getItem(){throw Error();},setItem(){throw Error();}}}});
  assert.equal(blocked.publicWelcomeCompleted(), false); blocked.completePublicWelcome(); assert.equal(blocked.publicWelcomeCompleted(), true);
});
const nodes = tree => React.isValidElement(tree) ? [tree,...React.Children.toArray(tree.props.children).flatMap(nodes)] : [];
test('timed splash advances to live controls; completion requires View portfolio or Escape', () => {
  let intro=true, complete=0, escape;
  const appearance = {theme:'light',mode:'auto',accentColor:'#0A84FF',systemGray:'gray6',highContrast:false,reduceTranslucency:false,chooseMode(){},chooseAppearance(value){Object.assign(appearance,value);}};
  const {PublicPortfolioWelcome} = load('src/visitor/mobile/PublicPortfolioWelcome.tsx', {
    react:{...React,useState:()=>[intro,next=>{intro=next;}],useRef:()=>({current:null}),useCallback:fn=>fn,useEffect:()=>{}},
    '../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})},
    '../../hooks/useModalFocus':{useModalFocus:(_open,_ref,close)=>{escape=close;}},
  });
  const render=()=>nodes(PublicPortfolioWelcome({appearance,onComplete:()=>complete++}));
  let list=render(); const splash=list.find(n=>n.type==='PortalinkSplashLoader'); assert.equal(splash.props.timedIntro,true);
  splash.props.onComplete(); assert.equal(complete,0);
  list=render(); assert.equal(list.some(n=>n.type==='PortalinkSplashLoader'),false);
  const controls=list.find(n=>n.type==='MobileOnboardingAppearance'); assert.equal(controls.props.showPreview,false);
  controls.props.onAccentColorChange('#ff0000'); controls.props.onHighContrastChange(true);
  assert.equal(appearance.accentColor,'#ff0000');assert.equal(appearance.highContrast,true);
  list.find(n=>n.type==='button'&&n.props.children==='View portfolio').props.onClick();assert.equal(complete,1);
  escape();assert.equal(complete,2);
});
