import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';
const nodes = n => React.isValidElement(n) ? [n, ...React.Children.toArray(n.props.children).flatMap(nodes)] : [];
const textOf = n => React.isValidElement(n) ? React.Children.toArray(n.props.children).map(textOf).join('') : n == null ? '' : String(n);
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

test('Studio Insights omits its duplicate heading while standalone, project Reads and WEB retain Back',()=>{
 let presentation='mobile',params=new URLSearchParams();
 const writes=[],backs=[];
 const {InsightsPage}=sourceModule('src/features/library/PersonalPages.tsx',{
  react:{...React,useCallback:fn=>fn},
  'lucide-react':{ArrowLeftIcon:'arrow',ChevronLeftIcon:'chevron',BookmarkIcon:'bookmark'},
  'react-router-dom':{Link:'link',useNavigate:()=>()=>{},useSearchParams:()=>[params,next=>{writes.push(next);params=new URLSearchParams(next);}]},
  '../../presentation/mobile/MobileProfileContext':{MobileProfileContext:'profile-context'},
  '../../presentation/mobile/MobileContextActions':{MobileContextButton:'actions'},
  '../../presentation/mobile/MobileBackNavigation':{ScreenBack:'screen-back'},
  '../../presentation/usePresentation':{usePresentation:()=>presentation},
  '../../app/routes':{buildPath:()=>'/studio'},
  '../../contexts/AuthContext':{useAuth:()=>({isAuthenticated:true})},
  '../../contexts/ServicesContext':{useServices:()=>({creatorSaves:{getSaveInsights:async()=>({})}})},
  '../../components/profile/ActivityCollectionPage':{ActivityCollectionPage:'collection'},
  '../../components/profile/CreatorAvatar':{CreatorAvatar:'avatar'},
  '../../components/ui/InterfaceIcon':{InterfaceIcon:'icon'},
  '../../components/ui/StateViews':{EmptyState:'empty',ErrorState:'error',LoadingState:'loading'},
  '../../components/messages/InboxPanel':{InboxPanel:'inbox'},
  './useAccountQuery':{useAccountQuery:()=>({data:{creatorSaves:0,projectSaves:0,followers:0},loading:false,retry(){}})},
  './SavedPagesCollection':{SavedPagesCollection:'pages'},
  './collectionQueries':{loadSavedCreators:async()=>[]},
 });
 for(const scenario of [
  {presentation:'mobile',studio:true,search:'',header:false},
  {presentation:'mobile',studio:false,search:'',header:true,title:'Your insights',icon:'arrow'},
  {presentation:'mobile',studio:true,search:'project=work',header:true,title:'Reads',icon:'chevron'},
  {presentation:'web',studio:true,search:'',header:true,title:'Insights',icon:'arrow'},
 ]) {
  presentation=scenario.presentation;params=new URLSearchParams(scenario.search);
  const tree=InsightsPage({studio:scenario.studio,onBack:()=>backs.push('back')});
  const header=nodes(tree).find(node=>typeof node.type==='function'&&node.type.name==='PersonalHeader');
  assert.equal(Boolean(header),scenario.header);
  if(!header)continue;
  const content=nodes(header.type(header.props));
  assert.equal(content.find(node=>node.type==='h1').props.children,scenario.title);
  assert.equal(content.find(node=>node.type==='icon').props.icon,scenario.icon);
  const before=backs.length;
  content.find(node=>node.props['aria-label']==='Go back').props.onClick();
  if(scenario.search){assert.equal(params.has('project'),false);assert.equal(backs.length,before);assert.equal(Object.keys(writes.at(-1)).length,0);}
  else assert.equal(backs.length,before+1);
 }
});

