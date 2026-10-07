import type { Services } from '../../services/interfaces';
import { readFirstProjectDraft, saveFirstProjectDraft, clearDraftWorkspace } from '../publishing/firstProjectDraft';
/** Use the existing upload cleanup boundary before removing a server draft. */
export async function discardStudioDraft(services: Pick<Services,'projects'|'media'>,accountId:string,profileId:string,draftId:string) {
 const local=await readFirstProjectDraft(accountId,profileId,draftId)??await readFirstProjectDraft(accountId,profileId);
 let saved=local?.draft.id===draftId?local:null;
 if(saved?.committed)throw new Error('This draft has been published. Refresh Studio before discarding it.');
 const draft=await services.projects.getDraft(draftId);
 if(draft&&draft.profileId!==profileId)throw new Error('Only the creator can discard this draft.');
 if(draft&&saved)for(const item of [...saved.persisted]) {
  if(!item.storagePath||!item.objectId)continue;
  await services.media.deleteMedia(item.objectId);
  saved={...saved,persisted:saved.persisted.filter(p=>p.objectId!==item.objectId),attachments:saved.attachments.filter(a=>a.id!==item.objectId)};
  await saveFirstProjectDraft(saved,draftId);
  const alias=await readFirstProjectDraft(accountId,profileId);
  if(alias?.draft.id===draftId)await saveFirstProjectDraft(saved);
 }
 if(draft)await services.projects.discardDraft(draftId);
 await clearDraftWorkspace(accountId,profileId,draftId);
}
