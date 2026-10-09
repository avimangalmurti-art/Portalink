import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDeletionEndpoints} from '../supabase/pending/deletion-endpoints.mjs';
test('numbered deletion proposal preserves release gates while enforcing the reviewed grace and indexed owner fences',()=>{
 const numbered=readFileSync(new URL('../supabase/pending/202610090002_account_deletion_safety.sql',import.meta.url),'utf8');
 assert.match(numbered,/check\(delete_after = requested_at \+ interval '48 hours'\)/);
 assert.match(numbered,/new.delete_after:=new.requested_at\+interval '48 hours'/);
 assert.match(numbered,/pending_deletion_profiles on deletion_private.jobs\(profile_id\) where status <> 'cancelled'/);
 assert.equal((numbered.match(/where account_id=owner_account and status <> 'cancelled' loop/g)||[]).length,3);
 assert.match(numbered,/requests_enabled boolean not null default false/);
 assert.match(numbered,/worker_enabled boolean not null default false/);
});
test('candidate request and worker endpoints are off without constructing an admin client',async()=>{
 let calls=0;
 const handler=createDeletionEndpoints(()=>{calls++;throw Error('Must remain off');});
 for(const action of ['request','tick']) {
   const response=await handler(new Request(`https://example.test/deletion/${action}`,{method:'POST',body:'{}'}));
   assert.equal(response.status,503);assert.equal((await response.json()).isDeleted,false);
 }
 assert.equal(calls,0);
});
test('candidate recovery routes require authenticated identity even with request gate off',async()=>{
 let rpc=0;
 const handler=createDeletionEndpoints(()=>({auth:{getUser:async()=>({data:{user:null},error:true})},rpc:()=>{rpc++;}}));
 for(const action of ['status','cancel'])assert.equal((await handler(new Request(`https://example.test/deletion/${action}`,{method:'POST',body:'{}',headers:{authorization:'Bearer invalid'}}))).status,401);
 assert.equal(rpc,0);
});
