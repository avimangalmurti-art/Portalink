import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {matchPath} from 'react-router-dom';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {sourceModule} from './helpers/source-module.mjs';

const plain=value=>JSON.parse(JSON.stringify(value));
const nodes=tree=>Array.isArray(tree)?tree.flatMap(nodes):React.isValidElement(tree)?[tree,...nodes(tree.props.children)]:[];
const routes=sourceModule('src/app/routes.ts',{'../components/navigation':sourceModule('src/components/navigation.ts')});
const sharing=sourceModule('src/features/sharing/shareModel.ts');
function routeHarness(path='/',state=null,index=0){
 const calls=[],history={state:{idx:index}},entries=new Map();let location,locationRef;
 const parse=(address,nextState)=>{const url=new URL(address,'https://portalink.example.test');return {pathname:url.pathname,search:url.search,hash:url.hash,state:nextState};};
 location=parse(path,state);entries.set(index,location);
 const navigate=(target,options)=>{calls.push([target,options]);if(typeof target==='number'){history.state.idx+=target;location=entries.get(history.state.idx)??location;return;}
  location=parse(target,options?.state??null);if(!options?.replace)history.state.idx++;entries.set(history.state.idx,location);};
 const routing=sourceModule('src/app/useAppRoute.ts',{
  react:{useEffect(){},useMemo:create=>create(),useRef:value=>locationRef??={current:value}},
  'react-router-dom':{matchPath,useLocation:()=>location,useNavigate:()=>navigate},'./routes':routes,
  '../types/engagement':sourceModule('src/types/engagement.ts'),
  '../utils/projectContinuity':{beginProjectContinuity:()=>false},
  '../features/profile/cataloguePageNavigation':{withCataloguePageTarget:value=>value},
 },{window:{history}});
 return {routing,calls,history,nav:()=>routing.useRouteNavigator(),location:()=>location};
}

test('portal search is an account-protected app route and cannot be mistaken for a public handle',()=>{
 const path='/portal-search?q=Product%20Design#results',h=routeHarness(path);
 assert.equal(routes.buildPath('portalSearch'),'/portal-search');
 assert.deepEqual(plain(h.routing.useAppRoute()),{kind:'portalSearch'});
 assert.equal(h.routing.describeRoute(h.routing.useAppRoute()),'search public portals');
 assert.ok(h.routing.PROTECTED_ROUTE_KINDS.has('portalSearch'));
 assert.ok(h.routing.PROTECTED_ROUTE_KINDS.has('studio'));
 assert.equal(sharing.handleFromPath('/portal-search'),null);assert.equal(sharing.isPublicSharePath('/portal-search'),false);
 assert.equal(h.location().search,'?q=Product%20Design');assert.equal(h.location().hash,'#results');assert.deepEqual(h.calls,[],'Reading the route cannot discard its search or fragment');
 assert.equal(routeHarness('/portals').routing.useAppRoute().kind,'portals');
 assert.equal(routeHarness('/share/creator/c/work').routing.useAppRoute().kind,'sharedCategory');
});

test('canonical footer navigation and portal drill-down keep browser Back history including query/hash/state',()=>{
 const h=routeHarness('/portal-search?q=Architecture#page-2',{position:420},3);
 for(let i=0;i<2;i++){
  h.nav().category('another-creator','chosen-portal');assert.equal(h.location().pathname,'/p/another-creator/c/chosen-portal');
  h.nav().back();assert.equal(h.location().pathname,'/portal-search');assert.equal(h.location().search,'?q=Architecture');assert.equal(h.location().hash,'#page-2');assert.deepEqual(h.location().state,{position:420});assert.equal(h.history.state.idx,3);
 }
 h.nav().studio();assert.equal(h.location().pathname,'/studio');assert.equal(h.routing.useAppRoute().kind,'studio');
 h.nav().back();assert.equal(h.location().search,'?q=Architecture');
 h.nav().portalSearch();assert.equal(h.location().pathname,'/portal-search');assert.equal(h.location().search,'');
 assert.deepEqual(h.calls.at(-1),['/portal-search',undefined]);
});

