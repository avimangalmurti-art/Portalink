import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

// Run from the product root, using its installed TypeScript read-only. This file
// also works unchanged in product/tests after the guarded patch is integrated.
const requireProduct = createRequire(path.join(process.cwd(), 'package.json'));
const ts = requireProduct('typescript');
const isolatedApp = new URL('../App.tsx', import.meta.url);
const appPath = existsSync(isolatedApp) ? isolatedApp : new URL('../src/App.tsx', import.meta.url);
const source = readFileSync(appPath, 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let entry, setupAttributes, publishedHandler;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes('if (!isGlobalCreatePending')) entry = node.arguments[0];
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.tagName.getText(ast) === 'ProjectSetupScreen') setupAttributes = node.attributes;
  if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.tagName.getText(ast) === 'PublishProjectDialog') {
    publishedHandler = node.attributes.properties.find(item => item.name?.getText(ast) === 'onPublished')?.initializer.expression;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(entry, 'The actual App global-create effect must be present.');
assert.ok(setupAttributes, 'The actual shared setup surface must be present.');
assert.ok(publishedHandler, 'The actual publication completion handler must be present.');
const entryCode = ts.transpileModule(`(${entry.getText(ast)})();`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replaceAll("import('./features/publishing/firstProjectDraft')", 'Promise.resolve(drafts)');
const tick = () => new Promise(setImmediate);

function harness(options = {}) {
  const calls = { legacy: [], list: [], latest: [], create: [], errors: [] };
  const state = {
    setup: null, recovery: 'stale', recoveryError: 'stale', metadata: 'stale',
    target: null, account: null, open: false, special: false, pending: 'account', first: false,
  };
  const categories = options.categories ?? [];
  const recovery = options.recovery ?? null;
  const context = {
    presentation: options.presentation ?? 'web',
    isGlobalCreatePending: options.pending ?? true,
    isOwnerMode: options.owner ?? true,
    viewedProfile: { id: 'profile', projects: options.projects ?? [], categories },
    auth: { user: { id: 'account' } },
    activeCategory: options.activeCategory ?? null,
    journeyMadeIn: options.journeyMadeIn ?? null,
    defaultCategoryRequest: { current: null },
    drafts: {
      async readFirstProjectDraft(...args) { calls.legacy.push(args); return options.readLegacy ? options.readLegacy(...args) : options.saved ?? null; },
      async listDeviceDrafts(...args) { calls.list.push(args); if (options.recoveryError) throw Error('Unavailable'); return recovery ? [recovery] : []; },
      latestDeviceDraft(records, categoryIds) { calls.latest.push([records, categoryIds]); return records[0] ?? null; },
    },
    async createFirstProjectCategory(...args) { calls.create.push(args); return { id: 'created', label: args[0] }; },
    setProjectSetupAccountId: value => { state.setup = value; },
    setMobileRecoveryDraft: value => { state.recovery = value; },
    setMobileRecoveryError: value => { state.recoveryError = value; },
    setProjectSetupMetadata: value => { state.metadata = value; },
    setGlobalCreateAccountId: value => { state.pending = value; },
    setIsFirstProjectPublish: value => { state.first = value; },
    setFirstProjectPublisher: value => { state.special = value; },
    setPublishResumeDraft: value => { state.resume = value; },
    setPublishTargetCategoryId: value => { state.target = value; },
    setPublishAccountId: value => { state.account = value; },
    setIsPublishOpen: value => { state.open = value; },
    setGlobalCreateError: value => { calls.errors.push(value); },
  };
  const cleanup = vm.runInNewContext(entryCode, context);
  return { calls, state, context, cleanup, async settle() { await tick(); await tick(); } };
}

test('fresh WEB creation enters shared setup with zero or existing Portals before any draft opens', async () => {
  for (const categories of [[], [{ id: 'work', label: 'Work' }]]) {
    const h = harness({ categories }); await h.settle();
    assert.equal(h.state.setup, 'account');
    assert.equal(h.state.open, false);
    assert.equal(h.state.target, null);
    assert.equal(h.state.account, null);
    assert.equal(h.state.recovery, null);
    assert.equal(h.state.recoveryError, '');
    assert.equal(h.state.metadata, undefined);
    assert.equal(h.state.pending, null);
    assert.deepEqual(h.calls.create, [], 'Entry must not create a default Portal.');
    assert.deepEqual(h.calls.legacy, [['account', 'profile']], 'Existing WEB recovery lookup must remain.');
    assert.equal(h.calls.list.length, 0, 'WEB must not acquire MOBILE draft enumeration.');
  }
});

test('shared setup retains WEB active Portal choice through the actual App prop', async () => {
  const chosen = { id: 'chosen', label: 'Chosen' };
  const h = harness({ categories: [{ id: 'first', label: 'First' }, chosen], activeCategory: chosen });
  await h.settle(); assert.equal(h.state.setup, 'account');
  const prop = setupAttributes.properties.find(item => item.name?.getText(ast) === 'initialCategoryId');
  assert.ok(prop && ts.isJsxExpression(prop.initializer));
  const value = vm.runInNewContext(`(${prop.initializer.expression.getText(ast)})`, h.context);
  assert.equal(value, 'chosen');
  assert.equal(h.state.open, false);
});

test('existing WEB saved-draft selection keeps its prior direct publisher path and Portal', async () => {
  const saved = { draft: { id: 'legacy-draft', categoryId: 'saved' } };
  const h = harness({ saved, categories: [{ id: 'work' }, { id: 'saved' }], activeCategory: { id: 'work' } });
  await h.settle();
  assert.equal(h.state.setup, null);
  assert.equal(h.state.open, true);
  assert.equal(h.state.target, 'saved');
  assert.equal(h.state.account, 'account');
  assert.equal(h.state.special, true);
  assert.equal(h.state.resume, undefined, 'Preserve the existing WEB recovery handoff.');
  assert.equal(h.calls.list.length, 0);
  assert.equal(h.calls.create.length, 0);
});

test('WEB Journey entry keeps the existing direct path and default-Portal preparation', async () => {
  const existing = harness({ categories: [{ id: 'work' }], journeyMadeIn: '2024-01' });
  await existing.settle();
  assert.equal(existing.state.setup, null);
  assert.equal(existing.state.open, true);
  assert.equal(existing.state.target, 'work');
  assert.equal(existing.state.special, true);
  const empty = harness({ journeyMadeIn: '2024-01' }); await empty.settle();
  assert.equal(empty.state.setup, null);
  assert.equal(empty.state.open, false);
  assert.deepEqual(empty.calls.create, [['Work', 'Grid2X2Icon']]);
});

test('MOBILE recovery keeps account/profile scope and enters setup without a WEB legacy lookup', async () => {
  const recovery = { draft: { id: 'saved-mobile', profileId: 'profile', categoryId: 'work' }, metadata: { title: 'Saved title', summary: '' } };
  const h = harness({ presentation: 'mobile', categories: [{ id: 'work' }], recovery }); await h.settle();
  assert.equal(h.state.setup, 'account');
  assert.equal(h.state.recovery, recovery);
  assert.equal(h.state.recoveryError, '');
  assert.equal(h.state.open, false);
  assert.deepEqual(h.calls.list, [['account', 'profile', true]]);
  assert.deepEqual(h.calls.latest[0][1], ['work']);
  assert.equal(h.calls.legacy.length, 0);
  assert.equal(h.calls.create.length, 0);
});

test('MOBILE recovery failure retains the existing explicit error and still opens editable setup', async () => {
  const h = harness({ presentation: 'mobile', recoveryError: true }); await h.settle();
  assert.equal(h.state.setup, 'account');
  assert.equal(h.state.recovery, null);
  assert.match(h.state.recoveryError, /Saved upload drafts could not be checked/);
  assert.equal(h.state.open, false);
});

test('a cancelled WEB opening cannot install setup after its asynchronous recovery read', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ readLegacy: () => pending });
  assert.equal(typeof h.cleanup, 'function'); h.cleanup(); finish(null); await h.settle();
  assert.equal(h.state.setup, null);
  assert.equal(h.state.open, false);
  assert.equal(h.state.pending, 'account');
});

