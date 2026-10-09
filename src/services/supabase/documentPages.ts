import { requireSupabase } from './client';

const running = new Map<string, Promise<string | undefined>>();
export function prepareProjectDocumentPages(projectId: string): Promise<string | undefined> {
  const current = running.get(projectId);
  if (current) return current;
  const task = preparePages(projectId).finally(() => running.delete(projectId));
  running.set(projectId, task);
  return task;
}

/** Capability RPC prevents uploads before the separately approved Storage rollout. */
async function preparePages(projectId: string): Promise<string | undefined> {
  const client = requireSupabase();
  const capability = await client.rpc('document_page_prerender_enabled');
  if (capability.error || capability.data !== true) return undefined;
  const project = await client.from('projects').select('profile_id,is_hidden').eq('id', projectId).single();
  if (project.error) throw new Error('Page preparation unavailable');
  if (project.data.is_hidden) return undefined;
  const visible = await client.rpc('is_citation_project_public', { p_id: projectId });
  if (visible.error || visible.data !== true) return undefined;
  const result = await client.from('project_attachments').select('id,citation_id,storage_path,metadata,file_name,mime_type').eq('project_id', projectId).eq('kind', 'document');
  if (result.error) throw new Error('Page preparation unavailable');
  const { generateDocumentPages } = await import('../../features/media/documentPageRenderer');
  let incomplete = false;
  for (const attachment of result.data ?? []) {
    // Owner visits retry unprepared documents, not complete previews or the
    // deliberately deferred >60-page tail reserved for the local backfill.
    const metadata = attachment.metadata;
    const count = Number(metadata?.pageCount);
    const preparedCount = Math.min(count, 60);
    if (Number.isInteger(count) && count > 0 && Array.isArray(metadata?.renderedPages)
      && metadata.renderedPages.length >= preparedCount
      && !metadata?.pageRenderFailures?.length) continue;
    let sourceUrl: string;
    try {
      if (attachment.metadata?.multipart) {
        const { multipartSource, readMultipartSpec } = await import('./multipartMedia');
        const spec = readMultipartSpec(attachment.metadata.multipart);
        if (!spec) throw new Error('Invalid multipart source');
        sourceUrl = await multipartSource(attachment.storage_path, spec, attachment.file_name, attachment.mime_type);
      } else {
        const signed = await client.storage.from('project-media').createSignedUrl(attachment.storage_path, 3600);
        if (signed.error) throw new Error('Original unavailable');
        sourceUrl = signed.data.signedUrl;
      }
    } catch { incomplete = true; continue; }
    try {
      const prepared = await generateDocumentPages(sourceUrl, `${project.data.profile_id}/${projectId}/${attachment.citation_id}`, async (path, blob) => {
        const upload = await client.storage.from('project-covers').upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
        if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw new Error('Page upload failed');
      });
      const saved = await client.rpc('set_document_page_previews', { p_attachment_id: attachment.id, p_page_count: prepared.count, p_pages: prepared.pages, p_failed: prepared.failed, p_backfill_from: prepared.backfillFrom });
      if (saved.error) throw new Error('Page metadata save failed');
      incomplete ||= !!prepared.backfillFrom || prepared.failed.length > 0;
    } catch { incomplete = true; }
  }
  return incomplete ? 'Published. Some document pages still use PDF viewing and need backfill.' : undefined;
}
