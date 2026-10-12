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

function harness(presentation = 'mobile', props = {}) {
  const slots = []; let cursor = 0;
  let layoutEffects = []; let actions=null; let refreshGesture=null;
  const feedArguments = [];
  let reloads = 0;
  let worldVisits = 0;
  let userSearchVisits = 0;
  const density = { columns: 5, setColumns(value) { density.columns = value; }, saveError: null };
  const ownerProfile = { profile: { id: 'owner', projectGridColumns: 5 }, status: 'ready' };
  const feed = { status: 'success', featured: null, projects: [{ project: { id: 'first' }, creator:{id:'owner'} }, { project: { id: 'second' }, creator:{id:'other'} }], isEmpty: false,
    isRefreshing: false, refreshError: null, retry() { reloads++; } };
  const react = { ...React, useCallback: fn => fn, useMemo: fn => fn(), useLayoutEffect(effect) { layoutEffects.push(effect); },
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
    if (name.endsWith('/MobileContextActions')) return { useMobileScreenActions(model) { actions=model; } };
    if (name.endsWith('/useHomePullRefresh')) return {useHomePullRefresh:(_ref,enabled,_busy,refresh)=>{refreshGesture=enabled?refresh:null;return '';}};
    if (name.endsWith('/homeGrid')) return sourceModule('src/components/home/homeGrid.ts',{'../../utils/projectGridDensity':sourceModule('src/utils/projectGridDensity.ts')});
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ viewerProfileId: 'owner',isAuthenticated:true }) };
    if (name.endsWith('/useProjectManagement')) return { useProjectManagement: () => ({ editor: { projectId: null, close() {} }, deletion: { projectId: null, cancel() {} } }) };
    if (name.endsWith('/useProfileGridLayout')) return { useProfileGridLayout: () => ({ ...ownerProfile, layout: ownerProfile.profile }) };
    if (name.endsWith('/useProjectGridDensity')) return { useProjectGridDensity: () => density };
    if (name.endsWith('/useFeed')) return { useFeed(locationId) {
      feedArguments.push(locationId);
      return feed;
    } };
    if (name.endsWith('/projectPresentation')) return { getProjectAspectRatio: () => 1, resolveFeedSpan: () => 1 };
    return new Proxy({}, { get: (_, key) => key });
  } });
  const render = () => {
    cursor = 0; layoutEffects = [];
    return exports.HomeFeed({ isSidebarCollapsed: true, showSearchPlaceholder: true, onExploreWorld() { worldVisits++; }, onSearchUsers() { userSearchVisits++; }, onOpenProject() {}, onOpenCreator() { throw new Error("Account search must not open the viewer profile"); }, ...props });
  };
  return { feedArguments, feed, density, ownerProfile, get actions(){return actions;}, pull(){refreshGesture?.();}, get reloads() { return reloads; }, get worldVisits() { return worldVisits; }, get userSearchVisits() { return userSearchVisits; }, render,
    measureLocation(width) {
      const scroller = nodes(render()).find(node => typeof node.props.onScroll === 'function');
      scroller.ref.current = { querySelector: () => ({ clientWidth: width }) };
      layoutEffects[0]();
    },
  };
}


test('mobile Home uses saved density with a presentation-only fit; desktop retains its exact choice',()=>{
 for(const presentation of ['mobile','web']){const h=harness(presentation);const grid=()=>nodes(h.render()).find(n=>n.type===(presentation==='mobile'?'JustifiedImageWall':'BentoFeedGrid'));assert.equal(grid().props.columns,5);
 for(const count of [2,13,5]){grid().props.onColumnsChange(count);assert.equal(grid().props.columns,count);if(presentation==='mobile')assert.equal(grid().props.fitColumns(count,343),2);}
 h.ownerProfile.status='loading';assert.equal(grid().props.columns,5);const profile=h.ownerProfile.profile;h.ownerProfile.profile=null;assert.equal(grid(),undefined);h.ownerProfile.profile=profile;assert.equal(grid().props.columns,5);
 }
});
test('Home has no pill header and moves discovery callbacks into Actions',()=>{const h=harness();const tree=h.render();assert.equal(nodes(tree).some(n=>n.type==='header'),false);assert.equal(nodes(tree).some(n=>n.props['aria-label']==='Reload Home content'),false);const actions=h.actions.primary;actions.find(a=>a.id==='search').run();actions.find(a=>a.id==='explore').run();assert.equal(h.userSearchVisits,1);assert.equal(h.worldVisits,1);assert.deepEqual(Array.from(actions,a=>a.label),['Search accounts','Explore the world']);assert.ok(nodes(tree).find(n=>n.props['data-home-grid']===''));});
test('Home Actions merge includes the moved globe/account entry and member profile destination',()=>{let profile=0;const shell=actionMap.contextActions('home',{signedIn:true},{handlers:{viewProfile:()=>profile++,explore(){},search(){}}});const screen=actionMap.contextActions('home',{signedIn:true},{handlers:{explore(){},search(){}},labels:{search:'Search accounts',explore:'Explore the world'}});const merged=actionMap.mergeContextActions([screen,shell]);assert.deepEqual(Array.from(merged.primary,a=>a.id),['search','explore','viewProfile']);merged.primary.find(a=>a.id==='viewProfile').run();assert.equal(profile,1);});
test('city retains responsive measurement/local pinch and never receives the Home fit',()=>{const h=harness('mobile',{locationId:'city'});const grid=()=>nodes(h.render()).find(n=>n.type==='JustifiedImageWall');for(const [width,expected] of [[240,2],[390,2],[430,2],[458,3],[600,3]]){h.measureLocation(width);assert.equal(grid().props.columns,expected);assert.equal(grid().props.fitColumns,undefined);}grid().props.onColumnsChange(13);h.measureLocation(390);assert.equal(grid().props.columns,13);assert.equal(h.density.columns,5);const web=nodes(harness('web',{locationId:'city'}).render()).find(n=>n.type==='BentoFeedGrid');assert.equal(web.props.columns,undefined);});
test('empty Home keeps Actions available without recreating the pill row',()=>{const h=harness();h.feed.isEmpty=true;h.feed.projects=[];const tree=h.render();assert.equal(nodes(tree).some(n=>n.type==='header'),false);assert.deepEqual(Array.from(h.actions.primary,a=>a.id),['search','explore']);assert.equal(typeof h.actions.groups.flat().find(a=>a.id==='refresh').run,'function');});
test('refresh gesture retains cards, announces state/errors and rejects a busy request',()=>{const h=harness();h.render();h.pull();assert.equal(h.reloads,1);h.feed.isRefreshing=true;let tree=h.render();h.pull();assert.equal(h.reloads,1);assert.deepEqual(Array.from(nodes(tree).find(n=>n.type==='JustifiedImageWall').props.items,i=>i.key),['first','second']);assert.equal(nodes(tree).find(n=>n.props.role==='status').props.children,'Refreshing Home content.');h.feed.isRefreshing=false;h.feed.refreshError='Could not refresh Home. Please try again.';tree=h.render();assert.equal(nodes(tree).find(n=>n.props.role==='status').props.children,h.feed.refreshError);for(const other of [harness('web'),harness('mobile',{locationId:'city'})]){other.render();other.pull();assert.equal(other.reloads,0);}});
