-- PREPARED ONLY. Review/apply separately from public bucket and bundle RPC.
-- Existing project-media stays PRIVATE. No existing data, bucket or RLS is replaced.
begin;

alter table public.projects add column if not exists cover_thumbnail jsonb;

create or replace function public.project_cover_manifest_valid(manifest jsonb, profile_id uuid, project_id uuid)
returns boolean language plpgsql immutable security invoker set search_path = pg_catalog as $$
declare variant jsonb; sizes integer[] := '{}'; size_value integer; width_value integer; height_value integer; prefix text; hash_value text;
begin
  if manifest is null then return true; end if;
  if jsonb_typeof(manifest) is distinct from 'object' or manifest->'version' is distinct from '1'::jsonb
    or manifest->'frameBaked' is distinct from 'true'::jsonb
    or jsonb_typeof(manifest->'bucket') is distinct from 'string'
    or manifest->>'bucket' not in ('project-covers','project-media')
    or jsonb_typeof(manifest->'sourceAttachmentId') is distinct from 'string'
    or length(manifest->>'sourceAttachmentId') not between 1 and 2048
    or jsonb_typeof(manifest->'sourceKey') is distinct from 'string'
    or manifest->>'sourceKey' !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(manifest->'variants') is distinct from 'array'
    or jsonb_array_length(manifest->'variants') <> 3 then return false; end if;
  if exists(select 1 from jsonb_object_keys(manifest) k where k not in ('version','bucket','sourceAttachmentId','sourceKey','frameBaked','variants')) then return false; end if;
  prefix := profile_id::text || '/' || project_id::text || '/';
  for variant in select value from jsonb_array_elements(manifest->'variants') loop
    if jsonb_typeof(variant) is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(variant) k where k not in ('size','path','width','height'))
      or variant->>'size' not in ('200','400','800')
      or jsonb_typeof(variant->'size') is distinct from 'number'
      or jsonb_typeof(variant->'width') is distinct from 'number'
      or jsonb_typeof(variant->'height') is distinct from 'number'
      or (variant->>'width') !~ '^[1-9][0-9]{0,2}$'
      or (variant->>'height') !~ '^[1-9][0-9]{0,2}$'
      or jsonb_typeof(variant->'path') is distinct from 'string' then return false; end if;
    size_value := (variant->>'size')::integer;
    width_value := (variant->>'width')::integer; height_value := (variant->>'height')::integer;
    if size_value = any(sizes) or greatest(width_value,height_value) <> size_value then return false; end if;
    sizes := array_append(sizes,size_value);
    if left(variant->>'path',length(prefix)) <> prefix
      or substring(variant->>'path' from length(prefix)+1) !~ '^[a-f0-9]{64}/(200|400|800)\.webp$'
      or split_part(variant->>'path','/',4) <> size_value::text || '.webp' then return false; end if;
    if hash_value is null then hash_value := split_part(variant->>'path','/',3);
    elsif hash_value <> split_part(variant->>'path','/',3) then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;
$$;
revoke all on function public.project_cover_manifest_valid(jsonb,uuid,uuid) from public;
grant execute on function public.project_cover_manifest_valid(jsonb,uuid,uuid) to anon,authenticated,service_role;
alter table public.projects drop constraint if exists projects_cover_thumbnail_valid;
alter table public.projects add constraint projects_cover_thumbnail_valid
  check (public.project_cover_manifest_valid(cover_thumbnail,profile_id,id));

-- A path must be attached to the currently readable project. Public share reads
-- never infer access merely from the first folder or from an old signed URL.
drop policy if exists project_media_cover_thumbnail_read on storage.objects;
create policy project_media_cover_thumbnail_read on storage.objects for select to anon,authenticated
using (bucket_id = 'project-media' and exists (
  select 1 from public.projects p
  join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
  where p.id=public.storage_path_uuid(storage.objects.name,2)
    and p.profile_id=public.storage_path_uuid(storage.objects.name,1)
    and not p.is_hidden and not c.is_hidden and public.can_view_profile(p.profile_id)
    and p.cover_thumbnail->>'bucket'='project-media'
    and p.cover_thumbnail->'variants' @> jsonb_build_array(jsonb_build_object('path',storage.objects.name))
));

