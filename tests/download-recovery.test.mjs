import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceModule} from './helpers/source-module.mjs';
function api(fetcher){return sourceModule('src/features/references/downloadPortfolio.ts',{}, {fetch:fetcher});}
test('PDF retry makes a fresh anonymous, uncached request and passes cancellation through body reads',async()=>{
 let calls=0;const controller=new AbortController();
 const client=api(async(url,options)=>{calls++;assert.equal(url,'/api/exports/portfolio/a%2Fb');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.signal,controller.signal);if(calls===1)throw new TypeError('offline');return new Response('%PDF-1.7',{headers:{'content-type':'application/pdf'}});});
 await assert.rejects(client.downloadPortfolio('a/b',controller.signal),/offline/);
 assert.equal((await client.downloadPortfolio('a/b',controller.signal)).size,8);assert.equal(calls,2);
});
test('failed status, non-PDF and empty responses never become downloads',async()=>{
 for(const response of [new Response('unavailable',{status:503}),new Response('<html>error</html>',{headers:{'content-type':'text/html'}}),new Response('',{headers:{'content-type':'application/pdf'}})]){
  await assert.rejects(api(async()=>response).downloadPortfolio('id',new AbortController().signal),/not available|did not contain/);
 }
});
test('cancellation during body streaming propagates instead of producing a partial download',async()=>{
 const controller=new AbortController();let ready;const bodyReady=new Promise(resolve=>ready=resolve);
 const client=api(async(_url,{signal})=>({ok:true,blob:()=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});ready();})}));
 const result=client.downloadPortfolio('id',controller.signal);await bodyReady;controller.abort();await assert.rejects(result,/aborted/);
});
