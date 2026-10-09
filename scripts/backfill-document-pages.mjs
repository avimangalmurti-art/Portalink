import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { prepareDocumentPages } from '../src/features/media/documentPages.mjs';
import { createNodeRuntime, readMultipartSource } from './backfill-cover-thumbnails.mjs';

/** Dry-run by default. Credentials only from the process environment; no dotenv. */
export async function backfillDocumentPages(client, { apply = false, log = console.log } = {}) {
  const capability = await client.rpc('document_page_prerender_enabled');
  if (apply && (capability.error || capability.data !== true)) throw new Error('Reviewed preview migration is required before --apply');
  let after = null;
  const summary = { documents: 0, rendered: 0, failed: 0 };
  for (;;) {
    let query = client.from('project_attachments').select('id,citation_id,storage_path,metadata,project_id,projects!inner(id,profile_id,is_hidden,profiles!inner(is_private),portfolio_categories!inner(is_hidden))').eq('kind','document').eq('projects.is_hidden',false).eq('projects.profiles.is_private',false).eq('projects.portfolio_categories.is_hidden',false).order('id').limit(25);
    if(after) query=query.gt('id',after);
    const { data, error } = await query;
    if(error) throw new Error('Public document inventory failed');
    for(const attachment of data??[]) {
      summary.documents++;
      log(JSON.stringify({ attachmentId: attachment.id, citationId: attachment.citation_id, action: apply?'prepare':'plan' }));
      if(!apply) continue;
      try {
        // Keep only this document in memory, including verified multipart reconstruction.
        const read = async path => {
          const source=await client.storage.from('project-media').download(path);
          if(source.error) throw new Error('Original download failed');
          return new Uint8Array(await source.data.arrayBuffer());
        };
        let bytes = attachment.metadata?.multipart
          ? await readMultipartSource(read,attachment.storage_path,attachment.metadata.multipart)
          : await read(attachment.storage_path);
        if(bytes.length>256*1024*1024) throw new Error('Source exceeds local rendering memory budget');
        const runtime=await createNodeRuntime(async()=>bytes);
        const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
        const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useWorkerFetch:false});
        try {
        const document=await task.promise, count=document.numPages;
        const project=Array.isArray(attachment.projects)?attachment.projects[0]:attachment.projects;
        const prefix=`${project.profile_id}/${project.id}/${attachment.citation_id}`;
        const prepared=await prepareDocumentPages({count,limit:5000,
          render:async(number,size)=>{
            const page=await document.getPage(number),base=page.getViewport({scale:1});
            const viewport=page.getViewport({scale:size/Math.max(base.width,base.height)});
            const canvas=runtime.createCanvas(Math.max(1,Math.round(viewport.width)),Math.max(1,Math.round(viewport.height)));
            try{
              await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'}).promise;
              return{blob:await runtime.encodeWebp(canvas),width:canvas.width,height:canvas.height};
            }finally{page.cleanup();canvas.width=canvas.height=0;}
          },
          path:async(number,size,blob)=>`${prefix}/${number}-${createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex')}-${size}.webp`,
          upload:async(path,blob)=>{
            const result=await client.storage.from('project-covers').upload(path,blob,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
            if(result.error&&!/already exists|duplicate/i.test(result.error.message))throw new Error('Preview upload failed');
          }});
        bytes=null;
        const saved=await client.rpc('set_document_page_previews',{p_attachment_id:attachment.id,p_page_count:count,p_pages:prepared.pages,p_failed:prepared.failed,p_backfill_from:null});
        if(saved.error)throw new Error('Preview metadata save failed');
        summary.rendered+=prepared.pages.length;summary.failed+=prepared.failed.length;
        log(JSON.stringify({attachmentId:attachment.id,pages:prepared.pages.length,failed:prepared.failed}));
        } finally { await task.destroy(); }
      } catch { summary.failed++; log(JSON.stringify({attachmentId:attachment.id,status:'failed; PDF fallback retained'})); }
    }
    if(!data?.length||data.length<25)break;
    after=data.at(-1).id;
  }
  return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const allowed=new Set(['--apply']);
  if(process.argv.slice(2).some(arg=>!allowed.has(arg)))throw new Error('Usage: node scripts/backfill-document-pages.mjs [--apply]');
  const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY}=process.env;
  if(!SUPABASE_URL||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL)||!SUPABASE_SERVICE_ROLE_KEY)throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the process environment only');
  const {createClient}=await import('@supabase/supabase-js');
  const client=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  backfillDocumentPages(client,{apply:process.argv.includes('--apply')}).then(result=>{console.log(JSON.stringify(result));if(result.failed)process.exitCode=1;}).catch(()=>{console.error('Backfill stopped; inspect permissions and reviewed migration. No credentials logged.');process.exitCode=1;});
}
