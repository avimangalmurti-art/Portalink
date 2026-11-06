import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sourceModule} from './helpers/source-module.mjs';
const sections=sourceModule('src/components/settings/settingsSections.ts');
const props={theme:'dark',appearanceMode:'dark',systemGray:'gray',accentColor:'#0a84ff',highContrast:false,reduceTranslucency:false,onBack(){/* Navigation is supplied by the relevant test. */},onOpenProfile(){/* Profile actions are supplied by the relevant test. */}};
const all=node=>React.isValidElement(node)?[node,...React.Children.toArray(node.props.children).flatMap(all)]:[];
function expand(node){if(!React.isValidElement(node))return node;if(node.type.name==='SettingsSection')return expand(node.type(node.props));return React.cloneElement(node,{},...React.Children.toArray(node.props.children).map(expand));}
const action=(tree,label)=>all(tree).find(n=>n.type==='button'&&typeof n.props.onClick==='function'&&(n.props['aria-label']===label||all(n).some(c=>c.props.children===label||React.Children.toArray(c.props.children).some(child=>typeof child==='string'&&child.trim()===label))));
function harness(auth={},query='',routeState=null,presentation='mobile',pathname='/settings'){let params=new URLSearchParams(query),state=routeState,cursor=0,idx=1;const slots=[],calls=[],stack=[];const location={pathname,search:query?'?'+query:'',state};
 const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];}};
 const nav={back:()=>calls.push(['back']),to:path=>calls.push(['to',path]),profileEditor:()=>calls.push(['edit'])};
 const {ControlCenterPage}=sourceModule('src/components/ControlCenterPage.tsx',{react,'lucide-react':{ArrowLeftIcon:'back',ChevronRightIcon:'right'},'react-router-dom':{useLocation:()=>location,useNavigate:()=>value=>{calls.push(['navigate',value]);if(value===-1){const prev=stack.pop();params=prev.params;location.search=prev.search;state=location.state=prev.state;idx--; }},useSearchParams:()=>[params,(next,options={})=>{calls.push(['params',next.toString(),options]);if(!options.replace){stack.push({params,search:location.search,state});idx++;}params=next;location.search=next.toString()?'?'+next:'';state=location.state=options.state;}]},'./settings/settingsSections':sections,'./settings/NavigationButtonsPanel':{NavigationButtonsPanel:'appearance-panel'},'./auth/ProfessionalEntry':{ProfessionalEntry:'professional-entry'},'./ui/InterfaceIcon':{InterfaceIcon:()=>null},'./ui/Button':{Button:'button'},'../contexts/AuthContext':{useAuth:()=>auth},'../app/useAppRoute':{useRouteNavigator:()=>nav},'../app/routes':{buildPath:name=>'/'+name},'../features/auth/AccountSecurityPage':{AccountSecurityPage:'security-page'},'../features/auth/DeleteAccountDialog':{DeleteAccountDialog:'delete-dialog'},'../features/citations/publicOrigin':{PUBLIC_ORIGIN:'https://portalink.test'},'../presentation/usePresentation':{usePresentation:()=>presentation},'../features/install/MobileHomeScreenInstall':{MobileHomeScreenInstall:'install-guidance'},'./settings/settings-page.css':{}},{window:{history:{get state(){return{idx};}}},DOMException});
 return{calls,location,render(overrides={}){cursor=0;return expand(ControlCenterPage({...props,...overrides}));},get section(){return params.get('section');}};
}
test('MOBILE Settings starts with seven navigation rows and right chevrons, never accordions',()=>{
 for(const isAuthenticated of [false,true]){const h=harness({isAuthenticated}),html=renderToStaticMarkup(h.render());assert.match(html,/<h1>Settings<\/h1>/);assert.equal((html.match(/settings-section-trigger/g)||[]).length,7);assert.doesNotMatch(html,/aria-expanded|aria-controls|role="dialog"|appearance-panel|settings-section-content/);for(const title of ['Appearance','Account','Invite a friend','Privacy','Notifications','Language','About'])assert.ok(html.includes(title));}
});
test('every section has a URL, mounts only its own content, and Back restores Settings and caller state',()=>{
 for(const [id,title]of [['appearance','Appearance'],['account','Account'],['invite','Invite a friend'],['privacy','Privacy'],['notifications','Notifications'],['language','Language'],['about','About']]){const state={settingsReturn:'/share/creator'};const h=harness({isAuthenticated:false},'source=profile',state);action(h.render(),title).props.onClick();assert.equal(h.section,id);assert.equal(h.location.state.settingsReturn,state.settingsReturn);const html=renderToStaticMarkup(h.render());assert.match(html,new RegExp('<h1>'+title+'</h1>'));assert.equal((html.match(/settings-section-content/g)||[]).length,1);assert.doesNotMatch(html,/settings-section-trigger|aria-expanded/);action(h.render(),'Back to Settings').props.onClick();assert.equal(h.section,null);assert.equal(h.location.search,'?source=profile');assert.equal(h.location.state.settingsReturn,state.settingsReturn);assert.equal(h.calls.at(-1)[1],-1);}
});
test('direct sub-screen links return to Settings instead of leaving the app; unknown sections fail to the list',()=>{
 const h=harness({},'section=about');action(h.render(),'Back to Settings').props.onClick();assert.equal(h.section,null);assert.equal(h.calls.at(-1)[2].replace,true);const invalid=harness({},'section=not-a-screen');assert.match(renderToStaticMarkup(invalid.render()),/<h1>Settings<\/h1>/);
});
test('guest private destinations retain their auth gate in routed sub-screens',()=>{
 const calls=[];for(const [section,label,path]of [['privacy','Open messages','/messages'],['notifications','View notifications','/notifications']]){const h=harness({isAuthenticated:false,requestAuthenticatedDestination:intent=>calls.push(intent)},'section='+section);action(h.render(),label).props.onClick();assert.equal(calls.at(-1).path,path);assert.equal(calls.at(-1).kind,'route');assert.equal(h.calls.length,0);}
});
test('Account retains guest sign-in/signup and owner profile/edit actions',()=>{
 const calls=[];const guest=harness({isAuthenticated:false,requestAuth:view=>calls.push(view),requestAuthenticatedDestination:(_intent,view)=>calls.push(view)},'section=account');action(guest.render(),'Sign in').props.onClick();action(guest.render(),'Create account').props.onClick();assert.deepEqual(calls,['signIn','signUp']);const owner=harness({isAuthenticated:true,viewerProfileId:'owner'},'section=account');action(owner.render({onOpenProfile:()=>calls.push('profile')}),'View profile').props.onClick();action(owner.render(),'Edit profile').props.onClick();assert.equal(calls.at(-1),'profile');assert.equal(owner.calls.at(-1)[0],'edit');
});

