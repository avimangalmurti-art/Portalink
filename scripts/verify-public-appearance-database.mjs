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
 grant all on storage.objects to authenticated,service_role;
 grant select,insert on realtime.messages to authenticated;
 create publication supabase_realtime;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 `);
 for(const f of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
   const sql=readFileSync(`supabase/migrations/${f}`,'utf8').replace(/create extension if not exists pgcrypto;/i,'');
   try{await db.exec(sql);}catch(error){throw new Error(`Baseline ${f}: ${error.message}`);}
 }

 await check('appearance migration applies to full schema without changing existing profile visibility', async()=>{
   await db.exec(readFileSync('supabase/migrations/202609080002_public_profile_appearance.sql','utf8'));
   for (const n of [1,2,3]) {
     await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),'synthetic'+n+'@example.test']);
     await db.query('insert into profiles(id,account_id,name,handle,headline,is_private) values($1,$2,$3,$4,$5,$6)',[id(n+10),id(n),'Synthetic '+n,'synthetic'+n,'',n===3]);
   }
   assert.equal(await scalar('select count(*)::int from profiles where public_appearance is null'),3);
 });
 const appearance={accentColor:'#FF375F',systemGray:'gray4',mode:'dark'};
 await check('owner saves branding without changing identity or content',async()=>{
   await user(1);
   await db.query('update profiles set public_appearance=$1 where id=$2',[JSON.stringify(appearance),id(11)]);
   assert.deepEqual(await scalar('select public_appearance from profiles where id=$1',[id(11)]),appearance);
   assert.equal(await scalar('select name from profiles where id=$1',[id(11)]),'Synthetic 1');
 });
 await check('different authenticated accounts cannot change creator branding',async()=>{
   await user(2);
   assert.equal((await db.query('update profiles set public_appearance=null where id=$1 returning id',[id(11)])).rows.length,0);
   assert.deepEqual(await scalar('select public_appearance from profiles where id=$1',[id(11)]),appearance);
 });
 await check('anonymous public links read saved branding but cannot write or read private profiles',async()=>{
   await system();await db.exec("select set_config('request.jwt.claim.role','anon',false); set role anon");
   assert.deepEqual(await scalar('select public_appearance from profiles where id=$1',[id(11)]),appearance);
   assert.equal((await db.query('select id from profiles where id=$1',[id(13)])).rows.length,0);
   assert.equal((await db.query('update profiles set public_appearance=null where id=$1 returning id',[id(11)])).rows.length,0);
   assert.deepEqual(await scalar('select public_appearance from profiles where id=$1',[id(11)]),appearance);
 });
 await check('database rejects malformed values, null members and extra fields',async()=>{
   await user(1);
   for (const invalid of [{},{...appearance,mode:null},{...appearance,systemGray:null},{...appearance,accentColor:null},{...appearance,mode:'blue'},{...appearance,systemGray:'gray99'},{...appearance,accentColor:'url(evil)'},{...appearance,extra:true},[]]) {
     await assert.rejects(db.query('update profiles set public_appearance=$1 where id=$2',[JSON.stringify(invalid),id(11)]),/profiles_public_appearance_valid/);
   }
   assert.deepEqual(await scalar('select public_appearance from profiles where id=$1',[id(11)]),appearance);
 });
 console.log(passed+' isolated public appearance database checks passed.');
} finally { await db.close(); }
