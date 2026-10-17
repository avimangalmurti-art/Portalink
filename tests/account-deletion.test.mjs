import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { deferred, hookHarness } from './helpers/hook-harness.mjs';

const compile = (path) => ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

test('production endpoint is unconditionally disabled without constructing clients or touching data', async () => {
  let handler;
  vm.runInNewContext(compile('supabase/functions/delete-account/index.ts'), {
    exports: {}, Response, Deno: { serve: fn => { handler = fn; } },
    require: () => { throw new Error('Disabled endpoint must not import a client'); },
  });
  for (const body of [{}, { action: 'request', confirmation: 'owner@example.test' }]) {
    const result=await handler(new Request('https://example.test/delete-account',{method:'POST',body:JSON.stringify(body)}));
    assert.equal(result.status,503); assert.equal((await result.json()).isDeleted,false);
  }
  assert.equal((await handler(new Request('https://example.test/delete-account',{method:'OPTIONS'}))).status,200);
});

function authService(client, enabled = true, options = {}) {
  const saved = options.saved ?? new Map([['portalink.deletion-receipt.v1:a', JSON.stringify({ accountId:'a',receipt:'a'.repeat(64) })]]);
  const storage = { getItem:key=>saved.get(key)??null, setItem:(key,value)=>{if(options.storageBlocked)throw Error('blocked');saved.set(key,value);},removeItem:key=>saved.delete(key) };
  client.auth ??= {};
  client.auth.getSession ??= async()=>({data:{session:client.auth.getUser?{user:{id:'a'},access_token:'verified-a-token'}:null},error:null});
  const authTypes = {};
  vm.runInNewContext(compile('src/types/auth.ts'), { exports: authTypes });
  const exports = {};
  vm.runInNewContext(compile('src/services/supabase/authService.ts'), { exports, Response, localStorage:storage, require(name) {
    if (name === './client') return { accountDeletionEnabled: enabled, requireSupabase: () => client, clearDeletedAccountStorage: () => client.clearStorage?.() };
    if (['./googleHandoff','./legacyLaunchCompletion','./adultLaunch','../../features/auth/socialRegistration'].includes(name)) return {};
    if (name.endsWith('/features/auth/registration')) return { readRegistrationProfile: () => undefined };
    if (name.endsWith('/types/auth')) return authTypes;
    if (name.endsWith('/utils/passwordRecoveryReturn')) return {};
    throw new Error(name);
  } });
  return exports.supabaseAuthService;
}
test('client starts deletion only for its verified account and retains identity until completion', async () => {
 const calls=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'a',email:'owner@example.test'}}}),signOut:async()=>{throw Error('Must keep session');}},functions:{invoke:async(name,options)=>{calls.push(options.body);return {data:{status:'processing',isDeleted:false}};}}};
 await assert.rejects(authService(client).deleteAccount({accountId:'other',confirmation:'owner@example.test'}));
 await assert.rejects(authService(client).deleteAccount({accountId:'a',confirmation:'another@example.test'}));
 assert.equal(calls.length,0);
 const result=await authService(client).deleteAccount({accountId:'a',confirmation:'owner@example.test'});
 assert.equal(result.isDeleted,false);assert.equal(result.status,'processing');assert.equal(calls[0].action,'request');
 assert.equal(calls[0].accountId,undefined,'The verified provider identity remains authoritative at the endpoint.');
 assert.match(result.message,/Deletion in progress/);
 assert.match(result.message,/email becomes available after deletion is complete/);
 assert.equal(authService(client).cancelAccountDeletion,undefined);
 await assert.rejects(authService(client,false).deleteAccount({accountId:'a',confirmation:'owner@example.test'}));
 assert.equal(calls.length,1);
});

test('client keeps server error details and does not sign out on a failed deletion', async () => {
  let signedOut = false;
  const service = authService({ auth: {
    getUser: async () => ({ data: { user: { id: 'a', email: 'owner@example.com' } } }),
    signOut: async () => { signedOut = true; },
  }, functions: { invoke: async () => ({ error: { context: Response.json({ message: 'Sign in again.' }, { status: 401 }) } }) } });
  await assert.rejects(service.deleteAccount({ accountId: 'a', confirmation: 'owner@example.com' }), (error) => error.code === 'reauthentication_required' && error.message === 'Sign in again.');
  assert.equal(signedOut, false);
});