test('nested Appearance rows route to controls and Back traverses both levels without losing caller state',()=>{
 for(const panel of ['system-grey','appearance']){const h=harness({},'',{settingsReturn:'/share/creator'});action(h.render(),'Appearance').props.onClick();all(h.render()).find(n=>n.type==='appearance-panel').props.onSectionOpen(panel);assert.ok(h.location.search.includes('panel='+panel));assert.equal(all(h.render()).find(n=>n.type==='appearance-panel').props.selectedSection,panel);action(h.render(),'Back to Appearance').props.onClick();assert.equal(h.location.search,'?section=appearance');assert.equal(h.location.state.settingsReturn,'/share/creator');action(h.render(),'Back to Settings').props.onClick();assert.equal(h.location.search,'');}
 const direct=harness({},'section=appearance&panel=system-grey');action(direct.render(),'Back to Appearance').props.onClick();assert.equal(direct.location.search,'?section=appearance');action(direct.render(),'Back to Settings').props.onClick();assert.equal(direct.location.search,'');
});

test('Account security remains reachable and Back preserves the Account sub-screen',()=>{const h=harness({isAuthenticated:true,viewerProfileId:'owner'},'section=account',{settingsReturn:'/studio'});action(h.render(),'Account security').props.onClick();assert.equal(h.location.search,'?section=account&security=1');assert.equal(h.location.state.settingsReturn,'/studio');const security=all(h.render()).find(n=>n.type==='security-page');assert.ok(security);security.props.onBack();assert.equal(h.calls.at(-1)[0],'back');const direct=harness({},'section=account&security=1');all(direct.render()).find(n=>n.type==='security-page').props.onBack();assert.equal(direct.location.search,'?section=account');});

test('Home Screen guidance mounts only within MOBILE About, leaving WEB and the Settings list unchanged',()=>{
 for(const presentation of ['web','mobile'])for(const query of ['', 'section=about', 'section=account']){
  const tree=harness({},query,null,presentation).render();
  assert.equal(all(tree).some(node=>node.type==='install-guidance'),presentation==='mobile'&&query==='section=about');
 }
});

