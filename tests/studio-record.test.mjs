import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceModule} from './helpers/source-module.mjs';
const model=sourceModule('src/features/record/model.ts');
const resolver=sourceModule('src/server/referenceResolver.ts',{'../features/references/model':{textReference:()=>null}},{Response,Request,AbortController,AbortSignal,setTimeout,clearTimeout,TextDecoder,TextEncoder});
const server=sourceModule('src/server/studioRecord.ts',{'./referenceResolver':resolver},{Response,Request,AbortController,AbortSignal,setTimeout,clearTimeout,TextDecoder,TextEncoder});
const id='00000000-0000-0000-0000-000000000001';
const status={profileId:id,generatedAt:new Date().toISOString(),steps:[],tidyups:[],events:[],lastSeen:null,linkChecksReady:true};
test('record worker verifies ownership before cache, returns 403 for another account, and never requests public bundles',async()=>{
 let cached=0,rpc=0;const cache={match:async()=>{cached++;return Response.json(status);}},config={supabaseUrl:'https://db.example',publishableKey:'public-test',authenticate:async()=>({id:'other'}),cache,fetcher:async url=>{if(String(url).includes('/profiles?'))return Response.json([]);rpc++;assert.fail('No RPC for non-owner');}};
 const response=await server.handleStudioRecord(new Request('https://app.example/api/studio/record?profile='+id),config);assert.equal(response.status,403);assert.equal(cached,0);assert.equal(rpc,0);
});
test('record worker caches owner-only results for five minutes and fresh bypasses stored data',async()=>{
 let rpc=0,puts=0;const config={supabaseUrl:'https://db.example',publishableKey:'test',authenticate:async()=>({id:'owner'}),cache:{match:async()=>Response.json(status),put:async()=>puts++},fetcher:async url=>String(url).includes('/profiles?')?Response.json([{id}]):(rpc++,Response.json(status))};
 assert.equal((await server.handleStudioRecord(new Request('https://app.example/api/studio/record?profile='+id),config)).status,200);assert.equal(rpc,0);
 const response=await server.handleStudioRecord(new Request('https://app.example/api/studio/record?profile='+id+'&fresh=1'),config);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(rpc,1);assert.equal(puts,1);
});
test('snooze write uses caller JWT, rejects arbitrary events and invalidates only the owner cache',async()=>{
 const writes=[];let deletes=0;const config={supabaseUrl:'https://db.example',publishableKey:'test',authenticate:async()=>({id:'owner'}),cache:{delete:async()=>deletes++},fetcher:async(url,options)=>{if(String(url).includes('/profiles?'))return Response.json([{id}]);writes.push(options);return new Response(null,{status:201});}};
 const request=body=>new Request('https://app.example/api/studio/record?profile='+id,{method:'POST',headers:{authorization:'Bearer test-token'},body:JSON.stringify(body)});
 assert.equal((await server.handleStudioRecord(request({event:'snooze',key:'headline'}),config)).status,200);assert.equal(writes[0].headers.authorization,'Bearer test-token');assert.equal(deletes,1);
 assert.equal((await server.handleStudioRecord(request({event:'delete',key:'headline'}),config)).status,400);assert.equal(writes.length,1);
});
test('Not now expires exactly at fourteen days, Never persists in fresh server data, and Home requires three days away',()=>{
 const now=Date.now(),s={...status,steps:[{key:'a',field:'headline',label:'A'},{key:'b',field:'appearance',label:'B'}],events:[{event:'snooze',key:'a',expiresAt:new Date(now+1).toISOString()},{event:'never',key:'b'}]};assert.equal(model.recordRows(s,'steps',now)[0].memory,'snoozed');assert.equal(model.recordRows(s,'steps',now+1)[0].memory,'active');assert.equal(model.recordRows(s,'steps',now+1).length,1);assert.equal(model.awayThreeDays(status,now),false);assert.equal(model.awayThreeDays({...status,lastSeen:new Date(now-3*86400000).toISOString()},now),true);
});
test('exact-field links preserve project identity and reject malformed targets; unavailable school and AI do not count',()=>{
 const s={...status,steps:[{key:'school',field:'school',available:false},{key:'ai',field:'connect-ai',available:false},{key:'a',field:'headline'}]};assert.equal(model.recordRows(s,'steps').length,1);assert.equal(new URL(model.recordHref(id,{key:'date:'+id,field:'date',projectId:id,portalId:id}),'https://app.example').pathname,`/p/${id}/c/${id}/${id}`);assert.match(model.recordHref(id,{key:'portals',field:'portals'}),/view=portals/);assert.throws(()=>model.recordHref(id,{key:'bad',field:'summary',projectId:'bad'}));
});
test('daily link checks exclude private addresses, validate redirect targets, and time out without inventing an HTTP failure',async()=>{
 assert.equal(await server.checkProfileLink('http://127.0.0.1',()=>assert.fail('Private target not fetched')),null);
 assert.equal(await server.checkProfileLink('https://8.8.8.8',async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1'}})),null);
 assert.equal(await server.checkProfileLink('https://8.8.8.8',()=>new Promise(()=>{}),5),null);
 assert.equal(await server.checkProfileLink('https://8.8.8.8',async(_url,options)=>{assert.equal(options.credentials,'omit');return new Response(null,{status:404});}),404);
});

test('product link-check job fails closed without its secrets and refuses account tokens before any database call',async()=>{
 const request=token=>new Request('https://app.example/api/studio/record/check-links',{method:'POST',headers:{authorization:'Bearer '+token}}),fetcher=()=>assert.fail('No queue request without job authorization');
 assert.equal((await server.handleStudioRecordLinkJob(request('account-token'),{supabaseUrl:'https://db.example',fetcher})).status,503);
 assert.equal((await server.handleStudioRecordLinkJob(request('account-token'),{supabaseUrl:'https://db.example',serviceKey:'service-test',jobToken:'job-test',fetcher})).status,403);
 const calls=[];const response=await server.handleStudioRecordLinkJob(request('job-test'),{supabaseUrl:'https://db.example',serviceKey:'service-test',jobToken:'job-test',fetcher:async(url,options)=>{calls.push({url,options});return Response.json([]);}});assert.equal(response.status,200);assert.equal(calls.length,1);assert.match(calls[0].url,/studio_record_links_due/);assert.equal(JSON.parse(calls[0].options.body).batch_limit,100);
});

test('preview completion accepts confirmed handle redirects but rejects another creator and the still-hidden welcome preview',()=>{
 const shown={path:'/example',resolvedProfileId:id,heading:'Example Creator',hidden:false};assert.equal(model.confirmedPublicPreview(shown,id,'Example Creator'),true);assert.equal(model.confirmedPublicPreview({...shown,resolvedProfileId:'other'},id,'Example Creator'),false);assert.equal(model.confirmedPublicPreview({...shown,hidden:true},id,'Example Creator'),false);assert.equal(model.confirmedPublicPreview({path:'/share/'+id,heading:'Example Creator',hidden:false},id,'Example Creator'),true);assert.equal(model.confirmedPublicPreview({path:'/share/'+id,heading:'Not found',hidden:false},id,'Example Creator'),false);
});

test('an applicable global project or icon step targets the current owned screen, never the most recent unrelated work',()=>{
 const older='00000000-0000-0000-0000-000000000002',s={...status,steps:[{key:'citable',field:'citable',label:'Make one project citable',projectId:id,portalId:id},{key:'portals',field:'icon',label:'Give First an icon',portalId:id}],projectTargets:[{id,portalId:id},{id:older,portalId:older}],portalTargets:[{id:older,label:'Structural Engineering',needsIcon:true}]};const current=model.relevantRow(s,'project',older);assert.equal(current.projectId,older);assert.equal(current.portalId,older);assert.equal(model.relevantRow(s,'project','not-owned'),undefined);const portal=model.relevantRow(s,'portal',older);assert.equal(portal.portalId,older);assert.equal(portal.label,'Give Structural Engineering an icon');
});