test('inactive or non-owner global-create effects cannot read drafts or open setup', async () => {
  for (const options of [{ pending: false }, { owner: false }]) {
    const h = harness(options); await h.settle();
    assert.equal(h.state.setup, null);
    assert.equal(h.state.open, false);
    assert.equal(h.calls.legacy.length, 0);
    assert.equal(h.calls.list.length, 0);
  }
});

function publicationHarness(options = {}) {
  const calls = [], initial = { categoryId:'work',categoryLabel:'Work',title:'Original idea',summary:'Original story' };
  let saved = options.saved === undefined ? { portal:'work',title:'  Original idea ',summary:' Original story  ',name:'' } : options.saved;
  const context = {
    presentation:options.presentation ?? 'web',
    publishTargetCategoryId:'work',publishAccountId:'account',projectSetupMetadata:initial,
    auth:{user:{id:'account'},viewerProfileId:'profile'},isOwnerMode:true,
    viewedProfile:{id:'profile',isPrivate:false},firstProjectPublisher:false,isFirstProjectPublish:false,
    readSetupDraft(accountId,profileId) { calls.push(['read',accountId,profileId]);if(options.readError)throw Error('Storage unavailable');return saved; },
    clearSetupDraft(accountId,profileId) { calls.push(['clear',accountId,profileId]);if(options.clearError)throw Error('Write refused');saved=null; },
    window:{sessionStorage:{getItem:()=>options.citeIntent??null},location:{assign:href=>calls.push(['redirect',href])}},
    setIsPublishOpen:value=>calls.push(['open',value]),setProjectSetupMetadata:value=>calls.push(['metadata',value]),
    setPublishTargetCategoryId:value=>calls.push(['target',value]),setJourneyMadeIn(){},setPublishConfirmation(){},
    nav:{profile:id=>calls.push(['profile',id]),project:(...args)=>calls.push(['project',...args])},
    requestAnimationFrame:callback=>callback(),mainContentRef:{current:null},
    rememberLivePortfolio(){assert.fail('Ordinary cleanup must not enable first-publication behavior.');},
  };
  Object.assign(context,options.context);
  const code = ts.transpileModule(`(${publishedHandler.getText(ast)})(result,'Edited final title');`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022},
  }).outputText;
  return {calls,get saved(){return saved;},run(result={projectId:'published',mediaPersisted:true,sessionOnly:false}){vm.runInNewContext(code,{...context,result});}};
}

