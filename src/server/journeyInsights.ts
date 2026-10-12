import type {JourneyInsights,WorkInsight} from '../features/journey/insightsModel';
import type {ReachDatabase} from './projectReach';
type Row=Record<string,unknown>;
type Config={supabaseUrl:string;publishableKey:string;authenticate:(request:Request,required:boolean)=>Promise<{id:string}|null>;fetcher?:typeof fetch};
type Cache={match(request:Request):Promise<Response|undefined>;put(request:Request,response:Response):Promise<unknown>};
const DAY=86400000,UUID=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'private, no-store','vary':'Authorization','x-content-type-options':'nosniff'}});
function date(value:unknown){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}/.test(value))return null;const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString().slice(0,10):null;}
const month=(value:unknown)=>date(value)?.slice(0,7)??null;
const quarter=(value:unknown)=>{const day=date(value);return day?`${day.slice(0,4)}-Q${Math.ceil(Number(day.slice(5,7))/3)}`:null;};
const sum=(rows:Row[],key:string)=>rows.reduce((total,row)=>total+(Number.isFinite(Number(row[key]))?Number(row[key]):0),0);
function medianHistogram(rows:Row[]):number|null{const histogram=new Map<number,number>();for(const row of rows){let parsed:unknown;try{parsed=JSON.parse(String(row.max_page_hist));}catch{continue;}if(!parsed||typeof parsed!=='object')continue;for(const [key,value] of Object.entries(parsed)){const page=Number(key)+1,count=Number(value);if(Number.isInteger(page)&&page>0&&Number.isInteger(count)&&count>0)histogram.set(page,(histogram.get(page)??0)+count);}}
 const total=[...histogram.values()].reduce((a,b)=>a+b,0);if(!total)return null;const ranks=[Math.floor((total+1)/2),Math.floor((total+2)/2)],values:number[]=[];let seen=0;for(const [page,count] of [...histogram].sort(([a],[b])=>a-b)){seen+=count;while(values.length<2&&seen>=ranks[values.length])values.push(page);}return values.length===2?(values[0]+values[1])/2:null;}
