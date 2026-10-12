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
 let mobile=true;
 const react = {...React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]};
 const {StudioDraftsList} = sourceModule('src/features/studio/StudioDraftsList.tsx',{
  react,
  'react-dom':{createPortal:children=>children},
  'lucide-react':{ChevronLeftIcon:'chevron'},
  '../../presentation/usePresentation':{usePresentation:()=>mobile?'mobile':'web'},
  './StudioEmptyState':{StudioEmptyState:'empty'},
  './studioView':{studioDate:()=>undefined},
  '../../components/ui/InterfaceIcon':{InterfaceIcon:'icon'},
  '../../components/ui/ModalPortal':{ModalPortal:'modal'},
  '../../components/publishing/ProjectFormDialog':{ProjectDiscardConfirmation:'confirmation'},
  '../../presentation/mobile/MobileContextActions':{MobileContextButton:'actions',useMobileScreenActions(){}},
  '../../presentation/mobile/contextActions':{contextActions:kind=>({kind})},
 });
 const props={drafts:[],onBack(){},onResume(){},onDiscard:async()=>{},onBookmarks(){},onReads(){}};
 const mobileTree = nodes(StudioDraftsList({...props,headerHost:{}}));
 assert.equal(mobileTree.some(n=>n.props['aria-label']==='Back from Drafts'),false);
 assert.equal(mobileTree.some(n=>n.type==='button'&&n.props.children==='Select'),false);
 mobile=false;
 const web = nodes(StudioDraftsList(props));
 assert.ok(web.some(n=>n.props['aria-label']==='Back from Drafts'));
});

test('mobile Studio starts on Overview, and selecting Drafts switches the content with consistent header controls', () => {
 let params=new URLSearchParams(), mobile=true, registered,entry={dockEntry:'studio'};
 let workbench={data:{profile:{projects:[{id:'real-work-fixture'}]},drafts:[]},retry(){}};
 const react={...React,useEffect(){},useMemo:fn=>fn(),useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]};
 const imports={
  react,'react-router-dom':{useLocation:()=>({state:entry}),useNavigate:()=>()=>{},useSearchParams:()=>[params,next=>{params=new URLSearchParams(next);}]},
  '../../presentation/mobile/MobilePillHeader':{MobilePillHeader:'pill-header'},
  'lucide-react':{},
  '../../presentation/usePresentation':{usePresentation:()=>mobile?'mobile':'web'},
  '../citations/StudioCitations':{StudioCitations:'citations'},
  '../sharing/InternalContentShare':{useInternalContentShare:()=>()=>{}},
  '../../contexts/AuthContext':{useAuth:()=>({viewerProfileId:'owner',user:{id:'account'},isAuthenticated:true})},
  '../../contexts/ServicesContext':{useServices:()=>({})},
  '../../presentation/mobile/MobileBackNavigation':{ScreenBack:'screen-back'},
  '../../presentation/mobile/MobileContextActions':{MobileContextButton:'actions',useMobileScreenActions(model){registered=model;}},
  '../../presentation/mobile/contextActions':{contextActions:kind=>({kind})},
  '../../components/ui/StateViews':{},
  '../projects/ProjectEditorDialog':{ProjectEditorDialog:'editor'},
  '../projects/useProjectManagement':{useProjectManagement:()=>({editor:{result:null}})},
  '../publishing/PublishProjectDialog':{},'./discardStudioDraft':{},'../publishing/firstProjectDraft':{},
  '../sharing/shareModel':{},'../../utils/copyPublicLink':{},
  './StudioBookmarksList':{StudioPage:'collection'},'./StudioDraftsList':{StudioDraftsList:'drafts'},
  './StudioActionSheet':{},'./StudioWorkbenchView':{StudioWorkbenchHeader:'header',StudioWorkbenchView:'overview'},
  './workbenchModel':{attentionRows:()=>[],newestDraft:()=>null,weeklyReads:()=>null},
  './useWorkbench':{useWorkbench:()=>workbench},
  './studio-workbench.css':{},
 };
 const {StudioPage}=sourceModule('src/features/studio/StudioPage.tsx',imports,{window:{history:{state:{idx:1}}}});
 const props={onBack(){},onOpenProject(){}};
 let tree=nodes(StudioPage(props));
 const header=tree.find(n=>n.type==='pill-header');
 assert.equal(header.props.active,'overview');
 assert.deepEqual(Array.from(header.props.tabs,t=>t.id),['overview','drafts','published','bookmarks','references','cited','all']);
 assert.equal(header.props.onBack,undefined);
 entry=null;assert.equal(nodes(StudioPage(props)).find(n=>n.type==='pill-header').props.onBack,props.onBack);entry={dockEntry:'studio'};
 assert.ok(tree.some(n=>n.type==='overview'));
 header.props.onChange('drafts');tree=nodes(StudioPage(props));
 assert.equal(tree.find(n=>n.type==='pill-header').props.active,'drafts');
 assert.ok(tree.some(n=>n.type==='drafts'));
 params=new URLSearchParams();mobile=false;
 tree=nodes(StudioPage(props));
 assert.equal(tree.filter(n=>n.props['data-studio-pill'])[0].props.children,'Drafts');
 assert.equal(tree.some(n=>n.props['data-studio-pill']==='overview'),false);
 mobile=true;
 for(const collection of ['overview','drafts','published','bookmarks','references','cited','activity','all']) {
  params=new URLSearchParams({collection});
  workbench={data:{profile:{projects:[]},drafts:[],material:[]},retry(){}};
  const emptyTree=nodes(StudioPage(props));
  assert.equal(emptyTree.filter(n=>n.type==='pill-header').length,1,`${collection}: one fixed header`);
  assert.ok(emptyTree.find(n=>n.type==='pill-header').props.right);
  assert.equal(registered?.kind, ['overview'].includes(collection)?'studio':undefined);
 }
 for(const state of [{loading:true},{error:'Unavailable'},{data:{draftsUnavailable:true}}]) {
  params=new URLSearchParams({collection:'drafts'});workbench={...state,retry(){}};
  const unavailableTree=nodes(StudioPage(props));
  assert.equal(unavailableTree.filter(n=>n.type==='pill-header').length,1);
  assert.equal(registered,null);
 }
});

