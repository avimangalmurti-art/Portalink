import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
const actionMap = sourceModule('src/presentation/mobile/contextActions.ts', { 'lucide-react': new Proxy({}, { get: (_, key) => key }) });

function nodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}

function harness(presentation = 'mobile', props = {}, signedIn = true) {
  const slots = []; let cursor = 0;
  let layoutEffects = []; let actions=null; let refreshGesture=null; let readiness=null;
  const feedArguments = [];
  let reloads = 0;
  let worldVisits = 0;
  let userSearchVisits = 0;
  const density = { columns: 5, setColumns(value) { density.columns = value; }, saveError: null };
  const ownerProfile = { profile: { id: 'owner', projectGridColumns: 5 }, status: 'ready' };
  const feed = { status: 'success', featured: null, projects: [{ project: { id: 'first' }, creator:{id:'owner'} }, { project: { id: 'second' }, creator:{id:'other'} }], isEmpty: false,
    isRefreshing: false, refreshError: null, retry() { reloads++; } };
  const react = { ...React, useCallback: fn => fn, useMemo: fn => fn(), useEffect() {}, useLayoutEffect(effect) { layoutEffects.push(effect); },
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/home/HomeFeed.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, { exports, window: { sessionStorage: { getItem: () => null }, addEventListener() {}, removeEventListener() {} }, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('/contextActions')) return actionMap;
    if (name.endsWith('/useProjectReach')) return { useProjectReach() {} };
    if (name === 'react-router-dom') return { useNavigate: () => () => {} };
    if (name.endsWith('/MobileContextActions')) return { MobileContextButton: 'context-button', useMobileScreenActions(model) { actions=model; } };
    if (name.endsWith('/useHomePullRefresh')) return {useHomePullRefresh:(_ref,enabled,_busy,refresh)=>{refreshGesture=enabled?refresh:null;return '';}};
    if (name.endsWith('/useHomeStartupReadiness')) return {useHomeStartupReadiness:options=>{readiness=options;}};
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ viewerProfileId: signedIn ? 'owner' : null,isAuthenticated:signedIn }) };
    if (name.endsWith('/useProjectManagement')) return { useProjectManagement: () => ({ editor: { projectId: null, close() {} }, deletion: { projectId: null, cancel() {} } }) };
    if (name.endsWith('/useProfileGridLayout')) return { useProfileGridLayout: () => ({ ...ownerProfile, layout: signedIn ? ownerProfile.profile : null }) };
    if (name.endsWith('/useProjectGridDensity')) return { useProjectGridDensity: () => density };
    if (name.endsWith('/useFeed')) return { useFeed(locationId) {
      feedArguments.push(locationId);
      return feed;
    } };
    if (name.endsWith('/projectPresentation')) return { getProjectAspectRatio: () => 1, resolveFeedSpan: () => 1 };
    return new Proxy({}, { get: (_, key) => key });
  }, document:{scrollingElement:{scrollTop:0}},requestAnimationFrame:callback=>{callback();return 1;},cancelAnimationFrame(){} });
  const render = () => {
    cursor = 0; layoutEffects = [];
    return exports.HomeFeed({ isSidebarCollapsed: true, showSearchPlaceholder: true, onExploreWorld() { worldVisits++; }, onSearchUsers() { userSearchVisits++; }, onOpenProject() {}, onOpenCreator() { throw new Error("Account search must not open the viewer profile"); }, ...props });
  };
  return { feedArguments, feed, density, ownerProfile, get readiness(){return readiness;}, get actions(){return actions;}, pull(){refreshGesture?.();}, get reloads() { return reloads; }, get worldVisits() { return worldVisits; }, get userSearchVisits() { return userSearchVisits; }, render,
    restoreScroll(){const tree=render();nodes(tree).find(node=>typeof node.props.onScroll==='function').ref.current={scrollTop:0};layoutEffects.slice(0,3).forEach(effect=>effect());},
    measureLocation(width) {
      const scroller = nodes(render()).find(node => typeof node.props.onScroll === 'function');
      scroller.ref.current = { querySelector: () => ({ clientWidth: width }) };
      layoutEffects[0]();
    },
  };
}


test('Explore feed allows the complete Profile density range without a mobile fit restriction',()=>{
 for(const presentation of ['mobile','web']){const h=harness(presentation);const grid=()=>nodes(h.render()).find(n=>n.type===(presentation==='mobile'?'JustifiedImageWall':'BentoFeedGrid'));assert.equal(grid().props.columns,5);
 for(const count of [1,2,13,5]){grid().props.onColumnsChange(count);assert.equal(grid().props.columns,count);assert.equal(grid().props.fitColumns,undefined);}
 h.ownerProfile.status='loading';assert.equal(grid().props.columns,5);const profile=h.ownerProfile.profile;h.ownerProfile.profile=null;assert.equal(grid(),undefined);h.ownerProfile.profile=profile;assert.equal(grid().props.columns,5);
 }
});

