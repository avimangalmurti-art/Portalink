import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
const model=sourceModule('src/features/studio/workbenchModel.ts');
const draft={id:'draft',metadata:{title:'Draft'},stage:'review',createdAt:'2026-10-01'};
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function harness(status='ready',drafts=[draft],options={}){
 const calls=[],workbenchEnabled=[];let registered;
 const fake={...React,useEffect(){},useRef:initial=>({current:initial}),useCallback:callback=>callback,useState:v=>[typeof v==='function'?v():v,value=>calls.push(['state',value])]};
 const dependencies={'../../presentation/mobile/MobilePillHeader':{MobilePillHeader:'pill-header'},
  react:fake,'react-router-dom':{useLocation:()=>({state:null}),useNavigate:()=>path=>calls.push(['navigate',path]),useSearchParams:()=>[new URLSearchParams(options.search),value=>calls.push(['collection',value.collection])]},
  'lucide-react':{ChevronLeftIcon:'chevron'},'../../components/ui/InterfaceIcon':{InterfaceIcon:'icon'},
  '../../presentation/usePresentation':{usePresentation:()=> options.presentation??'mobile'},
  '../citations/StudioCitations':{StudioCitations:'citations'},
  '../../contexts/AuthContext':{useAuth:()=>({viewerProfileId:'owner',user:{id:'account'},isAuthenticated:true})},
  '../../contexts/ServicesContext':{useServices:()=>({})},
  '../../presentation/mobile/MobileBackNavigation':{ScreenBack:'back'},
  '../../presentation/mobile/MobileContextActions':{MobileContextButton:'context-button',useMobileScreenActions:value=>{registered=value;}},
  '../../presentation/mobile/contextActions':{contextActions:(_kind,_viewer,target)=>target},
  '../../components/ui/StateViews':{LoadingState:'loading',ErrorState:'error'},
  '../publishing/PublishProjectDialog':{PublishProjectDialog:'publish-dialog'},
  './discardStudioDraft':{},'./StudioBookmarksList':{StudioPage:'bookmarks'},'./StudioDraftsList':{StudioDraftsList:'drafts'},
  '../library/PersonalPages':{InsightsPage:'insights'},
  './StudioOverview':{StudioOverview:'overview'},'./StudioWorkbenchView':{StudioWorkbenchHeader:'hub-header'},
  './workbenchModel':model,'./useWorkbench':{useWorkbench:enabled=>{workbenchEnabled.push(enabled);return{loading:status==='loading',error:status==='error'?'Offline':undefined,data:{profile:{id:'owner',projects:[]},drafts,material:[]},retry(){}};}},
  './studio-workbench.css':{},
 };
 const Page=sourceModule('src/features/studio/StudioPage.tsx',dependencies,{window:{history:{state:{idx:0}}}}).StudioPage;
 const tree=Page({onBack(){},onOpenProject(){},onNewProject:()=>calls.push(['create']),savedRoute:options.savedRoute});
 return{calls,registered,tree,workbenchEnabled};
}
test('Overview resumes the exact saved draft and Add work uses the existing creation flow',()=>{
 const withDraft=harness('ready',[draft],{presentation:'web'}),overview=nodes(withDraft.tree).find(n=>n.type==='overview');
 assert.equal(overview.props.draft,draft);
 overview.props.onContinue(overview.props.draft);
 assert.deepEqual(withDraft.calls,[['state',draft]]);
 assert.equal(overview.props.onAttention,undefined);
 const withoutDraft=harness('ready',[],{presentation:'web'}),empty=nodes(withoutDraft.tree).find(n=>n.type==='overview');
 assert.equal(empty.props.draft,null);empty.props.onNew();
 assert.deepEqual(withoutDraft.calls,[['create']]);
});
test('existing Studio action shortcuts reach Bookmarks and Insights in ready, loading and error states',()=>{
 for(const status of ['ready','loading','error']){
  const mobile=harness(status);assert.equal(mobile.registered,null);
  const h=harness(status,[draft],{presentation:'web'});h.registered.handlers.bookmarks();h.registered.handlers.reads();
  assert.deepEqual(h.calls,[['collection','bookmarks'],['navigate','/insights?period=7d']]);
  assert.ok(nodes(mobile.tree).some(n=>n.type==='insights'));assert.deepEqual(mobile.workbenchEnabled,[false]);
 }
});

test('both platforms load only overview/drafts workbench data and let independent collections own their reads',()=>{
 for(const presentation of ['mobile','web']){
  for(const collection of [null,'overview','drafts']){
   const h=harness('ready',[draft],{presentation,search:collection?`collection=${collection}`:''});
   const overview= presentation==='mobile' && collection!=='drafts';
   assert.deepEqual(h.workbenchEnabled,[!overview]);
   assert.ok(nodes(h.tree).some(node=>node.type===(overview?'insights':collection==='drafts'?'drafts':'overview')));
  }
  for(const collection of ['published','activity','bookmarks','references','cited']){
   const h=harness('loading',[draft],{presentation,search:`collection=${collection}`});
   assert.deepEqual(h.workbenchEnabled,[false]);
   assert.ok(nodes(h.tree).some(node=>node.type===(presentation==='mobile'&&collection==='published'?'insights':['references','cited'].includes(collection)?'citations':'bookmarks')));
   assert.equal(nodes(h.tree).some(node=>node.type==='loading'),false);
  }
  const legacy=harness('loading',[draft],{presentation,search:'collection=all'});
  assert.deepEqual(legacy.workbenchEnabled,[presentation==='web']);
  assert.ok(nodes(legacy.tree).some(node=>node.type===(presentation==='mobile'?'insights':'loading')),'Legacy All follows the existing normalized Studio overview.');
  const saved=harness('loading',[draft],{presentation,savedRoute:true});
  assert.deepEqual(saved.workbenchEnabled,[false]);
  assert.ok(nodes(saved.tree).some(node=>node.type==='bookmarks'&&node.props.savedRoute));
 }
});
