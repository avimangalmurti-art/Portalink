import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {sourceModule} from './helpers/source-module.mjs';
const {createCallbackSessionStorage,adoptCallbackSession}=sourceModule('src/services/supabase/callbackSession.ts',{}, {atob});
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const jwt=(id,expiry=Math.floor(Date.now()/1000)+3600)=>[{}, {sub:'fixture-user',session_id:id,exp:expiry},'signature'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.');
const session=id=>({access_token:jwt(id),refresh_token:'synthetic-refresh-'+id,user:{id:'fixture-user'},expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer'});
function harness(){
 const values=new Map();let tail=Promise.resolve();
 const exclusive=operation=>{const next=tail.then(operation);tail=next.catch(()=>{});return next;};
 const raw={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 return {values,raw,coordinator:createCallbackSessionStorage(()=>raw,'auth',exclusive)};
}
function sdk(fetcher=async()=>Response.json({id:'fixture-user',email_confirmed_at:'2026-01-01',identities:[]})){
 return createClient('https://fixture.supabase.co','synthetic-publishable-key',{global:{fetch:fetcher},auth:{storageKey:'isolated-callback',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}).auth;
}
test('actual SDK adopts in memory; navigation failure removes only the attempt and never shares SDK notification',async()=>{
 const h=harness(),auth=sdk(),events=[];auth.onAuthStateChange((event)=>events.push(event));
 let issued;
 await assert.rejects(adoptCallbackSession(auth,h.coordinator,jwt(a),'refresh-a',token=>issued=token,()=>{throw Error('navigation');}));
 assert.equal(JSON.parse(h.values.get('auth')).access_token,issued);
 assert.ok(events.includes('SIGNED_IN')); // Actual SDK event exists only on the isolated client.
 assert.equal(await h.coordinator.removeIssued(issued),true);assert.equal(h.values.has('auth'),false);
 assert.equal((await auth.getSession()).data.session.access_token,issued,'isolated memory is not shared storage');
});
test('new login while SDK user lookup is pending prevents callback commit',async()=>{
 const h=harness();let release,entered;
 const started=new Promise(resolve=>entered=resolve);
 const auth=sdk(async()=>{entered();await new Promise(resolve=>release=resolve);return Response.json({id:'fixture-user'});});
 const adopting=adoptCallbackSession(auth,h.coordinator,jwt(a),'refresh-a',()=>{},()=>assert.fail('must not navigate'));
 await started;await h.coordinator.storage.setItem('auth',JSON.stringify(session(b)));release();
 await assert.rejects(adopting,/Another sign-in/);
 assert.equal(await h.coordinator.removeIssued(jwt(a)),true);assert.equal(JSON.parse(h.values.get('auth')).access_token,jwt(b));
});
test('newer same-account login survives cleanup queued before and after replacement; matching rotated session is removed',async()=>{
 for(const replacementFirst of [true,false]){
  const h=harness();await h.coordinator.commit(session(a),jwt(a));
  const replace=()=>h.coordinator.storage.setItem('auth',JSON.stringify(session(b)));
  const remove=()=>h.coordinator.removeIssued(jwt(a));
  await Promise.all(replacementFirst?[replace(),remove()]:[remove(),replace()]);
  assert.equal(JSON.parse(h.values.get('auth')).access_token,jwt(b));
 }
 const h=harness();const rotated=session(a);rotated.access_token=jwt(a,Math.floor(Date.now()/1000)+7200);
 await h.coordinator.storage.setItem('auth',JSON.stringify(rotated));await h.coordinator.removeIssued(jwt(a));assert.equal(h.values.has('auth'),false);
});
test('actual SDK refresh uses returned credentials but must retain the issued session identity',async()=>{
 for(const id of [a,b]){
  const h=harness(),refreshed=session(id);let issued,navigated=false;
  const auth=sdk(async url=>String(url).includes('/token')?Response.json({...refreshed,expires_in:3600}):Response.json({id:'fixture-user'}));
  const run=adoptCallbackSession(auth,h.coordinator,jwt(a,1),'expired-refresh',token=>issued=token,()=>navigated=true);
  if(id===a){await run;assert.equal(issued,refreshed.access_token);assert.equal(navigated,true);}
  else{await assert.rejects(run,/Session changed/);assert.equal(h.values.has('auth'),false);}
 }
});
test('unavailable locks, corrupt storage and failed removal fail closed without deleting a replacement',async()=>{
 const h=harness();const unavailable=createCallbackSessionStorage(()=>h.raw,'auth',null);
 await assert.rejects(unavailable.commit(session(a),jwt(a)));assert.equal(await unavailable.removeIssued(jwt(a)),false);
 h.values.set('auth','broken');await assert.rejects(h.coordinator.commit(session(a),jwt(a)));assert.equal(await h.coordinator.removeIssued(jwt(a)),false);assert.equal(h.values.get('auth'),'broken');
 const broken=createCallbackSessionStorage(()=>({getItem:()=>JSON.stringify(session(a)),removeItem:()=>{throw Error('storage');},setItem(){}}),'auth',op=>Promise.resolve().then(op));
 assert.equal(await broken.removeIssued(jwt(a)),false);
});

test('actual persistent SDK replacement storage is preserved by concurrent callback cleanup',async()=>{
 for(const cleanupFirst of [true,false]){
  const h=harness();await h.coordinator.commit(session(a),jwt(a));
  const main=createClient('https://fixture.supabase.co','synthetic-publishable-key',{global:{fetch:async()=>Response.json({id:'fixture-user'})},
   auth:{storageKey:'auth',storage:h.coordinator.storage,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}}).auth;
  await main.initialize();
  const replace=()=>main.setSession({access_token:jwt(b),refresh_token:'replacement-refresh'});
  const remove=()=>h.coordinator.removeIssued(jwt(a));
  const results=await Promise.all(cleanupFirst?[remove(),replace()]:[replace(),remove()]);
  const adoption=results[cleanupFirst?1:0];assert.equal(adoption.error,null);
  assert.equal(JSON.parse(h.values.get('auth')).access_token,jwt(b));
  assert.equal((await main.getSession()).data.session.access_token,jwt(b));
 }
});

test('real SDK subscriber failure after in-memory save cannot persist a failed callback',async()=>{
 const h=harness(),auth=sdk();await auth.initialize();
 const originalError=console.error;console.error=()=>{};
 try{
  const {data}=auth.onAuthStateChange(event=>{if(event==='SIGNED_IN')throw Error('notification failure');});
  await assert.rejects(adoptCallbackSession(auth,h.coordinator,jwt(a),'refresh',()=>{},()=>assert.fail('navigation')));
  data.subscription.unsubscribe();
  assert.equal((await auth.getSession()).data.session.access_token,jwt(a));
  assert.equal(h.values.has('auth'),false,'SDK saved only to isolated memory before it threw');
 }finally{console.error=originalError;}
});

test('blocked persistent storage retains normal SDK memory fallback but rejects callback commit',async()=>{
 const h=createCallbackSessionStorage(()=>null,'auth',operation=>Promise.resolve().then(operation));
 await h.storage.setItem('auth','memory-only');assert.equal(await h.storage.getItem('auth'),'memory-only');
 await assert.rejects(h.commit(session(a),jwt(a)),/Persistent/);assert.equal(await h.removeIssued(jwt(a)),false);
 assert.equal(await h.storage.getItem('auth'),'memory-only');await h.storage.removeItem('auth');assert.equal(await h.storage.getItem('auth'),null);
});
