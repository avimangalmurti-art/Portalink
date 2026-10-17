import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceModule} from './helpers/source-module.mjs';
import React from 'react';
const globals={Request,Response,Headers,AbortSignal,TextEncoder,TextDecoder,atob,btoa,Uint8Array,fetch};
const identity=sourceModule('src/server/googleIdentity.ts',{},globals);
const launch=sourceModule('src/features/launch/adultLaunch.ts');
const share=sourceModule('src/features/sharing/shareModel.ts');
const validation=sourceModule('src/features/profile/validation.ts',{'../sharing/shareModel':share});
const registration=sourceModule('src/features/auth/registration.ts',{'../sharing/shareModel':share,'../profile/validation':validation});
const cleanup=sourceModule('src/features/auth/scopedSessionCleanup.ts',{},globals);
const {handleGoogleHandoff}=sourceModule('src/server/googleHandoff.ts',{'../features/launch/adultLaunch':launch,'../features/auth/registration':registration,'./googleIdentity':identity,'../features/auth/scopedSessionCleanup':cleanup},globals);
const origin='https://portalink.test',clientId='test-client',subject='google-subject-123',account='00000000-0000-4000-8000-000000000001';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'fixture-key',alg:'RS256',use:'sig'};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function signed(nonce,patch={}){const part=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:'https://accounts.google.com',aud:clientId,sub:subject,email:'fixture@example.test',email_verified:true,nonce,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,...patch});return part+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(part))).toString('base64url');}
function fixture(options={}){
 let row,logoutAttempts=0;const calls=[],sessions=new Set(['unrelated-existing-session']);
 const config={GOOGLE_CLIENT_ID:clientId,GOOGLE_CLIENT_SECRET:'fixture-google-secret',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-only-key',AUTH_PUBLIC_ORIGIN:origin,supabaseUrl:'https://fixture.supabase.co',publishableKey:'fixture-publishable-key-long-enough',assets:{fetch:async()=>{
  if(options.templateThrows)throw Error('fixture-template-error');
  return new Response(options.badTemplate?'invalid':readFileSync('google-auth.html','utf8'),{status:options.templateStatus??200});
 }}};
 const fetcher=async(input,init={})=>{
  const url=new URL(input);const body=init.body?JSON.parse(typeof init.body==='string'?init.body:'{}'):{};calls.push({url:url.href,init,body});
  if(url.pathname.startsWith('/rest/v1/rpc/')){
   const name=url.pathname.split('/').at(-1);
   if(name==='adult_google_policy')return Response.json({ready:options.ready!==false,terms_version:launch.LAUNCH_REVIEW_VERSION,privacy_version:launch.LAUNCH_REVIEW_VERSION});
   if(name==='begin_adult_google_handoff'){if(options.ready===false)return Response.json({}, {status:403});row={...body,phase:'pending'};return Response.json({});}
   if(name==='fail_adult_google_handoff'){if(options.failRpcThrows)throw Error('fixture RPC error');if(row&&body.p_state_hash===row.p_state_hash&&body.p_browser_hash===row.p_browser_hash&&row.phase!=='completed')row.phase='failed';return Response.json({});}
   if(!row||body.p_state_hash!==row.p_state_hash||body.p_browser_hash!==row.p_browser_hash)return Response.json({}, {status:403});
   if(name==='claim_adult_google_handoff'){if(row.phase!=='pending'||options.expired)return Response.json({}, {status:403});row.phase='exchanging';return Response.json({verifier:row.p_verifier,nonce:row.p_nonce,return_path:row.p_return_path});}
   if(name==='authorize_adult_google_identity'){assert.equal(body.p_subject,subject);row.phase='identity_ready';return Response.json({});}
   if(name==='finish_adult_google_handoff'){if(options.finishFails)return Response.json({},{status:503});assert.equal(body.p_account_id,account);assert.equal(body.p_subject,subject);row.phase='completed';return Response.json({});}
   throw Error('Unexpected RPC '+name);
  }
  if(url.hostname==='oauth2.googleapis.com'){
   const form=new URLSearchParams(init.body);assert.equal(form.get('code_verifier'),row.p_verifier);assert.equal(form.get('redirect_uri'),origin+'/api/auth/google/callback');
   return Response.json({id_token:await signed(await identity.sha256(row.p_nonce),options.claims),access_token:'fixture-google-access'});
  }
  if(url.hostname==='www.googleapis.com')return Response.json({keys:[jwk]});
  if(url.pathname==='/auth/v1/token'){
   assert.equal(body.nonce,row.p_nonce);assert.equal(row.phase,'identity_ready');
   if(options.supabaseFails)return Response.json({}, {status:400});
   sessions.add('fixture-supabase-access');
   if(options.exchangeThrows)throw Error('fixture transport lost after exchange');
   if(options.exchangeMalformed)return new Response('invalid-json');
   return Response.json({access_token:'fixture-supabase-access',...(options.missingRefresh?{}:{refresh_token:'fixture-supabase-refresh'})});
  }
  if(url.pathname==='/auth/v1/user')return options.userFails?Response.json({},{status:503}):Response.json({id:account,email_confirmed_at:'2026-10-15',identities:[{provider:'google',provider_id:options.wrongIdentity?'other-subject':subject}]});
  if(url.pathname==='/auth/v1/logout'){
   logoutAttempts++;
   assert.equal(url.search,'?scope=local');assert.equal(init.headers.authorization,'Bearer fixture-supabase-access');assert.equal(init.headers.apikey,config.publishableKey);
   assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.signal.aborted,false);
   if(options.cleanupThrows)throw Error('fixture network failure');
   if(options.cleanupFails||options.cleanupFlaky&&logoutAttempts===1)return new Response(null,{status:options.cleanupStatus??503});
   sessions.delete('fixture-supabase-access');return new Response(null,{status:204});
  }
  throw Error('Unexpected destination '+url.href);
 };
 const begin=async(patch={},headers={})=>handleGoogleHandoff(new Request(origin+'/api/auth/google/start',{method:'POST',headers:{origin,'content-type':'application/json','sec-fetch-site':'same-origin',...headers},body:JSON.stringify({country:'US',birthDate:'1990-01-01',termsVersion:launch.LAUNCH_REVIEW_VERSION,privacyVersion:launch.LAUNCH_REVIEW_VERSION,termsAccepted:true,privacyAcknowledged:true,returnPath:'/share/creator?page=2',...patch})}),config,fetcher);
 const callback=async(start,patch={})=>{const url=new URL((await start.clone().json()).url);const state=url.searchParams.get('state');return handleGoogleHandoff(new Request(origin+'/api/auth/google/callback?'+new URLSearchParams({state,code:'fixture-onetime-code',...patch}),{headers:{cookie:start.headers.get('set-cookie').split(';')[0]}}),config,fetcher);};
 return {config,calls,sessions,begin,callback,fetcher,row:()=>row};
}
test('missing server settings and unapproved policy fail closed without Google or Auth requests',async()=>{
 const f=fixture({ready:false});assert.equal((await f.begin()).status,503);
 const result=await handleGoogleHandoff(new Request(origin+'/api/auth/google/start',{method:'POST'}),{...f.config,GOOGLE_CLIENT_SECRET:undefined},f.fetcher);assert.equal(result.status,503);
 assert.equal(f.calls.filter(c=>c.url.includes('googleapis.com')||c.url.includes('/auth/v1/token')).length,0);
});
test('start validates CSRF, age, country and separate agreement acknowledgement before persistence',async()=>{
 const f=fixture();for(const patch of [{country:'CA'},{birthDate:'2010-01-01'},{birthDate:'1990-02-30'},{termsAccepted:false},{privacyAcknowledged:false},{termsVersion:'old'}])assert.equal((await f.begin(patch)).status,400);
 assert.equal((await f.begin({}, {origin:'https://evil.test'})).status,403);assert.equal(f.calls.length,0);
});
test('handoff binds HttpOnly cookie, state, PKCE, nonce and minimal scopes without retaining DOB',async()=>{
 const f=fixture();const start=await f.begin();assert.equal(start.status,200);const u=new URL((await start.clone().json()).url);
 assert.equal(u.searchParams.get('scope'),'openid email profile');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('nonce'),await identity.sha256(f.row().p_nonce));
 assert.equal(u.searchParams.get('code_challenge'),await identity.pkceChallenge(f.row().p_verifier));assert.match(start.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
 assert.equal(f.row().p_state_hash,await identity.sha256(u.searchParams.get('state')));assert.doesNotMatch(JSON.stringify(f.row()),/1990|birthDate|fixture-google-secret|fixture-supabase/);
});
test('complete new/returning-account exchange stays on same Supabase project and never puts session tokens in URLs',async()=>{
 const f=fixture();const start=await f.begin();const response=await f.callback(start);assert.equal(response.status,200);assert.equal(f.row().phase,'completed');
 const html=await response.text();assert.match(html,/portalink-google-session/);assert.match(html,/fixture-supabase-access/);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 for(const call of f.calls)assert.doesNotMatch(call.url,/fixture-(google|supabase)-(secret|access|refresh)|fixture-server-only/);
 assert.equal((await f.callback(start)).status,303);
 assert.equal(f.calls.some(c=>c.url.endsWith('/fail_adult_google_handoff')),false,'a callback that cannot claim must not cancel another attempt');
});
test('wrong browser, expired state, cancellation and identity mismatch cannot finish a session',async()=>{
 const f=fixture();const start=await f.begin();const u=new URL((await start.clone().json()).url);
 const wrong=await handleGoogleHandoff(new Request(origin+'/api/auth/google/callback?state='+u.searchParams.get('state')+'&code=x',{headers:{cookie:'__Host-portalink-google='+'x'.repeat(43)}}),f.config,f.fetcher);assert.equal(wrong.status,303);assert.equal(f.row().phase,'pending');
 for(const options of [{expired:true},{wrongIdentity:true},{supabaseFails:true},{claims:{nonce:'wrong'}},{claims:{aud:'wrong'}},{claims:{email_verified:false}},{claims:{exp:1}}]){
  const h=fixture(options);const a=await h.begin();const result=await h.callback(a);assert.equal(result.status,303);assert.doesNotMatch(result.headers.get('location'),/token|code=|state=/);assert.notEqual(h.row().phase,'completed');
 }
 const cancel=fixture();const a=await cancel.begin();assert.equal((await cancel.callback(a,{error:'access_denied'})).status,303);assert.equal(cancel.calls.some(c=>c.url.includes('oauth2.googleapis.com')),false);
});
test('signature tampering and wrong issuer are rejected before a Supabase token request',async()=>{
 const original=await signed('nonce');const p=original.split('.');p[1]=encode({iss:'https://accounts.google.com',aud:clientId,sub:subject,email:'a@b.test',email_verified:true,nonce:'nonce',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300});
 await assert.rejects(identity.verifyGoogleIdentity(p.join('.'),clientId,'nonce',async()=>Response.json({keys:[jwk]})),/Invalid identity/);
 await assert.rejects(identity.verifyGoogleIdentity(await signed('nonce',{iss:'https://evil.test'}),clientId,'nonce',async()=>Response.json({keys:[jwk]})),/Invalid identity/);
});

