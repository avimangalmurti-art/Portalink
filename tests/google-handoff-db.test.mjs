import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.PGLITE_MODULE_PATH;
const PGlite=modulePath?(await import(pathToFileURL(modulePath).href)).PGlite:null;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const state=n=>String(n).padStart(64,'a'),browser='b'.repeat(64),secret='c'.repeat(43);
async function fixture(){const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.account',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,anon,service_role,supabase_auth_admin;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
 create table auth.identities(user_id uuid,provider text,provider_id text);
 create table profiles(id uuid primary key,account_id uuid,is_private boolean default false);
 create table projects(id uuid primary key,is_hidden boolean default false,citation_permitted boolean default false);
 create function is_project_citable(p_project_id uuid) returns boolean language sql as $$select true$$;
 create function resolve_citation_item(p_item_id text,p_require_citable boolean default false) returns jsonb language sql as $$select '{"citable":true}'::jsonb$$;
 grant insert,select on profiles,projects to authenticated;
 create view preinstall_citation_consumer as select is_project_citable('00000000-0000-4000-8000-000000000001') value;
 `);await db.exec(readFileSync('supabase/pending/adult_launch_review.sql','utf8'));await db.exec(readFileSync('supabase/pending/google_eligibility_handoff.sql','utf8'));return db;}
async function begin(db,n){await db.query(`select begin_adult_google_handoff($1,$2,$3,$3,'review','review','/share/fixture')`,[state(n),browser,secret]);}
const hook=(db,n,sub,provider='google')=>db.query(`select adult_launch_before_user_created($1::jsonb) result`,[JSON.stringify({user:{id:id(n),app_metadata:{provider},user_metadata:{sub,portalink_launch:{country:'US',ageBand:'18+',termsVersion:'review',privacyVersion:'review'}}}})]);
test('unapplied candidate gates service RPCs, enforces browser/state/identity binding, and supports new Google accounts', {skip:!PGlite},async()=>{
 const db=await fixture();try{
 await assert.rejects(begin(db,1),/unavailable/);
 await db.exec(`update adult_launch_configuration set stage='public',public_legal_verified=true,approved=true,hook_verified=true,google_handoff_verified=true,cleanup_verified=true,terms_version='review',privacy_version='review'`);
 await db.exec('set role anon');await assert.rejects(db.query('select * from adult_google_handoffs'),/permission denied/);await assert.rejects(begin(db,1),/permission denied/);
 await assert.rejects(db.query(`select claim_adult_google_handoff($1,$2)`,[state(1),browser]),/permission denied/);
 await db.exec('reset role;set role authenticated');await assert.rejects(begin(db,1),/permission denied/);await assert.rejects(db.query(`select adult_launch_before_user_created('{}')`),/permission denied/);
 await db.exec('reset role;set role service_role');await begin(db,1);
 await assert.rejects(db.query(`select claim_adult_google_handoff($1,$2)`,[state(1),'d'.repeat(64)]),/Invalid handoff/);
 await db.query(`select claim_adult_google_handoff($1,$2)`,[state(1),browser]);await assert.rejects(db.query(`select claim_adult_google_handoff($1,$2)`,[state(1),browser]),/Invalid handoff/);
 await db.query(`select authorize_adult_google_identity($1,$2,'google-one')`,[state(1),browser]);
 await db.exec('reset role;set role supabase_auth_admin');assert.equal((await hook(db,2,'wrong-subject')).rows[0].result.error.http_code,403);
 assert.deepEqual((await hook(db,1,'google-one')).rows[0].result,{});
 assert.equal((await hook(db,2,'google-one')).rows[0].result.error.http_code,403);
 await db.exec(`reset role;insert into auth.users values('${id(1)}',now(),'{}');insert into auth.identities values('${id(1)}','google','google-one');set role service_role;`);
 await assert.rejects(db.query(`select finish_adult_google_handoff($1,$2,$3,'google-one')`,[state(1),browser,id(2)]),/Invalid handoff/);
 await db.query(`select finish_adult_google_handoff($1,$2,$3,'google-one')`,[state(1),browser,id(1)]);
 await assert.rejects(db.query(`select finish_adult_google_handoff($1,$2,$3,'google-one')`,[state(1),browser,id(1)]),/Invalid handoff/);
 await db.exec('reset role');const row=(await db.query('select * from adult_google_handoffs')).rows[0];assert.equal(row.phase,'completed');assert.equal(row.verifier,null);assert.equal(row.nonce,null);
 await db.exec(`set role authenticated;select set_config('request.account','${id(1)}',false)`);
 assert.equal((await db.query(`select verify_adult_launch_receipt('review','review') result`)).rows[0].result.verified,true);
 await assert.rejects(db.query(`select verify_adult_launch_receipt('old','review')`),/receipt required/);
 await db.exec(`select set_config('request.account','${id(2)}',false)`);await assert.rejects(db.query(`select verify_adult_launch_receipt('review','review')`),/receipt required/);
 }finally{await db.close();}
});
test('returning accounts receive versioned receipt without hook; stale policy, expiry, and failure revoke the handoff', {skip:!PGlite},async()=>{
 const db=await fixture();try{
 await db.exec(`update adult_launch_configuration set stage='public',public_legal_verified=true,approved=true,hook_verified=true,google_handoff_verified=true,cleanup_verified=true,terms_version='review',privacy_version='review';insert into auth.users values('${id(3)}',now(),'{}');insert into auth.identities values('${id(3)}','google','returning');`);
 await begin(db,3);await db.query(`select claim_adult_google_handoff($1,$2)`,[state(3),browser]);await db.query(`select authorize_adult_google_identity($1,$2,'returning')`,[state(3),browser]);
 await assert.rejects(db.query(`select finish_adult_google_handoff($1,$2,$3,'different')`,[state(3),browser,id(3)]),/Invalid handoff/);
 await db.query(`select finish_adult_google_handoff($1,$2,$3,'returning')`,[state(3),browser,id(3)]);
 assert.equal((await db.query('select count(*)::int n from account_launch_receipts')).rows[0].n,1);
 await db.exec(`update adult_google_handoffs set created_at=clock_timestamp()-interval '20 seconds'`);
 await begin(db,4);await db.exec(`update adult_google_handoffs set expires_at=clock_timestamp()-interval '1 second' where state_hash='${state(4)}'`);
 await assert.rejects(db.query(`select claim_adult_google_handoff($1,$2)`,[state(4),browser]),/Invalid handoff/);
 await begin(db,5);await db.exec(`update adult_launch_configuration set terms_version='new'`);await assert.rejects(db.query(`select claim_adult_google_handoff($1,$2)`,[state(5),browser]),/unavailable/);
 await db.exec(`update adult_launch_configuration set terms_version='review';update adult_google_handoffs set created_at=clock_timestamp()-interval '20 seconds'`);
 await begin(db,6);await db.query(`select fail_adult_google_handoff($1,$2)`,[state(6),browser]);const failed=(await db.query(`select phase,verifier,nonce from adult_google_handoffs where state_hash=$1`,[state(6)])).rows[0];assert.equal(failed.phase,'failed');assert.equal(failed.verifier,null);assert.equal(failed.nonce,null);
 await assert.rejects(db.query(`select claim_adult_google_handoff($1,$2)`,[state(6),browser]),/Invalid handoff/);
 }finally{await db.close();}
});


test('installation preserves defaults and dependent function behavior; testing restricts identity without verification flags', {skip:!PGlite},async()=>{
 const db=await fixture();try{
 assert.equal((await db.query(`select stage from adult_launch_configuration`)).rows[0].stage,'installed');
 await db.exec(`create view legacy_citation_consumer as select is_project_citable('${id(1)}') value`);
 assert.equal((await db.query('select value from legacy_citation_consumer')).rows[0].value,true);
 await db.exec(`insert into profiles values('${id(8)}','${id(8)}',false);insert into projects values('${id(8)}',false,true)`);
 assert.equal((await db.query('select is_private from profiles')).rows[0].is_private,false);
 assert.equal((await db.query('select is_hidden from projects')).rows[0].is_hidden,false);
 await assert.rejects(db.query(`select set_adult_launch_stage('testing')`),/Reviewed versions/);
 await db.exec(`update adult_launch_configuration set approved=true,terms_version='review',privacy_version='review'`);
 await assert.rejects(db.query(`select set_adult_launch_stage('testing')`),/Test identities/);
 await db.exec(`insert into adult_launch_testers(google_subject) values('allowed-test-subject');select set_adult_launch_stage('testing')`);
 assert.equal((await db.query(`select adult_google_policy() p`)).rows[0].p.ready,true);
 await begin(db,20);await db.query(`select claim_adult_google_handoff($1,$2)`,[state(20),browser]);
 await assert.rejects(db.query(`select authorize_adult_google_identity($1,$2,'unknown')`,[state(20),browser]),/Test identity/);
 await db.query(`select authorize_adult_google_identity($1,$2,'allowed-test-subject')`,[state(20),browser]);
 assert.equal((await hook(db,20,'unknown')).rows[0].result.error.http_code,403);
 assert.equal((await hook(db,21,'email','email')).rows[0].result.error.http_code,403);
 assert.deepEqual((await hook(db,20,'allowed-test-subject')).rows[0].result,{});
 await db.exec(`insert into auth.users values('${id(20)}',now(),'{}');insert into auth.identities values('${id(20)}','google','allowed-test-subject')`);
 await db.query(`select finish_adult_google_handoff($1,$2,$3,'allowed-test-subject')`,[state(20),browser,id(20)]);
 await db.exec(`set role authenticated;select set_config('request.account','${id(20)}',false)`);
 assert.equal((await db.query(`select verify_adult_launch_receipt('review','review') p`)).rows[0].p.verified,true);
 await db.exec(`insert into profiles values('${id(20)}','${id(20)}',false);insert into projects values('${id(20)}',false,false)`);
 assert.equal((await db.query(`select is_private from profiles where id='${id(20)}'`)).rows[0].is_private,true);
 assert.equal((await db.query(`select is_hidden from projects where id='${id(20)}'`)).rows[0].is_hidden,true);
 await db.exec(`select set_config('request.account','${id(8)}',false)`);
 assert.equal((await db.query(`select is_project_citable('${id(8)}') value`)).rows[0].value,true);
 await assert.rejects(db.query(`select set_adult_launch_stage('public')`),/permission denied/);
 await db.exec('reset role;set role service_role');
 await assert.rejects(db.query(`select set_adult_launch_stage('public')`),/permission denied/);
 await assert.rejects(db.query(`insert into adult_launch_testers(google_subject) values('forged')`),/permission denied/);
 await assert.rejects(db.query(`update adult_launch_configuration set stage='public'`),/permission denied/);
 }finally{await db.close();}
});

test('cleanup purges terminal/expired protocol data only; public activation requires evidence and pause invalidates attempts', {skip:!PGlite},async()=>{
 const db=await fixture();try{
 await db.exec(`update adult_launch_configuration set approved=true,terms_version='review',privacy_version='review';insert into adult_launch_testers(google_subject) values('test');select set_adult_launch_stage('testing')`);
 await db.exec('update adult_google_cleanup_status set last_success_at=null');
 await assert.rejects(db.query(`select set_adult_launch_stage('public')`),/cleanup proof/);
 await db.query('select cleanup_adult_google_handoffs()');
 await assert.rejects(db.query(`select set_adult_launch_stage('public')`),/Verified testing/);
 await db.exec(`update adult_launch_configuration set public_legal_verified=true,hook_verified=true,google_handoff_verified=true,cleanup_verified=true;select set_adult_launch_stage('public')`);
 // Existing dependency calls the same function OID, so public enforcement applies.
 await db.exec(`create view active_citation_consumer as select is_project_citable('${id(1)}') value`);
 assert.equal((await db.query('select value from active_citation_consumer')).rows[0].value,false);
 assert.equal((await db.query('select value from preinstall_citation_consumer')).rows[0].value,false);
 await begin(db,31);
 await db.exec(`insert into adult_google_handoffs(state_hash,browser_hash,verifier,nonce,terms_version,privacy_version,phase,expires_at) values
 ('${state(32)}','${browser}','${secret}','${secret}','review','review','exchanging',clock_timestamp()-interval '1 second'),
 ('${state(33)}','${browser}',null,null,'review','review','completed',clock_timestamp()+interval '10 minutes');
 insert into account_launch_receipts(account_id,country,age_band,terms_version,privacy_version) values('${id(31)}','US','18+','review','review');insert into auth.users values('${id(31)}',now(),'{}')`);
 assert.equal((await db.query('select cleanup_adult_google_handoffs() n')).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from adult_google_handoffs')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from account_launch_receipts')).rows[0].n,1);
 await db.exec(`select set_adult_launch_stage('paused')`);
 assert.equal((await db.query('select count(*)::int n from adult_google_handoffs')).rows[0].n,0);
 assert.equal((await db.query(`select adult_google_policy() p`)).rows[0].p.ready,false);
 assert.equal((await hook(db,31,'test')).rows[0].result.error.http_code,403);
 assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,1);
 assert.equal((await db.query(`select is_project_citable('${id(1)}') p`)).rows[0].p,false);
 await assert.rejects(db.query(`select set_adult_launch_stage('installed')`),/Use paused/);
 await assert.rejects(db.query(`select set_adult_launch_stage('public')`),/Verified testing/);
 await db.exec(`select set_adult_launch_stage('testing')`);
 assert.equal((await db.query(`select is_project_citable('${id(1)}') p`)).rows[0].p,false,'recovery testing cannot reopen public AI permissions');
 assert.equal((await db.query(`select hook_verified from adult_launch_configuration`)).rows[0].hook_verified,false);
 await db.exec(`set role anon`);await assert.rejects(db.query('select cleanup_adult_google_handoffs()'),/permission denied/);
 }finally{await db.close();}
});

test('separate scheduler candidate fails without pg_cron; contract rejects duplicate jobs and never activates launch', {skip:!PGlite},async()=>{
 const db=await fixture();try{
 const schedule=readFileSync('supabase/pending/google_handoff_cleanup_schedule.sql','utf8');
 await assert.rejects(db.exec(schedule),/Existing pg_cron required/);await db.exec('rollback');
 // Stub only the scheduler API/extension check; actual pg_cron timing remains a hosted acceptance gate.
 await db.exec(`create schema cron;create table cron.job(jobname text primary key,schedule text,command text);
 create function cron.schedule(text,text,text) returns bigint language plpgsql as $$begin insert into cron.job values($1,$2,$3);return 1;end$$`);
 const withScheduler=schedule.replace("not exists(select 1 from pg_extension where extname='pg_cron')",'false');
 await db.exec(withScheduler);
 const job=(await db.query('select * from cron.job')).rows[0];assert.equal(job.schedule,'* * * * *');
 await db.exec(job.command);assert.ok((await db.query('select last_success_at from adult_google_cleanup_status')).rows[0].last_success_at);
 assert.equal((await db.query('select stage,cleanup_verified from adult_launch_configuration')).rows[0].stage,'installed');
 assert.equal((await db.query('select cleanup_verified from adult_launch_configuration')).rows[0].cleanup_verified,false);
 await assert.rejects(db.exec(withScheduler),/already exists/);await db.exec('rollback');
 assert.equal((await db.query('select count(*)::int n from cron.job')).rows[0].n,1);
 }finally{await db.close();}
});


test('first-window restoration requires owner acknowledgment and pause, preserves data, and restores dormant behavior', {skip:!PGlite},async()=>{
 const db=await fixture();try{
 const exit=readFileSync('supabase/pending/google_initial_test_exit.sql','utf8');
 await assert.rejects(db.exec(exit),/acknowledgment required/);await db.exec('rollback');
 await db.exec(`select set_config('portalink.initial_test_exit','google-disabled-preview-closed-never-public',false)`);
 await assert.rejects(db.exec(exit),/Pause the initial test first/);await db.exec('rollback');
 await db.exec(`update adult_launch_configuration set approved=true,terms_version='review',privacy_version='review';insert into adult_launch_testers(google_subject) values('test');select set_adult_launch_stage('testing');
 insert into auth.users values('${id(40)}',now(),'{}');insert into account_launch_receipts(account_id,country,age_band,terms_version,privacy_version) values('${id(40)}','US','18+','review','review');
 insert into profiles values('${id(40)}','${id(40)}',true);insert into projects values('${id(40)}',true,false);
 select set_adult_launch_stage('paused');`);
 await db.exec('set role service_role');await assert.rejects(db.exec(exit),/database owner required/);await db.exec('rollback;reset role');
 await db.exec(exit);
 const cfg=(await db.query('select * from adult_launch_configuration')).rows[0];
 assert.equal(cfg.stage,'installed');assert.equal(cfg.approved,false);assert.equal(cfg.terms_version,null);assert.equal(cfg.cleanup_verified,false);
 assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from account_launch_receipts')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from adult_launch_testers')).rows[0].n,1);
 assert.equal((await db.query(`select is_private from profiles where id='${id(40)}'`)).rows[0].is_private,true);
 assert.equal((await db.query(`select is_hidden from projects where id='${id(40)}'`)).rows[0].is_hidden,true);
 assert.equal((await db.query('select adult_google_policy() p')).rows[0].p.ready,false);
 assert.deepEqual((await hook(db,41,'none','email')).rows[0].result,{});
 await db.exec(`insert into profiles values('${id(41)}','${id(41)}',false);insert into projects values('${id(41)}',false,false)`);
 assert.equal((await db.query(`select is_private from profiles where id='${id(41)}'`)).rows[0].is_private,false);
 assert.equal((await db.query(`select is_project_citable('${id(41)}') p`)).rows[0].p,true);
 }finally{await db.close();}
});

test('initial-test restoration cannot undo public activation, even when paused and acknowledged', {skip:!PGlite},async()=>{
 const db=await fixture();try{
 const exit=readFileSync('supabase/pending/google_initial_test_exit.sql','utf8');
 await db.exec(`update adult_launch_configuration set approved=true,terms_version='review',privacy_version='review';insert into adult_launch_testers(google_subject) values('test');select set_adult_launch_stage('testing');
 update adult_launch_configuration set public_legal_verified=true,hook_verified=true,google_handoff_verified=true,cleanup_verified=true;select set_adult_launch_stage('public');select set_adult_launch_stage('paused');
 select set_config('portalink.initial_test_exit','google-disabled-preview-closed-never-public',false);`);
 await assert.rejects(db.exec(exit),/Public launch guard/);await db.exec('rollback');
 assert.equal((await db.query('select stage from adult_launch_configuration')).rows[0].stage,'paused');
 await db.exec('update adult_launch_configuration set public_legal_verified=false');
 await assert.rejects(db.exec(exit),/Public launch guard/);await db.exec('rollback');
 assert.equal((await db.query(`select is_project_citable('${id(1)}') p`)).rows[0].p,false);
 }finally{await db.close();}
});