function boundaryHarness(presentation,path){
 const h=routeHarness(path),slots=[],requests=[],children=[];let cursor=0,effects=[];
 const navigate=()=>{};
 const react={...React,useRef(value){const i=cursor++;return slots[i]??={current:value};},useEffect(callback,deps){const i=cursor++,previous=slots[i];if(!previous||deps.some((value,index)=>!Object.is(value,previous.deps[index]))){slots[i]={deps};effects.push(callback);}}};
 const auth={isAuthenticated:false,isInitializing:false,isSessionUnavailable:false,phase:'unauthenticated',session:null,pendingView:null,requestAuthenticatedDestination(intent){requests.push(intent);auth.pendingView='signIn';}};
 const {AccountEntryBoundary}=sourceModule('src/app/AccountEntryBoundary.tsx',{
  react,'react-router-dom':{useLocation:h.location,useNavigate:()=>navigate},'../contexts/AuthContext':{useAuth:()=>auth},
  './useAppRoute':h.routing,'../components/ui/DeferredDialog':{DeferredDialog:'deferred'},'../features/auth/SessionStatusBanner':{SessionStatusBanner:'session-status'},
  '../hooks/useDeviceAppearance':{useDeviceAppearance:()=>({})},'../presentation/AppPresentation':{AppPresentation:'app-presentation'},'../presentation/usePresentation':{usePresentation:()=>presentation},
  '../utils/accentTokens':{resolveAccentTokens:()=>({})},'../utils/macTokens':{resolveMacTokens:()=>({})},'../data/navButtonTokens':{resolveNavButtonTokens:()=>({})},
 });
 return {auth,requests,children,render(){cursor=0;effects=[];const tree=AccountEntryBoundary({children:interactive=>{children.push(interactive);return React.createElement('private-app');}});effects.forEach(effect=>effect());return tree;}};
}

test('signed-out portal-search deep links retain the exact pending URL without mounting private screens or reopening after cancel',()=>{
 for(const presentation of ['web','mobile']){
  const path='/portal-search?q=Product%20Design#chosen',h=boundaryHarness(presentation,path);h.render();
  assert.deepEqual(plain(h.requests),[{kind:'route',path,label:'search public portals'}]);assert.deepEqual(h.children,[]);
  h.render();h.auth.pendingView=null;h.render();assert.equal(h.requests.length,1,'Cancellation cannot raise the same request again');assert.deepEqual(h.children,[]);
  h.auth.pendingView='signIn';h.auth.phase='authenticating';h.render();assert.deepEqual(h.children,[]);
  h.auth.pendingView=null;h.auth.phase='authenticated';h.auth.isAuthenticated=true;h.auth.session={user:{id:'account'}};h.render();
  assert.deepEqual(h.children,[true],'The existing interactive-auth handoff releases the requested app screen');assert.equal(h.requests[0].path,path);
 }
 const publicEntry=boundaryHarness('web','/share/creator/c/work');publicEntry.render();assert.deepEqual(publicEntry.requests,[]);assert.deepEqual(publicEntry.children,[false]);
});

function screenModuleFixture(failFirst=false){
 const loads={portal:0,studio:0},mounted=[];
 const imports={};
 Object.defineProperty(imports,'../features/portals/PublicPortalSearchPage',{get(){loads.portal++;if(failFirst&&loads.portal===1)throw Error('Temporary code transport failure');return {PublicPortalSearchPage:()=>mounted.push('portal')};}});
 Object.defineProperty(imports,'../features/studio/StudioPage',{get(){loads.studio++;return {StudioPage:()=>mounted.push('studio')};}});
 return {api:sourceModule('src/app/screenModules.ts',imports),loads,mounted};
}

test('warming the new portal-search screen downloads its own code once without mounting it or private Studio',async()=>{
 const h=screenModuleFixture(),[first,again]=await Promise.all([h.api.warmScreenForPath('/portal-search'),h.api.warmScreenForPath('/portal-search')]);
 assert.equal(first[0].status,'fulfilled');assert.equal(again[0].status,'fulfilled');assert.equal(typeof first[0].value.default,'function');
 assert.deepEqual(h.loads,{portal:1,studio:0});assert.deepEqual(h.mounted,[]);
 await h.api.warmScreenForPath('/studio');await h.api.warmScreenForPath('/saved');assert.equal(h.loads.studio,1,'Existing Studio and saved-alias warming share their download');assert.deepEqual(h.mounted,[]);
});

test('a rejected portal-search code download can retry without poisoning other destination warming',async()=>{
 const h=screenModuleFixture(true);assert.equal((await h.api.warmScreenForPath('/portal-search'))[0].status,'rejected');
 assert.equal((await h.api.warmScreenForPath('/studio'))[0].status,'fulfilled');
 assert.equal((await h.api.warmScreenForPath('/portal-search'))[0].status,'fulfilled');
 assert.deepEqual(h.loads,{portal:2,studio:1});assert.deepEqual(h.mounted,[]);
});

