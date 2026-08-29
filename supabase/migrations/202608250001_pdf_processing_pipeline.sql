-- Durable PDF ingestion and background-processing state.
--
-- Originals remain in the private project-media bucket. A database trigger is
-- the ingestion handler: every attachment identified by MIME type OR extension
-- is size-checked, marked as processing, and enqueued in the same transaction
-- that publishes the post. A service-role Python worker claims these rows and
-- writes normalized page images under posts/{post_id}/pages/page_{index}.webp.

alter table public.projects
  add column if not exists pdf_processing_status text
    check (pdf_processing_status is null or pdf_processing_status in ('processing', 'ready', 'failed')),
  add column if not exists pdf_processing_error text,
  add column if not exists pdf_page_count integer not null default 0 check (pdf_page_count >= 0),
  add column if not exists pdf_width integer check (pdf_width is null or pdf_width > 0),
  add column if not exists pdf_height integer check (pdf_height is null or pdf_height > 0),
  add column if not exists pdf_aspect_ratio numeric check (pdf_aspect_ratio is null or pdf_aspect_ratio > 0),
  add column if not exists pdf_pages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(pdf_pages) = 'array');

create table if not exists public.pdf_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.projects(id) on delete cascade,
  attachment_id text not null unique references public.project_attachments(id) on delete cascade,
  source_bucket text not null default 'project-media',
  source_path text not null unique,
  source_position integer not null default 0,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  worker_id text,
  lease_expires_at timestamptz,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  page_offset integer not null default 0 check (page_offset >= 0),
  page_count integer check (page_count is null or page_count >= 0),
  processed_pages integer not null default 0 check (processed_pages >= 0),
  page_metadata jsonb not null default '[]'::jsonb
    check (jsonb_typeof(page_metadata) = 'array'),
  error_code text,
  error_message text,
  failed_page integer check (failed_page is null or failed_page > 0),
  is_retryable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pdf_processing_jobs_claim_idx
  on public.pdf_processing_jobs(status, available_at, created_at);
create index if not exists pdf_processing_jobs_post_idx
  on public.pdf_processing_jobs(post_id, source_position, created_at);

alter table public.pdf_processing_jobs enable row level security;

drop policy if exists pdf_jobs_visible on public.pdf_processing_jobs;
create policy pdf_jobs_visible on public.pdf_processing_jobs for select to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = pdf_processing_jobs.post_id
      and (public.owns_profile(p.profile_id) or public.can_view_profile(p.profile_id))
  )
);

grant select on public.pdf_processing_jobs to authenticated;
grant select, insert, update, delete on public.pdf_processing_jobs to service_role;

create or replace function public.is_pdf_attachment(
  p_mime_type text,
  p_extension text,
  p_file_name text
) returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(trim(coalesce(p_mime_type, ''))) = 'application/pdf'
    or lower(trim(both '.' from coalesce(p_extension, ''))) = 'pdf'
    or lower(coalesce(p_file_name, '')) like '%.pdf';
$$;

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
    new.status := 'processing';
  end if;
  return new;
end;
$$;

drop trigger if exists project_attachments_prepare_pdf on public.project_attachments;
create trigger project_attachments_prepare_pdf
before insert or update of mime_type, extension, file_name, size_bytes
on public.project_attachments
for each row execute function public.prepare_pdf_attachment();

create or replace function public.refresh_pdf_post_status(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total_jobs integer;
  failed_jobs integer;
  active_jobs integer;
  completed_page_count integer;
  combined_pages jsonb;
  first_page jsonb;
  latest_error text;
begin
  select
    count(*),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status in ('queued', 'processing'))
  into total_jobs, failed_jobs, active_jobs
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
      when active_jobs > 0 then 'processing'
      else 'ready'
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

create or replace function public.enqueue_pdf_attachment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_pdf_attachment(new.mime_type, new.extension, new.file_name) then
    insert into public.pdf_processing_jobs(
      post_id,
      attachment_id,
      source_bucket,
      source_path,
      source_position,
      status
    ) values (
      new.project_id,
      new.id,
      'project-media',
      new.storage_path,
      new.position,
      'queued'
    )
    on conflict (attachment_id) do nothing;

    perform public.refresh_pdf_post_status(new.project_id);
  end if;
  return new;
end;
$$;

drop trigger if exists project_attachments_enqueue_pdf on public.project_attachments;
create trigger project_attachments_enqueue_pdf
after insert on public.project_attachments
for each row execute function public.enqueue_pdf_attachment();

