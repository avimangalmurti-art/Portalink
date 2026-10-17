// In-memory PostgreSQL ONLY. No network, Supabase credentials or real accounts.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { deletionManifestDigest } from '../supabase/pending/deletion-d1.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE_PATH ? pathToFileURL(process.env.PGLITE_MODULE_PATH).href : '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let passed=0;
const check=async(name,fn)=>{await fn(); passed++; console.log(`PASS ${name}`);};
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const receiptDigest=n=>String(n).padStart(64,'0');
const issueReceipt=async(n,hash=receiptDigest(n))=>db.query("select prepare_account_deletion_receipt($1,$2,now(),$3,now()+interval '1 hour',now()+interval '3 hours')",[id(n),id(n+10_000),hash]);
const requestDeletion=async n=>{
  if(!await scalar('select count(*)::int from deletion_private.receipts where token_hash=$1',[receiptDigest(n)]))await issueReceipt(n);
  return scalar('select request_account_deletion($1,$2,now(),$3)',[id(n),id(n+10_000),receiptDigest(n)]);
};
const checkpointD1=async keys=>{
  const batch=await scalar('select account_deletion_batch($1,$2)',keys);
  assert.equal(batch.phase,'d1');
  const manifest=batch.manifest,digest=await deletionManifestDigest(manifest);
  const args=[...keys,manifest.accountId,manifest.ownedProjectIds,digest];
  await db.query('select checkpoint_account_deletion_d1($1,$2,$3,$4,$5)',args);
  await db.query('select checkpoint_account_deletion_d1($1,$2,$3,$4,$5)',args);
  return manifest;
};
const system=async()=>{await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.session_id','',false); select set_config('request.jwt.claim.role','service_role',false)");};
const user=async n=>{await system();await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)",[id(n),id(n+10_000)]);await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated");};
try {
 await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
 create schema auth; create schema storage; create schema realtime;
 create table auth.users(id uuid primary key,email text);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,user_agent text,created_at timestamptz not null default now(),refreshed_at timestamptz,not_after timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',current_setting('request.jwt.claim.sub',true),'role',current_setting('request.jwt.claim.role',true),'session_id',current_setting('request.jwt.claim.session_id',true))$$;
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
 // The recorded September 30 manual prerequisites are not represented by
 // migration files. Later citation migrations require their Journey columns.
 // Load the reviewed sources only into this brand-new in-memory fixture.
 let manualPrerequisitesLoaded=false;
 const loadManualPrerequisites=async()=>{
   for(const f of ['cover_thumbnail_schema.sql','project_covers_public_bucket.sql','share_cover_capability.sql','profile_handle_addresses.sql','profile_journey.sql','profile_employer.sql']){
     try{await db.exec(readFileSync(`supabase/pending/${f}`,'utf8'));}
     catch(error){throw new Error(`Synthetic prerequisite ${f}: ${error.message}`);}
   }
   manualPrerequisitesLoaded=true;
 };
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
   if(!manualPrerequisitesLoaded && f.startsWith('202610'))await loadManualPrerequisites();
   const sql=readFileSync(`supabase/migrations/${f}`,'utf8').replace(/create extension if not exists pgcrypto;/i,'');
   try{await db.exec(sql);}catch(error){throw new Error(`Baseline ${f}: ${error.message}`);}
 }
 if(!manualPrerequisitesLoaded)await loadManualPrerequisites();
 await check('candidate applies atomically to the full existing migration history',async()=>{
   try { await db.exec(readFileSync('supabase/pending/account_deletion_safety.sql','utf8')); }
   catch(error) { throw new Error(`Candidate: ${error.message}; position ${error.position}`); }
 });
 await system();
 for(const n of [1,2,3]){
   await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),`test${n}@example.test`]);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(n+10_000),id(n)]);
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
 const ownCover=`${id(11)}/${ownProject}/${'a'.repeat(64)}/400.webp`, survivorCover=`${id(12)}/${survivorProject}/${'a'.repeat(64)}/400.webp`;
 await db.exec('set role service_role');
 await db.query("insert into storage.objects(bucket_id,name) values('project-covers',$1),('project-covers',$2)",[ownCover,survivorCover]);
 await db.exec('reset role');
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('project-media',$1,'{\"size\":100,\"mimetype\":\"application/pdf\"}')",[pdfPath]);
 await db.query("insert into project_attachments(id,project_id,kind,file_name,display_name,extension,mime_type,size_bytes,type_label,storage_path,status) values($1,$2,'document','source.pdf','source.pdf','pdf','application/pdf',100,'PDF',$1,'ready')",[pdfPath,ownProject]);
 await db.query('insert into project_comments(id,project_id,author_profile_id,body) values($1,$2,$3,$4)',[id(210),survivorProject,id(11),'Departing comment']);
 await db.query('insert into project_comments(id,project_id,author_profile_id,body,parent_id,root_id) values($1,$2,$3,$4,$5,$5)',[id(211),survivorProject,id(12),'Survivor reply',id(210)]);
 let job;
 await db.query("insert into public.profile_handle_state(profile_id,confirmed_at,shared_at) values($1,now(),now()) on conflict(profile_id) do update set confirmed_at=now(),shared_at=now()",[id(11)]);
 await db.query("insert into public.profile_handle_aliases(handle,profile_id,expires_at) values('priorperson', $1, now()+interval '90 days')",[id(11)]);
 await check('all release gates start OFF and browser roles cannot request or mutate lifecycle data',async()=>{
   await assert.rejects(db.query('select request_account_deletion($1)',[id(1)]),/disabled/);
   await assert.rejects(db.query('select claim_account_deletion()'),/disabled/);
   await user(1);
   await assert.rejects(db.query('select request_account_deletion($1)',[id(1)]),/permission denied/);
   await assert.rejects(db.query('delete from profiles where id=$1',[id(11)]),/permission denied/);
   await assert.rejects(db.query('select * from deletion_private.jobs'),/permission denied/);
   await assert.rejects(db.query('select * from deletion_private.email_reservations'),/permission denied/);
   await assert.rejects(db.query('select * from deletion_private.receipts'),/permission denied/);
   await assert.rejects(db.query('select account_deletion_receipt_status($1)',[receiptDigest(1)]),/permission denied/);
   await system();
   await db.exec('update deletion_private.release_gate set requests_enabled=true,worker_enabled=true');
 });
 await check('request requires recent sign-in evidence and the exact active session for that account',async()=>{
   await issueReceipt(1);
   await assert.rejects(db.query('select request_account_deletion($1)',[id(1)]),/recent sign-in required/);
   for(const age of ["now()-interval '301 seconds'", "now()+interval '1 second'"]){
     await assert.rejects(db.query(`select request_account_deletion($1,$2,${age})`,[id(1),id(10_001)]),/recent sign-in required/);
   }
   for(const session of [null,id(10_002),id(99_999)]){
     await assert.rejects(db.query('select request_account_deletion($1,$2,now())',[id(1),session]),/active account session required/);
   }
   await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[id(10_001)]);
   await assert.rejects(db.query('select request_account_deletion($1,$2,now())',[id(1),id(10_001)]),/active account session required/);
   await db.query('update auth.sessions set not_after=null where id=$1',[id(10_001)]);
   assert.equal(await scalar('select count(*)::int from deletion_private.jobs'),0);
   await db.exec('begin');
   assert.equal((await scalar("select request_account_deletion($1,$2,now()-interval '5 minutes',$3)",[id(1),id(10_001),receiptDigest(1)])).status,'processing');
   await db.exec('rollback');
   assert.equal(await scalar('select count(*)::int from deletion_private.jobs'),0);
 });
 await check('receipt is account-bound, has no raw capability column and cannot start deletion without fresh consent proof',async()=>{
   await issueReceipt(1,'d'.repeat(64));
   assert.equal((await scalar('select account_deletion_receipt_status($1)',[receiptDigest(1)])).status,'none');
   assert.equal((await scalar('select account_deletion_receipt_status($1)',['d'.repeat(64)])).status,'none');
   await assert.rejects(db.query('select request_account_deletion($1,$2,now(),$3)',[id(2),id(10_002),receiptDigest(1)]),/valid deletion receipt required/);
   await assert.rejects(db.query('select request_account_deletion($1,$2,now())',[id(1),id(10_001)]),/valid deletion receipt required/);
   assert.equal(await scalar("select count(*)::int from information_schema.columns where table_schema='deletion_private' and table_name='receipts' and column_name in ('receipt','token','raw_token')"),0);
   assert.deepEqual(await scalar('select account_deletion_receipt_status($1)',['f'.repeat(64)]),{});
 });
 await check('request immediately and irreversibly locks its own account, is idempotent and reports processing honestly',async()=>{
   job=await requestDeletion(1);
   assert.equal((await requestDeletion(1)).id,job.id);
   assert.equal(await scalar('select body from direct_messages where id=$1',[a]),'Departing original');
   assert.equal(await scalar('select count(*)::int from storage.objects'),6);
   assert.equal(job.status,'processing'); assert.equal(job.isDeleted,false);
   assert.equal(await scalar('select status from deletion_private.jobs where id=$1',[job.id]),'deleting');
   assert.equal(await scalar('select count(*)::int from deletion_private.jobs where irreversible_started_at=requested_at and id=$1',[job.id]),1);
   assert.equal(await scalar("select count(*)::int from information_schema.columns where column_name in ('pending_deletion_at','delete_after') and table_schema in ('public','deletion_private')"),0);
   assert.equal(await scalar("select to_regprocedure('public.cancel_account_deletion(uuid)')"),null);
   assert.equal((await scalar('select account_deletion_status($1)',[id(1)])).isDeleted,false);
   assert.equal(await scalar('select claim_account_deletion($1)',[id(2)]),null);
   await assert.rejects(db.query('select account_deletion_batch($1,null)',[job.id]),/invalid deletion lease/);
   await issueReceipt(1,'c'.repeat(64));
   assert.deepEqual(await scalar('select account_deletion_receipt_status($1)',['c'.repeat(64)]),{status:'processing',isDeleted:false});
   assert.deepEqual(await scalar('select account_deletion_receipt_status($1)',[receiptDigest(1)]),{status:'processing',isDeleted:false});
   assert.deepEqual(await scalar('select account_deletion_receipt_status($1)',['d'.repeat(64)]),{status:'processing',isDeleted:false});
 });
 await check('deleting accounts block edits, uploads, removal, moves, PDF work and premature Auth deletion',async()=>{
   await assert.rejects(db.query('update direct_messages set body=$1 where id=$2',['changed',a]),/account deleting/);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('message-media',$1)",[`${id(11)}/${c}/late.png`]),/owner deleting/);
   await assert.rejects(db.query('delete from storage.objects where name=$1',[aFile]),/removal disabled/);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('project-covers',$1)",[`${id(11)}/${ownProject}/${'b'.repeat(64)}/400.webp`]),/owner deleting/);
   await assert.rejects(db.query('update storage.objects set name=$1 where name=$2',[`${id(12)}/moved.png`,aFile]),/move disabled/);
   await assert.rejects(db.query('delete from auth.users where id=$1',[id(1)]),/lifecycle/);
   assert.equal((await db.query("select * from claim_pdf_processing_job('synthetic-worker')")).rows.length,0);
   await assert.rejects(db.query("update pdf_processing_jobs set status='processing' where post_id=$1",[ownProject]),/account deleting/);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('project-media',$1)",[`posts/${ownProject}/pages/late.webp`]),/owner deleting/);
 });
 await check('email equality is reserved through the Auth boundary without treating different plus or dot addresses as aliases',async()=>{
   await db.exec('update deletion_private.release_gate set requests_enabled=false');
   assert.equal((await scalar('select account_deletion_status($1)',[id(1)])).status,'processing');
   assert.equal(await scalar('select count(*)::int from deletion_private.email_reservations where job_id=$1',[job.id]),1);
   for(const email of ['test1@example.test',' TEST1@EXAMPLE.TEST ','\tTEST1@example.test\n','\u00a0TEST1@example.test\ufeff']){
     await assert.rejects(db.query('insert into auth.users(id,email) values($1,$2)',[id(5),email]),/email deletion has not completed/);
     await assert.rejects(db.query('update auth.users set email=$1 where id=$2',[email,id(2)]),/email deletion has not completed/);
   }
   await assert.rejects(db.query('update auth.users set email=$1 where id=$2',['changed@example.test',id(1)]),/email change disabled/);
   await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[id(6),'test1+distinct@example.test',id(7),'test.1@example.test']);
   await db.exec('update deletion_private.release_gate set requests_enabled=true');
 });
 await check('stale service writes cannot escape a deleting row by moving either direction across owners',async()=>{
   const survivorCategory=await scalar('select id from portfolio_categories where profile_id=$1 limit 1',[id(12)]);
   await assert.rejects(db.query('update projects set profile_id=$1,category_id=$2 where id=$3',[id(12),survivorCategory,ownProject]),/account deleting/);
   await assert.rejects(db.query('update direct_messages set sender_profile_id=$1 where id=$2',[id(12),a]),/account deleting/);
   await assert.rejects(db.query('update direct_messages set sender_profile_id=$1 where id=$2',[id(11),b]),/account deleting/);
   await assert.rejects(db.query('update direct_message_attachments set message_id=$1 where id=$2',[b,id(103)]),/account deleting/);
   assert.equal(await scalar('select profile_id from projects where id=$1',[ownProject]),id(11));
   assert.equal(await scalar('select message_id from direct_message_attachments where id=$1',[id(103)]),a);
 });
 let claim, keys, fileBatch;
 await check('request is claimable immediately; expired leases resume and stale or null checkpoints fail',async()=>{

   claim=await scalar('select claim_account_deletion()');
   assert.equal(claim.status,'deleting'); assert.equal(claim.id,job.id);
   assert.ok(claim.lease_token); assert.equal(await scalar('select claim_account_deletion()'),null);
   const oldLease=claim.lease_token;
   await db.query("update deletion_private.jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);
   claim=await scalar('select claim_account_deletion()'); keys=[job.id,claim.lease_token];
   await assert.rejects(db.query('select account_deletion_batch($1,$2)',[job.id,oldLease]),/invalid deletion lease/);
   await assert.rejects(db.query('select account_deletion_batch($1,null)',[job.id]),/invalid deletion lease/);
 });
 await check('cross-owner attachment references in either direction halt cleanup without removing anything',async()=>{
   for(const [attachment,path] of [[id(103),`${id(12)}/${c}/foreign.png`],[id(104),`${id(11)}/${c}/unexpected.png`]]){
     await db.exec("begin; select set_config('portalink.deletion_internal','on',true)");
     await db.query('update direct_message_attachments set storage_path=$1 where id=$2',[path,attachment]);
     await db.exec("select set_config('portalink.deletion_internal','off',true)");
     await assert.rejects(db.query('select account_deletion_batch($1,$2)',keys),/manual review required/);
     await db.exec('rollback');
     assert.equal(await scalar('select count(*)::int from storage.objects'),6);
   }
 });
 await check('manifest contains only owned objects and checkpoints require confirmed absence',async()=>{
   const batch=await scalar('select account_deletion_batch($1,$2)',keys);
   assert.equal(batch.phase,'storage'); assert.equal(batch.files.length,4);
   assert.ok(batch.files.every(f=>f.path!==bFile&&f.path!==survivorCover));
   assert.ok(batch.files.some(f=>f.bucket==='project-covers'&&f.path===ownCover));
   await user(1);
   await assert.rejects(db.query('delete from storage.objects where name=$1',[aFile]),/removal disabled/);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('project-covers',$1)",[`${id(11)}/${ownProject}/${'b'.repeat(64)}/400.webp`]),/owner deleting/);
   await system();
   await assert.rejects(db.query('select checkpoint_account_deletion_files($1,$2,$3)',[...keys,JSON.stringify(batch.files)]),/not confirmed/);
   fileBatch=batch;
 });
 await check('interrupted Storage cleanup retains acknowledged checkpoints and email until a fresh lease resumes',async()=>{
   const [confirmed,unconfirmed]=fileBatch.files;
   await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[confirmed.bucket,confirmed.path]);
   await db.query('select checkpoint_account_deletion_files($1,$2,$3)',[...keys,JSON.stringify([confirmed])]);
   await assert.rejects(db.query('select checkpoint_account_deletion_files($1,$2,$3)',[...keys,JSON.stringify([unconfirmed])]),/not confirmed/);
   const interruptedLease=keys[1];
   await db.query('select fail_account_deletion($1,$2,$3)',[...keys,'Synthetic Storage checkpoint failure']);
   assert.equal(await scalar('select count(*)::int from deletion_private.files where job_id=$1 and removed_at is not null',[job.id]),1);
   assert.equal(await scalar('select phase from deletion_private.jobs where id=$1',[job.id]),'storage');
   assert.equal(await scalar('select last_error from deletion_private.jobs where id=$1',[job.id]),'Synthetic Storage checkpoint failure');
   assert.equal((await scalar('select account_deletion_status($1)',[id(1)])).isDeleted,false);
   assert.equal(await scalar('select count(*)::int from deletion_private.email_reservations where job_id=$1',[job.id]),1);
   await db.query("update deletion_private.jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);
   claim=await scalar('select claim_account_deletion($1)',[id(1)]); assert.equal(claim.id,job.id);
   keys=[job.id,claim.lease_token];
   await assert.rejects(db.query('select checkpoint_account_deletion_files($1,$2,$3)',[job.id,interruptedLease,JSON.stringify([unconfirmed])]),/invalid deletion lease/);
   fileBatch=await scalar('select account_deletion_batch($1,$2)',keys);
   assert.equal(fileBatch.phase,'storage'); assert.equal(fileBatch.files.length,3);
   assert.equal(fileBatch.files.some(file=>file.bucket===confirmed.bucket&&file.path===confirmed.path),false);
 });
 await check('resumed cleanup preserves counterpart messages, attachments, objects and replies',async()=>{
   // Simulate Storage API deleting metadata ONLY in this in-memory fixture.
   for(const f of fileBatch.files)await db.query('delete from storage.objects where bucket_id=$1 and name=$2',[f.bucket,f.path]);
   await db.query('select checkpoint_account_deletion_files($1,$2,$3)',[...keys,JSON.stringify(fileBatch.files)]);
   await db.query('select checkpoint_account_deletion_files($1,$2,$3)',[...keys,JSON.stringify(fileBatch.files)]);
   assert.equal((await scalar('select account_deletion_batch($1,$2)',keys)).phase,'anonymize');
   await assert.rejects(db.query('delete from auth.users where id=$1',[id(1)]),/lifecycle/);
   await db.query('select anonymize_account_deletion($1,$2)',keys);
   await db.query('select anonymize_account_deletion($1,$2)',keys);
   await assert.rejects(db.query('delete from auth.users where id=$1',[id(1)]),/lifecycle/);
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
 await check('D1 checkpoint requires the exact immutable account/project manifest before Auth and survives retry',async()=>{
   const batch=await scalar('select account_deletion_batch($1,$2)',keys);
   assert.deepEqual(batch.manifest,{version:1,jobId:job.id,accountId:id(1),ownedProjectIds:[ownProject]});
   await assert.rejects(db.query('select checkpoint_account_deletion_d1($1,$2,$3,$4,$5)',[...keys,id(2),[ownProject],'a'.repeat(64)]),/D1 checkpoint mismatch/);
   await assert.rejects(db.query('select checkpoint_account_deletion_d1($1,$2,$3,$4,$5)',[...keys,id(1),[survivorProject],'a'.repeat(64)]),/D1 checkpoint mismatch/);
   await assert.rejects(db.query('select checkpoint_account_deletion_d1($1,$2,$3,$4,$5)',[...keys,id(1),[ownProject],'invalid']),/D1 checkpoint mismatch/);
   await assert.rejects(db.query('select finish_account_deletion($1,$2)',keys),/auth deletion not confirmed/);
   await checkpointD1(keys);
   assert.equal(await scalar('select d1_completed_at is not null from deletion_private.jobs where id=$1',[job.id]),true);
   assert.equal((await scalar('select account_deletion_batch($1,$2)',keys)).phase,'auth');
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
 await check('Auth absence alone never reports completion or releases email before Storage reconciliation and finish',async()=>{
   await assert.rejects(db.query('select finish_account_deletion($1,$2)',keys),/not confirmed/);
   await db.query('delete from auth.users where id=$1',[id(1)]);
   assert.equal((await scalar('select account_deletion_status($1)',[id(1)])).isDeleted,false);
   assert.deepEqual(await scalar('select account_deletion_receipt_status($1)',[receiptDigest(1)]),{status:'processing',isDeleted:false});
   assert.equal(await scalar('select count(*)::int from deletion_private.email_reservations where job_id=$1',[job.id]),1);
   await assert.rejects(db.query('insert into auth.users(id,email) values($1,$2)',[id(5),'TEST1@example.test']),/email deletion has not completed/);
   await assert.rejects(db.query('update auth.users set email=$1 where id=$2',['test1@example.test',id(2)]),/email deletion has not completed/);
   // Bypass ONLY the in-memory metadata fence to represent a late provider
   // object; completion must still fail and retain the email reservation.
   await db.exec('begin; alter table storage.objects disable trigger account_deletion_storage_fence');
   await db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)",[`${id(1)}/synthetic-late.png`]);
   await assert.rejects(db.query('select finish_account_deletion($1,$2)',keys),/storage reconciliation incomplete/);
   await db.exec('rollback');
   assert.equal((await scalar('select account_deletion_status($1)',[id(1)])).isDeleted,false);
   assert.equal(await scalar('select count(*)::int from deletion_private.email_reservations where job_id=$1',[job.id]),1);
   await db.query('select finish_account_deletion($1,$2)',keys);
   assert.equal(await scalar('select status from deletion_private.jobs where id=$1',[job.id]),'completed');
   assert.equal((await scalar('select account_deletion_status($1)',[id(1)])).isDeleted,true);
   assert.equal(await scalar('select count(*)::int from deletion_private.email_reservations where job_id=$1',[job.id]),0);
   await db.query('insert into auth.users(id,email) values($1,$2)',[id(5),'test1@example.test']);
   await assert.rejects(db.query('update auth.users set email=$1 where id=$2',[' TEST1@example.test ',id(2)]),/email already in use/);
   await assert.rejects(db.query('insert into auth.users(id,email) values($1,$2)',[id(1),'another@example.test']),/identifier cannot be reused/);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('message-media',$1)",[aFile]),/owner deleting/);
   await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('project-media',$1)",[`posts/${ownProject}/pages/late.webp`]),/owner deleting/);
   assert.equal(await scalar('select count(*)::int from direct_messages where conversation_id=$1',[c]),2);
 });
 await check('receipts survive Auth removal, return minimal canonical completion, expire and purge on configured eligibility',async()=>{
   for(const hash of [receiptDigest(1),'c'.repeat(64)])assert.deepEqual(await scalar('select account_deletion_receipt_status($1)',[hash]),{status:'completed',isDeleted:true});
   await db.exec('begin');
   await db.query("update deletion_private.jobs set phase='auth' where id=$1",[job.id]);
   assert.deepEqual(await scalar('select account_deletion_receipt_status($1)',[receiptDigest(1)]),{status:'processing',isDeleted:false});
   await db.exec('rollback');
   await db.query("update deletion_private.receipts set issued_at=now()-interval '2 hours',expires_at=now()-interval '1 hour',purge_after=now()+interval '1 hour' where token_hash=$1",['c'.repeat(64)]);
   assert.deepEqual(await scalar('select account_deletion_receipt_status($1)',['c'.repeat(64)]),{});
   assert.equal(await scalar('select count(*)::int from deletion_private.receipts where token_hash=$1',['c'.repeat(64)]),1);
   await db.query("update deletion_private.receipts set purge_after=expires_at where token_hash=$1",['c'.repeat(64)]);
   assert.deepEqual(await scalar('select account_deletion_receipt_status($1)',['c'.repeat(64)]),{});
   assert.equal(await scalar('select count(*)::int from deletion_private.receipts where token_hash=$1',['c'.repeat(64)]),0);
 });
 await check('completed deletion releases the current handle and old aliases immediately without a new hold',async()=>{
   assert.equal(await scalar('select count(*)::int from profile_handle_aliases where profile_id=$1',[id(11)]),0);
   assert.equal((await scalar("select profile_handle_available('person1')")).available,true);
   assert.equal((await scalar("select profile_handle_available('priorperson')")).available,true);
   await db.exec('begin');
   await user(3);
   assert.equal((await scalar("select claim_profile_handle($1,'person1')",[id(13)])).handle,'person1');
   assert.equal((await scalar("select claim_profile_handle($1,'priorperson')",[id(13)])).handle,'priorperson');
   await db.exec('rollback');
   await system();
 });
 await check('survivor retains normal owned-cover cleanup before removing their own project with tombstoned comments',async()=>{
   await user(2);
   assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[survivorCover]),1);
   await assert.rejects(db.query('delete from projects where id=$1',[survivorProject]),/Remove public cover thumbnails/);
   // The surviving owner deliberately removes their own cover in this fixture;
   // account deletion never selected or removed it.
   await db.query('delete from storage.objects where bucket_id=$1 and name=$2',['project-covers',survivorCover]);
   await db.query('delete from projects where id=$1',[survivorProject]);
   await system();assert.equal(await scalar('select count(*)::int from projects where id=$1',[survivorProject]),0);
 });
 await check('a failed reservation transaction rolls back its irreversible job and leaves the account untouched',async()=>{
   await db.exec(`create function deletion_private.inject_test_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic failure'; end$$;
    create trigger synthetic_request_failure before insert on deletion_private.email_reservations for each row execute function deletion_private.inject_test_failure();`);
   await assert.rejects(requestDeletion(2),/synthetic failure/);
   assert.equal(await scalar('select count(*)::int from deletion_private.jobs where account_id=$1',[id(2)]),0);
   assert.equal(await scalar('select count(*)::int from deletion_private.email_reservations where account_id=$1',[id(2)]),0);
   assert.equal(await scalar('select count(*)::int from profiles where id=$1',[id(12)]),1);
   assert.equal(await scalar('select body from direct_messages where id=$1',[b]),'Surviving original');
   await db.exec('drop trigger synthetic_request_failure on deletion_private.email_reservations');
 });
 await check('account without a public profile deletes only its own avatar and Auth identity',async()=>{
   await db.query('insert into auth.users(id,email) values($1,$2)',[id(4),'no-profile@example.test']);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(10_004),id(4)]);
   const avatar=`${id(4)}/avatar.png`;
   await db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)",[avatar]);
   const onlyAccount=await requestDeletion(4);
   await assert.rejects(db.query('delete from auth.users where id=$1',[id(4)]),/lifecycle/);
   const claimed=await scalar('select claim_account_deletion($1)',[id(4)]); const k=[claimed.id,claimed.lease_token];
   assert.equal(claimed.id,onlyAccount.id);
   const batch=await scalar('select account_deletion_batch($1,$2)',k);
   assert.deepEqual(batch.files,[{bucket:'avatars',path:avatar}]);
   await db.query('delete from storage.objects where name=$1',[avatar]);
   await db.query('select checkpoint_account_deletion_files($1,$2,$3)',[...k,JSON.stringify(batch.files)]);
   await db.query('select account_deletion_batch($1,$2)',k);
   await db.query('select anonymize_account_deletion($1,$2)',k);
   await checkpointD1(k);
   await db.query('delete from auth.users where id=$1',[id(4)]);
   await assert.rejects(db.query('insert into auth.users(id,email) values($1,$2)',[id(8),'no-profile@example.test']),/email deletion has not completed/);
   await db.query('select finish_account_deletion($1,$2)',k);
   await db.query('insert into auth.users(id,email) values($1,$2)',[id(8),'no-profile@example.test']);
   assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[bFile]),1);
 });
 await check('both synthetic release gates can return OFF without erasing durable completed ownership fences',async()=>{
   await db.exec('update deletion_private.release_gate set requests_enabled=false,worker_enabled=false');
   assert.equal(await scalar('select requests_enabled or worker_enabled from deletion_private.release_gate'),false);
   await assert.rejects(db.query('select request_account_deletion($1)',[id(3)]),/disabled/);
   await assert.rejects(db.query('select claim_account_deletion()'),/disabled/);
   assert.equal(await scalar('select count(*)::int from deletion_private.jobs where status=\'completed\''),2);
 });
 console.log(`${passed} database safety checks passed (synthetic data only).`);
} catch(error) { console.error(`FAIL ${error.message}${error.detail ? ` (${error.detail})` : ''}`); process.exitCode=1; }
finally { await db.close(); }
