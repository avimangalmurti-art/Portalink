import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {sourceModule} from './helpers/source-module.mjs';
const model=sourceModule('src/features/studio/workbenchModel.ts');
const draft={id:'draft',metadata:{title:'Draft'},stage:'review',createdAt:'2026-10-01'};
const nodes=n=>React.isValidElement(n)?[n,...React.Children.toArray(n.props.children).flatMap(nodes)]:[];
function harness(status='ready',drafts=[draft]){
 const calls=[];let registered;
 const fake={...React,useEffect(){},useState:v=>[typeof v==='function'?v():v,value=>calls.push(['state',value])]};
 const dependencies={'./MobileLibraryLayout':{MobileLibraryLayout:'mobile-layout'},'../../presentation/mobile/MobilePillHeader':{MobilePillHeader:'pill-header'},
  react:fake,'react-router-dom':{useLocation:()=>({state:null}),useNavigate:()=>path=>calls.push(['navigate',path]),useSearchParams:()=>[new URLSearchParams(),value=>calls.push(['collection',value.collection])]},
  'lucide-react':{ChevronLeftIcon:'chevron'},
  '../../presentation/usePresentation':{usePresentation:()=> 'mobile'},
  '../citations/StudioCitations':{StudioCitations:'citations'},
  '../../contexts/AuthContext':{useAuth:()=>({viewerProfileId:'owner',user:{id:'account'},isAuthenticated:true})},
  '../../contexts/ServicesContext':{useServices:()=>({})},
  '../../presentation/mobile/MobileBackNavigation':{ScreenBack:'back'},
  '../../presentation/mobile/MobileContextActions':{MobileContextButton:'context-button',useMobileScreenActions:value=>{registered=value;}},
  '../../presentation/mobile/contextActions':{contextActions:(_kind,_viewer,target)=>target},
  '../../components/ui/StateViews':{LoadingState:'loading',ErrorState:'error'},
  '../publishing/PublishProjectDialog':{PublishProjectDialog:'publish-dialog'},
  './discardStudioDraft':{},'./StudioBookmarksList':{StudioPage:'bookmarks'},'./StudioDraftsList':{StudioDraftsList:'drafts'},
  './StudioOverview':{StudioOverview:'overview'},'./StudioWorkbenchView':{StudioWorkbenchHeader:'hub-header'},
  './workbenchModel':model,'./useWorkbench':{useWorkbench:()=>({loading:status==='loading',error:status==='error'?'Offline':undefined,data:{profile:{id:'owner',projects:[]},drafts,material:[]},retry(){}})},
  './studio-workbench.css':{},
 };
 const Page=sourceModule('src/features/studio/StudioPage.tsx',dependencies,{window:{history:{state:{idx:0}}}}).StudioPage;
 const tree=Page({onBack(){},onOpenProject(){},onNewProject:()=>calls.push(['create'])});
 return{calls,registered,tree};
}
test('Overview resumes the exact saved draft and Add work uses the existing creation flow',()=>{
 const withDraft=harness(),overview=nodes(withDraft.tree).find(n=>n.type==='overview');
 assert.equal(overview.props.draft,draft);
 overview.props.onContinue(overview.props.draft);
 assert.deepEqual(withDraft.calls,[['state',draft]]);
 assert.equal(overview.props.onAttention,undefined);
 const withoutDraft=harness('ready',[]),empty=nodes(withoutDraft.tree).find(n=>n.type==='overview');
 assert.equal(empty.props.draft,null);empty.props.onNew();
 assert.deepEqual(withoutDraft.calls,[['create']]);
});
test('existing Studio action shortcuts reach Bookmarks and Insights in ready, loading and error states',()=>{
 for(const status of ['ready','loading','error']){
  const h=harness(status);h.registered.handlers.bookmarks();h.registered.handlers.reads();
  assert.deepEqual(h.calls,[['collection','bookmarks'],['navigate','/insights?period=7d']]);
  if(status!=='ready')assert.ok(nodes(h.tree).some(n=>n.type===status));
 }
});
