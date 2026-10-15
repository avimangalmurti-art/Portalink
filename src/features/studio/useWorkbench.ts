import { useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useAccountQuery } from '../library/useAccountQuery';
import { listDeviceDrafts } from '../publishing/firstProjectDraft';
import type { DraftResume } from './workbenchModel';
import type { ProjectView } from '../../types/domain';
export type Material = {id:string;title:string;savedAt:string;view:ProjectView;href?:string;source?:string;kind?:'document';pageNumber?:number};
/** Overview and draft recovery only; other Studio collections own their reads. */
export function useWorkbench(enabled=true){
 const auth=useAuth(),services=useServices(),{revision}=useProfileData(),profileId=auth.viewerProfileId,account=auth.user?.id;
 const load=useCallback(async()=>{
  if(!enabled)return null;
  if(!profileId||!account)throw new Error('Sign in to open Studio.');
  if(!services.projects.listDrafts)throw new Error('Drafts are not available in this connection.');
  const results=await Promise.allSettled([
   services.profiles.getProfileOverview?.(profileId)??services.profiles.getProfile(profileId),
   services.projects.listDrafts(profileId),listDeviceDrafts(account,profileId),
  ]);
  const value=<T,>(i:number):T|undefined=>results[i].status==='fulfilled'?results[i].value as T:undefined;
  const profile=value<Awaited<ReturnType<typeof services.profiles.getProfile>>>(0);
  if(!profile)throw new Error('Your workspace could not load. Try again.');
  const local=value<Awaited<ReturnType<typeof listDeviceDrafts>>>(2)??[];
  const drafts=(value<Awaited<ReturnType<NonNullable<typeof services.projects.listDrafts>>>>(1)??[]).map(d=>{
   const saved=local.filter(s=>s.draft.id===d.id).sort((a,b)=>(b.updatedAt??'').localeCompare(a.updatedAt??''))[0];
   return {...d,metadata:saved?.metadata??d.metadata,updatedAt:saved?.updatedAt&&Date.parse(saved.updatedAt)>Date.parse(d.updatedAt??d.createdAt)?saved.updatedAt:d.updatedAt,stage:saved?.stage??'files'} satisfies DraftResume;
  });
  return {profile,drafts,partial:results.some(r=>r.status==='rejected'),draftsUnavailable:results[1].status==='rejected'};
 },[enabled,profileId,account,services,revision]);
 return useAccountQuery(load);
}
