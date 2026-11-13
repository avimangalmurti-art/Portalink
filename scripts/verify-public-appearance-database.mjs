// In-memory PostgreSQL ONLY. No network, Supabase credentials or real accounts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replaySupabaseSchema } from '../tests/support/replay-supabase-schema.mjs';
const { db } = await replaySupabaseSchema();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let passed=0;
const check=async(name,fn)=>{await fn(); passed++; console.log(`PASS ${name}`);};
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const system=async()=>{await db.exec("reset role; select set_config('request.jwt.claims','',false); select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claim.role','service_role',false)");};
const user=async n=>{await system();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:id(n),session_id:id(n+100)})]);await db.exec("select set_config('request.jwt.claim.role','authenticated',false); set role authenticated");};
try {

 await check('appearance migration applies to full schema without changing existing profile visibility', async()=>{
   await db.exec(readFileSync('supabase/migrations/202609080002_public_profile_appearance.sql','utf8'));
   for (const n of [1,2,3]) {
     await db.query('insert into auth.users(id,email) values($1,$2)',[id(n),'synthetic'+n+'@example.test']);
     await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[id(n+100),id(n)]);
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