test('confirmation cannot bypass unavailable capability or submit the deletion twice', async () => {
  const capability = deferred();
  const deletion = deferred();
  let calls = 0;
  const h = hookHarness(new URL('../src/features/auth/useAccountDeletion.ts', import.meta.url), 'useAccountDeletion', { auth: {
    getAccountDeletionCapability: () => capability.promise,
    deleteAccount: () => { calls++; return deletion.promise; },
  } }, {}, { accountId: 'a', accountEmail: 'owner@example.com' });
  await h.flush();
  h.value.setConfirmation('owner@example.com');
  assert.equal(h.value.submit(), false);
  capability.resolve({ isAvailable: true, removes: [] });
  await h.flush();
  assert.equal(h.value.submit(), true);
  assert.equal(h.value.submit(), false);
  assert.equal(calls, 1);
  deletion.resolve({ isDeleted: true, status: 'completed', message: 'Deleted.' });
  await h.flush();
  assert.equal(h.value.submit(), false);
  assert.equal(calls, 1);
  h.dispose();
});

test('retry revalidates confirmation, and reset clears previously typed consent', async () => {
  let calls = 0;
  const h = hookHarness(new URL('../src/features/auth/useAccountDeletion.ts', import.meta.url), 'useAccountDeletion', { auth: {
    getAccountDeletionCapability: async () => ({ isAvailable: true, removes: [] }),
    deleteAccount: async () => { calls++; throw new Error('offline'); },
  } }, {}, { accountId: 'a', accountEmail: 'owner@example.com' });
  await h.flush();
  h.value.setConfirmation('owner@example.com');
  h.value.submit();
  await h.flush();
  h.value.setConfirmation('other@example.com');
  assert.equal(h.value.retry(), false);
  assert.equal(calls, 1);
  h.value.setConfirmation('owner@example.com');
  h.value.reset();
  assert.equal(h.value.confirmation, '');
  assert.equal(h.value.canSubmit, false);
  h.dispose();
});

test('processing deletion survives dismissal, cannot be resubmitted, and exposes no cancellation', async () => {
  let deletes=0;
  const authTypes={};
  vm.runInNewContext(compile('src/types/auth.ts'),{exports:authTypes,Error});
  const auth={
    getAccountDeletionCapability:async()=>({isAvailable:true,removes:[]}),
    getAccountDeletionStatus:async()=>({isDeleted:false,status:'processing',message:'Deletion in progress.'}),
    deleteAccount:async()=>{deletes++;return {isDeleted:false,status:'processing',message:'Deletion in progress.'};},
  };
  const h=hookHarness(new URL('../src/features/auth/useAccountDeletion.ts',import.meta.url),'useAccountDeletion',{auth},{},{accountId:'a',accountEmail:'owner@example.test'},undefined,{'../../types/auth':authTypes});
  await h.flush();await h.value.refreshStatus();await h.flush();
  h.value.reset();await h.flush();assert.equal(h.value.result.status,'processing');assert.equal(h.value.canSubmit,false);
  h.value.setConfirmation('owner@example.test');await h.flush();
  assert.equal(h.value.canSubmit,false);assert.equal(h.value.submit(),false);assert.equal(h.value.retry(),false);assert.equal(deletes,0);
  assert.equal(h.value.cancel,undefined);
  auth.getAccountDeletionStatus=async()=>null;
  await h.value.refreshStatus();await h.flush();assert.equal(h.value.result.status,'processing');
  auth.getAccountDeletionStatus=async()=>{throw new authTypes.AuthServiceError('network','offline');};
  await h.value.refreshStatus();await h.flush();assert.equal(h.value.result.status,'processing');assert.equal(h.value.result.isDeleted,false);assert.equal(h.value.error.message,'offline');
  auth.getAccountDeletionStatus=async()=>({isDeleted:true,status:'completed',message:'Deleted.'});
  await h.value.refreshStatus();await h.flush();assert.equal(h.value.result.isDeleted,true);assert.equal(h.value.result.status,'completed');
  h.dispose();
});

