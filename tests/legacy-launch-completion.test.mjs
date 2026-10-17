import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
const id='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002';
const modulePath=process.env.PGLITE_MODULE_PATH;
const PGlite=modulePath?(await import(pathToFileURL(modulePath).href)).PGlite:null;

test('legacy receipt RPC authenticates confirmed email identity, recent password, policy, age and exact versions', {skip:!PGlite}, async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;
   create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.account',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt',true),''),'{}')::jsonb$$;
   grant usage on schema auth,public to authenticated,anon;
   create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
   create table auth.identities(user_id uuid,provider text,provider_id text);
   create table profiles(id uuid primary key,account_id uuid,is_private boolean default false);
   create table projects(id uuid primary key,is_hidden boolean default false,citation_permitted boolean default false);
   create function is_project_citable(uuid) returns boolean language sql as $$select true$$;
   create function resolve_citation_item(text,boolean default false) returns jsonb language sql as $$select '{}'::jsonb$$;
   grant insert,select on profiles,projects to authenticated;
   insert into auth.users values('${id}',now(),'{}'),('${other}',now(),'{}');
   insert into auth.identities values('${id}','email','fixture');`);
  for(const file of ['adult_launch_review','google_eligibility_handoff','legacy_email_launch_completion'])await db.exec(readFileSync(`supabase/pending/${file}.sql`,'utf8'));
  const claims=async value=>db.query(`select set_config('request.jwt',$1,false)`,[JSON.stringify(value)]);
  const status=async()=> (await db.query('select legacy_email_launch_status() s')).rows[0].s.status;
  const complete=(patch={})=>db.query('select complete_legacy_email_launch($1,$2,$3,$4,$5,$6,$7) result',
   Object.entries({account:id,country:'US',birth:'1990-01-01',terms:'review',privacy:'review',accepted:true,acknowledged:true})
    .map(([key,value])=>Object.hasOwn(patch,key)?patch[key]:value));
  await db.exec(`set role anon`);await assert.rejects(status(),/permission denied/);await assert.rejects(complete(),/permission denied/);
  await db.exec(`reset role;set role service_role`);await assert.rejects(complete(),/permission denied/);
  await db.exec(`reset role;set role authenticated;select set_config('request.account','${id}',false)`);
  assert.equal(await status(),'unavailable');await assert.rejects(complete(),/unavailable/);
  await db.exec(`reset role;update adult_launch_configuration set stage='public',approved=true,hook_verified=true,public_legal_verified=true,terms_version='review',privacy_version='review';set role authenticated`);
  for(const amr of [undefined,{},[],[{method:'recovery',timestamp:Math.floor(Date.now()/1000)}],[{method:'password',timestamp:1}],[{method:'password',timestamp:'bad'}],[{method:'password',timestamp:999999999999}]]){
   await claims({amr});assert.equal(await status(),'reauthenticate');await assert.rejects(complete(),/unavailable/);
  }
  await claims({amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]});
  assert.equal(await status(),'required');
  const boundary=(await db.query("select to_char((clock_timestamp() at time zone 'UTC')::date-interval '18 years','YYYY-MM-DD') adult,to_char((clock_timestamp() at time zone 'UTC')::date-interval '18 years'+interval '1 day','YYYY-MM-DD') minor")).rows[0];
  await assert.rejects(complete({birth:boundary.minor}),/Adult eligibility/);
  for(const patch of [{account:other},{account:null},{country:'CA'},{country:null},{birth:null},{birth:'2020-01-01'},{birth:'2030-01-01'},{birth:'1990-02-30'},{birth:'1899-01-01'},{birth:'1990-1-01'},
   {terms:'old'},{terms:null},{privacy:'old'},{accepted:false},{accepted:null},{acknowledged:false},{acknowledged:null}])await assert.rejects(complete(patch));
  for(const flag of ['approved','hook_verified','public_legal_verified']){
   await db.exec(`reset role;update adult_launch_configuration set ${flag}=false;set role authenticated`);
   assert.equal(await status(),'unavailable');await assert.rejects(complete(),/unavailable/);
   await db.exec(`reset role;update adult_launch_configuration set ${flag}=true;set role authenticated`);
  }
  for(const stage of ['installed','testing','paused']){
   await db.exec(`reset role;update adult_launch_configuration set stage='${stage}';set role authenticated`);
   assert.equal(await status(),'unavailable');await assert.rejects(complete(),/unavailable/);
  }
  await db.exec(`reset role;update adult_launch_configuration set stage='public';update auth.users set email_confirmed_at=null where id='${id}';set role authenticated`);
  await assert.rejects(status(),/Confirmed account/);
  await db.exec(`reset role;update auth.users set email_confirmed_at=now() where id='${id}';insert into auth.identities values('${id}','google','google-sub');set role authenticated`);
  assert.equal(await status(),'unavailable');await assert.rejects(complete(),/unavailable/);
  await db.exec(`reset role;delete from auth.identities where provider='google';update adult_launch_configuration set stage='installed';insert into profiles values('${id}','${id}',true);update adult_launch_configuration set stage='public';set role authenticated`);
  assert.equal(await status(),'unavailable');
  await db.exec(`reset role;delete from profiles;set role authenticated`);
  assert.equal((await complete({birth:boundary.adult})).rows[0].result.verified,true);
  const before=(await db.query('select * from account_launch_receipts')).rows[0];
  assert.equal(before.account_id,id);assert.equal(before.country,'US');assert.equal(before.age_band,'18+');
  assert.equal(await status(),'ready');await complete();
  assert.deepEqual((await db.query('select * from account_launch_receipts')).rows,[before]);
  assert.equal((await db.query('select * from account_optional_consent_events')).rows.length,0);
  await db.exec(`select set_config('request.account','${other}',false)`);
  assert.equal((await db.query('select * from account_launch_receipts')).rows.length,0);
  await assert.rejects(complete(),/Confirmed account/);
  await db.exec(`reset role`);
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='account_launch_receipts' and column_name like '%birth%'")).rows[0].n,0);
 }finally{await db.close();}
});

function clientFixture({status='required',hasReceipt=false,changeAfterRpc=false}={}) {
 let account=id;const calls=[];
 const client={auth:{getUser:async()=>({data:{user:{id:account,email_confirmed_at:'2026-10-15'}}})},rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='verify_adult_launch_receipt')return {data:{verified:hasReceipt}};
  if(name==='legacy_email_launch_status')return {data:{status,terms_version:'review',privacy_version:'review'}};
  if(name==='complete_legacy_email_launch'){hasReceipt=true;if(changeAfterRpc)account=other;return {data:{verified:true}};}
  throw Error('unexpected');
 }};
 let take=0;
 const api=sourceModule('src/services/supabase/legacyLaunchCompletion.ts',{'./client':{requireSupabase:()=>client},
  '../../features/launch/adultLaunch':{LAUNCH_REVIEW_VERSION:'review',requireAdmission:()=>({country:'US',termsVersion:'review',privacyVersion:'review'}),takeGoogleBirthDate:()=>{take++;return '1990-01-01';}}});
 return {api,calls,get take(){return take;},setAccount:value=>account=value};
}
test('client binds completion to confirmed current account and verifies durable receipt after RPC',async()=>{
 const f=clientFixture();assert.equal(await f.api.getLaunchCompletion(id),'required');
 await f.api.completeLaunchEligibility(id);
 const write=f.calls.find(c=>c.name==='complete_legacy_email_launch');
 assert.equal(write.args.p_expected_account,id);assert.equal(write.args.p_birth_date,'1990-01-01');assert.equal(f.take,1);
 assert.equal(f.calls.filter(c=>c.name==='verify_adult_launch_receipt').length,2);
 const ready=clientFixture({hasReceipt:true});assert.equal(await ready.api.getLaunchCompletion(id),'ready');assert.equal(ready.calls.length,1);
 const wrong=clientFixture();wrong.setAccount(other);await assert.rejects(wrong.api.completeLaunchEligibility(id),/Sign in/);assert.equal(wrong.calls.length,0);
 const race=clientFixture({changeAfterRpc:true});await assert.rejects(race.api.completeLaunchEligibility(id),/Sign in/);
 const unavailable=clientFixture({status:'unavailable'});assert.equal(await unavailable.api.getLaunchCompletion(id),'unavailable');
});

function uiFixture(service){
 const slots=[];let cursor=0;const effects=[];let ready=0,closed=0;
 const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,n)=>v!==slots[i].deps[n]))effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});}};
 const {LegacyLaunchCompletion}=sourceModule('src/features/launch/LegacyLaunchCompletion.tsx',{react,'./AdultLaunchGate':{AdultLaunchGate:'gate'},
  './adultLaunch':{ADMISSION_KEY:'fixture',clearTransientBirth(){}},'../../components/auth/EntryAgreements':{EntryAgreements:'agreements'}},{sessionStorage:{removeItem(){}}});
 const onReady=()=>ready++;
 return{render(){cursor=0;const tree=LegacyLaunchCompletion({accountId:id,service,onReady,onDismiss:()=>closed++,onSignIn(){}});effects.splice(0).forEach(fn=>fn());return tree;},
  unmount(){for(const slot of slots)slot?.cleanup?.();},get ready(){return ready;},get closed(){return closed;}};
}
const nodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...React.Children.toArray(tree.props?.children).flatMap(nodes)];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('completion UI blocks while checking, screens required accounts and waits for affirmative agreement',async()=>{
 let writes=0,decide;const service={getLaunchCompletion:async()=> 'required',completeLaunchEligibility:async account=>{assert.equal(account,id);writes++;}};
 const h=uiFixture(service);assert.equal(nodes(h.render()).some(n=>n.type==='gate'),false);await tick();
 const tree=h.render(),gate=nodes(tree).find(n=>n.type==='gate');assert.ok(gate);
 const agreements=gate.props.children;
 const action=nodes(agreements.props.children({request:()=>new Promise(resolve=>{decide=resolve;})})).find(n=>n.type==='button');
 action.props.onClick();action.props.onClick();await tick();assert.equal(writes,0);
 decide(false);await tick();assert.equal(writes,0);assert.equal(h.ready,0);
 action.props.onClick();decide(true);await tick();assert.equal(writes,1);assert.equal(h.ready,1);
 agreements.props.onDisagree();assert.equal(h.closed,1);
 const existing=uiFixture({getLaunchCompletion:async()=> 'ready'});existing.render();await tick();assert.equal(existing.ready,1);
 const blocked=uiFixture({getLaunchCompletion:async()=> 'unavailable'});blocked.render();await tick();assert.equal(nodes(blocked.render()).some(n=>n.type==='gate'),false);
 const reauth=uiFixture({getLaunchCompletion:async()=> 'reauthenticate'});reauth.render();await tick();assert.equal(nodes(reauth.render()).some(n=>n.type==='gate'),false);
 const failure=uiFixture({getLaunchCompletion:async()=> 'required',completeLaunchEligibility:async()=>{throw Error('fixture');}});
 failure.render();await tick();const before=nodes(failure.render()).find(n=>n.type==='gate');
 nodes(before.props.children.props.children({request:async()=>true})).find(n=>n.type==='button').props.onClick();await tick();
 assert.notEqual(nodes(failure.render()).find(n=>n.type==='gate').key,before.key,'Failed completion requires fresh screening/acceptance.');assert.equal(failure.ready,0);
 let finish;
 const late=uiFixture({getLaunchCompletion:async()=> 'required',completeLaunchEligibility:()=>new Promise(resolve=>{finish=resolve;})});
 late.render();await tick();const lateGate=nodes(late.render()).find(n=>n.type==='gate');
 nodes(lateGate.props.children.props.children({request:async()=>true})).find(n=>n.type==='button').props.onClick();await tick();late.unmount();finish();await tick();assert.equal(late.ready,0);
});
