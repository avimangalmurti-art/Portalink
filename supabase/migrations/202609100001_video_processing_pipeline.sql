-- Originals stay untouched. Only completed, fenced worker attempts publish a playback copy.
begin;

create table public.video_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  attachment_id text not null unique references public.project_attachments(id) on delete cascade,
  source_path text not null,
  source_size bigint not null check (source_size > 0),
  source_multipart jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  lease_token uuid,
  lease_expires_at timestamptz,
  available_at timestamptz not null default now(),
  output_path text,
  error_message text,
  is_retryable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index video_jobs_claim on public.video_processing_jobs(status, available_at, created_at);
alter table public.video_processing_jobs enable row level security;
create policy video_jobs_read on public.video_processing_jobs for select to anon, authenticated
using (exists (select 1 from public.projects p where p.id = project_id
  and (public.owns_profile(p.profile_id) or (not p.is_hidden and public.can_view_profile(p.profile_id)))));
grant select on public.video_processing_jobs to anon, authenticated;
grant all on public.video_processing_jobs to service_role;

create function public.is_video_attachment(p_mime text, p_extension text, p_name text)
returns boolean language sql immutable set search_path = public as $$
  select lower(coalesce(p_mime, '')) like 'video/%'
    or lower(trim(both '.' from coalesce(p_extension, ''))) in ('mov', 'm4v', 'avi', 'mp4', 'webm')
    or lower(coalesce(p_name, '')) ~ '\.(mov|m4v|avi|mp4|webm)$';
$$;

create function public.enqueue_video_attachment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_video_attachment(new.mime_type, new.extension, new.file_name)
     and new.size_bytes > 0 and exists (select 1 from public.projects p
       where p.id = new.project_id and public.path_profile_id(new.storage_path) = p.profile_id) then
    insert into public.video_processing_jobs(project_id, attachment_id, source_path, source_size, source_multipart)
      values (new.project_id, new.id, new.storage_path, new.size_bytes, new.metadata -> 'multipart')
    on conflict (attachment_id) do update set source_path = excluded.source_path,
      source_size = excluded.source_size, source_multipart = excluded.source_multipart,
      status = 'queued', attempt_count = 0, lease_token = null, lease_expires_at = null,
      output_path = null, error_message = null, is_retryable = true, available_at = now(), updated_at = now()
    where video_processing_jobs.source_path is distinct from excluded.source_path
       or video_processing_jobs.source_size is distinct from excluded.source_size;
    if found then
      update public.project_attachments set kind = 'video',
        status = case when lower(new.extension) in ('mp4', 'webm') then 'ready' else 'processing' end,
        metadata = coalesce(metadata, '{}'::jsonb) - 'playbackVideo' - 'processingError'
      where id = new.id;
    end if;
  elsif tg_op = 'UPDATE' then
    delete from public.video_processing_jobs where attachment_id = new.id;
    update public.project_attachments set metadata = coalesce(metadata, '{}'::jsonb) - 'playbackVideo' - 'processingError'
      where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_video_attachment() from public, anon, authenticated;
create trigger project_attachments_enqueue_video
after insert or update of storage_path, size_bytes, mime_type, extension, file_name
on public.project_attachments for each row execute function public.enqueue_video_attachment();

create function public.claim_video_processing_job(p_lease_seconds integer default 180)
returns setof public.video_processing_jobs language plpgsql security definer set search_path = public as $$
declare claimed public.video_processing_jobs%rowtype;
begin
  -- A lost worker is retried a bounded number of times; its token can never complete a later attempt.
  update public.video_processing_jobs set status = case when attempt_count >= max_attempts then 'failed' else 'queued' end,
    error_message = 'Video conversion was interrupted.', lease_token = null, lease_expires_at = null, updated_at = now()
  where status = 'processing' and lease_expires_at < now();
  update public.project_attachments a set status = 'processing-failed'
    from public.video_processing_jobs j where j.attachment_id = a.id and j.status = 'failed'
      and a.status = 'processing';
  select * into claimed from public.video_processing_jobs
    where status = 'queued' and available_at <= now() and attempt_count < max_attempts
    order by created_at for update skip locked limit 1;
  if claimed.id is null then return; end if;
  update public.video_processing_jobs set status = 'processing', attempt_count = attempt_count + 1,
    lease_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => greatest(60, least(600, p_lease_seconds))),
    updated_at = now() where id = claimed.id returning * into claimed;
  return next claimed;