create or replace function public.set_project_cover_thumbnail(p_project_id uuid,p_expected_revision text,p_manifest jsonb)
returns uuid language plpgsql volatile security invoker set search_path = pg_catalog as $$
declare work record; variant jsonb; next_revision uuid;
begin
  -- Parent/project locks serialize persistence with visibility changes. The
  -- Storage insertion guard in the separately reviewed public-bucket SQL uses
  -- the same rows. Deadlocks abort safely and callers retry from fresh state.
  select p.*,u.account_id as owner_id,u.is_private as private_profile,c.is_hidden as hidden_category into work
  from public.projects p join public.profiles u on u.id=p.profile_id
  join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
  where p.id=p_project_id for update of p for share of u,c;
  if work.id is null or (current_user <> 'service_role' and work.owner_id is distinct from (select auth.uid())) then
    raise exception 'not owner' using errcode='42501';
  end if;
  if p_expected_revision is null or work.revision::text <> p_expected_revision then raise exception 'revision conflict' using errcode='40001'; end if;
  if p_manifest is not null then
    if work.is_hidden or work.hidden_category or work.private_profile then raise exception 'cover thumbnails require public content' using errcode='42501'; end if;
    if not public.project_cover_manifest_valid(p_manifest,work.profile_id,work.id) then raise exception 'invalid cover thumbnail manifest' using errcode='22023'; end if;
    if not exists(select 1 from public.project_attachments a where a.id=p_manifest->>'sourceAttachmentId' and a.project_id=work.id) then
      raise exception 'cover source does not belong to project' using errcode='22023';
    end if;
    for variant in select value from jsonb_array_elements(p_manifest->'variants') loop
      if not exists(select 1 from storage.objects o where o.bucket_id=p_manifest->>'bucket' and o.name=variant->>'path') then
        raise exception 'cover thumbnail object is missing' using errcode='22023';
      end if;
    end loop;
  end if;
  next_revision := gen_random_uuid();
  update public.projects set cover_thumbnail=p_manifest,revision=next_revision where id=work.id;
  return next_revision;
end;
$$;
revoke all on function public.set_project_cover_thumbnail(uuid,text,jsonb) from public,anon;
grant execute on function public.set_project_cover_thumbnail(uuid,text,jsonb) to authenticated,service_role;

-- Preserve a baked cover only while its selection and framing remain current.
-- Processing status/renderedPages/playback metadata updates do not invalidate it.
create or replace function public.invalidate_changed_project_cover()
returns trigger language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare old_row jsonb; new_row jsonb; work record; before_id text; after_id text;
  before_image text; after_image text; changed_source boolean;
begin
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;
  if tg_op='UPDATE' and old.id=new.id and old.project_id=new.project_id
    and old.is_cover=new.is_cover and old.position=new.position and old.kind=new.kind
    and old.storage_path=new.storage_path
    and old.metadata->'coverPageNumber' is not distinct from new.metadata->'coverPageNumber'
    and old.metadata->'coverFrame' is not distinct from new.metadata->'coverFrame' then return new; end if;
  for work in select p.id,p.cover_thumbnail from public.projects p
    where p.id in ((old_row->>'project_id')::uuid,(new_row->>'project_id')::uuid)
      and p.cover_thumbnail is not null for update loop
    -- Reconstruct the pre-change ordering from OLD; the current rows are AFTER.
    with previous as (
      select a.id,a.is_cover,a.kind,a.position from public.project_attachments a
      where a.project_id=work.id and a.id is distinct from new_row->>'id'
      union all select old_row->>'id',(old_row->>'is_cover')::boolean,old_row->>'kind',(old_row->>'position')::integer
      where (old_row->>'project_id')::uuid=work.id
    ) select (select id from previous order by is_cover desc,(kind='image') desc,position,id limit 1),
      (select id from previous where kind='image' order by position,id limit 1) into before_id,before_image;
    select (select a.id from public.project_attachments a where a.project_id=work.id
        order by a.is_cover desc,(a.kind='image') desc,a.position,a.id limit 1),
      (select a.id from public.project_attachments a where a.project_id=work.id and a.kind='image' order by a.position,a.id limit 1)
      into after_id,after_image;
    changed_source := old_row->>'id'=work.cover_thumbnail->>'sourceAttachmentId' and (
      old_row->>'id' is distinct from new_row->>'id' or old_row->>'project_id' is distinct from new_row->>'project_id'
      or old_row->>'storage_path' is distinct from new_row->>'storage_path' or old_row->>'kind' is distinct from new_row->>'kind'
      or old_row->'metadata'->'coverPageNumber' is distinct from new_row->'metadata'->'coverPageNumber'
      or old_row->'metadata'->'coverFrame' is distinct from new_row->'metadata'->'coverFrame');
    if changed_source or before_id is distinct from after_id
      or (work.cover_thumbnail->>'sourceAttachmentId' is distinct from after_id and before_image is distinct from after_image)
      or not exists(select 1 from public.project_attachments a where a.project_id=work.id and a.id=work.cover_thumbnail->>'sourceAttachmentId') then
      update public.projects set cover_thumbnail=null,revision=gen_random_uuid() where id=work.id;
    end if;
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function public.invalidate_changed_project_cover() from public,anon,authenticated,service_role;
drop trigger if exists attachments_invalidate_changed_cover on public.project_attachments;
create trigger attachments_invalidate_changed_cover after insert or update or delete on public.project_attachments
for each row execute function public.invalidate_changed_project_cover();

