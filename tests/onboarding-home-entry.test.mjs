import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('mobile onboarding enters Home without opening publishing or clearing a saved activation', () => {
 const source = readFileSync(new URL('../src/App.tsx', import.meta.url),'utf8');
 const ast = ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let callback;
 function visit(node) {
  if((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast)==='ProfileOnboardingDialog') {
   callback=node.attributes.properties.find(p=>p.name?.getText(ast)==='onComplete').initializer.expression;
  }
  ts.forEachChild(node,visit);
 }
 visit(ast); assert.ok(callback);
 const calls=[]; const saved={stage:'project',portal:{id:'existing'}};
 const context={presentation:'mobile',auth:{user:{id:'account'}},setIsOnboardingOpen:v=>calls.push(['onboarding',v]),deferredIntentRef:{current:null},nav:{home:v=>calls.push(['home',v])},beginActivation:()=>assert.fail('must not begin publishing'),setActivationAccountId:()=>assert.fail('must not open publishing'),readActivation:()=>saved};
 const code=ts.transpileModule(`const complete=${callback.getText(ast)}; complete('profile');`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,context);
 assert.deepEqual(calls,[['onboarding',false],['home',true]]);
 assert.equal(saved.portal.id,'existing');
});

test('first-project profile action uses the normal publisher and silently prepares an empty portal', async () => {
 const source=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let callback;
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('setPublishResumeDraft(presentation'))callback=node.arguments[0];ts.forEachChild(node,visit);}
 visit(ast);assert.ok(callback);
 for(const categories of [[],[{id:'work',label:'Work'}]]) {
  const calls=[];
  const context={isGlobalCreatePending:true,isOwnerMode:true,viewedProfile:{id:'owner',projects:[],categories},auth:{user:{id:'account'}},activeCategory:null,presentation:'mobile',journeyMadeIn:null,defaultCategoryRequest:{current:null},drafts:{readFirstProjectDraft:async()=>null},createFirstProjectCategory:async label=>{calls.push(['create',label]);return {id:'work'};},setIsFirstProjectPublish:v=>calls.push(['first',v]),setFirstProjectPublisher:v=>calls.push(['special',v]),setPublishResumeDraft(){},setPublishTargetCategoryId:v=>calls.push(['target',v]),setPublishAccountId(){},setIsPublishOpen:v=>calls.push(['open',v]),setGlobalCreateAccountId(){},setGlobalCreateError:()=>assert.fail('unexpected preparation error')};
  const expression=callback.getText(ast).replace("import('./features/publishing/firstProjectDraft')",'Promise.resolve(drafts)');
  vm.runInNewContext(ts.transpileModule(`const enter=${expression};enter();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  await new Promise(resolve=>setImmediate(resolve));
  if(!categories.length) assert.deepEqual(calls,[['create','Work']]);
  else {assert.ok(calls.some(([key,value])=>key==='open'&&value===true));assert.ok(calls.some(([key,value])=>key==='special'&&value===false));assert.ok(calls.some(([key,value])=>key==='target'&&value==='work'));}
 }
});