const sharedProps={sharedReadOnly:true};
const privateActions=['View profile','Edit profile','Account security','Log out','Delete account…','Account visibility','Open messages','View notifications'];
function sharedAuth(role='guest'){
 const calls=[];const auth={isAuthenticated:role!=='guest',isInitializing:false,viewerProfileId:role==='guest'?null:role,user:role==='guest'?null:{id:`account-${role}`},
  requestAuth:view=>calls.push(['auth',view]),requestAuthenticatedDestination:(...args)=>calls.push(['gate',...args]),signOut:()=>{calls.push(['signOut']);return Promise.resolve(true);}};
 return{auth,calls};
}
const companyEntry=tree=>all(tree).find(node=>node.type==='professional-entry');
function assertPublicOnly(tree){
 for(const label of privateActions)assert.equal(action(tree,label),undefined,label);
 assert.equal(all(tree).some(node=>node.type==='security-page'||node.type==='delete-dialog'),false);
}

test('shared Settings offers only public sections for guests, owners and other signed-in accounts on both presentations',()=>{
 for(const presentation of ['web','mobile'])for(const role of ['guest','owner','other']){
  const a=sharedAuth(role),h=harness(a.auth,'settings=1',null,presentation,'/creator'),tree=h.render(sharedProps);
  const rows=all(tree).filter(node=>node.type==='button'&&node.props.className==='settings-section-trigger');
  assert.deepEqual(rows.map(row=>all(row).find(node=>node.props.className==='settings-section-title').props.children),['Appearance','Invite a friend','Language','About']);
  assertPublicOnly(tree);assert.equal(companyEntry(tree),undefined);
  assert.deepEqual(a.calls,[]);assert.deepEqual(h.calls,[]);
  assert.equal(a.auth.isAuthenticated,role!=='guest');
 }
});

test('shared About and private/security query links reuse company entry independently of the restored account',()=>{
 for(const presentation of ['web','mobile'])for(const role of ['guest','owner','other'])for(const query of [
  'section=about','section=account','section=privacy','section=notifications','security=1','section=account&security=1','section=appearance&panel=system-grey&security=1',
 ]){
  const a=sharedAuth(role),session=a.auth.user,h=harness(a.auth,`settings=1&${query}`,{settingsReturn:'/creator'},presentation,'/creator');
  const tree=h.render({...sharedProps,onOpenProfile:()=>a.calls.push(['profile'])}),entry=companyEntry(tree);
  assert.ok(entry,`${presentation}/${role}/${query}`);assert.equal(entry.props.ready,true);
  assert.equal(all(tree).find(node=>node.type==='h1').props.children,presentation==='web'?'Settings':'About Portalink');
  assertPublicOnly(tree);assert.deepEqual(a.calls,[]);assert.deepEqual(h.calls,[]);
  entry.props.onSignIn();entry.props.onCreate();
  assert.deepEqual(a.calls,[['auth','signIn'],['auth','signUp']], 'Only explicit account choices request forms; no workspace intent or logout is introduced');
  assert.deepEqual(h.calls,[]);assert.equal(a.auth.user,session);assert.equal(a.auth.isAuthenticated,role!=='guest');
 }
});

test('MOBILE shared legacy security Back clears private routing and panels without reopening the same landing',()=>{
 for(const presentation of ['mobile'])for(const query of ['section=account','section=privacy','section=notifications','security=1','section=account&security=1','section=appearance&panel=system-grey&security=1']){
  const a=sharedAuth('owner'),h=harness(a.auth,`settings=1&via=link&${query}`,{settingsReturn:'/creator',settingsSectionFrom:'/creator?settings=1&via=link',accountSecurityReturn:true},presentation,'/creator');
  let returned=0;
  action(h.render({...sharedProps,onBack:()=>returned++}),'Back to Settings').props.onClick();
  assert.equal(h.location.search,'?settings=1&via=link');assert.equal(h.section,null);
  assert.equal(h.calls.at(-1)[0],'params');assert.equal(h.calls.at(-1)[2].replace,true);
  assert.equal(h.location.state.settingsReturn,'/creator');assert.equal(returned,0);
  const index=h.render({...sharedProps,onBack:()=>returned++});
  assert.equal(companyEntry(index),undefined);assertPublicOnly(index);
  action(index,'Back').props.onClick();assert.equal(returned,1);
  assert.deepEqual(a.calls,[]);
 }
});

test('shared About expands in WEB Settings and retains its native MOBILE Back destination',()=>{
 for(const presentation of ['web','mobile']){
  const a=sharedAuth('owner'),h=harness(a.auth,'settings=1&via=link',{settingsReturn:'/creator'},presentation,'/creator');
  action(h.render(sharedProps),'About').props.onClick();
  assert.equal(h.section,'about');assert.ok(companyEntry(h.render(sharedProps)));
  action(h.render(sharedProps),presentation==='web'?'About':'Back to Settings').props.onClick();
  assert.equal(h.location.search,'?settings=1&via=link');assert.equal(h.calls.at(-1)[0],presentation==='web'?'params':'navigate');
  if(presentation==='web')assert.equal(h.calls.at(-1)[2].replace,true);else assert.equal(h.calls.at(-1)[1],-1);
  assert.equal(h.location.state.settingsReturn,'/creator');assert.equal(companyEntry(h.render(sharedProps)),undefined);
  assert.deepEqual(a.calls,[]);
 }
});

