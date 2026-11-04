import { usePresentation } from '../../presentation/usePresentation';
import { StudioOverview } from './StudioOverview';
import { InsightsPage } from '../library/PersonalPages';
import { StudioCitations } from '../citations/StudioCitations';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChartNoAxesColumnIcon, BellIcon, BookmarkIcon, BookOpenIcon, FilePenLineIcon, QuoteIcon } from 'lucide-react';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { useMobileScreenActions } from '../../presentation/mobile/MobileContextActions';
import { contextActions } from '../../presentation/mobile/contextActions';
import { LoadingState, ErrorState } from '../../components/ui/StateViews';
import { PublishProjectDialog } from '../publishing/PublishProjectDialog';
import { discardStudioDraft } from './discardStudioDraft';
import type { ProjectLocation } from '../../types/domain';
import type { PublishResult } from '../../types/publishing';
import { StudioPage as BookmarksList, type ActivityRefreshControl } from './StudioBookmarksList';
import { StudioDraftsList } from './StudioDraftsList';
import { StudioWorkbenchHeader } from './StudioWorkbenchView';
import { newestDraft, type DraftResume } from './workbenchModel';
import { useWorkbench } from './useWorkbench';
import './studio-workbench.css';
type Props={onBack:()=>void;onOpenProject:(id:string,location?:ProjectLocation)=>void;savedRoute?:boolean;onNewProject?:()=>void;onPublishedProject?:(result:PublishResult,title:string)=>void};
const collectionIcons: Record<string, typeof ChartNoAxesColumnIcon> = { overview: ChartNoAxesColumnIcon, drafts: FilePenLineIcon, bookmarks: BookmarkIcon, references: BookOpenIcon, cited: QuoteIcon, activity: BellIcon };
export function StudioPage({onBack,onOpenProject,onNewProject,onPublishedProject,savedRoute=false}:Props){
 const mobile=usePresentation()==='mobile';
 const auth=useAuth(),services=useServices(),navigate=useNavigate(),[params,setParams]=useSearchParams();
 const requestedCollection=params.get('collection')??(savedRoute?'bookmarks':params.get('category'));
 const collection=requestedCollection==='all'?(savedRoute?'bookmarks':null):mobile&&requestedCollection==='published'?'overview':requestedCollection;
 const insightsOverview=mobile && (!collection || collection==='overview');
 const state=useWorkbench(!insightsOverview && !['cited','references','published','activity','bookmarks'].includes(collection??''));
 const location=useLocation();
 const profile=state.data?.profile??null;
 const [resume,setResume]=useState<DraftResume|null>(null);
 const activityRefresh=useRef<ActivityRefreshControl|null>(null);
 const [activityFeedback,setActivityFeedback]=useState({pending:false,error:false});
 const registerActivityRefresh=useCallback((control:ActivityRefreshControl|null)=>{
  activityRefresh.current=control;
  const pending=control?.pending??false,error=control?.error??false;
  setActivityFeedback(previous=>previous.pending===pending&&previous.error===error?previous:{pending,error});
 },[]);
 const draft=newestDraft(state.data?.drafts??[]);
 useEffect(()=>{if(requestedCollection==='all'){const next=new URLSearchParams(params);next.delete('collection');next.delete('category');setParams(next,{replace:true,state:location?.state});}},[requestedCollection,params,setParams,location?.state]);
 useEffect(()=>{if(params.get('newProject')==='1'&&auth.hasCreatorProfile&&onNewProject){setParams({}, {replace:true});onNewProject();}},[params,auth.hasCreatorProfile,onNewProject,setParams]);
 const home=()=>{navigate('/studio',{replace:true,state:location?.state});};
 const drafts=()=>setParams({collection:'drafts'},{replace:true,state:location?.state}),bookmarks=()=>setParams({collection:'bookmarks'},{replace:true,state:location?.state}),reads=()=>navigate('/insights?period=7d');
 const collectionHeader=['published','activity','bookmarks','references'].includes(collection??'')||(collection==='drafts'&&!state.loading&&!state.error&&!state.data?.draftsUnavailable);
 useMobileScreenActions(mobile||collectionHeader?null:contextActions('studio',{signedIn:auth.isAuthenticated,owner:true},{handlers:{newProject:onNewProject,drafts,bookmarks,reads}}));
 const closeDraft=()=>{setResume(null);state.retry();};
 const finishMobileDraft=(result:PublishResult,title:string)=>{closeDraft();onPublishedProject?.(result,title);};
 const content=insightsOverview?<InsightsPage studio onBack={onBack}/>:collection==='cited'||collection==='references'?<StudioCitations mode={collection}/>:collection==='published'||collection==='activity'?<BookmarksList onBack={home} onOpenProject={onOpenProject} onNewProject={onNewProject} onActivityRefreshControl={mobile&&collection==='activity'?registerActivityRefresh:undefined}/>:collection==='bookmarks'?<BookmarksList onBack={home} savedRoute onOpenProject={onOpenProject} onNewProject={onNewProject}/>:state.loading?<section className="mobile-studio studio-workbench">{!mobile&&<StudioWorkbenchHeader onBookmarks={bookmarks} onReads={reads}/>}<div className="studio-workbench-scroll"><LoadingState kind={collection==='drafts'?'studio':'overview'} label="Opening your workbench…"/></div></section>:state.error?<section className="mobile-studio studio-workbench">{!mobile&&<StudioWorkbenchHeader onBookmarks={bookmarks} onReads={reads}/>}<div className="studio-workbench-scroll"><ErrorState title="Studio could not load" description={state.error} onRetry={state.retry}/></div></section>:collection==='drafts'&&state.data?.draftsUnavailable?<ErrorState title="Drafts could not load" onRetry={state.retry}/>:collection==='drafts'?<StudioDraftsList key="drafts" drafts={[...(state.data?.drafts??[])].sort((a,b)=>(b.updatedAt??b.createdAt).localeCompare(a.updatedAt??a.createdAt))} onBack={home} onResume={setResume} onNew={onNewProject} onBookmarks={bookmarks} onReads={reads} onDiscard={async ids=>{for(const id of ids){if(!auth.user?.id||!auth.viewerProfileId)throw new Error('Sign in to discard drafts.');await discardStudioDraft(services,auth.user.id,auth.viewerProfileId,id);}state.retry();}}/>:<StudioOverview profile={profile!} draft={draft} draftsUnavailable={state.data?.draftsUnavailable} onContinue={setResume} onNew={()=>onNewProject?.()}/>;
 return <div className="studio-citation-shell"><nav className="studio-citation-pills" aria-label="Studio collections">{([...(mobile?['activity','overview']:[]),'drafts',...(!mobile?['published']:[]),'bookmarks','references','cited',...(!mobile?['activity']:[])]).map(pill=>{
 const selected=(collection??(mobile?'overview':null))===pill;
 const label=mobile&&collection==='activity'&&pill==='activity'?(activityFeedback.pending?'Refreshing\u2026':activityFeedback.error?'Retry':'Activity'):pill==='overview'?'Insights':pill[0].toUpperCase()+pill.slice(1);
 return <button data-studio-pill={pill} ref={node=>{if(node&&selected){const rail=node.parentElement;if(rail)rail.scrollLeft=node.offsetLeft-(rail.clientWidth-node.clientWidth)/2;}}} key={pill} type="button" aria-label={mobile?label:undefined} title={mobile?label:undefined} aria-pressed={selected} aria-disabled={mobile&&collection==='activity'&&pill==='activity'&&activityFeedback.pending||undefined} aria-busy={mobile&&collection==='activity'&&pill==='activity'&&activityFeedback.pending||undefined} onClick={()=>{
  if(mobile&&collection==='activity'&&pill==='activity'){
   const control=activityRefresh.current;
   if(control&&!control.pending)control.refresh();
   return;
  }
  if(savedRoute)navigate('/studio?'+new URLSearchParams({collection:pill,category:pill}));
  else setParams({collection:pill,category:pill});
 }}>{mobile?<><InterfaceIcon icon={collectionIcons[pill]} size="sm" keepColor /><span className="studio-pill-label" aria-hidden="true"><span>{label}</span></span></>:label}</button>;
 })}</nav><ScreenBack action={()=>insightsOverview?onBack():collection?home():onBack()}>{null}</ScreenBack>{content}{resume&&auth.viewerProfileId?<PublishProjectDialog key={resume.id} resumeDraft={resume} isOpen profileId={auth.viewerProfileId} categoryId={resume.categoryId} categoryLabel={profile?.categories.find(c=>c.id===resume.categoryId)?.label??'Work'} onClose={closeDraft} onPublished={mobile?finishMobileDraft:closeDraft}/>:null}</div>;
}
