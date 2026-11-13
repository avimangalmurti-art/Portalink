import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function harness(presentation, { editingPair, pairs = [], legacy, updateError, removePair } = {}) {
  let cursor=0; const slots=[], calls=[];
  const react={...React,useRef:v=>({current:v}),useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=v];}};
  const exports={};
  const profiles={
    addTimelinePair:async(id,then,now)=>calls.push(['add',id,then,now]),
    updateTimelinePair:async(...args)=>{calls.push(['update',...args]);if(updateError)throw updateError;},
    updateProfile:async(...args)=>calls.push(['legacy',...args]),
    removeTimelinePair:async(...args)=>{calls.push(['remove',...args]);await removePair?.();},
  };
  const imports={react,'./useTimelinePairs':{useTimelinePairs:()=>({pairs,error:null,loading:false})}, '../../presentation/usePresentation':{usePresentation:()=>presentation}, '../../contexts/ServicesContext':{useServices:()=>({profiles})}, '../../contexts/ProfileDataContext':{useProfileData:()=>({invalidateProfiles:()=>calls.push('invalidate')})}, './journey':{journeyProjects:p=>p}, '../../hooks/useDialogViewport':{useDialogViewport:()=>({current:null})}, '../../hooks/useModalFocus':{useModalFocus:()=>undefined}};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/journey/ThenNowDialog.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:n=>imports[n]??new Proxy({},{get:(_,k)=>k==='__esModule'?false:k})});
  const render=()=>{cursor=0;return exports.ThenNowDialog({profile:{id:'me',thenNow:legacy,projects:[{id:'a',title:'A'},{id:'b',title:'B'},{id:'c',title:'C'}]},selectedId:'a',editingPair,onClose:()=>calls.push('close')});};
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
      assert.equal(nodes(screen).find(n=>n.props.role==='dialog').props['aria-modal'],'true');
    } else assert.equal(tree.type,'ProjectFormDialog');
    const now=nodes(tree).find(n=>n.props['aria-label']==='Now project');
    now.props.onChange({target:{value:'b'}});
    tree=h.render(); nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(h.calls,[['add','me','a','b'],'invalidate','close']);
  }
});

const field = (tree, label) => nodes(tree).find(node=>node.props['aria-label']===`${label} project`);
const submit = async tree => {
  nodes(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
};

test('editing opens the selected pair prefilled and updates the same ID before closing', async () => {
  const pair = {id:'existing',then:'b',now:'c'};
  const h = harness('mobile',{editingPair:pair,pairs:[pair]});
  const initial = h.render();
  assert.equal(nodes(initial).find(node=>node.props.title==='Edit Then/Now pair').props.title,'Edit Then/Now pair');
  assert.equal(field(initial,'Then').props.value,'b');
  assert.equal(field(initial,'Now').props.value,'c');
  assert.equal(nodes(initial).find(node=>node.props.type==='submit').props.disabled,true);
  field(initial,'Now').props.onChange({target:{value:'a'}});
  await submit(h.render());
  assert.deepEqual(h.calls,[['update','me','existing','b','a',pair],'invalidate','close']);
});

test('duplicate and failed edits retain the form and preserve its choices', async () => {
  const pair = {id:'existing',then:'a',now:'b'};
  const duplicate = harness('mobile',{editingPair:pair,pairs:[pair,{id:'duplicate',then:'a',now:'c'}]});
  field(duplicate.render(),'Now').props.onChange({target:{value:'c'}});
  await submit(duplicate.render());
  assert.deepEqual(duplicate.calls,[]);
  assert.equal(nodes(duplicate.render()).find(node=>node.props.role==='alert').props.children,'This pair already exists.');
  const failed = harness('mobile',{editingPair:pair,updateError:new Error('Save unavailable')});
  field(failed.render(),'Then').props.onChange({target:{value:'c'}});
  await submit(failed.render());
  assert.equal(nodes(failed.render()).find(node=>node.props.role==='alert').props.children,'The pair could not be saved.');
  assert.equal(field(failed.render(),'Then').props.value,'c');
  assert.equal(failed.calls.length,1);
});

test('the legacy pair is edited through its existing profile field', async () => {
  const pair = {id:'legacy',then:'a',now:'b'};
  const h = harness('mobile',{editingPair:pair,legacy:{then:'a',now:'b'}});
  field(h.render(),'Now').props.onChange({target:{value:'c'}});
  await submit(h.render());
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[['legacy','me',{thenNow:{then:'a',now:'c'}}],'invalidate','close']);
});

function confirmDeletion(h) {
  const trigger = nodes(h.render()).find(node=>node.props.children==='Delete pair' && node.props.type==='button');
  trigger.props.onClick({currentTarget:{focus(){}}});
  return nodes(h.render()).find(node=>node.type==='ConfirmationDialog');
}

test('Delete pair waits for confirmation and cancels without writing', async () => {
  const pair = {id:'existing',then:'a',now:'b'};
  const h = harness('mobile',{editingPair:pair});
  field(h.render(),'Now').props.onChange({target:{value:'c'}});
  confirmDeletion(h).props.onCancel();
  assert.deepEqual(h.calls,[]);
  assert.equal(field(h.render(),'Now').props.value,'c');
  assert.equal(nodes(h.render()).some(node=>node.type==='ConfirmationDialog'),false);
  const confirmation = confirmDeletion(h);
  assert.match(confirmation.props.description,/Both projects will stay/);
  await confirmation.props.onConfirm();
  assert.deepEqual(h.calls,[['remove','me','existing'],'invalidate','close']);
});

test('a failed deletion stays in confirmation and can be retried', async () => {
  const pair = {id:'existing',then:'a',now:'b'};
  let attempts=0;
  const h = harness('mobile',{editingPair:pair,removePair:()=>{if (++attempts===1) throw 'Unavailable';}});
  await confirmDeletion(h).props.onConfirm();
  const confirmation=nodes(h.render()).find(node=>node.type==='ConfirmationDialog');
  assert.equal(confirmation.props.error,'This pair could not be removed.');
  assert.deepEqual(h.calls,[['remove','me','existing']]);
  await confirmation.props.onConfirm();
  assert.deepEqual(h.calls,[['remove','me','existing'],['remove','me','existing'],'invalidate','close']);
});

test('confirming a legacy deletion clears only the profile pair field', async () => {
  const pair = {id:'legacy',then:'a',now:'b'};
  const h = harness('mobile',{editingPair:pair,legacy:{then:'a',now:'b'}});
  await confirmDeletion(h).props.onConfirm();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[['legacy','me',{thenNow:null}],'invalidate','close']);
});

