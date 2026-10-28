import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { matchPath } from 'react-router-dom';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
function load(path, imports, globals = {}) {
  const exports = {};
  vm.runInNewContext(compile(read(path)), { exports, URLSearchParams, ...globals, require(name) {
    if (!(name in imports) && name.endsWith('/cataloguePageNavigation')) return { withCataloguePageTarget: href => href };
    assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`);
    return imports[name];
  } });
  return exports;
}
const navigation = load('src/components/navigation.ts', {});
const routes = load('src/app/routes.ts', { '../components/navigation': navigation });
const app = ts.createSourceFile('App.tsx', read('src/App.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(app.parseDiagnostics.length, 0, 'The production callback must come from valid App source');
let publishedCallback;
const completionFunctions=[];
function visit(node) {
  if(ts.isFunctionDeclaration(node)&&['focusPublishedDestination','closePostPublishIdea','openPostPublishedIdea'].includes(node.name?.text))completionFunctions.push(node.getText(app));
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(app) === 'PublishProjectDialog') {
    const attribute = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(app) === 'onPublished');
    if (attribute?.initializer && ts.isJsxExpression(attribute.initializer)) publishedCallback = attribute.initializer.expression?.getText(app);
  }
  ts.forEachChild(node, visit);
}
visit(app);
assert.ok(publishedCallback, 'Exercise App’s actual publish-to-navigation handoff');

function harness({ presentation = 'mobile', path = '/p/owner?view=portals#old-work',
  firstProjectPublisher = false, isFirstProjectPublish = false, resume = false,
  profileId = 'owner', citeIntent = null, privateProfile = false, fromSetup = false } = {}) {
  const navigationCalls = [], redirects = [], confirmations = [], remembered = [];
  const history = { state: { idx: 3 } };
  const locationFor = (address, state = null) => {
    const url = new URL(address, 'https://portalink.example.test');
    return { pathname: url.pathname, search: url.search, hash: url.hash, state };
  };
  let location = locationFor(path, { priorSelection: 'old-project' });
  let locationRef;
  const routing = load('src/app/useAppRoute.ts', {
    react: { useEffect() {}, useMemo: fn => fn(), useRef: value => locationRef ??= { current: value } },
    'react-router-dom': { matchPath, useLocation: () => location, useNavigate: () => (target, options) => {
      navigationCalls.push({ target, options });
      assert.equal(typeof target, 'string', 'Completion navigates to a canonical destination');
      location = locationFor(target, options?.state ?? null);
    } },
    './routes': routes,
    '../types/engagement': { activityKindFromSlug: value => value },
    '../utils/projectContinuity': { beginProjectContinuity: () => false },
  }, { window: { history } });
  const states = { isPublishOpen: true, publishTargetCategoryId: 'work', journeyMadeIn: firstProjectPublisher ? '2024-01' : null };
  const context = vm.createContext({
    presentation, firstProjectPublisher, isFirstProjectPublish,
    publishResumeDraft: resume ? { id: 'saved-draft' } : undefined,
    projectSetupMetadata:fromSetup?{categoryId:'work',title:'New idea',summary:''}:undefined,publishAccountId:'account',isOwnerMode:true,
    publishTargetCategoryId: 'work', auth: { viewerProfileId: profileId,user:{id:'account'},isAuthenticated:true },
    viewedProfile: profileId ? { id: profileId, isPrivate: privateProfile,categories:[{id:'work'}] } : null,
    postPublishIdea:null,readSetupDraft:()=>null,clearSetupDraft(){},setProjectSetupMetadata(){},
    nav: routing.useRouteNavigator(), mainContentRef: { current: null },buildPath:routes.buildPath,
    window: { sessionStorage: { getItem: key => { assert.equal(key, 'portalink:cite-intent'); return citeIntent; } }, location: { get pathname(){return location.pathname;},get search(){return location.search;},get hash(){return location.hash;},assign: path => redirects.push(path) } },document:{querySelector:()=>null},
    setIsPublishOpen: value => { states.isPublishOpen = value; },
    setPublishTargetCategoryId: value => { states.publishTargetCategoryId = value; },
    setJourneyMadeIn: value => { states.journeyMadeIn = value; },
    setPublishConfirmation: value => confirmations.push(plain(value)),setPostPublishIdea:value=>{context.postPublishIdea=value;},
    rememberLivePortfolio: (...args) => remembered.push(args),
    requestAnimationFrame: callback => { callback(); return 1; },
  });
  vm.runInContext(compile(`${completionFunctions.join('\n')}\nresult = (${publishedCallback});`), context);
  return { publish: (result = {}) => context.result({ projectId: 'new-project', mediaPersisted: true, sessionOnly: false, ...result }, 'New work'),
    navigationCalls, redirects, confirmations, remembered, states,
    location: () => location, route: () => plain(routing.useAppRoute()),get completion(){return context.postPublishIdea;},
    complete:destination=>vm.runInContext(compile(destination==='close'?'closePostPublishIdea();':`openPostPublishedIdea(${JSON.stringify(destination)});`),context),
    setBrowserAddress:address=>{location=locationFor(address);},
  };
}

for (const [name, options] of [
  ['ordinary', {}], ['journey', { firstProjectPublisher: true }],
  ['resumed', { resume: true }], ['first', { isFirstProjectPublish: true }],
]) test(`MOBILE ${name} publication opens the complete owner profile without reader or old tab state`, () => {
  const h = harness(options);
  h.publish();
  assert.deepEqual(h.navigationCalls.map(call => call.target), ['/p/owner']);
  assert.deepEqual(h.route(), { kind: 'profile', profileId: 'owner' });
  assert.deepEqual(h.location(), { pathname: '/p/owner', search: '', hash: '', state: null });
  assert.deepEqual(h.states, { isPublishOpen: false, publishTargetCategoryId: null, journeyMadeIn: null });
  assert.equal(h.confirmations[0].projectId, 'new-project');
  assert.equal(h.redirects.length, 0);
});

test('MOBILE publication from an open project returns to the profile; a session-only result stays truthful', () => {
  const h = harness({ path: '/p/owner/c/work/old-project?view=portals#page-3', resume: true });
  h.publish({ mediaPersisted: false, sessionOnly: true });
  assert.deepEqual(h.route(), { kind: 'profile', profileId: 'owner' });
  assert.equal(h.navigationCalls.length, 1);
  assert.match(h.confirmations[0].message, /added for this session only/);
  assert.equal(h.remembered.length, 0);
});

test('WEB ordinary publication still opens its new project while the journey still opens its profile', () => {
  const ordinary = harness({ presentation: 'web' });
  ordinary.publish();
  assert.deepEqual(ordinary.route(), { kind: 'project', profileId: 'owner', categoryId: 'work', projectId: 'new-project' });
  assert.equal(ordinary.navigationCalls.length, 1);
  const journey = harness({ presentation: 'web', firstProjectPublisher: true, isFirstProjectPublish: true });
  journey.publish();
  assert.deepEqual(journey.route(), { kind: 'profile', profileId: 'owner' });
  assert.deepEqual(journey.remembered, [['owner', 'new-project']]);
});

test('MOBILE first journey keeps the live-portfolio milestone for a durable public project', () => {
  for (const privateProfile of [false, true]) {
    const h = harness({ firstProjectPublisher: true, isFirstProjectPublish: true, privateProfile });
    h.publish();
    assert.deepEqual(h.remembered, privateProfile ? [] : [['owner', 'new-project']]);
    assert.deepEqual(h.route(), { kind: 'profile', profileId: 'owner' });
  }
});

test('both presentations preserve a durable citation-intent redirect before normal completion', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = harness({ presentation, citeIntent: 'reference / one' });
    h.publish();
    assert.deepEqual(h.redirects, ['/cite/reference%20%2F%20one?cite=1']);
    assert.equal(h.navigationCalls.length, 0);
    assert.equal(h.confirmations.length, 0);
    assert.equal(h.states.isPublishOpen, true);
  }
});

test('citation intent never turns a session-only result into a durable citation redirect', () => {
  for (const presentation of ['mobile', 'web']) {
    const h = harness({ presentation, citeIntent: 'reference' });
    h.publish({ mediaPersisted: false, sessionOnly: true });
    assert.deepEqual(h.redirects, []);
    assert.equal(h.route().kind, presentation === 'mobile' ? 'profile' : 'project');
    assert.match(h.confirmations[0].message, /added for this session only/);
  }
});

test('completion cannot forge a profile destination when the owner identity is absent', () => {
  for (const presentation of ['mobile', 'web']) for (const firstProjectPublisher of [false, true]) {
    const h = harness({ presentation, profileId: null, firstProjectPublisher });
    h.publish();
    assert.equal(h.navigationCalls.length, 0);
    assert.deepEqual(h.redirects, []);
    assert.equal(h.states.isPublishOpen, false);
  }
});

test('ordinary New idea completion retains its existing destination beneath the card and its captured CTA routes',()=>{
 for(const presentation of ['mobile','web'])for(const action of ['idea','catalogue','close']){
  const h=harness({presentation,fromSetup:true});h.publish();
  assert.equal(h.completion.projectId,'new-project');assert.deepEqual(h.confirmations,[null]);
  assert.deepEqual(h.route(),presentation==='mobile'?{kind:'profile',profileId:'owner'}:{kind:'project',profileId:'owner',categoryId:'work',projectId:'new-project'});
  const count=h.navigationCalls.length;h.complete(action);assert.equal(h.completion,null);
  assert.deepEqual(h.route(),action==='idea'?{kind:'project',profileId:'owner',categoryId:'work',projectId:'new-project'}:action==='catalogue'?{kind:'profile',profileId:'owner'}:presentation==='mobile'?{kind:'profile',profileId:'owner'}:{kind:'project',profileId:'owner',categoryId:'work',projectId:'new-project'});
  const alreadyAtDestination=(action==='idea'&&presentation==='web')||(action==='catalogue'&&presentation==='mobile');
  assert.equal(h.navigationCalls.length,count+(action==='close'||alreadyAtDestination?0:1));
 }
});

test('completion CTA deduplicates only the exact fresh destination and still leaves other paths, queries and hashes',()=>{
 for(const presentation of ['mobile','web'])for(const action of ['idea','catalogue'])for(const suffix of ['', '?view=portals','#old-work','/other']){
  const h=harness({presentation,fromSetup:true});h.publish();
  const target=action==='idea'?routes.buildPath('project',{profileId:'owner',categoryId:'work',projectId:'new-project'}):routes.buildPath('profile',{profileId:'owner'});
  h.setBrowserAddress(target+suffix);const count=h.navigationCalls.length;h.complete(action);
  assert.equal(h.completion,null);assert.equal(h.navigationCalls.length,count+(suffix?1:0));
  assert.equal(h.location().pathname,target);assert.equal(h.location().search,'');assert.equal(h.location().hash,'');
 }
});
