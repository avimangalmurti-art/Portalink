import {isAdultOn,LAUNCH_REVIEW_VERSION} from '../features/launch/adultLaunch';
import {readSharedReturnPath} from '../features/auth/registration';
import {boundedJson,pkceChallenge,randomSecret,sha256,verifyGoogleIdentity} from './googleIdentity';
import {revokeIssuedSession} from '../features/auth/scopedSessionCleanup';
export type GoogleHandoffEnvironment={GOOGLE_CLIENT_ID?:string;GOOGLE_CLIENT_SECRET?:string;SUPABASE_SERVICE_ROLE_KEY?:string;AUTH_PUBLIC_ORIGIN?:string};
type Config=GoogleHandoffEnvironment&{supabaseUrl:string;publishableKey:string;assets:{fetch(request:Request):Promise<Response>}};
const COOKIE='__Host-portalink-google';
const headers={'cache-control':'no-store, private','cdn-cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'};
const clearCookie=COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
function json(value:unknown,status=200,cookie?:string){return Response.json(value,{status,headers:{...headers,...(cookie?{'set-cookie':cookie}:{})}});}
function cookie(request:Request):string {
 const values=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE+'='));
 if(values.length!==1)throw Error('Browser binding missing');const value=values[0].slice(COOKIE.length+1);if(!/^[A-Za-z0-9_-]{43}$/.test(value))throw Error('Browser binding missing');return value;
}
function configured(config:Config,request:Request):boolean {
 try{return Boolean(config.GOOGLE_CLIENT_ID&&config.GOOGLE_CLIENT_SECRET&&config.SUPABASE_SERVICE_ROLE_KEY&&config.publishableKey.length>20
 && config.AUTH_PUBLIC_ORIGIN&&new URL(config.AUTH_PUBLIC_ORIGIN).origin===config.AUTH_PUBLIC_ORIGIN
 && new URL(config.AUTH_PUBLIC_ORIGIN).protocol==='https:'&&new URL(request.url).origin===config.AUTH_PUBLIC_ORIGIN
 && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl));}catch{return false;}
}
function sameOrigin(request:Request,origin:string):boolean {
 return request.headers.get('origin')===origin && (!request.headers.has('sec-fetch-site')||request.headers.get('sec-fetch-site')==='same-origin');
}
async function rpc(config:Config,name:string,args:Record<string,unknown>,fetcher:typeof fetch) {
 const response=await fetcher(config.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',headers:{apikey:(config.SUPABASE_SERVICE_ROLE_KEY??''),authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
 return boundedJson(response);
}
function failure(origin:string,cleanupPending=false):Response {return new Response(null,{status:303,headers:{...headers,location:origin+'/?entry=oauth&error='+(cleanupPending?'oauth_cleanup_pending':'oauth_failed'),'set-cookie':clearCookie}});}
/** No raw exceptions, tokens, DOB, codes, or callback URLs are logged. */
export async function handleGoogleHandoff(request:Request,config:Config,fetcher:typeof fetch=fetch):Promise<Response> {
 const url=new URL(request.url),path=url.pathname;
 if(!['/api/auth/google/capability','/api/auth/google/start','/api/auth/google/callback'].includes(path))return json({error:'Not found'},404);
 if(!configured(config,request))return json(path.endsWith('/capability')?{google:false}:{error:'Google sign-in is not available yet.'},path.endsWith('/capability')?200:503);
 const origin=(config.AUTH_PUBLIC_ORIGIN??'');
 if(path.endsWith('/capability')){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  try {const policy=await rpc(config,'adult_google_policy',{},fetcher);return json({google:policy.ready===true&&policy.terms_version===LAUNCH_REVIEW_VERSION&&policy.privacy_version===LAUNCH_REVIEW_VERSION});}catch{return json({google:false});}
 }
 if(path.endsWith('/start')){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!sameOrigin(request,origin))return json({error:'Request not permitted'},403);
  try {
   if(!(request.headers.get('content-type')??'').startsWith('application/json'))throw Error('Invalid body');
   const body=await boundedJson(new Response(request.body),2048);
   if(Object.keys(body).some(k=>!['country','birthDate','termsVersion','privacyVersion','termsAccepted','privacyAcknowledged','returnPath'].includes(k))
    ||body.country!=='US'||typeof body.birthDate!=='string'||!isAdultOn(body.birthDate,new Date())
    ||body.termsVersion!==LAUNCH_REVIEW_VERSION||body.privacyVersion!==LAUNCH_REVIEW_VERSION||body.termsAccepted!==true||body.privacyAcknowledged!==true) return json({error:'US adult eligibility and reviewed agreements are required.'},400);
   let browser:string;try{browser=cookie(request);}catch{browser=randomSecret();}
   const state=randomSecret(),verifier=randomSecret(),nonce=randomSecret();
   await rpc(config,'begin_adult_google_handoff',{p_state_hash:await sha256(state),p_browser_hash:await sha256(browser),p_verifier:verifier,p_nonce:nonce,
    p_terms_version:body.termsVersion,p_privacy_version:body.privacyVersion,p_return_path:readSharedReturnPath(body.returnPath)??null},fetcher);
   const authorize=new URL('https://accounts.google.com/o/oauth2/v2/auth');
   for(const [key,value] of Object.entries({client_id:(config.GOOGLE_CLIENT_ID??''),redirect_uri:origin+'/api/auth/google/callback',response_type:'code',scope:'openid email profile',state,
    nonce:await sha256(nonce),code_challenge:await pkceChallenge(verifier),code_challenge_method:'S256',prompt:'select_account'}))authorize.searchParams.set(key,value);
   return json({url:authorize.href},200,COOKIE+'='+browser+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
  }catch{return json({error:'Google sign-in could not be prepared. Please check eligibility again or try later.'},503);}
 }
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 let stateHash:string|undefined,browserHash:string|undefined;
 let claimed=false;
 let issuedAccessToken:string|undefined;
 let exchangeAttempted=false,exchangeRejected=false;
 try {
  if(url.searchParams.getAll('state').length!==1||url.searchParams.getAll('code').length>1||url.searchParams.getAll('error').length>1)throw Error('Invalid callback');
  const state=url.searchParams.get('state');if(!state||!/^[A-Za-z0-9_-]{43}$/.test(state))throw Error('Invalid state');
  stateHash=await sha256(state);browserHash=await sha256(cookie(request));
  const handoff=await rpc(config,'claim_adult_google_handoff',{p_state_hash:stateHash,p_browser_hash:browserHash},fetcher);
  claimed=true;
  if(url.searchParams.has('error'))throw Error('Cancelled');const code=url.searchParams.get('code');if(!code||code.length>4096)throw Error('Invalid code');
  if(typeof handoff.verifier!=='string'||typeof handoff.nonce!=='string')throw Error('Invalid handoff');
  const tokens=await boundedJson(await fetcher('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:(config.GOOGLE_CLIENT_ID??''),client_secret:(config.GOOGLE_CLIENT_SECRET??''),code,code_verifier:handoff.verifier,grant_type:'authorization_code',redirect_uri:origin+'/api/auth/google/callback'}),signal:AbortSignal.timeout(8000)}));
  if(typeof tokens.id_token!=='string'||typeof tokens.access_token!=='string')throw Error('Invalid identity');
  const identity=await verifyGoogleIdentity(tokens.id_token,(config.GOOGLE_CLIENT_ID??''),await sha256(handoff.nonce),fetcher);
  await rpc(config,'authorize_adult_google_identity',{p_state_hash:stateHash,p_browser_hash:browserHash,p_subject:identity.subject},fetcher);
  exchangeAttempted=true;
  const sessionResponse=await fetcher(config.supabaseUrl+'/auth/v1/token?grant_type=id_token',{method:'POST',redirect:'error',headers:{apikey:config.publishableKey,'content-type':'application/json'},body:JSON.stringify({provider:'google',id_token:tokens.id_token,access_token:tokens.access_token,nonce:handoff.nonce}),signal:AbortSignal.timeout(8000)});
  exchangeRejected=sessionResponse.status>=400&&sessionResponse.status<500;
  const session=await boundedJson(sessionResponse);
  if(typeof session.access_token==='string'&&session.access_token)issuedAccessToken=session.access_token;
  if(typeof session.access_token!=='string'||typeof session.refresh_token!=='string')throw Error('Invalid session');
  const user=await boundedJson(await fetcher(config.supabaseUrl+'/auth/v1/user',{headers:{apikey:config.publishableKey,authorization:'Bearer '+session.access_token},redirect:'error',signal:AbortSignal.timeout(8000)}));
  if(typeof user.id!=='string'||!user.email_confirmed_at||!Array.isArray(user.identities)||!user.identities.some(i=>i.provider==='google'&&(i.provider_id===identity.subject||i.identity_data?.sub===identity.subject)))throw Error('Identity mismatch');
  await rpc(config,'finish_adult_google_handoff',{p_state_hash:stateHash,p_browser_hash:browserHash,p_account_id:user.id,p_subject:identity.subject},fetcher);
  const template=await config.assets.fetch(new Request(origin+'/google-auth.html'));
  if(!template.ok)throw Error('Callback unavailable');let html=await template.text();if(!html.includes('<!--GOOGLE_SESSION-->'))throw Error('Invalid callback template');
  const scriptNonce=randomSecret();const payload=JSON.stringify({accessToken:session.access_token,refreshToken:session.refresh_token,returnPath:readSharedReturnPath(handoff.return_path)??null}).replace(/</g,'\\u003c');
  html=html.replace('<!--GOOGLE_SESSION-->',`<script nonce="${scriptNonce}">history.replaceState(null,'','/?entry=oauth')</script><script nonce="${scriptNonce}" type="application/json" id="portalink-google-session">${payload}</script>`);
  return new Response(html,{headers:{...headers,'content-type':'text/html; charset=utf-8','set-cookie':clearCookie,'content-security-policy':`default-src 'none'; script-src 'self' 'nonce-${scriptNonce}'; connect-src 'self' ${new URL(config.supabaseUrl).origin}; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`}});
 }catch{
  const cleanupPending=issuedAccessToken!==undefined
   ? !await revokeIssuedSession(config.supabaseUrl,config.publishableKey,issuedAccessToken,fetcher)
   : exchangeAttempted&&!exchangeRejected;
  if(claimed&&stateHash&&browserHash)await rpc(config,'fail_adult_google_handoff',{p_state_hash:stateHash,p_browser_hash:browserHash},fetcher).catch(()=>undefined);
  return failure(origin,cleanupPending);
 }
}
