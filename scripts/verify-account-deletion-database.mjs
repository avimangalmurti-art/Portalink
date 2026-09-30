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
 -- Replace only the provider's network sender; messaging triggers still run.
 create table realtime.test_sent_events(sequence bigserial primary key,payload jsonb,event text,topic text,private boolean);
 create function realtime.send(payload jsonb,event text,topic text,private boolean default true)
 returns void language sql as $$insert into realtime.test_sent_events(payload,event,topic,private) values($1,$2,$3,$4)$$;
 revoke all on function realtime.send(jsonb,text,text,boolean) from public,anon,authenticated;
 alter table storage.objects enable row level security; alter table realtime.messages enable row level security;
 grant usage on schema public,auth,storage,realtime to anon,authenticated,service_role;
 grant all on storage.objects to authenticated,service_role;
 grant select,insert on realtime.messages to authenticated;
 create publication supabase_realtime;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 `);
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
   const sql=readFileSync(`supabase/migrations/${f}`,'utf8').replace(/create extension if not exists pgcrypto;/i,'');
   try{await db.exec(sql);}catch(error){throw new Error(`Baseline ${f}: ${error.message}`);}
 }
 await check('candidate applies atomically to the full existing migration history',async()=>{
   try { await db.exec(readFileSync('supabase/pending/account_deletion_safety.sql','utf8')); }
   catch(error) { throw new Error(`Candidate: ${error.message}; position ${error.position}`); }
 });
 await system();
 for(const n of [1,2,3]){
   await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),`test${n}@example.test`]);
   await db.query('insert into public.profiles(id,account_id,name,handle,headline) values($1,$2,$3,$4,$5)',[id(n+10),id(n),`Person ${n}`,`person${n}`,'']);
 }
 const c=id(100),a=id(101),b=id(102),aFile=`${id(11)}/${c}/own.png`,bFile=`${id(12)}/${c}/survivor.png`;
 await db.query("insert into direct_conversations(id,participant_one_profile_id,participant_two_profile_id,status,established_at) values($1,$2,$3,'active',now())",[c,id(11),id(12)]);
 await db.query('insert into direct_messages(id,conversation_id,sender_profile_id,body) values($1,$2,$3,$4),($5,$2,$6,$7)',[a,c,id(11),'Departing original',b,id(12),'Surviving original']);
 await db.query("insert into storage.objects(bucket_id,name) values('message-media',$1),('message-media',$2),('avatars',$3)",[aFile,bFile,`${id(1)}/avatar.png`]);
 await db.query("insert into direct_message_attachments(id,message_id,file_name,mime_type,size_bytes,storage_path) values($1,$2,'own.png','image/png',100,$3),($4,$5,'survivor.png','image/png',200,$6)",[id(103),a,aFile,id(104),b,bFile]);
 const ownProject=id(201), survivorProject=id(202), pdfPath=`${id(11)}/draft/source.pdf`;
 for(const [project,profile] of [[ownProject,id(11)],[survivorProject,id(12)]]){
   const category=await scalar('select id from portfolio_categories where profile_id=$1 limit 1',[profile]);
   await db.query('insert into projects(id,profile_id,category_id,title,summary) values($1,$2,$3,$4,$5)',[project,profile,category,'Synthetic project','Synthetic description']);
 }
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('project-media',$1,'{\"size\":100,\"mimetype\":\"application/pdf\"}')",[pdfPath]);
 await db.query("insert into project_attachments(id,project_id,kind,file_name,display_name,extension,mime_type,size_bytes,type_label,storage_path,status) values($1,$2,'document','source.pdf','source.pdf','pdf','application/pdf',100,'PDF',$1,'ready')",[pdfPath,ownProject]);
 await db.query('insert into project_comments(id,project_id,author_profile_id,body) values($1,$2,$3,$4)',[id(210),survivorProject,id(11),'Departing comment']);
 await db.query('insert into project_comments(id,project_id,author_profile_id,body,parent_id,root_id) values($1,$2,$3,$4,$5,$5)',[id(211),survivorProject,id(12),'Survivor reply',id(210)]);
 let job;
 await check('all release gates start OFF and browser roles cannot request or mutate lifecycle data',async()=>{
   await assert.rejects(db.query('select request_account_deletion($1)',[id(1)]),/disabled/);
   await assert.rejects(db.query('select claim_account_deletion()'),/disabled/);
   await user(1);
   await assert.rejects(db.query('select request_account_deletion($1)',[id(1)]),/permission denied/);
   await assert.rejects(db.query('delete from profiles where id=$1',[id(11)]),/permission denied/);
   await assert.rejects(db.query('update profiles set pending_deletion_at=now() where id=$1',[id(11)]),/permission denied/);
   await assert.rejects(db.query('select * from deletion_private.jobs'),/permission denied/);
   await system();
   await db.exec('update deletion_private.release_gate set requests_enabled=true,worker_enabled=true');
 });
 await check('soft deletion is idempotent, marks only own content and never removes originals',async()=>{
   job=await scalar('select request_account_deletion($1)',[id(1)]);
   assert.equal((await scalar('select request_account_deletion($1)',[id(1)])).id,job.id);
   assert.equal(await scalar('select body from direct_messages where id=$1',[a]),'Departing original');
   assert.equal(await scalar('select count(*)::int from storage.objects'),4);
   assert.equal(await scalar('select count(*)::int from direct_messages where pending_deletion_at is not null'),1);
   assert.equal(await scalar('select count(*)::int from direct_message_attachments where pending_deletion_at is not null'),1);
   assert.equal(await scalar('select claim_account_deletion()'),null);
 });
 await check('grace blocks edits, uploads, removal, moves and premature Auth deletion',async()=>{
   await assert.rejects(db.query('update direct_messages set body=$1 where id=$2',['changed',a]),/pending deletion/);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('message-media',$1)",[`${id(11)}/${c}/late.png`]),/pending deletion/);
   await assert.rejects(db.query('delete from storage.objects where name=$1',[aFile]),/removal disabled/);
   await assert.rejects(db.query('update storage.objects set name=$1 where name=$2',[`${id(12)}/moved.png`,aFile]),/move disabled/);
   await assert.rejects(db.query('delete from auth.users where id=$1',[id(1)]),/pending deletion|lifecycle/);
   assert.equal((await db.query("select * from claim_pdf_processing_job('synthetic-worker')")).rows.length,0);
   await assert.rejects(db.query("update pdf_processing_jobs set status='processing' where post_id=$1",[ownProject]),/pending deletion/);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('project-media',$1)",[`posts/${ownProject}/pages/late.webp`]),/pending deletion/);
 });
 await check('cancel restores exact original values, files and pending markers, even with new requests disabled',async()=>{
   await db.exec('update deletion_private.release_gate set requests_enabled=false');
   assert.equal((await scalar('select cancel_account_deletion($1)',[id(1)])).status,'cancelled');
   assert.equal(await scalar('select count(*)::int from direct_messages where pending_deletion_at is not null'),0);
   assert.equal(await scalar('select body from direct_messages where id=$1',[a]),'Departing original');
   assert.equal(await scalar('select count(*)::int from storage.objects'),4);
   assert.equal(await scalar('select status from pdf_processing_jobs where post_id=$1',[ownProject]),'queued');
   await db.exec('update deletion_private.release_gate set requests_enabled=true');
   job=await scalar('select request_account_deletion($1)',[id(1)]);
 });
 let claim, keys;
 await check('hard deletion cannot start early; expired leases can resume and stale checkpoints fail',async()=>{
   // Advance only the synthetic clock through timestamps, preserving 48h check.
   await db.query("update deletion_private.jobs set requested_at=now()-interval '49 hours',delete_after=now()-interval '1 hour' where id=$1",[job.id]);
   claim=await scalar('select claim_account_deletion()');
   assert.ok(claim.lease_token); assert.equal(await scalar('select claim_account_deletion()'),null);
   await assert.rejects(db.query('select cancel_account_deletion($1)',[id(1)]),/permanent deletion has started/);
   const oldLease=claim.lease_token;
   await db.query("update deletion_private.jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);
   claim=await scalar('select claim_account_deletion()'); keys=[job.id,claim.lease_token];
   await assert.rejects(db.query('select account_deletion_batch($1,$2)',[job.id,oldLease]),/invalid deletion lease/);
 });
 await check('cross-owner attachment references in either direction halt cleanup without removing anything',async()=>{
   for(const [attachment,path] of [[id(103),`${id(12)}/${c}/foreign.png`],[id(104),`${id(11)}/${c}/unexpected.png`]]){
     await db.exec("begin; select set_config('portalink.deletion_internal','on',true)");
     await db.query('update direct_message_attachments set storage_path=$1 where id=$2',[path,attachment]);
     await db.exec("select set_config('portalink.deletion_internal','off',true)");
     await assert.rejects(db.query('select account_deletion_batch($1,$2)',keys),/manual review required/);
     await db.exec('rollback');
     assert.equal(await scalar('select count(*)::int from storage.objects'),4);
   }
 });
 await check('manifest contains only owned objects; counterpart messages and objects survive cleanup',async()=>{
   const batch=await scalar('select account_deletion_batch($1,$2)',keys);
   assert.equal(batch.phase,'storage'); assert.equal(batch.files.length,3);
   assert.ok(batch.files.every(f=>f.path!==bFile));
   await user(1);
   await assert.rejects(db.query('delete from storage.objects where name=$1',[aFile]),/removal disabled/);
   await system();
   await assert.rejects(db.query('select checkpoint_account_deletion_files($1,$2,$3)',[...keys,JSON.stringify(batch.files)]),/not confirmed/);
   // Simulate Storage API deleting metadata ONLY in this in-memory fixture.
   for(const f of batch.files)await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[f.bucket,f.path]);
   await db.query('select checkpoint_account_deletion_files($1,$2,$3)',[...keys,JSON.stringify(batch.files)]);
   await db.query('select checkpoint_account_deletion_files($1,$2,$3)',[...keys,JSON.stringify(batch.files)]);
   assert.equal((await scalar('select account_deletion_batch($1,$2)',keys)).phase,'anonymize');
   await db.query('select anonymize_account_deletion($1,$2)',keys);
   await db.query('select anonymize_account_deletion($1,$2)',keys);
   assert.equal(await scalar('select count(*)::int from direct_conversations where id=$1',[c]),1);
   assert.equal(await scalar('select body from direct_messages where id=$1',[b]),'Surviving original');
   assert.equal(await scalar('select body from direct_messages where id=$1',[a]),'Message removed');
   assert.equal(await scalar('select sender_profile_id from direct_messages where id=$1',[a]),null);
   assert.equal(await scalar('select count(*)::int from direct_message_attachments'),2);
   assert.equal(await scalar('select storage_path from direct_message_attachments where id=$1',[id(103)]),null);
   assert.equal(await scalar('select storage_path from direct_message_attachments where id=$1',[id(104)]),bFile);
   assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[bFile]),1);
   assert.equal(await scalar('select count(*)::int from projects where id=$1',[survivorProject]),1);
   assert.equal(await scalar('select count(*)::int from projects where id=$1',[ownProject]),0);
   assert.equal(await scalar('select body from project_comments where id=$1',[id(211)]),'Survivor reply');
 });
 await check('remaining participant reads history; an unrelated user cannot exploit NULL membership',async()=>{
   await user(2); assert.equal(await scalar('select count(*)::int from direct_messages where conversation_id=$1',[c]),2);
   assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[bFile]),1);
   await db.query('select mark_direct_conversation_read($1,now())',[c]);
   await assert.rejects(db.query('select send_direct_message($1,$2)',[c,'Cannot send']),/blocked/);
   await user(3); assert.equal(await scalar('select count(*)::int from direct_messages where conversation_id=$1',[c]),0);
   for(const sql of ['select send_direct_message($1,\'Intrusion\')','select accept_direct_message_request($1)','select delete_direct_message_request($1)'])await assert.rejects(db.query(sql,[c]),/permission denied/);
   await system();
 });
 await check('Auth must really be absent before completion; durable fences survive Auth/profile removal',async()=>{
   await assert.rejects(db.query('select finish_account_deletion($1,$2)',keys),/not confirmed/);
   await db.query('delete from auth.users where id=$1',[id(1)]);
   await db.query('select finish_account_deletion($1,$2)',keys);
   assert.equal(await scalar('select status from deletion_private.jobs where id=$1',[job.id]),'completed');
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('message-media',$1)",[aFile]),/pending deletion/);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('project-media',$1)",[`posts/${ownProject}/pages/late.webp`]),/pending deletion/);
   assert.equal(await scalar('select count(*)::int from direct_messages where conversation_id=$1',[c]),2);
 });
 await check('survivor can later remove their own project containing tombstoned comments',async()=>{
   await user(2);await db.query('delete from projects where id=$1',[survivorProject]);
   await system();assert.equal(await scalar('select count(*)::int from projects where id=$1',[survivorProject]),0);
 });
 await check('a failed soft-delete transaction rolls back the job and every pending marker',async()=>{
   await db.exec(`create function deletion_private.inject_test_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic failure'; end$$;
    create trigger synthetic_request_failure before update of pending_deletion_at on direct_messages for each row execute function deletion_private.inject_test_failure();`);
   await assert.rejects(db.query('select request_account_deletion($1)',[id(2)]),/synthetic failure/);
   assert.equal(await scalar('select count(*)::int from deletion_private.jobs where account_id=$1',[id(2)]),0);
   assert.equal(await scalar('select pending_deletion_at from profiles where id=$1',[id(12)]),null);
   await db.exec('drop trigger synthetic_request_failure on direct_messages');
 });
 await check('account without a public profile deletes only its own avatar and Auth identity',async()=>{
   await db.query('insert into auth.users(id,email) values($1,$2)',[id(4),'no-profile@example.test']);
   const avatar=`${id(4)}/avatar.png`;
   await db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)",[avatar]);
   const onlyAccount=await scalar('select request_account_deletion($1)',[id(4)]);
   await db.query("update deletion_private.jobs set requested_at=now()-interval '49 hours',delete_after=now()-interval '1 hour' where id=$1",[onlyAccount.id]);
   const claimed=await scalar('select claim_account_deletion()'); const k=[claimed.id,claimed.lease_token];
   const batch=await scalar('select account_deletion_batch($1,$2)',k);
   assert.deepEqual(batch.files,[{bucket:'avatars',path:avatar}]);
   await db.query('delete from storage.objects where name=$1',[avatar]);
   await db.query('select checkpoint_account_deletion_files($1,$2,$3)',[...k,JSON.stringify(batch.files)]);
   await db.query('select account_deletion_batch($1,$2)',k);
   await db.query('select anonymize_account_deletion($1,$2)',k);
   await db.query('delete from auth.users where id=$1',[id(4)]);
   await db.query('select finish_account_deletion($1,$2)',k);
   assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[bFile]),1);
 });
 console.log(`${passed} database safety checks passed (synthetic data only).`);
} catch(error) { console.error(`FAIL ${error.message}${error.detail ? ` (${error.detail})` : ''}`); process.exitCode=1; }
finally { await db.close(); }