test('Drafts search Select all never includes hidden drafts in discard',async()=>{
 const slots=[];let cursor=0,discarded;
 const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];}};
 const {StudioDraftsList}=sourceModule('src/features/studio/StudioDraftsList.tsx',{
  react,'react-dom':{createPortal:children=>children},'lucide-react':{},
  '../../presentation/usePresentation':{usePresentation:()=> 'mobile'},
  '../../components/ui/InterfaceIcon':{InterfaceIcon:'icon'},
  '../../components/ui/ModalPortal':{ModalPortal:'modal'},
  '../../components/publishing/ProjectFormDialog':{ProjectDiscardConfirmation:'confirmation'},
  '../../presentation/mobile/MobileContextActions':{MobileContextButton:'actions',useMobileScreenActions(){}},
  '../../presentation/mobile/contextActions':{contextActions:()=>({})},
  './StudioEmptyState':{StudioEmptyState:'empty'},'./studioView':{studioDate:()=>undefined}
 });
 const props={headerHost:{},drafts:[{id:'a',metadata:{title:'Visible one'}},{id:'b',metadata:{title:'Hidden'}},{id:'c',metadata:{title:'Visible two'}}],onBack(){},onResume(){},onDiscard:async ids=>{discarded=Array.from(ids);},onBookmarks(){},onReads(){}};
 const render=()=>{cursor=0;return nodes(StudioDraftsList(props));};
 render().find(n=>n.type==='input').props.onChange({target:{value:'Visible'}});
 render().find(n=>n.props['aria-label']==='Select items').props.onClick();
 render().find(n=>n.type==='input').props.onChange({target:{value:'No match'}});
 render().find(n=>n.props['aria-label']==='Exit selection').props.onClick();
 render().find(n=>n.type==='input').props.onChange({target:{value:'Visible'}});
 render().find(n=>n.props['aria-label']==='Select items').props.onClick();
 render().find(n=>n.type==='button'&&n.props.children==='Select all').props.onClick();
 render().find(n=>n.type==='button'&&React.Children.toArray(n.props.children).join('').startsWith('Discard')).props.onClick();
 await render().find(n=>n.type==='confirmation').props.onDiscard();
 assert.deepEqual(discarded,['a','c']);
});