function component(file, name, props) {
  let cursor = 0;
  const state = [];
  const exports = {};
  vm.runInNewContext(compile(file), { exports, require(dependency) {
    if (dependency === 'react/jsx-runtime') return jsxRuntime;
    if (dependency === 'react') return { ...React, useEffect() { /* Render-only Appearance fixture does not run lifecycle effects. */ }, useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    } };
    if (dependency.endsWith('navButtonTokens')) return {
      findNavAccent: () => ({ label: 'Pink', dark: '#ff375f', light: '#ff375f' }),
      findSystemGray: () => ({ label: 'System Gray 6' }), navAccents: [], systemGrays: [],
    };
    if (dependency === 'framer-motion') return { useReducedMotion: () => true };
    return new Proxy({}, { get: (_, key) => key });
  } });
  return () => { cursor = 0; return exports[name](props); };
}
function nodes(tree) {
  return !tree || typeof tree !== 'object' ? [] : [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)];
}
test('Appearance rows request routed controls without local expansion', () => {
 const opened=[],props={theme:'dark',appearanceMode:'dark',accentColor:'#ff375f',selectedSection:null,onSectionOpen:id=>opened.push(id)};
 const render=component('src/components/settings/NavigationButtonsPanel.tsx','NavigationButtonsPanel',props);
 const choices=()=>nodes(render()).filter(node=>node.props?.section&&node.props?.onOpen);
 assert.equal(choices().length,2);assert.ok(choices().every(node=>node.props.active===null));
 const row=choices()[1],button=nodes(row.type(row.props)).find(node=>node.type==='button');
 assert.equal(button.props['aria-expanded'],undefined);button.props.onClick();assert.deepEqual(opened,['appearance']);assert.ok(choices().every(node=>node.props.active===null));
 props.selectedSection='appearance';assert.equal(choices()[0].type(choices()[0].props),null);assert.ok(choices()[1].type(choices()[1].props));
});
test('client accepts completed deletion only with explicit server confirmation',async()=>{
 const client={auth:{getUser:async()=>({data:{user:{id:'a',email:'owner@example.test'}}})},functions:{invoke:async()=>({data:{status:'completed',isDeleted:true}})}};
 const result=await authService(client).deleteAccount({accountId:'a',confirmation:'owner@example.test'});
 assert.equal(result.isDeleted,true);assert.equal(result.status,'completed');
 client.functions.invoke=async()=>({data:{status:'completed',isDeleted:false}});
 await assert.rejects(authService(client).deleteAccount({accountId:'a',confirmation:'owner@example.test'}));
 client.functions.invoke=async()=>({data:{status:'processing'}});
 assert.equal((await authService(client).deleteAccount({accountId:'a',confirmation:'owner@example.test'})).isDeleted,false);
 for(const data of [{isDeleted:true},{status:'processing',isDeleted:true},{status:'pending',isDeleted:false},{status:'cancelled',isDeleted:false}]){
  client.functions.invoke=async()=>({data});
  await assert.rejects(authService(client).deleteAccount({accountId:'a',confirmation:'owner@example.test'}));
 }
});

test('status reads confirm completion with both markers and never expose a cancellation contract',async()=>{
 const calls=[];
 const client={functions:{invoke:async(name,options)=>{calls.push(options.body);return {data:{status:'completed',isDeleted:true}};}}};
 const service=authService(client);
 assert.equal((await service.getAccountDeletionStatus('a')).isDeleted,true);
 assert.equal(calls.length,1);assert.equal(calls[0].action,'status');
 assert.equal(service.cancelAccountDeletion,undefined);
 for(const data of [{status:'completed',isDeleted:false},{isDeleted:true},{status:'processing',isDeleted:true}]){
  client.functions.invoke=async()=>({data});
  await assert.rejects(service.getAccountDeletionStatus('a'));
 }
 client.functions.invoke=async()=>({data:{status:'processing',isDeleted:false,message:'Email is already free.'}});
 const progressing=await service.getAccountDeletionStatus('a');
 assert.equal(progressing.isDeleted,false);assert.equal(progressing.status,'processing');
 assert.doesNotMatch(progressing.message,/already free/);
 client.functions.invoke=async()=>({data:{status:'none'}});
 assert.equal(await service.getAccountDeletionStatus('a'),null);
});