-- Claims are transactional and ordered within each post. Serial processing per
-- post lets multiple PDF attachments share one exact page namespace without
-- collisions: page indexes continue after the preceding PDF.
create or replace function public.claim_pdf_processing_job(
  p_worker_id text,
  p_lease_seconds integer default 1200
) returns table (
  id uuid,
  post_id uuid,
  attachment_id text,
  source_bucket text,
  source_path text,
  page_offset integer,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  stale_post uuid;
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker id is required';
  end if;

  -- A worker that disappears cannot leave a post spinning forever. Once every
  -- lease attempt has been exhausted, expose a clean retryable failure.
  for stale_post in
    with exhausted as (
      update public.pdf_processing_jobs
      set
        status = 'failed',
        error_code = 'worker_timeout',
        error_message = 'PDF processing stopped before it finished. The original file is safe and the preview can be retried.',
        is_retryable = true,
        finished_at = now(),
        lease_expires_at = null,
        updated_at = now()
      where status = 'processing'
        and lease_expires_at < now()
        and attempt_count >= max_attempts
      returning post_id, attachment_id
    )
    select distinct post_id from exhausted
  loop
    update public.project_attachments a
    set
      status = 'processing-failed',
      metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object(
        'processingError', 'PDF processing stopped before it finished.'
      )
    from public.pdf_processing_jobs j
    where j.post_id = stale_post
      and j.attachment_id = a.id
      and j.status = 'failed';
    perform public.refresh_pdf_post_status(stale_post);
  end loop;

  return query
  with candidate as (
    select j.id
    from public.pdf_processing_jobs j
    where (
        (j.status = 'queued' and j.available_at <= now())
        or (
          j.status = 'processing'
          and j.lease_expires_at < now()
          and j.attempt_count < j.max_attempts
        )
      )
      and not exists (
        select 1
        from public.pdf_processing_jobs failed
        where failed.post_id = j.post_id and failed.status = 'failed'
      )
      and not exists (
        select 1
        from public.pdf_processing_jobs previous
        where previous.post_id = j.post_id
          and previous.status <> 'completed'
          and (
            previous.source_position < j.source_position
            or (
              previous.source_position = j.source_position
              and previous.created_at < j.created_at
            )
          )
      )
    order by j.available_at, j.created_at
    for update skip locked
    limit 1
  ), claimed as (
    update public.pdf_processing_jobs j
    set
      status = 'processing',
      worker_id = trim(p_worker_id),
      attempt_count = j.attempt_count + 1,
      started_at = coalesce(j.started_at, now()),
      finished_at = null,
      lease_expires_at = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 3600))),
      page_offset = coalesce((
        select sum(previous.page_count)
        from public.pdf_processing_jobs previous
        where previous.post_id = j.post_id
          and previous.status = 'completed'
          and (
            previous.source_position < j.source_position
            or (
              previous.source_position = j.source_position
              and previous.created_at < j.created_at
            )
          )
      ), 0)::integer,
      error_code = null,
      error_message = null,
      failed_page = null,
      updated_at = now()
    from candidate
    where j.id = candidate.id
    returning j.*
  )
  select
    claimed.id,
    claimed.post_id,
    claimed.attachment_id,
    claimed.source_bucket,
    claimed.source_path,
    claimed.page_offset,
    claimed.attempt_count
  from claimed;
end;
$$;

revoke all on function public.claim_pdf_processing_job(text, integer) from public;
grant execute on function public.claim_pdf_processing_job(text, integer) to service_role;

