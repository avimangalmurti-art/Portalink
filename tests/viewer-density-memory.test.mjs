import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/components/media/viewerMemory.ts', import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function load(persistent, brokenSession = false) {
 const exports = {}, session = new Map(), frames = [];
 vm.runInNewContext(code,{exports,window:{localStorage:{getItem:key=>persistent.get(key),setItem:(key,value)=>persistent.set(key,value)},sessionStorage:{getItem:key=>{if(brokenSession)throw Error('Blocked');return session.get(key)},setItem:(key,value)=>session.set(key,value)},requestAnimationFrame:fn=>{frames.push(fn);return frames.length}}});
 return { ...exports, flush(){frames.splice(0).forEach(fn=>fn())} };
}
test('reader density survives a new session independently per content and ignores invalid persisted values',()=>{
 const data = new Map(), first = load(data);
 first.updateViewerMemory('project-a:pdf',{pagesPerRow:3});first.updateViewerMemory('project-b:images',{pagesPerRow:2});first.flush();
 const second = load(data,true);
 assert.equal(second.readViewerMemory('project-a:pdf').pagesPerRow,3);
 assert.equal(second.readViewerMemory('project-b:images').pagesPerRow,2);
 assert.equal(second.readViewerMemory('project-a:other-pdf').pagesPerRow,undefined);
 data.set('portalink.viewer.invalid.density','100000');
 assert.equal(second.readViewerMemory('invalid').pagesPerRow,undefined);
});