export function aggregateJourney(profileId:string,projects:Row[],incoming:Row[],outgoing:Row[],external:Row[],daily:Row[],targets:Map<string,string>,now=new Date()):JourneyInsights{
 const months=new Map<string,{month:string;works:number;citations:number}>(),quarters=new Map<string,{quarter:string;works:number;references:number}>(),years=new Map<number,Map<string,number>>();
 const monthly=(key:string)=>{if(!months.has(key))months.set(key,{month:key,works:0,citations:0});return months.get(key)!;};
 const quarterly=(key:string)=>{if(!quarters.has(key))quarters.set(key,{quarter:key,works:0,references:0});return quarters.get(key)!;};
 for(const project of projects){const key=month(project.made_on);if(!key)continue;monthly(key).works++;quarterly(quarter(project.made_on)!).works++;const year=Number(key.slice(0,4)),portal=String(project.category_id);if(!years.has(year))years.set(year,new Map());const fields=years.get(year)!;fields.set(portal,(fields.get(portal)??0)+1);}
 for(const citation of incoming){const key=month(citation.created_at);if(key)monthly(key).citations++;}
 for(const reference of [...outgoing,...external]){const key=quarter(reference.created_at);if(key){quarterly(key).references++;monthly(month(reference.created_at)!);}}
 const keys=[...months.keys()].sort();if(keys.length){const ordinal=(key:string)=>Number(key.slice(0,4))*12+Number(key.slice(5,7))-1;for(let index=ordinal(keys[0]);index<=ordinal(keys.at(-1)!);index++){const key=String(Math.floor(index/12)).padStart(4,'0')+'-'+String(index%12+1).padStart(2,'0');monthly(key);quarterly(quarter(key+'-01')!);}}
 const monday=new Date(now);monday.setUTCHours(0,0,0,0);monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
 const dailyByProject=new Map<string,Row[]>(),receivedByProject=new Map<string,number>(),usedByProject=new Map<string,number>();
 for(const row of daily){const id=String(row.project_id);if(!dailyByProject.has(id))dailyByProject.set(id,[]);dailyByProject.get(id)!.push(row);}
 for(const row of incoming){const id=targets.get(String(row.cited_item_id));if(id)receivedByProject.set(id,(receivedByProject.get(id)??0)+1);}
 for(const row of [...outgoing,...external]){const id=String(row.citing_project_id??row.project_id);usedByProject.set(id,(usedByProject.get(id)??0)+1);}
 const metrics:WorkInsight[]=projects.map(project=>{const id=String(project.id),rollups=dailyByProject.get(id)??[],received=receivedByProject.get(id)??0,used=usedByProject.get(id)??0,made=date(project.made_on);
  return{projectId:id,reads:rollups.length?sum(rollups,'opened'):null,medianPageReached:medianHistogram(rollups),medianSeconds:null,citations:received||null,references:used||null,daysSinceMade:made?Math.floor((Date.parse(now.toISOString().slice(0,10))-Date.parse(made))/DAY):null,weeks:Array.from({length:12},(_,index)=>{const start=new Date(monday.getTime()-(11-index)*7*DAY),end=new Date(start.getTime()+7*DAY),rows=rollups.filter(row=>String(row.day)>=start.toISOString().slice(0,10)&&String(row.day)<end.toISOString().slice(0,10));return{week:start.toISOString().slice(0,10),reads:rows.length?sum(rows,'opened'):null};})};});
 return{profileId,generatedAt:now.toISOString(),months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)),fields:[...years].sort(([a],[b])=>a-b).map(([year,portals])=>{const total=[...portals.values()].reduce((a,b)=>a+b,0);return{year,portals:[...portals].map(([portalId,works])=>({portalId,works,share:works/total}))};}),quarters:[...quarters.values()].sort((a,b)=>a.quarter.localeCompare(b.quarter)),projects:metrics};
}
async function rows(config:Config,request:Request,table:string,query:URLSearchParams):Promise<Row[]>{const output:Row[]=[];for(let offset=0;;offset+=500){const params=new URLSearchParams(query);params.set('limit','500');params.set('offset',String(offset));const response=await(config.fetcher??fetch)(`${config.supabaseUrl}/rest/v1/${table}?${params}`,{headers:{apikey:config.publishableKey,authorization:request.headers.get('authorization')??'',accept:'application/json'},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Insights source unavailable');const data=await response.json();if(!Array.isArray(data))throw new Error('Insights source unavailable');output.push(...data);if(data.length<500)return output;}}
export async function handleJourneyInsights(request:Request,db:ReachDatabase|undefined,config:Config,dependencies:{cache?:Cache;now?:Date}={}):Promise<Response>{
 if(request.method!=='GET')return json({error:'Method not allowed.'},405);const profileId=new URL(request.url).searchParams.get('profile')??'';if(!UUID.test(profileId))return json({error:'Invalid profile.'},400);
 try{const user=await config.authenticate(request,true);if(!user)return json({error:'Sign in to view Insights.'},401);
  // Verify canonical ownership on EVERY request, including cache hits. Never
  // inherit a public profile's visibility as authorization for its analytics.
  const profiles=await rows(config,request,'profiles',new URLSearchParams({select:'id,account_id',id:`eq.${profileId}`,account_id:`eq.${user.id}`,order:'id'}));if(profiles.length!==1||profiles[0].id!==profileId||profiles[0].account_id!==user.id)return json({error:'Not permitted.'},403);
  if(!db)return json({error:'Insights are not available yet.'},503);const now=dependencies.now??new Date(),key=new Request(new URL(`/__owner-insights-cache/${encodeURIComponent(user.id)}/${profileId}`,request.url));
  const cached=await dependencies.cache?.match(key).catch(()=>undefined);if(cached){try{const data=await cached.json() as JourneyInsights;const age=now.getTime()-Date.parse(data.generatedAt);if(data.profileId===profileId&&age>=0&&age<600000&&Array.isArray(data.projects)&&Array.isArray(data.months))return json(data);}catch{ /* Invalid cache data is a miss, not an authorization or availability change. */ }}
  const [projects,incoming,outgoing,external]=await Promise.all([
   rows(config,request,'projects',new URLSearchParams({select:'id,profile_id,category_id,made_on',profile_id:`eq.${profileId}`,order:'made_on.asc,id'})),
   rows(config,request,'citations',new URLSearchParams({select:'id,cited_item_id,created_at',cited_creator_id:`eq.${profileId}`,order:'created_at.asc,id'})),
   rows(config,request,'citations',new URLSearchParams({select:'id,citing_project_id,created_at',citing_creator_id:`eq.${profileId}`,order:'created_at.asc,id'})),
   rows(config,request,'external_references',new URLSearchParams({select:'id,project_id,created_at',owner_profile_id:`eq.${profileId}`,order:'created_at.asc,id'})),
  ]);
  if(projects.some(row=>row.profile_id!==profileId||!UUID.test(String(row.id))))throw new Error('Invalid project source');
  const targets=new Map<string,string>(),ids=[...new Set(incoming.map(row=>String(row.cited_item_id)).filter(id=>UUID.test(id)))],ownedIds=new Set(projects.map(row=>String(row.id)));
  // Batch canonical opaque image/page mappings, rather than one network RPC per
  // citation. Parent RLS plus the owned-project set constrain every mapping.
  for(let offset=0;offset<ids.length;offset+=100){const batch=ids.slice(offset,offset+100).join(',');const [images,pages]=await Promise.all([
   rows(config,request,'project_attachments',new URLSearchParams({select:'id,project_id,citation_id',citation_id:`in.(${batch})`,order:'id'})),
   rows(config,request,'project_pages',new URLSearchParams({select:'id,attachment:project_attachments!inner(project_id)',id:`in.(${batch})`,order:'id'})),
  ]);for(const image of images){if(ownedIds.has(String(image.project_id)))targets.set(String(image.citation_id),String(image.project_id));}for(const page of pages){const attachment=page.attachment as Row|undefined;if(attachment&&ownedIds.has(String(attachment.project_id)))targets.set(String(page.id),String(attachment.project_id));}}
  const daily:Row[]=[];for(let offset=0;offset<projects.length;offset+=200){const batch=projects.slice(offset,offset+200).map(row=>row.id);const result=await db.prepare(`SELECT project_id,day,opened,max_page_hist FROM project_reach_daily WHERE project_id IN (${batch.map(()=>'?').join(',')}) ORDER BY project_id,day`).bind(...batch).all<Row>();daily.push(...(result.results??[]));}
  const data=aggregateJourney(profileId,projects,incoming,outgoing,external,daily,targets,now);if(dependencies.cache)await dependencies.cache.put(key,new Response(JSON.stringify(data),{headers:{'content-type':'application/json','cache-control':'public, max-age=600'}})).catch(()=>undefined);return json(data);
 }catch(error){return error instanceof Response?error:json({error:'Insights could not load. Please try again.'},503);}
}