test('only startup Home waits for readiness and prioritizes its visible artwork; layout failures show a terminal retry state',()=>{
  for(const presentation of ['mobile','web']){
    const h=harness(presentation,{startupPending:true,startupAttempt:3,onStartupReady(){}});
    let tree=h.render();assert.equal(h.readiness.enabled,true);assert.equal(h.readiness.attempt,3);assert.equal(h.readiness.settled,false);
    let grid=nodes(tree).find(node=>node.type===(presentation==='mobile'?'JustifiedImageWall':'BentoFeedGrid'));
    assert.equal(grid.props.items[0].content.props.priority,false,'Visibility priority waits for the saved scroll position.');
    h.restoreScroll();tree=h.render();grid=nodes(tree).find(node=>node.type===(presentation==='mobile'?'JustifiedImageWall':'BentoFeedGrid'));
    assert.equal(grid.props.items[0].content.props.priority,'viewport');
    h.ownerProfile.profile=null;h.ownerProfile.status='error';h.feed.status='loading';h.feed.projects=[];
    tree=h.render();assert.equal(h.readiness.terminalError,true);
    assert.equal(nodes(tree).some(node=>node.type==='ErrorState'),true);
    assert.equal(nodes(tree).some(node=>node.type==='LoadingState'),false);
  }
  const city=harness('mobile',{startupPending:true,locationId:'city'});city.render();assert.equal(city.readiness.enabled,false);
  const later=harness('mobile');later.render();assert.equal(later.readiness.enabled,false);
});
test('Explore feed restores the top discovery buttons and inline Actions',()=>{const h=harness();const tree=h.render();assert.equal(nodes(tree).some(n=>n.type==='header'),true);assert.equal(nodes(tree).some(n=>n.props['data-inline-screen-actions']===''),true);for(const label of ['Open globe search','Search accounts','Explore categories','Home'])assert.ok(nodes(tree).some(n=>n.props['aria-label']===label));const actions=h.actions.primary;actions.find(a=>a.id==='search').run();actions.find(a=>a.id==='explore').run();assert.equal(h.userSearchVisits,1);assert.equal(h.worldVisits,1);assert.deepEqual(Array.from(actions,a=>a.label),['Search accounts','Explore the world']);assert.ok(nodes(tree).find(n=>n.props['data-home-grid']===''));});
test('Home Actions merge includes the moved globe/account entry and member profile destination',()=>{let profile=0;const shell=actionMap.contextActions('home',{signedIn:true},{handlers:{viewProfile:()=>profile++,explore(){},search(){}}});const screen=actionMap.contextActions('home',{signedIn:true},{handlers:{explore(){},search(){}},labels:{search:'Search accounts',explore:'Explore the world'}});const merged=actionMap.mergeContextActions([screen,shell]);assert.deepEqual(Array.from(merged.primary,a=>a.id),['search','explore','viewProfile']);merged.primary.find(a=>a.id==='viewProfile').run();assert.equal(profile,1);});
test('city retains responsive measurement/local pinch and never receives the Home fit',()=>{const h=harness('mobile',{locationId:'city'});const grid=()=>nodes(h.render()).find(n=>n.type==='JustifiedImageWall');for(const [width,expected] of [[240,2],[390,2],[430,2],[458,3],[600,3]]){h.measureLocation(width);assert.equal(grid().props.columns,expected);assert.equal(grid().props.fitColumns,undefined);}grid().props.onColumnsChange(13);h.measureLocation(390);assert.equal(grid().props.columns,13);assert.equal(h.density.columns,5);const web=nodes(harness('web',{locationId:'city'}).render()).find(n=>n.type==='BentoFeedGrid');assert.equal(web.props.columns,undefined);});
test('empty Explore feed retains top buttons and Actions',()=>{const h=harness();h.feed.isEmpty=true;h.feed.projects=[];const tree=h.render();assert.equal(nodes(tree).some(n=>n.type==='header'),true);assert.deepEqual(Array.from(h.actions.primary,a=>a.id),['search','explore']);assert.equal(typeof h.actions.groups.flat().find(a=>a.id==='refresh').run,'function');});
test('refresh gesture retains cards, announces state/errors and rejects a busy request',()=>{const h=harness();h.render();h.pull();assert.equal(h.reloads,1);h.feed.isRefreshing=true;let tree=h.render();assert.ok(nodes(tree).some(n=>n.props.className==='premium-media-loading-mark' && n.props['aria-hidden']==='true'));h.pull();assert.equal(h.reloads,1);assert.deepEqual(Array.from(nodes(tree).find(n=>n.type==='JustifiedImageWall').props.items,i=>i.key),['first','second']);assert.equal(nodes(tree).find(n=>n.props.role==='status' && !('data-home-pull-feedback' in n.props)).props.children,'Refreshing Home content.');h.feed.isRefreshing=false;h.feed.refreshError='Could not refresh Home. Please try again.';tree=h.render();assert.equal(nodes(tree).find(n=>n.props.role==='status' && !('data-home-pull-feedback' in n.props)).props.children,h.feed.refreshError);for(const other of [harness('web'),harness('mobile',{locationId:'city'})]){other.render();other.pull();assert.equal(other.reloads,0);}});

test('guests can choose every Profile density while keeping changes local',()=>{for(const mode of ['mobile','web']){const h=harness(mode,{},false);const grid=()=>nodes(h.render()).find(n=>n.type===(mode==='mobile'?'JustifiedImageWall':'BentoFeedGrid'));for(const count of [1,2,3,5,13]){grid().props.onColumnsChange(count);assert.equal(grid().props.columns,count);assert.equal(grid().props.fitColumns,undefined);}}});
test('header categories entry opens a separate page without refreshing and restores Explore on Back',()=>{
 const h=harness();const button=label=>nodes(h.render()).find(n=>n.type==='button'&&n.props['aria-label']===label);
 assert.equal(button('Reload Home content'),undefined);
 button('Open globe search').props.onClick();button('Search accounts').props.onClick();button('Explore categories').props.onClick();
 const page=h.render();assert.equal(page.type,'ExploreCategories');assert.equal(h.actions,null);h.pull();assert.equal(h.reloads,0);
 page.props.onBack();h.render();h.pull();assert.equal(h.reloads,1);assert.equal(h.worldVisits,1);assert.equal(h.userSearchVisits,1);
 const web=nodes(harness('web').render());assert.equal(web.some(n=>n.props['aria-label']==='Explore categories'),false);
});
