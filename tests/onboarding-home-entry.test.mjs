import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('mobile onboarding opens the new profile after registration and retains explicit destinations', () => {
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
 const context={setOptionalSetupAccount:id=>calls.push(['optional',id]),presentation:'mobile',auth:{user:{id:'account'}},setIsOnboardingOpen:v=>calls.push(['onboarding',v]),deferredIntentRef:{current:null},nav:{home:v=>calls.push(['home',v])},openProfile:id=>calls.push(['profile',id]),fulfilIntent:intent=>calls.push(['destination',intent.path]),beginActivation:()=>assert.fail('must not begin publishing'),setActivationAccountId:()=>assert.fail('must not open publishing'),readActivation:()=>saved};
 const code=ts.transpileModule(`(${callback.getText(ast)})('profile', completedRegistration);`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 context.completedRegistration=false;
 vm.runInNewContext(code,context);
 assert.deepEqual(calls,[['onboarding',false],['optional','account'],['home',true]]);
 assert.equal(saved.portal.id,'existing');
 calls.length=0;
 context.completedRegistration=true;
 vm.runInNewContext(code,context);
 assert.deepEqual(calls,[['onboarding',false],['profile','profile']]);
 calls.length=0;
 context.deferredIntentRef.current={kind:'route',path:'/share/example'};
 vm.runInNewContext(code,context);
 assert.deepEqual(calls,[['onboarding',false],['destination','/share/example']]);
});

test('first-project profile action opens details without silently creating a portal', async () => {
 const source=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let callback;
 function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('if (!isGlobalCreatePending'))callback=node.arguments[0];ts.forEachChild(node,visit);}
 visit(ast);assert.ok(callback);
 for(const categories of [[],[{id:'work',label:'Work'}]]) {
  const calls=[];
  const context={setProjectSetupAccountId:v=>calls.push(['setup',v]),setProjectSetupMetadata(){},setMobileRecoveryDraft(){},setMobileRecoveryError(){},isGlobalCreatePending:true,isOwnerMode:true,viewedProfile:{id:'owner',projects:[],categories},auth:{user:{id:'account'}},activeCategory:null,presentation:'mobile',journeyMadeIn:null,defaultCategoryRequest:{current:null},drafts:{readFirstProjectDraft:async()=>null,listDeviceDrafts:async()=>[],latestDeviceDraft:()=>null},createFirstProjectCategory:async label=>{calls.push(['create',label]);return {id:'work'};},setIsFirstProjectPublish:v=>calls.push(['first',v]),setFirstProjectPublisher:v=>calls.push(['special',v]),setPublishResumeDraft(){},setPublishTargetCategoryId:v=>calls.push(['target',v]),setPublishAccountId(){},setIsPublishOpen:v=>calls.push(['open',v]),setGlobalCreateAccountId(){},setGlobalCreateError:()=>assert.fail('unexpected preparation error')};
  const expression=callback.getText(ast).replace("import('./features/publishing/firstProjectDraft')",'Promise.resolve(drafts)');
  vm.runInNewContext(ts.transpileModule(`const enter=${expression};enter();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,[['setup','account']]);
 }
});
