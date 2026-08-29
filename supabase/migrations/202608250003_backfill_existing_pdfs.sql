-- Queue PDFs that were published before the processing trigger existed.
-- This is intentionally idempotent: attachment_id is unique in the job table,
-- so applying it again cannot duplicate work or reset a completed conversion.

insert into public.pdf_processing_jobs(
  post_id,
  attachment_id,
  source_bucket,
  source_path,
  source_position,
  status
)
select
  a.project_id,
  a.id,
  'project-media',
  a.storage_path,
  a.position,
  'queued'
from public.project_attachments a
where public.is_pdf_attachment(a.mime_type, a.extension, a.file_name)
  and a.size_bytes > 0
  and a.size_bytes <= 52428800
on conflict (attachment_id) do nothing;

update public.project_attachments a
set status = 'processing'
from public.pdf_processing_jobs j
where j.attachment_id = a.id
  and j.status in ('queued', 'processing')
  and a.status is distinct from 'processing';

do $$
declare
  target_post uuid;
begin
  for target_post in
    select distinct post_id from public.pdf_processing_jobs
  loop
    perform public.refresh_pdf_post_status(target_post);
  end loop;
end;
$$;