const appSource=ts.createSourceFile('App.tsx',readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),declarations=new Map();let blockedView;
(function visit(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer)declarations.set(node.name.text,node.initializer);if(ts.isConditionalExpression(node)&&node.condition.getText(appSource)==='isRouteBlocked'&&node.whenTrue.getText(appSource).includes('<EmptyState'))blockedView=node.whenTrue;ts.forEachChild(node,visit);})(appSource);
function appBranch(kind,presentation='web',authenticated=true){
 const callbacks=[],model=routeHarness('/'+kind).routing,context=vm.createContext({React,route:{kind},presentation,pathname:'/'+kind,
  auth:{isAuthenticated:authenticated,isInitializing:false,phase:authenticated?'authenticated':'unauthenticated',user:authenticated?{id:'account-a'}:null,requestAuth:value=>callbacks.push(['auth',value])},PROTECTED_ROUTE_KINDS:model.PROTECTED_ROUTE_KINDS,describeRoute:model.describeRoute,
  isSharedRoute:false,isProfileEditorRoute:false,activeCategory:null,isSearchOpen:false,isMessagesOpen:false,isControlCenterOpen:false,iconPickerCategoryId:null,routeStateView:null,routeActivityKind:null,isProfileRouteReady:false,viewedProfile:null,viewedProfileId:null,activeCategoryId:null,activeDestination:'Today',openingProjectId:null,isWebReaderLoading:false,
  StudioPage:'studio',PublicPortalSearchPage:'portal-search',SavedPage:'saved',EmptyState:'gate',LoadingState:'loading',LoadingSkeleton:'skeleton',DeferredSurfaceBoundary:'deferred',RouteError:'route-error',
  nav:{back:()=>callbacks.push('back'),home:()=>callbacks.push('home')},requestMobilePublish:()=>callbacks.push('mobile-create'),requestGlobalPublish:()=>callbacks.push('web-create'),openProjectById:(...args)=>callbacks.push(['project',...args]),completeStudioPublication:()=>{},
 });
 const evaluate=node=>vm.runInContext(ts.transpileModule('('+node.getText(appSource)+')',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText,context);
 for(const name of ['isCollaborationOpen','isPortalSearchOpen','isPortalsOpen','isInsightsOpen','isStudioOpen','isSavedOpen','isMobileStudioOpen','isStudioPageOpen','inDesignFeature','isActivityOpen','personalScreen','isProtectedRoute','isRouteBlocked','isFeedView','screenTransitionKey','screenMainClassName','screenAriaLabel'])context[name]=evaluate(declarations.get(name));
 if(context.isRouteBlocked)context.routeStateView=evaluate(blockedView);
 const tree=evaluate(declarations.get('screenContent'));return {tree,context,callbacks};
}

test('actual App branches give WEB Studio and portal search contained screens while WEB Saved stays the existing library',()=>{
 for(const [kind,type,label,fallback] of [['studio','studio','Studio','studio'],['portalSearch','portal-search','Portal search','grid']]){
  const h=appBranch(kind),page=nodes(h.tree).find(node=>node.type===type);assert.ok(page);assert.equal(page.key,'account-a');
  assert.equal(h.context.personalScreen,label);assert.equal(h.context.screenAriaLabel,label);assert.match(h.context.screenMainClassName,/overflow-hidden/);assert.equal(h.tree.props['data-screen-scroll'],'nested');assert.match(h.tree.props.className,/h-full/);
  assert.equal(nodes(h.tree).find(node=>node.type===React.Suspense).props.fallback.props.kind,fallback);page.props.onBack();assert.deepEqual(h.callbacks,['back']);
 }
 const saved=appBranch('saved');assert.ok(nodes(saved.tree).some(node=>node.type==='saved'));assert.equal(nodes(saved.tree).some(node=>node.type==='studio'),false);assert.equal(saved.context.personalScreen,'Saved');assert.match(saved.context.screenMainClassName,/overflow-y-auto/);
 const mobileSaved=appBranch('saved','mobile');assert.ok(nodes(mobileSaved.tree).some(node=>node.type==='studio'));assert.equal(mobileSaved.context.personalScreen,'Studio');
});

test('actual App route-state branch suppresses both new WEB destinations while signed out',()=>{
 for(const kind of ['studio','portalSearch']){
  const h=appBranch(kind,'web',false);assert.equal(h.context.isProtectedRoute,true);assert.equal(h.context.isRouteBlocked,true);
  assert.equal(nodes(h.tree).some(node=>node.type==='studio'||node.type==='portal-search'),false);
  const gate=nodes(h.tree).find(node=>node.type==='gate');assert.ok(gate);gate.props.action.onClick();assert.deepEqual(h.callbacks,[['auth','signIn']]);
 }
});
