import {validateReferenceUrl,boundedText} from './referenceResolver';
import type {RecordStatus} from '../features/record/model';
type Config={supabaseUrl:string;publishableKey:string;authenticate:(request:Request,required:boolean)=>Promise<{id:string}|null>;fetcher?:typeof fetch;cache?:Cache};
const uuid=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
export async function handleStudioRecord(request:Request,config:Config):Promise<Response>{
 if(!['GET','POST'].includes(request.method))return json({message:'Method not allowed'},405);
 try{
  const user=await config.authenticate(request,true);if(!user)return json({message:'Sign in'},401);
  const url=new URL(request.url),id=url.searchParams.get('profile');if(!id||!uuid.test(id))return json({message:'Invalid profile'},400);
  const fetcher=config.fetcher??fetch,headers={apikey:config.publishableKey,authorization:request.headers.get('authorization')??'','content-type':'application/json'},signal=AbortSignal.timeout(10000);
  const owner=await fetcher(config.supabaseUrl+'/rest/v1/profiles?'+new URLSearchParams({select:'id',id:'eq.'+id,account_id:'eq.'+user.id}),{headers,signal,credentials:'omit',redirect:'manual'});
  if(!owner.ok)return json({message:'Record unavailable'},503);const owners=await owner.json();if(!Array.isArray(owners)||owners[0]?.id!==id)return json({message:'Not permitted'},403);
  const cacheKey=new Request(url.origin+'/__private/studio-record/'+user.id+'/'+id);
  if(request.method==='POST'){
   const body=JSON.parse(await boundedText(request as unknown as Response,signal,4096));
   if(!['snooze','never','previewed','shared','visit'].includes(body.event)||typeof body.key!=='string'||! /^[a-z][a-z0-9-]{0,31}(:[a-z0-9-]{1,128})?$/.test(body.key))return json({message:'Invalid event'},400);
   if(['shared','previewed'].includes(body.event)&&body.key!=='profile'||body.event==='visit'&&body.key!=='main')return json({message:'Invalid event'},400);
   const merge=['snooze','visit'].includes(body.event);
   const response=await fetcher(config.supabaseUrl+'/rest/v1/owner_events?on_conflict=profile_id,event,key',{method:'POST',headers:{...headers,prefer:'resolution='+(merge?'merge':'ignore')+'-duplicates,return=minimal'},body:JSON.stringify({profile_id:id,event:body.event,key:body.key}),signal,credentials:'omit',redirect:'manual'});
   if(!response.ok)return json({message:'Record could not be saved'},response.status===403?403:503);
   await config.cache?.delete(cacheKey);return json({saved:true});
  }
  if(url.searchParams.get('fresh')!=='1'){const cached=await config.cache?.match(cacheKey);if(cached){const value=await cached.json() as RecordStatus;if(value.profileId===id&&Date.now()-Date.parse(value.generatedAt)<300000)return json(value);}}
  const response=await fetcher(config.supabaseUrl+'/rest/v1/rpc/studio_record_status',{method:'POST',headers,body:JSON.stringify({profile_id:id}),signal,credentials:'omit',redirect:'manual'});
  if(!response.ok)return json({message:'Record unavailable'},response.status===403?403:503);
  const value=await response.json() as RecordStatus;if(value.profileId!==id||!Array.isArray(value.steps)||!Array.isArray(value.tidyups))return json({message:'Record unavailable'},503);
  await config.cache?.put(cacheKey,new Response(JSON.stringify(value),{headers:{'content-type':'application/json','cache-control':'max-age=300'}}));return json(value);
 }catch(error){return error instanceof Response?error:json({message:'Record unavailable'},503);}
}
export async function checkProfileLink(input:string,fetcher:typeof fetch=fetch,timeoutMs=5000):Promise<number|null>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),signal=controller.signal;
 const deadline=new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Timed out')),{once:true}));
 try{return await Promise.race([(async()=>{let url=new URL(input);for(let hop=0;hop<4;hop++){await validateReferenceUrl(url,fetcher,signal);let response=await fetcher(url.href,{method:'HEAD',credentials:'omit',redirect:'manual',signal});if(response.status===405){await response.body?.cancel();response=await fetcher(url.href,{method:'GET',credentials:'omit',redirect:'manual',signal});}await response.body?.cancel();if(response.status>=300&&response.status<400){const target=response.headers.get('location');if(!target)return response.status;url=new URL(target,url);continue;}return response.status;}return null;})(),deadline]);}catch{return null;}finally{clearTimeout(timer);controller.abort();}
}
export async function checkDueProfileLinks(config:{supabaseUrl:string;serviceKey?:string;fetcher?:typeof fetch}):Promise<void>{
 if(!config.serviceKey)return;const fetcher=config.fetcher??fetch,headers={apikey:config.serviceKey,authorization:'Bearer '+config.serviceKey,'content-type':'application/json'};
 const response=await fetcher(config.supabaseUrl+'/rest/v1/rpc/studio_record_links_due',{method:'POST',headers,body:JSON.stringify({batch_limit:100}),signal:AbortSignal.timeout(10000),redirect:'manual',credentials:'omit'});if(!response.ok)throw new Error('Link check queue unavailable');const rows=await response.json() as Array<{profile_id:string;url:string}>;if(!Array.isArray(rows)||rows.length>100)throw new Error('Invalid check queue');
 const deadline=Date.now()+85000;
 for(let start=0;start<rows.length&&Date.now()<deadline;start+=5){const observations=await Promise.all(rows.slice(start,start+5).map(async row=>({profile_id:row.profile_id,url:row.url,status:await checkProfileLink(row.url,fetcher),checked_at:new Date().toISOString()})));const saved=await fetcher(config.supabaseUrl+'/rest/v1/studio_record_link_checks?on_conflict=profile_id,url',{method:'POST',headers:{...headers,prefer:'resolution=merge-duplicates'},body:JSON.stringify(observations),signal:AbortSignal.timeout(10000),redirect:'manual',credentials:'omit'});if(!saved.ok)throw new Error('Link checks could not be saved');}
}

/** Product job endpoint, not an agent automation. No browser/account credentials. */
export async function handleStudioRecordLinkJob(request:Request,config:{supabaseUrl:string;serviceKey?:string;jobToken?:string;fetcher?:typeof fetch}):Promise<Response>{
 if(request.method!=='POST')return json({message:'Method not allowed'},405);
 if(!config.serviceKey||!config.jobToken)return json({message:'Link checks are not available yet'},503);
 const authorization=request.headers.get('authorization')??'',token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
 if(!token||token.length>1024)return json({message:'Not permitted'},403);
 const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [expected,provided]=await Promise.all([digest(config.jobToken),digest(token)]);let difference=0;for(let index=0;index<expected.length;index++)difference|=expected[index]^provided[index];
 if(difference)return json({message:'Not permitted'},403);
 try{await checkDueProfileLinks(config);return json({checked:true});}catch{return json({message:'Link checks are unavailable'},503);}
}
