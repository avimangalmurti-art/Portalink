import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';
const nodes = n => React.isValidElement(n) ? [n, ...React.Children.toArray(n.props.children).flatMap(nodes)] : [];
test('Studio header exposes Bookmarks without New project or Insights', () => {
 const { StudioWorkbenchHeader } = sourceModule('src/features/studio/StudioWorkbenchView.tsx', {
 'react': React, '../../presentation/mobile/MobileContextActions': { MobileContextButton: 'actions' },
 'lucide-react': {}, '../../components/media/ProjectCover': {}, './StudioRow': {}, './StudioActionSheet': {},
 './workbenchModel': {}, './studio-workbench.css': {},
 });
 let opened = false;
 const tree = StudioWorkbenchHeader({ onBookmarks: () => { opened = true; }, onReads() {}, workspace: { onContinue() {} } });
 assert.deepEqual(nodes(tree).filter(n => n.type === 'strong').map(n => n.props.children), ['Bookmarks']);
 nodes(tree).find(n => n.type === 'button').props.onClick();
 assert.equal(opened, true);
});

test('mobile Drafts restores Back while WEB retains its existing navigation', () => {
 const slots=[];let cursor=0,presentation='web';
 const react = {...React,useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];}};
 const {StudioDraftsList} = sourceModule('src/features/studio/StudioDraftsList.tsx',{
  react,
  'react-dom':{createPortal:(children,host)=>React.createElement('header-portal',{host},children)},
  'lucide-react':{ChevronLeftIcon:'chevron'},
  '../../components/ui/ModalPortal':{ModalPortal:'modal'},
  '../../components/publishing/ProjectFormDialog':{ProjectDiscardConfirmation:'confirmation'},
  '../../presentation/usePresentation':{usePresentation:()=>presentation},
  './StudioEmptyState':{StudioEmptyState:'empty'},
  '../../presentation/mobile/MobileContextActions':{MobileContextButton:'actions',useMobileScreenActions(){}},
  '../../presentation/mobile/contextActions':{contextActions:kind=>({kind})},
 });
 const calls=[],host={};
 const props={drafts:[{id:'draft-one',metadata:{title:'A real draft'},stage:'details',createdAt:'2026-10-18T00:00:00Z'}],onBack(){calls.push('back');},onResume(){calls.push('resume');},onDiscard:async()=>{},onBookmarks(){},onReads(){}};
 const render=overrides=>{cursor=0;presentation=overrides?.headerHost?'mobile':'web';return nodes(StudioDraftsList({...props,...overrides}));};
 let mobile=render({headerHost:host});
 const portal=mobile.find(n=>n.type==='header-portal');
 assert.equal(portal.props.host,host);
 assert.ok(nodes(portal).some(n=>n.props['aria-label']==='Back from Drafts'));
 const select=mobile.find(n=>n.type==='button'&&n.props.children==='Select');
 assert.equal(select.props.disabled,false);
 select.props.onClick();
 mobile=render({headerHost:host});
 assert.ok(mobile.some(n=>n.type==='button'&&n.props.children==='Done'));
 mobile.find(n=>n.type==='button'&&n.props['aria-pressed']===false&&n.props.className!=='studio-drafts-control').props.onClick();
 mobile=render({headerHost:host});
 assert.equal(mobile.find(n=>n.type==='li').props['data-selected'],true);
 mobile.find(n=>n.props['aria-label']==='Back from Drafts').props.onClick();
 mobile=render({headerHost:host});
 assert.ok(mobile.some(n=>n.type==='button'&&n.props.children==='Select'));
 assert.equal(mobile.some(n=>n.props['aria-label']==='Selected draft actions'),false);
 assert.deepEqual(calls,[],'Back exits selection before leaving Drafts.');
 mobile.find(n=>n.props['aria-label']==='Back from Drafts').props.onClick();
 assert.deepEqual(calls,['back']);
 const web=render({headerHost:undefined});
 assert.equal(web.some(n=>n.type==='header-portal'),false);
 const webBack=web.find(n=>n.props['aria-label']==='Back from Drafts');
 assert.ok(webBack);
 assert.deepEqual(React.Children.toArray(webBack.props.children.props.children),['← ','Studio']);
});