test('status checks are single-flight and preserve completed deletion against late progress',async()=>{
 const pending=deferred();let checks=0;
 const auth={getAccountDeletionCapability:async()=>({isAvailable:true,removes:[]}),
  getAccountDeletionStatus:()=>{checks++;return pending.promise;},
 };
 const h=hookHarness(new URL('../src/features/auth/useAccountDeletion.ts',import.meta.url),'useAccountDeletion',{auth},{},{accountId:'a',accountEmail:'owner@example.test'});
 await h.flush();h.value.setConfirmation('owner@example.test');await h.flush();
 const checking=h.value.refreshStatus();void h.value.refreshStatus();await h.flush();
 assert.equal(checks,1);assert.equal(h.value.isCheckingStatus,true);assert.equal(h.value.canSubmit,false);
 pending.resolve({isDeleted:true,status:'completed',message:'Deleted.'});await checking;await h.flush();
 assert.equal(h.value.isCheckingStatus,false);assert.equal(h.value.result.isDeleted,true);
 auth.getAccountDeletionStatus=async()=>({isDeleted:false,status:'processing',message:'Deletion in progress.'});
 await h.value.refreshStatus();await h.flush();assert.equal(h.value.result.isDeleted,true);
 h.dispose();
});

test('client saves a prepared receipt before consent submission and recovers a lost reply after Auth removal',async()=>{
 const saved=new Map(),calls=[],receipt='b'.repeat(64);let accepted=false;
 const client={auth:{getUser:async()=>({data:{user:{id:'a',email:'owner@example.test'}}})},functions:{invoke:async(_name,{body})=>{
  calls.push(body);
  if(body.action==='prepare')return {data:{status:'prepared',receipt}};
  if(body.action==='request'){assert.equal(JSON.parse(saved.get('portalink.deletion-receipt.v1:a')).receipt,receipt);accepted=true;return {error:{context:Response.json({message:'Reply lost.'},{status:503})}};}
  assert.equal(accepted,true);assert.equal(body.receipt,receipt);return {data:{status:'completed',isDeleted:true}};
 }}};
 await assert.rejects(authService(client,true,{saved}).deleteAccount({accountId:'a',confirmation:'owner@example.test'}));
 assert.equal(saved.size,2);client.auth.getUser=async()=>{throw Error('Auth account was removed');};client.auth.getSession=async()=>({data:{session:null},error:{message:'Auth account absent'}});
 const recovered=await authService(client,true,{saved}).getAccountDeletionStatus('a');
 assert.equal(recovered.isDeleted,true);assert.deepEqual(calls.map(value=>value.action),['prepare','request','status']);assert.equal(saved.size,0);
});

test('a lost preparation reply or blocked durable storage never submits destructive consent',async()=>{
 for(const mode of ['lost-prepare','blocked-storage']){
  const calls=[],saved=new Map();
  const client={auth:{getUser:async()=>({data:{user:{id:'a',email:'owner@example.test'}}})},functions:{invoke:async(_,{body})=>{calls.push(body.action);return mode==='lost-prepare'?{error:{}}:{data:{status:'prepared',receipt:'c'.repeat(64)}};}}};
  await assert.rejects(authService(client,true,{saved,storageBlocked:mode==='blocked-storage'}).deleteAccount({accountId:'a',confirmation:'owner@example.test'}));
  assert.deepEqual(calls,['prepare']);assert.equal(saved.size,0);
 }
});

