import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { generate } from 'lean-qr';
import { createHash } from 'node:crypto';
import { renderCoverAssets } from '../src/features/media/coverThumbnailCore.mjs';
function load(file,imports={},globals={}) { const exports={};const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL,URLSearchParams,Response,Request,AbortSignal,crypto,...globals,require:n=>{assert.ok(n in imports,n);return imports[n];}});return exports; }
const model=load('src/features/sharing/shareModel.ts');
const id='11111111-1111-4111-8111-111111111111';
test('handle grammar, suggestions, all product roots and URL fallbacks',()=>{
 for(const valid of ['avi','avi.work','a'.repeat(30)])assert.equal(model.validHandle(valid),true);
 for(const bad of ['ab','Avi','avi_work','avi-work','.avi','a'.repeat(31),'messages','share','api','og.png'])assert.equal(model.validHandle(bad),false,bad);
 const routes=readFileSync(new URL('../src/app/routes.ts',import.meta.url),'utf8');for(const path of [...routes.matchAll(/path: '([^']+)'/g)].map(m=>m[1]))for(const segment of path.split('/').filter(s=>s&&!s.startsWith(':')))assert.ok(model.RESERVED_HANDLES.has(segment),segment);
 assert.equal(model.handleFromPath('/avi'), 'avi');assert.equal(model.handleFromPath('/messages'),null);assert.equal(model.handleFromPath('/avi/no'),null);
 assert.equal(model.portfolioPath(id,'legacy_name'),'/share/'+id);assert.equal(model.portfolioPath(id,'avi'),'/avi');
 for(const name of ['Avi Mangal Murti','A','Portalink','!!!']) {const values=model.handleSuggestions(name);assert.equal(values.length,3);assert.ok(values.every(model.validHandle));}
});
test('shared card text, mailto and optional referral contain exactly authored values',()=>{
 const card=model.shareCardText('Avi','Architecture',7,'School');assert.equal(card.title,'Avi — Portfolio');assert.equal(card.description,'Architecture · School · 7 projects');
 const url=model.withReferral('https://example.test/avi','a12b');assert.equal(url,'https://example.test/avi?via=a12b');
 const link=model.portfolioMailto('friend@example.test','Hello & welcome','Avi',url);const parsed=new URL(link);assert.equal(parsed.searchParams.get('subject'),'Portfolio — Avi');assert.equal(parsed.searchParams.get('body'),'Hello & welcome\n\n'+url);assert.throws(()=>model.portfolioMailto('bad@example.test?bcc=x','Hi','Avi',url));
});
test('address resolver handles permanent UUID and expiring alias redirects without forwarding identity',async()=>{
 let data={profileId:id,handle:'avi',alias:true}; const calls=[];
 const server=load('src/server/shareAddress.ts',{'../features/sharing/shareModel':model},{fetch:async(url,options)=>{calls.push(options);return Response.json(data);}});
 const config={supabaseUrl:'https://test.supabase.co',publishableKey:'public'};
 let result=await server.resolveShareRequest(new Request('https://site.test/old.avi?via=abc',{headers:{Authorization:'secret'}}),config);
 assert.equal(result.redirect.status,301);assert.equal(result.redirect.headers.get('location'),'https://site.test/avi?via=abc');assert.equal(new Headers(calls[0].headers).has('authorization'),false);
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

