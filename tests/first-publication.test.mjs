import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = ts.createSourceFile('App.tsx', read('src/App.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.deepEqual(app.parseDiagnostics, [], 'App handlers must be extracted from syntactically valid source');
function find(predicate) {
  let result;
  function visit(node) { if (result) return; if (predicate(node)) result = node; else ts.forEachChild(node, visit); }
  visit(app); assert.ok(result, 'Expected the existing App handler or JSX boundary'); return result;
}
function expression(tag, attribute) {
  const element = find(node => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(app) === tag);
  const prop = element.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(app) === attribute);
  assert.ok(prop?.initializer && ts.isJsxExpression(prop.initializer));
  return prop.initializer.expression.getText(app);
}
const functionSource = name => find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(app);
const initializer = name => find(node => ts.isVariableDeclaration(node) && node.name.getText(app) === name).initializer.getText(app);
const effectSource = includes => find(node => ts.isCallExpression(node) && node.expression.getText(app) === 'useEffect'
  && node.arguments[0]?.getText(app).includes(includes)).arguments[0].getText(app);
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
function evaluate(source, context) { vm.runInContext(transpile(`result = (${source});`), context); return context.result; }
function harness() {
  const calls = [];
  const drafts = { readFirstProjectDraft: async () => null, listDeviceDrafts: async () => [], latestDeviceDraft: records => records[0] ?? null };
  let pendingIntent = null;
  const context = vm.createContext({
    mobileRecoveryDraft: null, mobileRecoveryError: '',
    setMobileRecoveryDraft: value => { context.mobileRecoveryDraft = value; },
    setMobileRecoveryError: value => { context.mobileRecoveryError = value; },
    React, result: null, setPostPublishIdea() {}, setPublishConfirmation() {}, projectSetupMetadata:undefined, projectSetupAccountId:null, setOptionalSetupAccount() {}, setProjectSetupAccountId:value=>context.projectSetupAccountId=value, setProjectSetupMetadata:value=>context.projectSetupMetadata=value, presentation: 'web', journeyMadeIn: null, firstProjectPublisher: false, isFirstProjectPublish: false, setFirstProjectPublisher: value => { context.firstProjectPublisher=value; }, setJourneyMadeIn: value => { context.journeyMadeIn=value; }, setIsFirstProjectPublish: value => { context.isFirstProjectPublish=value; }, require(name) { assert.equal(name, './features/publishing/firstProjectDraft'); return drafts; }, setGlobalCreateError() {}, defaultCategoryRequest: {current:null}, createFirstProjectCategory:async(label,icon)=>{calls.push(['createPortal',label,icon]);return{id:'work',label};}, auth: { phase: 'unauthenticated', isAuthenticated: false, viewerProfileId: null, user: null,
      requestAuthenticatedDestination(intent) { pendingIntent = intent; calls.push(['auth', plain(intent)]); },
      consumePendingIntent() { const intent = pendingIntent; pendingIntent = null; return intent; },
    },
    route: { kind: 'home' }, onboardingStatus: 'required', isOwnerMode: false, viewedProfile: null, activeCategory: null,
    isGlobalCreatePending: false, isPublishOpen: false, publishTargetCategoryId: null, isOnboardingOpen: false,
    globalCreateAccountId: null, publishAccountId: null, publishingAccountRef: { current: null }, publishConfirmation: null,
    deferredIntentRef: { current: null }, wasAuthenticatedRef: { current: false }, interactiveSignInRef: { current: false },
    resumedRegistration: { current: null }, canResumeRegistration: () => true, readSharedReturnPath: () => null,
    signedOutOfProtectedRef: { current: false }, mainContentRef: { current: null }, PROTECTED_ROUTE_KINDS: new Set(['messages', 'profileEditor']),
    requestAnimationFrame: fn => { fn(); },
    nav: { profile: id => calls.push(['profile', id]), home: () => calls.push(['home']), portalink: () => calls.push(['world']) },
    openPortalink: () => calls.push(['world']), openProfile: id => calls.push(['profile', id]),
    setGlobalCreateAccountId: value => { context.globalCreateAccountId = value; context.isGlobalCreatePending = evaluate(initializer('isGlobalCreatePending'), context); },
    setPublishAccountId: value => { context.publishAccountId = value; },
    setPublishResumeDraft: value => { context.publishResumeDraft = value; },
    setPortalChoice: value => { context.portalChoice = value; },
    setPublishConfirmation: value => { context.publishConfirmation = value; },
    setIsPublishOpen: value => { context.isPublishOpen = value; },
    setPublishTargetCategoryId: value => { context.publishTargetCategoryId = value; },
    setIsOnboardingOpen: value => { context.isOnboardingOpen = value; },
  });
  vm.runInContext(transpile(`${functionSource('setIsGlobalCreatePending')}\n${functionSource('requestGlobalPublish')}\n${functionSource('fulfilIntent')}`), context);
  const progressEffect = evaluate(effectSource('if (!isGlobalCreatePending'), context);
  const progress = async () => { context.isGlobalCreatePending = evaluate(initializer('isGlobalCreatePending'), context); progressEffect(); await new Promise(resolve=>setImmediate(resolve)); };
  const resetAccount = evaluate(effectSource('publishingAccountRef.current === accountId'), context);
  const resumeRegistration = evaluate(effectSource('resumedRegistration.current === id'), context);
  const signInTransition = evaluate(effectSource('const justSignedIn'), context);
  const completeOnboarding = evaluate(expression('ProfileOnboardingDialog', 'onComplete'), context);
  const dismissOnboarding = evaluate(expression('ProfileOnboardingDialog', 'onDismiss'), context);
  const completeSetup = evaluate(expression('ProjectSetupScreen', 'onContinue'), context);
  const homeAction = () => evaluate(expression('HomeFeed', 'emptyAction'), context);
  const browseAction = () => evaluate(expression('HomeFeed', 'emptySecondaryAction'), context);
  return { context, calls, drafts, progress, signInTransition, resetAccount, resumeRegistration, completeOnboarding, dismissOnboarding, completeSetup, homeAction, browseAction,
    canShowPublisher: () => evaluate(initializer('canShowPublisher'), context),
    authenticate(profileId = 'owner') { Object.assign(context.auth, { phase: 'authenticated', isAuthenticated: true, viewerProfileId: profileId, user: { id: 'account' } }); },
    ownerProfile(categories = [{ id: 'work' }]) { context.isOwnerMode = true; context.viewedProfile = { id: 'owner', categories, projects: [] }; context.onboardingStatus = 'ready'; },
  };
}

test('guest Home action resumes first publication after sign-in and completed profile onboarding', async () => {
  const h = harness();
  assert.equal(h.homeAction().label, 'Create your catalogue');
  h.homeAction().onClick();
  assert.deepEqual(h.calls, [['auth', { kind: 'create-project' }]]);
  assert.equal(h.context.isPublishOpen, false);
  h.context.auth.phase = 'authenticating'; h.signInTransition();
  h.authenticate(null); h.signInTransition();
  assert.equal(h.context.isOnboardingOpen, true);
  assert.equal(h.context.deferredIntentRef.current.kind, 'create-project');
  h.authenticate(); h.completeOnboarding('owner');
  assert.equal(h.context.isOnboardingOpen, false);
  assert.equal(h.context.deferredIntentRef.current, null);
  assert.equal(h.context.isPublishOpen, false, 'The owner portfolio must be resolved before opening its publisher.');
  h.ownerProfile(); await h.progress();
  assert.equal(h.context.projectSetupAccountId,'account');
  assert.equal(h.context.isPublishOpen,false,'The shared setup collects details before starting a publisher.');
  h.completeSetup({categoryId:'work',categoryLabel:'Work',title:'My idea',summary:''});
  assert.equal(h.context.publishTargetCategoryId, 'work'); assert.equal(h.context.isPublishOpen, true);
  assert.equal(h.context.isGlobalCreatePending, false);
  assert.deepEqual(h.calls.at(-1), ['profile', 'owner']);
});

test('cancelled onboarding abandons publication and browse does not require an account', async () => {
  const h = harness(); h.authenticate(null);
  h.homeAction().onClick();
  assert.equal(h.context.deferredIntentRef.current.kind, 'create-project');
  h.dismissOnboarding(); h.authenticate(); h.ownerProfile(); h.completeOnboarding('owner'); await h.progress();
  assert.equal(h.context.isPublishOpen, false); assert.equal(h.context.deferredIntentRef.current, null);
  const guest = harness();
  assert.equal(guest.browseAction().label, 'Explore the world'); guest.browseAction().onClick();
  assert.deepEqual(guest.calls, [['world']]); assert.equal(guest.context.isOnboardingOpen, false);
});

test('registration resumption retains the guest create intent through the first account reset', async () => {
  const h = harness(); h.homeAction().onClick();
  h.context.auth.phase = 'authenticating'; h.signInTransition();
  h.authenticate(null); h.context.auth.user.registration = { id: 'registration' };
  // Registration restoration is declared before the account reset effect in App.
  h.resumeRegistration(); h.resetAccount(); h.signInTransition();
  assert.equal(h.context.deferredIntentRef.current.kind, 'create-project');
  assert.equal(h.context.isOnboardingOpen, true);
  h.authenticate(); h.completeOnboarding('owner'); h.ownerProfile(); await h.progress();
  assert.equal(h.context.projectSetupAccountId,'account'); assert.equal(h.canShowPublisher(),false);
  h.completeSetup({categoryId:'work',categoryLabel:'Work',title:'My idea',summary:''});
  assert.equal(h.canShowPublisher(), true); assert.equal(h.context.publishTargetCategoryId, 'work');
});

test('owner creation opens setup without a Portal and publishes only after explicit metadata and Portal handoff', async () => {
  const h = harness(); h.authenticate(); h.ownerProfile([]);
  assert.equal(h.homeAction().label, 'Publish a project'); h.homeAction().onClick(); await h.progress();
  assert.equal(h.context.projectSetupAccountId,'account');
  assert.equal(h.context.isGlobalCreatePending, false); assert.equal(h.context.isPublishOpen, false);
  assert.equal(h.context.publishTargetCategoryId,null); assert.equal(h.calls.length,0,'Entry cannot silently create a Portal.');
  h.context.viewedProfile.categories = [{ id: 'first' }, { id: 'second' }]; await h.progress();
  assert.equal(h.context.publishTargetCategoryId,null); assert.equal(h.context.isPublishOpen,false);
  const setup={categoryId:'first',categoryLabel:'First',title:'A new idea',summary:'Its story'};
  h.completeSetup(setup);
  assert.equal(h.context.publishTargetCategoryId, 'first'); assert.equal(h.context.isGlobalCreatePending, false);
  assert.deepEqual(plain(h.context.projectSetupMetadata),setup); assert.equal(h.canShowPublisher(),true);
  const active = harness(); active.authenticate(); active.ownerProfile([{ id: 'first' }, { id: 'chosen' }]);
  active.context.activeCategory = { id: 'chosen' }; active.homeAction().onClick(); await active.progress();
  assert.equal(active.context.projectSetupAccountId,'account'); assert.equal(active.context.publishTargetCategoryId,null);
  assert.equal(evaluate(expression('ProjectSetupScreen','initialCategoryId'),active.context),'chosen');
  active.completeSetup({categoryId:'chosen',categoryLabel:'Chosen',title:'Chosen idea',summary:''});
  assert.equal(active.context.publishTargetCategoryId, 'chosen'); assert.equal(active.canShowPublisher(),true);
});

test('saved WEB draft retains its existing direct publisher and saved Portal selection',async()=>{
  const h=harness();h.authenticate();h.ownerProfile([{id:'first'},{id:'saved'}]);
  h.context.activeCategory={id:'first'};h.drafts.readFirstProjectDraft=async()=>({draft:{id:'saved-draft',categoryId:'saved'}});
  h.homeAction().onClick();await h.progress();
  assert.equal(h.context.projectSetupAccountId,null);assert.equal(h.canShowPublisher(),true);
  assert.equal(h.context.publishTargetCategoryId,'saved');assert.equal(h.context.firstProjectPublisher,true);
  assert.equal(h.context.publishResumeDraft,undefined);assert.equal(h.calls.length,0);
});

test('WEB Journey entry preserves its direct existing-Portal and explicit default-Portal paths',async()=>{
  const h=harness();h.authenticate();h.ownerProfile([{id:'work'}]);h.context.journeyMadeIn='2024-01';
  h.homeAction().onClick();await h.progress();
  assert.equal(h.context.projectSetupAccountId,null);assert.equal(h.canShowPublisher(),true);
  assert.equal(h.context.publishTargetCategoryId,'work');assert.equal(h.context.firstProjectPublisher,true);
  const empty=harness();empty.authenticate();empty.ownerProfile([]);empty.context.journeyMadeIn='2024-01';
  empty.homeAction().onClick();await empty.progress();
  assert.equal(empty.context.projectSetupAccountId,null);assert.equal(empty.context.isPublishOpen,false);
  assert.deepEqual(empty.calls,[['createPortal','Work','Grid2X2Icon']]);
});

test('a global create action from another profile returns to the account owner before selecting a category', async () => {
  const h = harness(); h.authenticate(); h.context.onboardingStatus = 'ready';
  h.context.viewedProfile = { id: 'another-creator', categories: [{ id: 'not-owned' }] };
  h.homeAction().onClick(); await h.progress();
  assert.deepEqual(h.calls, [['profile', 'owner']]); assert.equal(h.context.isPublishOpen, false);
  h.ownerProfile([{ id: 'owned-category' }]); await h.progress();
  assert.equal(h.context.projectSetupAccountId,'account');assert.equal(h.context.publishTargetCategoryId,null);
  h.completeSetup({categoryId:'owned-category',categoryLabel:'Owned',title:'Owned idea',summary:''});
  assert.equal(h.context.publishTargetCategoryId, 'owned-category');
});

test('App only supplies the profile publication action to its authenticated non-shared owner context', async () => {
  const ownerExpression = find(node => ts.isVariableDeclaration(node) && node.name.getText(app) === 'isOwnerMode').initializer.getText(app);
  const h = harness();
  for (const [isSharedRoute, viewerProfileId, viewedProfileId, expected] of [
    [false, 'owner', 'owner', true], [false, 'owner', 'visitor', false], [false, null, 'owner', false], [true, 'owner', 'owner', false],
  ]) {
    Object.assign(h.context, { isSharedRoute, viewedProfileId }); h.context.auth.viewerProfileId = viewerProfileId;
    h.context.isOwnerMode = evaluate(ownerExpression, h.context);
    const action = evaluate(expression('UserProfilePage', 'onPublishProject'), h.context);
    assert.equal(typeof action === 'function', expected);
  }
});

test('pending and open publishing never cross accounts, even before the reset effect runs', async () => {
  const h = harness(); h.authenticate(); h.resetAccount(); h.ownerProfile([]); h.homeAction().onClick();
  assert.equal(h.context.globalCreateAccountId, 'account');
  h.context.auth.user = { id: 'next-account' }; h.context.auth.viewerProfileId = 'next-owner';
  h.context.viewedProfile = { id: 'next-owner', categories: [{ id: 'next-work' }] };
  await h.progress(); assert.equal(h.context.isPublishOpen, false);
  h.resetAccount(); assert.equal(h.context.globalCreateAccountId, null);

  const open = harness(); open.authenticate(); open.resetAccount(); open.ownerProfile(); open.homeAction().onClick(); await open.progress();
  open.completeSetup({categoryId:'work',categoryLabel:'Work',title:'Idea',summary:''});
  assert.equal(open.canShowPublisher(), true);
  open.context.auth.user = { id: 'next-account' };
  assert.equal(open.canShowPublisher(), false, 'A layout effect is not required to hide another account’s draft.');
  open.context.publishConfirmation = { message: 'Old account published.' };
  open.resetAccount();
  assert.equal(open.context.isPublishOpen, false); assert.equal(open.context.publishTargetCategoryId, null);
  assert.equal(open.context.publishAccountId, null); assert.equal(open.context.publishConfirmation, null);
});

test('publisher visibility requires a category still owned by the current portfolio', async () => {
  const h = harness(); h.authenticate(); h.ownerProfile(); h.homeAction().onClick(); await h.progress();
  h.completeSetup({categoryId:'work',categoryLabel:'Work',title:'Idea',summary:''});
  assert.equal(h.canShowPublisher(), true);
  h.context.viewedProfile.categories = [{ id: 'different' }]; assert.equal(h.canShowPublisher(), false);
  h.context.viewedProfile.categories = [{ id: 'work' }]; h.context.isOwnerMode = false; assert.equal(h.canShowPublisher(), false);
});

function compile(path, imports) {
  const exports = {};
  vm.runInNewContext(transpile(read(path)), { exports, window: { sessionStorage: { getItem: () => null } }, require: imports });
  return exports;
}
function nodes(node) { return React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : []; }
function homeHarness(presentation, feed, props) {
  const placeholder = new Proxy({}, { get: (_, key) => key });
  let readiness;
  const react = { ...React, useCallback: fn => fn, useMemo: fn => fn(), useEffect() {}, useLayoutEffect() {}, useRef: current => ({ current }),
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] };
  const stateViews = compile('src/components/ui/StateViews.tsx', name => name === 'react' ? React : placeholder);
  const { HomeFeed } = compile('src/components/home/HomeFeed.tsx', name => {
    if (name.endsWith('/MobileBackNavigation')) return { useMobileScreenActive: () => true };
    if(name.endsWith('/useHomePullRefresh'))return {useHomePullRefresh:()=>''};
    if(name.endsWith('/useHomeRefreshMotion'))return {useHomeRefreshMotion:()=>({contentRef:{current:null},indicatorRef:{current:null},onPull(){}})};
    if(name.endsWith('/useHomeStartupReadiness'))return {useHomeStartupReadiness(options){readiness=options;}};
    if (name === 'react') return react;
    if (name.endsWith('/MobileContextActions')) return {useMobileScreenActions() {}, useMobileContextActions:()=>null};
    if (name === 'react-router-dom') return { useNavigate: () => () => {}, useLocation: () => ({ pathname: '/', search: '', hash: '' }) };
    if (name.endsWith('/useMobileFeedResume')) return { useMobileFeedResume: () => ({ restoring: false, handled: false }) };
    if (name.endsWith('/useMobileFeedRecovery')) return { useMobileFeedRecovery: () => () => {} };
    if (name.endsWith('/useFeed')) return { useFeed: () => feed };
    if (name.endsWith('/useProjectManagement')) return { useProjectManagement: () => ({ editor: { projectId: null, close() {} }, deletion: { projectId: null, cancel() {} } }) };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ viewerProfileId: null, isAuthenticated: true }) };
    if (name.endsWith('/useProfileGridLayout')) return { useProfileGridLayout: () => ({ layout: null }) };
    if (name.endsWith('/useProjectGridDensity')) return { useProjectGridDensity: () => ({ columns: 3 }) };
    if (name.endsWith('/StateViews')) return stateViews;
    if (name.endsWith('/projectPresentation')) return { getProjectAspectRatio: () => 1 };
    return placeholder;
  });
  return { tree: HomeFeed({ isSidebarCollapsed: false, onOpenProject() {}, onOpenCreator() {}, ...props }), stateViews, readiness };
}

