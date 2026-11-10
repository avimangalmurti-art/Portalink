import { sourceModule } from './helpers/source-module.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import ts from 'typescript';
const actionMap = sourceModule('src/presentation/mobile/contextActions.ts', { 'lucide-react': new Proxy({}, { get: (_, key) => key }) });
const gridDensity = sourceModule('src/utils/projectGridDensity.ts');

function nodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}

function harness(presentation = 'mobile', props = {}) {
  const slots = []; let cursor = 0;
  let screenActive = true;
  let layoutEffects = []; let actions=null; let refreshGesture=null; let readiness=null; let refreshMotion=null;
  const feedArguments = [], feedOptions = [], navigation = [], densityWrites = [];
  let reloads = 0;
  let worldVisits = 0;
  let userSearchVisits = 0;
  const scrollingElement = { scrollTop: 0 };
  const scrollMemory = new Map();
  const density = { columns: 5, setColumns(value) { densityWrites.push(value); density.columns = value; }, saveError: null };
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
  }).outputText, { exports, URLSearchParams, window: { sessionStorage: { getItem: key => scrollMemory.get(key), setItem: (key, value) => scrollMemory.set(key, value) }, addEventListener() {}, removeEventListener() {}, scrollTo() {} }, require(name) {
    if (name === 'react') return react;
    if (name.endsWith('/contextActions')) return actionMap;
    if (name.endsWith('/useProjectReach')) return { useProjectReach() {} };
    if (name === 'react-router-dom') return { useNavigate: () => (...args) => navigation.push(args), useLocation: () => ({ pathname: props.locationId ? `/portalink/${props.locationId}` : '/', search: props.search ?? '', hash: '' }) };
    if (name.endsWith('/app/routes')) return { buildPath: (kind, ids) => kind === 'home' ? '/' : kind === 'portalSearch' ? '/portal-search' : kind === 'profile' ? '/p/' + ids.profileId : '/p/' + ids.profileId + '/c/' + ids.categoryId + '/' + ids.projectId };
    if (name.endsWith('/MobileContextActions')) return { MobileContextButton: 'context-button', useMobileScreenActions(model) { actions=model; } };
    if (name.endsWith('/useHomePullRefresh')) return {useHomePullRefresh:(_ref,enabled,_busy,refresh)=>{refreshGesture=enabled?refresh:null;return '';}};
    if (name.endsWith('/useHomeRefreshMotion')) return {useHomeRefreshMotion:options=>{refreshMotion=options;return {contentRef:{current:null},indicatorRef:{current:null},onPull(){}};}};
    if (name.endsWith('/useHomeStartupReadiness')) return {useHomeStartupReadiness:options=>{readiness=options;}};
    if (name.endsWith('/useMobileFeedRecovery')) return { useMobileFeedRecovery: () => () => {} };
    if (name.endsWith('/useMobileFeedResume')) return { useMobileFeedResume: () => ({ restoring: false, handled: false }) };
    if (name.endsWith('/usePresentation')) return { usePresentation: () => presentation };
    if (name.endsWith('/MobileBackNavigation')) return { useMobileScreenActive: () => screenActive };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ viewerProfileId: 'owner', isAuthenticated: true, user: { id: 'account' } }) };
    if (name.endsWith('/useProjectManagement')) return { useProjectManagement: () => ({ editor: { projectId: null, close() {} }, deletion: { projectId: null, cancel() {} } }) };
    if (name.endsWith('/useProfileGridLayout')) return { useProfileGridLayout: () => ({ ...ownerProfile, layout: ownerProfile.profile }) };
    if (name.endsWith('/useProjectGridDensity')) return { useProjectGridDensity: () => density };
    if (name.endsWith('/useFeed')) return { useFeed(locationId, options) {
      feedArguments.push(locationId);
      feedOptions.push(options);
      return feed;
    } };
    if (name.endsWith('/projectPresentation')) return { getProjectAspectRatio: () => 1, resolveFeedSpan: () => 1 };
    if (name.endsWith('/projectGridDensity')) return gridDensity;
    return new Proxy({}, { get: (_, key) => key });
  }, document:{scrollingElement},requestAnimationFrame:callback=>{callback();return 1;},cancelAnimationFrame(){} });
  const render = () => {
    cursor = 0; layoutEffects = [];
    return exports.HomeFeed({ isSidebarCollapsed: true, showSearchPlaceholder: true, onExploreWorld() { worldVisits++; }, onSearchUsers() { userSearchVisits++; }, onOpenProject() {}, onOpenCreator() { throw new Error("Account search must not open the viewer profile"); }, ...props });
  };
  return { navigation, feedArguments, feedOptions, feed, density, densityWrites, ownerProfile, scrollingElement, scrollMemory, setActive(value){screenActive=value;}, get readiness(){return readiness;}, get refreshMotion(){return refreshMotion;}, get actions(){return actions;}, pull(){refreshGesture?.();}, get reloads() { return reloads; }, get worldVisits() { return worldVisits; }, get userSearchVisits() { return userSearchVisits; }, render,
    restoreScroll(){const tree=render();nodes(tree).find(node=>typeof node.props.onScroll==='function').ref.current={scrollTop:0};layoutEffects.slice(0,3).forEach(effect=>effect());},
    measureLocation(width) {
      const scroller = nodes(render()).find(node => typeof node.props.onScroll === 'function');
      scroller.ref.current = { querySelector: () => ({ clientWidth: width }) };
      layoutEffects[0]();
    },
  };
}

