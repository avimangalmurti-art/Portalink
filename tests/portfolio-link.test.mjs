import { sourceModule } from './helpers/source-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { generate } from 'lean-qr';
import { createHash } from 'node:crypto';
import { renderCoverAssets } from '../src/features/media/coverThumbnailCore.mjs';
function load(file,imports={},globals={}) { const exports={};const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,URLSearchParams,Response,Request,AbortSignal,crypto,...globals,require:n=>{
      if (n.endsWith('/textFormatting')) return sourceModule('src/components/text/textFormatting.ts');
      if (n.endsWith('/textFormatting')) return sourceModule('src/components/text/textFormatting.ts');assert.ok(n in imports,n);return imports[n];}});return exports; }
const model=load('src/features/sharing/shareModel.ts');
const id='11111111-1111-4111-8111-111111111111';
test('handle grammar, suggestions, all product roots and URL fallbacks',()=>{
 for(const valid of ['avi','avi.work','a'.repeat(30)])assert.equal(model.validHandle(valid),true);
 for(const bad of ['ab','Avi','avi_work','avi-work','.avi','a'.repeat(31),'messages','share','api','og.png'])assert.equal(model.validHandle(bad),false,bad);
 const routes=readFileSync(new URL('../src/app/routes.ts',import.meta.url),'utf8');for(const path of [...routes.matchAll(/path: '([^']+)'/g)].map(m=>m[1]))for(const segment of path.split('/').filter(s=>s&&!s.startsWith(':')))assert.ok(model.RESERVED_HANDLES.has(segment),segment);
 assert.equal(model.handleFromPath('/avi'), 'avi');assert.equal(model.handleFromPath('/messages'),null);assert.equal(model.handleFromPath('/avi/no'),null);
 assert.equal(model.portfolioPath(id,'legacy_name'),'/share/'+id);assert.equal(model.portfolioPath(id,'avi'),'/avi');
 assert.equal(model.handleFromPath('/avi/c/portal/project'),'avi');
 assert.equal(model.handleFromPath('/avi/c/portal/project/extra'),null);
 assert.equal(model.isPublicSharePath('/avi/c/portal/project'),true);
 assert.equal(model.portfolioProjectPath(id,'portal','project','avi'),'/avi/c/portal/project');
 for(const name of ['Avi Mangal Murti','A','Portalink','!!!']) {const values=model.handleSuggestions(name);assert.equal(values.length,3);assert.ok(values.every(model.validHandle));}
});
test('shared card text, mailto and optional referral contain exactly authored values',()=>{
 const card=model.shareCardText('Avi','Architecture',7,'School');assert.equal(card.title,'Avi — Portfolio');assert.equal(card.description,'Architecture · School · 7 projects');
 const url=model.withReferral('https://example.test/avi','a12b');assert.equal(url,'https://example.test/avi?via=a12b');
 const link=model.portfolioMailto('friend@example.test','Hello & welcome','Avi',url);const parsed=new URL(link);assert.equal(parsed.searchParams.get('subject'),'Portfolio — Avi');assert.equal(parsed.searchParams.get('body'),'Hello & welcome\n\n'+url);assert.throws(()=>model.portfolioMailto('bad@example.test?bcc=x','Hi','Avi',url));
});
test('address resolver handles permanent UUID and expiring alias redirects without forwarding identity',async()=>{
 let data={profileId:id,handle:'avi',alias:true}; const calls=[];
 const server=load('src/server/shareAddress.ts',{'../features/sharing/shareModel':model},{fetch:async(url,options)=>{assert.equal(options.redirect,'manual');calls.push(options);return Response.json(data);}});
 const config={supabaseUrl:'https://test.supabase.co',publishableKey:'public'};
 let result=await server.resolveShareRequest(new Request('https://site.test/old.avi?via=abc',{headers:{Authorization:'secret'}}),config);
 assert.equal(result.redirect.status,301);assert.equal(result.redirect.headers.get('location'),'https://site.test/avi?via=abc');assert.equal(new Headers(calls[0].headers).has('authorization'),false);
 result=await server.resolveShareRequest(new Request('https://site.test/old.avi/c/portal/project?page=2'),config);
 assert.equal(result.redirect.headers.get('location'),'https://site.test/avi/c/portal/project?page=2');
 data={handle:'avi',confirmed:true};result=await server.resolveShareRequest(new Request('https://site.test/share/'+id),config);assert.equal(result.redirect.status,301);
 data=null;result=await server.resolveShareRequest(new Request('https://site.test/expired.avi'),config);assert.equal(result.missing,true);
 result=await server.resolveShareRequest(new Request('https://site.test/share/'+id),config);assert.equal(result.redirect,undefined);
});
test('RPC absence uses UUID, permission/network errors never claim fallback success',async()=>{
 let error={code:'PGRST202',message:'profile_share_address is missing'}, data=null;
 const service=load('src/services/supabase/profileSharing.ts',{'./client':{requireSupabase:()=>({rpc:async()=>({data,error})})},'../../features/sharing/shareModel':model}).profileSharing;
 assert.equal((await service.getShareAddress(id)).handle,null);error={code:'PGRST202',message:'profile_handle_available is missing'};assert.equal(await service.checkPublicHandle('avi'),'unavailable');
 error={code:'42501',message:'denied'};await assert.rejects(service.getShareAddress(id),/denied/);
 error=null;data={handle:'avi',confirmed:true};assert.equal((await service.getShareAddress(id)).handle,'avi');
});
test('social image is a real white1200x630 raster and selected page/crop are used',async()=>{
 const draws=[],fills=[],pages=[];const runtime={renderPdfPage:async(url,page,edge)=>{pages.push([page,edge]);return {source:{},width:600,height:900};},createCanvas:(width,height)=>({width,height,getContext:()=>({fillRect:(...v)=>fills.push(v),drawImage:(...v)=>draws.push(v)})}),encodeWebp:async canvas=>new Blob([JSON.stringify([canvas.width,canvas.height])])};
 const output=await renderCoverAssets({kind:'document',sourceUrl:'fixture.pdf',pageNumber:3},runtime);
 assert.equal(output.variants.length,3);assert.equal(output.social.width,1200);assert.equal(output.social.height,630);assert.deepEqual(pages,[[3,1200]]);assert.ok(fills.some(v=>v.join(',')==='0,0,1200,630'));assert.equal(await output.social.blob.text(),'[1200,630]');assert.equal(draws.length,4);
});
test('QR known text has valid finder/quiet-zone geometry and deterministic matrix',()=>{
 const qr=generate('HELLO WORLD');assert.equal(qr.size,21);for(let y=0;y<7;y++)for(let x=0;x<7;x++)assert.equal(qr.get(x,y),x===0||x===6||y===0||y===6||(x>=2&&x<=4&&y>=2&&y<=4));
 assert.equal(qr.get(-1,0),false);assert.equal(qr.toString({pad:4}).split('\n').filter(Boolean).length,29);
 const digest=createHash('sha256').update(qr.toString({on:'1',off:'0',lf:'\n',pad:0})).digest('hex');assert.equal(digest,'d5383d4ee43128310bd407cbba7661241d11986b3e1ce592ed2b45e8a324e598');
});
test('pending registry protects lifecycle state, public visibility and90day expiry',()=>{
 const sql=readFileSync(new URL('../supabase/pending/profile_handle_addresses.sql',import.meta.url),'utf8');assert.match(sql,/revoke all on public.profile_handle_state from public,anon,authenticated/);assert.match(sql,/interval '90 days'/);assert.match(sql,/not p.is_private/);assert.match(sql,/a.expires_at>now\(\)/);assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/to anon,authenticated/);
});