test('Home renders working publish and browse controls only in its empty state on WEB and MOBILE', async () => {
  for (const presentation of ['web', 'mobile']) {
    const h = harness();
    const props = { emptyAction: h.homeAction(), emptySecondaryAction: h.browseAction() };
    const empty = homeHarness(presentation, { status: 'success', featured: null, projects: [], isEmpty: true }, props);
    const state = nodes(empty.tree).find(node => node.type === empty.stateViews.EmptyState);
    assert.ok(state);
    const controls = nodes(empty.stateViews.EmptyState(state.props)).filter(node => typeof node.props.onClick === 'function');
    assert.equal(controls.length, 2); controls[0].props.onClick(); controls[1].props.onClick();
    assert.deepEqual(h.calls, [['auth', { kind: 'create-project' }], ['world']]);
    const populated = homeHarness(presentation, { status: 'success', featured: null, projects: [{ project: { id: 'existing' }, creator: { id: 'creator' } }], isEmpty: false }, props);
    assert.equal(nodes(populated.tree).some(node => node.type === populated.stateViews.EmptyState), false);
    const grid = nodes(populated.tree).find(node => node.type === (presentation === 'mobile' ? 'JustifiedImageWall' : 'BentoFeedGrid'));
    assert.equal(grid.props.items.length, 1); assert.equal(grid.props.items[0].key, 'existing');
  }
});