test('post-issuance failures revoke only the attempt session, even when receipt/template or failure RPC fails',async()=>{
 for(const options of [{wrongIdentity:true},{userFails:true},{finishFails:true},{badTemplate:true},{templateThrows:true},{templateStatus:503},{missingRefresh:true},{finishFails:true,failRpcThrows:true}]){
  const f=fixture(options),start=await f.begin(),response=await f.callback(start);
  assert.equal(response.status,303);assert.match(response.headers.get('location'),/error=oauth_failed$/);
  assert.equal(f.sessions.has('fixture-supabase-access'),false);assert.equal(f.sessions.has('unrelated-existing-session'),true);
  const logouts=f.calls.filter(c=>c.url.includes('/auth/v1/logout'));
  assert.equal(logouts.length,1);assert.equal(logouts[0].init.body,undefined);
  const logoutIndex=f.calls.indexOf(logouts[0]),failIndex=f.calls.findIndex(c=>c.url.endsWith('/fail_adult_google_handoff'));
  assert.ok(logoutIndex<failIndex,'Revoke first; a failed protocol cleanup must not skip session cleanup.');
  assert.equal(await response.text(),'');assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
  for(const call of f.calls.filter(c=>c.url.includes('/rest/v1/rpc/')))assert.doesNotMatch(JSON.stringify(call.body),/fixture-supabase-(access|refresh)/);
 }
});