test('worker distinguishes a transient handle lookup failure from a missing address', async () => {
 const server = load('src/server/shareAddress.ts', {'../features/sharing/shareModel':model}, {fetch:async()=>Response.json({message:'unavailable'},{status:503})});
 const result = await server.resolveShareRequest(new Request('https://site.test/avi'),{supabaseUrl:'https://test.supabase.co',publishableKey:'public'});
 assert.equal(result.unavailable,true); assert.equal(result.missing,undefined);
});

test('address lookup refuses upstream redirects without following or exposing the public key', async () => {
 for (const status of [301,302,307,308]) {
  let calls=0;
  const server=load('src/server/shareAddress.ts',{'../features/sharing/shareModel':model},{fetch:async(_url,options)=>{
   calls++; assert.equal(options.redirect,'manual');
   return new Response(null,{status,headers:{location:'https://untrusted.example/collect'}});
  }});
  const result=await server.resolveShareRequest(new Request('https://site.test/avi'),{supabaseUrl:'https://test.supabase.co',publishableKey:'public'});
  assert.equal(result.unavailable,true); assert.equal(result.redirect,undefined); assert.equal(calls,1);
 }
});

test('worker handle and UUID routes use canonical internal assets without leaking their redirect', async () => {
 let data={profileId:id,handle:'avi',alias:false};
 const server=load('src/server/shareAddress.ts',{'../features/sharing/shareModel':model},{fetch:async(_url,options)=>{
  if(options.redirect==='error') throw new TypeError('workerd: Unsupported redirect mode');
  assert.equal(options.redirect,'manual'); return Response.json(data);
 }});
 const source=readFileSync(new URL('../src/sites-worker.ts',import.meta.url),'utf8')
  .replaceAll('import.meta.env.VITE_SUPABASE_URL',"'https://test.supabase.co'")
  .replaceAll('import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY',"'public'");
 const exports={},assetPaths=[];
 const imports={'./features/sharing/shareModel':model,'./server/shareAddress':server,'./server/sharedPreview':{prefersHtml:()=>true},'./server/publicMedia':{isPublicMediaRoute:()=>false},'./server/rum':{},'./server/rumOwner':{},'./server/health': { handleHealth: () => { throw new Error('Unexpected health route in fixture'); } }, './server/citation': { citationLicenseResponse: () => null, handleCitation: () => { throw new Error('Unexpected citation route in non-citation fixture'); } }, './server/projectReach':{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,Headers,Request,Response,require:name=>{assert.ok(name in imports);return imports[name];}});
 const request=(path,method='GET')=>exports.default.fetch(new Request('https://site.test'+path,{method,headers:{accept:'text/html','user-agent':'Browser'}}),{ASSETS:{fetch:async req=>{
  const path=new URL(req.url).pathname;assetPaths.push(path);
  if(path==='/share.html')return new Response(null,{status:307,headers:{location:'/share'}});
  assert.ok(path==='/'||path==='/share');return new Response(req.method==='HEAD'?null:`<head></head><body>${path==='/share'?'Visitor':'Member'}</body>`,{headers:{'content-type':'text/html'}});
 }}});
 for(const method of ['GET','HEAD']) {
  const response=await request('/avi?via=friend',method);assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);
  assert.equal(assetPaths.at(-1),'/share');assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(method==='HEAD'?await response.text():'', '');
 }
 data={handle:'avi',confirmed:true};let response=await request('/share/'+id+'?via=friend');assert.equal(response.status,301);assert.equal(response.headers.get('location'),'https://site.test/avi?via=friend');
 data={profileId:id,handle:'avi',alias:true};response=await request('/old.avi');assert.equal(response.status,301);
 data=null;response=await request('/unknown');assert.equal(response.status,404);assert.equal(response.headers.get('location'),null);
 response=await request('/share/'+id+'/c/'+id+'/'+id);assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);
 for(const path of ['/','/studio','/messages','/p/'+id]) {response=await request(path);assert.equal(response.status,200);assert.equal(assetPaths.at(-1),'/');}
});

