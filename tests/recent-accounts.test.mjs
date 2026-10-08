import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
test('recent accounts are account scoped, newest first, deduplicated and bounded',()=>{
 const data=new Map(),exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/follows/recentAccounts.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,localStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)}});
 const person=id=>({id,name:id,avatar:'',kind:''});
 exports.rememberAccount('one',person('a'));exports.rememberAccount('one',person('b'));exports.rememberAccount('one',person('a'));
 assert.deepEqual(Array.from(exports.readRecentAccounts('one'),p=>p.id),['a','b']);assert.equal(exports.readRecentAccounts('two').length,0);
 exports.rememberAccount('two',person('a'));exports.forgetAccount('one','a');
 assert.deepEqual(Array.from(exports.readRecentAccounts('one'),p=>p.id),['b']);
 assert.deepEqual(Array.from(exports.readRecentAccounts('two'),p=>p.id),['a']);
 for(let i=0;i<40;i++)exports.rememberAccount('one',person(String(i)));assert.equal(exports.readRecentAccounts('one').length,30);
 data.set('portalink:recent-accounts:one','bad JSON');assert.equal(exports.readRecentAccounts('one').length,0);
});
