import {matchPath} from 'react-router-dom';
import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import vm from 'node:vm';import {readFileSync} from 'node:fs';
function load(file,require=()=>({}),extra={}){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,URL,Request,Response,JSON,Date,...extra});return exports;}
const model=load('src/features/citations/model.ts');const server=load('src/server/citation.ts',path=>path.includes('publicOrigin')?{PUBLIC_ORIGIN:'https://portalinknetworksinc.avimangalmurti566055.chatgpt.site'}:model);
const item={id:'image/a',creator:'Creator <safe>',projectTitle:'Work',projectId:'project',creatorId:'creator',madeOn:'2020-03-04',kind:'image',number:2,citable:true};
const config={supabaseUrl:'https://example.test',publishableKey:'test-key'};const assets={fetch:async()=>new Response('<head><!--CITATION_HEAD--></head><body><!--CITATION_BODY--></body>')};
test('private and unknown IDs return identical real HTTP 404 responses',async()=>{for(const id of ['private','unknown']){const result=await server.handleCitation(new Request(`https://portalink.test/cite/${id}`),assets,config,async()=>Response.json(null));assert.equal(result.status,404);assert.equal(await result.text(),'Not found');assert.equal(result.headers.get('cache-control'),'no-store');}});
test('resolver includes escaped attribution, JSON-LD and versioned license',async()=>{const result=await server.handleCitation(new Request('https://portalink.test/cite/image%2Fa'),assets,config,async()=>Response.json(item));const html=await result.text();assert.equal(result.status,200);assert.match(html,/rel="license"/);assert.match(html,/CreativeWork/);assert.match(html,/2020-03-04/);assert.match(html,/Creator &lt;safe&gt;/);assert.doesNotMatch(html,/<safe>/);});
test('view-only response gives no copy affordance and has distinct license',async()=>{const result=await server.handleCitation(new Request('https://portalink.test/cite/item'),assets,config,async()=>Response.json({...item,citable:false}));const html=await result.text();assert.match(html,/View only/);assert.match(html,/view-only-v1/);assert.doesNotMatch(html,/Copy citation/);});
test('citation IDs and copy text do not depend on mutable title/order/portal',()=>{assert.equal(model.citationPath(item.id),model.citationPath({...item,projectTitle:'Renamed',number:9}.id));assert.match(model.plainCitation(item,'https://portalink.test'),/image%2Fa/);assert.match(model.bibCitation(item,'https://portalink.test'),/@misc/);});
test('no citation query ranks content by citation counts',()=>{for(const file of ['src/features/citations/service.ts','src/features/citations/journeyCitations.ts','supabase/migrations/202610070002_human_citations.sql'])assert.doesNotMatch(readFileSync(file,'utf8'),/(?:order\s+by|\.order\s*\()[^;\n]*(?:citation_count|citationCount|count\s*\()/i);});

test('public Cited-in component uses the strict projection, not owner-readable citation rows',()=>{
 const source=readFileSync('src/features/citations/CitationReferences.tsx','utf8');
 const section=source.slice(source.indexOf('export function CitedIn'));
 assert.match(section,/publicCitedIn\(itemId\)/);assert.doesNotMatch(section,/listCitations|citationProject/);
});
test('full-size citation media uses existing signed project-media pipeline, not resized covers',async()=>{
 let signedPaths;let signedBucket;
 const service=load('src/features/citations/service.ts',name=>name.includes('mediaUrlCache')?{signedMediaUrls:async(bucket,paths)=>{signedBucket=bucket;signedPaths=paths;return new Map([[paths[0],'https://signed.test/full-page']]);}}:name.includes('client')?{requireSupabase:()=>({rpc:async()=>({data:{...item,kind:'page',storagePath:'posts/project/pages/page-7.webp'},error:null})})}:{});
 const resolved=await service.resolveCitationItem('page-id');
 assert.equal(signedBucket,'project-media');assert.equal(signedPaths[0],'posts/project/pages/page-7.webp');assert.equal(resolved.sourceUrl,'https://signed.test/full-page');
});
test('public Journey consumes bundled citation events without additional queries',()=>{
 let events;let reads=0;
 const hook=load('src/features/citations/useJourneyCitations.ts',name=>name==='react'?{useEffect:callback=>callback(),useState:()=>[[],value=>{events=value;}]}:name.endsWith('/service')?{listCitations:()=>{reads++;throw Error('Unexpected query');}}:name.endsWith('/model')?model:{});
 hook.useJourneyCitations({id:'profile',publicCitationEvents:[{id:'citation',direction:'outgoing',item_id:'page',label:'page 7',other_project_title:'Source',citing_project_title:'Bridge',created_at:'2020-03-04'}]},false);
 assert.equal(reads,0);assert.equal(events.length,1);assert.equal(events[0].href,'/cite/page');
});

test('notification /p project target resolves through the actual application route matcher',()=>{
 const routes=load('src/app/routes.ts',()=>({navigationDestinations:[]}));
 const routerSource=readFileSync('src/app/useAppRoute.ts','utf8')+'\nexport {parse as parseForTest};';
 const exports={};vm.runInNewContext(ts.transpileModule(routerSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>name==='react-router-dom'?{matchPath}:name==='./routes'?routes:{},URLSearchParams});
 const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000021'];
 const result=exports.parseForTest(`/p/${ids[0]}/c/${ids[1]}/${ids[2]}`,'');assert.equal(result.kind,'project');assert.equal(result.projectId,ids[2]);
});
