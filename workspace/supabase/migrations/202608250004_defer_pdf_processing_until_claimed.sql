-- Keep original PDFs available while background jobs wait for a worker.
-- A queued page-rendering job is not an error and must not make the source
-- document look unavailable. Processing becomes visible only after a worker
-- actually claims the job.

create or replace function public.prepare_pdf_attachment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_pdf_attachment(new.mime_type, new.extension, new.file_name) then
    if new.size_bytes > 52428800 then
      raise exception using
        errcode = '22023',
        message = 'PDF files must be 50 MB or smaller';
    end if;
    if new.size_bytes <= 0 then
      raise exception using
        errcode = '22023',
        message = 'The PDF file is empty';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_pdf_post_status(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total_jobs integer;
  failed_jobs integer;
  processing_jobs integer;
  completed_jobs integer;
  completed_page_count integer;
  combined_pages jsonb;
  first_page jsonb;
  latest_error text;
begin
  select
    count(*),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'processing'),
    count(*) filter (where status = 'completed')
  into total_jobs, failed_jobs, processing_jobs, completed_jobs
  from public.pdf_processing_jobs
  where post_id = p_post_id;

  select
    coalesce(sum(j.page_count) filter (where j.status = 'completed'), 0)::integer,
    coalesce(
      jsonb_agg(page.value order by j.source_position, j.created_at, page.ordinality)
        filter (where page.value is not null),
      '[]'::jsonb
    )
  into completed_page_count, combined_pages
  from public.pdf_processing_jobs j
  left join lateral jsonb_array_elements(j.page_metadata) with ordinality as page(value, ordinality)
    on j.status = 'completed'
  where j.post_id = p_post_id;

  first_page := combined_pages -> 0;
  select error_message into latest_error
  from public.pdf_processing_jobs
  where post_id = p_post_id and status = 'failed'
  order by finished_at desc nulls last, updated_at desc
  limit 1;

  update public.projects
  set
    pdf_processing_status = case
      when total_jobs = 0 then null
      when failed_jobs > 0 then 'failed'
      when processing_jobs > 0 then 'processing'
      when completed_jobs > 0 then 'ready'
      else null
    end,
    pdf_processing_error = case when failed_jobs > 0 then latest_error else null end,
    pdf_page_count = completed_page_count,
    pdf_width = nullif(first_page ->> 'width', '')::integer,
    pdf_height = nullif(first_page ->> 'height', '')::integer,
    pdf_aspect_ratio = nullif(first_page ->> 'aspectRatio', '')::numeric,
    pdf_pages = combined_pages
  where id = p_post_id;
end;
$$;

revoke all on function public.refresh_pdf_post_status(uuid) from public;
grant execute on function public.refresh_pdf_post_status(uuid) to service_role;

create or replace function public.mark_pdf_attachment_processing_on_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'processing' and old.status is distinct from new.status then
    update public.project_attachments
    set status = 'processing'
    where id = new.attachment_id;

    perform public.refresh_pdf_post_status(new.post_id);
  end if;
  return new;
end;
$$;

drop trigger if exists pdf_job_marks_attachment_processing on public.pdf_processing_jobs;
create trigger pdf_job_marks_attachment_processing
after update of status on public.pdf_processing_jobs
for each row execute function public.mark_pdf_attachment_processing_on_claim();

-- Restore every original whose enhancement job has never started. Jobs stay
-- queued and can be claimed later without needing another backfill.
update public.project_attachments a
set status = 'ready'
from public.pdf_processing_jobs j
where j.attachment_id = a.id
  and j.status = 'queued'
  and j.attempt_count = 0
  and j.processed_pages = 0
  and a.status = 'processing';

do $$
declare
  target_post uuid;
begin
  for target_post in
    select distinct post_id
    from public.pdf_processing_jobs
    where status = 'queued'
      and attempt_count = 0
      and processed_pages = 0
  loop
    perform public.refresh_pdf_post_status(target_post);
  end loop;
end;
$$;