test('opening the active installed Home resets its saved scroll and refreshes a warm feed once', () => {
  for (const refresh of [false, true]) {
    let completions = 0;
    const props = { installedHomeOpening: { refresh, complete() { completions += 1; props.installedHomeOpening = null; } } };
    const h = harness('mobile', props);
    h.scrollingElement.scrollTop = 900;
    h.scrollMemory.set('portalink.feedScroll.home', '900');
    h.setActive(false);
    h.restoreScroll();
    assert.equal(completions, 0, 'A retained Home layer cannot consume the opening');
    assert.equal(h.feedOptions.at(-1).revalidateOnOpen, undefined);
    h.setActive(true);
    h.restoreScroll();
    assert.equal(h.feedOptions.at(-1).revalidateOnOpen, refresh);
    assert.equal(h.scrollingElement.scrollTop, 0);
    assert.equal(h.scrollMemory.get('portalink.feedScroll.home'), '0');
    h.restoreScroll();
    assert.equal(completions, 1);
    assert.equal(h.feedOptions.at(-1).revalidateOnOpen, undefined);
  }
});

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
    assert.equal(h.readiness.settled,false,'Startup still waits for the account’s Weekly Read note after scroll restores.');
    nodes(tree).find(node=>node.type==='WeeklyReadNote').props.onStartupSettled(true);h.render();
    assert.equal(h.readiness.settled,true,'The original feed and note readiness handoff remains available.');
    h.ownerProfile.profile=null;h.ownerProfile.status='error';h.feed.status='loading';h.feed.projects=[];
    tree=h.render();assert.equal(h.readiness.terminalError,true);
    assert.equal(nodes(tree).some(node=>node.type==='ErrorState'),true);
    assert.equal(nodes(tree).some(node=>node.type==='LoadingState'),false);
  }
  const city=harness('mobile',{startupPending:true,locationId:'city'});city.render();assert.equal(city.readiness.enabled,false);
  const later=harness('mobile');later.render();assert.equal(later.readiness.enabled,false);
});
test('Explore retains three discovery buttons without an Actions trigger or sheet registration',()=>{const h=harness();const tree=h.render();assert.equal(nodes(tree).some(n=>n.type==='header'),true);assert.equal(nodes(tree).some(n=>n.props['data-inline-screen-actions']===''||n.type==='context-button'),false);for(const label of ['Open globe search','Search accounts','Home'])assert.ok(nodes(tree).some(n=>n.props['aria-label']===label));nodes(tree).find(n=>n.props['aria-label']==='Search accounts').props.onClick();nodes(tree).find(n=>n.props['aria-label']==='Open globe search').props.onClick();assert.equal(h.userSearchVisits,1);assert.equal(h.worldVisits,1);assert.equal(h.actions,null);assert.ok(nodes(tree).find(n=>n.props['data-home-grid']===''));});
test('the shell suppresses Home action fallback while preserving other screens and WEB',()=>{
 const source=ts.createSourceFile('App.tsx',readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let gate;
 function visit(node){if(ts.isConditionalExpression(node)&&node.whenTrue.kind===ts.SyntaxKind.NullKeyword&&ts.isJsxSelfClosingElement(node.whenFalse)&&node.whenFalse.tagName.getText(source)==='MobileScreenActions')gate=node.condition;ts.forEachChild(node,visit);}visit(source);assert.ok(gate);
 const home={presentation:'mobile',route:{kind:'home'},isOwnerMode:true,isSearchOpen:false,isMessagesOpen:false,isMobileStudioOpen:false,activeProjectId:null};
 const suppressed=changes=>vm.runInNewContext(gate.getText(source),{...home,...changes});
 assert.equal(suppressed({}),true);
 for(const overlay of [{isSearchOpen:true},{isMessagesOpen:true},{isMobileStudioOpen:true},{activeProjectId:'project'},{route:{kind:'profile'}},{route:{kind:'settings'}},{presentation:'web'}])assert.equal(suppressed(overlay),false);
 assert.equal(suppressed({route:{kind:'profile'},isOwnerMode:false}),true,'Another creator profile must not receive shell fallback actions');
});
test('city retains responsive measurement/local pinch and never receives the Home fit',()=>{const h=harness('mobile',{locationId:'city'});const grid=()=>nodes(h.render()).find(n=>n.type==='JustifiedImageWall');for(const [width,expected] of [[240,2],[390,2],[430,2],[458,3],[600,3]]){h.measureLocation(width);assert.equal(grid().props.columns,expected);assert.equal(grid().props.fitColumns,undefined);}grid().props.onColumnsChange(13);h.measureLocation(390);assert.equal(grid().props.columns,13);assert.equal(h.density.columns,5);const web=nodes(harness('web',{locationId:'city'}).render()).find(n=>n.type==='BentoFeedGrid');assert.equal(web.props.columns,undefined);});

test('MOBILE city slider precedes the projects and shares normalized local density with pinch without Home writes',()=>{
 const h=harness('mobile',{locationId:'city-a'}),all=()=>nodes(h.render());
 const control=()=>all().find(node=>node.type==='DensitySeparator'&&node.props.label==='City projects per row');
 const wall=()=>all().find(node=>node.type==='JustifiedImageWall');
 let tree=h.render(),content=nodes(tree).find(node=>'data-feed-scroll-content' in node.props),children=React.Children.toArray(content.props.children);
 assert.equal(children[0].props['data-city-project-density'],'');assert.equal(children[1].type,'section');
 assert.equal(control().props.columns,3,'Before measurement the existing city default is three.');
 assert.equal(wall().props.showDensityControl,false,'The city wall cannot add a second slider.');
 const initialControl=control();assert.equal(initialControl.props.onChange,initialControl.props.onPreview,'A preview and commit update only city-local state.');
 h.measureLocation(390);assert.equal(control().props.columns,2);assert.equal(wall().props.columns,2);
 control().props.onPreview(5.6);assert.equal(control().props.columns,6);assert.equal(wall().props.columns,6);
 control().props.onChange(14);assert.equal(wall().props.columns,13);
 control().props.onChange(0);assert.equal(wall().props.columns,1);
 wall().props.onColumnsChange(4.4);assert.equal(control().props.columns,4);
 h.measureLocation(600);assert.equal(wall().props.columns,4,'Measurement cannot replace a deliberate city choice.');
 assert.deepEqual(h.densityWrites,[]);assert.equal(h.density.columns,5);
 const fresh=harness('mobile',{locationId:'city-b'});assert.equal(nodes(fresh.render()).find(node=>node.props.label==='City projects per row').props.columns,3,'A fresh city view retains its own responsive baseline.');
 fresh.measureLocation(390);assert.equal(nodes(fresh.render()).find(node=>node.props.label==='City projects per row').props.columns,2);
});

test('city loading follows its MOBILE slider while WEB keeps its adaptive grid and no additional city control',()=>{
 const h=harness('mobile',{locationId:'city'});h.feed.status='loading';h.feed.projects=[];
 const all=()=>nodes(h.render()),control=()=>all().find(node=>node.props.label==='City projects per row');
 assert.equal(all().find(node=>node.type==='LoadingState').props.columns,3);
 h.measureLocation(390);assert.equal(all().find(node=>node.type==='LoadingState').props.columns,2);
 control().props.onPreview(7.8);assert.equal(all().find(node=>node.type==='LoadingState').props.columns,8);
 h.feed.status='success';h.feed.projects=[{project:{id:'loaded'},creator:{id:'other'}}];
 assert.equal(all().find(node=>node.type==='JustifiedImageWall').props.columns,8);assert.deepEqual(h.densityWrites,[]);
 const web=harness('web',{locationId:'city'}),webNodes=nodes(web.render());
 assert.equal(webNodes.some(node=>'data-city-project-density' in node.props||node.props.label==='City projects per row'),false);
 const grid=webNodes.find(node=>node.type==='BentoFeedGrid');assert.equal(grid.props.columns,undefined);assert.equal(grid.props.onColumnsChange,undefined);
 const home=nodes(harness('mobile').render());assert.equal(home.some(node=>'data-city-project-density' in node.props),false);
 assert.equal(home.find(node=>node.type==='JustifiedImageWall').props.showDensityControl,undefined,'Home wall behavior is unchanged.');
});
test('empty Explore feed retains its three top buttons without an Actions sheet',()=>{const h=harness();h.feed.isEmpty=true;h.feed.projects=[];const tree=h.render();assert.equal(nodes(tree).some(n=>n.type==='header'),true);assert.equal(nodes(tree).filter(n=>n.props.className==='mobile-home-header-button').length,3);assert.equal(h.actions,null);});
test('refresh gesture retains cards and its fixed spinner while announcing only real refresh state',()=>{
  const h=harness();let tree=h.render();
  const indicator=nodes(tree).find(n=>'data-home-pull-feedback' in n.props);
  assert.ok(indicator);assert.equal(indicator.type,'span');assert.equal(indicator.props['aria-hidden'],'true');
  assert.equal(indicator.props.role,undefined);assert.equal(indicator.props['data-active'],undefined);
  h.pull();assert.equal(h.reloads,1,'A qualifying pull requests content immediately');
  h.feed.isRefreshing=true;tree=h.render();
  const refreshingIndicator=nodes(tree).find(n=>'data-home-pull-feedback' in n.props);
  assert.equal(refreshingIndicator.type,indicator.type);assert.equal(refreshingIndicator.key,indicator.key);assert.equal(refreshingIndicator.props.className,indicator.props.className);
  assert.equal(refreshingIndicator.props['data-active'],'true');
  assert.ok(nodes(tree).some(n=>n.props.className==='premium-media-loading-mark' && n.props['aria-hidden']==='true'));
  h.pull();assert.equal(h.reloads,1);
  assert.deepEqual(Array.from(nodes(tree).find(n=>n.type==='JustifiedImageWall').props.items,i=>i.key),['first','second']);
  const status=nodes(tree).find(n=>n.props.role==='status');
  assert.equal(status.props.children,'Refreshing Home content.');assert.equal(status.props.className,'sr-only','Refresh feedback cannot add a visible text row');
  assert.equal(h.refreshMotion.enabled,true);assert.equal(h.refreshMotion.refreshing,true);
  h.feed.isRefreshing=false;tree=h.render();
  const complete=nodes(tree).find(n=>n.props.role==='status');
  assert.equal(complete.props.children,'Home content refreshed.');assert.equal(complete.props.className,'sr-only');
  assert.equal(h.refreshMotion.refreshing,false,'Completion reaches motion immediately, without waiting for a spring');
  for(const other of [harness('web'),harness('mobile',{locationId:'city'})]){
    other.render();other.pull();assert.equal(other.reloads,0);assert.equal(other.refreshMotion.enabled,false);
  }
});

test('a failed Home refresh exposes its real error immediately, preserves cards and permits a fresh explicit retry',()=>{
  const h=harness();h.render();h.pull();h.feed.isRefreshing=true;h.render();
  h.feed.isRefreshing=false;h.feed.refreshError='Could not refresh Home. Please try again.';
  const tree=h.render(),status=nodes(tree).find(n=>n.props.role==='status');
  assert.equal(status.props.children,h.feed.refreshError);assert.notEqual(status.props.className,'sr-only');
  assert.equal(h.refreshMotion.refreshing,false,'A failure releases the held spinner independently of return animation');
  assert.deepEqual(Array.from(nodes(tree).find(n=>n.type==='JustifiedImageWall').props.items,i=>i.key),['first','second']);
  h.pull();assert.equal(h.reloads,2,'A failed request leaves the existing pull retry available');
});

test('obsolete guest view parameters cannot select a preview or bypass signed-in Home readiness',()=>{
 for(const mode of ['mobile','web'])for(const search of ['?guest=home','?guest=profile','?guest=world','?guest=search&q=Portal']){
  const h=harness(mode,{search,startupPending:true}),tree=h.render(),all=nodes(tree);
  assert.equal(tree.type,'div');assert.equal(all.some(node=>node.type==='GuestHomePreview'||'data-guest-home' in node.props),false);
  const grid=all.find(node=>node.type===(mode==='mobile'?'JustifiedImageWall':'BentoFeedGrid'));
  assert.deepEqual(Array.from(grid.props.items,item=>item.key),['first','second']);
  assert.equal(h.readiness.projectCount,2);assert.equal(h.readiness.settled,false);
  assert.equal(tree.props.onViewChange,undefined);assert.equal(tree.props.onQueryChange,undefined);
  assert.deepEqual(h.navigation,[],'Rendering the account feed cannot generate a guest destination.');
 }
});
test('Explore omits the duplicate portal-search shortcut while preserving its three destinations and WEB layout',()=>{
 const h=harness();const button=label=>nodes(h.render()).find(n=>n.type==='button'&&n.props['aria-label']===label);
 assert.equal(button('Reload Home content'),undefined);
 button('Open globe search').props.onClick();button('Search accounts').props.onClick();
 assert.equal(button('Search public portals'),undefined);
 button('Home').props.onClick();assert.deepEqual(h.navigation,[['/']]);
 assert.equal(h.reloads,0);assert.equal(h.actions,null);
 assert.equal(nodes(h.render()).filter(node=>node.props.className==='mobile-home-header-button').length,3);
 assert.equal(nodes(h.render()).some(node=>node.type==='ExploreCategories'),false,'The entry cannot open the unavailable category preview');
 h.setActive(false);h.render();h.pull();assert.equal(h.reloads,0,'Outgoing Home cannot refresh behind the portal directory');
 h.setActive(true);h.render();h.pull();assert.equal(h.reloads,1,'Returning to Explore retains its pull-refresh behavior');
 assert.equal(h.worldVisits,1);assert.equal(h.userSearchVisits,1);
 const web=harness('web');assert.equal(nodes(web.render()).some(node=>node.props['aria-label']==='Search public portals'),false);assert.deepEqual(web.navigation,[]);
});

test('mobile Home separator controls existing grid density without adding a WEB control',()=>{
 const h=harness();const slider=()=>nodes(h.render()).find(n=>n.props.label==='Home content per row');assert.ok(slider());
 slider().props.onChange(7);assert.equal(slider().props.columns,7);assert.equal(nodes(h.render()).find(n=>n.type==='JustifiedImageWall').props.columns,7);
 assert.equal(nodes(harness('web').render()).some(n=>n.props.label==='Home content per row'),false);
});