test('zero-project mobile Home is one first-project action even before its empty feed resolves',()=>{
  let clicks=0;
  const mobile=homeHarness('mobile',{status:'loading',featured:null,projects:[],isEmpty:true},{firstProjectAction:()=>clicks++});
  assert.equal(nodes(mobile.tree).some(node=>node.type===mobile.stateViews.EmptyState),false);
  const action=nodes(mobile.tree).find(node=>node.props?.onClick);
  action.props.onClick();assert.equal(clicks,1);
  assert.equal(nodes(mobile.tree).filter(node=>node.props?.onClick).length,1);
});

test('startup first-project Home still waits for the feed to confirm its empty state or fail',()=>{
  for(const status of ['idle','loading','success','error']){
    const h=homeHarness('mobile',{status,featured:null,projects:[],isEmpty:status==='success'},{firstProjectAction(){},startupPending:true,onStartupReady(){}});
    assert.equal(h.readiness.enabled,true);
    assert.equal(h.readiness.settled,status==='success');
    assert.equal(h.readiness.terminalError,status==='error');
    assert.equal(h.readiness.projectCount,0);
  }
});

test('public Home work stays visible for a mobile owner who has not published yet',()=>{
 const h=homeHarness('mobile',{status:'ready',featured:null,projects:[{project:{id:'public-work'},creator:{id:'unfollowed'}}],isEmpty:false},{firstProjectAction:()=>{}});
 const wall=nodes(h.tree).find(node=>node.type==='JustifiedImageWall');assert.ok(wall);assert.equal(wall.props.items[0].key,'public-work');
});

 test('mobile creation enters details before creating a draft', async () => {
  const h = harness(); h.authenticate(); h.ownerProfile([{ id: 'first' }, { id: 'chosen' }]);
  h.context.presentation = 'mobile'; h.context.activeCategory = { id: 'chosen' };
  h.homeAction().onClick(); await h.progress();
  assert.equal(h.context.projectSetupAccountId,'account');
  assert.equal(h.context.publishTargetCategoryId,null);
  assert.equal(h.context.isPublishOpen,false);
  assert.doesNotMatch(read('src/App.tsx'), /ProjectPortalChoice|setPortalChoice/);
});

