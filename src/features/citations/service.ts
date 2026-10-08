import { signedMediaUrls } from '../../services/supabase/mediaUrlCache';
import { requireSupabase } from '../../services/supabase/client';
import { publicCoverUrl } from '../media/publicMediaUrl';
import { readCoverThumbnail } from '../../services/supabase/coverThumbnailReads';
import { multipartSource, readMultipartSpec } from '../../services/supabase/multipartMedia';
import type { CitationItem, CitationRecord } from './model';
export async function resolveCitationItem(id: string, documentPreview = false): Promise<CitationItem | null> {
  const client = requireSupabase();
  const { data,error } = await client.rpc('resolve_citation_item', {p_item_id:id,p_require_citable:false});
  if(error) throw new Error('Citation could not be loaded.');
  const item=data as CitationItem | null;
  if(item?.storagePath) { const urls=await signedMediaUrls('project-media',[item.storagePath]);item.sourceUrl=urls.get(item.storagePath)??undefined; }
  if (item?.kind === 'page' && !item.sourceUrl) {
    const { data: attachment } = await client.from('project_attachments').select('storage_path,metadata,file_name,mime_type').eq('id', item.attachmentId).maybeSingle();
    const original = item.documentStoragePath ?? attachment?.storage_path;
    if (original && documentPreview) item.documentSourceUrl = (await signedMediaUrls('project-media', [original])).get(original);
    const multipart = readMultipartSpec(attachment?.metadata?.multipart);
    if (original && multipart && documentPreview) {
      try { item.documentSourceUrl = await multipartSource(original, multipart, attachment?.file_name ?? 'document.pdf', attachment?.mime_type ?? 'application/pdf'); }
      catch { item.documentSourceUrl = undefined; }
    }
    const { data: project } = await client.from('projects').select('cover_thumbnail').eq('id', item.projectId).maybeSingle();
    const cover = readCoverThumbnail(project?.cover_thumbnail, item.creatorId, item.projectId);
    const variant = cover?.variants.find(v => v.size === 800);
    if (cover && variant) item.coverSourceUrl = cover.bucket === 'project-covers' ? publicCoverUrl(variant.path) : (await signedMediaUrls('project-media', [variant.path])).get(variant.path);
  }
  return item;
}
export async function resolveImageId(attachmentId: string): Promise<string | null> {
  const { data, error } = await requireSupabase().rpc('resolve_public_image_id', { p_attachment_id: attachmentId });
  if (error) throw new Error('Image could not be resolved.');
  return data as string | null;
}
export async function resolvePageId(attachmentId: string, zeroBasedPage: number): Promise<string | null> {
  const client=requireSupabase(); const {data,error}=await client.rpc('resolve_public_page_id',{p_attachment_id:attachmentId,p_page_number:zeroBasedPage+1}); if(error) throw new Error('Page could not be resolved.');return data as string|null;
}
export async function listCitations(filter: {projectId?:string;itemId?:string;outgoing?:string;incoming?:string}): Promise<CitationRecord[]> {
  let query=requireSupabase().from('citations').select('*');
  if(filter.projectId) query=query.eq('citing_project_id',filter.projectId);
  if(filter.itemId) query=query.eq('cited_item_id',filter.itemId);
  if(filter.outgoing) query=query.eq('citing_creator_id',filter.outgoing);
  if(filter.incoming) query=query.eq('cited_creator_id',filter.incoming);
  const {data,error}=await query.order('created_at',{ascending:false}).order('id'); if(error) throw new Error('Citations could not be loaded.');return (data??[]) as CitationRecord[];
}
export async function citeItem(item:CitationItem,projectId:string,creatorId:string) {
 const {data,error}=await requireSupabase().from('citations').insert({citing_project_id:projectId,cited_item_id:item.id,citing_creator_id:creatorId,cited_creator_id:item.creatorId,source:'app'}).select('*').single();if(error) throw new Error(error.code==='23505'?'Already cited in this project.':'Citation could not be saved.'); return data as CitationRecord;
}
export async function citationNote(id:string,note:string) {if(note.length>140) throw new Error('Notes must be 140 characters or fewer.');const {error}=await requireSupabase().from('citations').update({note}).eq('id',id);if(error) throw new Error('Note could not be saved.');}
export async function removeCitation(id:string) {const {error}=await requireSupabase().from('citations').delete().eq('id',id);if(error) throw new Error('Citation could not be removed.');}

export type CitingProject = {id:string;title:string;creator:string;profileId:string;categoryId:string};
export async function citationProject(id:string|null):Promise<CitingProject|null>{if(!id)return null;const {data,error}=await requireSupabase().from('projects').select('id,title,profile_id,category_id,profiles!projects_profile_id_fkey(name)').eq('id',id).maybeSingle();if(error)throw new Error('Project could not be loaded.');if(!data)return null;const row=data as unknown as {id:string;title:string;profile_id:string;category_id:string;profiles:{name:string}|null};return {id:row.id,title:row.title,profileId:row.profile_id,categoryId:row.category_id,creator:row.profiles?.name??''};}
export const citingProjectPath=(p:CitingProject)=>`/share/${p.profileId}/c/${p.categoryId}/${p.id}`;

export async function publicCitedIn(itemId:string):Promise<Array<{id:string;created_at:string;project:CitingProject|null;source?:'app'|'external';context?:string|null}>> {
 const {data,error}=await requireSupabase().rpc('public_cited_in',{p_item_id:itemId});
 if(error)throw new Error('Citations could not be loaded.');
 return data??[];
}
