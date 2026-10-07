import assert from 'node:assert/strict';import test from 'node:test';import React from 'react';import {sourceModule} from './helpers/source-module.mjs';
const model=sourceModule('src/features/studio/workbenchModel.ts');
const project={id:'p',categoryId:'c',title:'Study',summary:'',cover:'',publishedAt:'2026-08-01'};
function harness(status="ready"){const calls=[];const fake={...React,useEffect(){},useMemo:f=>f(),useState:v=>[typeof v==='function'?v():v,value=>calls.push(['state',value])]};
 const deps={'react':fake,'react-router-dom':{useNavigate:()=>path=>calls.push(['navigate',path]),useSearchParams:()=>[new URLSearchParams(),value=>calls.push(["collection",value.collection])]},'lucide-react':{},'../../contexts/AuthContext':{useAuth:()=>({viewerProfileId:'owner',user:{id:'account'},isAuthenticated:true})},'../../contexts/ServicesContext':{useServices:()=>({profiles:{getShareAddress:async()=>({handle:'creator'})},projects:{discardDraft:async()=>{}}})},'../../presentation/mobile/MobileBackNavigation':{ScreenBack:'back'},'../../presentation/mobile/MobileContextActions':{useMobileScreenActions(){}},'../../presentation/mobile/contextActions':{contextActions:()=>({})},'../../components/ui/StateViews':{},'../projects/ProjectEditorDialog':{ProjectEditorDialog:'editor'},'../projects/useProjectManagement':{useProjectManagement:()=>({editor:{open:(...args)=>calls.push(['editor',...args])}})},'../publishing/PublishProjectDialog':{},'./discardStudioDraft':{},'../publishing/firstProjectDraft':{},'../sharing/shareModel':{portfolioProjectPath:()=>'/creator/work'},'../../utils/copyPublicLink':{},'./StudioBookmarksList':{},'./StudioDraftsList':{},'./StudioActionSheet':{},'./StudioWorkbenchView':{StudioWorkbenchView:'workbench',StudioWorkbenchHeader:'hub-header'},'./workbenchModel':model,'./useWorkbench':{useWorkbench:()=>({loading:status==="loading",error:status==="error"?"Offline":undefined,data:{profile:{id:'owner',projects:[project]},drafts:[{id:'draft',metadata:{title:'Draft'},stage:'review',createdAt:'2026-10-01'}],material:[],partial:false},retry(){}})},'./studio-workbench.css':{}};
 const Page=sourceModule('src/features/studio/StudioPage.tsx',deps,{window:{location:{origin:'https://portalink.test'}}}).StudioPage;
 const tree=Page({onBack(){},onOpenProject(){}});const find=e=>{if((e?.type==='workbench'||e?.type==='hub-header'))return e;return React.Children.toArray(e?.props?.children).map(find).find(Boolean);};return {calls,props:find(tree).props};}
test('each attention action opens its exact editor or page detail',async()=>{
 const h=harness();const event={attachmentId:'file',pageIndex:3,page:7};
 for(const action of ['cover','description','date','read','reply'])h.props.onAttention({action,projectId:'p',project,activity:event});
 assert.deepEqual(h.calls,[['editor','p','cover-choice'],['editor','p','story'],['editor','p','journey'],['navigate','/insights?project=p&page=7&period=7d'],['navigate','/p/owner/c/c/p?media=file&page=4&comments=1']]);
 h.props.onContinue();assert.equal(h.calls.at(-1)[1].stage,'review');
 h.props.onAttention({action:'share',projectId:'p',project});for(let i=0;i<10;i++)await Promise.resolve();assert.equal(h.calls.at(-1)[1].url,'https://portalink.test/creator/work');
});

test('Studio shortcuts reach Bookmarks and Insights in ready, loading and error states',()=>{
 for(const status of ['ready','loading','error']){
  const h=harness(status);h.props.onBookmarks();h.props.onReads();
  assert.deepEqual(h.calls,[['collection','bookmarks'],['navigate','/insights?period=7d']]);
 }
});
