import { usePresentation } from '../../presentation/usePresentation';
import { StudioCitations } from '../citations/StudioCitations';
import { useInternalContentShare } from '../sharing/InternalContentShare';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeftIcon, CopyIcon, ShareIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { ScreenBack } from '../../presentation/mobile/MobileBackNavigation';
import { useMobileScreenActions } from '../../presentation/mobile/MobileContextActions';
import { contextActions } from '../../presentation/mobile/contextActions';
import { LoadingState, ErrorState } from '../../components/ui/StateViews';
import { ProjectEditorDialog } from '../projects/ProjectEditorDialog';
import { useProjectManagement } from '../projects/useProjectManagement';
import { PublishProjectDialog } from '../publishing/PublishProjectDialog';
import { discardStudioDraft } from './discardStudioDraft';
import { readFirstProjectDraft } from '../publishing/firstProjectDraft';
import { portfolioProjectPath } from '../sharing/shareModel';
import { copyPublicLink } from '../../utils/copyPublicLink';
import type { Project, ProjectLocation } from '../../types/domain';
import { StudioPage as BookmarksList } from './StudioBookmarksList';
import { StudioDraftsList } from './StudioDraftsList';
import { StudioActionSheet } from './StudioActionSheet';
import { StudioWorkbenchHeader, StudioWorkbenchView } from './StudioWorkbenchView';
import { attentionRows, newestDraft, weeklyReads, type Attention, type DraftResume } from './workbenchModel';
import { useWorkbench, type Material } from './useWorkbench';
import './studio-workbench.css';
type Props={onBack:()=>void;onOpenProject:(id:string,location?:ProjectLocation)=>void;savedRoute?:boolean;onNewProject?:()=>void};
export function StudioPage({onBack,onOpenProject,onNewProject,savedRoute=false}:Props){
 const sendContent=useInternalContentShare(),mobile=usePresentation()==='mobile';
 const auth=useAuth(),services=useServices(),navigate=useNavigate(),[params,setParams]=useSearchParams(),state=useWorkbench(),management=useProjectManagement(auth.viewerProfileId);
 const [headerHost,setHeaderHost]=useState<HTMLElement|null>(null);
 const collection=params.get('collection')??(savedRoute?'bookmarks':params.get('category')),profile=state.data?.profile??null;
 const dismissalKey=`portalink:studio:dismissed:${auth.viewerProfileId}`;
 const [dismissals,setDismissals]=useState<{key:string;values:Record<string,number>}>(()=>({key:dismissalKey,values:{}}));
 const [resume,setResume]=useState<DraftResume|null>(null),[share,setShare]=useState<{title:string;url:string}|null>(null),[error,setError]=useState('');
 const [cover,setCover]=useState<{draftId:string;source:string;kind:Project['coverKind'];pageNumber?:number;frame?:Project['coverFrame']}|null>(null);
 useEffect(()=>{let values:Record<string,number>={};try{const parsed=JSON.parse(localStorage.getItem(dismissalKey)??'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))values=parsed;}catch{/* Per-device convenience is optional. */}setDismissals({key:dismissalKey,values});},[dismissalKey]);
 const rows=useMemo(()=>attentionRows(profile,state.data?.month,state.data?.attention?.activity??[],dismissals.key===dismissalKey?dismissals.values:{}),[profile,state.data?.month,state.data?.attention,dismissals,dismissalKey]);
 const draft=newestDraft(state.data?.drafts??[]);
 useEffect(()=>{let active=true,owned:string|undefined;setCover(null);if(draft&&auth.user?.id&&auth.viewerProfileId)void (async()=>{
  const saved=await readFirstProjectDraft(auth.user!.id,auth.viewerProfileId!,draft.id)??await readFirstProjectDraft(auth.user!.id,auth.viewerProfileId!);
  const item=saved?.draft.id===draft.id?saved.media.find(m=>m.isCover)??saved.media[0]:undefined;
  if(active&&item&&['image','document','video'].includes(item.family)){owned=URL.createObjectURL(item.file);setCover({draftId:draft.id,source:owned,kind:item.family==='image'?undefined:item.family as Project['coverKind'],pageNumber:item.metadata?.coverPageNumber,frame:item.metadata?.coverFrame});}
 })().catch(()=>undefined);return()=>{active=false;if(owned)URL.revokeObjectURL(owned);};},[draft?.id,auth.user?.id,auth.viewerProfileId]);
 useEffect(()=>{if(params.get('newProject')==='1'&&auth.hasCreatorProfile&&onNewProject){setParams({}, {replace:true});onNewProject();}},[params,auth.hasCreatorProfile,onNewProject,setParams]);
 const home=()=>{navigate('/studio',{replace:true});};
 const drafts=()=>setParams({collection:'drafts'},{replace:true}),bookmarks=()=>setParams({collection:'bookmarks'},{replace:true}),reads=()=>navigate('/insights?period=7d');
 const emptyStudio=Boolean(profile&&!profile.projects.length&&!state.data?.material.length&&!state.data?.drafts.length&&collection!=='cited'&&collection!=='references');
 const collectionHeader=!emptyStudio&&(['published','activity','all','bookmarks'].includes(collection??'')||(collection==='drafts'&&!state.loading&&!state.error&&!state.data?.draftsUnavailable));
 useMobileScreenActions(collectionHeader?null:contextActions('studio',{signedIn:auth.isAuthenticated,owner:true},{handlers:{newProject:onNewProject,drafts,bookmarks,reads}}));
 useEffect(()=>{if(management.editor.result)state.retry();},[management.editor.result]);
 function dismiss(id:string){const values={...(dismissals.key===dismissalKey?dismissals.values:{}),[id]:Date.now()};setDismissals({key:dismissalKey,values});try{localStorage.setItem(dismissalKey,JSON.stringify(values));}catch{setError('Not now is saved for this session only. Device storage is unavailable.');}}
 async function action(row:Attention){
  if(row.action==='cover'){management.editor.open(row.projectId,'cover-choice');return;}
  if(row.action==='description'){management.editor.open(row.projectId,'story');return;}
  if(row.action==='date'){management.editor.open(row.projectId,'journey');return;}
  if(row.action==='read'){navigate(`/insights?project=${row.projectId}&page=${row.activity!.page}&period=7d`);return;}
  if(row.action==='reply'){
   const event=row.activity!,query=new URLSearchParams({media:event.attachmentId,page:String(event.pageIndex+1),comments:'1'});
   navigate(`/p/${profile!.id}/c/${row.project.categoryId}/${row.projectId}?${query}`);return;
  }
  try{const address=await services.profiles.getShareAddress?.(profile!.id);setShare({title:row.project.title,url:new URL(portfolioProjectPath(profile!.id,row.project.categoryId,row.projectId,address?.handle),window.location.origin).href});}catch{setError('The project link could not load. Please try again.');}
 }
 const openMaterial=(m:Material)=>m.href?navigate(m.href):onOpenProject(m.view.project.id,{profileId:m.view.creator.id,categoryId:m.view.project.categoryId});
 const closeDraft=()=>{setResume(null);state.retry();};
 const content=collection==='cited'||collection==='references'?<StudioCitations mode={collection}/>:collection==='published'||collection==='activity'||collection==='all'?<BookmarksList headerHost={mobile?headerHost:undefined} onBack={home} onOpenProject={onOpenProject} onNewProject={onNewProject}/>:collection==='bookmarks'?<BookmarksList headerHost={mobile?headerHost:undefined} onBack={home} savedRoute onOpenProject={onOpenProject} onNewProject={onNewProject}/>:state.loading?<section className="mobile-studio studio-workbench">{!mobile&&<StudioWorkbenchHeader onBookmarks={bookmarks} onReads={reads}/>}<div className="studio-workbench-scroll"><LoadingState label="Opening your workbench…"/></div></section>:state.error?<section className="mobile-studio studio-workbench">{!mobile&&<StudioWorkbenchHeader onBookmarks={bookmarks} onReads={reads}/>}<div className="studio-workbench-scroll"><ErrorState title="Studio could not load" description={state.error} onRetry={state.retry}/></div></section>:collection==='drafts'&&state.data?.draftsUnavailable?<ErrorState title="Drafts could not load" onRetry={state.retry}/>:collection==='drafts'?<StudioDraftsList headerHost={mobile?headerHost:undefined} drafts={[...(state.data?.drafts??[])].sort((a,b)=>(b.updatedAt??b.createdAt).localeCompare(a.updatedAt??a.createdAt))} onBack={home} onResume={setResume} onNew={onNewProject} onBookmarks={bookmarks} onReads={reads} onDiscard={async ids=>{for(const id of ids){if(!auth.user?.id||!auth.viewerProfileId)throw new Error('Sign in to discard drafts.');await discardStudioDraft(services,auth.user.id,auth.viewerProfileId,id);}state.retry();}}/>:<StudioWorkbenchView hideHeader={mobile} onRetry={state.retry} draft={draft} draftCount={state.data?.drafts.length??0} attention={rows} week={weeklyReads(state.data?.week,state.data?.attention?.weeklySaved)} publishedCount={profile?.projects.length??0} material={state.data?.material??[]} partial={state.data?.partial??false} draftsUnavailable={state.data?.draftsUnavailable} cover={cover && cover.draftId===draft?.id?cover:undefined} onContinue={()=>onNewProject?.()} onDrafts={drafts} onBookmarks={bookmarks} onReads={reads} onMaterial={openMaterial} onAttention={row=>{void action(row);}} onDismiss={dismiss}/>;
 return <div className="studio-citation-shell"><header className="studio-mobile-shell-header"><div className="studio-mobile-header-controls" ref={setHeaderHost} />{mobile&&!collectionHeader&&<div className="studio-mobile-header-fallback"><button type="button" className="studio-header-back" aria-label="Back from Studio" onClick={()=>collection?home():onBack()}><ChevronLeftIcon aria-hidden="true" /></button><button type="button" className="studio-text-control" aria-label="Select items" disabled>Select</button><StudioWorkbenchHeader onBookmarks={bookmarks} onReads={reads} showBookmarks={false}/></div>}</header><ScreenBack action={()=>collection?home():onBack()}>{null}</ScreenBack><nav className="studio-citation-pills" aria-label="Studio collections">{([...(mobile?['overview']:[]),'drafts','published','bookmarks','references','cited','activity','all']).map(pill=><button data-studio-pill={pill} ref={node=>{if(node&&(collection??(mobile?'overview':'all'))===pill){const rail=node.parentElement;if(rail)rail.scrollLeft=node.offsetLeft-(rail.clientWidth-node.clientWidth)/2;}}} key={pill} type="button" aria-pressed={(collection??(mobile?'overview':'all'))===pill} onClick={()=>savedRoute?navigate('/studio?'+new URLSearchParams({collection:pill,category:pill})):setParams({collection:pill,category:pill})}>{pill[0].toUpperCase()+pill.slice(1)}</button>)}</nav>{emptyStudio?<section><p>Save it for yourself.</p><p>Cite it in your work.</p><p>Share it with someone.</p><button onClick={bookmarks}>Bookmarks</button></section>:content}{error?<p role="alert">{error}</p>:null}<ProjectEditorDialog management={management}/>{resume&&auth.viewerProfileId?<PublishProjectDialog key={resume.id} resumeDraft={resume} isOpen profileId={auth.viewerProfileId} categoryId={resume.categoryId} categoryLabel={profile?.categories.find(c=>c.id===resume.categoryId)?.label??'Work'} onClose={closeDraft} onPublished={closeDraft}/>:null}{share?<StudioActionSheet title={`Share ${share.title}`} actions={[{id:'share',label:'Share project',icon:ShareIcon,onAction:()=>sendContent(share)},{id:'copy',label:'Copy link',icon:CopyIcon,onAction:()=>{void copyPublicLink(share.url).catch(()=>setError('The link could not be copied.'));}}]} onClose={()=>setShare(null)}/>:null}</div>;
}
