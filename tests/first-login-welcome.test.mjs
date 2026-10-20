import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ts from 'typescript';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sourceModule} from './helpers/source-module.mjs';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function harness({blocked=false}={}){
 const storage=new Map(),written=[];
 const state=sourceModule('src/components/auth/firstLoginWelcomeState.ts',{}, {localStorage:{getItem(key){if(blocked)throw Error('blocked');return storage.get(key);},setItem(key,value){if(blocked)throw Error('blocked');storage.set(key,value);written.push(key);}}});
 let cursor=0;const slots=[];
 const react={...React,useRef(value){const i=cursor++;return slots[i]??={current:value};},useState(value){const i=cursor++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];}};
 const api=sourceModule('src/components/auth/FirstLoginWelcome.tsx',{
 react,'lucide-react':new Proxy({},{get:(_,k)=>k}), '../ui/InterfaceIcon':{InterfaceIcon:'icon'},'../ui/ModalPortal':{ModalPortal:'portal'},'../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})},'../../hooks/useModalFocus':{useModalFocus(){}},'../../presentation/mobile/MobileBackNavigation':{ScreenBack:'back'},'../../presentation/usePresentation':{usePresentation:()=> 'mobile'},'./firstLoginWelcomeState':state,'./first-login-welcome.css':{},
 });
 const render=()=>{cursor=0;const gate=api.FirstLoginWelcome({accountId:'account-a',children:React.createElement('span',null,'Profile setup')});return typeof gate.type==='function'?gate.type(gate.props):gate;};
 return{api,state,storage,written,render,all:()=>nodes(render())};
}
test('six inclusive icon screens support next, back, direct selection and finish before mounting setup',()=>{
 const h=harness();assert.equal(h.api.WELCOME_STEPS.length,6);assert.equal(h.all().some(n=>n.type==='img'),false);assert.equal(h.all().some(n=>n.props.children==='Profile setup'),false);
 const button=label=>h.all().find(n=>n.type==='button'&&(n.props['aria-label']===label||n.props.children===label));
 for(let step=0;step<6;step++){
  assert.equal(h.all().find(n=>n.type==='h1').props.children,h.api.WELCOME_STEPS[step].title);
  const next=h.all().find(n=>n.props.className==='first-welcome-next');next.props.onClick();
 }
 assert.ok(h.all().some(n=>n.props.children==='Profile setup'));assert.equal(h.written.length,1);assert.ok(h.state.hasSeenFirstLoginWelcome('account-a'));assert.equal(h.state.hasSeenFirstLoginWelcome('account-b'),false);
 const other=harness();let all=other.all();all.find(n=>n.props['aria-label']?.startsWith('Screen 4:')).props.onClick();assert.equal(other.all().find(n=>n.type==='h1').props.children,other.api.WELCOME_STEPS[3].title);
 all=other.all();all.find(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children.some(c=>c?.props?.children==='Back')).props.onClick();assert.equal(other.all().find(n=>n.type==='h1').props.children,other.api.WELCOME_STEPS[2].title);
});
test('skip and blocked storage never block setup, and completion stays account-specific',()=>{
 for(const blocked of [false,true]){const h=harness({blocked});h.all().find(n=>n.props['aria-label']==='Skip Portalink introduction').props.onClick();assert.ok(h.all().some(n=>n.props.children==='Profile setup'));assert.ok(h.state.hasSeenFirstLoginWelcome('account-a'));assert.equal(h.state.hasSeenFirstLoginWelcome('account-b'),false);}
});
test('horizontal swipe moves slides while vertical, short and cancelled gestures do not',()=>{
 const h=harness();const slide=()=>h.all().find(n=>n.props.className==='first-welcome-slide');const title=()=>h.all().find(n=>n.type==='h1').props.children;
 for(const end of [{clientX:95,clientY:100},{clientX:10,clientY:250}]){slide().props.onTouchStart({touches:[{clientX:100,clientY:100}]});slide().props.onTouchEnd({changedTouches:[end]});assert.equal(title(),h.api.WELCOME_STEPS[0].title);}
 slide().props.onTouchStart({touches:[{clientX:200,clientY:100}]});slide().props.onTouchEnd({changedTouches:[{clientX:50,clientY:100}]});assert.equal(title(),h.api.WELCOME_STEPS[1].title);
 slide().props.onTouchStart({touches:[{clientX:200,clientY:100}]});slide().props.onTouchCancel();slide().props.onTouchEnd({changedTouches:[{clientX:50,clientY:100}]});assert.equal(title(),h.api.WELCOME_STEPS[1].title);
});
test('first setup opens for verified accounts needing a profile; existing profiles and recovery are excluded',()=>{
 const text=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('App.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
 const visit=n=>{if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes("auth.isAuthenticated && onboardingStatus === 'required'"))effect=n.arguments[0];ts.forEachChild(n,visit);};visit(ast);assert.ok(effect);
 for(const [onboardingStatus,authenticated,recovery,view,expected] of [['required',true,false,null,1],['ready',true,false,null,0],['unknown',true,false,null,0],['required',false,false,null,0],['required',true,true,null,0],['required',true,false,'resetPassword',0]]){let opens=0;vm.runInNewContext(ts.transpileModule(`(${effect.getText(ast)})();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{auth:{isAuthenticated:authenticated,session:{isPasswordRecovery:recovery},pendingView:view},onboardingStatus,setIsOnboardingOpen(){opens++;}});assert.equal(opens,expected);}
 assert.match(text,/<FirstLoginWelcome key=\{auth.user\?\.id\}/);
});

test('a previously completed introduction is not replayed after remount',()=>{
 const h=harness();h.storage.set('portalink:welcome:v1:account-a','done');assert.ok(h.all().some(n=>n.props.children==='Profile setup'));assert.equal(h.all().some(n=>n.props.role==='dialog'),false);
});
