import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sourceModule} from './helpers/source-module.mjs';
const model=sourceModule('src/features/legal/model.ts');
const markdown=sourceModule('src/features/legal/markdown.ts');
const legal=sourceModule('src/server/legal.ts',{'../features/legal/model':model,'../features/legal/markdown':markdown,'../features/citations/publicOrigin':{PUBLIC_ORIGIN:'https://site.test'}},{Response,Request,AbortSignal});
const citation=sourceModule('src/server/citation.ts',{'../features/citations/publicOrigin':{PUBLIC_ORIGIN:'https://site.test'},'../features/citations/model':{}},{Response});
const rows=model.LEGAL_KEYS.map(key=>({key,version:'1.0',title:key,markdown_body:readFileSync(new URL(`../docs/legal/${key}.md`,import.meta.url),'utf8'),effective_at:'2026-10-12T00:00:00Z'}));
const config={supabaseUrl:'https://fixture.supabase.co',publishableKey:'public-fixture-key'};
const fetcher=async (_url,init)=>{assert.equal(init.headers.authorization,'Bearer public-fixture-key');return Response.json(rows);};
test('all four legal pages render signed-out with exact Markdown, version and effective date; unsafe HTML is escaped',async()=>{
  for(const row of rows){const response=await legal.handleLegalPage(new Request(`https://site.test/legal/${row.key}`),config,fetcher);assert.equal(response.status,200);const html=await response.text();assert.match(html,/Version 1.0/);assert.match(html,/Effective 2026-10-12/);assert.match(html,/DRAFT — not yet reviewed by counsel/);assert.ok(html.includes(markdown.legalMarkdownHtml(row.markdown_body)));}
  const safe=markdown.legalMarkdownHtml('<script>alert(1)</script>\n\n[bad](javascript:alert)\n\n[link](https://example.test)');
  assert.doesNotMatch(safe,/<script>|href="javascript/);assert.match(safe,/href="https:\/\/example.test"/);
});
test('legacy licence resources resolve to versioned sections of the same Content Licence document',async()=>{
  for(const [path,section] of [['/licenses/view-only-v1','public'],['/licenses/citable-v1','citable']]){
    const response=citation.citationLicenseResponse(path);assert.equal(response.status,308);
    const target=response.headers.get('location');assert.equal(target,`/legal/content-licence?version=1.0#${section}`);
    const page=await legal.handleLegalPage(new Request(new URL(target,'https://site.test')),config,fetcher);assert.match(await page.text(),new RegExp(`id="${section}"`));
  }
  assert.equal((await legal.handleLegalPage(new Request('https://site.test/legal/terms?version=9.0'),config,fetcher)).status,404);
  assert.equal((await legal.handleLegalPage(new Request('https://site.test/legal/terms',{method:'POST'}),config,fetcher)).status,405);
});
test('MCP licence adapter reads the exact versioned Markdown and the same canonical section as HTTP/JSON-LD links',async()=>{
  for(const [name,section] of [['view-only','public'],['citable','citable']]){
    const text=await legal.readLegalLicenseText(`portalink://license/${name}-v1`,config,fetcher);
    assert.ok(text.endsWith(rows.find(row=>row.key==='content-licence').markdown_body));assert.ok(text.includes(`/legal/content-licence?version=1.0#${section}`));assert.match(text,/Version 1.0/);
  }
  await assert.rejects(legal.readLegalLicenseText('https://untrusted.test/resource',config,fetcher));
});
function mailHarness(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../drizzle-pending/0004_legal_email_rate_limit.sql',import.meta.url),'utf8'));
  const state={calls:[],auth:0,time:1_000_000,user:{id:'account-a',email:'owner@example.test',email_confirmed_at:'2026-10-12'},fail:false};
  const env={RESEND_API_KEY:'synthetic-key',RESEND_FROM:'Portalink <sender@example.test>',DB:{prepare(sql){return{bind(...values){return{async first(){return db.prepare(sql).get(...values)??null;}};}};}}};
  const authenticate=async()=>{state.auth++;return state.user;};
  const resend={async send(body,idempotencyKey){state.calls.push({body,idempotencyKey});if(state.fail)throw Error('provider');}};
  const send=(body='{}')=>legal.handleLegalSend(new Request('https://site.test/api/legal/send',{method:'POST',body}),env,config,authenticate,{resend,fetcher,now:()=>state.time});
  return{db,state,env,send};
}
test('absent worker secret fails closed and never invokes authentication, rate limiter or Resend',async()=>{
  const h=mailHarness();try{delete h.env.RESEND_API_KEY;const result=await h.send();assert.equal(result.status,503);assert.equal((await result.json()).message,'Email not available yet');assert.equal(h.state.auth,0);assert.equal(h.state.calls.length,0);}finally{h.db.close();}
});
test('Send by Email uses the confirmed signed-in email, four pinned links/version dates and exactly one mocked mail call',async()=>{
  const h=mailHarness();try{
    assert.equal((await h.send('{"email":"attacker@example.test"}')).status,200);
    assert.equal(h.state.calls.length,1);const {body}=h.state.calls[0];assert.equal(JSON.stringify(body.to),'["owner@example.test"]');assert.equal(body.from,h.env.RESEND_FROM);assert.equal(body.attachments,undefined);
    for(const key of model.LEGAL_KEYS)assert.ok(body.text.includes(`/legal/${key}?version=1.0`));assert.match(body.text,/Effective 2026-10-12/);
    assert.equal((await h.send()).status,429);assert.equal(h.state.calls.length,1);
    h.state.time+=599_999;assert.equal((await h.send()).status,429);h.state.time++;assert.equal((await h.send()).status,200);assert.equal(h.state.calls.length,2);
  }finally{h.db.close();}
});
test('concurrent sends are limited per account across workers; failures keep reservation and unconfirmed accounts cannot send',async()=>{
  const h=mailHarness();try{
    const results=await Promise.all([h.send(),h.send()]);assert.deepEqual(results.map(row=>row.status).sort(),[200,429]);assert.equal(h.state.calls.length,1);
    h.state.user={...h.state.user,id:'account-b'};h.state.fail=true;assert.equal((await h.send()).status,503);assert.equal((await h.send()).status,429);
    h.state.user={id:'account-c',email:'unconfirmed@example.test'};assert.equal((await h.send()).status,401);assert.equal(h.state.calls.length,2);
  }finally{h.db.close();}
});
test('Resend HTTP adapter sends one authorized request and requires provider acknowledgement',async()=>{
  const calls=[];const client=legal.createResendClient('synthetic-secret',async(url,init)=>{calls.push({url,init});return Response.json({id:'mail-1'});});
  await client.send({from:'sender@example.test',to:['owner@example.test'],subject:'Agreements',text:'links'},'synthetic-idempotency');
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.resend.com/emails');assert.equal(calls[0].init.headers.authorization,'Bearer synthetic-secret');assert.equal(calls[0].init.headers['Idempotency-Key'],'synthetic-idempotency');
});
