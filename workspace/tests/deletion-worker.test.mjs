import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runDeletionTick } from '../supabase/pending/deletion-worker.mjs';
import { createDeletionHandler } from '../supabase/pending/deletion-request.mjs';

test('worker defaults off with no side effects',async()=>{
 assert.deepEqual(await runDeletionTick(new Proxy({},{get(){throw Error('no access');}})),{status:'disabled'});
});

function fixture(options={}) {
 const events=[];let phase=options.authPhase?'auth':'storage';let absent=Boolean(options.absent);let lost=false;let acknowledged=false;
 const admin={
  rpc:async(name,args)=>{
   events.push(name);
   if(name==='claim_account_deletion')return {data:{id:'job',account_id:'owner',lease_token:'lease'}};
   if(name==='account_deletion_batch')return {data:phase==='storage'?{phase,files:[{bucket:'message-media',path:'owner/chat/own.png'}]}:{phase}};
   if(name==='checkpoint_account_deletion_files'){
    if(options.lostCheckpoint&&!acknowledged){acknowledged=true;return {error:{message:'lost'}};}
    phase='anonymize';
   }
   if(name==='anonymize_account_deletion')phase='auth';
   if(name==='finish_account_deletion')assert.equal(absent,true);
   return {data:null};
  },
  storage:{from:bucket=>({remove:async paths=>{
   events.push(['remove',bucket,...paths]);
   return {error:options.storageError?{message:'failed'}:null};
  }})},
  auth:{admin:{
   getUserById:async account=>{
    events.push(['lookup',account]);
    if(options.lookupError)return {error:{status:401,code:'bad_jwt'}};
    return absent?{error:{status:404,code:'user_not_found'}}:{data:{user:{id:account}}};
   },
   deleteUser:async account=>{
    events.push(['deleteAuth',account]);absent=true;
    if(options.lostAuth&&!lost){lost=true;throw Error('HTTP reply lost');}
    return {error:null};
   },
  }},
 };
 return {admin,events};
}
test('storage, tombstones and Auth run in order with checkpoints',async()=>{
 const f=fixture();assert.equal((await runDeletionTick(f.admin,{enabled:true})).status,'completed');
 assert.ok(f.events.indexOf('checkpoint_account_deletion_files')<f.events.indexOf('anonymize_account_deletion'));
 assert.ok(f.events.findIndex(e=>Array.isArray(e)&&e[0]==='deleteAuth')>f.events.indexOf('anonymize_account_deletion'));
});
test('failed storage never reaches Auth; lost checkpoint safely repeats the same owned removal',async()=>{
 const bad=fixture({storageError:true});assert.equal((await runDeletionTick(bad.admin,{enabled:true})).status,'retry');
 assert.ok(!bad.events.some(e=>Array.isArray(e)&&e[0]==='deleteAuth'));
 const lost=fixture({lostCheckpoint:true});assert.equal((await runDeletionTick(lost.admin,{enabled:true})).status,'retry');
 assert.equal((await runDeletionTick(lost.admin,{enabled:true})).status,'completed');
 const removals=lost.events.filter(e=>Array.isArray(e)&&e[0]==='remove');assert.equal(removals.length,2);assert.deepEqual(removals[0],removals[1]);
});
test('uncertain Auth success resumes by explicit not-found; authorization failure never means deleted',async()=>{
 const f=fixture({lostAuth:true});assert.equal((await runDeletionTick(f.admin,{enabled:true})).status,'retry');
 assert.equal((await runDeletionTick(f.admin,{enabled:true})).status,'completed');
 assert.equal(f.events.filter(e=>Array.isArray(e)&&e[0]==='deleteAuth').length,1);
 const denied=fixture({authPhase:true,lookupError:true});assert.equal((await runDeletionTick(denied.admin,{enabled:true})).status,'retry');
 assert.ok(!denied.events.includes('finish_account_deletion'));
});
test('bounded tick yields at a checkpoint and later resumes',async()=>{
 const f=fixture();assert.equal((await runDeletionTick(f.admin,{enabled:true,maxBatches:1})).status,'checkpointed');
 assert.equal((await runDeletionTick(f.admin,{enabled:true})).status,'completed');
});
test('request handler trusts verified identity, requires confirmation, allows recovery with requests off',async()=>{
 const calls=[];
 const admin={auth:{getUser:async()=>({data:{user:{id:'verified-owner',email:'owner@example.test'}}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:{status:name.startsWith('cancel')?'cancelled':'pending',deleteAfter:'2030-01-03'}};}};
 const request=body=>new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify(body)});
 const off=createDeletionHandler(admin);
 assert.equal((await off(request({action:'request'}))).status,503);assert.equal(calls.length,0);
 assert.equal((await off(request({action:'cancel',accountId:'victim'}))).status,200);
 assert.deepEqual(calls[0],['cancel_account_deletion',{p_account_id:'verified-owner'}]);
 const on=createDeletionHandler(admin,{enabled:true});
 assert.equal((await on(request({action:'request',confirmation:'wrong'}))).status,400);
 const r=await on(request({action:'request',confirmation:'OWNER@example.test',accountId:'victim'}));
 assert.equal(r.status,200);assert.equal((await r.json()).isDeleted,false);
 assert.deepEqual(calls.at(-1),['request_account_deletion',{p_account_id:'verified-owner'}]);
});

test('an uncertain request or cancel response never falsely reports that nothing happened',async()=>{
 const admin={auth:{getUser:async()=>({data:{user:{id:'owner',email:'owner@example.test'}}})},rpc:async()=>({error:{message:'network response lost'}})};
 const handler=createDeletionHandler(admin,{enabled:true});
 for(const action of ['request','cancel']){
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({action,confirmation:'owner@example.test'})}));
  assert.equal(response.status,503);
  assert.match((await response.json()).message,/Check your deletion status/);
 }
});