test('mobile Drafts keeps local selection controls and selection-only Back while WEB retains navigation', () => {
 const slots=[];let cursor=0,presentation='web';
 const react = {...React,useRef(initial){const index=cursor++;return slots[index]??={current:initial};},useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];}};
 const {StudioDraftsList} = sourceModule('src/features/studio/StudioDraftsList.tsx',{
  react,
  'react-dom':{createPortal:(children,host)=>React.createElement('header-portal',{host},children)},
  'lucide-react':{ChevronLeftIcon:'chevron',ArrowLeftIcon:'arrow-left'},
  '../../components/ui/InterfaceIcon':{InterfaceIcon:'icon'},
  '../../components/ui/ModalPortal':{ModalPortal:'modal'},
  '../../components/publishing/ProjectFormDialog':{ProjectDiscardConfirmation:'confirmation'},
  '../../presentation/usePresentation':{usePresentation:()=>presentation},
  '../../presentation/mobile/MobileBackNavigation':{ScreenBack:'screen-back'},
  './StudioEmptyState':{StudioEmptyState:'empty'},
  '../../presentation/mobile/MobileContextActions':{MobileContextButton:'actions',useMobileScreenActions(){}},
  '../../presentation/mobile/contextActions':{contextActions:kind=>({kind})},
 });
 const calls=[],focuses=[],host={};
 const props={drafts:[{id:'draft-one',metadata:{title:'A real draft'},stage:'details',createdAt:'2026-10-18T00:00:00Z'}],onBack(){calls.push('back');},onResume(){calls.push('resume');},onDiscard:async()=>{},onBookmarks(){},onReads(){}};
 const render=overrides=>{cursor=0;presentation=overrides?.headerHost?'mobile':'web';return nodes(StudioDraftsList({...props,...overrides}));};
 let mobile=render({headerHost:host});
 assert.equal(mobile.some(n=>n.type==='header-portal'||n.type==='h1'),false);
 assert.equal(mobile.some(n=>n.props['aria-label']==='Back from Drafts'),false);
 const select=mobile.find(n=>n.type==='button'&&n.props.children==='Select');
 assert.equal(select.props.disabled,false);
 assert.ok(nodes(mobile.find(n=>n.props.className==='studio-drafts-heading studio-drafts-inline-controls')).some(n=>n.props.className==='studio-drafts-control'));
 select.ref.current={focus:options=>focuses.push(options)};
 select.props.onClick();
 mobile=render({headerHost:host});
 assert.ok(mobile.some(n=>n.type==='button'&&n.props.children==='Done'));
 mobile.find(n=>n.type==='button'&&n.props['aria-pressed']===false&&n.props.className!=='studio-drafts-control').props.onClick();
 mobile=render({headerHost:host});
 assert.equal(mobile.find(n=>n.type==='li').props['data-selected'],true);
 const delegated=mobile.find(n=>n.type==='screen-back');
 assert.equal(delegated.props.visibleOnMobile,true);
 delegated.props.action();
 mobile=render({headerHost:host});
 assert.ok(mobile.some(n=>n.type==='button'&&n.props.children==='Select'));
 assert.equal(mobile.some(n=>n.props['aria-label']==='Selected draft actions'),false);
 assert.equal(mobile.some(n=>n.props['aria-label']==='Back from Drafts'),false);
 assert.deepEqual(calls,[],'Back exits selection before leaving Drafts.');
 assert.equal(focuses.at(-1).preventScroll,true);
 const web=render({headerHost:undefined});
 assert.equal(web.some(n=>n.type==='header-portal'),false);
 const webBack=web.find(n=>n.props['aria-label']==='Back from Drafts');
 assert.ok(webBack);
 const backContent=React.Children.toArray(webBack.props.children.props.children);
 assert.equal(backContent[0].type,'icon');
 assert.equal(backContent[0].props.icon,'arrow-left');
 assert.equal(backContent[0].props.mirroredInRtl,true);
 assert.equal(backContent.slice(1).join(''),' Studio');
 webBack.props.onClick();
 assert.deepEqual(calls,['back']);
});