test('revocation has one bounded retry, reports uncertainty, and never falls back to another scope',async()=>{
 for(const options of [{cleanupFlaky:true},{cleanupFails:true},{cleanupThrows:true},{cleanupFails:true,cleanupStatus:401}]){
  const f=fixture({...options,finishFails:true}),response=await f.callback(await f.begin());
  assert.equal(f.calls.filter(c=>c.url.includes('/auth/v1/logout')).length,2);
  assert.equal(f.sessions.has('unrelated-existing-session'),true);
  const pending=!options.cleanupFlaky;
  assert.equal(f.sessions.has('fixture-supabase-access'),pending);
  assert.equal(new URL(response.headers.get('location')).searchParams.get('error'),pending?'oauth_cleanup_pending':'oauth_failed');
  assert.doesNotMatch(response.headers.get('location'),/fixture-|state=|code=/);
  assert.equal(f.row().phase,'failed');
 }
 for(const options of [{supabaseFails:true},{expired:true},{claims:{aud:'wrong'}}]){
  const f=fixture(options);await f.callback(await f.begin());assert.equal(f.calls.some(c=>c.url.includes('/auth/v1/logout')),false);
 }
 const success=fixture(),start=await success.begin();assert.equal((await success.callback(start)).status,200);
 await success.callback(start);assert.equal(success.calls.some(c=>c.url.includes('/auth/v1/logout')),false,'A replay cannot revoke the completed session.');
 assert.equal(success.sessions.has('fixture-supabase-access'),true);
 for(const options of [{exchangeThrows:true},{exchangeMalformed:true}]){
  const unknown=fixture(options),response=await unknown.callback(await unknown.begin());
  assert.match(response.headers.get('location'),/error=oauth_cleanup_pending$/,'Unknown issuance must not look like confirmed cleanup.');
  assert.equal(unknown.calls.some(c=>c.url.includes('/auth/v1/logout')),false,'Never guess a session target when its token was not received.');
  assert.equal(unknown.sessions.has('unrelated-existing-session'),true);
 }
});

