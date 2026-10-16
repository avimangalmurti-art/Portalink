import type { CitationItem } from '../features/citations/model';
import { normalizePublicAppearance } from '../utils/publicAppearance';
const url=import.meta.env.VITE_SUPABASE_URL?.trim()??'';
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()??'';
/** Anonymous REST reads use the same RPCs, storage policies and public projection.
 * Authenticated mutations remain in the existing lazy service/provider stack. */
async function read(path:string, body?:unknown) {
 const response=await fetch(`${url}${path}`,{method:body===undefined?'GET':'POST',headers:{apikey:key,'content-type':'application/json'},credentials:'omit',cache:'no-store',...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!response.ok)throw new Error('Citation could not be loaded.');
 return response.json();
}
export async function readPublicCitation(id:string):Promise<CitationItem|null> {
 const item=await read('/rest/v1/rpc/resolve_citation_item',{p_item_id:id,p_require_citable:false}) as CitationItem|null;
 if(item?.storagePath){
  const path=item.storagePath.split('/').map(encodeURIComponent).join('/');
  const signed=await read(`/storage/v1/object/sign/project-media/${path}`,{expiresIn:3600});
  if(signed.signedURL)item.sourceUrl=new URL(`${url}/storage/v1${signed.signedURL}`).href;
 }
 return item;
}
export async function readCitationAppearance(id:string) {
 const rows=await read(`/rest/v1/profiles?select=public_appearance&id=eq.${encodeURIComponent(id)}`);
 return normalizePublicAppearance(rows[0]?.public_appearance);
}
export async function readCitedIn(id:string) {
 return read('/rest/v1/rpc/public_cited_in',{p_item_id:id}) as Promise<Array<{id:string;created_at:string;project:{title:string;creator:string;id:string;profileId:string;categoryId:string}}>>;
}