test('shared public sections retain appearance callbacks and ordinary public content without private actions',()=>{
 for(const presentation of ['web','mobile']){
  const a=sharedAuth('owner'),h=harness(a.auth,'settings=1&section=appearance',null,presentation,'/creator'),changes=[];
  let tree=h.render({...sharedProps,onAccentColorChange:value=>changes.push(value)});
  all(tree).find(node=>node.type==='appearance-panel').props.onAccentColorChange('#123456');assert.deepEqual(changes,['#123456']);
  assertPublicOnly(tree);assert.equal(companyEntry(tree),undefined);
  tree=harness(a.auth,'settings=1&section=language',null,presentation,'/creator').render(sharedProps);
  assert.match(renderToStaticMarkup(tree),/currently available in English/);assertPublicOnly(tree);
  tree=harness(a.auth,'settings=1&section=invite',null,presentation,'/creator').render(sharedProps);
  assert.ok(action(tree,'Share invite link'));assert.ok(action(tree,'Copy invite link'));assertPublicOnly(tree);
  assert.deepEqual(a.calls,[]);
 }
});

test('shared company entry waits for session restoration and never retains a previously open delete dialog',()=>{
 const a=sharedAuth('owner');a.auth.isInitializing=true;
 const h=harness(a.auth,'section=account');
 action(h.render(),'Delete account…').props.onClick();assert.ok(all(h.render()).some(node=>node.type==='delete-dialog'));
 const tree=h.render(sharedProps);assert.equal(companyEntry(tree).props.ready,false);assertPublicOnly(tree);
 assert.deepEqual(a.calls,[]);assert.deepEqual(h.calls,[]);
});

test('WEB Settings expands every section in place, retains all headers and replaces only its query state',()=>{
 for(const [id,title] of [['appearance','Appearance'],['account','Account'],['invite','Invite a friend'],['privacy','Privacy'],['notifications','Notifications'],['language','Language'],['about','About']]){
  const state={settingsReturn:'/studio'},h=harness({},'via=profile',state,'web');
  const initial=h.render();assert.equal(all(initial).filter(n=>n.props.className==='settings-section-trigger').length,7);
  action(initial,title).props.onClick();
  const opened=h.render(),trigger=action(opened,title);
  assert.equal(h.section,id);assert.equal(trigger.props['aria-expanded'],true);assert.equal(trigger.props['aria-controls'],`settings-${id}-content`);
  assert.equal(all(opened).filter(n=>n.props.className==='settings-section-trigger').length,7);
  assert.equal(all(opened).find(n=>n.type==='h1').props.children,'Settings');
  assert.equal(all(opened).filter(n=>n.props.className==='settings-section-content').length,1);
  assert.equal(h.calls.at(-1)[2].replace,true);assert.equal(h.location.state,state);
  trigger.props.onClick();assert.equal(h.section,null);assert.equal(h.location.search,'?via=profile');
  assert.equal(action(h.render(),title).props['aria-expanded'],false);assert.equal(h.calls.at(-1)[2].replace,true);
 }
});

test('WEB nested Appearance controls toggle beneath retained headers and Back exits Settings directly',()=>{
 const h=harness({},'section=appearance', {settingsReturn:'/portalite'},'web');let backs=0;
 for(const panel of ['system-grey','appearance']){
  const appearance=all(h.render()).find(n=>n.type==='appearance-panel');assert.equal(appearance.props.inline,true);
  appearance.props.onSectionOpen(panel);assert.equal(all(h.render()).find(n=>n.type==='appearance-panel').props.selectedSection,panel);
  assert.equal(h.calls.at(-1)[2].replace,true);assert.equal(all(h.render()).find(n=>n.type==='h1').props.children,'Settings');
  all(h.render()).find(n=>n.type==='appearance-panel').props.onSectionOpen(panel);assert.equal(h.location.search,'?section=appearance');
 }
 action(h.render({onBack:()=>backs++}),'Back').props.onClick();assert.equal(backs,1);assert.equal(h.location.search,'?section=appearance');
});