test('clipboard fallback selects inside the modal focus boundary', async () => {
 let selected = '', copied = '', hostUsed = false;
 class HTMLElement { closest() { return host; } focus() {} }
 const host = { appendChild(node) { hostUsed = true; assert.equal(node.value, 'https://example.test/avi'); } };
 const document = {
   activeElement: new HTMLElement(), getSelection: () => null, querySelectorAll: () => [host],
   createElement: () => ({ style: {}, setAttribute() {}, select() { selected = this.value; }, setSelectionRange() {}, remove() {} }),
   execCommand(command) { assert.equal(command, 'copy'); assert.ok(hostUsed); copied = selected; return true; },
   body: { appendChild() { throw new Error('Selection escaped the modal'); } },
 };
 const helper = load('src/utils/copyPublicLink.ts', {}, { document, HTMLElement, navigator: {} });
 await helper.copyPublicLink('https://example.test/avi');
 assert.equal(copied, 'https://example.test/avi');
});



test('old UUID project URLs redirect to the handle without losing the project or query', async () => {
 const server=load('src/server/shareAddress.ts',{'../features/sharing/shareModel':model},{fetch:async()=>Response.json({handle:'avi'})});
 const result=await server.resolveShareRequest(new Request(`https://site.test/share/${id}/c/portal/work?from=resume`),{supabaseUrl:'https://test.supabase.co',publishableKey:'public'});
 assert.equal(result.redirect.status,301);
 assert.equal(result.redirect.headers.get('location'),'https://site.test/avi/c/portal/work?from=resume');
});

