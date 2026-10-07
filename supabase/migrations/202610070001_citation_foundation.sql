-- Rollout: apply 202610070001, apply 202610070002, then deploy the app.
-- Never publish a dependent app build before BOTH migrations are applied.
-- PENDING REVIEW ONLY. Do not apply through db push.
-- Revised proposal: isolated PGlite regression checks pass; not applied.
-- Full-size media keeps existing project-media signed reads (no new policy).
-- Existing PDF SELECT policy: 202609280001_performance_read_paths.sql.
-- Live anonymous full-page fetch remains unverified: no document sample returned.
-- No Storage policies/objects, D1 data, or processing worker changes.
begin;

create function public.attachment_page_count(metadata jsonb) returns integer
language sql immutable parallel safe set search_path=pg_catalog as $$
 select case when metadata->>'pageCount' ~ '^[0-9]{1,9}$'
   then least((metadata->>'pageCount')::integer,5000) else 0 end;
$$;
revoke all on function public.attachment_page_count(jsonb) from public;
grant execute on function public.attachment_page_count(jsonb) to anon,authenticated;

-- Preserve legacy public/private rules. Public + opt-in = citable.
-- Existing hidden/private work is NOT made public by this migration.
alter table public.projects
  add column citation_permitted boolean not null default false,
  add column made_on date;
-- The inspected projects schema has published_at, NOT created_at.
-- Use created_at if present in the actual target schema; otherwise published_at.
do $$ begin
  if exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='projects' and column_name='created_at') then
    execute 'update public.projects set made_on = (created_at at time zone ''UTC'')::date';
  else
    update public.projects set made_on = (published_at at time zone 'UTC')::date;
  end if;
end $$;
alter table public.projects alter column made_on set not null;
alter table public.projects add constraint projects_made_on_range
 check (made_on between date '1900-01-01' and current_date + 1);
alter table public.projects add constraint projects_citation_public_only
  check (not citation_permitted or not is_hidden);

create function public.default_project_made_on() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.made_on is null then
    new.made_on := coalesce(nullif(to_jsonb(new)->>'created_at','')::timestamptz,
      new.published_at, now()) at time zone 'UTC';
  end if;
  return new;
end $$;
create trigger projects_default_made_on before insert on public.projects
for each row execute function public.default_project_made_on();
create index projects_journey_made_on_idx on public.projects(profile_id,made_on desc,id);

-- Attachments already have stable TEXT primary keys; reuse those for images.
-- PDF pages lack rows/UUIDs. Persist UUID per attachment + source page number.
-- Display order is NOT identity. Do not delete/recreate rows during reorder.
create table public.project_pages (
  id uuid primary key default gen_random_uuid(),
  attachment_id text not null references public.project_attachments(id) on delete cascade,
  source_page_number integer not null check (source_page_number > 0),
  unique (attachment_id,source_page_number)
);
alter table public.project_pages enable row level security;

-- Only this narrow helper is allowed to bypass parent RLS. It never uses the
-- owner's/follower's access to widen the signed-out citation audience.
create function public.is_project_citable(p_project_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.projects p
    join public.profiles creator on creator.id=p.profile_id
    join public.portfolio_categories portal on portal.id=p.category_id
    where p.id=p_project_id and p.citation_permitted and not p.is_hidden
      and not creator.is_private and not portal.is_hidden);
$$;
revoke all on function public.is_project_citable(uuid) from public;
grant execute on function public.is_project_citable(uuid) to anon,authenticated;

-- Table is the strictly citable path; ordinary view-only resolution must use a
-- separate, narrow public resolver (to be implemented after ID findings review).
create policy project_pages_citable_read on public.project_pages
for select to anon,authenticated using (exists (
  select 1 from public.project_attachments a where a.id=attachment_id
    and public.is_project_citable(a.project_id)
));
revoke all on public.project_pages from anon,authenticated;
grant select on public.project_pages to anon,authenticated;
revoke insert,update,delete on public.project_pages from anon,authenticated;

-- Security-invoker image path retains attachment RLS AND adds explicit opt-in.
create view public.citable_images with (security_invoker=true) as
  select a.id as citation_id,a.project_id,a.position,a.storage_path,a.metadata
  from public.project_attachments a
  where a.kind='image' and public.is_project_citable(a.project_id);
grant select on public.citable_images to anon,authenticated;

-- Database-only provisioning works with existing PDF metadata and page counts;
-- no Storage mutation or worker rollout. ON CONFLICT retains assigned UUIDs.
create function public.sync_project_page_ids() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.kind='document' then
    insert into public.project_pages(attachment_id,source_page_number)
      select new.id,n from generate_series(1,
        public.attachment_page_count(new.metadata)) n
      on conflict (attachment_id,source_page_number) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.sync_project_page_ids() from public,anon,authenticated;
