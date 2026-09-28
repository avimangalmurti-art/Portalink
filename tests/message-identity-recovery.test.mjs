import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness() {
  const calls=[];let signedIn=true, writeError=null;
  const client={auth:{getSession:async()=>({data:{session:signedIn?{user:{id:'account'}}:null}})},
    from(table){
      const ops=[];const query={};
      for(const op of ['select','eq','order','delete','range','in','or']) query[op]=(...args)=>{ops.push([op,...args]);return query;};
      query.single=async()=>{assert.equal(table,'profiles');assert.deepEqual(ops,[['select','id'],['eq','account_id','account']]);return {data:{id:'viewer'}};};
      query.then=(done,reject)=>{
        calls.push({table,ops});
        assert.notEqual(table,'profiles','Private participant identities must not use full profile reads');
        let data=[];
        if(table==='direct_message_blocks' && !ops.some(([op])=>op==='delete') && !ops.some(([op])=>op==='in')) data=[{blocked_profile_id:'private'},{blocked_profile_id:'missing'}];
        if(table==='direct_conversations') data=[{id:'chat',participant_one_profile_id:'viewer',participant_two_profile_id:'private',status:'active',established_at:'2026-01-01',last_message_at:'2026-01-01',created_at:'2026-01-01'}];
        return Promise.resolve({data,error:ops.some(([op])=>op==='delete')?writeError:null}).then(done,reject);
      };return query;
    },
    async rpc(name,args){
      calls.push({rpc:name,args});
      if(name==='profile_identities'||name==='search_message_identities') return {data:[{id:'private',name:'Private creator',handle:'private',avatar_url:'avatar.png'}]};
      if(name==='direct_conversation_message_summaries') return {data:[]};
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const exports={};vm.runInNewContext(ts.transpileModule(readFileSync('src/services/supabase/messagingService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>{assert.equal(name,'./client');return {requireSupabase:()=>client};}});
  return {service:exports.supabaseMessagingService,calls,signOut(){signedIn=false;},failWrites(){writeError={message:'offline'};}};
}

test('blocked people retain a removable ID when identity is missing; Unblock targets only the viewer’s edge',async()=>{
  const h=harness();const people=await h.service.listBlockedPeople();
  assert.deepEqual(Array.from(people,p=>[p.id,p.name]),[['private','Private creator'],['missing','Blocked person']]);
  await h.service.unblockParticipant('missing');
  const deletion=h.calls.find(call=>call.ops?.some(([op])=>op==='delete'));
  assert.equal(deletion.table,'direct_message_blocks');assert.deepEqual(deletion.ops,[['delete'],['eq','blocker_profile_id','viewer'],['eq','blocked_profile_id','missing']]);
  h.failWrites();await assert.rejects(h.service.unblockParticipant('private'));
  h.signOut();const before=h.calls.length;await assert.rejects(h.service.unblockParticipant('private'),/Sign in/);assert.equal(h.calls.length,before);
});

test('conversation identity hydration uses minimal identity RPC while history remains available',async()=>{
  const h=harness();const page=await h.service.listConversations();
  assert.equal(page.conversations[0].participant.name,'Private creator');assert.equal(page.conversations[0].participant.handle,'@private');
  assert.deepEqual(Array.from(h.calls.find(call=>call.rpc==='profile_identities').args.p_profile_ids),['private']);
});

test('recipient search delegates scope and pagination before returning identities',async()=>{
  const h=harness();await h.service.searchRecipients('',{offset:3,limit:5});
  let call=h.calls.find(call=>call.rpc==='search_message_identities');
  assert.equal(call.args.p_query,'');assert.equal(call.args.p_offset,3);assert.equal(call.args.p_limit,5);assert.equal(call.args.p_conversations_only,false);
  h.calls.length=0;const people=await h.service.searchRecipients('  Private  ');
  call=h.calls.find(call=>call.rpc==='search_message_identities');assert.equal(call.args.p_query,'Private');assert.equal(people[0].name,'Private creator');
});
