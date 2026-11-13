import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const modulePath=process.env.PGLITE_MODULE_PATH ?? process.env.PGLITE_MODULE;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('private Journey pairs survive opt-in changes but cannot be read by visitors', {skip:!modulePath}, async()=>{
 const {PGlite}=await import(pathToFileURL(modulePath).href),db=new PGlite();
 const full=readFileSync(new URL('../supabase/migrations/202609300005_profile_journey.sql',import.meta.url),'utf8');
 // Exercise the actual pair migration; the independent bundle tests cover the RPC.
 const sql=full.slice(0,full.indexOf('-- Keep public gating/captions'))+'commit;';
 const role=async(name,account=1)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(account)]);await db.exec(`set role ${name}`);};
 const pair={then:id(31),now:id(32)};
 const write=async(value,show)=>db.query(`update public.profiles set then_now=$1${show===undefined?'':',show_journey=$3'} where id=$2`,show===undefined?[value,id(11)]:[value,id(11),show]);
 const mirror=async()=> (await db.query('select then_now from public.profiles where id=$1',[id(11)])).rows[0].then_now;
 const privatePair=async()=> (await db.query('select pair from public.profile_journey_pairs where profile_id=$1',[id(11)])).rows[0]?.pair;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 create table public.profiles(id uuid primary key,account_id uuid,is_private boolean default false);
 create table public.portfolio_categories(id uuid primary key,profile_id uuid,is_hidden boolean default false);
 create table public.projects(id uuid primary key,profile_id uuid,category_id uuid,is_hidden boolean default false,design jsonb default '{}');
 alter table public.profiles enable row level security;
 create policy profile_read on public.profiles for select using(not is_private or account_id=auth.uid());
 create policy profile_update on public.profiles for update using(account_id=auth.uid()) with check(account_id=auth.uid());
 grant select on public.profiles,public.projects,public.portfolio_categories to anon,authenticated;
 grant update on public.profiles to authenticated;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
 await db.exec(sql);
 for(const n of [1,2]){await db.query('insert into profiles(id,account_id) values($1,$2)',[id(n+10),id(n)]);await db.query('insert into portfolio_categories(id,profile_id) values($1,$2)',[id(n+20),id(n+10)]);}
 for(const n of [31,32,33])await db.query('insert into projects(id,profile_id,category_id) values($1,$2,$3)',[id(n),id(n===33?12:11),id(n===33?22:21)]);
 await role('authenticated');await write(pair);assert.equal(await mirror(),null);assert.deepEqual(await privatePair(),pair);
 await role('anon');assert.equal(await mirror(),null);await assert.rejects(privatePair(),/permission denied/);
 await role('authenticated',2);assert.equal(await privatePair(),undefined);await write(null);assert.equal(await mirror(),null);
 await role('authenticated');assert.deepEqual(await privatePair(),pair);
 await assert.rejects(write({then:id(31),now:id(33)}),/own portfolio/);await assert.rejects(write({then:id(31),now:id(31)}),/different/);
 for(const value of [true,false,true]){await db.query('update profiles set show_journey=$1 where id=$2',[value,id(11)]);assert.deepEqual(await mirror(),value?pair:null);assert.deepEqual(await privatePair(),pair);}
 await write(pair,false);assert.equal(await mirror(),null);assert.deepEqual(await privatePair(),pair);
 await db.exec('reset role');await db.exec(sql);await role('authenticated');assert.deepEqual(await privatePair(),pair);assert.equal(await mirror(),null);
 await write(null);assert.equal(await privatePair(),undefined);await db.query('update profiles set show_journey=true where id=$1',[id(11)]);assert.equal(await mirror(),null);
 await write(pair,true);assert.deepEqual(await mirror(),pair);
 await db.exec('reset role');await db.query('update projects set is_hidden=true where id=$1',[id(31)]);await role('authenticated');assert.equal(await mirror(),null);assert.equal(await privatePair(),undefined);
 await db.exec('reset role');await db.query('update projects set is_hidden=false where id=$1',[id(31)]);await role('authenticated');await write(pair,false);
 await db.exec('reset role');await db.query('update portfolio_categories set is_hidden=true where id=$1',[id(21)]);await role('authenticated');assert.equal(await privatePair(),undefined);
 }finally{await db.close();}
});