test('WEB Account security is an inline disclosure for owners and direct guest links',()=>{
 const owner=harness({isAuthenticated:true,viewerProfileId:'owner',user:{id:'owner'}},'section=account',{settingsReturn:'/studio'},'web');
 action(owner.render(),'Account security').props.onClick();const tree=owner.render();
 assert.equal(all(tree).find(n=>n.type==='h1').props.children,'Settings');assert.equal(all(tree).filter(n=>n.props.className==='settings-section-trigger').length,7);
 assert.equal(action(tree,'Account security').props['aria-expanded'],true);
 assert.ok(all(tree).find(n=>n.props.id==='settings-account-security-content'));assert.equal(owner.calls.at(-1)[2].replace,true);
 all(tree).find(n=>n.type==='security-page').props.onBack();assert.equal(owner.location.search,'?section=account');assert.equal(owner.calls.at(-1)[2].replace,true);
 const guest=harness({isAuthenticated:false},'security=1',null,'web'),guestTree=guest.render();
 assert.equal(action(guestTree,'Account').props['aria-expanded'],true);assert.ok(all(guestTree).find(n=>n.type==='security-page'));
 action(guestTree,'Account').props.onClick();assert.equal(guest.location.search,'');assert.equal(all(guest.render()).some(n=>n.type==='security-page'),false);
});

test('WEB shared legacy private links expand public About without exposing account controls',()=>{
 for(const query of ['section=account','section=privacy','section=notifications','security=1','section=account&security=1']){
  const a=sharedAuth('owner'),h=harness(a.auth,`settings=1&via=link&${query}`,{settingsReturn:'/portalite'},'web','/portalite'),tree=h.render(sharedProps);
  assertPublicOnly(tree);assert.equal(all(tree).find(n=>n.type==='h1').props.children,'Settings');assert.equal(action(tree,'About').props['aria-expanded'],true);
  assert.equal(all(tree).filter(n=>n.props.className==='settings-section-trigger').length,4);assert.ok(companyEntry(tree));
  action(tree,'About').props.onClick();assert.equal(h.location.search,'?settings=1&via=link');assert.equal(companyEntry(h.render(sharedProps)),undefined);assert.deepEqual(a.calls,[]);
 }
});

function appearanceTree(inline,selectedSection=null,opened=[]){
 const react={...React,useState:initial=>[initial,()=>{}],useId:()=> 'appearance-switch'};
 const {NavigationButtonsPanel}=sourceModule('src/components/settings/NavigationButtonsPanel.tsx',{react,
  'framer-motion':{useReducedMotion:()=>false},'lucide-react':{CheckIcon:'check',ChevronRightIcon:'right',RotateCcwIcon:'reset'},
  '../../utils/radioGroupKeyboard':{handleRadioGroupKeyDown(){}},'../../data/navButtonTokens':{findNavAccent:()=>({id:'pink',label:'Pink',light:'#ff375f',dark:'#ff375f'}),findSystemGray:()=>({label:'System Gray 6'}),isLightSurface:()=>false,navAccents:[],systemGrays:[]},
  '../ui/InterfaceIcon':{InterfaceIcon:()=>null},'../ui/AppearanceSwitch':{AppearanceSwitch:'appearance-switch'},'../ui/ResizablePanelHandle':{resetResizablePanelLayout(){}}
 });
 function expandAppearance(node){if(!React.isValidElement(node))return node;if(node.type.name==='AppearanceNavigationSection')return expandAppearance(node.type(node.props));return React.cloneElement(node,{},...React.Children.toArray(node.props.children).map(expandAppearance));}
 return expandAppearance(NavigationButtonsPanel({...props,inline,selectedSection,onSectionOpen:id=>opened.push(id)}));
}

test('Appearance dropdowns retain both WEB headers and Reset layout while MOBILE keeps routed replacement',()=>{
 for(const selected of [null,'system-grey','appearance']){
  const opened=[],tree=appearanceTree(true,selected,opened),dropdowns=all(tree).filter(n=>n.props['data-appearance-dropdown']);
  assert.equal(dropdowns.length,2);assert.ok(action(tree,'Reset layout'));
  for(const [id,title]of [['system-grey','System grey'],['appearance','Appearance']]){
   const trigger=action(dropdowns.find(n=>n.props['data-appearance-dropdown']===id),title);assert.equal(trigger.props['aria-expanded'],selected===id);trigger.props.onClick();assert.equal(opened.at(-1),id);
  }
  const mobile=appearanceTree(false,selected),html=renderToStaticMarkup(mobile);assert.doesNotMatch(html,/aria-expanded|aria-controls|data-appearance-dropdown/);
  if(selected)assert.equal(all(mobile).some(n=>n.props.id===`${selected==='system-grey'?'system-grey':'appearance'}-settings-content`),true);
 }
});
