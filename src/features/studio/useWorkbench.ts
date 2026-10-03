import { useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useAccountQuery } from '../library/useAccountQuery';
import { loadSavedPageBatch } from '../library/collectionQueries';
import { listDeviceDrafts } from '../publishing/firstProjectDraft';
import { mediaInteractionRequest } from '../media-interactions/mediaInteractionRequest';
import type { DraftResume, StudioAttentionData } from './workbenchModel';
import type { ProjectView } from '../../types/domain';
export type Material = {id:string;title:string;savedAt:string;view:ProjectView;href?:string;source?:string;kind?:'document';pageNumber?:number};
export function useWorkbench(){
 const auth=useAuth(),services=useServices(),{revision}=useProfileData(),profileId=auth.viewerProfileId,account=auth.user?.id;
 const load=useCallback(async()=>{
  if(!profileId||!account)throw new Error('Sign in to open Studio.');
  if(!services.projects.listDrafts)throw new Error('Drafts are not available in this connection.');
  const results=await Promise.allSettled([
   services.profiles.getProfile(profileId),services.projects.listDrafts(profileId),listDeviceDrafts(account,profileId),
   services.reads?.list('7d')??Promise.reject(new Error('Reads are unavailable.')),
   services.reads?.list('30d')??Promise.reject(new Error('Reads are unavailable.')),
   mediaInteractionRequest<StudioAttentionData>('/api/studio/attention',undefined,true,account),
   loadSavedPageBatch(services.projects,null),
   (async()=>{const entries=await services.engagement.listSavedProjectEntries?.();if(!entries)throw new Error('Saved project timestamps are unavailable.');const views=await services.projects.listProjectViews(entries.map(e=>e.projectId));return entries.flatMap(e=>{const view=views.find(v=>v.project.id===e.projectId);return view?[{id:`project:${e.projectId}`,title:view.project.title,savedAt:e.savedAt,view}]:[];});})(),
  ]);
  const value=<T,>(i:number):T|undefined=>results[i].status==='fulfilled'?results[i].value as T:undefined;
  const profile=value<Awaited<ReturnType<typeof services.profiles.getProfile>>>(0);
  if(!profile)throw new Error('Your workspace could not load. Try again.');
  const local=value<Awaited<ReturnType<typeof listDeviceDrafts>>>(2)??[];
  const drafts=(value<Awaited<ReturnType<NonNullable<typeof services.projects.listDrafts>>>>(1)??[]).map(d=>{
   const saved=local.filter(s=>s.draft.id===d.id).sort((a,b)=>(b.updatedAt??'').localeCompare(a.updatedAt??''))[0];
   return {...d,metadata:saved?.metadata??d.metadata,updatedAt:saved?.updatedAt&&Date.parse(saved.updatedAt)>Date.parse(d.updatedAt??d.createdAt)?saved.updatedAt:d.updatedAt,stage:saved?.stage??'files'} satisfies DraftResume;
  });
  const pages=value<Awaited<ReturnType<typeof loadSavedPageBatch>>>(6);
  const material:Material[]=[...(value<Material[]>(7)??[]),...(pages?.items??[]).flatMap(e=>e.presentation?[{id:`page:${e.target.projectId}:${e.target.attachmentId}:${e.target.pageIndex}`,title:`${e.presentation.view.project.title} · ${e.presentation.label}`,savedAt:e.target.savedAt,view:e.presentation.view,href:e.presentation.href,source:e.presentation.source??undefined,kind:e.presentation.kind,pageNumber:e.presentation.pageNumber}]:[])].sort((a,b)=>Date.parse(b.savedAt.includes('T')?b.savedAt:b.savedAt.replace(' ','T')+'Z')-Date.parse(a.savedAt.includes('T')?a.savedAt:a.savedAt.replace(' ','T')+'Z')||a.id.localeCompare(b.id));
  return {profile,drafts,material,week:value<Awaited<ReturnType<NonNullable<typeof services.reads>['list']>>>(3),month:value<Awaited<ReturnType<NonNullable<typeof services.reads>['list']>>>(4),attention:value<StudioAttentionData>(5),partial:results.some(r=>r.status==='rejected'),draftsUnavailable:results[1].status==='rejected'};
 },[profileId,account,services,revision]);
 return useAccountQuery(load);
}
