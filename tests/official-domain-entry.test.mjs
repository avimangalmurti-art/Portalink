import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const legacy='https://portalinknetworksinc.avimangalmurti566055.chatgpt.site';
const official='https://portalinknetworks.com';
for(const file of ['index.html','share.html','cite.html']) {
 const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const script=html.match(/<script data-portalink-canonical-entry>([\s\S]*?)<\/script>/)?.[1];
 const navigate=href=>{const calls=[];vm.runInNewContext(script,{URL,URLSearchParams,window:{location:{href,replace:value=>calls.push(value)}}});return calls;};
 test(file+' moves ordinary legacy entries to the official domain without changing their target',()=>{
  assert.ok(script);
  for(const suffix of ['/','/?welcome=1','/settings?section=appearance','/portalite/c/design/work?media=a%2Fb&page=2&page=3&via=abc#page-2','//outside.test/path?x=1#section']) {
   assert.deepEqual(navigate(legacy+suffix),[official+suffix]);
  }
  for(const host of [official,'http://localhost:5173','https://outside.test','https://portalinknetworksinc.avimangalmurti566055.chatgpt.site.evil.test']) assert.deepEqual(navigate(host+'/portalite'),[]);
 });
 test(file+' preserves origin-bound callbacks including tokens invisible to the server',()=>{
  for(const marker of ['code','state','nonce','auth','entry','onboarding_return','access_token','refresh_token','id_token','session','session_id','token','token_hash','type','error','error_code','error_description','provider_token','provider_refresh_token','expires_at','expires_in','token_type']) {
   for(const separator of ['?','#']) assert.deepEqual(navigate(legacy+'/'+separator+marker+'=synthetic'),[]);
  }
  assert.deepEqual(navigate(legacy+'/#%61ccess_token=synthetic'),[]);
  assert.deepEqual(navigate(legacy+'/?CODE=synthetic'),[]);
 });
 test(file+' metadata emits only official public URLs and runs the guard before entry code',()=>{
  for(const tag of html.match(/<(?:meta|link)\b[^>]*(?:og:image|twitter:image|og:url|rel="canonical")[^>]*>/g)??[]) assert.doesNotMatch(tag,/chatgpt\.site|localhost/);
  const later = html.indexOf('__PORTALINK_RUM_BOOT_MS__') === -1 ? html.indexOf('type="module"') : html.indexOf('__PORTALINK_RUM_BOOT_MS__');
  assert.ok(html.indexOf('data-portalink-canonical-entry')<later);
 });
}
test('public origin is pinned independently of hosting or build overrides',async()=>{
 const source=readFileSync(new URL('../src/features/citations/publicOrigin.ts',import.meta.url),'utf8');
 const {PUBLIC_ORIGIN}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 assert.equal(PUBLIC_ORIGIN,official);
 assert.doesNotMatch(source,/import\.meta\.env/);
});
