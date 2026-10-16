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
 const react = {...React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]};
 const {StudioDraftsList} = sourceModule('src/features/studio/StudioDraftsList.tsx',{
  react,
  'react-dom':{createPortal:children=>children},
  'lucide-react':{ChevronLeftIcon:'chevron'},
  '../../components/ui/ModalPortal':{ModalPortal:'modal'},
  '../../components/publishing/ProjectFormDialog':{ProjectDiscardConfirmation:'confirmation'},
  '../../presentation/mobile/MobileContextActions':{MobileContextButton:'actions',useMobileScreenActions(){}},
  '../../presentation/mobile/contextActions':{contextActions:kind=>({kind})},
 });
 const props={drafts:[],onBack(){},onResume(){},onDiscard:async()=>{},onBookmarks(){},onReads(){}};
 const mobile = nodes(StudioDraftsList({...props,hideBack:true}));
 assert.equal(mobile.some(n=>n.props['aria-label']==='Back from Drafts'),true);
 assert.ok(mobile.some(n=>n.type==='button'&&n.props.children==='Select'));
 const web = nodes(StudioDraftsList(props));
 assert.ok(web.some(n=>n.props['aria-label']==='Back from Drafts'));
});

test('mobile Studio starts on Insights, and selecting Drafts switches the content with consistent header controls', () => {
 let params=new URLSearchParams(), mobile=true, registered;
 let workbench={data:{profile:{projects:[{id:'real-work-fixture'}]},drafts:[]},retry(){}};
 const react={...React,useEffect(){},useMemo:fn=>fn(),useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]};
 const imports={
  react,'react-router-dom':{useLocation:()=>({state:{}}),useNavigate:()=>()=>{},useSearchParams:()=>[params,next=>{params=new URLSearchParams(next);}]},
  'lucide-react':{},
  '../../presentation/usePresentation':{usePresentation:()=>mobile?'mobile':'web'},
  '../library/PersonalPages':{InsightsPage:'insights'},
  '../citations/StudioCitations':{StudioCitations:'citations'},
  '../sharing/InternalContentShare':{useInternalContentShare:()=>()=>{}},
  '../../contexts/AuthContext':{useAuth:()=>({viewerProfileId:'owner',user:{id:'account'},isAuthenticated:true})},
  '../../contexts/ServicesContext':{useServices:()=>({})},
  '../../presentation/mobile/MobileBackNavigation':{ScreenBack:'screen-back'},
  '../../presentation/mobile/MobileContextActions':{useMobileScreenActions(model){registered=model;}},
  '../../presentation/mobile/contextActions':{contextActions:kind=>({kind})},
  '../../components/ui/StateViews':{},
  '../projects/ProjectEditorDialog':{ProjectEditorDialog:'editor'},
  '../projects/useProjectManagement':{useProjectManagement:()=>({editor:{result:null}})},
  '../publishing/PublishProjectDialog':{},'./discardStudioDraft':{},'../publishing/firstProjectDraft':{},
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
 assert.equal(pills[0].props['aria-pressed'],true);
 assert.ok(tree.some(n=>n.type==='insights'));
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
 mobile=true;
 for(const collection of ['overview','drafts','published','bookmarks','references','cited','activity','all']) {
  params=new URLSearchParams({collection});
  workbench={data:{profile:{projects:[]},drafts:[],material:[]},retry(){}};
  const emptyTree=nodes(StudioPage(props));
  const fallback=collection==='cited'?1:0;
  assert.equal(emptyTree.filter(n=>n.props.className==='studio-mobile-header-fallback').length,fallback,`${collection}: empty Studio retains one header fallback`);
  assert.equal(emptyTree.filter(n=>n.type==='header'&&n.props.showBookmarks===false).length,fallback,`${collection}: fallback contains screen actions header`);
  assert.equal(registered?.kind,(fallback||collection==='overview')?'studio':undefined,`${collection}: screen or list child provides its actions`);
 }
 for(const state of [{loading:true},{error:'Unavailable'},{data:{draftsUnavailable:true}}]) {
  params=new URLSearchParams({collection:'drafts'});workbench={...state,retry(){}};
  const unavailableTree=nodes(StudioPage(props));
  assert.equal(unavailableTree.filter(n=>n.props.className==='studio-mobile-header-fallback').length,1,'Unavailable Drafts retains fallback');
  assert.equal(registered.kind,'studio');
 }
});