-- Public URLs bypass Storage SELECT RLS. Reject hiding, deleting, changing an
-- owner, or moving into a hidden category until EVERY public hash version under
-- the affected project prefixes has been removed through the Storage API.
-- The definer sees all object rows; it never returns their contents to callers.
create or replace function public.guard_public_project_cover_privacy()
returns trigger language plpgsql volatile security definer set search_path = pg_catalog as $$
declare needs_cleanup boolean := false; has_objects boolean := false;
begin
  if tg_table_name='profiles' then
    if tg_op='DELETE' then needs_cleanup := true;
    else needs_cleanup := (not old.is_private and new.is_private) or old.id is distinct from new.id or old.account_id is distinct from new.account_id; end if;
    if needs_cleanup then select exists(select 1 from storage.objects o where o.bucket_id='project-covers' and split_part(o.name,'/',1)=old.id::text) into has_objects; end if;
  elsif tg_table_name='portfolio_categories' then
    if tg_op='DELETE' then needs_cleanup := true;
    else needs_cleanup := (not old.is_hidden and new.is_hidden) or old.profile_id is distinct from new.profile_id or old.id is distinct from new.id; end if;
    if needs_cleanup then select exists(select 1 from storage.objects o join public.projects p on split_part(o.name,'/',2)=p.id::text where o.bucket_id='project-covers' and p.category_id=old.id) into has_objects; end if;
  elsif tg_table_name='projects' then
    if tg_op='DELETE' then needs_cleanup := true;
    else
      needs_cleanup := (not old.is_hidden and new.is_hidden) or old.profile_id is distinct from new.profile_id or old.id is distinct from new.id;
      if old.category_id is distinct from new.category_id then
        needs_cleanup := needs_cleanup or not exists(select 1 from public.portfolio_categories c join public.profiles u on u.id=c.profile_id
          where c.id=new.category_id and c.profile_id=new.profile_id and not c.is_hidden and not u.is_private);
      end if;
    end if;
    if needs_cleanup then select exists(select 1 from storage.objects o where o.bucket_id='project-covers' and split_part(o.name,'/',2)=old.id::text) into has_objects; end if;
  end if;
  if has_objects then raise exception 'Remove public cover thumbnails before changing visibility or deleting this content.' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function public.guard_public_project_cover_privacy() from public,anon,authenticated,service_role;
drop trigger if exists profiles_guard_public_covers on public.profiles;
create trigger profiles_guard_public_covers before update of is_private,id,account_id or delete on public.profiles for each row execute function public.guard_public_project_cover_privacy();
drop trigger if exists categories_guard_public_covers on public.portfolio_categories;
create trigger categories_guard_public_covers before update of is_hidden,profile_id,id or delete on public.portfolio_categories for each row execute function public.guard_public_project_cover_privacy();
drop trigger if exists projects_guard_public_covers on public.projects;
create trigger projects_guard_public_covers before update of is_hidden,profile_id,category_id,id or delete on public.projects for each row execute function public.guard_public_project_cover_privacy();

commit;
