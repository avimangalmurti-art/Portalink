import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {sourceModule} from './helpers/source-module.mjs';
import {api,fixture,ids,payload,request} from './helpers/reach-fixture.mjs';
const server=sourceModule('src/server/journeyInsights.ts',{}, {fetch,Response,Request,AbortSignal,Date});
const profile='00000000-0000-0000-0000-000000000001',owner='owner-account',other='other-account',project='20000000-0000-0000-0000-000000000001',now=new Date('2026-10-12T12:00:00Z');
const plain=value=>JSON.parse(JSON.stringify(value));
test('monthly series, portal shares and quarterly inputs/outputs cover a synthetic three-year record',()=>{
 const projects=[{id:'first',made_on:'2024-01-01',category_id:'art'},{id:'second',made_on:'2024-01-20',category_id:'design'},{id:'third',made_on:'2025-06-01',category_id:'art'},{id:'fourth',made_on:'2026-09-03',category_id:'design'}];
 const result=server.aggregateJourney(profile,projects,[{cited_item_id:'a',created_at:'2024-02-05'},{cited_item_id:'a',created_at:'2026-09-03'}],[{citing_project_id:'fourth',created_at:'2026-09-04'}],[{project_id:'fourth',created_at:'2026-09-05'}],[],new Map([['a','first']]),now);
 assert.equal(result.months.length,33);assert.deepEqual(plain(result.months[0]),{month:'2024-01',works:2,citations:0});assert.equal(result.months[1].citations,1);assert.equal(result.months.at(-1).citations,1);assert.equal(result.months.reduce((n,row)=>n+row.works,0),4);assert.equal(result.fields[0].portals[0].share,.5);assert.equal(result.quarters.length,11);assert.deepEqual(plain(result.quarters.at(-1)),{quarter:'2026-Q3',works:1,references:2});assert.equal(result.projects[0].citations,2);
});
test('read counts use daily aggregates; depth is a weighted median reached page and unavailable dwell remains null',()=>{
 const result=server.aggregateJourney(profile,[{id:project,made_on:'2026-10-01',category_id:'art'}],[],[],[],[{project_id:project,day:'2026-10-12',opened:5,max_page_hist:'{"-1":1,"0":1,"2":2,"4":1}'},{project_id:project,day:'2026-10-05',opened:1,max_page_hist:'{"6":1}'}],new Map(),now).projects[0];
 assert.equal(result.reads,6);assert.equal(result.medianPageReached,3);assert.equal(result.medianSeconds,null);assert.equal(result.weeks.length,12);assert.equal(result.weeks.at(-1).reads,5);assert.equal(result.weeks[0].reads,null);assert.equal(result.daysSinceMade,11);
 const empty=server.aggregateJourney(profile,[{id:project,category_id:'art'}],[],[],[],[],new Map(),now).projects[0];for(const key of ['reads','medianPageReached','medianSeconds','citations','references','daysSinceMade'])assert.equal(empty[key],null);
});
function backend(){const calls=[],db={prepare(sql){assert.match(sql,/FROM project_reach_daily/);assert.doesNotMatch(sql,/count\(|project_reach_events|page_timings/i);return{bind(){return this;},async all(){return{results:[{project_id:project,day:'2026-10-12',opened:3,max_page_hist:'{"1":3}'}]};}};}};const config={supabaseUrl:'https://supabase.example',publishableKey:'synthetic',authenticate:async req=>req.headers.get('authorization')?{id:req.headers.get('authorization').slice(7)}:null,fetcher:async(url,options)=>{calls.push({url,options});assert.equal(options.credentials,'omit');const address=new URL(url);const table=address.pathname.split('/').at(-1);if(table==='profiles')return Response.json(options.headers.authorization===`Bearer ${owner}`?[{id:profile,account_id:owner}]:[]);if(table==='projects')return Response.json([{id:project,profile_id:profile,category_id:'art',made_on:'2026-10-01'}]);return Response.json([]);}};return{calls,db,config};}
const get=account=>new Request('https://portalink.example/api/insights?profile='+profile,{headers:account?{authorization:`Bearer ${account}`}:{}});
test('JWT owner-only endpoint returns 403 to every other account before any cache/data access',async()=>{
 const b=backend();let cacheRead=0;for(const account of [other,'third-account']){const response=await server.handleJourneyInsights(get(account),b.db,b.config,{cache:{match:()=>{cacheRead++;},put(){}}});assert.equal(response.status,403);}assert.equal(cacheRead,0);assert.equal(b.calls.every(call=>call.url.includes('/profiles?')),true);assert.equal((await server.handleJourneyInsights(get(),b.db,b.config)).status,401);
});
test('ten-minute owner cache always revalidates ownership and never supplies a public cacheable response',async()=>{
 const b=backend(),cacheRows=new Map(),cache={async match(key){return cacheRows.get(key.url)?.clone();},async put(key,value){cacheRows.set(key.url,value.clone());}};
 const first=await server.handleJourneyInsights(get(owner),b.db,b.config,{cache,now});assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'private, no-store');const requests=b.calls.length;
 const cached=await server.handleJourneyInsights(get(owner),b.db,b.config,{cache,now:new Date(now.getTime()+599999)});assert.equal(cached.status,200);assert.equal(b.calls.length,requests+1);assert.equal((await cached.json()).projects[0].reads,3);
 await server.handleJourneyInsights(get(owner),b.db,b.config,{cache,now:new Date(now.getTime()+600000)});assert.ok(b.calls.length>requests+2);
 assert.equal((await server.handleJourneyInsights(get(other),b.db,b.config,{cache,now})).status,403);
 b.config.fetcher=async()=>Response.json([]);assert.equal((await server.handleJourneyInsights(get(owner),b.db,b.config,{cache,now})).status,403);
});
test('batch citation mappings retain canonical project ownership and avoid per-item RPCs',async()=>{
 const b=backend(),base=b.config.fetcher,image='30000000-0000-0000-0000-000000000001',page='30000000-0000-0000-0000-000000000002';
 b.config.fetcher=async(url,options)=>{const address=new URL(url);assert.ok(!address.pathname.includes('/rpc/'));if(address.pathname.endsWith('/citations')&&address.searchParams.has('cited_creator_id'))return Response.json([{cited_item_id:image,created_at:'2026-10-01'},{cited_item_id:page,created_at:'2026-10-02'}]);if(address.pathname.endsWith('/project_attachments'))return Response.json([{citation_id:image,project_id:project},{citation_id:'foreign',project_id:'another-project'}]);if(address.pathname.endsWith('/project_pages'))return Response.json([{id:page,attachment:{project_id:project}},{id:'foreign-page',attachment:{project_id:'another-project'}}]);return base(url,options);};
 const response=await server.handleJourneyInsights(get(owner),b.db,b.config,{now});assert.equal(response.status,200);assert.equal((await response.json()).projects[0].citations,2);
});
test('invalid cache entries and missing sources cannot fabricate metrics or bypass authorization',async()=>{
 const b=backend();const response=await server.handleJourneyInsights(get(owner),b.db,b.config,{now,cache:{async match(){return new Response('invalid');},async put(){throw Error('cache unavailable');}}});assert.equal(response.status,200);
 const base=b.config.fetcher;b.config.fetcher=async(url,options)=>url.includes('/external_references?')?new Response('missing table',{status:404}):base(url,options);assert.equal((await server.handleJourneyInsights(get(owner),b.db,b.config,{now})).status,503);
});
test('known owner beacons are excluded; duplicate progress and reloads with a single day/session never become extra reads',async()=>{
 const f=fixture();try{const own=await api.ingestReach(request('/api/reach',payload(),ids.owner),f.db,f.config,{now:()=>now.getTime(),random:()=>.5});assert.equal(own.status,200);assert.equal(f.sqlite.prepare('SELECT opened FROM project_reach_daily').get(),undefined);
 for(const page of [-1,0,2,2])assert.equal((await api.ingestReach(request('/api/reach',payload({furthest_page:page})),f.db,f.config,{now:()=>now.getTime(),random:()=>.5})).status,204);
 assert.equal(f.sqlite.prepare('SELECT opened FROM project_reach_daily').get().opened,1);
 assert.match(readFileSync('src/components/media/ProjectMediaViewer.tsx','utf8'),/useProjectReach\([^;]*viewerProfileId !== creator\?\.id && !isOwner/);
 }finally{f.sqlite.close();}
});
test('neither Journey nor other content is ordered by citation counts or reads',()=>{
 for(const file of ['src/features/journey/journey.ts','src/features/citations/journeyCitations.ts','src/features/journey/InsightsTimeline.tsx','src/features/profile/useProfileProjectOrder.ts'])assert.doesNotMatch(readFileSync(file,'utf8'),/(?:order\s+by|\.order\s*\(|\.sort\s*\()[^;\n]*(?:citation_count|citationCount|reads|opened|reach)/i);
});