test('account switch and mismatched local records cannot use another account receipt or clear its progress',async()=>{
 const saved=new Map([['portalink.deletion-receipt.v1:a',JSON.stringify({accountId:'a',receipt:'d'.repeat(64)})]]),calls=[];
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'b'}}},error:null})},functions:{invoke:async(_,{body})=>{calls.push(body);return {data:{status:'none'}};}}};
 const service=authService(client,true,{saved});await assert.rejects(service.getAccountDeletionStatus('a'));assert.equal(calls.length,0);assert.equal(saved.size,1);
 assert.equal(await service.getAccountDeletionStatus('b'),null);assert.equal(calls[0].receipt,undefined);assert.equal(saved.size,1);
 saved.set('portalink.deletion-receipt.v1:b',JSON.stringify({accountId:'a',receipt:'d'.repeat(64)}));
 assert.equal(await service.getAccountDeletionStatus('b'),null);assert.equal(calls[1].receipt,undefined);
});

test('switching accounts after preparing stops submission and an expired receipt never implies deletion',async()=>{
 const saved=new Map(),calls=[];
 let account='a';
 const client={auth:{getUser:async()=>({data:{user:{id:'a',email:'owner@example.test'}}}),getSession:async()=>({data:{session:{user:{id:account},access_token:'verified-a-token'}},error:null})},functions:{invoke:async(_,{body})=>{calls.push(body.action);account='b';return {data:{status:'prepared',receipt:'e'.repeat(64)}};}}};
 await assert.rejects(authService(client,true,{saved}).deleteAccount({accountId:'a',confirmation:'owner@example.test'}));assert.deepEqual(calls,['prepare']);
 assert.equal(saved.size,0,'No capability is persisted after a preparation account switch.');
 saved.set('portalink.deletion-receipt.v1:a',JSON.stringify({accountId:'a',receipt:'a'.repeat(64)}));
 client.auth.getSession=async()=>({data:{session:null},error:null});client.functions.invoke=async()=>({error:{context:Response.json({message:'Receipt unavailable.'},{status:403})}});
 await assert.rejects(authService(client,true,{saved}).getAccountDeletionStatus('a'));assert.equal(saved.size,1);
});

test('fresh signed-out recovery discovers only the persisted receipt and ignores absent-provider errors',async()=>{
 const saved=new Map([['portalink.deletion-recovery.v1','a'],['portalink.deletion-receipt.v1:a',JSON.stringify({accountId:'a',receipt:'f'.repeat(64)})]]),calls=[];
 const client={auth:{getUser:async()=>{assert.fail('Recovery must not verify a removed provider identity');},getSession:async()=>({data:{session:null},error:{message:'Auth account absent'}})},functions:{invoke:async(_,{body})=>{calls.push(body);return {data:{status:'processing',isDeleted:false}};}}};
 const service=authService(client,true,{saved});assert.equal((await service.getAccountDeletionRecovery()).accountId,'a');
 assert.equal((await service.getAccountDeletionStatus('a')).status,'processing');assert.equal(calls[0].receipt,'f'.repeat(64));assert.equal(calls[0].accountId,undefined);
 client.auth.getSession=async()=>({data:{session:{user:{id:'new-account'}}},error:null});
 assert.equal(await service.getAccountDeletionRecovery(),null);await assert.rejects(service.getAccountDeletionStatus('a'));assert.equal(calls.length,1);
});

test('the hard deletion lock suppresses recovery without reading sessions or saved capabilities',async()=>{
 const client={auth:{getSession:async()=>{assert.fail('Locked recovery touched a session');}}};
 assert.equal(await authService(client,false).getAccountDeletionRecovery(),null);
});