test('bare creator handles are canonical; work and UUID aliases redirect once with the suffix preserved',async()=>{
 const resolution={profileId:id,handle:'portalite.work',alias:true};
 const server=load('src/server/shareAddress.ts',{'../features/sharing/shareModel':model},{fetch:async(url,options)=>Response.json(JSON.parse(options.body).p_profile_id ? {handle:'portalite.work'} : resolution)});
 const config={supabaseUrl:'https://test.supabase.co',publishableKey:'test'};
 assert.equal((await server.resolveShareRequest(new Request('https://site.test/portalite'),config)).redirect,undefined);
 for(const path of ['/portalite.work','/share/'+id]){
  const result=await server.resolveShareRequest(new Request('https://site.test'+path+'/c/portal/project?via=friend'),config);
  assert.equal(result.redirect.status,301);
  assert.equal(result.redirect.headers.get('location'),'https://site.test/portalite/c/portal/project?via=friend');
 }
 const html=server.injectShareResolution('<head><meta property="og:url" content="old"><link rel="canonical" href="old"></head>',resolution,'https://site.test/portalite');
 assert.match(html,/rel="canonical" href="https:\/\/site.test\/portalite"/);
 assert.doesNotMatch(html,/content="old"|href="old"/);
});

test('public sitemap emits only bare valid public handles and fails closed on upstream errors',async()=>{
 const requests=[];
 const server=load('src/server/shareAddress.ts',{'../features/sharing/shareModel':model},{fetch:async(url,options)=>{requests.push({url,options});return Response.json([{id,handle:'portalite.work'},{id,handle:'bad_handle'}]);}});
 const response=await server.publicSitemap(new Request('https://site.test/sitemap.xml'),{supabaseUrl:'https://test.supabase.co',publishableKey:'test'});
 assert.equal(response.status,200);assert.match(await response.text(),/<loc>https:\/\/site.test\/portalite<\/loc>/);
 assert.ok(requests[0].url.includes('is_private=eq.false'));assert.equal(requests[0].options.credentials,'omit');
 assert.equal(new Headers(requests[0].options.headers).has('authorization'),false);
 const failing=load('src/server/shareAddress.ts',{'../features/sharing/shareModel':model},{fetch:async()=>new Response(null,{status:500})});
 assert.equal((await failing.publicSitemap(new Request('https://site.test/sitemap.xml'),{supabaseUrl:'https://test.supabase.co',publishableKey:'test'})).status,503);
});
