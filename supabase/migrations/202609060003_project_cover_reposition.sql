-- Extend the existing atomic project save with presentation-only cover framing.
-- Ownership, revision checks, file references, and cleanup behavior are unchanged.
begin;
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