test('A to B to A preparation race cannot persist or consume B capability as A',async()=>{
 const saved=new Map(),calls=[],receiptA='a'.repeat(64),receiptB='b'.repeat(64);let active='a';
 const client={auth:{getSession:async()=>({data:{session:{user:{id:active},access_token:`${active}-token`}},error:null}),getUser:async token=>{
  assert.equal(token,'a-token');active='b';return {data:{user:{id:'a',email:'a@example.test'}},error:null};
 }},functions:{invoke:async(_,{body,headers})=>{
  calls.push({body,headers});
  if(body.action==='prepare'){
   assert.equal(body.expectedAccountId,'a');
   return {data:{status:'prepared',receipt:headers?.Authorization==='Bearer a-token'?receiptA:receiptB}};
  }
  if(body.action==='request')assert.fail('Account switch must stop destructive invocation');
  return {data:body.receipt===receiptB?{status:'completed',isDeleted:true}:{status:'none',isDeleted:false}};
 }}};
 const service=authService(client,true,{saved});
 await assert.rejects(service.deleteAccount({accountId:'a',confirmation:'a@example.test'}));
 assert.equal(calls[0].headers.Authorization,'Bearer a-token');assert.equal(saved.size,0);
 active='a';assert.equal(await service.getAccountDeletionStatus('a'),null);
 assert.equal(calls[1].body.receipt,undefined);assert.deepEqual(calls.map(call=>call.body.action),['prepare','status']);
});

function deletionDialogFixture() {
 const auth={user:{id:'account-a',email:'owner@example.test'},viewerProfileId:'profile-a',completeAccountDeletion:()=>completed++};
 const deletion={capability:{isAvailable:true,removes:['Your profile and files']},result:null,error:null,isDeleting:false,isCheckingStatus:false,canCheckStatus:true,
  isCheckingCapability:false,capabilityError:false,confirmation:'',fieldError:null,canSubmit:false,hasFailed:false,
  setConfirmation(){ /* Dialog rendering uses a fixed hook result; hook tests cover consent changes. */ },submit:()=>submitted++,reset:()=>resets++,refreshStatus:async()=>{checks++;},
 };
 let completed=0,submitted=0,resets=0,checks=0,closed=0,cursor=0,priorKey;
 const slots=[],effects=[],options=[];
 const react={...React,useRef:()=>({current:null}),useEffect:callback=>effects.push(callback),lazy:()=> 'ExportSheet',useState(initial){
  const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;
  return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];
 }};
 const exports={};
 vm.runInNewContext(compile('src/features/auth/DeleteAccountDialog.tsx'),{exports,require(name){
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return jsxRuntime;
  if(name==='framer-motion')return {motion:{div:'motion-div'},useReducedMotion:()=>true};
  if(name.endsWith('/motion/motion'))return {motionSeconds:()=>0};
  if(name.endsWith('/AuthContext'))return {useAuth:()=>auth};
  if(name.endsWith('/useAccountDeletion'))return {useAccountDeletion:input=>{options.push(input);return deletion;}};
  if(name.endsWith('/useModalFocus'))return {useModalFocus(){ /* This synthetic tree has no DOM to focus. */ }};
  return new Proxy({},{get:(_,key)=>key});
 }});
 const props={isOpen:true,onClose:()=>closed++};
 const render=()=>{
  effects.length=0;
  const entry=exports.DeleteAccountDialog(props);
  if(entry.key!==priorKey){slots.length=0;priorKey=entry.key;}
  cursor=0;return {entry,tree:entry.type(entry.props)};
 };
 return {auth,deletion,props,options,effects,render,counts:()=>({completed,submitted,resets,checks,closed})};
}
const labelledButton=(tree,label)=>nodes(tree).find(node=>node.type==='Button'&&node.props.children===label);
const textContent=tree=>nodes(tree).flatMap(node=>React.Children.toArray(node.props?.children).filter(child=>typeof child==='string')).join(' ');

