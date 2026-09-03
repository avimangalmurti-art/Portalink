-- Descriptions are long-form text on every write path, not 220-char captions.
-- The earlier table migration covered direct edits but not the publish RPC.
alter table public.projects drop constraint if exists projects_summary_check;

create or replace function public.publish_project(
  p_draft_id uuid,
  p_profile_id uuid,
  p_category_id uuid,
  p_title text,
  p_summary text,
  p_attachments jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, storage
as $$
declare
  new_project_id uuid;
  item jsonb;
  next_position integer;
  object_path text;
begin
  if not public.owns_profile(p_profile_id) then raise exception 'not owner'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'invalid metadata'; end if;
  if jsonb_typeof(p_attachments) <> 'array' or jsonb_array_length(p_attachments) < 1 or jsonb_array_length(p_attachments) > 105 then raise exception 'invalid media'; end if;
  if not exists (select 1 from public.project_drafts d where d.id = p_draft_id and d.profile_id = p_profile_id and d.category_id = p_category_id) then raise exception 'draft not found'; end if;
  if not exists (select 1 from public.portfolio_categories c where c.id = p_category_id and c.profile_id = p_profile_id) then raise exception 'category not found'; end if;

  for item in select value from jsonb_array_elements(p_attachments)
  loop
    object_path := item->>'storagePath';
    if public.path_profile_id(object_path) is distinct from p_profile_id
      or not exists (select 1 from storage.objects o where o.bucket_id = 'project-media' and o.name = object_path)
    then raise exception 'invalid media storage reference'; end if;
  end loop;

  select coalesce(max(position), -1) + 1 into next_position from public.projects where category_id = p_category_id;
  insert into public.projects(profile_id, category_id, title, summary, position)
  values (p_profile_id, p_category_id, trim(p_title), trim(coalesce(p_summary, '')), next_position)
  returning id into new_project_id;

  for item in select value from jsonb_array_elements(p_attachments)
  loop
    insert into public.project_attachments(id, project_id, kind, file_name, display_name, extension, mime_type, size_bytes, type_label, storage_path, status, is_cover, position, metadata)
    values (item->>'id', new_project_id, item->>'kind', item->>'fileName', item->>'displayName', coalesce(item->>'extension', ''), coalesce(item->>'mimeType', 'application/octet-stream'), coalesce((item->>'sizeBytes')::bigint, 0), item->>'typeLabel', item->>'storagePath', item->>'status', coalesce((item->>'isCover')::boolean, false), coalesce((item->>'order')::integer, 0), item->'metadata');
  end loop;
  delete from public.project_drafts where id = p_draft_id;
  return new_project_id;
end;
$$;

-- Ownership, storage validation, media limits, access and newest-first ordering
-- are unchanged. The extended publishing overload delegates to this function.
revoke all on function public.publish_project(uuid,uuid,uuid,text,text,jsonb) from public;
grant execute on function public.publish_project(uuid,uuid,uuid,text,text,jsonb) to authenticated;
