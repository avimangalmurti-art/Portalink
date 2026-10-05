import assert from 'node:assert/strict';
import test from 'node:test';
import {requireBuildEnvironment} from '../scripts/build-environment.mjs';
import {verifyClientEntries} from '../scripts/verify-production-bundles.mjs';
const env={VITE_SUPABASE_URL:'https://fixture-project.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_key_only'};
test('empty or whitespace environment fails before build without leaking values',()=>{for(const name of Object.keys(env)){for(const value of ['', '   ',undefined])assert.throws(()=>requireBuildEnvironment({...env,[name]:value}),new RegExp(name));}assert.throws(()=>requireBuildEnvironment({...env,VITE_SUPABASE_URL:'https://wrong.invalid'}),/valid Supabase/);assert.equal(requireBuildEnvironment(env),env);});
test('both entry graphs must contain configured client credentials',()=>{const manifest={'index.html':{isEntry:true,file:'main.js',imports:['_client']},'share.html':{isEntry:true,file:'visitor.js',imports:['_client']},_client:{file:'client.js'}};const read=file=>file==='client.js'?JSON.stringify(env):'entry';assert.doesNotThrow(()=>verifyClientEntries(manifest,read,env));assert.throws(()=>verifyClientEntries({...manifest,'share.html':{isEntry:true,file:'visitor.js'}},read,env),/share.html lacks/);assert.throws(()=>verifyClientEntries(manifest,()=>'',env),/index.html lacks/);});
