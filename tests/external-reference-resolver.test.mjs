import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceModule} from './helpers/source-module.mjs';
const citation=sourceModule('src/features/citations/model.ts');
const model=sourceModule('src/features/references/model.ts',{'../citations/model':citation});
const resolver=sourceModule('src/server/referenceResolver.ts',{'../features/references/model':model},{fetch,AbortController,AbortSignal,setTimeout,clearTimeout,Response,TextDecoder});
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
test('DOI resolves Crossref title authors year and journal without browser metadata calls',async()=>{
 const calls=[];const result=await resolver.resolveExternalReference('https://doi.org/10.1234/example',{fetcher:async(url,options)=>{calls.push({url,options});return json({message:{title:['A study'],author:[{given:'Ada',family:'Example'}],issued:{'date-parts':[[2024]]},'container-title':['Test Journal']}});}});
 assert.equal(result.kind,'doi');assert.equal(result.resolved.title,'A study');assert.deepEqual(Array.from(result.resolved.authors),['Ada Example']);assert.equal(result.resolved.year,'2024');assert.equal(result.resolved.journal,'Test Journal');assert.equal(calls.length,1);assert.match(calls[0].url,/api.crossref.org\/works\/10.1234%2Fexample/);assert.equal(calls[0].options.credentials,'omit');
});
test('ISBN resolves an Open Library edition with author publisher and year',async()=>{
 const result=await resolver.resolveExternalReference('ISBN 978-0-123456-78-9',{fetcher:async url=>{assert.match(url,/openlibrary.org\/api\/books\?bibkeys=ISBN:9780123456789/);return json({'ISBN:9780123456789':{title:'A book',authors:[{name:'A Writer'}],publish_date:'January 2020',publishers:[{name:'A Publisher'}]}});}});
 assert.equal(result.kind,'isbn');assert.equal(result.resolved.title,'A book');assert.equal(result.resolved.year,'2020');assert.equal(result.resolved.publisher,'A Publisher');
});
const dns=url=>json({Status:0,Answer:url.includes('type=AAAA')?[]:[{type:1,data:'93.184.216.34'}]});
test('URL resolution parses server-side OpenGraph and enforces manual redirects and no credentials',async()=>{
 const urls=[];const result=await resolver.resolveExternalReference('https://example.com/page',{fetcher:async(url,options)=>{urls.push(url);if(url.startsWith('https://cloudflare-dns.com'))return dns(url);assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');assert.equal(options.headers.authorization,undefined);return new Response('<title>Fallback</title><meta content="Resolved &amp; title" property="og:title"><meta name="author" content="A Writer"><meta property="article:published_time" content="2025-01-01">',{headers:{'content-type':'text/html'}});}});
 assert.equal(result.kind,'url');assert.equal(result.resolved.title,'Resolved & title');assert.equal(result.resolved.year,'2025');assert.equal(urls.filter(url=>url.includes('example.com/page')).length,1);
});
test('five-second contract bounds stalled fetches/body streams and saves unresolved input as text',async()=>{
 const started=Date.now();const result=await resolver.resolveExternalReference('https://example.com',{timeoutMs:15,fetcher:async(url)=>url.includes('dns-query')?dns(url):new Promise(()=>{})});assert.equal(result.kind,'text');assert.equal(result.resolved.verified,false);assert.ok(Date.now()-started<1000);
 const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('<title>too slow</title>'));}});const body=await resolver.resolveExternalReference('https://example.com',{timeoutMs:15,fetcher:async url=>url.includes('dns-query')?dns(url):new Response(stream,{headers:{'content-type':'text/html'}})});assert.equal(body.kind,'text');
});
test('URL cap, redirects to private hosts, private literals and private DNS answers fail closed',async()=>{
 for(const input of ['http://127.0.0.1/','http://169.254.169.254/','http://[::1]/','http://localhost/','http://2130706433/']){let calls=0;const result=await resolver.resolveExternalReference(input,{fetcher:async()=>{calls++;throw new Error();}});assert.equal(result.kind,'text');assert.equal(calls,0);}
 const privateDns=await resolver.resolveExternalReference('https://example.com',{fetcher:async()=>json({Status:0,Answer:[{type:1,data:'10.0.0.1'}]})});assert.equal(privateDns.kind,'text');
 const large=await resolver.resolveExternalReference('https://example.com',{fetcher:async url=>url.includes('dns-query')?dns(url):new Response('x'.repeat(1024*1024+1),{headers:{'content-type':'text/html'}})});assert.equal(large.kind,'text');
 const redirected=await resolver.resolveExternalReference('https://example.com',{fetcher:async url=>url.includes('dns-query')?dns(url):new Response(null,{status:302,headers:{location:'http://10.0.0.1'}})});assert.equal(redirected.kind,'text');
});
test('free text remains verbatim with could-not-verify note and requires authentication at endpoint',async()=>{
 const result=await resolver.resolveExternalReference('Writer (2020). Personal conversation.',{fetcher:()=>assert.fail('No request for free text')});assert.equal(result.raw_input,'Writer (2020). Personal conversation.');assert.equal(result.kind,'text');assert.equal(result.resolved.note,'Couldn’t verify');
 const response=await resolver.handleReferenceResolve(new Request('https://site.test/api/references/resolve',{method:'POST',body:JSON.stringify({input:'Text'})}),async()=>null);assert.equal(response.status,401);
});
test('a bot challenge returned with HTTP 200 remains unverified text instead of a false resolved title',async()=>{
 const result=await resolver.resolveExternalReference('https://example.com/book',{fetcher:async url=>url.includes('dns-query')?dns(url):new Response('<title>Human Verification | Open Library</title>',{headers:{'content-type':'text/html'}})});assert.equal(result.kind,'text');assert.equal(result.resolved.verified,false);assert.equal(result.resolved.title,'https://example.com/book');
});
test('malformed HTML within the byte cap cannot trap the parser in unbounded regex backtracking',async()=>{
 const html='<meta '+ 'brokenword '.repeat(60000)+'>',started=Date.now();
 const result=await resolver.resolveExternalReference('https://example.com/malformed',{fetcher:async url=>url.includes('dns-query')?dns(url):new Response(html,{headers:{'content-type':'text/html'}})});assert.equal(result.kind,'text');assert.ok(Date.now()-started<4000);
});
test('mixed bibliography uses existing Portalink blocks and escaped external BibTeX',()=>{
 const item={id:'item-1',creator:'A Creator',projectTitle:'A work',madeOn:'2024-02-03',kind:'page',number:2};const external={id:'external-1',kind:'doi',raw_input:'10.1/x',resolved:{title:'Research & {notes}',authors:['Ada A','B B'],year:'2020',journal:'Journal',doi:'10.1/x',verified:true}};
 const output=model.bibliography([{id:item.id,portalink:item},{id:external.id,external}], 'https://portalink.example');assert.ok(output.plain.startsWith(citation.plainCitation(item,'https://portalink.example')));assert.ok(output.bibtex.startsWith(citation.bibCitation(item,'https://portalink.example')));assert.match(output.bibtex,/@article\{external_external_1/);assert.match(output.bibtex,/author = \{Ada A and B B\}/);assert.match(output.bibtex,/Research \\& \\{notes\\}/);assert.match(output.plain,/Ada A, B B \(2020\)/);
});
test('all-project bibliography does not duplicate Portalink BibTeX keys when the same page is referenced twice',()=>{
 const item={id:'shared-page',creator:'Creator',projectTitle:'Work',madeOn:'2024-01-01',kind:'page',number:1};
 const result=model.bibliography([{id:'shared-page',portalink:item},{id:'shared-page',portalink:item}],'https://portalink.example');assert.equal(result.bibtex.match(/@misc/g).length,1);assert.equal(result.plain,citation.plainCitation(item,'https://portalink.example'));
});