end;
$$;

create function public.heartbeat_video_processing(p_job_id uuid, p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.video_processing_jobs set lease_expires_at = now() + interval '180 seconds', updated_at = now()
    where id = p_job_id and lease_token = p_lease_token and status = 'processing' and lease_expires_at > now();
  return found;
end;
$$;

create function public.complete_video_processing(p_job_id uuid, p_lease_token uuid, p_output_path text,
  p_width integer, p_height integer, p_duration double precision, p_size bigint, p_multipart jsonb default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare job public.video_processing_jobs%rowtype; expected text;
begin
  select * into job from public.video_processing_jobs where id = p_job_id for update;
  if job.status = 'completed' and job.lease_token = p_lease_token and job.output_path = p_output_path then return true; end if;
  if job.status is distinct from 'processing' or job.lease_token is distinct from p_lease_token or job.lease_expires_at <= now() then return false; end if;
  expected := format('%s/video-previews/%s/%s/%s/playback.mp4', public.path_profile_id(job.source_path), job.project_id, job.id, p_lease_token);
  if p_multipart is not null then expected := expected || '.portalink-multipart.json'; end if;
  if p_output_path is distinct from expected or p_width <= 0 or p_height <= 0 or p_duration <= 0 or p_duration >= 'Infinity'::float8 or p_size <= 0
    or p_width is null or p_height is null or p_duration is null or p_size is null
    or not exists (select 1 from storage.objects where bucket_id = 'project-media' and name = expected)
    then raise exception 'Invalid video playback output'; end if;
  if p_multipart is not null and (p_multipart ->> 'version' is distinct from '1'
    or (p_multipart ->> 'sizeBytes')::bigint is distinct from p_size
    or (p_multipart ->> 'partBytes')::bigint is distinct from 41943040
    or (p_multipart ->> 'partCount')::bigint is distinct from ceil(p_size::numeric / 41943040)::bigint)
    then raise exception 'Invalid video multipart output'; end if;
  if p_multipart is null then
    if not exists (select 1 from storage.objects where bucket_id = 'project-media' and name = expected
      and (metadata ->> 'size')::bigint = p_size) then raise exception 'Incomplete video output'; end if;
  elsif exists (
    select 1 from generate_series(0, (p_multipart ->> 'partCount')::integer - 1) part
    where not exists (select 1 from storage.objects o where o.bucket_id = 'project-media'
      and o.name = expected || '.parts/' || lpad(part::text, 6, '0')
      and (o.metadata ->> 'size')::bigint = least(41943040::bigint, p_size - part::bigint * 41943040))
  ) then raise exception 'Incomplete video output'; end if;
  update public.project_attachments set kind = 'video', status = 'ready',
    metadata = (coalesce(metadata, '{}'::jsonb) - 'processingError') || jsonb_build_object(
      'widthPixels', p_width, 'heightPixels', p_height, 'durationSeconds', p_duration,
      'playbackVideo', jsonb_build_object('storagePath', expected, 'mimeType', 'video/mp4', 'sizeBytes', p_size, 'multipart', p_multipart))
    where id = job.attachment_id and project_id = job.project_id and storage_path = job.source_path and size_bytes = job.source_size;
  if not found then return false; end if;
  update public.video_processing_jobs set status = 'completed', output_path = expected,
    error_message = null, lease_expires_at = null, updated_at = now() where id = job.id;
  return true;
end;
$$;

create function public.fail_video_processing(p_job_id uuid, p_lease_token uuid, p_message text, p_retryable boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare job public.video_processing_jobs%rowtype; next_status text;
begin
  select * into job from public.video_processing_jobs where id = p_job_id for update;
  if job.status is distinct from 'processing' or job.lease_token is distinct from p_lease_token or job.lease_expires_at <= now() then return false; end if;
  next_status := case when p_retryable and job.attempt_count < job.max_attempts then 'queued' else 'failed' end;
  update public.video_processing_jobs set status = next_status, error_message = left(p_message, 500),
    is_retryable = p_retryable, lease_token = null, lease_expires_at = null,
    available_at = now() + make_interval(secs => 30 * job.attempt_count), updated_at = now() where id = job.id;
  update public.project_attachments set status = case when next_status = 'failed' then 'processing-failed' else 'processing' end
    where id = job.attachment_id and status <> 'ready';
  return true;
end;
$$;

create function public.retry_video_processing(p_attachment_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare job public.video_processing_jobs%rowtype;
begin
  select j.* into job from public.video_processing_jobs j join public.projects p on p.id = j.project_id
    where j.attachment_id = p_attachment_id and public.owns_profile(p.profile_id) for update of j;
  if job.id is null then raise exception 'Video not found or permission denied'; end if;
  if job.status <> 'failed' or not job.is_retryable then raise exception 'Video conversion cannot be retried'; end if;
  update public.video_processing_jobs set status = 'queued', attempt_count = 0, available_at = now(),
    error_message = null, lease_token = null, lease_expires_at = null, updated_at = now() where id = job.id;
  update public.project_attachments set status = 'processing' where id = p_attachment_id and status <> 'ready';
  return jsonb_build_object('objectId', p_attachment_id, 'state', 'processing', 'message', 'Video queued for conversion.', 'isRetryable', true, 'updatedAt', now());
end;
$$;

revoke all on function public.claim_video_processing_job(integer), public.heartbeat_video_processing(uuid, uuid),
  public.complete_video_processing(uuid, uuid, text, integer, integer, double precision, bigint, jsonb),
  public.fail_video_processing(uuid, uuid, text, boolean), public.retry_video_processing(text) from public, anon, authenticated;
grant execute on function public.claim_video_processing_job(integer), public.heartbeat_video_processing(uuid, uuid),
  public.complete_video_processing(uuid, uuid, text, integer, integer, double precision, bigint, jsonb),
  public.fail_video_processing(uuid, uuid, text, boolean) to service_role;
grant execute on function public.retry_video_processing(text) to authenticated;

-- Derived media follows the original's private Storage access rules; no public bucket.
create policy project_media_video_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'project-media' and exists (select 1 from public.video_processing_jobs j
    where j.status = 'completed' and (name = j.output_path or name like j.output_path || '.parts/%'))
);

-- Existing uploads join the same queue. Never delete or overwrite their originals.
insert into public.video_processing_jobs(project_id, attachment_id, source_path, source_size, source_multipart)
select a.project_id, a.id, a.storage_path, a.size_bytes, a.metadata -> 'multipart'
from public.project_attachments a join public.projects p on p.id = a.project_id
where public.is_video_attachment(a.mime_type, a.extension, a.file_name) and a.size_bytes > 0
  and public.path_profile_id(a.storage_path) = p.profile_id
  and exists (select 1 from storage.objects o where o.bucket_id = 'project-media' and o.name = a.storage_path)
on conflict (attachment_id) do nothing;
update public.project_attachments a set kind = 'video', status = 'processing'
from public.video_processing_jobs j where j.attachment_id = a.id and j.status = 'queued'
  and a.status in ('conversion-required', 'preview-unavailable');

create or replace function public.update_project(
  p_project_id uuid,
  p_profile_id uuid,
  p_title text,
  p_summary text,
  p_kept jsonb,
  p_added jsonb,
  p_expected_revision text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, storage
as $$
declare
  item jsonb;
  frame jsonb;
  current_revision text;
  removed_ids text[];
  removed_paths text[];
  object_path text;
begin
  if not public.owns_profile(p_profile_id) then raise exception 'not owner'; end if;
  select revision::text into current_revision from public.projects
  where id = p_project_id and profile_id = p_profile_id for update;
  if current_revision is null then raise exception 'project not found'; end if;
  if p_expected_revision is not null and p_expected_revision <> current_revision then raise exception 'revision conflict'; end if;
  if jsonb_array_length(coalesce(p_kept, '[]'::jsonb)) + jsonb_array_length(coalesce(p_added, '[]'::jsonb)) < 1 then
    raise exception 'invalid media';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_kept, '[]'::jsonb)) k
    where not exists (
      select 1 from public.project_attachments a
      where a.id = k->>'id' and a.project_id = p_project_id
    )
  ) then raise exception 'invalid media'; end if;

  select coalesce(array_agg(id), '{}'), coalesce(array_agg(storage_path), '{}')
  into removed_ids, removed_paths
  from public.project_attachments a
  where a.project_id = p_project_id
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_kept, '[]'::jsonb)) k
      where k->>'id' = a.id
    );

  -- Capture committed playback copies before the attachment/job rows cascade.
  select removed_paths || coalesce(array_agg(output_path), '{}') into removed_paths
  from public.video_processing_jobs where attachment_id = any(removed_ids) and output_path is not null;
  update public.projects set title = trim(p_title), summary = trim(p_summary), revision = gen_random_uuid()
  where id = p_project_id and profile_id = p_profile_id;

  for item in select value from jsonb_array_elements(coalesce(p_kept, '[]'::jsonb))
  loop
    frame := null;
    if item ? 'coverFrame' then
      frame := item->'coverFrame';
      if jsonb_typeof(frame) is distinct from 'object' then raise exception 'invalid cover frame'; end if;
      if exists (select 1 from unnest(array['x','y','zoom']) key where jsonb_typeof(frame->key) is distinct from 'number') then raise exception 'invalid cover frame'; end if;
      if (frame->>'x')::numeric not between 0 and 1 or (frame->>'y')::numeric not between 0 and 1 or (frame->>'zoom')::numeric not between 1 and 3 then raise exception 'invalid cover frame'; end if;
      if frame ? 'aspectRatio' then
        if jsonb_typeof(frame->'aspectRatio') is distinct from 'number' then raise exception 'invalid cover ratio'; end if;
        if (frame->>'aspectRatio')::numeric not between 1.0/4096 and 4096 then raise exception 'invalid cover ratio'; end if;
      end if;
      if frame ? 'crop' then
        if jsonb_typeof(frame->'crop') is distinct from 'object' then raise exception 'invalid cover crop'; end if;
        if exists (select 1 from unnest(array['x','y','width','height','zoom']) key where jsonb_typeof(frame->'crop'->key) is distinct from 'number') then raise exception 'invalid cover crop'; end if;
        if (frame->'crop'->>'x')::numeric < 0 or (frame->'crop'->>'y')::numeric < 0
          or (frame->'crop'->>'width')::numeric <= 0 or (frame->'crop'->>'height')::numeric <= 0
          or (frame->'crop'->>'x')::numeric + (frame->'crop'->>'width')::numeric > 1.0000001
          or (frame->'crop'->>'y')::numeric + (frame->'crop'->>'height')::numeric > 1.0000001
          or (frame->'crop'->>'zoom')::numeric <> (frame->>'zoom')::numeric
        then raise exception 'invalid cover crop'; end if;
        frame := jsonb_set(frame, '{crop}', (select jsonb_object_agg(key,value) from jsonb_each(frame->'crop') where key in ('x','y','width','height','zoom')));
      end if;
      frame := (select jsonb_object_agg(key,value) from jsonb_each(frame) where key in ('x','y','zoom','aspectRatio','crop'));
    end if;
    update public.project_attachments set
      display_name = coalesce(nullif(trim(item->>'displayName'), ''), display_name),
      position = coalesce((item->>'order')::integer, position),
      is_cover = coalesce((item->>'isCover')::boolean, false),
      metadata = case when frame is null then metadata else coalesce(metadata, '{}'::jsonb) || jsonb_build_object('coverFrame', frame) end
    where id = item->>'id' and project_id = p_project_id;
  end loop;

  delete from public.project_attachments where id = any(removed_ids);

  for item in select value from jsonb_array_elements(coalesce(p_added, '[]'::jsonb))
  loop
    object_path := item->>'storagePath';
    if public.path_profile_id(object_path) is distinct from p_profile_id
      or not exists (select 1 from storage.objects o where o.bucket_id = 'project-media' and o.name = object_path)
    then raise exception 'invalid media storage reference'; end if;
    insert into public.project_attachments(
      id, project_id, kind, file_name, display_name, extension, mime_type,
      size_bytes, type_label, storage_path, status, is_cover, position, metadata
    ) values (
      item->>'id', p_project_id, item->>'kind', item->>'fileName', item->>'displayName',
      coalesce(item->>'extension', ''), coalesce(item->>'mimeType', 'application/octet-stream'),
      coalesce((item->>'sizeBytes')::bigint, 0), item->>'typeLabel', item->>'storagePath',
      item->>'status', coalesce((item->>'isCover')::boolean, false),
      coalesce((item->>'order')::integer, 0), item->'metadata'
    );
  end loop;

  return jsonb_build_object(
    'removedAttachmentIds', to_jsonb(removed_ids),
    'removedStoragePaths', to_jsonb(removed_paths)
  );
end;
$$;

notify pgrst, 'reload schema';
commit;
