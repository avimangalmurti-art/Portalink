import test from 'node:test';
import assert from 'node:assert/strict';
import {mcpServer} from './helpers/mcp-server.mjs';
const server=mcpServer(),id='00000000-0000-4000-8000-000000000007';
const config={supabaseUrl:'https://backend.test',publishableKey:'synthetic-anon',serverKey:'synthetic-server',ipSalt:'synthetic-salt'};
const item={id,creatorId:'creator',projectId:'project',creator:'Ana',creatorHandle:'ana',projectTitle:'Damping',portal:'Engineering',madeOn:'2020-01-01',citable:true,kind:'page',number:7,storagePath:'safe/page.webp'};
const req=(body,extra={})=>new Request('https://portalink.test/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','cf-connecting-ip':'192.0.2.1',...extra},body:JSON.stringify({jsonrpc:'2.0',id:1,...body})});
function backend(target=item,allowed=true){const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});if(url.includes('mcp_allow_request'))return Response.json(allowed);if(url.includes('mcp_citation_item'))return Response.json(target);if(url.includes('search_citable_items'))return Response.json(target?[target]:[]);if(url.includes('/sign/'))return Response.json({signedURL:'/object/sign/project-media/safe/page.webp?token=synthetic'});if(url.includes('record_external_citation'))return Response.json('event');throw Error('Unexpected backend');};return {calls,fetcher};}
test('MCP exposes exact tools, stateless init, resources and anonymous CORS',async()=>{
 const {fetcher}=backend();let res=await server.handleMcp(req({method:'initialize',params:{protocolVersion:'2025-06-18'}}),config,fetcher);assert.equal(res.status,200);assert.equal((await res.json()).result.protocolVersion,'2025-06-18');assert.equal(res.headers.get('mcp-session-id'),null);
 res=await server.handleMcp(req({method:'tools/list'}),config,fetcher);assert.deepEqual((await res.json()).result.tools.map(t=>t.name),['search','fetch','cite','license']);
 res=await server.handleMcp(req({method:'resources/list'}),config,fetcher);assert.equal((await res.json()).result.resources.length,2);
 res=await server.handleMcp(req({method:'notifications/initialized',id:undefined}),config,fetcher);assert.equal(res.status,202);
 res=await server.handleMcp(new Request('https://portalink.test/mcp',{method:'OPTIONS',headers:{Origin:'https://client.test'}}),config);assert.equal(res.status,204);assert.equal(res.headers.get('access-control-allow-origin'),'*');
 res=await server.handleMcp(req({method:'ping'},{origin:'null'}),config,fetcher);assert.equal(res.status,403);
 res=await server.handleMcp(new Request('https://portalink.test/mcp'),config,fetcher);assert.equal(res.status,405);
});
test('MCP non-citable/private/unknown fetches are identical 404 and never sign or record',async()=>{
 for(const target of [null,{...item,citable:false}]){const {fetcher,calls}=backend(target);const res=await server.handleMcp(req({method:'tools/call',params:{name:'fetch',arguments:{citation_id:id}}}),config,fetcher);assert.equal(res.status,404);assert.equal((await res.json()).error.message,'Not found.');assert.equal(calls.some(c=>c.url.includes('/sign/')||c.url.includes('record_external')),false);}
});
test('MCP rate limiter returns429; missing secret fails closed; signing uses anon only',async()=>{
 const b=backend(item,false);assert.equal((await server.handleMcp(req({method:'ping'}),config,b.fetcher)).status,429);
 assert.equal((await server.handleMcp(req({method:'ping'}),{...config,serverKey:undefined},b.fetcher)).status,503);
 const {calls,fetcher}=backend();const res=await server.handleMcp(req({method:'tools/call',params:{name:'fetch',arguments:{citation_id:id}}}),config,fetcher);const data=JSON.parse((await res.json()).result.content[0].text).metadata;
 assert.equal(data.rendered,true);assert.equal(data.valid_for_seconds,3600);assert.equal(data.json_ld['@type'],'CreativeWork');assert.equal(data.json_ld.author.name,'Ana');assert.match(data.license_url,/citable-v1$/);assert.match(data.plain_text,/Ana.*Page 7/);assert.doesNotMatch(data.plain_text,/127.0.0.1/);
 const signing=calls.find(c=>c.url.includes('/sign/'));assert.equal(signing.options.headers.apikey,'synthetic-anon');assert.equal(JSON.parse(signing.options.body).expiresIn,3600);
 assert.equal(calls.some(c=>c.url.includes('record_external')),false);
});
test('MCP fetch marks missing rendered page as fallback and cite passes context without IP',async()=>{
 const hash='a'.repeat(64);const coverThumbnail={version:1,frameBaked:true,bucket:'project-covers',sourceAttachmentId:'attachment',sourceKey:hash,variants:[200,400,800].map(size=>({size,width:size,height:size,path:`${item.creatorId}/${item.projectId}/${hash}/${size}.webp`}))};const b=backend({...item,storagePath:null,coverThumbnail});const r=await server.handleMcp(req({method:'tools/call',params:{name:'fetch',arguments:{citation_id:id}}}),config,b.fetcher);const fallback=JSON.parse((await r.json()).result.content[0].text).metadata;assert.equal(fallback.rendered,false);assert.match(fallback.image_url,/800\.webp$/);assert.match(fallback.thumbnail_url,/400\.webp$/);assert.equal(new URL(fallback.image_url).hostname,'portalinknetworksinc.avimangalmurti566055.chatgpt.site');
 const c=backend();const res=await server.handleMcp(req({method:'tools/call',params:{name:'cite',arguments:{citation_id:id,context:'Lecture'}}}),config,c.fetcher);assert.equal(res.status,200);const record=c.calls.find(c=>c.url.includes('record_external'));const args=JSON.parse(record.options.body);assert.equal(args.p_context,'Lecture');assert.match(args.p_ip_hash,/^[a-f0-9]{64}$/);assert.doesNotMatch(record.options.body,/192.0.2.1/);assert.equal(record.options.headers.apikey,'synthetic-server');
});