test('prepared metadata never bypasses current portal membership or account scope',()=>{const h=harness();h.authenticate();h.ownerProfile();Object.assign(h.context,{isPublishOpen:true,publishAccountId:'account',publishTargetCategoryId:'work',projectSetupMetadata:{categoryId:'work'}});assert.equal(h.canShowPublisher(),true);h.context.viewedProfile.categories=[];assert.equal(h.canShowPublisher(),false);h.context.viewedProfile.categories=[{id:'work'}];h.context.auth.user={id:'next-account'};assert.equal(h.canShowPublisher(),false);});


test('portal confirmation invalidates before reading and rejects missing or wrong-owner portals',async()=>{
 const h=harness();h.authenticate();h.ownerProfile();h.context.viewedProfileId='owner';const calls=[];
 h.context.invalidateProfiles=()=>calls.push('invalidate');
 h.context.fetchProfile=async(id,mode)=>{calls.push([id,mode]);return{id:h.context.auth.viewerProfileId,categories:[{id:'work'}]};};
 const confirm=evaluate(expression('ProjectSetupScreen','onConfirmPortal'),h.context);
 await confirm({id:'work'});assert.deepEqual(calls,['invalidate',['owner','overview']]);
 h.context.fetchProfile=async()=>({id:'other',categories:[{id:'work'}]});await assert.rejects(confirm({id:'work'}),/no longer available/);
 h.context.fetchProfile=async()=>({id:h.context.auth.viewerProfileId,categories:[]});await assert.rejects(confirm({id:'work'}),/no longer available/);
 h.context.fetchProfile=async()=>{throw Error('Read failed');};await assert.rejects(confirm({id:'work'}),/Read failed/);
 const setup=find(node=>ts.isJsxElement(node)&&node.openingElement.tagName.getText(app)==='DeferredDialog'&&node.getText(app).includes('<ProjectSetupScreen'));
 assert.doesNotMatch(setup.parent.getText(app),/isOwnerMode && viewedProfile &&/);
});