test('mobile Studio starts on Insights, and selecting Drafts switches the content with consistent header controls', () => {
 let params=new URLSearchParams(), mobile=true, registered;
 const effects=[],paramWrites=[],navigations=[];
 let workbench={data:{profile:{projects:[{id:'real-work-fixture'}]},drafts:[]},retry(){}};
 const react={...React,useEffect:effect=>effects.push(effect),useMemo:fn=>fn(),useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]};
 const imports={
  react,'react-router-dom':{useLocation:()=>({state:{}}),useNavigate:()=>((path,options)=>navigations.push({path,options})),useSearchParams:()=>[params,(next,options)=>{params=new URLSearchParams(next);paramWrites.push({params,options});}]},
  'lucide-react':{ChevronLeftIcon:'chevron'},
  '../../presentation/usePresentation':{usePresentation:()=>mobile?'mobile':'web'},
  '../library/PersonalPages':{InsightsPage:'insights'},
  '../citations/StudioCitations':{StudioCitations:'citations'},
  '../sharing/InternalContentShare':{useInternalContentShare:()=>()=>{}},
  '../../contexts/AuthContext':{useAuth:()=>({viewerProfileId:'owner',user:{id:'account'},isAuthenticated:true})},
  '../../contexts/ServicesContext':{useServices:()=>({})},
  '../../presentation/mobile/MobileBackNavigation':{ScreenBack:'screen-back'},
  '../../presentation/mobile/MobileContextActions':{useMobileScreenActions(model){registered=model;}},
  '../../presentation/mobile/contextActions':{contextActions:kind=>({kind})},
  '../../components/ui/StateViews':{LoadingState:'loading',ErrorState:'error'},
  '../projects/ProjectEditorDialog':{ProjectEditorDialog:'editor'},
  '../projects/useProjectManagement':{useProjectManagement:()=>({editor:{result:null}})},
  '../publishing/PublishProjectDialog':{PublishProjectDialog:'publisher'},'./discardStudioDraft':{},'../publishing/firstProjectDraft':{},
  '../sharing/shareModel':{},'../../utils/copyPublicLink':{},
  './StudioOverview':{StudioOverview:'overview'},
  './StudioBookmarksList':{StudioPage:'collection'},'./StudioDraftsList':{StudioDraftsList:'drafts'},
  './StudioActionSheet':{},'./StudioWorkbenchView':{StudioWorkbenchHeader:'header',StudioWorkbenchView:'overview'},
  './workbenchModel':{attentionRows:()=>[],newestDraft:()=>null,weeklyReads:()=>null},
  './useWorkbench':{useWorkbench:()=>workbench},
  './studio-workbench.css':{},
 };
 const {StudioPage}=sourceModule('src/features/studio/StudioPage.tsx',imports);
 const props={onBack(){},onOpenProject(){}};
 let tree=nodes(StudioPage(props));
 const pills=tree.filter(n=>n.props['data-studio-pill']);
 assert.equal(pills[0].props.children,'Insights');
 assert.equal(pills.some(n=>n.props['data-studio-pill']==='published'),false);
 assert.equal(pills.some(n=>n.props['data-studio-pill']==='all'),false);
 assert.equal(pills[0].props['aria-pressed'],true);
 assert.ok(tree.some(n=>n.type==='insights'));
 assert.equal(tree.find(n=>n.type==='insights').props.studio,true);
 assert.equal(tree.some(n=>n.type==='overview'),false);
 assert.equal(tree.some(n=>n.props['aria-label']==='Back from Studio'),false);
 pills.find(n=>n.props['data-studio-pill']==='drafts').props.onClick();
 tree=nodes(StudioPage(props));
 assert.equal(tree.find(n=>n.props['data-studio-pill']==='drafts').props['aria-pressed'],true);
 assert.equal(tree.find(n=>n.type==='drafts').props.hideBack,undefined);
 tree.find(n=>n.props['data-studio-pill']==='overview').props.onClick();
 tree=nodes(StudioPage(props));
 assert.ok(tree.some(n=>n.type==='insights'));
 assert.equal(tree.find(n=>n.props['data-studio-pill']==='overview').props['aria-pressed'],true);

 assert.equal(tree.some(n=>n.type==='overview'),false);
 params=new URLSearchParams();mobile=false;
 tree=nodes(StudioPage(props));
 assert.equal(tree.filter(n=>n.props['data-studio-pill'])[0].props.children,'Drafts');
 assert.equal(tree.some(n=>n.props['data-studio-pill']==='overview'),false);
 assert.equal(tree.some(n=>n.props['data-studio-pill']==='all'),false);
 assert.ok(tree.some(n=>n.type==='overview'),'WEB retains its workbench overview');
 mobile=true;
 for(const collection of ['overview','drafts','published','bookmarks','references','cited','activity']) {
  params=new URLSearchParams({collection});
  workbench={data:{profile:{projects:[]},drafts:[],material:[]},retry(){}};
  const emptyTree=nodes(StudioPage(props));
  const fallback=collection==='cited'?1:0;
  assert.equal(emptyTree.filter(n=>n.props.className==='studio-mobile-header-fallback').length,fallback,`${collection}: empty Studio retains one header fallback`);
  assert.equal(emptyTree.filter(n=>n.type==='header'&&n.props.showBookmarks===false).length,fallback,`${collection}: fallback contains screen actions header`);
  assert.equal(registered, null,`${collection}: screen or list child provides its actions`);
  if(collection==='cited') {
   const header=emptyTree.find(n=>n.props.className==='studio-mobile-header-fallback');
   assert.equal(nodes(header).some(n=>n.props['aria-label']==='Select items'),false,'Cited must not offer selection when no selection action exists.');
   assert.deepEqual(emptyTree.filter(n=>n.type==='h1').map(n=>n.props.children),['Your citations']);
   nodes(header).find(n=>n.props['aria-label']==='Back from Studio').props.onClick();
   assert.equal(navigations.at(-1).path,'/studio');
   assert.equal(navigations.at(-1).options.replace,true);
  }
 }
 effects.length=0;
 for(const isMobile of [true,false])for(const key of ['collection','category']) {
  mobile=isMobile;params=new URLSearchParams({[key]:'all',tab:'pages',from:'legacy'});
  const legacyTree=nodes(StudioPage(props));
  assert.ok(legacyTree.some(n=>n.type===(mobile?'insights':'overview')));
  assert.equal(legacyTree.some(n=>n.type==='collection'),false);
  assert.equal(legacyTree.some(n=>n.props['data-studio-pill']==='all'),false);
  effects.splice(0).forEach(effect=>effect());
  assert.equal(params.has('collection'),false);assert.equal(params.has('category'),false);
  assert.equal(params.get('from'),'legacy');assert.equal(paramWrites.at(-1).options.replace,true);
 }
 mobile=true;
 for(const state of [{loading:true},{error:'Unavailable'},{data:{draftsUnavailable:true}}]) {
  params=new URLSearchParams({collection:'drafts'});workbench={...state,retry(){}};
  const unavailableTree=nodes(StudioPage(props));
  assert.equal(unavailableTree.filter(n=>n.props.className==='studio-mobile-header-fallback').length,1,'Unavailable Drafts retains fallback');
  assert.equal(unavailableTree.find(n=>n.props['aria-label']==='Select items').props.disabled,true,'Unavailable Drafts retains its disabled selection affordance.');
  assert.ok(unavailableTree.some(n=>n.props['aria-label']==='Back from Studio'));
  assert.equal(registered,null);
 }
});