test('cleanup rejects unsafe destinations/headers without requests and treats only successful responses as confirmation',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response(null,{status:204});};
 for(const [host,key,token] of [['https://evil.test','pub','token'],['https://fixture.supabase.co/path','pub','token'],['https://fixture.supabase.co','','token'],['https://fixture.supabase.co','pub','bad token'],['https://fixture.supabase.co','pub','']]){
  assert.equal(await cleanup.revokeIssuedSession(host,key,token,fetcher),false);
 }
 assert.equal(calls,0);assert.equal(await cleanup.revokeIssuedSession('https://fixture.supabase.co','pub','issued',fetcher),true);assert.equal(calls,1);
});

test('browser adoption failure cleans its delivered session without signing out a concurrent shared session',async()=>{
 for(const mode of ['error','throws','missing-session','invalid-refresh','cleanup-fails','navigation-fails']){
  const revoked=[],redirects=[];let removed=false,setCalls=0;
  const payload={accessToken:'delivered-attempt-access',...(mode==='invalid-refresh'?{}:{refreshToken:'delivered-refresh'})};
  sourceModule('src/features/auth/googleCallback.ts',{'../../services/supabase/client':{
   cleanupIssuedAuthSession:async token=>{revoked.push(token);return mode!=='cleanup-fails';},
   adoptIssuedAuthSession:async(_access,_refresh,_issued,navigate)=>{
    setCalls++;if(mode==='throws')throw Error('fixture SDK failure');if(mode==='navigation-fails'){navigate();return;}
    throw Error('fixture adoption failure');
   }
  },'./registration':registration},{document:{getElementById:()=>({textContent:JSON.stringify(payload),remove:()=>{removed=true;}})},window:{location:{origin,replace:value=>{
   if(mode==='navigation-fails'&&value.startsWith(origin))throw Error('fixture navigation failure');redirects.push(value);
  }}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(removed,true);assert.deepEqual(revoked,['delivered-attempt-access']);
  assert.equal(setCalls,mode==='invalid-refresh'?0:1);
  assert.equal(redirects[0],'/?entry=oauth&error='+(mode==='cleanup-fails'?'oauth_cleanup_pending':'oauth_failed'));
 }
 for(const payload of ['invalid-json',JSON.stringify({refreshToken:'delivered-refresh'})]){
  const redirects=[];
  sourceModule('src/features/auth/googleCallback.ts',{'../../services/supabase/client':{
   adoptIssuedAuthSession(){throw Error('No usable session');},cleanupIssuedAuthSession(){throw Error('No known token to target');}
  },'./registration':registration},{document:{getElementById:()=>({textContent:payload,remove(){}})},window:{location:{origin,replace:value=>redirects.push(value)}}});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(redirects,['/?entry=oauth&error=oauth_cleanup_pending']);
 }
});

test('entry explains unconfirmed cleanup without claiming that sign-out succeeded',()=>{
 const react={...React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useEffect(){},useRef:value=>({current:value})};
 const {EntryChoices}=sourceModule('src/components/auth/EntryChoices.tsx',{react,
  '../../contexts/ServicesContext':{useServices:()=>({auth:{}})},'../../contexts/AuthContext':{useAuth:()=>({})},
  '../../features/launch/AdultLaunchGate':{AdultLaunchGate:'gate'},'../../features/auth/registration':registration,
  '../../presentation/usePresentation':{usePresentation:()=> 'mobile'},
  './EntryAgreements':{EntryAgreements:'agreements',EntryLegal:'legal'},'./oneScreenEntry.css':{}
 },{window:{location:{search:'?entry=oauth&error=oauth_cleanup_pending',hash:''}}});
 const gate=EntryChoices({onSignIn(){},onGuest(){}});
 const content=gate.props.children.props.children({});
 const alert=React.Children.toArray(content.props.children).find(node=>node?.props?.role==='alert');
 assert.match(alert.props.children,/cleanup.*could not be confirmed/);
 assert.doesNotMatch(alert.props.children,/successfully|signed out/i);
});
test('return path injection is normalized inside the inert completion payload',async()=>{
 const f=fixture();const a=await f.begin({returnPath:'/cite/<script>?cite=1'});const res=await f.callback(a);assert.equal(res.status,200);const html=await res.text();assert.doesNotMatch(html,/<script>\?cite/);assert.match(html,/%3Cscript%3E/);
});

test('duplicate callback state and oversized start bodies are rejected without provider calls',async()=>{
 const f=fixture();const huge=await f.begin({returnPath:'x'.repeat(4000)});assert.equal(huge.status,503);assert.equal(f.calls.length,0);
 const a=await f.begin();const u=new URL((await a.clone().json()).url);const state=u.searchParams.get('state');
 const res=await handleGoogleHandoff(new Request(origin+'/api/auth/google/callback?state='+state+'&state='+state+'&code=x',{headers:{cookie:a.headers.get('set-cookie').split(';')[0]}}),f.config,f.fetcher);
 assert.equal(res.status,303);assert.equal(f.calls.some(c=>c.url.includes('oauth2.googleapis.com')),false);
});
test('client transmits transient DOB once, rejects unsafe authorization destinations, and callback uses only existing SDK session storage',async()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const admission=sourceModule('src/features/launch/adultLaunch.ts',{}, {sessionStorage:storage});
 const calls=[],locations=[];
 const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');target.searchParams.set('redirect_uri',origin+'/api/auth/google/callback');
 let destination=target.href;
 const client=sourceModule('src/services/supabase/googleHandoff.ts',{'../../features/launch/adultLaunch':admission,'../../features/auth/registration':registration},{AbortSignal,window:{location:{origin,assign:url=>locations.push(url)}},fetch:async(_url,init)=>{calls.push(JSON.parse(init.body));return Response.json({url:destination});}});
 admission.saveScreening('US','1990-01-01');admission.acknowledgeLaunchReview();await client.startGoogleHandoff('/share/creator');
 assert.equal(calls[0].birthDate,'1990-01-01');assert.doesNotMatch(JSON.stringify([...data]),/1990-01-01/);assert.equal(locations.length,1);
 await assert.rejects(client.startGoogleHandoff(),/eligibility again/);assert.equal(calls.length,1);
 admission.saveScreening('US','1990-01-01');admission.acknowledgeLaunchReview();destination='https://evil.test/';await assert.rejects(client.startGoogleHandoff(),/Invalid sign-in destination/);
 const sessionCalls=[],redirects=[];let removed=false;
 sourceModule('src/features/auth/googleCallback.ts',{'../../services/supabase/client':{adoptIssuedAuthSession:async(access,refresh,_issued,navigate)=>{sessionCalls.push({access_token:access,refresh_token:refresh});navigate();}},'./registration':registration},{document:{getElementById:()=>({textContent:JSON.stringify({accessToken:'test-access',refreshToken:'test-refresh',returnPath:'https://evil.test/'}),remove:()=>{removed=true;}})},window:{location:{origin,replace:url=>redirects.push(url)}}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(removed,true);assert.equal(sessionCalls[0].access_token,'test-access');assert.equal(redirects[0],origin+'/?entry=oauth');assert.doesNotMatch(redirects[0],/test-access|test-refresh/);
});
