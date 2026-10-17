import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceModule} from './helpers/source-module.mjs';
const state=new Map();
const storage={getItem:k=>state.get(k)??null,setItem:(k,v)=>state.set(k,v),removeItem:k=>state.delete(k)};
const launch=sourceModule('src/features/launch/adultLaunch.ts',{}, {sessionStorage:storage});
test('neutral screening handles birthdays, invalid dates, future dates, and non-US residents without retaining DOB',()=>{
 assert.equal(launch.isAdultOn('2008-10-15',new Date(2026,9,15)),true);
 assert.equal(launch.isAdultOn('2008-10-16',new Date(2026,9,15)),false);
 assert.equal(launch.isAdultOn('2008-02-30'),false);
 assert.equal(launch.isAdultOn('2030-01-01'),false);
 assert.equal(launch.saveScreening('CA','1990-01-01'),false);
 assert.equal(launch.saveScreening('US','1990-01-01'),true);
 assert.doesNotMatch(state.get(launch.ADMISSION_KEY),/1990|birth/i);
 assert.equal(launch.readAdmission(),null);assert.equal(launch.hasRecentScreening(),true);
 launch.acknowledgeLaunchReview();assert.equal(launch.requireAdmission().ageBand,'18+');
 const receipt=JSON.parse(state.get(launch.ADMISSION_KEY));assert.equal(launch.validAdmission(receipt,receipt.checkedAt+1800000),false);
 assert.equal(launch.validAdmission({...receipt,termsVersion:'old'}),false);
});
test('missing or unapproved backend policy blocks signup admission',async()=>{
 launch.saveScreening('US','1990-01-01');launch.acknowledgeLaunchReview();
 const service=data=>sourceModule('src/services/supabase/adultLaunch.ts',{'./client':{requireSupabase:()=>({rpc:async()=>data})},'../../features/launch/adultLaunch':launch});
 await assert.rejects(service({error:{message:'missing function'}}).admittedLaunch(),/awaiting reviewed/);
 await assert.rejects(service({data:{ready:false}}).admittedLaunch(),/awaiting reviewed/);
 const receipt=await service({data:{ready:true,terms_version:launch.LAUNCH_REVIEW_VERSION,privacy_version:launch.LAUNCH_REVIEW_VERSION}}).admittedLaunch();
 assert.equal(receipt.country,'US');
});
test('receipt belongs to the authenticated account and survives delayed confirmation without browser draft',async()=>{
 launch.saveScreening('US','1990-01-01');launch.acknowledgeLaunchReview();const receipt=launch.requireAdmission();state.clear();
 const calls=[];const service=sourceModule('src/services/supabase/adultLaunch.ts',{'./client':{requireSupabase:()=>({auth:{getUser:async()=>({data:{user:{id:'confirmed',user_metadata:{portalink_launch:receipt}}}})},rpc:async(...args)=>{calls.push(args);return {data:{verified:true},error:null};}})},'../../features/launch/adultLaunch':launch});
 await service.recordLaunchReceipt();assert.equal(calls[0][0],'verify_adult_launch_receipt');assert.equal(calls[0][1].p_terms_version,launch.LAUNCH_REVIEW_VERSION);assert.equal(calls[0][1].account_id,undefined);
});
test('optional measurement sends nothing while launch collection is disabled',()=>{
 let calls=0;const m=sourceModule('src/features/reads/reachCollector.ts',{'../launch/adultLaunch':launch,'./readSignal':{}},{fetch:()=>{calls++;}});
 m.sendReach({});assert.equal(calls,0);
 const rum=sourceModule('src/features/performance/rum.ts',{'../launch/adultLaunch':launch,'./rumCore':{createRumCollector:()=>{throw Error('must not initialize');}}},{window:{}});
 rum.initializeRum('abcdef12',true);
});
