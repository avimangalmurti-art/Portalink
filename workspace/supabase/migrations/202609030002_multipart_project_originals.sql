-- One logical original may consist of private <=40 MiB objects and a manifest.
-- No plan, global size setting, spend cap, or bucket exposure is changed.
begin;

create or replace function public.validate_multipart_attachment()
returns trigger language plpgsql set search_path = public, storage as $$
declare
  spec jsonb;
  part_count integer;
  matching_parts integer;
begin
  spec := new.metadata -> 'multipart';
  if spec is null then
    if new.storage_path like '%.portalink-multipart.json' then
      raise exception 'Large-file metadata is required';
    end if;
    return new;
  end if;
  if spec ->> 'version' is distinct from '1'
    or spec ->> 'partBytes' is distinct from '41943040'
    or (spec ->> 'sizeBytes')::bigint is distinct from new.size_bytes
    or new.size_bytes <= 0
    or new.storage_path not like '%.portalink-multipart.json' then
    raise exception 'Invalid large-file metadata';
  end if;
  part_count := (spec ->> 'partCount')::integer;
  if part_count is null or part_count < 1 or part_count > 999999
    or part_count::bigint <> (new.size_bytes + 41943039) / 41943040 then
    raise exception 'Invalid large-file part count';
  end if;
  -- A project is not publishable until every byte has reached Storage.
  select count(*) into matching_parts
  from generate_series(0, part_count - 1) as part(index)
  join storage.objects o on o.bucket_id = 'project-media'
    and o.name = new.storage_path || '.parts/' || lpad(part.index::text, 6, '0')
    and (o.metadata ->> 'size')::bigint = least(41943040::bigint, new.size_bytes - part.index::bigint * 41943040);
  if matching_parts <> part_count then raise exception 'The large-file upload is incomplete. Please upload it again.'; end if;
  return new;
end;
$$;

create trigger project_attachments_validate_multipart
before insert or update of storage_path, size_bytes, metadata on public.project_attachments
for each row execute function public.validate_multipart_attachment();

-- This is an additional storage representation, not an additional audience.
-- The attachment subquery runs with its existing row-level visibility policy.
create policy project_media_multipart_read on storage.objects for select to anon, authenticated
using (
  bucket_id = 'project-media'
  and exists (
    select 1 from public.project_attachments a
    where a.storage_path = regexp_replace(storage.objects.name, '\.parts/[0-9]{6}$', '')
      and a.metadata -> 'multipart' ->> 'version' = '1'
      and substring(storage.objects.name from '\.parts/([0-9]{6})$')::integer
        < (a.metadata -> 'multipart' ->> 'partCount')::integer
  )
);

-- Existing workers expect a PDF object, not a JSON manifest. Large originals
-- render directly through the range-capable browser reader; do not enqueue
-- them for a legacy worker that would incorrectly report a corrupt PDF.
create or replace function public.enqueue_pdf_attachment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_pdf_attachment(new.mime_type, new.extension, new.file_name)
    and new.metadata -> 'multipart' is null then
    insert into public.pdf_processing_jobs(post_id, attachment_id, source_bucket, source_path, source_position, status)
    values (new.project_id, new.id, 'project-media', new.storage_path, new.position, 'queued')
    on conflict (attachment_id) do nothing;
    perform public.refresh_pdf_post_status(new.project_id);
  end if;
  return new;
end;
$$;

commit;
