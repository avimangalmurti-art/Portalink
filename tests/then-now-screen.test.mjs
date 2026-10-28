import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function harness(presentation) {
  let cursor=0; const slots=[], calls=[];
  const react={...React,useRef:v=>({current:v}),useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=v];}};
  const exports={};
  const imports={react,'./useTimelinePairs':{useTimelinePairs:()=>({pairs:[],error:null,loading:false})}, '../../presentation/usePresentation':{usePresentation:()=>presentation}, '../../contexts/ServicesContext':{useServices:()=>({profiles:{addTimelinePair:async(id,then,now)=>calls.push([id,{thenNow:{then,now}}]),updateProfile:async()=>assert.fail('must use canonical pair creation')}})}, '../../contexts/ProfileDataContext':{useProfileData:()=>({invalidateProfiles:()=>calls.push('invalidate')})}, './journey':{journeyProjects:p=>p}, '../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})}};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/journey/ThenNowDialog.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:n=>imports[n]??new Proxy({},{get:(_,k)=>k==='__esModule'?false:k})});
  const render=()=>{cursor=0;return exports.ThenNowDialog({profile:{id:'me',projects:[{id:'a',title:'A'},{id:'b',title:'B'}]},selectedId:'a',onClose:()=>calls.push('close')});};
  return {render,calls};
}
test('pair chooser is a Back-enabled mobile screen and retains desktop dialog and shared saving',async()=>{
  for(const presentation of ['mobile','web']) {
    const h=harness(presentation); let tree=h.render();
    if(presentation==='mobile') {
      assert.equal(typeof tree.type,'function');
      const screen=tree.type(tree.props);
      assert.equal(nodes(screen).find(n=>n.type==='section').props.className,'journey-pair-screen');
      assert.ok(nodes(screen).find(n=>n.props['aria-label']==='Back'));
      assert.equal(nodes(screen).some(n=>n.props.role==='dialog'),false);
    } else assert.equal(tree.type,'ProjectFormDialog');
    const now=nodes(tree).find(n=>n.props['aria-label']==='Now project');
    now.props.onChange({target:{value:'b'}});
    tree=h.render(); nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.calls[0][0],'me');
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0][1])),{thenNow:{then:'a',now:'b'}});
    assert.deepEqual(h.calls.slice(1),['invalidate','close']);
  }
});