test('deletion offers existing limited export before typed confirmation and starts no work from exporting',()=>{
 const h=deletionDialogFixture();let {tree}=h.render();
 const all=nodes(tree),exportButton=labelledButton(tree,'Export'),field=all.find(node=>node.type==='AuthField');
 assert.ok(exportButton);assert.ok(field);assert.ok(all.indexOf(exportButton)<all.indexOf(field));
 assert.match(textContent(tree),/cannot be undone/);assert.match(textContent(tree),/PDF excludes private and hidden work/);
 assert.match(textContent(tree),/not a complete archive/);
 assert.match(textContent(tree),/Save original files separately before deletion/);
 assert.doesNotMatch(textContent(tree),/48.hours|grace|Schedule deletion|Cancel deletion/);
 exportButton.props.onClick();({tree}=h.render());
 const sheet=nodes(tree).find(node=>node.type==='ExportSheet');assert.equal(sheet.props.profileId,'profile-a');
 assert.equal(h.counts().submitted,0);sheet.props.onClose();({tree}=h.render());
 labelledButton(tree,'Close').props.onClick();assert.equal(h.counts().resets,1);assert.equal(h.counts().closed,1);
});

test('deletion stays in progress while cleanup runs and only confirmed completion clears identity',()=>{
 const h=deletionDialogFixture();h.deletion.result={isDeleted:false,status:'processing',message:'Deletion in progress.'};
 let {tree}=h.render();
 assert.match(textContent(tree),/Deletion in progress/);assert.equal(nodes(tree).some(node=>node.type==='AuthField'),false);
 assert.equal(labelledButton(tree,'Delete account'),undefined);assert.equal(labelledButton(tree,'Export'),undefined);
 labelledButton(tree,'Check status').props.onClick();assert.equal(h.counts().checks,1);
 for(const effect of h.effects)effect();assert.equal(h.counts().completed,0);
 h.deletion.isCheckingStatus=true;({tree}=h.render());assert.equal(labelledButton(tree,'Check status').props.disabled,true);
 h.deletion.isCheckingStatus=false;h.deletion.result={isDeleted:true,status:'processing',message:'Malformed completion.'};
 ({tree}=h.render());for(const effect of h.effects)effect();assert.equal(h.counts().completed,0);assert.doesNotMatch(textContent(tree),/Account deleted/);
 h.deletion.result={isDeleted:true,status:'completed',message:'Account deleted.'};
 ({tree}=h.render());for(const effect of h.effects)effect();assert.equal(h.counts().completed,1);
 assert.match(textContent(tree),/Account deleted/);assert.equal(labelledButton(tree,'Check status'),undefined);
});

test('request-in-flight dismissal is blocked and a disabled release never exposes deletion confirmation',()=>{
 const h=deletionDialogFixture();h.deletion.isDeleting=true;
 let {tree}=h.render();assert.match(textContent(tree),/Deletion in progress/);
 assert.equal(labelledButton(tree,'Export').props.disabled,true);assert.equal(labelledButton(tree,'Close').props.disabled,true);
 labelledButton(tree,'Close').props.onClick();assert.equal(h.counts().closed,0);
 h.deletion.isDeleting=false;h.deletion.capability={isAvailable:false,removes:[],reason:'Temporarily disabled.'};
 ({tree}=h.render());assert.equal(nodes(tree).some(node=>node.type==='AuthField'),false);
 assert.equal(labelledButton(tree,'Delete account'),undefined);assert.equal(labelledButton(tree,'Export'),undefined);
 assert.match(textContent(tree),/Temporarily disabled/);
});

test('typed deletion consent and export state are keyed to the current account',()=>{
 const h=deletionDialogFixture();let rendered=h.render();assert.equal(rendered.entry.key,'account-a');
 labelledButton(rendered.tree,'Export').props.onClick();rendered=h.render();assert.ok(nodes(rendered.tree).some(node=>node.type==='ExportSheet'));
 h.auth.user={id:'account-b',email:'another@example.test'};h.auth.viewerProfileId='profile-b';rendered=h.render();
 assert.equal(rendered.entry.key,'account-b');assert.equal(nodes(rendered.tree).some(node=>node.type==='ExportSheet'),false);
 assert.equal(h.options.at(-1).accountId,'account-b');assert.equal(h.options.at(-1).accountEmail,'another@example.test');
});

test('the frontend deletion release gate remains hardcoded off',()=>{
 assert.match(readFileSync(new URL('../src/services/supabase/client.ts',import.meta.url),'utf8'),/export const accountDeletionEnabled = false;/);
});