create trigger attachments_sync_page_ids after insert or update of metadata
on public.project_attachments for each row execute function public.sync_project_page_ids();
insert into public.project_pages(attachment_id,source_page_number)
select a.id,n from public.project_attachments a cross join lateral
  generate_series(1,public.attachment_page_count(a.metadata)) n
where a.kind='document' on conflict (attachment_id,source_page_number) do nothing;

-- Identity keys are immutable; metadata, order, title and portal remain editable.
create function public.guard_attachment_identity() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.id is distinct from old.id then raise exception 'attachment identity is immutable'; end if;
  return new;
end $$;
create trigger attachments_identity_immutable before update of id
on public.project_attachments for each row execute function public.guard_attachment_identity();

-- Narrow public resolver: identical absence for private and unknown targets.
create function public.resolve_citation_item(p_item_id text, p_require_citable boolean default false)
returns jsonb language sql stable security definer set search_path=public as $$
  with target as (
    select a.id,a.project_id,a.kind,a.position,a.storage_path,a.metadata,null::integer as page_number
      from public.project_attachments a where a.id=p_item_id and a.kind='image'
    union all
    select a.id,a.project_id,a.kind,a.position,a.storage_path,a.metadata,page.source_page_number
      from public.project_pages page join public.project_attachments a on a.id=page.attachment_id
      where page.id::text=p_item_id and a.kind='document'
        and page.source_page_number<=public.attachment_page_count(a.metadata)
  )
  select jsonb_build_object('id',p_item_id,'attachmentId',t.id,'projectId',p.id,
    'creatorId',creator.id,'creator',creator.name,'projectTitle',p.title,
    'madeOn',p.made_on,'citable',p.citation_permitted,
    'kind',case when t.kind='image' then 'image' else 'page' end,
    'number',coalesce(t.page_number,(select count(*) from public.project_attachments other
      where other.project_id=p.id and other.kind='image' and (other.position,other.id)<=(t.position,t.id))),
    'storagePath',case when t.page_number is null then t.storage_path else
      (select page->>'storagePath' from jsonb_array_elements(case when jsonb_typeof(t.metadata->'renderedPages')='array' then t.metadata->'renderedPages' else '[]'::jsonb end) page
        where page->>'withinDocumentIndex'=t.page_number::text limit 1) end)
  from target t join public.projects p on p.id=t.project_id
    join public.profiles creator on creator.id=p.profile_id
    join public.portfolio_categories portal on portal.id=p.category_id
  where not p.is_hidden and not creator.is_private and not portal.is_hidden
    and (not p_require_citable or p.citation_permitted);
$$;
revoke all on function public.resolve_citation_item(text,boolean) from public;
grant execute on function public.resolve_citation_item(text,boolean) to anon,authenticated;
create function public.resolve_public_page_id(p_attachment_id text,p_page_number integer)
returns text language sql stable security definer set search_path=public as $$
 select page.id::text from public.project_pages page
 join public.project_attachments a on a.id=page.attachment_id
 join public.projects p on p.id=a.project_id
 join public.profiles creator on creator.id=p.profile_id
 join public.portfolio_categories portal on portal.id=p.category_id
 where a.id=p_attachment_id and page.source_page_number=p_page_number
   and a.kind='document' and p_page_number<=public.attachment_page_count(a.metadata)
   and not p.is_hidden and not creator.is_private and not portal.is_hidden;
$$;
revoke all on function public.resolve_public_page_id(text,integer) from public;
grant execute on function public.resolve_public_page_id(text,integer) to anon,authenticated;
create function public.update_project_citation_fields(
 p_project_id uuid,p_profile_id uuid,p_title text,p_summary text,p_kept jsonb,p_added jsonb,
 p_expected_revision text default null,p_made_on date default null,p_access_level text default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_access_level is not null and p_access_level not in ('private','public','citable') then
  raise exception 'invalid access';
 end if;
 result:=public.update_project(p_project_id,p_profile_id,p_title,p_summary,p_kept,p_added,p_expected_revision);
 update public.projects set made_on=coalesce(p_made_on,made_on),
  is_hidden=case when p_access_level is null then is_hidden else p_access_level='private' end,
  citation_permitted=case when p_access_level is null then citation_permitted else p_access_level='citable' end
 where id=p_project_id and profile_id=p_profile_id and public.owns_profile(profile_id);
 return result;
end $$;
revoke all on function public.update_project_citation_fields(uuid,uuid,text,text,jsonb,jsonb,text,date,text) from public;
grant execute on function public.update_project_citation_fields(uuid,uuid,text,text,jsonb,jsonb,text,date,text) to authenticated;
create function public.clear_hidden_citation_permission() returns trigger
language plpgsql set search_path=public as $$
begin
 if new.is_hidden then new.citation_permitted:=false; end if;
 return new;
end $$;
create trigger projects_clear_hidden_citation_permission before update of is_hidden on public.projects
for each row execute function public.clear_hidden_citation_permission();
commit;
