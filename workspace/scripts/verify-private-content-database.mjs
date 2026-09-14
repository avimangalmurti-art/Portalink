// In-memory PostgreSQL ONLY. No network, Supabase credentials or real accounts.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let passed=0;
const check=async(name,fn)=>{await fn(); passed++; console.log(`PASS ${name}`);};
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const system=async()=>{await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','service_role',false)");};
const user=async n=>{await system();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated");};
try {
 await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage; create schema realtime;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{}',owner uuid,owner_id text);
 create function storage.foldername(path text) returns text[] language sql immutable as $$select (string_to_array(path,'/'))[1:array_length(string_to_array(path,'/'),1)-1]$$;
 create table realtime.messages(id uuid primary key default gen_random_uuid(),extension text);
 create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
 alter table storage.objects enable row level security; alter table realtime.messages enable row level security;
 grant usage on schema public,auth,storage,realtime to anon,authenticated,service_role;
 grant all on storage.objects to authenticated,service_role; grant select on storage.objects to anon;
 grant select,insert on realtime.messages to authenticated;
 create publication supabase_realtime;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
 `);
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
   const sql=readFileSync(`supabase/migrations/${f}`,'utf8').replace(/create extension if not exists pgcrypto;/i,'');
   try{await db.exec(sql);}catch(error){throw new Error(`Baseline ${f}: ${error.message}`);}
 }


 const profile = n => id(n + 10);
 for (let n=1;n<=9;n++) {
   await db.query('insert into auth.users(id,email) values($1,$2)', [id(n), `synthetic${n}@example.test`]);
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
