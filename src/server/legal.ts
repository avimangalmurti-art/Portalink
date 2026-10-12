import { LEGAL_KEYS, latestLegalDocuments, type LegalDocument } from '../features/legal/model';
import { escapeLegalHtml, legalMarkdownHtml } from '../features/legal/markdown';
import { PUBLIC_ORIGIN } from '../features/citations/publicOrigin';
type Config={supabaseUrl:string;publishableKey:string};
type LegalUser={id:string;email?:string;email_confirmed_at?:string};
type Database={prepare(sql:string):{bind(...values:unknown[]):{first<T>():Promise<T|null>}}};
const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(message:string,status:number,extra:Record<string,string>={})=>Response.json({message},{status,headers:{...headers,...extra}});
export async function readLegalDocuments(config:Config,fetcher:typeof fetch=fetch):Promise<LegalDocument[]>{
  if(!config.supabaseUrl||!config.publishableKey)throw new Error('Legal documents unavailable');
  const url=new URL('/rest/v1/legal_documents',config.supabaseUrl);
  url.searchParams.set('select','key,version,title,markdown_body,effective_at');
  const response=await fetcher(url.href,{headers:{apikey:config.publishableKey,authorization:`Bearer ${config.publishableKey}`},signal:AbortSignal.timeout(8_000)});
  if(!response.ok)throw new Error('Legal documents unavailable');
  const rows=await response.json() as LegalDocument[];
  if(!Array.isArray(rows))throw new Error('Legal documents unavailable');
  return rows;
}
export async function handleLegalPage(request:Request,config:Config,fetcher:typeof fetch=fetch):Promise<Response>{
  if(!['GET','HEAD'].includes(request.method))return json('Method not allowed',405,{allow:'GET, HEAD'});
  const url=new URL(request.url),key=url.pathname.slice('/legal/'.length).replace(/\/+$/,'');
  if(!LEGAL_KEYS.some(item=>item===key))return json('Not found',404);
  try{
    const rows=await readLegalDocuments(config,fetcher),version=url.searchParams.get('version');
    const document=version?rows.find(row=>row.key===key&&row.version===version&&Date.parse(row.effective_at)<=Date.now()):latestLegalDocuments(rows).find(row=>row.key===key);
    if(!document)return json('Agreement version not found',404);
    const title=escapeLegalHtml(document.title);
    const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Portalink</title><style>body{margin:0;background:#101011;color:#fff;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:640px;padding:32px 24px;margin:auto}h1{font-size:26px;line-height:1.3}h2,h3,h4{font-size:20px;margin-top:28px}a{color:#64a6ff}.version{color:#a0a0a6;font-size:14px}</style></head><body><main><h1>${title}</h1><p class="version">Version ${escapeLegalHtml(document.version)} · Effective ${escapeLegalHtml(document.effective_at.slice(0,10))}</p>${legalMarkdownHtml(document.markdown_body)}</main></body></html>`;
    return new Response(request.method==='HEAD'?null:html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
  }catch{return json('The agreements are temporarily unavailable.',503);}
}
/** Shared adapter for PR6's existing portalink://license resources. Never return
 * a redirect's empty body or maintain a separate copy of the legal wording. */
export async function readLegalLicenseText(uri:string,config:Config,fetcher:typeof fetch=fetch):Promise<string>{
  const match=/^portalink:\/\/license\/(citable|view-only)-v1$/.exec(uri);
  if(!match)throw new Error('Unknown licence resource');
  const document=(await readLegalDocuments(config,fetcher)).find(row=>row.key==='content-licence'&&row.version==='1.0'&&Date.parse(row.effective_at)<=Date.now());
  if(!document)throw new Error('Licence version unavailable');
  const section=match[1]==='citable'?'citable':'public';
  return `${document.title}\nVersion ${document.version} · Effective ${document.effective_at.slice(0,10)}\nApplicable section: ${section}\n${PUBLIC_ORIGIN}/legal/content-licence?version=1.0#${section}\n\n${document.markdown_body}`;
}
export type ResendClient={send(input:{from:string;to:string[];subject:string;text:string},idempotencyKey:string):Promise<void>};
export function createResendClient(apiKey:string,fetcher:typeof fetch=fetch):ResendClient{
  return{async send(input,idempotencyKey){
    const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify(input),signal:AbortSignal.timeout(10_000)});
    if(!response.ok)throw new Error('Email provider rejected the request');
    const result=await response.json() as {id?:string};if(!result.id)throw new Error('Email provider did not confirm acceptance');
  }};
}
export async function handleLegalSend(request:Request,environment:{DB?:Database;RESEND_API_KEY?:string;RESEND_FROM?:string},config:Config,authenticate:(request:Request,required:boolean)=>Promise<LegalUser|null>,dependencies:{resend?:ResendClient;fetcher?:typeof fetch;now?:()=>number}={}):Promise<Response>{
  if(request.method!=='POST')return json('Method not allowed',405,{allow:'POST'});
  // Fail before any provider call. These runtime secrets never enter VITE_*.
  if(!environment.RESEND_API_KEY||!environment.RESEND_FROM||!environment.DB)return json('Email not available yet',503);
  let user:LegalUser|null;
  try{user=await authenticate(request,true);}catch(caught){return caught instanceof Response?caught:json('Sign in to send the agreements.',401);}
  if(!user?.id||!user.email||!user.email_confirmed_at)return json('Confirm your email and sign in to send the agreements.',401);
  try{
    const documents=latestLegalDocuments(await readLegalDocuments(config,dependencies.fetcher));
    const now=(dependencies.now??Date.now)(),requestId=crypto.randomUUID();
    // Atomic rolling ten-minute reservation, shared by every worker instance.
    const claimed=await environment.DB.prepare('INSERT INTO legal_email_sends(account_id,claimed_at,request_id) VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET claimed_at=excluded.claimed_at,request_id=excluded.request_id WHERE legal_email_sends.claimed_at<=? RETURNING request_id').bind(user.id,now,requestId,now-600_000).first<{request_id:string}>();
    if(!claimed)return json('Please wait ten minutes before sending the agreements again.',429,{'retry-after':'600'});
    const origin=PUBLIC_ORIGIN;
    const text='Here are the four Portalink agreements for your records.\n\n'+documents.map(row=>`${row.title}\nVersion ${row.version} · Effective ${row.effective_at.slice(0,10)}\n${origin}/legal/${row.key}?version=${encodeURIComponent(row.version)}`).join('\n\n');
    await (dependencies.resend??createResendClient(environment.RESEND_API_KEY)).send({from:environment.RESEND_FROM,to:[user.email],subject:'Your Portalink agreements',text},`legal-${requestId}`);
    return json('Links to the four agreements were sent to your account email.',200);
  }catch{return json('Email could not be sent. Please try again in ten minutes.',503);}
}