test('mobile Studio uses its tabs without a duplicate heading row and preserves root Back and WEB routing', () => {
 let params=new URLSearchParams(), mobile=true, registered;
 const effects=[],paramWrites=[],navigations=[],backs=[];
 let workbench={data:{profile:{projects:[{id:'real-work-fixture'}]},drafts:[]},retry(){}};
 const react={...React,useEffect:effect=>effects.push(effect),useMemo:fn=>fn(),useRef:initial=>({current:initial}),useCallback:callback=>callback,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]};
 const imports={
  react,'react-router-dom':{useLocation:()=>({state:{}}),useNavigate:()=>((path,options)=>navigations.push({path,options})),useSearchParams:()=>[params,(next,options)=>{params=new URLSearchParams(next);paramWrites.push({params,options});}]},
  'lucide-react':new Proxy({ChevronLeftIcon:'chevron'},{get:(icons,name)=>icons[name]??name}),
  '../../components/ui/InterfaceIcon':{InterfaceIcon:'interface-icon'},
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
 const props={onBack(){backs.push('back');},onOpenProject(){}};
 let tree=nodes(StudioPage(props));
 const pills=tree.filter(n=>n.props['data-studio-pill']);
 assert.deepEqual(pills.map(n=>n.props['aria-label']),['Activity','Insights','Drafts','Bookmarks','References','Cited']);
 assert.deepEqual(pills.map(textOf),['Activity','Insights','Drafts','Bookmarks','References','Cited']);
 assert.equal(new Set(pills.map(n=>nodes(n).find(child=>child.type==='interface-icon')?.props.icon)).size,6,'Every collection has its own existing icon.');
 for(const pill of pills) {
  assert.equal(pill.type,'button');
  assert.equal(pill.props.type,'button');
  assert.ok(nodes(pill).some(n=>n.type==='interface-icon'),'Icon-only collections retain their representative glyph.');
  assert.ok(nodes(pill).some(n=>n.type==='span'&&String(n.props['aria-hidden'])==='true'&&textOf(n)===pill.props['aria-label']),'The visual expanding label does not duplicate the button accessible name.');
 }
 const pillKeys=pills.map(n=>n.key);
 assert.equal(pills.some(n=>n.props['data-studio-pill']==='published'),false);
 assert.equal(pills.some(n=>n.props['data-studio-pill']==='all'),false);
 assert.equal(pills.find(n=>n.props['data-studio-pill']==='overview').props['aria-pressed'],true);
 assert.ok(tree.some(n=>n.type==='insights'));
 assert.equal(tree.find(n=>n.type==='insights').props.studio,true);
 assert.equal(tree.some(n=>n.type==='overview'),false);
 assert.equal(tree.some(n=>n.props['aria-label']==='Back from Studio'),false);
 assert.equal(tree.some(n=>n.type==='h1'||n.props.className==='studio-mobile-shell-header'),false);
 pills.find(n=>n.props['data-studio-pill']==='drafts').props.onClick();
 tree=nodes(StudioPage(props));
 assert.deepEqual(tree.filter(n=>n.props['data-studio-pill']).map(n=>n.key),pillKeys,'Changing collections preserves keyed buttons for focus and interruptible CSS transitions.');
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
 assert.equal(tree.filter(n=>n.props['data-studio-pill']).some(n=>nodes(n).some(child=>child.type==='interface-icon')),false,'WEB keeps its original text-only controls.');
 assert.equal(tree.some(n=>n.props['data-studio-pill']==='overview'),false);
 assert.equal(tree.some(n=>n.props['data-studio-pill']==='all'),false);
 assert.ok(tree.some(n=>n.type==='overview'),'WEB retains its workbench overview');
 mobile=true;
 for(const collection of ['overview','drafts','published','bookmarks','references','cited','activity']) {
  params=new URLSearchParams({collection});
  workbench={data:{profile:{projects:[]},drafts:[],material:[]},retry(){}};
  const emptyTree=nodes(StudioPage(props));
  assert.equal(emptyTree.some(n=>n.type==='h1'||n.type==='header'),false,`${collection}: no duplicate heading row`);
  assert.equal(emptyTree.some(n=>n.props['aria-label']==='Back from Studio'||n.props['aria-label']==='Select items'),false,`${collection}: child controls stay local`);
  assert.equal(registered, null,`${collection}: screen or list child provides its actions`);
  const before=backs.length;
  emptyTree.find(n=>n.type==='screen-back').props.action();
  if(['overview','published'].includes(collection)) assert.equal(backs.length,before+1);
  else {assert.equal(backs.length,before);assert.equal(navigations.at(-1).path,'/studio');}
  for(const node of emptyTree.filter(n=>['drafts','collection','citations'].includes(n.type))) assert.equal(node.props.headerHost,undefined);
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
  assert.equal(unavailableTree.some(n=>n.type==='h1'||n.type==='header'||n.props['aria-label']==='Select items'),false,'Unavailable Drafts keeps the same tabs-only shell.');
  assert.equal(registered,null);
 }
});
