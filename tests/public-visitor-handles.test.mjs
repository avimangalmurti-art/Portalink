import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from './helpers/source-module.mjs';
const model=sourceModule('src/features/sharing/shareModel.ts');
const {prepareProfileHandle}=sourceModule('src/utils/profileHandle.ts',{'../features/sharing/shareModel':model});
test('requested available handle is kept exactly',async()=>{
 const calls=[];assert.equal(await prepareProfileHandle('citetest',async value=>{calls.push(value);return 'available';}),'citetest');
 assert.deepEqual(calls,['citetest']);
});
test('only a real collision adds a checked suffix',async()=>{
 const calls=[];const result=await prepareProfileHandle('citetest',async value=>{calls.push(value);return calls.length===1?'taken':'available';});
 assert.match(result,/^citetest\.[a-f0-9]{12}$/);assert.deepEqual(calls,['citetest',result]);
});
test('overlong and invalid requested handles are rejected before checking availability',async()=>{
 for(const handle of ['x'.repeat(31),'bad_handle','bad/handle'])await assert.rejects(prepareProfileHandle(handle,async()=>{assert.fail('No availability request for invalid input');}),/3–30/);
});
test('unavailable lookup fails closed without inventing a collision',async()=>{
 const calls=[];await assert.rejects(prepareProfileHandle('citetest',async value=>{calls.push(value);return 'unavailable';}),/Could not check/);assert.deepEqual(calls,['citetest']);
});
