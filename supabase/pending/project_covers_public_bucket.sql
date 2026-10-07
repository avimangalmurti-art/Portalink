-- PREPARED ONLY. Requires cover_thumbnail_schema.sql. Separate approval gate:
-- making a bucket public exposes known URLs without SELECT RLS. Cached bytes
-- cannot be recalled. Upload immutable paths with cacheControl:'31536000' and
-- upsert:false; SQL does not configure object HTTP cache headers.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-covers','project-covers',true,5242880,array['image/webp'])
on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from storage.buckets where id='project-covers' and public=true and file_size_limit=5242880 and allowed_mime_types=array['image/webp']::text[]) then
    raise exception 'Existing project-covers bucket differs; review it separately instead of silently changing exposure.';
  end if;
end $$;

create or replace function public.project_cover_write_allowed(object_name text)
returns boolean language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare owner_id uuid; hidden_project boolean; hidden_category boolean; private_profile boolean;
begin
  if object_name is null or object_name !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/[a-f0-9]{64}/(200|400|800|social)\.webp$' then return false; end if;
  select u.account_id,p.is_hidden,c.is_hidden,u.is_private into owner_id,hidden_project,hidden_category,private_profile
  from public.projects p join public.profiles u on u.id=p.profile_id
  join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
  where p.id=public.storage_path_uuid(object_name,2) and p.profile_id=public.storage_path_uuid(object_name,1)
  for share of u,c,p;
  return coalesce(found and not hidden_project and not hidden_category and not private_profile
    and (current_user='service_role' or owner_id=(select auth.uid())),false);
end;
$$;
revoke all on function public.project_cover_write_allowed(text) from public,anon;
grant execute on function public.project_cover_write_allowed(text) to authenticated,service_role;

-- Also runs for service_role (which bypasses RLS), so trusted backfills cannot
-- race a hide/delete between their read and the Storage metadata insert.
create or replace function public.guard_project_cover_object_write()
returns trigger language plpgsql volatile security invoker set search_path=pg_catalog as $$
begin
  if tg_op='UPDATE' and old.bucket_id='project-covers' and (new.bucket_id is distinct from old.bucket_id or new.name is distinct from old.name) then
    raise exception 'Public cover object paths are immutable.' using errcode='23514';
  end if;
  if new.bucket_id='project-covers' and not public.project_cover_write_allowed(new.name) then
    raise exception 'Public cover upload requires an owned public project and category.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_project_cover_object_write() from public,anon,authenticated,service_role;
drop trigger if exists project_covers_guard_object_write on storage.objects;
create trigger project_covers_guard_object_write before insert or update on storage.objects for each row execute function public.guard_project_cover_object_write();

drop policy if exists project_covers_owner_insert on storage.objects;
create policy project_covers_owner_insert on storage.objects for insert to authenticated
with check(bucket_id='project-covers' and public.project_cover_write_allowed(name));
-- No UPDATE policy: browser uploads must use immutable new hashes, never upsert.
drop policy if exists project_covers_read on storage.objects;
create policy project_covers_read on storage.objects for select to anon,authenticated
using(bucket_id='project-covers' and (public.owns_profile(public.storage_path_uuid(name,1)) or exists(
  select 1 from public.projects p join public.profiles u on u.id=p.profile_id
  join public.portfolio_categories c on c.id=p.category_id and c.profile_id=p.profile_id
  where p.id=public.storage_path_uuid(storage.objects.name,2) and p.profile_id=public.storage_path_uuid(storage.objects.name,1)
    and not p.is_hidden and not c.is_hidden and not u.is_private
)));
drop policy if exists project_covers_owner_delete on storage.objects;
create policy project_covers_owner_delete on storage.objects for delete to authenticated
using(bucket_id='project-covers' and public.owns_profile(public.storage_path_uuid(name,1)));
commit;
