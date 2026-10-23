import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceModule} from './helpers/source-module.mjs';
const {createPageRenderQueue}=sourceModule('src/components/media/pageRenderQueue.ts');
test('120 dense-grid pages never decode or paint more than two originals concurrently',async()=>{
 const queue=createPageRenderQueue(2),started=[];let active=0,peak=0;
 const jobs=Array.from({length:120},(_,id)=>queue(()=>{active++;peak=Math.max(peak,active);let finish;const promise=new Promise(resolve=>{finish=()=>{active--;resolve(id);};});started.push({id,finish});return{promise,cancel:finish};}));
 assert.equal(started.length,2);
 for(let i=0;i<120;i++){assert.ok(started[i]);started[i].finish();await Promise.resolve();}
 assert.equal(peak,2);assert.deepEqual(await Promise.all(jobs.map(job=>job.promise)),Array.from({length:120},(_,i)=>i));
});
test('queued cancellation avoids decoding; active cancellation waits for resources to settle',async()=>{
 const queue=createPageRenderQueue(1);let finish,starts=0;
 const first=queue(()=>({promise:new Promise(resolve=>{finish=resolve;}),cancel(){}}));
 const cancelled=queue(()=>{starts++;return{promise:Promise.resolve(),cancel(){}};});
 const rejection=assert.rejects(cancelled.promise,error=>error.name==='RenderingCancelledException');cancelled.cancel();await rejection;
 const next=queue(()=>{starts++;return{promise:Promise.resolve(),cancel(){}};});first.cancel();assert.equal(starts,0);finish();await first.promise;await next.promise;assert.equal(starts,1);
});
test('synchronous render failures release the slot and do not stall subsequent pages',async()=>{
 const queue=createPageRenderQueue(1);await assert.rejects(queue(()=>{throw new Error('decode failed');}).promise);assert.equal(await queue(()=>({promise:Promise.resolve(7),cancel(){}})).promise,7);
});

test('a long queue of failed pages does not recurse through the JavaScript stack',async()=>{
 const queue=createPageRenderQueue(1);let finish;const first=queue(()=>({promise:new Promise(resolve=>{finish=resolve;}),cancel(){}}));
 const pending=Array.from({length:1000},()=>queue(()=>{throw new Error('bad page');}).promise);const settled=Promise.allSettled(pending);finish();await first.promise;assert.ok((await settled).every(row=>row.status==='rejected'));
});