test('durable WEB publication clears only its matching original setup, even after publisher title edits',()=>{
  const h=publicationHarness();h.run();
  assert.deepEqual(h.calls.slice(0,2),[['read','account','profile'],['clear','account','profile']]);
  assert.equal(h.saved,null);
  assert.ok(h.calls.some(call=>call[0]==='project'&&call[1]==='profile'&&call[2]==='work'&&call[3]==='published'));
});

test('WEB publication retains a newer or unrelated setup and tolerates storage failures',()=>{
  for(const saved of [
    {portal:'other',title:'Original idea',summary:'Original story'},
    {portal:'work',title:'A later idea',summary:'Original story'},
    {portal:'work',title:'Original idea',summary:'A later story'},
    null,
  ]) {
    const h=publicationHarness({saved});h.run();assert.equal(h.saved,saved);
    assert.equal(h.calls.some(call=>call[0]==='clear'),false);
  }
  for(const options of [{readError:true},{clearError:true}]) {
    const h=publicationHarness(options);assert.doesNotThrow(()=>h.run());assert.notEqual(h.saved,null);
    assert.ok(h.calls.some(call=>call[0]==='project'),'Storage failures cannot block confirmed publication navigation.');
  }
});

test('unconfirmed, non-durable and session-only results cannot clear a WEB setup',()=>{
  for(const result of [
    {projectId:'',mediaPersisted:true,sessionOnly:false},
    {projectId:'published',mediaPersisted:false,sessionOnly:false},
    {projectId:'published',mediaPersisted:true,sessionOnly:true},
  ]) {
    const h=publicationHarness();h.run(result);assert.notEqual(h.saved,null);
    assert.equal(h.calls.some(call=>call[0]==='read'||call[0]==='clear'),false);
  }
});

test('WEB setup cleanup refuses wrong-account, wrong-profile, non-owner and mismatched initial Portal scope',()=>{
  for(const context of [
    {publishAccountId:'other-account'},
    {auth:{user:{id:'other-account'},viewerProfileId:'profile'}},
    {auth:{user:{id:'account'},viewerProfileId:'other-profile'}},
    {isOwnerMode:false},
    {projectSetupMetadata:{categoryId:'other',title:'Original idea',summary:'Original story'}},
    {projectSetupMetadata:undefined},
  ]) {
    const h=publicationHarness({context});h.run();assert.notEqual(h.saved,null);
    assert.equal(h.calls.some(call=>call[0]==='read'||call[0]==='clear'),false);
  }
});

test('MOBILE completion leaves setup cleanup to its existing durable checkpoint lifecycle',()=>{
  const h=publicationHarness({presentation:'mobile'});h.run();
  assert.equal(h.calls.some(call=>call[0]==='read'||call[0]==='clear'),false);
  assert.equal(h.calls.some(call=>call[0]==='metadata'),false);
  assert.notEqual(h.saved,null);assert.ok(h.calls.some(call=>call[0]==='profile'));
});

test('completed WEB publication drops initial metadata so a later Journey cannot inherit it',()=>{
  for(const sessionOnly of [false,true]) {
    const h=publicationHarness();h.run({projectId:'published',mediaPersisted:!sessionOnly,sessionOnly});
    assert.deepEqual(h.calls.filter(call=>call[0]==='metadata'),[['metadata',undefined]]);
    if(sessionOnly)assert.notEqual(h.saved,null,'A session-only result must retain the device setup even after clearing completed in-memory metadata.');
  }
});

test('matching WEB cleanup occurs before a confirmed citation redirect',()=>{
  const h=publicationHarness({citeIntent:'citation'});h.run();
  assert.deepEqual(h.calls,[['read','account','profile'],['clear','account','profile'],['redirect','/cite/citation?cite=1']]);
  assert.equal(h.saved,null);
});
