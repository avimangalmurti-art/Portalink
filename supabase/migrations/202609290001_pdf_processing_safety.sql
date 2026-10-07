-- Coordinated PDF worker upgrade: stop old workers before applying, then start
-- the v2 worker. Existing originals, completed pages and queue rows are retained.
begin;

alter table public.pdf_processing_jobs add column if not exists lease_token uuid;

-- Supabase may grant browser roles EXECUTE directly through default privileges.
-- PUBLIC-only revocation does not remove those grants. Unfenced legacy worker
-- entry points are disabled for service_role too; no mixed-worker rollout.
revoke all on function public.claim_pdf_processing_job(text, integer),
  public.report_pdf_processing_progress(uuid, integer, integer),
  public.complete_pdf_processing_job(uuid, integer, jsonb),
  public.fail_pdf_processing_job(uuid, text, text, integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_pdf_post_status(uuid),
  public.enqueue_pdf_attachment(), public.mark_pdf_attachment_processing_on_claim()
  from public, anon, authenticated;
grant execute on function public.refresh_pdf_post_status(uuid) to service_role;

-- Count each job once, before expanding its pages. Summing page_count after the
-- lateral expansion multiplies an N-page job's contribution by N.
create or replace function public.refresh_pdf_post_status(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  total_jobs integer; failed_jobs integer; processing_jobs integer; completed_jobs integer;
  completed_page_count integer; combined_pages jsonb; first_page jsonb; latest_error text;
begin
  select count(*), count(*) filter (where j.status = 'failed'),
    count(*) filter (where j.status = 'processing'), count(*) filter (where j.status = 'completed'),
    coalesce(sum(j.page_count) filter (where j.status = 'completed'), 0)::integer
  into total_jobs, failed_jobs, processing_jobs, completed_jobs, completed_page_count
  from public.pdf_processing_jobs j where j.post_id = p_post_id;
  select coalesce(jsonb_agg(page.value order by j.source_position, j.created_at, j.id, page.ordinality)
    filter (where page.value is not null), '[]'::jsonb)
  into combined_pages from public.pdf_processing_jobs j
  left join lateral jsonb_array_elements(j.page_metadata) with ordinality as page(value, ordinality)
    on j.status = 'completed' where j.post_id = p_post_id;
  first_page := combined_pages -> 0;
  select j.error_message into latest_error from public.pdf_processing_jobs j
    where j.post_id = p_post_id and j.status = 'failed'
    order by j.finished_at desc nulls last, j.updated_at desc limit 1;
  update public.projects p set pdf_processing_status = case
      when total_jobs = 0 then null when failed_jobs > 0 then 'failed'
      when processing_jobs > 0 then 'processing' when completed_jobs > 0 then 'ready' else null end,
    pdf_processing_error = case when failed_jobs > 0 then latest_error else null end,
    pdf_page_count = completed_page_count, pdf_width = nullif(first_page ->> 'width', '')::integer,
    pdf_height = nullif(first_page ->> 'height', '')::integer,
    pdf_aspect_ratio = nullif(first_page ->> 'aspectRatio', '')::numeric,
    pdf_pages = combined_pages where p.id = p_post_id;
end;
$$;

create or replace function public.claim_pdf_processing_job_v2(
  p_worker_id text, p_lease_seconds integer default 1200
) returns table (
  id uuid, post_id uuid, attachment_id text, source_bucket text, source_path text,
  page_offset integer, attempt_count integer, lease_token uuid
)
language plpgsql security definer set search_path = public as $$
declare stale_post uuid;
begin
  if nullif(trim(p_worker_id), '') is null then raise exception 'worker id is required'; end if;

  for stale_post in
    with exhausted as (
      update public.pdf_processing_jobs j set
        status = 'failed', error_code = 'worker_timeout',
        error_message = 'PDF processing stopped before it finished. The original file is safe and the preview can be retried.',
        is_retryable = true, finished_at = now(), lease_expires_at = null,
        lease_token = null, updated_at = now()
      where j.status = 'processing' and j.lease_expires_at < now()
        and j.attempt_count >= j.max_attempts
      returning j.post_id
    ) select distinct e.post_id from exhausted e
  loop
    update public.project_attachments a set status = 'processing-failed',
      metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object(
        'processingError', 'PDF processing stopped before it finished.')
    from public.pdf_processing_jobs j
    where j.post_id = stale_post and j.attachment_id = a.id and j.status = 'failed';
    perform public.refresh_pdf_post_status(stale_post);
  end loop;

  return query
  with candidate as (
    select j.id from public.pdf_processing_jobs j
    where ((j.status = 'queued' and j.available_at <= now())
      or (j.status = 'processing' and j.lease_expires_at < now() and j.attempt_count < j.max_attempts))
      and not exists (select 1 from public.pdf_processing_jobs failed
        where failed.post_id = j.post_id and failed.status = 'failed')
      and not exists (select 1 from public.pdf_processing_jobs previous
        where previous.post_id = j.post_id and previous.status <> 'completed'
          and (previous.source_position, previous.created_at, previous.id)
            < (j.source_position, j.created_at, j.id))
    order by j.available_at, j.created_at, j.id
    for update skip locked limit 1
  ), claimed as (
    update public.pdf_processing_jobs j set
      status = 'processing', worker_id = trim(p_worker_id),
      attempt_count = j.attempt_count + 1, lease_token = gen_random_uuid(),
      started_at = coalesce(j.started_at, now()), finished_at = null,
      lease_expires_at = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 3600))),
      page_offset = coalesce((select sum(previous.page_count)
        from public.pdf_processing_jobs previous
        where previous.post_id = j.post_id and previous.status = 'completed'
          and (previous.source_position, previous.created_at, previous.id)
            < (j.source_position, j.created_at, j.id)), 0)::integer,
      processed_pages = 0, page_count = null, page_metadata = '[]'::jsonb,
      error_code = null, error_message = null, failed_page = null, updated_at = now()
    from candidate where j.id = candidate.id returning j.*
  ) select c.id, c.post_id, c.attachment_id, c.source_bucket, c.source_path,
      c.page_offset, c.attempt_count, c.lease_token from claimed c;
