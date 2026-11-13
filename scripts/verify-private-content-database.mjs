// In-memory PostgreSQL ONLY. No network, Supabase credentials or real accounts.
import assert from 'node:assert/strict';
import { replaySupabaseSchema } from '../tests/support/replay-supabase-schema.mjs';
const { db } = await replaySupabaseSchema();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let passed=0;
const check=async(name,fn)=>{await fn(); passed++; console.log(`PASS ${name}`);};
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const system=async()=>{await db.exec("reset role; select set_config('request.jwt.claims','',false); select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','service_role',false)");};
const user=async n=>{await system();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:id(n),session_id:id(n+100)})]);await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated");};
try {


 const profile = n => id(n + 10);
 for (let n=1;n<=9;n++) {
   await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `synthetic${n}@example.test`]);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(n+100),id(n)]);
   await db.query('insert into profiles(id,account_id,name,handle,headline,is_private) values($1,$2,$3,$4,$5,$6)',
     [profile(n),id(n),`Synthetic ${n}`,`synthetic${n}`,'Test creator',n===1||n===8]);
 }
 for (const [projectId,owner] of [[201,1],[202,9],[203,8]]) {
   const category = await scalar('select id from portfolio_categories where profile_id=$1 limit 1',[profile(owner)]);
   await db.query('insert into projects(id,profile_id,category_id,title,summary) values($1,$2,$3,$4,$5)',[id(projectId),profile(owner),category,'Synthetic project','Synthetic description']);
 }
 const original=`${profile(1)}/${id(201)}/audit.png`;
 const preview=`posts/${id(201)}/pages/0001.webp`;
 await db.query("insert into project_attachments(id,project_id,kind,file_name,display_name,extension,mime_type,size_bytes,type_label,storage_path,status) values($1,$2,'image','audit.png','Audit','png','image/png',10,'Image',$1,'ready')",[original,id(201)]);
 for(const path of [original,preview]) await db.query("insert into storage.objects(bucket_id,name) values('project-media',$1)",[path]);
 for(const [from,to,status] of [[2,1,'following'],[3,1,'pending'],[1,4,'pending']])
   await db.query('insert into profile_follows(follower_account_id,follower_profile_id,target_profile_id,status) values($1,$2,$3,$4)',[id(from),profile(from),profile(to),status]);
 for(const [n,cid,established] of [[5,301,true],[6,302,true],[7,303,false]])
   await db.query("insert into direct_conversations(id,participant_one_profile_id,participant_two_profile_id,status,initiator_profile_id,established_at) values($1,$2,$3,$4,$3,case when $5 then now() else null end)",[id(cid),profile(1),profile(n),established?'active':'request',established]);
 await db.query('insert into direct_message_blocks(blocker_profile_id,blocked_profile_id) values($1,$2)',[profile(6),profile(1)]);
 await db.query('insert into project_comments(project_id,author_profile_id,body) values($1,$2,$3)',[id(202),profile(8),'Public comment']);
 const privateReads = async n => {
   await user(n);
   return Promise.all([
     scalar('select count(*)::int from profiles where id=$1',[profile(1)]),
     scalar('select count(*)::int from projects where id=$1',[id(201)]),
     scalar('select count(*)::int from project_attachments where project_id=$1',[id(201)]),
     scalar('select count(*)::int from storage.objects where name=$1',[original]),
     scalar('select count(*)::int from storage.objects where name=$1',[preview]),
   ]);
 };
 await check('owner and accepted followers can read private work and original/derived files',async()=>{
   for(const n of [1,2]) assert.deepEqual(await privateReads(n),[1,1,1,1,1]);
 });
 await check('pending/reverse follows, existing chats, blocks and drafts do not expose private content',async()=>{
   for(const n of [3,4,5,6,7,9]) assert.deepEqual(await privateReads(n),[0,0,0,0,0],`viewer ${n}`);
 });
 const identities=async ids=>(await db.query('select * from profile_identities($1::uuid[])',[ids])).rows;
 await check('social and message contexts retain only four identity fields',async()=>{
   for(const n of [4,5,6,7]) {
     await user(n); const rows=await identities([profile(1)]);
     assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),['avatar_url','handle','id','name']);
   }
   for(const n of [3,9]) { await user(n); assert.equal((await identities([profile(1)])).length,0); }
 });
 await check('public comments retain creator identity without granting access to private work',async()=>{
   await system();await db.exec("select set_config('request.jwt.claim.role','anon',false); set role anon");
   assert.equal((await identities([profile(8)])).length,1);
   assert.equal(await scalar('select count(*)::int from projects where id=$1',[id(203)]),0);
   assert.equal(await scalar('select count(*)::int from profiles where id=$1',[profile(8)]),0);
   assert.equal(await scalar('select count(*)::int from projects where id=$1',[id(202)]),1);
 });
 await check('internal message resolver is not browser-callable',async()=>{
   await system();
   for(const role of ['anon','authenticated']) assert.equal(await scalar("select has_function_privilege($1,'public.resolve_direct_message_permission(uuid)','EXECUTE')",[role]),false);
   assert.equal(await scalar("select has_function_privilege('anon','public.profile_identities(uuid[])','EXECUTE')"),true);
   assert.equal(await scalar("select has_function_privilege('anon','public.can_view_profile_identity(uuid)','EXECUTE')"),false);
   assert.equal(await scalar("select has_function_privilege('anon','public.search_message_identities(text,integer,integer,boolean)','EXECUTE')"),false);
 });
 await check('stale empty drafts cannot bypass current message preferences',async()=>{
   await system();await db.query("insert into messaging_preferences(profile_id,permission) values($1,'following') on conflict(profile_id) do update set permission='following'",[profile(1)]);
   await user(7);
   await assert.rejects(db.query('select get_or_create_direct_conversation($1)',[profile(1)]),/messages unavailable/);
   await assert.rejects(db.query("select send_direct_message($1,'Blocked draft','[]'::jsonb)",[id(303)]),/messages unavailable/);
 });
 await check('established conversations remain usable while blocking is enforced',async()=>{
   await user(5);assert.equal(await scalar('select get_or_create_direct_conversation($1)',[profile(1)]),id(301));
   await db.query("select send_direct_message($1,'Existing conversation','[]'::jsonb)",[id(301)]);
   await user(6);await assert.rejects(db.query('select get_or_create_direct_conversation($1)',[profile(1)]),/blocked/);
 });
 await check('private identity search is scoped, bounded, and preserves historical conversation search',async()=>{
   const search=async(query,only=false,limit=30,offset=0)=>(await db.query('select * from search_message_identities($1,$2,$3,$4)',[query,limit,offset,only])).rows;
   await user(5);assert.equal((await search('Synthetic 1',true))[0]?.id,profile(1));
   assert.equal((await search('Synthetic 8')).length,0);
   assert.equal((await search('Synthetic 9',true)).length,0);
   assert.equal((await search('')).length,0);
   await user(2);assert.deepEqual((await search('')).map(row=>row.id),[profile(1)]);
   await user(6);assert.equal((await search('Synthetic 1',true)).length,0);
   await user(1);assert.equal((await search('Synthetic 6',true))[0]?.id,profile(6));
   assert.equal((await search('Synthetic 6')).length,0);
   await user(5);const all=await search('Synthetic');const page=await search('Synthetic',false,1,1);
   assert.deepEqual(page,all.slice(1,2));assert.ok(all.every(row=>Object.keys(row).length===4));
 });
 await check('Unblock deletes only the caller-owned block and does not accept or unarchive conversations',async()=>{
   await user(5);assert.equal((await db.query('delete from direct_message_blocks where blocker_profile_id=$1 and blocked_profile_id=$2 returning *',[profile(6),profile(1)])).rows.length,0);
   await user(6);await db.query('delete from direct_message_blocks where blocker_profile_id=$1 and blocked_profile_id=$2',[profile(6),profile(1)]);
   assert.equal(await scalar('select count(*)::int from direct_message_blocks where blocker_profile_id=$1',[profile(6)]),0);
   assert.equal(await scalar('select status from direct_conversations where id=$1',[id(302)]),'active');
 });
 console.log(passed+' isolated privacy and messaging database checks passed.');
} finally { await db.close(); }
