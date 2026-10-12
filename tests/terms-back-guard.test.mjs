import assert from 'node:assert/strict';
import test from 'node:test';
import {hookHarness} from './helpers/hook-harness.mjs';
test('required sheet traps browser Back and releases its temporary entry before continuing',async()=>{
  const listeners=new Set(),base={idx:3,key:'original',usr:{returnPath:'/studio'}},entries=[base];let index=0;
  const history={get state(){return entries[index];},pushState(state){entries.splice(++index);entries[index]=state;},replaceState(state){entries[index]=state;},back(){index--;for(const fn of [...listeners])fn();}};
  const window={history,location:{href:'https://site.test/'},addEventListener:(name,fn)=>{if(name==='popstate')listeners.add(fn);},removeEventListener:(name,fn)=>listeners.delete(fn)};
  const h=hookHarness(new URL('../src/features/legal/useRequiredTermsBackGuard.ts',import.meta.url),'useRequiredTermsBackGuard',{}, {},[true],undefined,{}, {window});
  const release=h.value;assert.equal(entries.length,2);history.back();assert.equal(index,1);assert.ok(history.state.portalinkTermsGuard);
  await release();assert.equal(index,0);assert.equal(history.state,base);assert.equal(listeners.size,0);await release();assert.equal(index,0);
  h.dispose();
});
test('read-only Terms does not alter browser history or block Back',()=>{
  const h=hookHarness(new URL('../src/features/legal/useRequiredTermsBackGuard.ts',import.meta.url),'useRequiredTermsBackGuard',{}, {},[false],undefined,{}, {window:{get history(){assert.fail('Read-only review must not intercept history');}}});
  assert.equal(typeof h.value,'function');h.dispose();
});
