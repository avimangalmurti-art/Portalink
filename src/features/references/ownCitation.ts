import {resolveCitationItem,resolveImageId,resolvePageId} from '../citations/service';
import {plainCitation} from '../citations/model';
import {PUBLIC_ORIGIN} from '../citations/publicOrigin';
export async function ownPageCitation(profileId:string,projectId:string,attachmentId:string,pageIndex:number):Promise<string>{
 const imageId=await resolveImageId(attachmentId),id=imageId??await resolvePageId(attachmentId,pageIndex);const item=id?await resolveCitationItem(id):null;
 if(!item||item.creatorId!==profileId||item.projectId!==projectId)throw new Error('This page’s citation is unavailable.');
 return plainCitation(item,PUBLIC_ORIGIN);
}
