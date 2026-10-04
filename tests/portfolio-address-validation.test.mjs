import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceModule } from './helpers/source-module.mjs';
const model=sourceModule('src/features/sharing/shareModel.ts');
function harness(){
 let state=null, effect, timer, cleanup;
 const module=sourceModule('src/features/sharing/usePortfolioAddressValidation.ts', {react:{useState:()=>[state,value=>{state=value;}],useEffect:fn=>{effect=fn;}},'./shareModel':model},{setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;},Error});
 return {render:(value,address,check,enabled=true)=>module.usePortfolioAddressValidation(enabled,value,address,check),effect:()=>{cleanup?.();cleanup=effect();},tick:async()=>{timer?.();await new Promise(resolve=>setImmediate(resolve));},dispose:()=>cleanup?.(),module};
}
const current={handle:'creator',available:true,confirmed:true};
test('format, current and unavailable states never claim a check succeeded',()=>{
 const {module}=harness();
 assert.equal(module.immediateAddressValidation('api',current).status,'invalid');
 assert.equal(module.immediateAddressValidation('a',current).status,'invalid');
 assert.equal(module.immediateAddressValidation('creator',current).status,'current');
 assert.equal(module.immediateAddressValidation('newname',null).status,'checking');
 assert.equal(module.immediateAddressValidation('newname',{...current,available:false}).status,'unavailable');
});
test('backend available/taken/unavailable and rejected checks produce distinct feedback',async()=>{
 for(const [response,status] of [['available','available'],['taken','unavailable'],['unavailable','unavailable'],['error','error']]){
  const h=harness();const check=async()=>{if(response==='error')throw new Error('Network error');return response;};
  assert.equal(h.render('newname',current,check).status,'checking');h.effect();await h.tick();
  assert.equal(h.render('newname',current,check).status,status);h.dispose();
 }
});
test('a changed handle and disposed request cannot reuse stale availability',async()=>{
 const h=harness();let resolve;const check=()=>new Promise(done=>{resolve=done;});
 h.render('first',current,check);h.effect();await h.tick();
 assert.equal(h.render('second',current,check).status,'checking');h.effect();
 resolve('available');await new Promise(done=>setImmediate(done));
 assert.equal(h.render('second',current,check).status,'checking');h.dispose();
});
test('disabled WEB hook never calls the availability service',async()=>{
 const h=harness();let called=false;h.render('newname',current,async()=>{called=true;return 'available';},false);h.effect();await h.tick();assert.equal(called,false);
});
