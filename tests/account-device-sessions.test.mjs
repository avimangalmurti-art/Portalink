import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,Error,Date,require:name=>{assert.ok(name in imports,`Unexpected import ${name}`);return imports[name];}});
  return exports;
}
const labels=load('../src/features/auth/sessionDeviceLabel.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const current={id:'current',userAgent:'Mozilla iPhone Safari/1',createdAt:'2026-10-12T00:00:00Z',refreshedAt:null,isCurrent:true};
const other={id:'other',userAgent:'Mozilla Windows Chrome/1',createdAt:'2026-10-11T00:00:00Z',refreshedAt:'2026-10-12T00:00:00Z',isCurrent:false};
function harness() {
  const slots=[],effects=[];let cursor=0;
  const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const react={...React,
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){return slots[cursor++]??={current:initial};},
    useCallback(fn,deps){const i=cursor++;if(!equal(slots[i]?.deps,deps))slots[i]={fn,deps};return slots[i].fn;},
    useEffect(fn,deps){const i=cursor++;if(!equal(slots[i]?.deps,deps))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});}
  };
  const state={calls:[],revocations:[],signedOut:[],busy:[],pages:[{sessions:[current,other],nextCursor:null}],failure:null,loadFailure:null,account:'a',pending:null};
  const service={
    async listAccountSessions(id,next){state.calls.push({id,next});if(state.loadFailure)throw new Error(state.loadFailure);return state.pages.shift()??{sessions:[current,other],nextCursor:null};},
    async revokeAccountSession(id,target){state.revocations.push({id,target});if(state.pending)await state.pending;if(state.failure)throw new Error(state.failure);return true;}
  };
  const component=load('../src/features/auth/AccountDeviceSessions.tsx',{
    react,'../../contexts/AuthContext':{useAuth:()=>({user:{id:state.account},async signOut(scope){state.signedOut.push(scope);return true;}})},
    '../../contexts/ServicesContext':{useServices:()=>({auth:service})},'../../components/ui/Button':{Button:'button'},
    '../../types/auth':{toAuthError:error=>({message:error.message})},'./sessionDeviceLabel':labels
  }).AccountDeviceSessions;
  const props={disabled:false,refreshKey:0,onBusyChange:value=>state.busy.push(value)};
  const render=()=>{cursor=0;const tree=component(props);effects.splice(0).forEach(fn=>fn());return tree;};
  return{state,props,render,unmount(){slots.forEach(slot=>slot?.cleanup?.());}};
}
const nodes=tree=>React.isValidElement(tree)?[tree,...React.Children.toArray(tree.props.children).flatMap(nodes)]:[];
const button=(tree,name)=>nodes(tree).find(node=>node.type==='button'&&(node.props.children===name||node.props['aria-label']===name));
test('browser labels recognize iOS browser variants and do not display arbitrary user-agent strings',()=>{
  assert.equal(labels.sessionDeviceLabel('iPhone CriOS/1 Safari/1'),'Chrome on iPhone');
  assert.equal(labels.sessionDeviceLabel('Windows Edg/1 Chrome/1'),'Edge on Windows');
  assert.equal(labels.sessionDeviceLabel('iPad FxiOS/1 Safari/1'),'Firefox on iPad');
  assert.equal(labels.sessionDeviceLabel(null),'Unknown browser and device');
  assert.equal(labels.sessionDeviceLabel('<script>unsafe</script>'),'Unknown browser on unknown device');
});
test('selecting and cancelling a device never revokes it; confirmation targets only that row',async()=>{
  const h=harness();h.render();await tick();
  button(h.render(),'Sign out Chrome on Windows').props.onClick();assert.equal(h.state.revocations.length,0);
  button(h.render(),'Cancel device sign out').props.onClick();assert.equal(h.state.revocations.length,0);
  button(h.render(),'Sign out Chrome on Windows').props.onClick();await button(h.render(),'Confirm device sign out').props.onClick();await tick();
  assert.equal(h.state.revocations.length,1);assert.equal(h.state.revocations[0].target,'other');
  assert.equal(button(h.render(),'Sign out Chrome on Windows'),undefined);
  assert.ok(button(h.render(),'Sign out Safari on iPhone, this session'));
});
test('this-session row uses local SDK logout rather than the remote-session RPC',async()=>{
  const h=harness();h.render();await tick();button(h.render(),'Sign out Safari on iPhone, this session').props.onClick();
  await button(h.render(),'Confirm device sign out').props.onClick();await tick();
  assert.deepEqual(h.state.signedOut,['local']);assert.equal(h.state.revocations.length,0);
});
test('failed revocation keeps the row and confirmation so it can be retried',async()=>{
  const h=harness();h.render();await tick();h.state.failure='Unavailable';
  button(h.render(),'Sign out Chrome on Windows').props.onClick();await button(h.render(),'Confirm device sign out').props.onClick();await tick();
  assert.ok(button(h.render(),'Sign out Chrome on Windows'));assert.ok(button(h.render(),'Confirm device sign out'));
  assert.ok(nodes(h.render()).some(node=>node.props.role==='alert'&&node.props.children==='Unavailable'));
  assert.equal(h.state.busy.at(-1),false);
});
test('duplicate confirmations are guarded and a stale completion cannot alter a new account list',async()=>{
  const h=harness();h.render();await tick();let release;h.state.pending=new Promise(resolve=>{release=resolve;});
  button(h.render(),'Sign out Chrome on Windows').props.onClick();const confirm=button(h.render(),'Confirm device sign out');
  confirm.props.onClick();confirm.props.onClick();assert.equal(h.state.revocations.length,1);
  h.state.account='b';h.render();await tick();release();await tick();
  assert.ok(button(h.render(),'Sign out Chrome on Windows'));h.unmount();
});
test('pagination appends unique rows and passes the server cursor',async()=>{
  const h=harness();const next={createdAt:other.createdAt,id:other.id};h.state.pages=[{sessions:[current,other],nextCursor:next},{sessions:[other,{...other,id:'third'}],nextCursor:null}];
  h.render();await tick();button(h.render(),'Load more sessions').props.onClick();await tick();
  assert.equal(nodes(h.render()).filter(node=>node.type==='li').length,3);assert.equal(h.state.calls[1].next.id,'other');
});
test('load failure is an error state, not an empty-session claim',async()=>{
  const h=harness();h.state.loadFailure='Could not load';h.render();await tick();
  assert.ok(nodes(h.render()).some(node=>node.props.role==='alert'));
  assert.ok(!nodes(h.render()).some(node=>node.props.children==='No signed-in sessions were found. Refresh to check again.'));
});