end;
$$;

create or replace function public.report_pdf_processing_progress_v2(
  p_job_id uuid, p_lease_token uuid, p_processed_pages integer,
  p_lease_seconds integer default 1200
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_processed_pages is null or p_processed_pages < 0 then raise exception 'Invalid PDF progress'; end if;
  update public.pdf_processing_jobs j set
    processed_pages = greatest(j.processed_pages, p_processed_pages),
    lease_expires_at = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 3600))),
    updated_at = now()
  where j.id = p_job_id and j.status = 'processing' and j.lease_token = p_lease_token
    and j.lease_expires_at > now();
  return found;
end;
$$;

create or replace function public.complete_pdf_processing_job_v2(
  p_job_id uuid, p_lease_token uuid, p_page_count integer, p_pages jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  job public.pdf_processing_jobs%rowtype;
  page jsonb;
  ordinal bigint;
  expected_index integer;
  expected_path text;
  page_width integer;
  page_height integer;
  page_ratio numeric;
  first_page jsonb;
begin
  select j.* into job from public.pdf_processing_jobs j where j.id = p_job_id for update;
  if job.id is null or p_lease_token is null or job.lease_token is distinct from p_lease_token then return false; end if;
  -- A worker may safely retry an acknowledged-or-lost completion with identical
  -- metadata. Completed output can never be replaced by a stale attempt.
  if job.status = 'completed' then
    return job.page_count is not distinct from p_page_count and job.page_metadata is not distinct from p_pages;
  end if;
  if job.status <> 'processing' or job.lease_expires_at is null or job.lease_expires_at <= now() then return false; end if;
  if p_page_count is null or p_page_count < 1 or p_pages is null
    or jsonb_typeof(p_pages) <> 'array' or jsonb_array_length(p_pages) <> p_page_count
  then raise exception 'Invalid PDF page metadata'; end if;

  for page, ordinal in select value, ordinality from jsonb_array_elements(p_pages) with ordinality
  loop
    expected_index := job.page_offset + ordinal::integer;
    expected_path := format('posts/%s/pages/%s/%s/page_%s.webp', job.post_id, job.id, job.lease_token, expected_index);
    page_width := nullif(page ->> 'width', '')::integer;
    page_height := nullif(page ->> 'height', '')::integer;
    page_ratio := nullif(page ->> 'aspectRatio', '')::numeric;
    if jsonb_typeof(page) <> 'object'
      or nullif(page ->> 'index', '')::integer is distinct from expected_index
      or nullif(page ->> 'withinDocumentIndex', '')::integer is distinct from ordinal::integer
      or page ->> 'attachmentId' is distinct from job.attachment_id
      or page ->> 'storagePath' is distinct from expected_path
      or page_width is null or page_width not between 1 and 2048
      or page_height is null or page_height not between 1 and 2048
      or page_ratio is null or abs(page_ratio - page_width::numeric / nullif(page_height, 0)) > 0.000001
      or not exists (select 1 from storage.objects o where o.bucket_id = 'project-media' and o.name = expected_path)
    then raise exception 'Invalid metadata or missing object for PDF page %', ordinal; end if;
  end loop;
  first_page := p_pages -> 0;
  update public.pdf_processing_jobs j set status = 'completed', page_count = p_page_count,
    processed_pages = p_page_count, page_metadata = p_pages, error_code = null,
    error_message = null, failed_page = null, is_retryable = true, lease_expires_at = null,
    finished_at = now(), updated_at = now() where j.id = job.id;
  update public.project_attachments a set status = 'ready',
    metadata = (coalesce(a.metadata, '{}'::jsonb) - 'processingError' - 'failedPage') || jsonb_build_object(
      'pageCount', p_page_count, 'widthPixels', (first_page ->> 'width')::integer,
      'heightPixels', (first_page ->> 'height')::integer,
      'aspectRatio', (first_page ->> 'aspectRatio')::numeric, 'renderedPages', p_pages)
  where a.id = job.attachment_id;
  perform public.refresh_pdf_post_status(job.post_id);
  return true;
end;
$$;

create or replace function public.fail_pdf_processing_job_v2(
  p_job_id uuid, p_lease_token uuid, p_error_code text, p_error_message text,
  p_failed_page integer default null, p_is_retryable boolean default true
) returns boolean language plpgsql security definer set search_path = public as $$
declare job public.pdf_processing_jobs%rowtype; clean_message text;
begin
  select j.* into job from public.pdf_processing_jobs j where j.id = p_job_id for update;
  if job.id is null or p_lease_token is null or job.lease_token is distinct from p_lease_token
    or job.status <> 'processing' or job.lease_expires_at is null or job.lease_expires_at <= now()
  then return false; end if;
  clean_message := left(coalesce(nullif(trim(p_error_message), ''), 'The PDF preview could not be prepared.'), 1000);
  update public.pdf_processing_jobs j set status = 'failed',
    processed_pages = greatest(coalesce(p_failed_page, 1) - 1, 0),
    error_code = left(coalesce(nullif(trim(p_error_code), ''), 'conversion_failed'), 80),
    error_message = clean_message, failed_page = p_failed_page,
    is_retryable = coalesce(p_is_retryable, true), lease_expires_at = null,
    finished_at = now(), updated_at = now() where j.id = job.id;
  update public.project_attachments a set status = 'processing-failed',
    metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object('processingError', clean_message, 'failedPage', p_failed_page)
    where a.id = job.attachment_id;
  perform public.refresh_pdf_post_status(job.post_id);
  return true;
end;
$$;

-- Preserve the frontend's owner-only retry contract. A new claim always creates
-- a fresh token; reset it immediately too so a prior attempt cannot revive.
create or replace function public.retry_pdf_processing(p_attachment_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.pdf_processing_jobs%rowtype;
begin
  select j.* into job from public.pdf_processing_jobs j
    join public.projects p on p.id = j.post_id
    where j.attachment_id = p_attachment_id and public.owns_profile(p.profile_id) for update of j;
  if job.id is null then raise exception 'PDF processing job not found'; end if;
  if job.status <> 'failed' then raise exception 'Only failed PDF processing can be retried'; end if;
  if not job.is_retryable then raise exception 'This PDF cannot be processed without replacing the source file'; end if;
  update public.pdf_processing_jobs j set status = 'queued', attempt_count = 0,
    worker_id = null, lease_token = null, lease_expires_at = null, available_at = now(),
    started_at = null, finished_at = null, processed_pages = 0, page_count = null, page_metadata = '[]'::jsonb,
    error_code = null, error_message = null, failed_page = null, updated_at = now() where j.id = job.id;
  update public.project_attachments a set status = 'processing',
    metadata = coalesce(a.metadata, '{}'::jsonb) - 'processingError' - 'failedPage' where a.id = job.attachment_id;
  perform public.refresh_pdf_post_status(job.post_id);
  return jsonb_build_object('objectId', job.attachment_id, 'state', 'processing',
    'message', 'The PDF preview has been queued again.', 'isRetryable', true, 'updatedAt', now());
end;
$$;

revoke all on function public.claim_pdf_processing_job_v2(text, integer),
  public.report_pdf_processing_progress_v2(uuid, uuid, integer, integer),
  public.complete_pdf_processing_job_v2(uuid, uuid, integer, jsonb),
  public.fail_pdf_processing_job_v2(uuid, uuid, text, text, integer, boolean),
  public.retry_pdf_processing(text) from public, anon, authenticated;
grant execute on function public.claim_pdf_processing_job_v2(text, integer),
  public.report_pdf_processing_progress_v2(uuid, uuid, integer, integer),
  public.complete_pdf_processing_job_v2(uuid, uuid, integer, jsonb),
  public.fail_pdf_processing_job_v2(uuid, uuid, text, text, integer, boolean) to service_role;
grant execute on function public.retry_pdf_processing(text) to authenticated;

notify pgrst, 'reload schema';
commit;