create or replace function public.report_pdf_processing_progress(
  p_job_id uuid,
  p_processed_pages integer,
  p_lease_seconds integer default 1200
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pdf_processing_jobs
  set
    processed_pages = greatest(processed_pages, p_processed_pages),
    lease_expires_at = now() + make_interval(secs => greatest(60, least(p_lease_seconds, 3600))),
    updated_at = now()
  where id = p_job_id and status = 'processing';

  if not found then
    raise exception 'Active PDF processing job not found';
  end if;
end;
$$;

revoke all on function public.report_pdf_processing_progress(uuid, integer, integer) from public;
grant execute on function public.report_pdf_processing_progress(uuid, integer, integer) to service_role;

create or replace function public.complete_pdf_processing_job(
  p_job_id uuid,
  p_page_count integer,
  p_pages jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.pdf_processing_jobs%rowtype;
  page jsonb;
  ordinal bigint;
  expected_index integer;
  first_page jsonb;
begin
  select * into job
  from public.pdf_processing_jobs
  where pdf_processing_jobs.id = p_job_id
  for update;

  if job.id is null then raise exception 'PDF processing job not found'; end if;
  if job.status <> 'processing' then raise exception 'PDF processing job is not active'; end if;
  if p_page_count < 1
    or jsonb_typeof(p_pages) <> 'array'
    or jsonb_array_length(p_pages) <> p_page_count
  then
    raise exception 'Invalid PDF page metadata';
  end if;

  for page, ordinal in
    select value, ordinality
    from jsonb_array_elements(p_pages) with ordinality
  loop
    expected_index := job.page_offset + ordinal::integer;
    if nullif(page ->> 'index', '')::integer is distinct from expected_index
      or page ->> 'storagePath' is distinct from format(
        'posts/%s/pages/page_%s.webp', job.post_id, expected_index
      )
      or coalesce(nullif(page ->> 'width', '')::integer, 0) <= 0
      or coalesce(nullif(page ->> 'height', '')::integer, 0) <= 0
      or coalesce(nullif(page ->> 'aspectRatio', '')::numeric, 0) <= 0
    then
      raise exception 'Invalid metadata for PDF page %', ordinal;
    end if;
  end loop;

  first_page := p_pages -> 0;

  update public.pdf_processing_jobs
  set
    status = 'completed',
    page_count = p_page_count,
    processed_pages = p_page_count,
    page_metadata = p_pages,
    error_code = null,
    error_message = null,
    failed_page = null,
    is_retryable = true,
    lease_expires_at = null,
    finished_at = now(),
    updated_at = now()
  where id = p_job_id;

  update public.project_attachments
  set
    status = 'ready',
    metadata = (
      coalesce(metadata, '{}'::jsonb)
      - 'processingError'
      - 'failedPage'
    ) || jsonb_build_object(
      'pageCount', p_page_count,
      'widthPixels', (first_page ->> 'width')::integer,
      'heightPixels', (first_page ->> 'height')::integer,
      'aspectRatio', (first_page ->> 'aspectRatio')::numeric,
      'renderedPages', p_pages
    )
  where id = job.attachment_id;

  perform public.refresh_pdf_post_status(job.post_id);
end;
$$;

revoke all on function public.complete_pdf_processing_job(uuid, integer, jsonb) from public;
grant execute on function public.complete_pdf_processing_job(uuid, integer, jsonb) to service_role;

create or replace function public.fail_pdf_processing_job(
  p_job_id uuid,
  p_error_code text,
  p_error_message text,
  p_failed_page integer default null,
  p_is_retryable boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.pdf_processing_jobs%rowtype;
  clean_message text;
begin
  select * into job
  from public.pdf_processing_jobs
  where pdf_processing_jobs.id = p_job_id
  for update;

  if job.id is null then raise exception 'PDF processing job not found'; end if;
  clean_message := left(coalesce(nullif(trim(p_error_message), ''), 'The PDF preview could not be prepared.'), 1000);

  update public.pdf_processing_jobs
  set
    status = 'failed',
    processed_pages = greatest(coalesce(p_failed_page, 1) - 1, 0),
    error_code = left(coalesce(nullif(trim(p_error_code), ''), 'conversion_failed'), 80),
    error_message = clean_message,
    failed_page = p_failed_page,
    is_retryable = p_is_retryable,
    lease_expires_at = null,
    finished_at = now(),
    updated_at = now()
  where id = p_job_id;

  update public.project_attachments
  set
    status = 'processing-failed',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'processingError', clean_message,
      'failedPage', p_failed_page
    )
  where id = job.attachment_id;

  perform public.refresh_pdf_post_status(job.post_id);
end;
$$;

revoke all on function public.fail_pdf_processing_job(uuid, text, text, integer, boolean) from public;
grant execute on function public.fail_pdf_processing_job(uuid, text, text, integer, boolean) to service_role;

create or replace function public.retry_pdf_processing(p_attachment_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.pdf_processing_jobs%rowtype;
begin
  select j.* into job
  from public.pdf_processing_jobs j
  join public.projects p on p.id = j.post_id
  where j.attachment_id = p_attachment_id
    and public.owns_profile(p.profile_id)
  for update of j;

  if job.id is null then raise exception 'PDF processing job not found'; end if;
  if job.status <> 'failed' then raise exception 'Only failed PDF processing can be retried'; end if;
  if not job.is_retryable then raise exception 'This PDF cannot be processed without replacing the source file'; end if;

  update public.pdf_processing_jobs
  set
    status = 'queued',
    attempt_count = 0,
    worker_id = null,
    lease_expires_at = null,
    available_at = now(),
    started_at = null,
    finished_at = null,
    processed_pages = 0,
    error_code = null,
    error_message = null,
    failed_page = null,
    updated_at = now()
  where id = job.id;

  update public.project_attachments
  set
    status = 'processing',
    metadata = coalesce(metadata, '{}'::jsonb) - 'processingError' - 'failedPage'
  where id = job.attachment_id;

  perform public.refresh_pdf_post_status(job.post_id);

  return jsonb_build_object(
    'objectId', job.attachment_id,
    'state', 'processing',
    'message', 'The PDF preview has been queued again.',
    'isRetryable', true,
    'updatedAt', now()
  );
end;
$$;

revoke all on function public.retry_pdf_processing(text) from public;
grant execute on function public.retry_pdf_processing(text) to authenticated;

-- Generated pages are private objects. Signed URLs can be created only when the
-- requesting viewer can see the owning post (or owns it).
drop policy if exists project_media_pdf_page_read on storage.objects;
create policy project_media_pdf_page_read on storage.objects for select to anon, authenticated
using (
  bucket_id = 'project-media'
  and (storage.foldername(name))[1] = 'posts'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and (
        public.owns_profile(p.profile_id)
        or (not p.is_hidden and public.can_view_profile(p.profile_id))
      )
  )
);
